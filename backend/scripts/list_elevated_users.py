"""
List every account with elevated privileges, for manual review. Read-only.

    venv/bin/python scripts/list_elevated_users.py

Ordinary user accounts with role `admin` or `government_authority` may have
been created through the old, unrestricted public registration. Note that the
legacy `admin` role on user accounts no longer grants any permission.
To fix a user's role, a super_admin can call PATCH /api/users/admin/{id}/role.
"""
import _bootstrap  # noqa: F401

from database.connection import SessionLocal
from models.admin import Admin
from models.user import User, UserRole

db = SessionLocal()
try:
    users = db.query(User).filter(User.role.in_([UserRole.ADMIN, UserRole.GOVERNMENT])).order_by(User.id).all()
    admins = db.query(Admin).order_by(Admin.id).all()

    print(f"User accounts with elevated roles ({len(users)}):")
    for u in users:
        print(f"  user #{u.id:<4} {u.email:<45} role={u.role.value:<22} created={u.created_at}  active={u.is_active}")
    print(f"\nAdmin accounts ({len(admins)}):")
    for a in admins:
        print(f"  admin #{a.id:<3} {a.email:<45} role={a.role.value:<22} created={a.created_at}  active={a.is_active}")
finally:
    db.close()
