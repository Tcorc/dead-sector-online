@echo off
title Dead Sector Web Multiplayer V3
cd /d "%~dp0"
echo ================================================
echo             DEAD SECTOR WEB V3
echo ================================================
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo ERROR: Node.js is not installed.
  echo Install Node.js LTS from https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing packages on first launch...
  call npm install
  if %errorlevel% neq 0 (
    echo npm install failed.
    pause
    exit /b 1
  )
)
echo.
echo YOUR GAME: http://localhost:3000
echo Keep this window open while playing.
echo.
start "" http://localhost:3000
node server.js
pause
