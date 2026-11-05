@echo off
setlocal
cd /d "%~dp0"

set "ELECTRON_EXE=%CD%\node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_EXE%" set "ELECTRON_EXE=%CD%\node_modules\.pnpm\electron@44.9.0_supports-color@7.2.0\node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_EXE%" (
  echo Electron runtime was not found:
  echo %ELECTRON_EXE%
  pause
  exit /b 1
)

set "ELECTRON_RUN_AS_NODE="
start "" "%ELECTRON_EXE%" "%CD%"
exit /b 0
