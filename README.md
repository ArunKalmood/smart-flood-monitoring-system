# 🌊 Smart Flood Monitoring & Early Warning System

> AI-Enabled Embedded Systems for Intelligent Disaster Response

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%2018-61DAFB)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336791)](https://postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20CSS-38B2AC)](https://tailwindcss.com/)

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Installation](#-installation)
- [Environment Variables](#-environment-variables)
- [API Documentation](#-api-documentation)
- [Role-Based Access](#-role-based-access)
- [Future Integrations](#-future-integrations)
- [Screenshots](#-screenshots)

---

## ✨ Features

### Core Modules
- 🔐 **Complete Authentication** — JWT, Role-Based Access (Admin, Government, Volunteer, Public)
- 📊 **Glassmorphism Dashboard** — Real-time stats, live charts, water level trends
- 📡 **IoT Sensor Monitoring** — Live sensor data, battery status, historical charts
- 🧠 **Flood Prediction** — Rule-based engine (ML-ready), radar chart, feature importance
- 🆘 **SOS Emergency Dashboard** — Submit/track SOS, live map, photo upload, GPS
- 🗺️ **Route Optimization Map** — Leaflet/OSM, blocked roads, safe routes, evacuation centers
- 📦 **Resource Tracker** — Boats, ambulances, food kits, medical kits, police, fire
- 🏠 **Evacuation Center Management** — CRUD, capacity tracking, food/medical status
- 👥 **Volunteer Management** — Registration, skills, approval workflow, blood groups
- 💬 **Feedback Portal** — LLM-ready storage, admin actions, priority filtering
- 🔔 **Notification Center** — Real-time unread count, mark read, type-based icons
- 📄 **Reports** — JSON/CSV download, 6 report types, date range filtering
- 🌐 **Public Landing Page** — Live stats, news, emergency contacts, safety guidelines
- ⚙️ **Settings** — Dark/Light/System theme, language, notification preferences

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Tailwind CSS, Framer Motion, Recharts, React-Leaflet |
| Backend | Python FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL |
| Auth | JWT (python-jose), bcrypt |
| Maps | Leaflet + OpenStreetMap |
| Icons | Lucide React |

---

## 📁 Project Structure

```
flood-monitor/
├── backend/
│   ├── main.py                 # FastAPI app entry point
│   ├── requirements.txt
│   ├── .env.example
│   ├── api/
│   ├── models/                 # SQLAlchemy ORM models
│   │   ├── user.py
│   │   ├── admin.py
│   │   ├── volunteer.py
│   │   ├── sensor.py
│   │   ├── flood_data.py
│   │   ├── sos.py
│   │   ├── feedback.py
│   │   ├── notification.py
│   │   └── evacuation_center.py
│   ├── schemas/                # Pydantic request/response models
│   ├── routes/                 # API route handlers
│   │   ├── auth.py
│   │   ├── dashboard.py
│   │   ├── sensors.py
│   │   ├── predictions.py
│   │   ├── sos.py
│   │   ├── feedback.py
│   │   ├── volunteers.py
│   │   ├── resources.py
│   │   ├── notifications.py
│   │   ├── reports.py
│   │   ├── users.py
│   │   └── genai.py            # LLM integration placeholder
│   ├── auth/
│   │   └── jwt_handler.py      # JWT creation, verification, RBAC
│   ├── database/
│   │   └── connection.py       # SQLAlchemy engine, session, create_tables
│   ├── utils/
│   │   └── config.py           # Pydantic settings
│   ├── ml/
│   │   └── predictor.py        # ML model wrapper (drop pkl here)
│   ├── iot/
│   │   └── iot_service.py      # IoT ingestion service
│   ├── genai/                  # Future LLM integration
│   ├── notifications/          # Future email/SMS/push service
│   └── uploads/                # Uploaded files (SOS photos, etc.)
│
└── frontend/
    ├── package.json
    ├── tailwind.config.js
    ├── .env.example
    └── src/
        ├── App.js              # Router, lazy loading, providers
        ├── index.js
        ├── context/
        │   ├── AuthContext.js
        │   ├── ThemeContext.js
        │   └── NotificationContext.js
        ├── layouts/
        │   ├── AuthLayout.js
        │   ├── DashboardLayout.js
        │   └── PublicLayout.js
        ├── components/
        │   └── common/
        │       ├── StatCard.js
        │       ├── ProtectedRoute.js
        │       ├── PageLoader.js
        │       ├── ErrorBoundary.js
        │       └── AlertBanner.js
        ├── pages/
        │   ├── auth/           # Login, Register, AdminLogin, AdminRegister, ForgotPassword
        │   ├── dashboard/      # All protected pages
        │   └── public/         # Landing, PublicInfo, VolunteerRegister, NotFound
        ├── services/
        │   └── api/index.js    # Axios instance + all API calls
        └── styles/
            └── globals.css
```

---

## 🚀 Installation

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL 15+

### Backend Setup

```bash
cd flood-monitor/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Start server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd flood-monitor/frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env — set REACT_APP_API_URL=http://localhost:8000/api

# Start development server
npm start
```

### Database Setup

```sql
-- Create database
CREATE DATABASE floodmonitor;

-- Tables are auto-created on first run via SQLAlchemy create_tables()
```

Schema changes for existing databases (new columns, timezone-aware timestamps,
new enum values) are applied automatically at startup and can also be run by hand.
They are idempotent:

```bash
cd backend && venv/bin/python scripts/migrate.py
```

Existing predictions are marked `source = simulation` by the migration; only
predictions computed from real sensor readings are `live`.

---

## 🔑 Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | required |
| `SECRET_KEY` | JWT signing key (min 32 chars; the app refuses to start with a placeholder) | required |
| `ADMIN_INVITE_EXPIRE_HOURS` | Lifetime of single-use admin invites | `72` |
| `RATE_LIMIT_ENABLED` | Per-IP rate limiting on login/registration/submit endpoints | `true` |
| `RATE_LIMIT_AUTH` | Limit for login, register, admin invite endpoints | `5/minute` |
| `RATE_LIMIT_SUBMIT` | Limit for SOS / feedback / volunteer submissions | `10/minute` |
| `RATE_LIMIT_PUBLIC` | Limit for `/api/public/summary` | `60/minute` |
| `SENSOR_OFFLINE_AFTER_MINUTES` | A sensor counts as offline after this many minutes without data | `5` |
| `LIVE_READING_WINDOW_MINUTES` | Readings older than this are not used for the live prediction | `60` |
| `MAX_UPLOAD_MB` | Max SOS / feedback photo size (HTTP 413 above it) | `5` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiry | `60` |
| `CORS_ORIGINS` | Allowed frontend origins | `http://localhost:3000` |

### Frontend (`frontend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `REACT_APP_API_URL` | Backend API base URL | `http://localhost:8000/api` |
| `REACT_APP_APP_NAME` | Application name | `FloodMonitor` |

---

## 📡 API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc

### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/admin/login` | Admin login |
| POST | `/api/auth/admin/register` | Admin registration (single-use invite required) |
| POST | `/api/auth/verify-admin-token` | Check an admin invite; returns the role it grants |
| POST | `/api/auth/admin/invites` | Create an admin invite (super_admin) |
| GET | `/api/public/summary` | Public, aggregated numbers for the home page (no login) |
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/sensors/` | All sensors |
| POST | `/api/sensors/data` | IoT data ingestion (`X-Device-Key` header required) |
| POST | `/api/predictions/predict` | Run a what-if simulation (saved as `source=simulation`; never affects live status) |
| GET | `/api/predictions/latest` | Latest live prediction (computed from sensor readings) |
| GET | `/api/predictions/history?hours=` | Live prediction history |
| GET | `/api/predictions/daily?days=&utc_offset_minutes=` | Live predictions per day by risk level |
| GET | `/api/predictions/stats?days=&source=` | Risk distribution + feature weights |
| GET | `/api/sensors/data/history?sensor_id=&hours=` | Reading history for one sensor |
| POST | `/api/sos/submit` | Submit SOS request |
| GET | `/api/sos/map-data` | SOS locations for map |
| PATCH | `/api/sos/{id}/status` | Move an SOS along pending → accepted → in_progress → rescued/resolved (400 on invalid transitions) |
| GET | `/api/sos/{id}/history` | Status change audit trail |
| GET/POST | `/api/feedback/` | Feedback CRUD |
| GET/POST | `/api/evacuation-centers/` | Evacuation centers |
| GET/POST | `/api/resources/` | Resource management |
| GET | `/api/reports/generate/{type}` | Generate reports |
| GET | `/api/genai/analyze-feedback` | LLM analysis (placeholder) |

---

## 👤 Role-Based Access

Permissions are defined once in `backend/auth/permissions.py` (`PERMISSIONS`) and
enforced on every endpoint. The frontend mirrors them in
`frontend/src/config/permissions.js` for the sidebar and route guards; a backend
test fails if the two drift apart.

| Action | public_user | volunteer | government_authority | super / district admin | operations | analyst |
|---|---|---|---|---|---|---|
| Submit SOS / feedback | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View own SOS / feedback | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View all SOS | ❌ | pending + accepted by them | ✅ | ✅ | ✅ | ✅ (phones masked) |
| Update SOS status | ❌ | accept pending; update their own | ✅ | ✅ | ✅ | ❌ |
| View all feedback | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Manage feedback | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| View volunteers | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ (phones masked) |
| Approve volunteers | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Evacuation centers / resources / alerts (write) | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Reports | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Register sensors / rotate device keys | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| List all users, audit log | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Change user roles, create admin invites | ❌ | ❌ | ❌ | super_admin only | ❌ | ❌ |

Notes:
- Public registration only offers `public_user` and `volunteer`. A self-registered
  volunteer gets volunteer permissions once their volunteer application (same
  email) is approved; until then they act as `public_user`.
- `government_authority` is granted by a super_admin:
  `PATCH /api/users/admin/{user_id}/role`.
- To review accounts with elevated roles: `cd backend && venv/bin/python scripts/list_elevated_users.py`.

### Admin Registration (single-use invites)

1. Create the first super admin's invite from the server:
   `cd backend && venv/bin/python scripts/create_admin_invite.py --role super_admin`
   (later invites can be created by a super admin via `POST /api/auth/admin/invites`).
2. Open `/admin/register`, paste the invite code, and complete the form.
   The invite decides the role. Each invite works once and expires (default 72 h).

### IoT devices (ESP32)

Every sensor has its own key. Issue one (shown once) with:

```bash
cd backend
venv/bin/python scripts/provision_device_key.py SN-001              # existing sensor
venv/bin/python scripts/provision_device_key.py --list              # which sensors have keys
```

Then send it in the `X-Device-Key` header from the firmware:

```cpp
const char* DEVICE_KEY = "paste-the-key-here";   // from provision_device_key.py

HTTPClient http;
http.begin(SERVER_URL);                          // http://<server>:8000/api/sensors/data
http.addHeader("Content-Type", "application/json");
http.addHeader("X-Device-Key", DEVICE_KEY);      // NEW: required since the security update
int code = http.POST(payload);                   // 401 = missing/wrong key, 422 = reading out of range
```

Readings are range-checked: water level 0–50 m, rainfall 0–500 mm/h,
temperature −20–60 °C, humidity and battery 0–100 %, valid latitude/longitude.
Unknown `sensor_id`s are no longer auto-registered.
River flow (0–30 m/s) is optional and, when sent, is used by the prediction.
Every accepted reading updates the live flood prediction.

All timestamps returned by the API are UTC with an explicit offset
(e.g. `2026-10-02T08:15:00+00:00`).

### Maintenance scripts (`backend/scripts/`)

| Script | Purpose |
|--------|---------|
| `migrate.py` | Apply schema migrations (idempotent) |
| `create_admin_invite.py` | Create a single-use admin invite |
| `provision_device_key.py` | Issue / rotate a sensor's device key |
| `list_elevated_users.py` | List accounts with elevated roles |
| `cleanup_qa_data.py` | Remove QA/test rows; shows a dry run first, deletes only after confirmation (or `--yes`) |
| `build_public_resources.py` | Regenerate the downloadable PDFs in `frontend/public/resources/` |

### Tests

```bash
cd backend && venv/bin/python -m pytest          # backend
cd frontend && CI=true npm test                  # frontend (Jest + React Testing Library)
```

---

## 🔮 Future Integrations

The codebase is architected to support:

| Feature | Integration Point |
|---------|-------------------|
| 🤖 ML Flood Prediction | Place `flood_predictor.pkl` in `backend/ml/models/` |
| 🧠 LLM Feedback Analysis | Implement `backend/genai/genai_service.py` with OpenAI/Watson |
| 📡 IoT Sensors | POST to `/api/sensors/data` with sensor_id and `X-Device-Key` |
| 🌦️ Weather API | Configure `WEATHER_API_KEY` in `.env` |
| 📧 Email Alerts | Configure `SMTP_*` variables in `.env` |
| 📱 SMS (Twilio) | Configure `TWILIO_*` variables in `.env` |
| 🔔 Push (Firebase) | Configure `FCM_SERVER_KEY` in `.env` |
| 🛰️ Satellite/Drone | Extend `backend/iot/iot_service.py` |
| 🗺️ Google Maps | Configure `GOOGLE_MAPS_KEY` in `.env` |
| 📊 AI Route Optimization | Implement `POST /api/routes/optimize` |

---

## 🛡️ Security Features

- ✅ JWT Bearer Authentication
- ✅ bcrypt Password Hashing
- ✅ Role-Based Authorization
- ✅ Single-use, hashed, expiring admin invites
- ✅ Per-IP rate limiting on authentication endpoints
- ✅ Per-device API keys for IoT ingestion
- ✅ CORS Configuration
- ✅ SQL Injection Prevention (SQLAlchemy ORM)
- ✅ File Upload Validation
- ✅ Automatic Token Refresh (Frontend)

---

## 📸 Pages Overview

| Page | URL | Access |
|------|-----|--------|
| Landing | `/` | Public |
| Login | `/login` | Public |
| Register | `/register` | Public |
| Admin Login | `/admin/login` | Public |
| Admin Register | `/admin/register` | Token Protected |
| Dashboard | `/dashboard` | Auth Required |
| Sensors | `/dashboard/sensors` | Auth Required |
| Predictions | `/dashboard/predictions` | Auth Required |
| SOS | `/dashboard/sos` | Auth Required |
| Resources | `/dashboard/resources` | Admin/Gov |
| Route Map | `/dashboard/routes` | Auth Required |
| Evacuation | `/dashboard/evacuation` | Admin/Gov |
| Volunteers | `/dashboard/volunteers` | Admin/Gov |
| Feedback | `/dashboard/feedback` | Auth Required |
| Notifications | `/dashboard/notifications` | Auth Required |
| Reports | `/dashboard/reports` | Admin/Gov/Analyst |
| Profile | `/dashboard/profile` | Auth Required |
| Settings | `/dashboard/settings` | Auth Required |
| Public Info | `/public-info` | Public |
| Volunteer Register | `/volunteer-register` | Public |

---

## 👨‍💻 Development Notes

### Backend Architecture (MVC)
- **Models** → `backend/models/` — SQLAlchemy ORM
- **Views** → `backend/routes/` — FastAPI route handlers
- **Controllers** → `backend/services/` — Business logic (future)
- **Schemas** → `backend/schemas/` — Pydantic validation

### Frontend Architecture
- Lazy-loaded pages via `React.lazy()`
- Centralized API layer in `services/api/index.js`
- Context providers for Auth, Theme, Notifications
- Tailwind CSS with custom glass-card components
- Responsive design with mobile sidebar

---

## 📜 License

This project is for academic/educational purposes. Smart Flood Monitoring & Early Warning System.

---

*Built with ❤️ using FastAPI + React + PostgreSQL*
