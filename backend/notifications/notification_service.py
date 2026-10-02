"""
Notification service placeholder
Future: email, SMS (Twilio), Firebase push notifications
"""

class NotificationService:
    async def send_email(self, to: str, subject: str, body: str):
        """Future: SMTP email via SMTP_HOST/PORT/USER/PASS in .env"""
        pass

    async def send_sms(self, to: str, message: str):
        """Future: Twilio SMS via TWILIO_SID/TOKEN/FROM in .env"""
        pass

    async def send_push(self, device_token: str, title: str, body: str):
        """Future: Firebase FCM via FCM_SERVER_KEY in .env"""
        pass


notification_service = NotificationService()
