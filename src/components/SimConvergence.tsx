"use client";

import { BLEU, ENCRE, SimCartes, entier, pourcent, type Definition, type Reglages } from "./SimCartes";

// La convergence : des portes de Paris vers Châtelet, en petits groupes ou en un cortège.
// Le modèle est dans public/simulations/convergence/sim.js.

const PERSONNES_PAR_POINT = 50;
const E = 2; // pixels par case de 20 m

const PORTES: [string, string][] = [
  ["la_chapelle", "Porte de la Chapelle"],
  ["clignancourt", "Porte de Clignancourt"],
  ["saint_ouen", "Porte de Saint-Ouen"],
  ["clichy", "Porte de Clichy"],
  ["champerret", "Porte de Champerret"],
  ["maillot", "Porte Maillot"],
  ["dauphine", "Porte Dauphine"],
  ["auteuil", "Porte d'Auteuil"],
  ["saint_cloud", "Porte de Saint-Cloud"],
  ["versailles", "Porte de Versailles"],
  ["orleans", "Porte d'Orléans"],
  ["italie", "Porte d'Italie"],
  ["ivry", "Porte d'Ivry"],
  ["vincennes", "Porte de Vincennes"],
  ["montreuil", "Porte de Montreuil"],
  ["bagnolet", "Porte de Bagnolet"],
  ["lilas", "Porte des Lilas"],
  ["pantin", "Porte de Pantin"],
  ["la_villette", "Porte de la Villette"],
];

