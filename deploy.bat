@echo off
echo ==========================================
echo      AntSim V2 - Build & Deploy Tool
echo ==========================================

echo.
echo [1/2] Building Project...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed! Please check the errors above.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/2] Deploying to Home Assistant (\\192.168.1.155\config\www\antsim)...
set "SOURCE=dist"
set "DEST=\\192.168.1.155\config\www\antsim"

REM Use XCOPY to copy files (Simple overwrite)
xcopy "%SOURCE%" "%DEST%" /s /y /i

if %errorlevel% neq 0 (
    echo [ERROR] Deployment failed! Could not copy files.
    echo Please check if the network path is accessible.
    exit /b %errorlevel%
)

echo.
echo [SUCCESS] Deployment Complete!
echo You can now refresh the page in your browser.
echo.
exit /b 0
