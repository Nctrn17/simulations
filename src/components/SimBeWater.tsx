"use client";

import { BLEU, ENCRE, SimCartes, entier, pourcent, type Definition, type Reglages } from "./SimCartes";

// Be water : un cortège ou plusieurs petits groupes dans le centre de Paris.
// Le modèle est dans public/simulations/be-water/sim.js.

const PERSONNES_PAR_POINT = 50;
const E = 3; // pixels par case de 10 m

const NOMS_LIEUX: Record<string, string> = {
  concorde: "Concorde",
  elysee: "Élysée",
  madeleine: "Madeleine",
  opera: "Opéra",
  palais_royal: "Palais-Royal",
};

const heures = (tours: number) => {
  const minutes = Math.floor((tours * 10) / 60);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
};

const DEFINITION: Definition = {
  base: "/simulations/be-water",
  echelle: E,
  secondesParTour: 10,
  toursParSeconde: 30, // 2 h simulées en 24 s
  tirages: 8,
  foules: [
    ["d", "1 cortège, parcours déclaré"],
    ["1", "1 cortège, sans parcours"],
    ["2", "2 groupes"],
    ["4", "4 groupes"],
    ["10", "10 groupes"],
    ["20", "20 groupes"],
    ["40", "40 groupes"],
  ],
  defautA: "1",
  defautB: "20",
  graine: 6,
  champs: [
    {
      type: "curseur", cle: "personnes", court: "p", nom: "Personnes en tout",
      min: 2000, max: 30000, pas: 1000, defaut: 10000, lu: (v) => v.toLocaleString("fr-FR"),
    },
    {
      type: "curseur", cle: "unites", court: "u", nom: "Police",
      min: 0, max: 1000, pas: 50, defaut: 300, lu: (v) => `${v} unités`,
    },
    {
      type: "segments", cle: "secteur", court: "s", nom: "D'où viennent les renforts ?",
      options: [[60, "Du quartier"], [1000, "De tout Paris"]], defaut: 60,
      aide: "Personne ne sait lequel est vrai, et le résultat change : si tout Paris converge, un seul cortège occupe plus la police que vingt groupes. Si chaque bloc reste dans son quartier, c'est l'inverse. Essayez les deux.",
    },
    {
      type: "curseur", cle: "bloc", court: "bl", nom: "Taille d'un bloc de police", avance: true,
      min: 5, max: 60, pas: 5, defaut: 20, lu: (v) => `${v} unités`,
    },
    {
      type: "curseur", cle: "alerte", court: "al", nom: "Les gens partent quand la police est à", avance: true,
      min: 3, max: 30, pas: 1, defaut: 10, lu: (v) => `${v * 10} m`,
    },
    {
      type: "curseur", cle: "preparation", court: "pr", nom: "Temps de préparation d'un bloc", avance: true,
      min: 0, max: 90, pas: 6, defaut: 30, lu: (v) => `${v / 6} min`,
    },
    {
      type: "curseur", cle: "retard", court: "re", nom: "Retard de la police sur ce qu'elle voit", avance: true,
      min: 0, max: 90, pas: 6, defaut: 30, lu: (v) => `${v / 6} min`,
    },
    {
      type: "curseur", cle: "panique", court: "pa", nom: "Gens qui fuient sans regarder où ça ferme", avance: true,
      min: 0, max: 100, pas: 10, defaut: 30, lu: (v) => `${v} %`,
    },
    {
      type: "curseur", cle: "tours", court: "t", nom: "Durée", avance: true,
      min: 360, max: 1440, pas: 180, defaut: 720, lu: heures,
    },
    {
      type: "case", cle: "vitesseTaille", court: "vt", nom: "Un petit groupe marche plus vite qu'un gros",
      avance: true, defaut: true,
    },
  ],
  aideReglages: "Une unité tient 10 m de rue. Les deux cartes ont la même police.",
  tours: (r) => r.tours as number,
  params: (r: Reglages, foule: string) => ({
    foule: foule === "d" ? "declaree" : "mobile",
    n_corteges: foule === "d" ? 1 : Number(foule),
    n_groupes: Math.round((r.personnes as number) / PERSONNES_PAR_POINT),
    n_unites: r.unites,
    secteur: r.secteur,
    taille_bloc: r.bloc,
    alerte_reelle: r.alerte,
    preparation: r.preparation,
    retard: r.retard,
    panique: (r.panique as number) / 100,
    vitesse_taille: r.vitesseTaille,
    T: r.tours,
  }),
  titre: (code, r) => {
    const personnes = r.personnes as number;
    const total = personnes.toLocaleString("fr-FR");
    if (code === "d") return ["1", `cortège de ${total}, parcours déclaré`];
    if (code === "1") return ["1", `cortège de ${total}, sans parcours`];
    const par = Math.round(personnes / Number(code) / 50) * 50;
    return [code, `groupes de ${par.toLocaleString("fr-FR")}`];
  },
  enTete: (code) => (code === "d" ? "1 cortège déclaré" : code === "1" ? "1 cortège" : `${code} groupes`),
  compteur: (n) => [String(n), "rues à fermer pour les encercler"],
  legende: [
    ["rond", "50 personnes"],
    ["carre", "la police"],
    ["pale", "leur passage"],
  ],
  mesures: [
    {
      cle: "rues_a_fermer", nom: "Rues à fermer pour encercler tout le monde",
      aide: "en moyenne sur la partie, à 50 m des gens", forme: entier,
    },
    { cle: "encadres", nom: "Gens avec la police à moins de 120 m", aide: "en moyenne sur la partie", forme: pourcent },
    {
      cle: "couverture", nom: "Part du quartier traversée",
      aide: "pâtés de 100 m où des gens sont passés", forme: pourcent,
    },
    {
      cle: "visible", nom: "Temps passé en foule visible",
      aide: "400 personnes ou plus au même endroit", forme: pourcent,
    },
    {
      cle: "plus_grande_foule", nom: "Plus grande foule d'un seul tenant", aide: "en moyenne sur la partie",
      forme: (v) => `${(Math.round(v / 100) * 100).toLocaleString("fr-FR")} pers.`,
    },
    {
      cle: "police_occupee", nom: "Police occupée",
      aide: "part des unités en mouvement ou en nasse", forme: pourcent,
    },
    { cle: "avances", nom: "Avances de la police", aide: "un bloc qui marche vers une foule", forme: entier },
    { cle: "nasses", nom: "Gens encerclés", aide: "au moins une fois dans la partie", forme: pourcent },
  ],
  dessiner: (g, carte, im, k, ecart) => {
    g.font = `500 ${Math.round(12 * k)}px "IBM Plex Mono", ui-monospace, monospace`;
    g.fillStyle = "rgba(18,18,18,.6)";
    for (const [cle, nom] of Object.entries(NOMS_LIEUX)) {
      const l = carte.lieux?.[cle];
      if (l) g.fillText(nom.toUpperCase(), l[1] * E + 8 * k, l[0] * E - 8 * k);
    }
    if (!im) return;
    const c = (v: number) => (v + 0.5) * E;
    const carre = (y: number, x: number, r: number) => g.fillRect(c(x) - r, c(y) - r, 2 * r, 2 * r);
    // la police : carrés noirs détourés, lisibles sur le plan des rues
    g.fillStyle = "#fff";
    for (let i = 0; i < im.police.length; i += 2) carre(im.police[i], im.police[i + 1], 5 * k);
    g.fillStyle = ENCRE;
    for (let i = 0; i < im.police.length; i += 2) carre(im.police[i], im.police[i + 1], 3.5 * k);
    for (let i = 0; i < im.barrages.length; i += 2) carre(im.barrages[i], im.barrages[i + 1], 4 * k);
    // les gens : un point pour 50 personnes, en creux s'ils sont encerclés
    g.fillStyle = BLEU;
    g.strokeStyle = BLEU;
    g.lineWidth = 1.5 * k;
    for (let i = 0, j = 0; i < im.gens.length; i += 4, j++) {
      const x = c(im.gens[i + 1]) + ecart[(j * 2) % 4000] * k;
      const y = c(im.gens[i]) + ecart[(j * 2 + 1) % 4000] * k;
      g.beginPath();
      g.arc(x, y, 3.2 * k, 0, 6.2832);
      if (im.gens[i + 2]) g.stroke();
      else g.fill();
    }
  },
};

export function SimBeWater() {
  return <SimCartes d={DEFINITION} />;
}
