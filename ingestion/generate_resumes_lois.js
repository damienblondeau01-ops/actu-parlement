// ingestion/generate_resumes_lois.js
/**
 * Génère automatiquement :
 *  - resume_court
 *  - points_cles (array)
 *
 * pour les entrées de "textes_lois" qui ont un texte_integral mais pas encore de résumé.
 */

require("dotenv").config({ path: __dirname + "/.env" });
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

// ---------- CONFIG SUPABASE ----------
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans ingestion/.env."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ---------- CONFIG OPENAI ----------
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY manquant dans ingestion/.env.");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------- LOGIQUE MÉTIER ----------

async function fetchTextesSansResume(limit = 20) {
  console.log("🔍 Recherche des textes de loi sans résumé IA...");

  const { data, error } = await supabase
    .from("textes_lois")
    .select("id, loi_id, titre, texte_integral, resume_court")
    .not("texte_integral", "is", null)
    .is("resume_court", null)
    .limit(limit);

  if (error) {
    throw new Error("Erreur récupération textes_lois : " + error.message);
  }

  console.log(`➡️ ${data.length} texte(s) à traiter.`);
  return data;
}

function buildPrompt(texteLoi) {
  const titre = texteLoi.titre || "Texte de loi";
  const brut = texteLoi.texte_integral || "";

  const maxChars = 8000;
  const extrait =
    brut.length > maxChars ? brut.slice(0, maxChars) + " [...]" : brut;

  return `
Tu es un assistant spécialisé en analyse législative française.

À partir du texte de loi ci-dessous, produis :

1) "resume_court" : un résumé clair, en français, de 3 phrases maximum.
2) "points_cles" : un tableau JSON de 3 à 6 puces synthétiques (chaque élément est une phrase courte).

Le résultat DOIT être un JSON valide STRICTEMENT de la forme :

{
  "resume_court": "…",
  "points_cles": ["…", "…", "..."]
}

Ne rajoute aucun autre champ, aucun texte avant ou après.

Titre : "${titre}"

Texte (éventuellement tronqué) :
"""${extrait}"""
`;
}

async function genererResumePourTexte(texteLoi) {
  console.log(`🧠 Génération IA pour textes_lois.id=${texteLoi.id}...`);

  const prompt = buildPrompt(texteLoi);

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
    max_output_tokens: 600,
  });

  const raw =
    response.output?.[0]?.content?.[0]?.text ??
    JSON.stringify({
      resume_court: "",
      points_cles: [],
    });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("❌ Impossible de parser la réponse IA en JSON. Réponse brute :");
    console.error(raw);
    throw e;
  }

  if (
    typeof parsed.resume_court !== "string" ||
    !Array.isArray(parsed.points_cles)
  ) {
    throw new Error(
      "Réponse IA mal formatée : resume_court doit être string et points_cles un array."
    );
  }

  return {
    resume_court: parsed.resume_court.trim(),
    points_cles: parsed.points_cles.map((p) => String(p).trim()),
  };
}

async function saveResume(texteId, { resume_court, points_cles }) {
  const { error } = await supabase
    .from("textes_lois")
    .update({
      resume_court,
      points_cles,
    })
    .eq("id", texteId);

  if (error) {
    throw new Error(
      `Erreur update textes_lois pour id=${texteId} : ` + error.message
    );
  }

  console.log(`💾 Résumé enregistré pour textes_lois.id=${texteId}`);
}

async function main() {
  console.log("🚀 Script generate_resumes_lois démarré");

  try {
    const textes = await fetchTextesSansResume(20);

    if (!textes.length) {
      console.log("ℹ️ Aucun texte à traiter, tout est déjà résumé ✅");
      return;
    }

    for (const t of textes) {
      try {
        const resume = await genererResumePourTexte(t);
        await saveResume(t.id, resume);
      } catch (err) {
        console.error(
          `⚠️ Erreur lors du traitement de textes_lois.id=${t.id} :`,
          err.message
        );
      }
    }

    console.log("✅ Script generate_resumes_lois terminé.");
  } catch (e) {
    console.error("❌ Script generate_resumes_lois échoué :", e);
    process.exit(1);
  }
}

main();
