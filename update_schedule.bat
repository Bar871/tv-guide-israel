@echo off
echo Updating TV Schedule...
cd /d "%~dp0"
node scraper.js
echo.
echo Schedule updated! Check schedule.json.
pause
