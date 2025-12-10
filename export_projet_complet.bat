@echo off
setlocal enabledelayedexpansion

echo ============================================
echo     EXPORT COMPLET DU PROJET ACTU-PARLEMENT
echo ============================================
echo.

REM --- 1) Se placer dans le dossier du script ---
cd /d "%~dp0"

REM --- 2) Générer un nom de ZIP unique avec la date ---
for /f "tokens=1-3 delims=/" %%a in ("%date%") do (
    set DD=%%a
    set MM=%%b
    set YYYY=%%c
)

for /f "tokens=1-2 delims=:." %%h in ("%time%") do (
    set HH=%%h
    set MIN=%%i
)

set ZIP_NAME=export-projet-%YYYY%-%MM%-%DD%_%HH%h%MIN%.zip

echo [1/2] Création du zip du projet : %ZIP_NAME%
echo (Les fichiers seront compressés…)
powershell -Command "Compress-Archive -Path * -DestinationPath '%ZIP_NAME%' -Force"

if errorlevel 1 (
    echo.
    echo ❌ ERREUR : Problème lors de la création du ZIP.
    echo Vérifie que PowerShell est installé.
) else (
    echo.
    echo ✅ ZIP créé : %ZIP_NAME%
)

echo.
echo --------------------------------------------
echo [2/2] Dump des données Supabase vers supabase_dump.sql
echo (Nécessite la CLI Supabase)
echo --------------------------------------------
echo.

REM --- Tester si la CLI supabase est installée ---
where supabase >nul 2>&1
if errorlevel 1 (
    echo ⚠️  La CLI Supabase n'est pas installée.
    echo    Installation : npm install -g supabase
    echo    → Passage au ZIP uniquement.
    goto end
)

REM --- Lancer le dump ---
supabase db dump -f supabase_dump.sql --data-only

if errorlevel 1 (
    echo ❌ Erreur : Impossible d'exécuter supabase db dump.
    echo Vérifie :
    echo   - que tu as fait "supabase login"
    echo   - que ton projet est bien lié avec "supabase link"
) else (
    echo ✅ Dump Supabase créé : supabase_dump.sql
)

:end

echo.
echo ============================================
echo            EXPORT TERMINE
echo --------------------------------------------
echo   ZIP créé  : %ZIP_NAME%
echo   Dump SQL  : supabase_dump.sql (si OK)
echo ============================================
echo.
pause

endlocal
