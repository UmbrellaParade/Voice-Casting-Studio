@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -Command "try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:43127/health' -TimeoutSec 2; if ($health.ok) { exit 0 } } catch {}; exit 1" >nul 2>&1
if %errorlevel% equ 0 exit /b 0
start "Voice Cast Studio audition finisher" /min cmd /c "npm.cmd run audition:helper >> audition-finisher.log 2>&1"
exit /b 0
