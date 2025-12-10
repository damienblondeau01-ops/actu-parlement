// scripts/fill_textes_lois.js
// Script pour pré-remplir la table textes_lois à partir de scrutins_app

require("dotenv").config(); // lit .env
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- Étape 1 : récupérer les lois (loi_id) sans texte associé ---
// On part de scrutins_app (ta vue principale)
// On prend les scrutins les plus récents, on garde ceux avec un loi_id non nul,
// on dédoublonne par loi_id, puis on enlève ceux déjà présents dans textes_lois.

async function getLoisSansTexte(limit = 100) {
  console.log("📥 Lecture des scrutins dans scrutins_app...");

  const { data: scrutins, error } = await supabase
    .from("scrutins_app")
    .select("id, loi_id, titre, objet, date_scrutin")
    .order("date_scrutin", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("❌ Erreur lecture scrutins_app:", error);
    throw error;
  }

  if (!scrutins || scrutins.length === 0) {
    console.log("ℹ️ Aucun scrutin trouvé dans scrutins_app.");
    return [];
  }

  // On garde uniquement ceux qui ont un loi_id
  const withLoiId = scrutins.filter((s) => s.loi_id !== null);

  if (withLoiId.length === 0) {
    console.log("ℹ️ Aucun scrutin avec loi_id non nul.");
    return [];
  }

  // Dédoublonnage par loi_id (on garde le plus récent)
  const map = new Map();
  for (const s of withLoiId) {
    if (!map.has(s.loi_id)) {
      map.set(s.loi_id, s);
    }
  }

  const lois = Array.from(map.values());
  const loiIds = lois.map((l) => l.loi_id);

  console.log(`📚 ${lois.length} loi(s) distincte(s) trouvée(s) dans scrutins_app.`);

  // On regarde lesquelles ont déjà un texte associé
  const { data: deja, error: errDeja } = await supabase
    .from("textes_lois")
    .select("loi_id")
    .in("loi_id", loiIds);

  if (errDeja) {
    console.error("❌ Erreur lecture textes_lois:", errDeja);
    throw errDeja;
  }

  const dejaSet = new Set((deja || []).map((l) => l.loi_id));

  const sansTexte = lois.filter((l) => !dejaSet.has(l.loi_id));

  console.log(
    `🔎 ${sansTexte.length} loi(s) sans entrée dans textes_lois (sur ${lois.length}).`
  );

  return sansTexte;
}

// --- Étape 2 : fonction temporaire (fake) qui crée un texte fictif ---
// On mettra la vraie source plus tard (Legifrance / AN / fichiers locaux…)

async function fetchTexteOfficiel(loi) {
  const loiId = loi.loi_id;

  return {
    loi_id: loiId,
    titre: loi.titre || loi.objet || `Texte ${loiId}`,
    source_url: null, // à remplir plus tard avec l'URL officielle
    texte_integral: `Texte intégral (FAKE) pour la loi ${loiId}.\n\nÀ ce stade, la vraie source de texte n'est pas encore branchée.`,
    resume_court: `Résumé temporaire pour la loi ${loiId}. Cette entrée a été générée automatiquement pour tester le pipeline.`,
    points_cles: [
      "Point clé 1 (fake) : pipeline Supabase ✔️",
      "Point clé 2 (fake) : table textes_lois remplie automatiquement ✔️",
      "Point clé 3 (fake) : reste à brancher la vraie source de texte ✔️",
    ],
  };
}

// --- Étape 3 : insertion dans textes_lois ---

async function insertTexte(record) {
  const { data, error } = await supabase
    .from("textes_lois")
    .insert(record)
    .select("id, loi_id");

  if (error) {
    console.error(
      `❌ Erreur insertion textes_lois pour loi_id=${record.loi_id}:`,
      error
    );
    return null;
  }

  return data?.[0] || null;
}

// --- Script principal avec gestion d'erreur globale ---

async function main() {
  console.log("🚀 Script textes_lois démarré...");

  const lois = await getLoisSansTexte(100);

  if (lois.length === 0) {
    console.log("✅ Aucune nouvelle loi à traiter (tout a déjà un texte).");
    return;
  }

  for (const loi of lois) {
    console.log(
      `\n➡️ Loi loi_id=${loi.loi_id} · titre="${loi.titre || loi.objet || "Sans titre"}"`
    );

    try {
      const contenu = await fetchTexteOfficiel(loi);
      const inserted = await insertTexte(contenu);

      if (inserted) {
        console.log(
          `   ✅ Texte inséré (id=${inserted.id}) pour loi_id=${inserted.loi_id}`
        );
      } else {
        console.log("   ⚠️ Insertion non confirmée (voir logs d'erreur ci-dessus).");
      }
    } catch (err) {
      console.error("   ❌ Erreur pendant le traitement de cette loi:", err);
    }
  }

  console.log("\n🏁 Script terminé.");
}

main().catch((err) => {
  console.error("💥 Erreur fatale dans le script:", err);
  process.exit(1);
});
