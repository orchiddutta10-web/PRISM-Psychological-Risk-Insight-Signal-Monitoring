@echo off
echo Starting PRISM Backend API...
start "PRISM API" cmd /k "cd services\api && ..\..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

echo Starting PRISM Dashboard...
start "PRISM Dashboard" cmd /k "cd apps\dashboard && npm run dev"

echo Both services are starting!
echo The dashboard will be available at http://localhost:3000
echo The API will be available at http://localhost:8000