const minutes = (tours: number) => `${(tours / 4).toLocaleString("fr-FR")} min`;
const metres = (cases: number) => `${(cases * 20).toLocaleString("fr-FR")} m`;
const duree = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)} min` : "–");
const barrages = (r: Reglages) => r.police === "barrages";
const blocs = (r: Reglages) => r.police === "17oct";

const DEFINITION: Definition = {
  base: "/simulations/convergence",
  echelle: E,
  secondesParTour: 15,
  toursParSeconde: 20, // 2 h simulées en 24 s
  tirages: 8,
  foules: [
    ["eau", "Petits groupes, par les 19 portes"],
    ["cortege", "Un seul cortège, par une porte"],
  ],
  defautA: "cortege",
  defautB: "eau",
  graine: 0,
  champs: [
    {
      type: "curseur", cle: "personnes", court: "p", nom: "Personnes en tout",
      min: 2000, max: 30000, pas: 1000, defaut: 10000, lu: (v) => v.toLocaleString("fr-FR"),
    },
    { type: "choix", cle: "porte", court: "po", nom: "Porte de départ du cortège", options: PORTES, defaut: "italie" },
    {
      type: "segments", cle: "police", court: "pl", nom: "Que fait la police ?",
      options: [["barrages", "Elle barre des rues"], ["17oct", "Elle avance puis rentre"]], defaut: "barrages",
      aide: "Barrer : toutes les 2 minutes, elle ferme les rues du dernier kilomètre où elle voit venir le plus de monde. Avancer : des blocs marchent vers une foule, s'arrêtent quand elle est partie et rentrent, comme le 17 octobre. Dans ce cas presque tout le monde arrive, quelle que soit la foule.",
    },
    {
      type: "curseur", cle: "nBarrages", court: "nb", nom: "Barrages", si: barrages,
      min: 0, max: 32, pas: 1, defaut: 8, lu: (v) => `${v} sur 32 rues`,
    },
    {
      type: "curseur", cle: "nMobiles", court: "nm", nom: "Blocs mobiles", si: blocs,
      min: 0, max: 40, pas: 1, defaut: 12, lu: (v) => String(v),
    },
    {
      type: "curseur", cle: "redeploiement", court: "rd", nom: "La police revoit ses barrages toutes les", avance: true,
      si: barrages, min: 2, max: 24, pas: 2, defaut: 8, lu: minutes,
    },
    {
      type: "curseur", cle: "installation", court: "in", nom: "Temps pour installer un barrage déplacé", avance: true,
      si: barrages, min: 0, max: 16, pas: 1, defaut: 4, lu: minutes,
    },
    {
      type: "curseur", cle: "horizon", court: "ho", nom: "La police voit venir les gens à", avance: true,
      si: barrages, min: 10, max: 100, pas: 5, defaut: 40, lu: (v) => `${metres(v)} des barrages`,
    },
    {
      type: "curseur", cle: "secteur", court: "s", nom: "Un bloc repère une foule à", avance: true,
      si: blocs, min: 10, max: 100, pas: 5, defaut: 30, lu: (v) => `${metres(v)} de sa base`,
    },
    {
      type: "curseur", cle: "preparation", court: "pr", nom: "Temps de préparation d'un bloc", avance: true,
      si: blocs, min: 0, max: 20, pas: 1, defaut: 4, lu: minutes,
    },
    {
      type: "curseur", cle: "vue", court: "v", nom: "Les gens voient la police à", avance: true,
      min: 2, max: 15, pas: 1, defaut: 5, lu: metres,
    },
    {
      type: "curseur", cle: "delai", court: "dc", nom: "Temps qu'il faut au cortège pour changer de chemin", avance: true,
      min: 0, max: 40, pas: 2, defaut: 12, lu: minutes,
    },
    {
      type: "curseur", cle: "capacite", court: "c", nom: "Une rue bouche au-delà de", avance: true,
      min: 2, max: 10, pas: 1, defaut: 4, lu: (v) => `${v * 50} personnes sur 20 m`,
    },
    {
      type: "curseur", cle: "tours", court: "t", nom: "Durée", avance: true,
      min: 240, max: 960, pas: 120, defaut: 480, lu: (v) => `${v / 240} h`,
    },
  ],
  aideReglages: "Tout le monde va à Châtelet. Les deux cartes ont la même police.",
  tours: (r) => r.tours as number,
  params: (r: Reglages, foule: string) => ({
    foule,
    agents: Math.round((r.personnes as number) / PERSONNES_PAR_POINT),
    porte_cortege: r.porte,
    police: r.police,
    n_barrages: r.nBarrages,
    n_mobiles: r.nMobiles,
    redeploiement: r.redeploiement,
    installation: r.installation,
    horizon: r.horizon,
    secteur: r.secteur,
    preparation: r.preparation,
    vue: r.vue,
    delai_cortege: r.delai,
    capacite: r.capacite,
    tours: r.tours,
  }),
  titre: (code, r) => {
    if (code === "eau") return ["19", "portes, en petits groupes"];
    const porte = PORTES.find(([cle]) => cle === r.porte)?.[1] ?? "une porte";
    return ["1", `cortège, ${porte.charAt(0).toLowerCase()}${porte.slice(1)}`];
  },
  enTete: (code) => (code === "eau" ? "Petits groupes" : "1 cortège"),
  compteur: (n) => [n.toLocaleString("fr-FR"), "personnes arrivées au centre"],
  legende: [
    ["rond", "50 personnes"],
    ["carre", "la police"],
    ["pale", "leur passage"],
    ["cercle", "le centre"],
  ],
  mesures: [
    { cle: "arrives", nom: "Arrivés au centre", aide: "à moins de 160 m de Châtelet, avant la fin", forme: pourcent },
    { cle: "temps_median_min", nom: "Temps d'arrivée médian", aide: "pour ceux qui arrivent", forme: duree },
    {
      cle: "rues_approche", nom: "Rues d'approche utilisées",
      aide: "entrées distinctes dans le dernier kilomètre", forme: entier,
    },
    {
      cle: "part_jamais_au_contact", nom: "Jamais au contact de la police",
      aide: "aucun bloc à moins de 40 m de toute la partie", forme: pourcent,
    },
    { cle: "groupes_max", nom: "Groupes distincts au plus fort", aide: "en chemin", forme: entier },
  ],
  dessiner: (g, carte, im, k, ecart) => {
    const c = (v: number) => (v + 0.5) * E;
    // le centre : un cercle au rayon d'arrivée
    if (carte.centre) {
      g.strokeStyle = ENCRE;
      g.lineWidth = 2 * k;
      g.beginPath();
      g.arc(c(carte.centre[1]), c(carte.centre[0]), 8 * E + 4 * k, 0, 6.2832);
      g.stroke();
      g.font = `500 ${Math.round(12 * k)}px "IBM Plex Mono", ui-monospace, monospace`;
      g.fillStyle = "rgba(18,18,18,.7)";
      g.fillText("CHÂTELET", c(carte.centre[1]) + 8 * E + 8 * k, c(carte.centre[0]) + 4 * k);
    }
    if (!im) return;
    // une rue barrée : un trait foncé en travers
    g.fillStyle = ENCRE;
    for (let i = 0; i < im.barrages.length; i += 2) {
      g.fillRect(c(im.barrages[i + 1]) - 2.2 * k, c(im.barrages[i]) - 2.2 * k, 4.4 * k, 4.4 * k);
    }
    // les gens : un point pour 50 personnes, plus pâle une fois arrivé
    g.fillStyle = BLEU;
    for (let i = 0, j = 0; i < im.gens.length; i += 4, j++) {
      const x = c(im.gens[i + 1]) + ecart[(j * 2) % 4000] * k * 0.8;
      const y = c(im.gens[i]) + ecart[(j * 2 + 1) % 4000] * k * 0.8;
      g.globalAlpha = im.gens[i + 2] ? 0.45 : 1;
      g.beginPath();
      g.arc(x, y, 3 * k, 0, 6.2832);
      g.fill();
    }
    g.globalAlpha = 1;
    // la police par-dessus : carré plein, ou vide tant qu'un barrage s'installe
    for (let i = 0; i < im.police.length; i += 3) {
      const x = c(im.police[i + 1]);
      const y = c(im.police[i]);
      g.fillStyle = "#fff";
      g.fillRect(x - 6 * k, y - 6 * k, 12 * k, 12 * k);
      g.fillStyle = ENCRE;
      g.fillRect(x - 4.5 * k, y - 4.5 * k, 9 * k, 9 * k);
      if (im.police[i + 2] === 5) {
        g.fillStyle = "#fff";
        g.fillRect(x - 2.5 * k, y - 2.5 * k, 5 * k, 5 * k);
      }
    }
  },
};

export function SimConvergence() {
  return <SimCartes d={DEFINITION} />;
}
