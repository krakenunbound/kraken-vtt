@echo off
rem Opens Kraken VTT from this folder, rebuilding it first if the code changed.
rem "Kraken VTT.bat --build" always rebuilds.
title Kraken VTT
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Kraken VTT needs Node.js: https://nodejs.org
  pause
  exit /b 1
)
node scripts\launch.mjs %*
if errorlevel 1 pause
