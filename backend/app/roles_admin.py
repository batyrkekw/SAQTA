"""Operator-only CLI; never exposed through public HTTP registration."""

import argparse
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models import AuthUser


def main():
    parser = argparse.ArgumentParser(description="Approve a verified SAQTA account role")
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", choices=["consumer", "business", "charity"], required=True)
    args = parser.parse_args()
    with SessionLocal() as db:
        user = db.scalar(select(AuthUser).where(AuthUser.email == args.email.strip().casefold()))
        if not user:
            parser.error("Account not found")
        user.role = args.role
        db.commit()
        print(f"Account {user.id}: {args.role}")


if __name__ == "__main__":
    main()
