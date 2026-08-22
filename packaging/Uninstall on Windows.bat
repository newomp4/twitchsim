@echo off
REM TwitchSim - removes the After Effects panel (Windows)
setlocal
set "DEST=%APPDATA%\Adobe\CEP\extensions\com.twitchsim.panel"
echo.
if exist "%DEST%" (
  rmdir /s /q "%DEST%"
  echo   [OK] TwitchSim panel removed. Restart After Effects.
) else (
  echo   Nothing to remove - the panel isn't installed.
)
echo.
pause
