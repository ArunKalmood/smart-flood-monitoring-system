"""3.16 — scripts/build_public_resources.py writes the five real PDFs linked from the public site."""
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import build_public_resources  # noqa: E402

FRONTEND_SRC = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "src")


def _linked_files():
    with open(os.path.join(FRONTEND_SRC, "constants", "publicInfo.js"), encoding="utf-8") as f:
        return {os.path.basename(p) for p in re.findall(r"'/resources/([\w.-]+\.pdf)'", f.read())}


def test_builds_every_pdf_the_frontend_links_to(tmp_path):
    written = {os.path.basename(p): p for p in build_public_resources.build_all(str(tmp_path))}
    linked = _linked_files()
    assert linked and linked <= set(written)
    for path in written.values():
        with open(path, "rb") as f:
            data = f.read()
        assert data.startswith(b"%PDF-") and b"%%EOF" in data[-64:]
        assert len(data) > 1500


def test_emergency_numbers_match_the_site():
    with open(os.path.join(FRONTEND_SRC, "constants", "publicInfo.js"), encoding="utf-8") as f:
        site_numbers = re.findall(r"number: '([\d-]+)'", f.read())
    assert site_numbers == [n for _, _, n in build_public_resources.EMERGENCY_NUMBERS]


def test_committed_pdfs_exist():
    public = os.path.join(FRONTEND_SRC, "..", "public", "resources")
    for name in _linked_files() | {"flood-safety-guide.pdf"}:
        assert os.path.getsize(os.path.join(public, name)) > 1500
