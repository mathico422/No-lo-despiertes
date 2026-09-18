@echo off
title No lo despiertes - Servidor local
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:5500"
  py -m http.server 5500
  goto :fin
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:5500"
  python -m http.server 5500
  goto :fin
)

echo No se encontro Python en esta computadora.
echo Abri la carpeta con Visual Studio Code o Antigravity y usa Live Server.
pause

:fin
