# FloodMonitor - Windows PowerShell Start Script
$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  FloodMonitor - Start Script (PowerShell)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/2] Starting FastAPI backend on http://localhost:8000 ..." -ForegroundColor Green
$backendProcess = Start-Process -FilePath "python" -ArgumentList "-m uvicorn main:app --host 0.0.0.0 --port 8000 --reload" -WorkingDirectory "$RootDir\backend" -PassThru

Write-Host "[2/2] Starting React frontend on http://localhost:3000 ..." -ForegroundColor Green
$env:BROWSER = "none"
$frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm start" -WorkingDirectory "$RootDir\frontend" -PassThru

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  FloodMonitor is running!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Backend API  : http://localhost:8000" -ForegroundColor Yellow
Write-Host "  API Docs     : http://localhost:8000/api/docs" -ForegroundColor Yellow
Write-Host "  Frontend App : http://localhost:3000" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Press Ctrl+C or close the terminal to exit."

