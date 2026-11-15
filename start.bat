@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo   FloodMonitor - Windows Start Script
echo ============================================================
echo.

cd /d "%~dp0"

echo [1/2] Starting FastAPI backend on http://localhost:8000 ...
cd backend
start "FloodMonitor Backend" cmd /k "python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

cd ..
echo [2/2] Starting React frontend on http://localhost:3000 ...
cd frontend
set BROWSER=none
start "FloodMonitor Frontend" cmd /k "npm start"

cd ..
echo.
echo ============================================================
echo   FloodMonitor is starting up!
echo ============================================================
echo   Backend API  : http://localhost:8000
echo   API Docs     : http://localhost:8000/api/docs
echo   Frontend App : http://localhost:3000
echo ============================================================
echo.

