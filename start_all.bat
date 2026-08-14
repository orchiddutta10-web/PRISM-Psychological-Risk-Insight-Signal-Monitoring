@echo off
REM ============================================================
REM PRISM — Full Pipeline Launcher
REM ============================================================
REM Launches all PRISM services:
REM   1. PRISM API (FastAPI, port 8000)
REM   2. PRISM Guardian Dashboard (Next.js, port 3000)
REM   3. PRISM Edge Bridge (ESP32 + Dashboard, port 8500)
REM
REM Usage: start_all.bat [--no-api] [--no-dashboard] [--no-edge]
REM ============================================================

set PRISM_DIR=%~dp0
set API_DIR=%PRISM_DIR%services\api
set DASHBOARD_DIR=%PRISM_DIR%apps\dashboard
set EDGE_DIR=%PRISM_DIR%prism_edge

echo ============================================================
echo  PRISM Pipeline Launcher
echo ============================================================
echo.

REM ---- Step 0: Check virtual environment ----
if not exist "%PRISM_DIR%.venv\Scripts\python.exe" (
    echo [Setup] Creating Python virtual environment...
    cd /d "%PRISM_DIR%"
    python -m venv .venv
    echo [Setup] Virtual environment created.
)

REM ---- PRISM API ----
if not "%1"=="--no-api" if not "%2"=="--no-api" if not "%3"=="--no-api" (
    echo [1/3] Installing API dependencies...
    cd /d "%API_DIR%"
    ..\..\.venv\Scripts\python.exe -m pip install -r requirements.txt --quiet
    echo [1/3] Starting PRISM API ^(port 8000^)...
    start "PRISM-API" cmd /c "cd /d "%API_DIR%" && ..\..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
    timeout /t 3 /nobreak >nul
)

REM ---- PRISM Guardian Dashboard ----
if not "%1"=="--no-dashboard" if not "%2"=="--no-dashboard" if not "%3"=="--no-dashboard" (
    echo [2/3] Installing dashboard dependencies...
    cd /d "%DASHBOARD_DIR%"
    call npm install --silent
    echo [2/3] Starting PRISM Dashboard ^(port 3000^)...
    set NODE_ENV=development
    start "PRISM-Dashboard" cmd /c "cd /d "%DASHBOARD_DIR%" && set NODE_ENV=development&& npx next dev"
    timeout /t 5 /nobreak >nul
)

REM ---- PRISM Edge Bridge ----
if not "%1"=="--no-edge" if not "%2"=="--no-edge" if not "%3"=="--no-edge" (
    if exist "%EDGE_DIR%\edge_bridge.py" (
        echo [3/3] Starting PRISM Edge Bridge ^(port 8500^)...
        start "PRISM-Edge" cmd /c "cd /d "%EDGE_DIR%" && ..\..\.venv\Scripts\python.exe edge_bridge.py --port 8500"
        timeout /t 2 /nobreak >nul
    )
)

echo.
echo ============================================================
echo  All services launched!
echo ============================================================
echo.
echo   PRISM API Docs:    http://localhost:8000/docs
echo   PRISM Dashboard:   http://localhost:3000
echo   Edge Dashboard:    http://localhost:8500/dashboard
echo.
echo   Close individual windows to stop services, or run:
echo     taskkill /F /FI "WINDOWTITLE eq PRISM-*"
echo ============================================================
pause
