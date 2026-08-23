@echo off
setlocal

:: Self-elevate once - packet capture (used by the live monitor window)
:: needs Administrator, so the whole launcher requests it up front and you
:: never have to remember "Run as Administrator" for any individual piece.
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

set PROJDIR=D:\ddos-detection
cd /d %PROJDIR%

echo.
set /p BIND_IP="Enter YOUR machine's IP that Kali can reach (see 'ipconfig', e.g. 192.168.56.1 for a VirtualBox VM, or your Wi-Fi IP for a separate laptop): "

echo === Cleaning up any stale process on port 8000 ===
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /PID %%p /F >nul 2>&1
)

echo === Starting backend ===
start "DDoS Backend" cmd /k "cd /d %PROJDIR% && %PROJDIR%\venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload"

timeout /t 4 >nul

echo === Starting frontend ===
start "DDoS Frontend" cmd /k "cd /d %PROJDIR%\frontend && npm run dev"

timeout /t 4 >nul

echo === Starting live attack monitor (capture + detect + alert, continuous) ===
start "DDoS Live Monitor" cmd /k "cd /d %PROJDIR%\ml && %PROJDIR%\venv\Scripts\python.exe live_monitor.py --bind-ip %BIND_IP%"

timeout /t 3 >nul

echo === Opening dashboard in browser ===
start http://localhost:5173

echo.
echo All set - backend, frontend, and the live monitor are each running in
echo their own window. Log in with admin@local / Admin123!
echo.
echo You can now run ANY attack from Kali (or another machine) targeting
echo %BIND_IP% - the live monitor scores traffic automatically every 5s and
echo the dashboard refreshes itself. No further commands needed on this end.
pause
