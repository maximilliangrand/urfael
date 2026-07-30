@echo off
rem  install-windows.cmd — the easy button for Windows. DOUBLE-CLICK this file.
rem
rem  A .cmd can be double-clicked (a .ps1 opens Notepad), so this is the one file a non-technical person needs.
rem  It launches the guided PowerShell installer, which auto-installs the prerequisites (Node, git, ffmpeg,
rem  Claude Code) via winget, sets everything up, runs the setup wizard, and offers to open the app. No admin
rem  needed. If Windows shows a blue "Windows protected your PC" box, click "More info" then "Run anyway".
title Urfael - Windows install
echo.
echo   Starting the Urfael guided installer...
echo   (this installs Node, git, ffmpeg and Claude Code for you if they are missing)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Guided
echo.
echo   Done. You can close this window.
pause
