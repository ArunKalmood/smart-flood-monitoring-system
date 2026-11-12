"""
Comprehensive unit and integration tests for ml/record_real_run.py.
Tests:
  1. Serial buffering: verifies newest line is read after reset_input_buffer, not stale queued lines.
  2. Label leak: water_level alone is rejected in serial mode, derived only in API mode.
  3. Narrow keys: verifies DIST_KEYS, RAIN_ADC_KEYS, RAIN_DIG_KEYS, and excludes rainfall.
  4. CSV validation: strictly 2-3 fields, rejects boot-style lines and out-of-range distances.
  5. Permission error: dynamic group lookup via grp.getgrgid.
  6. Freshness guard & pre-save validation rules.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
import pytest

from ml.record_real_run import (
    check_api_freshness,
    list_available_ports,
    parse_sensor_payload,
    validate_run,
    SensorReader,
    TYPICAL_DRY_RAIN_ADC,
    TYPICAL_DRY_RAIN_DIGITAL,
)


class TestSensorPayloadParser:
    """Fix 2, 3, 4: Strict payload parsing, label-leak prevention, and range validation."""

    def test_json_full_payload(self):
        line = '{"dist_cm": 10.45, "rain_adc": 3850.0, "rain_digital": "HIGH"}'
        dist, rain_adc, rain_digital = parse_sensor_payload(line)
        assert dist == 10.45
        assert rain_adc == 3850.0
        assert rain_digital == "HIGH"

    def test_water_level_in_serial_mode_is_unparseable(self, capsys):
        # Fix 2: Serial mode must reject water_level alone to prevent label leakage
        line = '{"water_level": 2.3}'
        dist, rain_adc, rain_digital = parse_sensor_payload(line, allow_water_level_derivation=False)
        assert dist is None
        assert rain_adc is None
        assert rain_digital is None

        # Same for key=value
        line_kv = "water_level=2.3"
        dist2, _, _ = parse_sensor_payload(line_kv, allow_water_level_derivation=False)
        assert dist2 is None

    def test_water_level_in_api_mode_derived_with_warning(self, capsys):
        # Fix 2: API mode can derive dist_cm with a visible warning
        line = '{"water_level": 2.3}'
        dist, _, _ = parse_sensor_payload(line, allow_water_level_derivation=True)
        assert dist == 10.00  # 12.3 - 2.3
        captured = capsys.readouterr()
        assert "Derived dist_cm from water_level" in captured.out

    def test_rainfall_in_mm_not_mapped_to_rain_adc(self):
        # Fix 3: rainfall in API is mm, must not be mapped to rain_adc
        line = '{"water_level": 2.3, "rainfall": 150.0}'
        _, rain_adc, _ = parse_sensor_payload(line, allow_water_level_derivation=True)
        assert rain_adc is None

    def test_key_value_narrow_keys(self):
        # Fix 3: Accept narrow keys: dist_cm, distance_cm, distance, rain_adc, rain_digital, rain_dig
        line = "dist_cm=9.85 rain_adc=3200.0 rain_digital=LOW"
        d, r, dig = parse_sensor_payload(line)
        assert d == 9.85
        assert r == 3200.0
        assert dig == "LOW"

        # Alternative supported alias distance + rain_dig
        line2 = "distance: 8.20 rain_adc: 4095 rain_dig: HIGH"
        d2, r2, dig2 = parse_sensor_payload(line2)
        assert d2 == 8.20
        assert r2 == 4095.0
        assert dig2 == "HIGH"

    def test_csv_valid_two_and_three_fields(self):
        # Fix 4: Strictly 2 or 3 valid fields
        line3 = "11.25, 4050, HIGH"
        d3, r3, dig3 = parse_sensor_payload(line3)
        assert d3 == 11.25
        assert r3 == 4050.0
        assert dig3 == "HIGH"

        line2 = "10.15, 3999"
        d2, r2, dig2 = parse_sensor_payload(line2)
        assert d2 == 10.15
        assert r2 == 3999.0
        assert dig2 is None

    def test_csv_rejects_boot_and_ready_lines(self, capsys):
        # Fix 4: Boot-style lines must be rejected as unparseable
        boot_lines = [
            "Booting 115200",
            "WiFi connected 192.168.1.5",
            "ready",
            "Init sensors ok",
        ]
        for bl in boot_lines:
            d, r, dig = parse_sensor_payload(bl, log_unparseable=True)
            assert d is None
            assert r is None
            assert dig is None

    def test_csv_rejects_malformed_lines(self):
        # Malformed numeric field or invalid digital token
        malformed = [
            "10.5, notanumber, HIGH",
            "10.5, 4000, INVALID_DIGITAL",
            "10.5, 4000, 500, EXTRA_FIELD",
            "single_token",
        ]
        for ml in malformed:
            d, r, dig = parse_sensor_payload(ml, log_unparseable=False)
            assert d is None

    def test_distance_out_of_range_rejected(self, capsys):
        # Fix 4: Distances outside 0 to 400 cm rejected
        out_of_range = [
            "450.0, 4000, HIGH",
            "-5.0, 4000, HIGH",
            '{"dist_cm": 500.0, "rain_adc": 4095}',
            "dist_cm=600.0 rain_adc=4000",
        ]
        for line in out_of_range:
            d, _, _ = parse_sensor_payload(line, log_unparseable=True)
            assert d is None
        captured = capsys.readouterr()
        assert "out of valid range (0 to 400 cm)" in captured.out


class TestFreshnessGuard:
    """Task 2: API freshness guard verifying age and sensor online status."""

    def test_stale_recorded_at_rejected(self):
        stale_time = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
        payload = {
            "sensors": {"total": 2, "online": 1},
            "latest_reading": {"water_level": 4.5, "recorded_at": stale_time},
        }
        is_fresh, reason = check_api_freshness(payload, max_age_s=30.0)
        assert not is_fresh
        assert "exceeds 30.0s threshold" in reason

    def test_offline_sensors_rejected(self):
        recent_time = datetime.now(timezone.utc).isoformat()
        payload = {
            "sensors": {"total": 2, "online": 0},
            "latest_reading": {"water_level": 4.5, "recorded_at": recent_time},
        }
        is_fresh, reason = check_api_freshness(payload, max_age_s=30.0)
        assert not is_fresh
        assert "sensors.online is 0" in reason

    def test_fresh_payload_accepted(self):
        recent_time = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()
        payload = {
            "sensors": {"total": 2, "online": 2},
            "latest_reading": {"water_level": 4.5, "recorded_at": recent_time},
        }
        is_fresh, reason = check_api_freshness(payload, max_age_s=30.0)
        assert is_fresh
        assert reason == "Fresh"


class TestPreSaveValidation:
    """Task 5: Pre-save quality validation rules."""

    def test_all_minus_one_run_rejected(self):
        rows = [
            {"t_s": str(i * 5.0), "dist_cm": "-1.00", "rain_adc": "4095.0", "rain_digital": "HIGH", "true_water_level_cm": "0.00"}
            for i in range(12)
        ]
        is_valid, msg = validate_run(rows)
        assert not is_valid
        assert "100.0% of rows" in msg
        assert "exceeds the 20.0% allowable threshold" in msg

    def test_excessive_missing_data_rejected(self):
        # 3 out of 10 rows are -1 (30% > 20%)
        rows = []
        for i in range(10):
            d = "-1.00" if i < 3 else "10.50"
            rows.append({"t_s": str(i * 5.0), "dist_cm": d, "rain_adc": "4095.0", "rain_digital": "HIGH", "true_water_level_cm": "0.00"})
        is_valid, msg = validate_run(rows)
        assert not is_valid
        assert "30.0% of rows" in msg

    def test_zero_variance_over_one_minute_rejected(self):
        # 15 steps at 5s spacing = 70.0s (> 60s). All dist_cm = 10.00 cm
        rows = [
            {"t_s": str(i * 5.0), "dist_cm": "10.00", "rain_adc": "4095.0", "rain_digital": "HIGH", "true_water_level_cm": "0.00"}
            for i in range(15)
        ]
        is_valid, msg = validate_run(rows, min_variance_duration_s=60.0)
        assert not is_valid
        assert "zero variance (constant at 10.00 cm)" in msg

    def test_valid_dynamic_run_accepted(self):
        # 15 steps with rising water level (distance decreasing from 12.0 to 9.2 cm)
        rows = [
            {"t_s": str(i * 5.0), "dist_cm": f"{12.0 - i * 0.2:.2f}", "rain_adc": "4095.0", "rain_digital": "HIGH", "true_water_level_cm": f"{i * 0.2:.2f}"}
            for i in range(15)
        ]
        is_valid, msg = validate_run(rows)
        assert is_valid
        assert msg == "Validation passed."


class TestSerialPortAndReader:
    """Fix 1 & Fix 5: Serial buffering & dynamic group permission."""

    def test_list_ports_returns_list(self):
        ports = list_available_ports()
        assert isinstance(ports, list)
        for p in ports:
            assert p.startswith("/dev/ttyUSB") or p.startswith("/dev/ttyACM")

    @patch("ml.record_real_run.serial.Serial")
    def test_mock_serial_reader_reads_newest_line_after_flush(self, mock_serial_cls):
        """Fix 1: Verifies reset_input_buffer() is called so the newest reading is read instead of stale queued lines."""
        # Class simulating serial port buffer with stale lines waiting
        class MockSerialWithBuffer:
            def __init__(self):
                self.is_open = True
                # Stale old lines queued during the 5s interval
                self.queue = [
                    b"dist_cm=12.00 rain_adc=4095 rain_digital=HIGH\n",
                    b"dist_cm=11.50 rain_adc=4095 rain_digital=HIGH\n",
                ]
                self.fresh_line = b"dist_cm=8.50 rain_adc=4095 rain_digital=HIGH\n"
                self.reset_called = False

            def reset_input_buffer(self):
                self.reset_called = True
                # Discard stale queue and receive the newest fresh line
                self.queue = [self.fresh_line]

            @property
            def in_waiting(self):
                return len(self.queue) > 0

            def readline(self):
                return self.queue.pop(0) if self.queue else b""

            def close(self):
                self.is_open = False

        mock_instance = MockSerialWithBuffer()
        mock_serial_cls.return_value = mock_instance

        with patch("os.path.exists", return_value=True):
            reader = SensorReader(source_type="serial", serial_port="/dev/ttyUSB0", baud=115200)
            dist, rain_adc, rain_digital = reader.read_latest(timeout_s=1.0)
            reader.close()

            # Confirm reset_input_buffer was invoked
            assert mock_instance.reset_called
            # Confirm the reading came from the fresh line (8.50 cm), NOT the stale line (12.00 cm)
            assert dist == 8.50
            assert rain_adc == 4095.0
            assert rain_digital == "HIGH"

    @patch("ml.record_real_run.serial.Serial")
    @patch("os.stat")
    @patch("grp.getgrgid")
    def test_serial_permission_error_shows_dynamic_group(self, mock_getgrgid, mock_stat, mock_serial_cls):
        """Fix 5: Dynamic group resolution on PermissionError."""
        mock_stat_obj = MagicMock()
        mock_stat_obj.st_gid = 984
        mock_stat.return_value = mock_stat_obj

        mock_grp_obj = MagicMock()
        mock_grp_obj.gr_name = "uucp"
        mock_getgrgid.return_value = mock_grp_obj

        mock_serial_cls.side_effect = PermissionError("[Errno 13] Permission denied: '/dev/ttyUSB0'")

        with patch("os.path.exists", return_value=True):
            with pytest.raises(PermissionError) as exc_info:
                SensorReader(source_type="serial", serial_port="/dev/ttyUSB0")
            msg = str(exc_info.value)
            assert "Add yourself to group 'uucp': sudo usermod -aG uucp $USER" in msg
