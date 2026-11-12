#!/usr/bin/env bash
# ============================================================
#  FloodMonitor — Start both backend and frontend
# ============================================================
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Colours ──────────────────────────────────────────────────
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${BLUE}"
echo "  ██████████████████████████████████████"
echo "  ██  FloodMonitor  ·  Start Script    ██"
echo "  ██████████████████████████████████████"
echo -e "${NC}"

# ── Kill any previous instances ──────────────────────────────
echo -e "${YELLOW}▶ Stopping any previous instances...${NC}"
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "react-scripts start" 2>/dev/null || true
sleep 1

# ── Backend ──────────────────────────────────────────────────
echo -e "${GREEN}▶ Starting FastAPI backend on http://localhost:8000 ...${NC}"
cd "$ROOT/backend"
source venv/bin/activate

uvicorn main:app --host 0.0.0.0 --port 8000 --reload \
  > "$ROOT/backend.log" 2>&1 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID  (logs → flood-monitor/backend.log)"

# Wait for backend to be ready
echo -n "  Waiting for backend"
for i in $(seq 1 20); do
  sleep 1
  if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo -e "  ${GREEN}✅ Backend is up!${NC}"
    break
  fi
  echo -n "."
done

# ── Frontend ─────────────────────────────────────────────────
echo -e "${GREEN}▶ Starting React frontend on http://localhost:3000 ...${NC}"
cd "$ROOT/frontend"

BROWSER=none npm start \
  > "$ROOT/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID  (logs → flood-monitor/frontend.log)"

# ── Summary ──────────────────────────────────────────────────
echo ""
echo -e "${BLUE}════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}🌊 FloodMonitor is starting up!${NC}"
echo -e "${BLUE}════════════════════════════════════════════${NC}"
echo ""
echo -e "  Backend  API  →  ${BLUE}http://localhost:8000${NC}"
echo -e "  API Docs      →  ${BLUE}http://localhost:8000/api/docs${NC}"
echo -e "  Frontend App  →  ${BLUE}http://localhost:3000${NC}"
echo ""
echo -e "  ${YELLOW}Credentials:${NC}"
echo -e "  Register at   →  http://localhost:3000/register"
echo -e "  Admin Login   →  http://localhost:3000/admin/login"
echo -e "  Admin invite  →  cd backend && venv/bin/python scripts/create_admin_invite.py --role super_admin"
echo ""
echo -e "  Press ${RED}Ctrl+C${NC} to stop all servers"
echo ""

# ── Wait & cleanup ───────────────────────────────────────────
trap "echo ''; echo -e '${RED}▶ Shutting down...${NC}'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

wait
