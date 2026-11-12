"""
Create a single-use admin invite and print its token (shown once).

    venv/bin/python scripts/create_admin_invite.py --role super_admin
    venv/bin/python scripts/create_admin_invite.py --role district_admin --email ops@example.gov.in --hours 24

Use this to bootstrap the first super_admin; after that, a super_admin can
create invites via POST /api/auth/admin/invites.
"""
import argparse

import _bootstrap  # noqa: F401

from auth.invites import create_invite
from database.connection import SessionLocal, create_tables
from models.admin import AdminRole

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument("--role", required=True, choices=[r.value for r in AdminRole])
parser.add_argument("--email", help="Restrict the invite to this email address")
parser.add_argument("--hours", type=int, help="Expiry in hours (default: ADMIN_INVITE_EXPIRE_HOURS)")
args = parser.parse_args()

create_tables()
db = SessionLocal()
try:
    token, invite = create_invite(db, AdminRole(args.role), args.email, args.hours)
    print(f"Invite #{invite.id} for role '{invite.role.value}'"
          + (f" (email: {invite.email})" if invite.email else "")
          + f", expires {invite.expires_at:%Y-%m-%d %H:%M} UTC")
    print(f"\n  {token}\n")
    print("Share it securely. It works once and is not stored in plain text.")
finally:
    db.close()
