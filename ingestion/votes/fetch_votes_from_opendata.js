// ingestion/fetch_votes_from_opendata.js
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { fileURLToPath } from "url";
import "dotenv/config";
import { supabase } from "./supabase_ingest_client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🎯 Législature passée en argument : 16 (par défaut) ou 17
const legislatureArg = process.argv[2];
const LEGISLATURE = legislatureArg || "16";

if (!["16", "17"].includes(LEGISLATURE)) {
  console.error(
    `❌ Législature invalide "${LEGISLATURE}". Utilise 16 ou 17 (ex: node ingestion/fetch_votes_from_opendata.js 17)`
  );
  process.exit(1);
}

// Petit helper
const toArray = (x) => {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
};

/**
 * Essaye d'extraire les votes nominaux d'un scrutin JSON OpenData AN
 */
function extractVotesFromScrutin(scrutin, debug = false) {
  const votes = [];

  const ventilation = scrutin.ventilationVotes;
  if (!ventilation) {
    if (debug) {
      console.log("  [DEBUG] Pas de ventilationVotes pour ce scrutin");
    }
    return votes;
  }

  let organes = ventilation.organe;
  if (!organes) {
    if (debug) {
      console.log("  [DEBUG] Pas de ventilationVotes.organe");
    }
    return votes;
  }

  organes = toArray(organes);

  if (debug) {
    console.log(
      "  [DEBUG] Nb organes dans ventilationVotes.organe =",
      organes.length
    );
  }

  // Pour ne pas spammer, on ne log la structure détaillée de voteNode
  // que pour le tout premier groupe du scrutin en mode debug.
  let debugGroupLogged = false;

  for (const org of organes) {
    if (!org) continue;

    // Certains JSON ont org.groupes.groupe, d'autres org.groupe directement
    const groupesNode =
      org.groupes ??
      org.groupesParlementaires ??
      org.groupesPolitiques ??
      org.groupe ??
      null;

    if (!groupesNode) {
      if (debug) {
        console.log("    [DEBUG] Aucun noeud groupes/* pour cet organe");
      }
      continue;
    }

    let groupes = [];
    if (Array.isArray(groupesNode)) {
      groupes = groupesNode;
    } else if (groupesNode.groupe) {
      groupes = toArray(groupesNode.groupe);
    } else {
      groupes = toArray(groupesNode);
    }

    if (debug) {
      console.log(
        "    [DEBUG] Nb groupes trouvés dans cet organe =",
        groupes.length
      );
      if (groupes.length > 0) {
        console.log(
          "    [DEBUG] Clés du premier groupe :",
          Object.keys(groupes[0] || {})
        );
      }
    }

    for (const g of groupes) {
      if (!g) continue;

      const groupeLabel =
        g.libelleAbrege ??
        g.libelle ??
        g.nom ??
        g.organeRef ??
        org.organeRef ??
        "Groupe inconnu";

      const groupeAbrev = g.libelleAbrege ?? null;
      const groupeNomComplet =
        g.libelle ?? g.nom ?? groupeLabel ?? "Groupe inconnu";

      const voteNode = g.vote ?? g.votes ?? null;
      if (!voteNode) {
        if (debug) {
          console.log(
            "      [DEBUG] Pas de g.vote / g.votes pour le groupe",
            groupeLabel
          );
        }
        continue;
      }

      // 🔍 Log structure de voteNode lors du premier passage en debug
      if (debug && !debugGroupLogged) {
        debugGroupLogged = true;
        try {
          console.log(
            "      [DEBUG] Clés voteNode :",
            Object.keys(voteNode || {})
          );

          if (voteNode.decompteNominatif) {
            console.log(
              "      [DEBUG] Clés voteNode.decompteNominatif :",
              Object.keys(voteNode.decompteNominatif || {})
            );
          }
          if (voteNode.decompteNominatifParDelegation) {
            console.log(
              "      [DEBUG] Clés voteNode.decompteNominatifParDelegation :",
              Object.keys(voteNode.decompteNominatifParDelegation || {})
            );
          }
          if (voteNode.decompteNominatifParGroupe) {
            console.log(
              "      [DEBUG] Clés voteNode.decompteNominatifParGroupe :",
              Object.keys(voteNode.decompteNominatifParGroupe || {})
            );
          }
        } catch (e) {
          console.log("      [DEBUG] Impossible d'inspecter voteNode :", e);
        }
      }

      const decompte =
        voteNode.decompteNominatif ??
        voteNode.decompteNominatifParDelegation ??
        voteNode.decompteNominatifParGroupe ??
        null;

      if (!decompte) {
        if (debug) {
          console.log(
            "      [DEBUG] Pas de decompteNominatif* pour le groupe",
            groupeLabel
          );
        }
        continue;
      }

      // 🔑 On parcourt explicitement nonVotants / pours / contres / abstentions
      const blocs = [
        { key: "pours", label: "Pour" },
        { key: "contres", label: "Contre" },
        { key: "abstentions", label: "Abstention" },
        { key: "nonVotants", label: "Non votant" },
      ];

      let totalDeputesBloc = 0;

      for (const bloc of blocs) {
        const blocNode = decompte[bloc.key];
        if (!blocNode) continue;

        // Les députés peuvent être sous blocNode.depute / blocNode.deputes / blocNode.votant
        let deputes =
          blocNode.depute ??
          blocNode.deputes ??
          blocNode.votant ??
          null;

        // Certains formats peuvent avoir directement un tableau d'objets
        if (!deputes && Array.isArray(blocNode)) {
          deputes = blocNode;
        }

        const deputesArr = toArray(deputes);

        if (debug) {
          console.log(
            `      [DEBUG] Bloc ${bloc.key} → nb députés =`,
            deputesArr.length
          );
        }

        totalDeputesBloc += deputesArr.length;

        for (const dep of deputesArr) {
          if (!dep) continue;

          // 🔑 ID AN du député (clé pour la fiche député)
          const actor =
            dep.acteurRef ??
            dep.uid ??
            dep.mandatRef ??
            dep.deputeRef ??
            dep.acteur?.uid ??
            dep.acteur?.acteurRef ??
            null;

          const nom =
            dep.nom ??
            dep.nomComplet ??
            dep.nom_depute ??
            dep.prenomNom ??
            "Député inconnu";

          const rawPos =
            dep.vote ??
            dep.positionVote ??
            dep.sensVote ??
            dep.typeVote ??
            "";

          let positionLabel = bloc.label;

          const p = String(rawPos).toLowerCase();
          if (p.includes("pour")) positionLabel = "Pour";
          else if (p.includes("contre")) positionLabel = "Contre";
          else if (p.includes("abst")) positionLabel = "Abstention";
          else if (p.includes("non vot") || p.includes("nv"))
            positionLabel = "Non votant";

          votes.push({
            // 🧱 Champs alignés avec votes_deputes_scrutin / votes_par_scrutin_detail
            legislature: LEGISLATURE,
            numero_scrutin: String(scrutin.numero),
            scrutin_id: String(scrutin.numero ?? ""),
            id_depute: actor, // → exposé comme depute_an_id dans la vue
            groupe: groupeLabel,
            groupe_nom: groupeNomComplet,
            groupe_abrev: groupeAbrev,
            fonction:
              dep.fonction ??
              dep.qualite ??
              dep.fonctionDeVote ??
              null,
            vote: rawPos ? String(rawPos) : positionLabel,
            position: positionLabel,
            nom_depute: nom,
            url_depute: dep.url ?? dep.lien ?? null,
          });
        }
      }

      // ⚠️ Fallback legacy (si jamais les blocs ne contiennent rien)
      if (totalDeputesBloc === 0) {
        let deputes =
          decompte.depute ??
          decompte.deputes ??
          decompte.votant ??
          null;

        if (!deputes && decompte.parDelegation) {
          deputes =
            decompte.parDelegation.depute ??
            decompte.parDelegation.votant ??
            null;
        }

        const deputesArr = toArray(deputes);
        if (debug) {
          console.log(
            "      [DEBUG] Nb députés trouvés (fallback) dans ce groupe =",
            deputesArr.length
          );
        }

        for (const dep of deputesArr) {
          if (!dep) continue;

          const actor =
            dep.acteurRef ??
            dep.uid ??
            dep.mandatRef ??
            dep.deputeRef ??
            dep.acteur?.uid ??
            dep.acteur?.acteurRef ??
            null;

          const nom =
            dep.nom ??
            dep.nomComplet ??
            dep.nom_depute ??
            dep.prenomNom ??
            "Député inconnu";

          const rawPos =
            dep.vote ??
            dep.positionVote ??
            dep.sensVote ??
            dep.typeVote ??
            "";

          const p = String(rawPos).toLowerCase();
          let positionLabel = "Non votant";

          if (p.includes("pour")) positionLabel = "Pour";
          else if (p.includes("contre")) positionLabel = "Contre";
          else if (p.includes("abst")) positionLabel = "Abstention";
          else if (p.includes("non vot") || p.includes("nv"))
            positionLabel = "Non votant";

          votes.push({
            legislature: LEGISLATURE,
            numero_scrutin: String(scrutin.numero),
            scrutin_id: String(scrutin.numero ?? ""),
            id_depute: actor,
            groupe: groupeLabel,
            groupe_nom: groupeNomComplet,
            groupe_abrev: groupeAbrev,
            fonction:
              dep.fonction ??
              dep.qualite ??
              dep.fonctionDeVote ??
              null,
            vote: rawPos ? String(rawPos) : positionLabel,
            position: positionLabel,
            nom_depute: nom,
            url_depute: dep.url ?? dep.lien ?? null,
          });
        }
      }
    }
  }

  if (debug) {
    console.log(
      `  [DEBUG] Scrutin ${scrutin.numero} → votes extraits = ${votes.length}`
    );
  }

  return votes;
}

