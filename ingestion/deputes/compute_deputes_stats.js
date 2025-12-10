// ingestion/compute_deputes_stats.js
// Calcule de vraies statistiques pour chaque député
// - scoreParticipation (%)
// - scoreLoyaute (% par rapport au groupe)
// - scoreMajorite (% par rapport à la majorité de l'Assemblée)

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const { createClient } = require("@supabase/supabase-js");

// --- Vérification ENV ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE manquant dans .env");
  process.exit(1);
}

console.log("URL =", SUPABASE_URL);
console.log("KEY (début) =", SUPABASE_SERVICE_ROLE.slice(0, 10));

// Client admin Supabase
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

// --- Normalisation des valeurs de vote ---
function normalizeVote(v) {
  if (!v) return "absent";
  const s = String(v).trim().toLowerCase();

  if (s.startsWith("pour")) return "pour";
  if (s.startsWith("contre")) return "contre";
  if (s.startsWith("abst")) return "abstention";

  // tout le reste (NV, NP, etc.) est considéré comme une absence
  return "absent";
}

// --- Récupérer tous les votes avec jointure sur deputes_officiels ---
async function fetchAllVotes() {
  const PAGE_SIZE = 1000;
  let from = 0;
  let all = [];

  console.log("📥 Chargement des votes depuis la table votes_deputes…");

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("votes_deputes")
      .select(
        `
        id,
        scrutin_id,
        vote,
        deputes_officiels (
          id,
          groupe
        )
      `
      )
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("❌ Erreur Supabase (votes_deputes) :", error);
      throw error;
    }

    if (!data || data.length === 0) break;

    all = all.concat(data);
    console.log(`  ➕ ${data.length} votes chargés (total = ${all.length})`);

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  console.log(`✅ Total votes chargés : ${all.length}`);
  return all;
}

