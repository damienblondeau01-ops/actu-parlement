// scripts/generate_resumes_lois.js
// Génère (ou régénère) resume_court + points_cles pour les lois
// à partir de textes_lois.texte_integral

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

// --- Config Supabase ---

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- Config OpenAI ---

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY manquant dans .env");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// --- Étape 1 : récupérer les lois à traiter ---
// Version simple : on prend jusqu'à 10 lignes avec texte_integral non null,
// et on (ré)écrit systématiquement resume_court + points_cles.

async function getLoisASummariser(limit = 10) {
  console.log("📥 Lecture des lois avec texte_integral dans textes_lois...");

  const { data, error } = await supabase
    .from("textes_lois")
    .select("id, loi_id, titre, texte_integral, resume_court, points_cles")
    .not("texte_integral", "is", null)
    .order("id", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("❌ Erreur lecture textes_lois:", error);
    throw error;
  }

  if (!data || data.length === 0) {
    console.log("ℹ️ Aucune ligne avec texte_integral trouvé.");
    return [];
  }

  console.log(`📚 ${data.length} loi(s) à (re)résumer.`);
  return data;
}

// --- Étape 2 : appeler l'IA pour générer résumé + points clés ---

async function generateSummaryForLaw(loi) {
  const titre = loi.titre || `Loi ${loi.loi_id || loi.id}`;
  const texte = loi.texte_integral;

  if (!texte || texte.trim().length < 50) {
    console.log(
      `   ⚠️ texte_integral trop court ou vide pour id=${loi.id}, loi_id=${loi.loi_id}`
    );
    return null;
  }

  const maxChars = 12000;
  const texteTronque =
    texte.length > maxChars ? texte.slice(0, maxChars) + "\n\n[Texte tronqué]" : texte;

  console.log(`   🤖 Appel OpenAI pour loi_id=${loi.loi_id}...`);

  const prompt = `
Tu es un assistant juridique qui résume des textes de loi français pour un grand public.
Tu dois produire :
1) un résumé clair en français, 5 à 10 phrases maximum.
2) une liste de 3 à 6 points clés (bullet points) très concrets.

Contraintes :
- Langage simple mais précis, éviter le jargon juridique inutile.
- S'adresser à un lecteur curieux de politique mais pas expert.
- Pas d'opinion, pas de prise de position politique.
- Ne pas inventer d'informations qui ne sont pas dans le texte.

Titre de la loi : "${titre}"

Texte de la loi (ou extrait) :
"""${texteTronque}"""

Réponds STRICTEMENT au format JSON compact, sans texte autour, sous la forme :
{
  "resume_court": "texte du résumé en un seul bloc",
  "points_cles": [
    "point clé 1",
    "point clé 2",
    "point clé 3"
  ]
}
`;

  try {
    const completion = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const raw = completion.output[0].content[0].text;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("   ❌ Erreur parse JSON retour OpenAI, texte brut renvoyé :", raw);
      return null;
    }

    if (!parsed || typeof parsed.resume_court !== "string" || !Array.isArray(parsed.points_cles)) {
      console.error("   ❌ Format JSON invalide :", parsed);
      return null;
    }

    const resume_court = parsed.resume_court.trim();
    const points_cles = parsed.points_cles.map((p) => String(p).trim()).filter(Boolean);

    return { resume_court, points_cles };
  } catch (err) {
    console.error("   ❌ Erreur appel OpenAI:", err);
    return null;
  }
}

// --- Étape 3 : mise à jour dans Supabase ---

async function updateLoiSummary(id, resume_court, points_cles) {
  const { error } = await supabase
    .from("textes_lois")
    .update({ resume_court, points_cles })
    .eq("id", id);

  if (error) {
    console.error(`   ❌ Erreur mise à jour textes_lois.id=${id}:`, error);
    return false;
  }

  return true;
}

// --- Script principal ---

async function main() {
  console.log("🚀 Script generate_resumes_lois démarré...");

  const lois = await getLoisASummariser(10);

  if (lois.length === 0) {
    console.log("✅ Rien à faire pour le moment.");
    return;
  }

  for (const loi of lois) {
    console.log(
      `\n➡️ Loi id=${loi.id}, loi_id=${loi.loi_id}, titre="${loi.titre || ""}"`
    );

    const summary = await generateSummaryForLaw(loi);

    if (!summary) {
      console.log("   ⚠️ Résumé non généré, loi ignorée.");
      continue;
    }

    const ok = await updateLoiSummary(
      loi.id,
      summary.resume_court,
      summary.points_cles
    );

    if (ok) {
      console.log("   ✅ Résumé + points clés enregistrés en base.");
    } else {
      console.log("   ⚠️ Échec enregistrement en base.");
    }
  }

  console.log("\n🏁 Script generate_resumes_lois terminé.");
}

main().catch((err) => {
  console.error("💥 Erreur fatale dans generate_resumes_lois:", err);
  process.exit(1);
});
