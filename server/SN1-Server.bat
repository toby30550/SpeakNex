@echo off
title SN1-Server - SpeakNex Server
echo.
echo ============================================
echo   SpeakNex Server v26.0
echo   Serveur de communication vocale
echo ============================================
echo.
echo Démarrage du serveur...
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERREUR: Node.js n'est pas installe.
    echo Veuillez installer Node.js 18 ou superieur.
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Display Node.js version
echo Version Node.js:
node -v
echo.

REM Start the server
node server.js %*

REM If we get here, the server was stopped
echo.
echo Serveur arrete.
pause
