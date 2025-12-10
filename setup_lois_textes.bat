@echo off
setlocal

echo ================================
echo  Initialisation lois_textes
echo ================================
echo.

REM Se placer dans le dossier du script (racine du projet)
cd /d "%~dp0"

REM 1) Creer les dossiers ingestion et ingestion\data s'ils n'existent pas
if not exist "ingestion" (
  echo 📁 Creation du dossier ingestion...
  mkdir ingestion
)

if not exist "ingestion\data" (
  echo 📁 Creation du dossier ingestion\data...
  mkdir ingestion\data
)

echo.
echo 📄 Generation du fichier ingestion\data\lois_textes.json ...

REM 2) Generer le JSON d'exemple pour lois_textes
powershell -Command "@'
[
  {
    ""loi_id"": ""scrutin-public-ordinaire-projet-de-loi-portant-transposition-des-accords-nationa"",
    ""source"": ""Assemblee nationale"",
    ""date_promulgation"": null,
    ""url_dossier"": ""https://www.assemblee-nationale.fr/dyn/16/dossiers/TON_DOSSIER"",
    ""url_texte_integral"": ""https://www.assemblee-nationale.fr/dyn/16/textes/TON_TEXTE"",
    ""url_expose_motifs"": null,
    ""resume_etendu"": ""Ce projet de loi vise a ... (resumé de test genere via setup_lois_textes.bat). Modifie ce texte ensuite.""
  }
]
'@ | Set-Content -Encoding UTF8 'ingestion\data\lois_textes.json'"

echo ✅ lois_textes.json genere.
echo.

echo 📄 Generation du script ingestion\upsert_lois_textes_from_json.js ...

REM 3) Generer le script Node pour upserter lois_textes
powershell -Command "@'
require(""dotenv"").config();
const fs = require(""fs"");
const path = require(""path"");
const { createClient } = require(""@supabase/supabase-js"");

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(""❌ EXPO_PUBLIC_SUPABASE_URL ou EXPO_PUBLIC_SUPABASE_ANON_KEY manquant dans .env"");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  try {
    const filePath = path.join(__dirname, ""data"", ""lois_textes.json"");
    console.log(""📂 Lecture du fichier"", filePath);

    const raw = fs.readFileSync(filePath, ""utf8"");
    const rows = JSON.parse(raw);

    if (!Array.isArray(rows)) {
      throw new Error(""Le JSON doit contenir un tableau d'objets."");
    }

    console.log(`🧾 ${rows.length} loi(s) a synchroniser dans lois_textes…`);

    for (const row of rows) {
      const {
        loi_id,
        source,
        date_promulgation,
        url_dossier,
        url_texte_integral,
        url_expose_motifs,
        resume_etendu,
      } = row;

      if (!loi_id) {
        console.warn(""⚠ Ligne ignoree (pas de loi_id) :"", row);
        continue;
      }

      console.log(`➡ Upsert loi_id = ${loi_id}`);

      const { error } = await supabase.from(""lois_textes"").upsert(
        {
          loi_id,
          source: source ?? null,
          date_promulgation: date_promulgation ?? null,
          url_dossier: url_dossier ?? null,
          url_texte_integral: url_texte_integral ?? null,
          url_expose_motifs: url_expose_motifs ?? null,
          resume_etendu: resume_etendu ?? null,
        },
        { onConflict: ""loi_id"" }
      );

      if (error) {
        console.error(""❌ Erreur upsert lois_textes pour"", loi_id, error);
      } else {
        console.log(`✅ lois_textes mis a jour pour ${loi_id}`);
      }
    }

    console.log(""🎉 Synchronisation lois_textes terminee."");
  } catch (e) {
    console.error(""💥 Erreur dans le script upsert_lois_textes_from_json:"", e);
    process.exit(1);
  }
}

main();
'@ | Set-Content -Encoding UTF8 'ingestion\upsert_lois_textes_from_json.js'"

echo ✅ Script upsert_lois_textes_from_json.js genere.
echo.
echo 💡 Prochaine etape :
echo   1) Verifie / edite ingestion\data\lois_textes.json
echo   2) Lance :  node ingestion\upsert_lois_textes_from_json.js
echo.

pause
endlocal
