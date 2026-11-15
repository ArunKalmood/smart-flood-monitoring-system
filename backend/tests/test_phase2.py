"""
Phase 2 integration tests — /api/lstm/predict and /api/lstm/status
==================================================================

These tests cover the two LSTM API endpoints added in Phase 2 without
touching any existing live-sensor, prediction, or database code paths.

What is verified
----------------
* Unauthenticated requests are rejected (401).
* /api/lstm/status returns the expected shape regardless of model availability.
* /api/lstm/predict returns available=False (not an error) when the buffer is
  empty — the correct state before 60 minutes of live sensor data have
  accumulated.
* The buffer itself (DamLiveBuffer) correctly aggregates same-minute readings
  and correctly transitions to ready after WINDOW_LEN distinct minute buckets.

HTTP client note
----------------
The project's conftest.py TestClient fixture fails on this environment because
starlette 0.36.3 is incompatible with httpx 0.28.1 (TestClient.__init__ no
longer accepts the `app` kwarg). This is a pre-existing project-wide issue.

The HTTP tests here use httpx.AsyncClient + ASGITransport directly, which is
the recommended low-level approach and works with these package versions.

Authentication: a real User row is created in the test DB via the existing
`make_account` conftest fixture so that the JWT lookup succeeds.

The DamLiveBufferUnit tests are pure Python — no HTTP, no DB.
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest
import httpx

# Ensure backend/ is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ---------------------------------------------------------------------------
# Local async client helper (not a fixture — avoids event loop issues)
# ---------------------------------------------------------------------------

def _get(url: str, headers: dict | None = None) -> httpx.Response:
    """Synchronously GET a URL through the FastAPI ASGI app."""
    from main import app as _app

    async def _inner():
        transport = httpx.ASGITransport(app=_app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            return await ac.get(url, headers=headers or {})

    return asyncio.get_event_loop().run_until_complete(_inner())


# ---------------------------------------------------------------------------
# /api/lstm/status — authentication gate
# ---------------------------------------------------------------------------

class TestLSTMStatusAuth:
    def test_unauthenticated_request_returns_401(self):
        r = _get("/api/lstm/status")
        assert r.status_code == 401

    def test_authenticated_request_returns_200(self, make_account):
        _, hdrs = make_account("public_user")
        r = _get("/api/lstm/status", headers=hdrs)
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# /api/lstm/status — response shape
# ---------------------------------------------------------------------------

class TestLSTMStatusShape:
    def test_required_keys_present(self, make_account):
        _, hdrs = make_account("public_user")
        data = _get("/api/lstm/status", headers=hdrs).json()
        required = {
            "model_file_exists",
            "scaler_file_exists",
            "model_ready",
            "minutes_in_buffer",
            "window_required",
            "buffer_ready",
            "training_source",
            "calibration_note",
            "meta",
        }
        for key in required:
            assert key in data, f"Missing key: {key!r}"

    def test_training_source_is_simulated(self, make_account):
        _, hdrs = make_account("public_user")
        data = _get("/api/lstm/status", headers=hdrs).json()
        assert data["training_source"] == "SIMULATED"

    def test_window_required_is_60(self, make_account):
        _, hdrs = make_account("public_user")
        data = _get("/api/lstm/status", headers=hdrs).json()
        assert data["window_required"] == 60

    def test_minutes_in_buffer_is_integer(self, make_account):
        _, hdrs = make_account("public_user")
        data = _get("/api/lstm/status", headers=hdrs).json()
        assert isinstance(data["minutes_in_buffer"], int)
        assert data["minutes_in_buffer"] >= 0

    def test_buffer_ready_matches_minutes(self, make_account):
        _, hdrs = make_account("public_user")
        data = _get("/api/lstm/status", headers=hdrs).json()
        expected = data["minutes_in_buffer"] >= data["window_required"]
        assert data["buffer_ready"] == expected

    def test_meta_is_dict(self, make_account):
        _, hdrs = make_account("public_user")
        data = _get("/api/lstm/status", headers=hdrs).json()
        assert isinstance(data["meta"], dict)


# ---------------------------------------------------------------------------
# /api/lstm/predict — authentication gate
# ---------------------------------------------------------------------------

class TestLSTMPredictAuth:
    def test_unauthenticated_request_returns_401(self):
        r = _get("/api/lstm/predict")
        assert r.status_code == 401

    def test_authenticated_request_returns_200(self, make_account):
        _, hdrs = make_account("public_user")
        r = _get("/api/lstm/predict", headers=hdrs)
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# /api/lstm/predict — unavailable state (empty buffer)
# ---------------------------------------------------------------------------

class TestLSTMPredictUnavailable:
    """
    In the test environment the buffer is empty, so available must be False.
    This is the correct and expected production state before 60 minutes of
    real sensor data have accumulated.
    """

    def setup_method(self):
        """Ensure the buffer is empty before each test in this class."""
        from ml.dam.live_buffer import dam_buffer
        dam_buffer._buckets.clear()

    def test_available_key_present(self, make_account):
        _, hdrs = make_account("public_user")
        data = _get("/api/lstm/predict", headers=hdrs).json()
        assert "available" in data

    def test_available_is_false_when_buffer_empty(self, make_account):
        _, hdrs = make_account("public_user")
        data = _get("/api/lstm/predict", headers=hdrs).json()
        assert data["available"] is False

    def test_reason_key_present_when_unavailable(self, make_account):
        _, hdrs = make_account("public_user")
        data = _get("/api/lstm/predict", headers=hdrs).json()
        assert "reason" in data
        assert isinstance(data["reason"], str)
        assert len(data["reason"]) > 0

    def test_minutes_in_buffer_is_zero_when_empty(self, make_account):
        _, hdrs = make_account("public_user")
        data = _get("/api/lstm/predict", headers=hdrs).json()
        assert data["minutes_in_buffer"] == 0

    def test_training_source_always_present(self, make_account):
        _, hdrs = make_account("public_user")
        data = _get("/api/lstm/predict", headers=hdrs).json()
        assert data.get("training_source") == "SIMULATED"


# ---------------------------------------------------------------------------
# DamLiveBuffer unit — push aggregation and window readiness
# ---------------------------------------------------------------------------

class TestDamLiveBufferUnit:
    """
    Pure unit tests for DamLiveBuffer — no HTTP, no DB.
    These complement the richer tests in ml/dam/test_phase1.py.
    """

    def _fresh_buffer(self):
        from ml.dam.live_buffer import DamLiveBuffer
        return DamLiveBuffer(window_len=60)

    def test_push_single_reading_adds_one_bucket(self):
        buf = self._fresh_buffer()
        buf.push(0.05, 0.0, datetime(2024, 6, 1, 10, 0, 0, tzinfo=timezone.utc))
        assert buf.minutes_available() == 1

    def test_same_minute_readings_aggregate_into_one_bucket(self):
        buf = self._fresh_buffer()
        t = datetime(2024, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
        buf.push(0.04, 0.0, t)
        buf.push(0.06, 1.0, t + timedelta(seconds=30))
        assert buf.minutes_available() == 1

    def test_different_minute_readings_create_separate_buckets(self):
        buf = self._fresh_buffer()
        t = datetime(2024, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
        buf.push(0.04, 0.0, t)
        buf.push(0.06, 0.0, t + timedelta(minutes=1))
        assert buf.minutes_available() == 2

    def test_window_not_ready_below_60_buckets(self):
        buf = self._fresh_buffer()
        t = datetime(2024, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
        for i in range(30):
            buf.push(0.05, 0.0, t + timedelta(minutes=i))
        _, is_ready, n, reason = buf.get_window()
        assert is_ready is False
        assert n == 30
        assert reason is not None

    def test_window_ready_after_60_contiguous_buckets(self):
        buf = self._fresh_buffer()
        t = datetime(2024, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
        for i in range(60):
            buf.push(0.05, 0.0, t + timedelta(minutes=i))
        window, is_ready, n, reason = buf.get_window()
        assert is_ready is True
        assert n == 60
        assert reason is None
        assert window is not None
        assert window.shape == (60, 2)

    def test_rain_max_aggregation(self):
        """rain_detected should take the max across sub-minute readings."""
        buf = self._fresh_buffer()
        t = datetime(2024, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
        buf.push(0.05, 0.0, t)
        buf.push(0.05, 1.0, t + timedelta(seconds=20))
        buf.push(0.05, 0.0, t + timedelta(seconds=40))
        bucket = buf._buckets[0]
        assert bucket["rain_max"] == 1.0

    def test_none_water_level_is_ignored(self):
        buf = self._fresh_buffer()
        t = datetime(2024, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
        buf.push(None, 0.0, t)
        assert buf.minutes_available() == 0

    def test_metres_converted_to_centimetres(self):
        """push() receives metres; buffer stores centimetres (m * 100)."""
        buf = self._fresh_buffer()
        t = datetime(2024, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
        buf.push(0.05, 0.0, t)   # 0.05 m = 5.0 cm
        bucket = buf._buckets[0]
        avg_cm = bucket["wl_sum"] / bucket["wl_count"]
        assert abs(avg_cm - 5.0) < 1e-6

    def test_window_shape_is_60_by_2(self):
        buf = self._fresh_buffer()
        t = datetime(2024, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
        for i in range(60):
            buf.push(0.05, float(i % 2), t + timedelta(minutes=i))
        window, is_ready, _, _ = buf.get_window()
        assert is_ready
        assert window.shape == (60, 2)

    def test_window_suppressed_on_large_gap(self):
        """A gap > MAX_GAP_MINUTES (2) must suppress the window."""
        buf = self._fresh_buffer()
        t = datetime(2024, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
        # Push 30 contiguous minutes, skip 10 minutes, push 30 more
        for i in range(30):
            buf.push(0.05, 0.0, t + timedelta(minutes=i))
        for i in range(40, 70):
            buf.push(0.05, 0.0, t + timedelta(minutes=i))
        _, is_ready, _, reason = buf.get_window()
        assert is_ready is False
        assert reason is not None
        assert "gap" in reason.lower()
