const fs = require("fs");

const path = "ingestion/fetch_dossier_an.cjs";
const s = fs.readFileSync(path, "utf8");

let line = 1, col = 0;
const st = [];
const open = "{([";
const close = "})]";
const match = { "}": "{", ")": "(", "]": "[" };

let inS = false, inD = false, inT = false, esc = false;

for (let i = 0; i < s.length; i++) {
  const ch = s[i];
  col++;

  if (ch === "\n") { line++; col = 0; }

  if (esc) { esc = false; continue; }

  if (ch === "\\") {
    if (inS || inD || inT) esc = true;
    continue;
  }

  if (!inD && !inT && ch === "'") { inS = !inS; continue; }
  if (!inS && !inT && ch === '"') { inD = !inD; continue; }
  if (!inS && !inD && ch === "`") { inT = !inT; continue; }

  if (inS || inD || inT) continue;

  if (open.includes(ch)) {
    st.push({ ch, line, col });
    continue;
  }

  if (close.includes(ch)) {
    const need = match[ch];
    const top = st.pop();
    if (!top || top.ch !== need) {
      console.log("MISMATCH", { at: { line, col, ch }, need, got: top ? top.ch : null });
      process.exit(0);
    }
  }
}

if (st.length) {
  const last = st[st.length - 1];
  console.log("UNCLOSED", last, "stack_size", st.length);
} else {
  console.log("OK: no unclosed braces");
}
