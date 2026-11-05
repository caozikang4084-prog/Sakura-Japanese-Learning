@echo off
setlocal
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

icacls "%~dp0node_modules\electron\dist" /grant *S-1-15-2-1:(OI)(CI)(RX)
if errorlevel 1 (
  echo.
  echo Failed to grant Electron sandbox read permission.
  pause
  exit /b 1
)

echo.
echo Electron sandbox permission has been repaired.
pause
