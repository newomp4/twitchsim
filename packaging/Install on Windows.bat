@echo off
REM TwitchSim - After Effects panel installer (Windows)
REM Copies the panel into Adobe's CEP extensions folder and allows unsigned panels to load.
REM Deliberately no "enabledelayedexpansion": it would eat a "!" in the unzip path.
setlocal
set "SRC=%~dp0com.twitchsim.panel"
set "DEST=%APPDATA%\Adobe\CEP\extensions\com.twitchsim.panel"

echo.
echo   TwitchSim - After Effects panel
echo   ===============================
echo.

if not exist "%SRC%\CSXS\manifest.xml" (
  echo   [X] Can't find the "com.twitchsim.panel" folder next to this installer.
  echo       Unzip the whole download first ^(don't run it from inside the zip^), then try again.
  echo.
  pause
  exit /b 1
)

REM the panel needs CEP 12, which arrived in After Effects 25.0 - warn before it silently no-shows
set "AENEW="
set "AEOLD="
for %%Y in (2025 2026 2027 2028 2029 2030) do if exist "%ProgramFiles%\Adobe\Adobe After Effects %%Y" set "AENEW=%%Y"
for %%Y in (2020 2021 2022 2023 2024) do if exist "%ProgramFiles%\Adobe\Adobe After Effects %%Y" set "AEOLD=%%Y"
if defined AENEW goto :aechecked
if not defined AEOLD goto :aechecked
echo   [!] Found After Effects %AEOLD%, but this panel needs 2025 or newer.
echo       Installing anyway, but it will not appear in Window ^> Extensions
echo       until you're on After Effects 2025+.
echo.
:aechecked

echo   Installing...
if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%" 2>nul
xcopy "%SRC%" "%DEST%" /E /I /Y /Q >nul
if not exist "%DEST%\CSXS\manifest.xml" (
  echo   [X] Copy failed - the panel isn't where it should be.
  echo       If After Effects is open, close it completely and run this again.
  echo.
  pause
  exit /b 1
)
echo   [OK] Panel installed

REM let After Effects load a panel that isn't signed by Adobe
for %%V in (9 10 11 12 13) do reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
echo   [OK] After Effects allowed to load it

echo.
echo   Done. Now:
echo     1. Close After Effects if it's open, then start it again
echo     2. Window ^> Extensions ^> TwitchSim
echo.
pause