async function main() {
  console.log(
    "🚀 Import des votes nominaux depuis Scrutins.json.zip (Open Data AN)"
  );
  console.log("   Législature :", LEGISLATURE);

  const DATA_DIR = path.join(__dirname, "..", "data");
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const ZIP_PATH = path.join(DATA_DIR, "Scrutins.json.zip");

  // ✅ URL paramétrée par législature
  const URL = `http://data.assemblee-nationale.fr/static/openData/repository/${LEGISLATURE}/loi/scrutins/Scrutins.json.zip`;

  console.log("📡 Téléchargement Scrutins.json.zip depuis l’Assemblée Nationale…");
  console.log("   URL :", URL);

  const resp = await fetch(URL);
  if (!resp.ok) {
    throw new Error(`Échec du téléchargement (${resp.status}) ${resp.statusText}`);
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(ZIP_PATH, buf);
  console.log(
    `💾 ZIP téléchargé et enregistré dans ${ZIP_PATH} (${buf.length} octets)`
  );

  console.log("📦 Lecture du ZIP et extraction du JSON…");
  const zip = new AdmZip(ZIP_PATH);
  const entries = zip.getEntries();

  const jsonEntries = entries.filter((e) =>
    e.entryName.toLowerCase().endsWith(".json")
  );

  console.log(
    "   → Fichiers JSON trouvés dans le ZIP :",
    jsonEntries.length
  );

  if (jsonEntries.length === 0) {
    console.log("⚠ Aucun fichier JSON trouvé dans le ZIP.");
    return;
  }

  // 🆕 NOUVEAU : on lit TOUS les JSON du ZIP
  let scrutins = [];

  for (const entry of jsonEntries) {
    try {
      const rawJson = entry.getData().toString("utf-8");
      const parsed = JSON.parse(rawJson);

      if (parsed.scrutins && parsed.scrutins.scrutin) {
        scrutins = scrutins.concat(toArray(parsed.scrutins.scrutin));
      } else if (parsed.scrutin) {
        scrutins = scrutins.concat(toArray(parsed.scrutin));
      } else if (Array.isArray(parsed)) {
        scrutins = scrutins.concat(parsed);
      } else {
        // format inconnu → on ignore
      }
    } catch (e) {
      console.error(
        `❌ Erreur parse JSON pour l’entrée ${entry.entryName} :`,
        e.message
      );
    }
  }

  console.log("🧮 Nombre total de scrutins détectés :", scrutins.length);

  if (scrutins.length === 0) {
    console.log("⚠ Aucun scrutin dans les JSON du ZIP. Format inattendu.");
    return;
  }

  const first = scrutins[0];
  console.log(
    "   • Clés du premier scrutin :",
    Object.keys(first || {})
  );
  if (first?.ventilationVotes) {
    console.log(
      "   • Clés ventilationVotes :",
      Object.keys(first.ventilationVotes)
    );
  }

  let allVotes = [];
  let debugDone = false;
  let scrutinsAvecVotes = 0;

  for (const s of scrutins) {
    const debug = !debugDone;
    const votesScrutin = extractVotesFromScrutin(s, debug);

    if (votesScrutin.length > 0) {
      scrutinsAvecVotes += 1;
    }

    if (debug) {
      debugDone = true;
      if (votesScrutin.length > 0) {
        console.log(
          "   • Exemple de vote extrait :",
          JSON.stringify(votesScrutin[0], null, 2)
        );
      } else {
        console.log(
          "   • Aucun vote extrait pour le scrutin de debug. On analysera au besoin plus finement."
        );
      }
    }

    allVotes = allVotes.concat(votesScrutin);
  }

  console.log(
    "📊 Votes nominaux extraits (tous scrutins confondus) :",
    allVotes.length
  );
  console.log(
    "   • Nombre de scrutins contenant au moins 1 vote :",
    scrutinsAvecVotes
  );

  if (allVotes.length === 0) {
    console.log(
      "⚠ Aucun vote extrait. Le format peut encore être légèrement différent.\n" +
        "   Garde bien ces logs, on pourra affiner au besoin."
    );
    return;
  }

  // 🔍 Diagnostic : combien de votes ont réellement un id_depute ?
  const withId = allVotes.filter((v) => v.id_depute).length;
  console.log("   • Votes avec id_depute renseigné :", withId);
  console.log("   • Votes SANS id_depute :", allVotes.length - withId);

  console.log("💾 Insertion / upsert dans la table votes_deputes_scrutin…");

  let ok = 0;
  let ko = 0;
  const BATCH_SIZE = 500;

  for (let i = 0; i < allVotes.length; i += BATCH_SIZE) {
    const batch = allVotes.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("votes_deputes_scrutin")
      .upsert(batch, {
        onConflict: "numero_scrutin,id_depute",
      });

    if (error) {
      console.error("❌ Erreur upsert batch votes :", error.message);
      ko += batch.length;
    } else {
      ok += batch.length;
    }
  }

  console.log("🎉 Fin de l’import des votes.");
  console.log(`   ✔ Votes insérés / mis à jour : ${ok}`);
  console.log(`   ✖ Votes en erreur / ignorés : ${ko}`);
}

main().catch((e) => {
  console.error("❌ Erreur fatale:", e);
  process.exit(1);
});
