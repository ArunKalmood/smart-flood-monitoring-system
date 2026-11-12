"""The frontend's copy of the permission matrix must match the backend's."""
import json
import os
import re

from auth.permissions import PERMISSIONS

FRONTEND_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "src", "config", "permissions.js")


def test_frontend_permissions_match_backend():
    src = open(FRONTEND_FILE, encoding="utf-8").read()
    block = re.search(r"// BEGIN PERMISSIONS.*?\n(.*?)\n// END PERMISSIONS", src, re.S).group(1)
    frontend = json.loads(block.strip().removeprefix("export const PERMISSIONS =").strip().rstrip(";"))
    backend = {k: sorted(v) for k, v in PERMISSIONS.items()}
    assert frontend == backend, "frontend/src/config/permissions.js is out of sync with auth/permissions.py"
