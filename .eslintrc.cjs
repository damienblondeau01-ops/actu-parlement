/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["expo"],

  // On ignore les vieux fichiers exportés + scripts ingestion (pour le moment)
  ignorePatterns: [
    "export_chat/**/*",
    "ingestion/**/*"
  ]
};
