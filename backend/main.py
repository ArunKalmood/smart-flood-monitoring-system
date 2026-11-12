from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from utils.config import settings
from database.connection import create_tables

# Routes
from routes.auth import router as auth_router
from routes.sensors import router as sensor_router
from routes.predictions import router as prediction_router
from routes.sos import router as sos_router
from routes.feedback import router as feedback_router
from routes.volunteers import router as volunteer_router
from routes.notifications import router as notification_router
from routes.dashboard import router as dashboard_router
from routes.users import router as user_router
from routes.reports import router as report_router
from routes.genai import router as genai_router
from routes.resources import evac_router, resource_router, alert_router
from routes.audit import router as audit_router
from routes.public import router as public_router
from slowapi.errors import RateLimitExceeded
from utils.rate_limit import limiter, rate_limit_exceeded_handler

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    print("✅ FloodMonitor API started. Tables created.")
    yield


_DESCRIPTION = r"""
## FloodMonitor — Smart Flood Monitoring & Early Warning System

**Base URL:** `/api`  |  **Auth:** Bearer JWT (obtain via `/api/auth/login` or `/api/auth/admin/login`)

### Feature modules
| Module | Prefix | Auth required |
|--------|--------|---------------|
| Public summary | `/public` | No (aggregates only) |
| Authentication | `/auth` | Partial; invites need super_admin |
| Sensors & IoT | `/sensors` | `X-Device-Key` (ingest), Yes (read/admin) |
| Flood Prediction | `/predictions` | Yes |
| SOS Emergency | `/sos` | Optional (submit), Yes (read, scoped by role), Yes + role (update) |
| Feedback | `/feedback` | Optional (submit), Yes (read, scoped by role), Yes + role (update) |
| Volunteers | `/volunteers` | No (register), Yes + role (view/approve) |
| Notifications | `/notifications` | Yes |
| Dashboard | `/dashboard` | Yes |
| Reports | `/reports` | Yes — supports `?format=json\|csv\|pdf` |
| Evacuation Centers | `/evacuation-centers` | Yes |
| Resources | `/resources` | Yes |
| Alerts | `/alerts` | Yes |
| Audit Log | `/audit` | Yes — super_admin / district_admin only |
| GenAI (placeholder) | `/genai` | Yes |

> **Fallback behaviour:** Third-party services (SMS, push, ML, LLM) degrade gracefully
> to in-app notifications when API keys are absent.
"""

_TAGS_METADATA = [
    {"name": "Public",                  "description": "Unauthenticated, aggregated, non-personal data for the home page."},
    {"name": "Authentication",          "description": "User & admin registration, login, JWT refresh, password management."},
    {"name": "Sensors & IoT",           "description": "IoT data ingestion, sensor registry, historical flood-data queries."},
    {"name": "Flood Prediction",        "description": "Rule-based (and future ML) flood risk scoring."},
    {"name": "SOS Emergency",           "description": "Public SOS submission and admin triage/status updates."},
    {"name": "Feedback",                "description": "Citizen feedback submission and admin review workflow."},
    {"name": "Volunteers",              "description": "Volunteer registration, approval, and availability management."},
    {"name": "Notifications",           "description": "Per-user notification inbox with read/delete actions."},
    {"name": "Dashboard",               "description": "Aggregated stats and trends powering the main dashboard."},
    {"name": "Reports",                 "description": "Generate flood, SOS, volunteer, feedback, sensor, and prediction reports (JSON / CSV / PDF)."},
    {"name": "Evacuation Centers",      "description": "Evacuation centre registry with capacity tracking."},
    {"name": "Resources",               "description": "Emergency resource (boats, ambulances, kits) inventory."},
    {"name": "Alerts",                  "description": "Geospatial alert broadcast management."},
    {"name": "Audit Log",               "description": "Immutable admin action audit trail — super_admin / district_admin only."},
    {"name": "Generative AI (Future)",  "description": "Placeholder routes for LLM-powered feedback triage and flood summaries."},
]

app = FastAPI(
    title="FloodMonitor API",
    description=_DESCRIPTION,
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    openapi_tags=_TAGS_METADATA,
    contact={"name": "FloodMonitor Team"},
    license_info={"name": "MIT"},
    lifespan=lifespan,
)

# Rate limiting (per client IP; see utils/rate_limit.py)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for uploads
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Include all routers
API_PREFIX = "/api"
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(sensor_router, prefix=API_PREFIX)
app.include_router(prediction_router, prefix=API_PREFIX)
app.include_router(sos_router, prefix=API_PREFIX)
app.include_router(feedback_router, prefix=API_PREFIX)
app.include_router(volunteer_router, prefix=API_PREFIX)
app.include_router(notification_router, prefix=API_PREFIX)
app.include_router(dashboard_router, prefix=API_PREFIX)
app.include_router(user_router, prefix=API_PREFIX)
app.include_router(report_router, prefix=API_PREFIX)
app.include_router(genai_router, prefix=API_PREFIX)
app.include_router(evac_router, prefix=API_PREFIX)
app.include_router(resource_router, prefix=API_PREFIX)
app.include_router(alert_router, prefix=API_PREFIX)
app.include_router(audit_router, prefix=API_PREFIX)
app.include_router(public_router, prefix=API_PREFIX)


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "ml_ready": True,
        "iot_ready": True,
        "llm_ready": True,
    }


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(status_code=404, content={"detail": "Resource not found"})


@app.exception_handler(500)
async def server_error_handler(request: Request, exc):
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
