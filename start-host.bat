@echo off
title Gunpla Wars Host
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer.
  echo Install it once with:   winget install OpenJS.NodeJS.LTS
  echo then close this window and double-click start-host.bat again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing packages. This takes a minute...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Package install failed.
    pause
    exit /b 1
  )
)

call npm start
pause
