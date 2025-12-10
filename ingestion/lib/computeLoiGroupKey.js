function normalizeBase(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function computeLoiGroupKey(titre, objet, type_texte) {
  const srcRaw = titre || objet || "";
  const srcNorm = normalizeBase(srcRaw);
  if (!srcNorm) return null;

  let base = srcNorm
    .replace(/l'?amendement n°?\s*\d+[^\w]+(de|de la|de l'|du|apres|après|sur)\s+/, "")
    .replace(/^amendement n°?\s*\d+\s*:/, "");

  const lawPatterns = [
    /(proposition de loi[^:;.,]*)/,
    /(projet de loi[^:;.,]*)/,
    /(proposition de resolution[^:;.,]*)/,
    /(projet de loi de finances[^:;.,]*)/,
  ];

  for (const re of lawPatterns) {
    const m = base.match(re);
    if (m) {
      base = m[1];
      break;
    }
  }

  if (!base) base = srcNorm;

  if (type_texte) {
    const tNorm = normalizeBase(type_texte);
    if (tNorm && !base.startsWith(tNorm)) {
      base = tNorm + " " + base;
    }
  }

  const slug = base
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || null;
}

module.exports = { computeLoiGroupKey };
