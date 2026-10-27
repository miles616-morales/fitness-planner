@echo off
cd /d "%~dp0"
echo ================================================
echo   Fitness Week Planner  -  local server
echo ================================================
echo.
echo Your LAN IP (open one of these on iPhone Safari):
ipconfig | findstr /C:"IPv4"
echo.
echo Phone:   http://YOUR_IP_ABOVE:8765
echo PC:      http://localhost:8765
echo.
echo Press Ctrl+C to stop.
start "" http://localhost:8765
python -m http.server 8765 2>nul || py -3 -m http.server 8765
pause
