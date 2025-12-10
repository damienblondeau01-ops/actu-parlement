# ActuDesLois – Architecture V1

## 1. Objectif de l’application

ActuDesLois est une application mobile (Expo / React Native) connectée à Supabase,
qui permet de suivre :

- les lois et scrutins de l’Assemblée nationale ;
- les votes des députés ;
- des résumés générés par IA pour certains textes.

La V1 est centrée sur :
- une **liste de lois** avec filtres ;
- une **fiche loi** claire (synthèse, structure, votes par député) ;
- une **liste de députés** ;
- une **fiche député** avec comportement de vote.

Les textes intégraux ne sont PAS systématiquement disponibles en V1 :
les résumés IA ne couvrent donc qu’une partie des lois.

---

## 2. Données & tables (Supabase)

### 2.1 Tables principales

#### `scrutins_app`

Scrutins de l’Assemblée nationale, déjà nettoyés pour l’app.

Champs principaux :

- `id` : identifiant du scrutin
- `loi_id` : identifiant logique de la loi / texte
- `titre`
- `objet`
- `type_texte`
- `date_scrutin`
- `annee`
- `numero`
- `resultat`
- `stats_pour`
- `stats_contre`
- `stats_abstention`
- `total_votes`

Utilisation :
- fiche loi (`/lois/[id]`)
- calcul de structure (articles / amendements)
- stats globales de votes.

---

#### `votes_deputes`

Votes individuels des députés.

Champs principaux :

- `scrutin_id` → lien vers `scrutins_app.id`
- `depute_row_id` → lien vers `deputes_app.row_id`
- `vote` (Pour / Contre / Abstention / autres formulations AN)

Utilisation :
- onglet “Votes par député” sur fiche loi ;
- fiche député (liste détaillée des votes) ;
- calcul des stats de comportement de vote (participation / loyauté / majorité en amont).

---

#### `deputes_app`

Liste des députés prête pour l’application.

Champs principaux :

- `row_id` : identifiant interne (clé primaire)
- `id_an` : identifiant AN (ex : `PA123456`), utilisé pour :
  - les URLs des photos AN ;
  - la navigation `/deputes/[id]`.
- `nomcomplet`
- `groupe`, `groupe_sigle`
- `scoreParticipation`
- `scoreLoyaute`
- `scoreMajorite`

Utilisation :
- liste des députés ;
- fiche député ;
- affichage des photos et des groupes.

---

#### `textes_lois`

Métadonnées et résumés IA pour certains textes de lois.

Champs principaux :

- `id`
- `loi_id` : identifiant logique du texte, partagé avec `scrutins_app.loi_id`
- `titre`
- `source_url` : URL du texte officiel (si disponible)
- `texte_integral` : texte complet (souvent vide en V1)
- `resume_court` : résumé généré par IA
- `points_cles` : liste de points clés (jsonb)

Utilisation :
- onglet “Synthèse” de la fiche loi.

En V1, beaucoup de lignes n’ont pas `texte_integral` ni `source_url` →
donc pas de résumé IA systématique.
L’app affiche alors un message expliquant que le texte complet n’est pas encore disponible.

---

### 2.2 Vue / table dérivée : `lois_app`

`lois_app` est la source principale de la **liste des lois**.

Elle combine :

- un **scrutin principal** par loi (via `group_key` / `loi_id`) ;
- les stats de vote (copiées de `scrutins_app`) ;
- les métadonnées IA de `textes_lois` (`resume_court`, `points_cles`, `source_url`).

Champs principaux :

- `id` : id du scrutin principal (utilisé dans `/lois/[id]`)
- `loi_id`
- `group_key`
- `titre`
- `objet`
- `type_texte`
- `date_scrutin`
- `annee`
- `numero`
- `resultat`
- `stats_pour`
- `stats_contre`
- `stats_abstention`
- `total_votes`
- `resume_court`
- `points_cles`
- `source_url`

---

## 3. Front-end (Expo / React Native)

### 3.1 Onglet “Lois”

#### `app/(tabs)/lois/index.tsx`

Écran : **liste des lois** (“Actu des lois”).

Source : `lois_app` + `scrutins_app` (pour la structure).

Fonctionnalités :

- Recherche :
  - multi-mots ;
  - insensible aux accents ;
  - match sur : titre, objet, numéro de scrutin, type de texte.
- Filtres :
  - résultat : toutes / adoptées / rejetées ;
  - type de scrutin AN ;
  - année ;
  - “avec votes uniquement”.
- Pour chaque loi :
  - titre + objet ;
  - badge résultat (“Adoptée”, “Rejetée”, …) + date ;
  - type de texte + numéro de scrutin ;
  - résumé IA (si `resume_court` présent) ;
  - stats de votes (total / pour / contre / abstention) ;
  - structure estimée :
    - nombre d’articles ;
    - nombre d’amendements  
    (calculé à partir de `scrutins_app` avec du parsing de texte).

