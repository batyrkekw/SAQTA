"""Transactional email over SMTP. Without SMTP_HOST, messages go to the server log (local/dev).

OUTBOX keeps the last messages in memory for tests and local inspection; it never leaves the process.
"""
from collections import deque
from email.message import EmailMessage
import logging
import smtplib

from app.core.config import get_settings

log = logging.getLogger("saqta.mail")
OUTBOX: deque = deque(maxlen=50)


def send_email(to: str, subject: str, text: str) -> bool:
    settings = get_settings()
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = settings.mail_from, to, subject
    message.set_content(text)
    OUTBOX.append({"to": to, "subject": subject, "text": text})
    if not settings.smtp_host:
        # Visible with default logging: without SMTP the log is the only place the message (and any link) exists.
        log.warning("email not sent (SMTP_HOST is empty) to=%s subject=%s\n%s", to, subject, text)
        return False
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            if settings.smtp_starttls:
                server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)
        return True
    except (OSError, smtplib.SMTPException):
        # Email must never break payment or account flows; the operator sees the failure in logs.
        log.exception("email delivery failed to=%s subject=%s", to, subject)
        return False
