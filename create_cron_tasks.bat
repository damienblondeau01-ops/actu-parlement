@echo off
echo ===============================
echo  ActuDesLois - (Re)creation CRON
echo ===============================

REM ====== PARAMETRES A ADAPTER SI BESOIN ======
set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
set "PROJECT_DIR=C:\Users\damie\actu-parlement"

echo.
echo Utilise :
echo   NPM_CMD     = %NPM_CMD%
echo   PROJECT_DIR = %PROJECT_DIR%
echo.

REM ====== SUPPRESSION DES TACHES EXISTANTES (IGNORE LES ERREURS) ======
echo Suppression des anciennes taches (si existent)...

schtasks /Delete /TN "ActuDesLois_sync_scrutins" /F >nul 2>&1
schtasks /Delete /TN "ActuDesLois_sync_deputes" /F >nul 2>&1
schtasks /Delete /TN "ActuDesLois_generate_resumes" /F >nul 2>&1

REM ====== CREATION NOUVELLES TACHES ======
echo Creation de ActuDesLois_sync_scrutins (03:00)...
schtasks /Create ^
  /SC DAILY ^
  /TN "ActuDesLois_sync_scrutins" ^
  /TR "\"%NPM_CMD%\" run sync:scrutins --prefix %PROJECT_DIR%" ^
  /ST 03:00

echo Creation de ActuDesLois_sync_deputes (03:15)...
schtasks /Create ^
  /SC DAILY ^
  /TN "ActuDesLois_sync_deputes" ^
  /TR "\"%NPM_CMD%\" run sync:deputes --prefix %PROJECT_DIR%" ^
  /ST 03:15

echo Creation de ActuDesLois_generate_resumes (03:30)...
schtasks /Create ^
  /SC DAILY ^
  /TN "ActuDesLois_generate_resumes" ^
  /TR "\"%NPM_CMD%\" run ai:resumes --prefix %PROJECT_DIR%" ^
  /ST 03:30

echo.
echo ✅ Taches planifiees creees / mises a jour.
echo.
echo Pour tester immediatement :
echo   schtasks /Run /TN "ActuDesLois_sync_scrutins"
echo   schtasks /Run /TN "ActuDesLois_sync_deputes"
echo   schtasks /Run /TN "ActuDesLois_generate_resumes"
echo.

pause
