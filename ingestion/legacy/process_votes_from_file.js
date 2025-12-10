// ingestion/process_votes_from_file.js
// Exploration des votes dans Scrutins.json.zip
// ➜ AUCUNE écriture en base pour l'instant, on log juste la structure.

const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip"); // déjà installé

const ZIP_PATH = path.join(__dirname, "Scrutins.json.zip");

function logSeparator() {
  console.log("\n========================================\n");
}

function safeJsonPreview(obj, maxLen = 800) {
  try {
    const txt = JSON.stringify(obj, null, 2);
    return txt.length > maxLen ? txt.slice(0, maxLen) + "\n... (tronqué)" : txt;
  } catch {
    return "[objet non sérialisable]";
  }
}

function main() {
  console.log("📂 Lecture du fichier ZIP local :", ZIP_PATH);

  if (!fs.existsSync(ZIP_PATH)) {
    console.error("❌ Fichier ZIP introuvable :", ZIP_PATH);
    process.exit(1);
  }

  const stat = fs.statSync(ZIP_PATH);
  console.log("💾 Taille du ZIP (octets) :", stat.size);

  const zip = new AdmZip(ZIP_PATH);
  const allEntries = zip.getEntries();

  console.log("📦 Nombre d’entrées dans le ZIP :", allEntries.length);

  // On garde uniquement les fichiers JSON (pas les dossiers)
  const jsonEntries = allEntries.filter(
    (e) => !e.isDirectory && e.entryName.toLowerCase().endsWith(".json")
  );

  console.log("📄 Nombre de fichiers JSON :", jsonEntries.length);

  if (jsonEntries.length === 0) {
    console.error("⚠️ Aucun fichier JSON trouvé dans le ZIP, arrêt.");
    return;
  }

  // On ne regarde que quelques scrutins pour l’instant (5 max)
  const toInspect = jsonEntries.slice(0, 5);

  toInspect.forEach((entry, index) => {
    logSeparator();
    console.log(`🔎 Fichier #${index + 1} : ${entry.entryName}`);

    let text;
    try {
      text = entry.getData().toString("utf8");
    } catch (e) {
      console.error("⚠️ Impossible de lire cette entrée :", e.message);
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error("⚠️ JSON.parse échoué pour ce fichier :", e.message);
      return;
    }

    const rootKeys = Object.keys(parsed);
    console.log("   🔑 Clés racine :", rootKeys.join(", "));

    if (!parsed.scrutin) {
      console.warn("⚠️ Pas de clé 'scrutin' dans ce JSON, on passe.");
      return;
    }

    const s = parsed.scrutin;

    console.log("   ▶ uid          :", s.uid);
    console.log("   ▶ numero       :", s.numero);
    console.log("   ▶ dateScrutin  :", s.dateScrutin);
    console.log("   ▶ organeRef    :", s.organeRef);
    console.log("   ▶ legislature  :", s.legislature);

    console.log("   🔑 Clés de 'scrutin' :", Object.keys(s).join(", "));

    // --- 1) Ventilation globale des votes ---
    if (s.ventilationVotes) {
      console.log("   ✅ 'ventilationVotes' présent.");
      try {
        console.log(
          "   🔑 Clés ventilationVotes :",
          Object.keys(s.ventilationVotes).join(", ")
        );
      } catch {
        console.log(
          "   (ventilationVotes n'est pas un objet simple, type =",
          typeof s.ventilationVotes,
          ")"
        );
      }

      if (s.ventilationVotes.decompteVoix) {
        console.log(
          "   🔹 Clés de 'decompteVoix' :",
          Object.keys(s.ventilationVotes.decompteVoix).join(", ")
        );
        console.log(
          "   🧩 Aperçu de decompteVoix :\n",
          safeJsonPreview(s.ventilationVotes.decompteVoix)
        );
      }
    } else {
      console.log("   ❌ Pas de 'ventilationVotes'.");
    }

    // --- 2) Votes par groupe / par député (si présent) ---
    // Selon la structure réelle, ça peut s’appeler :
    // - ventilationGroupes
    // - groupes
    // - or organes / organe / groupes / decompteNominatif, etc.
    if (s.ventilationGroupes) {
      console.log("   ✅ 'ventilationGroupes' présent.");
      console.log(
        "   🧩 Aperçu ventilationGroupes :\n",
        safeJsonPreview(s.ventilationGroupes)
      );
    }

    if (s.groupes) {
      console.log("   ✅ 'groupes' présent dans le scrutin.");
      console.log(
        "   🧩 Aperçu groupes :\n",
        safeJsonPreview(s.groupes)
      );
    }

    // Certains formats AN ont un truc du style:
    // s.organes.organe[].groupes.groupe[].deputes.depute[]
    if (s.organes) {
      console.log("   ✅ 'organes' présent.");
      console.log(
        "   🔑 Clés 'organes' :",
        Object.keys(s.organes).join(", ")
      );

      // On essaie de descendre un peu sans aller trop loin
      try {
        const organes = s.organes.organe || s.organes.organes || null;
        if (Array.isArray(organes) && organes.length > 0) {
          console.log(
            "   🧩 Exemple organes[0] (tronqué) :\n",
            safeJsonPreview(organes[0])
          );
        }
      } catch (e) {
        console.log("   ⚠️ Impossible d'explorer 'organes' :", e.message);
      }
    }

    console.log("   ✅ Fin inspection de ce scrutin.");
  });

  logSeparator();
  console.log("✅ Inspection terminée. Regarde les blocs ci-dessus pour repérer où sont les votes nominaux.");
}

main();
