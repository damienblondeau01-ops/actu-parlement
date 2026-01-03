const fs = require("fs");

const path = "ingestion/fetch_dossier_an.cjs";
const s = fs.readFileSync(path, "utf8");

let line = 1, col = 0;

let inS = false;      // '
let inD = false;      // "
let inT = false;      // `
let inLineC = false;  // //
let inBlockC = false; // /* */
let esc = false;

for (let i = 0; i < s.length; i++) {
  const ch = s[i];
  const next = s[i + 1] || "";

  col++;
  if (ch === "\n") {
    line++; col = 0;
    inLineC = false; // fin de // à la fin de ligne
    continue;
  }

  // si dans //, ignorer tout jusqu'à fin de ligne
  if (inLineC) continue;

  // si dans /* */, chercher la fermeture
  if (inBlockC) {
    if (ch === "*" && next === "/") {
      inBlockC = false;
      i++; col++;
    }
    continue;
  }

  // gestion escape dans strings/templates
  if (esc) { esc = false; continue; }
  if ((inS || inD || inT) && ch === "\\") { esc = true; continue; }

  // si dans string/template, ne pas interpréter commentaires/braces
  if (inS) { if (ch === "'") inS = false; continue; }
  if (inD) { if (ch === '"') inD = false; continue; }
  if (inT) { if (ch === "`") inT = false; continue; }

  // Début commentaires
  if (ch === "/" && next === "/") { inLineC = true; i++; col++; continue; }
  if (ch === "/" && next === "*") { inBlockC = true; i++; col++; continue; }

  // Début strings
  if (ch === "'") { inS = true; continue; }
  if (ch === '"') { inD = true; continue; }
  if (ch === "`") { inT = true; continue; }
}

if (inBlockC) console.log("UNCLOSED_BLOCK_COMMENT at EOF");
else if (inT) console.log("UNCLOSED_TEMPLATE_STRING ` at EOF");
else if (inS) console.log("UNCLOSED_SINGLE_QUOTE ' at EOF");
else if (inD) console.log('UNCLOSED_DOUBLE_QUOTE \" at EOF');
else console.log("OK: no unclosed strings/comments detected");