---

#### `app/(tabs)/lois/[id].tsx`

Écran : **fiche loi / scrutin principal**.

Sources :

- `scrutins_app` :
  - scrutin principal (via `id`) ;
  - scrutins liés (via `loi_id`) ;
- `textes_lois` :
  - résumé IA, points clés, URL officielle ;
- `votes_deputes` + `deputes_app` :
  - votes par député pour ce scrutin.

Onglets :

1. **Synthèse**
   - Résumé IA (`resume_court`) si disponible ;
   - Liste de points clés (`points_cles`) si disponible ;
   - Bouton “Voir le texte officiel” si `source_url` est renseigné ;
   - Sinon : message générique indiquant que le texte complet n’est pas encore disponible.

2. **Structure**
   - Regroupement des scrutins liés par :
     - **articles** (`article X` détecté dans les intitulés) ;
     - **amendements** (mots-clés “amendement”, “sous-amendement”) ;
   - Bloc “Amendements non rattachés” si aucun article n’a pu être détecté pour certains amendements ;
   - Chaque scrutin est cliquable → navigation vers `/lois/[id]`.

3. **Votes par député**
   - Statistiques :
     - total de votes ;
     - répartition pour / contre / abstention / autres (quand stats officielles disponibles ou recomptage à partir des votes individuels).
   - Filtres :
     - par type de vote (Tous, Pour, Contre, Abstention, Autres) ;
     - par groupe parlementaire.
   - Liste :
     - photo, nom, groupe ;
     - vote du député (“Pour”, “Contre”, etc.) avec badge coloré.

En bas d’écran :  
> Données en version bêta · ActuDesLois

---

### 3.2 Onglet “Députés”

#### `app/(tabs)/deputes/index.tsx`

Écran : **liste des députés**.

Source : `deputes_app`.

Fonctionnalités :

- Filtres par groupe parlementaire (chips horizontales) ;
- Recherche intelligente :
  - insensible aux accents ;
  - gestion de l’ordre inversé (“Nom Prénom”) ;
  - match sur nom, groupe, sigle.
- Pour chaque député :
  - photo AN (via `id_an`) ;
  - sigle de groupe + nom complet ;
  - scores sous forme de petits “pills” :
    - participation ;
    - loyauté ;
    - majorité.

---

#### `app/(tabs)/deputes/[id].tsx`

Écran : **fiche député** (id = `id_an`).

Sources :

- `deputes_app` : infos principales + scores ;
- `votes_deputes` : votes individuels ;
- `scrutins_app` : détails des scrutins liés à ces votes.

Contenu :

- Header :
  - avatar (photo AN ou fallback) ;
  - nom complet ;
  - groupe + sigle ;
  - scores : participation, loyauté, majorité.
- Bloc “Comportement de vote” :
  - stats globales calculées à partir de `votes_deputes` :
    - total de votes ;
    - % de Pour / Contre / Abstention / Autres.
- Section “Votes détaillés” :
  - filtres : Tous / Pour / Contre / Abstention / Autres ;
  - recherche : loi, objet, résultat, type, numéro, texte du vote ;
  - pour chaque vote :
    - titre & objet du scrutin ;
    - date & numéro ;
    - type de texte ;
    - résultat (avec couleurs Adopté / Rejeté) ;
    - vote du député (badge coloré) ;
    - navigation → `/lois/[scrutin_id]`.

En bas de liste :  
> Données en version bêta · ActuDesLois

---

## 4. IA & scripts (V1)

### 4.1 Script `generate_resumes_lois.js`

Script Node (hors app) qui :

1. Récupère dans `textes_lois` les entrées avec :
   - `texte_integral` non vide ;
   - `resume_court` vide.
2. Appelle un modèle IA pour :
   - générer un résumé court ;
   - extraire des points clés (liste).
3. Met à jour `resume_court` et `points_cles` dans la table.

Utilisation actuelle :
- lancé manuellement (pas encore branché sur un cron en V1).

---

## 5. Limites connues de la V1

- Les intitulés provenant des scrutins AN sont parfois :
  - des amendements / sous-amendements ;
  - partiels ou ambigus ;
- Il est difficile de **reconstruire automatiquement** les URLs officielles des textes complets (PDF / HTML) à partir de ces seules données.

Conséquences :

- `source_url` est souvent vide ;
- `texte_integral` est rarement complet ;
- les résumés IA ne couvrent pas tous les textes.

Ces limitations sont assumées en V1.
La V2 visera à :

- intégrer des sources plus fiables (API / datasets officiels) ;
- récupérer les numéros de texte AN (ex : `l16b1234_texte-adopte`) ;
- générer des résumés IA pour l’ensemble des textes principaux.
