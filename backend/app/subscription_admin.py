"""Manual operator activation. Never exposed through the public API."""
import argparse
from datetime import timedelta

from sqlalchemy import select

from app.core.config import get_settings, now_utc
from app.db.session import SessionLocal
from app.models import ApplicationSettings, AuthUser, Subscription


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True, help="Registered owner email")
    parser.add_argument("--plan", required=True, choices=["starter", "pro"])
    parser.add_argument("--days", type=int, default=30)
    args = parser.parse_args()
    if get_settings().workspace_mode != "real" or not 1 <= args.days <= 366:
        parser.error("Activation requires WORKSPACE_MODE=real and --days between 1 and 366")
    with SessionLocal() as db:
        user = db.scalar(select(AuthUser).where(AuthUser.email == args.email.strip().casefold()))
        if user is None:
            parser.error("Registered organization owner not found")
        source = db.scalar(select(ApplicationSettings.workspace_mode).where(ApplicationSettings.bakery_id == user.bakery_id))
        if source != "real":
            parser.error("A demo workspace cannot receive a paid subscription")
        row = db.scalar(select(Subscription).where(Subscription.bakery_id == user.bakery_id))
        if row is None:
            row = Subscription(bakery_id=user.bakery_id)
            db.add(row)
        row.plan, row.status, row.activated_at = args.plan, "active", now_utc()
        row.expires_at = now_utc() + timedelta(days=args.days)
        db.commit()
        print(f"Manually activated {args.plan} for organization {user.bakery_id} until {row.expires_at.isoformat()}. No payment was charged.")


if __name__ == "__main__":
    main()
