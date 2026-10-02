"""IoT Data Ingestion Service - Ready for real sensor integration"""


class IoTService:
    """
    Future: Connect to MQTT broker, HTTP polling, WebSocket streams
    Supports: ESP32, Arduino, Raspberry Pi, industrial sensors
    """

    async def process_sensor_reading(self, sensor_id: str, data: dict):
        """Process incoming IoT sensor data"""
        # Validate, store, trigger alerts if threshold exceeded
        pass

    async def check_thresholds(self, water_level: float, rainfall: float):
        """Auto-trigger alerts when thresholds exceeded"""
        WATER_LEVEL_WARNING = 5.0
        WATER_LEVEL_DANGER = 8.0
        RAINFALL_WARNING = 50.0
        RAINFALL_DANGER = 100.0

        if water_level >= WATER_LEVEL_DANGER or rainfall >= RAINFALL_DANGER:
            return "danger"
        elif water_level >= WATER_LEVEL_WARNING or rainfall >= RAINFALL_WARNING:
            return "warning"
        return "safe"


iot_service = IoTService()
