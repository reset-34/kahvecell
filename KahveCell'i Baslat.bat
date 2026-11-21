@echo off
setlocal
cd /d "%~dp0"

set "DOCKER_DESKTOP=%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe"

docker info >nul 2>&1
if not errorlevel 1 goto start_app
if not exist "%DOCKER_DESKTOP%" goto docker_not_found

echo Docker Desktop baslatiliyor...
start "" "%DOCKER_DESKTOP%"

set /a attempts=0

:wait_for_docker
docker info >nul 2>&1
if not errorlevel 1 goto start_app
set /a attempts+=1
if %attempts% geq 36 goto docker_timeout
timeout /t 5 /nobreak >nul
goto wait_for_docker

:start_app
echo Starting KahveCell...
docker compose up --build -d --wait
if errorlevel 1 goto compose_failed

start "" "http://localhost:8081"
echo KahveCell http://localhost:8081 adresinde calisiyor.
echo Durdurmak icin proje klasorunde su komutu calistir: docker compose down
pause
exit /b 0

:docker_not_found
echo Docker Desktop bulunamadi. Lutfen once Docker Desktop'i kur.
pause
exit /b 1

:docker_timeout
echo Docker Engine baslamadi. WSL2 kurulumu veya Windows'un yeniden baslatilmasi gerekebilir.
echo Docker Desktop'taki mesaji kontrol et, sonra bu dosyayi tekrar calistir.
pause
exit /b 1

:compose_failed
echo KahveCell baslatilamadi. Docker Desktop penceresindeki hatayi kontrol et.
pause
exit /b 1
