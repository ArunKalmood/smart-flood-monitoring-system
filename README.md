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

---

## 🔑 Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | required |
| `SECRET_KEY` | JWT signing key (min 32 chars) | required |
| `ADMIN_REGISTRATION_TOKEN` | Token for admin signup | `1758` |
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
| POST | `/api/auth/admin/register` | Admin registration (token required) |
| POST | `/api/auth/verify-admin-token` | Verify admin token `1758` |
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/sensors/` | All sensors |
| POST | `/api/sensors/data` | IoT data ingestion |
| POST | `/api/predictions/predict` | Run flood prediction |
| POST | `/api/sos/submit` | Submit SOS request |
| GET | `/api/sos/map-data` | SOS locations for map |
| GET/POST | `/api/feedback/` | Feedback CRUD |
| GET/POST | `/api/evacuation-centers/` | Evacuation centers |
| GET/POST | `/api/resources/` | Resource management |
| GET | `/api/reports/generate/{type}` | Generate reports |
| GET | `/api/genai/analyze-feedback` | LLM analysis (placeholder) |

---

## 👤 Role-Based Access

| Role | Dashboard | SOS | Resources | Volunteers | Reports | Admin Panel |
|------|-----------|-----|-----------|------------|---------|-------------|
| `admin / super_admin` | ✅ Full | ✅ Full | ✅ CRUD | ✅ Approve | ✅ All | ✅ Yes |
| `district_admin` | ✅ Full | ✅ View | ✅ View | ✅ Approve | ✅ All | ✅ Yes |
| `government_authority` | ✅ Full | ✅ View | ✅ View | ✅ View | ✅ Yes | ❌ No |
| `volunteer` | ✅ Limited | ✅ View | ❌ | ❌ | ❌ | ❌ No |
| `public_user` | ✅ Basic | ✅ Submit | ❌ | ❌ | ❌ | ❌ No |

### Admin Registration
- Navigate to `/admin/register`
- Enter token: **`1758`**
- After verification, complete registration form

---

## 🔮 Future Integrations

The codebase is architected to support:

| Feature | Integration Point |
|---------|-------------------|
| 🤖 ML Flood Prediction | Place `flood_predictor.pkl` in `backend/ml/models/` |
| 🧠 LLM Feedback Analysis | Implement `backend/genai/genai_service.py` with OpenAI/Watson |
| 📡 IoT Sensors | POST to `/api/sensors/data` with sensor_id |
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
- ✅ Protected Admin Routes (token-gated)
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
