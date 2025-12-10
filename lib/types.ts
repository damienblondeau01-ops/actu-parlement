// lib/types.ts

export type Depute = {
  row_id: number;

  id: string | null;
  id_an: string | null;

  civ: string | null;
  prenom: string | null;
  nom: string | null;
  nomcomplet: string | null;
  nomComplet: string | null;

  groupe: string | null;
  groupeAbrev: string | null;

  departementNom: string | null;
  departementCode: string | null;
  circo: number | null;
  circonscription: string | null;

  // photo
  photoUrl: string | null;
  photourl: string | null;

  // infos perso
  age: number | null;
  naissance: string | null;
  villeNaissance: string | null;
  job: string | null;
  nombreMandats: number | null;
  experienceDepute: string | null;
  bio: string | null;

  // liens / contact
  website: string | null;
  facebook: string | null;
  twitter: string | null;
  mail: string | null;

  // nouveaux scores (NUMERIC)
  scoreloyaute: number | null;
  scoremajorite: number | null;
  scoreparticipation: number | null;

  // anciens scores (double / text) – fallback
  scoreLoyaute?: number | null;
  scoreMajorite?: string | null;
  scoreParticipation?: number | null;
};

export type Scrutin = {
  id: string;
  id_an: string | null;
  loi_id: string | null;
  titre: string | null;
  numero: number | null;
  date_scrutin: string | null; // ISO
};

export type VoteDepute = {
  id: string;
  scrutin_id: string;
  depute_row_id: number;
  vote: string | null;

  };
// --- Votes : types pour les vues SQL ---

export type VotesParLoi = {
  loi_id: string;
  nb_pour: number;
  nb_contre: number;
  nb_abstention: number;
  nb_non_votants: number;
  nb_total_votes: number;
  nb_votes_exprimes: number;
};

export type VotesParScrutin = {
  scrutin_id: string;
  loi_id: string | null;
  nb_pour: number;
  nb_contre: number;
  nb_abstention: number;
  nb_non_votants: number;
  nb_total_votes: number;
  nb_votes_exprimes: number
  
};
