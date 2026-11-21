@echo off
setlocal
cd /d "%~dp0"

docker compose down
if errorlevel 1 (
    echo KahveCell durdurulamadi. Docker Desktop'in acik oldugunu kontrol et.
    pause
    exit /b 1
)

echo KahveCell durduruldu.
pause