async function run() {
  try {
    const votes = await fetchAllVotes();

    if (!votes.length) {
      console.log("ℹ️ Aucun vote trouvé, rien à calculer.");
      return;
    }

    // --- Structures pour les stats ---
    const perDeputy = new Map(); // id_depute -> stats
    const perScrutinGlobal = new Map(); // scrutin_id -> { pour, contre, abstention }
    const perScrutinGroup = new Map(); // scrutin_id -> { groupe -> { pour, contre, abstention } }

    // --- 1ère passe : compter les votes par scrutin / groupe + initialiser les députés ---
    for (const row of votes) {
      const deputyRow = row.deputes_officiels;
      if (!deputyRow || !deputyRow.id) {
        console.warn(
          `⚠️ Vote ${row.id} sans député lié (FK deputes_officiels), ignoré.`
        );
        continue;
      }

      const deputyId = deputyRow.id;
      const group = deputyRow.groupe || "Inconnu";
      const scrutinId = row.scrutin_id;
      const vNorm = normalizeVote(row.vote);

      // init stats député
      if (!perDeputy.has(deputyId)) {
        perDeputy.set(deputyId, {
          totalVotes: 0,
          participated: 0,
          groupAlignCount: 0,
          groupEligible: 0,
          majorityAlignCount: 0,
          majorityEligible: 0,
        });
      }

      const depStats = perDeputy.get(deputyId);
      depStats.totalVotes += 1;
      if (vNorm === "pour" || vNorm === "contre" || vNorm === "abstention") {
        depStats.participated += 1;
      }

      // Comptage global par scrutin
      if (!perScrutinGlobal.has(scrutinId)) {
        perScrutinGlobal.set(scrutinId, {
          pour: 0,
          contre: 0,
          abstention: 0,
        });
      }
      const glob = perScrutinGlobal.get(scrutinId);
      if (vNorm === "pour" || vNorm === "contre" || vNorm === "abstention") {
        glob[vNorm] += 1;
      }

      // Comptage par scrutin + groupe
      if (!perScrutinGroup.has(scrutinId)) {
        perScrutinGroup.set(scrutinId, new Map());
      }
      const groupMap = perScrutinGroup.get(scrutinId);
      if (!groupMap.has(group)) {
        groupMap.set(group, { pour: 0, contre: 0, abstention: 0 });
      }
      const gStats = groupMap.get(group);
      if (vNorm === "pour" || vNorm === "contre" || vNorm === "abstention") {
        gStats[vNorm] += 1;
      }
    }

    console.log(
      `📊 Nombre de députés trouvés dans les votes : ${perDeputy.size}`
    );
    console.log(
      `📊 Nombre de scrutins avec au moins un vote : ${perScrutinGlobal.size}`
    );

    // --- Helpers pour trouver la majorité claire ---
    function getClearMajority(counts) {
      // counts = { pour, contre, abstention }
      const entries = Object.entries(counts);
      entries.sort((a, b) => b[1] - a[1]); // tri décroissant par nombre

      const [bestKey, bestVal] = entries[0];
      const [, secondVal] = entries[1];

      if (bestVal === 0) return null; // personne n'a voté
      if (bestVal === secondVal) return null; // égalité → pas de majorité claire

      return bestKey; // "pour" | "contre" | "abstention"
    }

    // --- 2ème passe : calcul alignement groupe / majorité ---
    for (const row of votes) {
      const deputyRow = row.deputes_officiels;
      if (!deputyRow || !deputyRow.id) continue;

      const deputyId = deputyRow.id;
      const group = deputyRow.groupe || "Inconnu";
      const scrutinId = row.scrutin_id;
      const vNorm = normalizeVote(row.vote);

      const depStats = perDeputy.get(deputyId);
      if (!depStats) continue;

      // On ne considère que les votes "réels"
      const isRealVote =
        vNorm === "pour" || vNorm === "contre" || vNorm === "abstention";
      if (!isRealVote) continue;

      // --- Alignement avec le groupe ---
      const groupMap = perScrutinGroup.get(scrutinId);
      const groupCounts = groupMap ? groupMap.get(group) : null;
      if (groupCounts) {
        const groupMaj = getClearMajority(groupCounts);
        if (groupMaj) {
          depStats.groupEligible += 1;
          if (vNorm === groupMaj) {
            depStats.groupAlignCount += 1;
          }
        }
      }

      // --- Alignement avec la majorité de l'Assemblée ---
      const globalCounts = perScrutinGlobal.get(scrutinId);
      if (globalCounts) {
        const globalMaj = getClearMajority(globalCounts);
        if (globalMaj) {
          depStats.majorityEligible += 1;
          if (vNorm === globalMaj) {
            depStats.majorityAlignCount += 1;
          }
        }
      }
    }

    // --- Construire les lignes à upsert ---
    const updates = [];
    for (const [deputyId, s] of perDeputy.entries()) {
      const participation =
        s.totalVotes > 0 ? (s.participated / s.totalVotes) * 100 : null;

      const loy = s.groupEligible
        ? (s.groupAlignCount / s.groupEligible) * 100
        : null;

      const maj = s.majorityEligible
        ? (s.majorityAlignCount / s.majorityEligible) * 100
        : null;

      updates.push({
        id: deputyId,
        scoreParticipation:
          participation !== null ? Math.round(participation * 10) / 10 : null,
        scoreLoyaute: loy !== null ? Math.round(loy * 10) / 10 : null,
        scoreMajorite: maj !== null ? Math.round(maj * 10) / 10 : null,
      });
    }

    console.log(
      `📝 Préparation de ${updates.length} mises à jour dans deputes_officiels…`
    );

    // --- Upsert en batch pour éviter les limites ---
    const BATCH_SIZE = 200;
    let totalUpdated = 0;

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      console.log(
        `➡️ Batch ${i / BATCH_SIZE + 1}/${Math.ceil(
          updates.length / BATCH_SIZE
        )} – ${batch.length} députés`
      );

      const { error } = await supabaseAdmin
        .from("deputes_officiels")
        .upsert(batch, {
          onConflict: "id", // id = PK → OK
        });

      if (error) {
        console.error("❌ Erreur Supabase sur ce batch :", error);
        throw error;
      }

      totalUpdated += batch.length;
    }

    console.log(
      `✅ Statistiques mises à jour pour ${totalUpdated} députés dans deputes_officiels.`
    );
    console.log("🏁 Script terminé proprement.");
  } catch (err) {
    console.error("❌ Erreur générale :", err);
    process.exit(1);
  }
}

// Lancer le script
run();
