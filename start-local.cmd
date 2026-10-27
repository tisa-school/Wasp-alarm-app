@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 20.11 or newer, then open this file again.
  pause
  exit /b 1
)
node start-local.mjs
pause
