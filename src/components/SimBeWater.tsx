"use client";

import { BLEU, ENCRE, SimCartes, entier, pourcent, type CarteJson, type Definition, type Reglages } from "./SimCartes";

// Be water : un cortège ou plusieurs petits groupes dans le centre de Paris ou d'une autre
// ville. Le modèle est dans public/simulations/be-water/sim.js ; les cartes sont
// carte.json (Paris) et villes/<ville>.json (scripts/fabriquer-villes.mjs).

const PERSONNES_PAR_POINT = 50;
const E = 3; // pixels par case de 10 m

const BASE = "/simulations/be-water";
const VILLES: [string, string][] = [
  ["paris", "Paris"],
  ["angers", "Angers"],
  ["bordeaux", "Bordeaux"],
  ["grenoble", "Grenoble"],
  ["lyon", "Lyon"],
  ["marseille", "Marseille"],
  ["montpellier", "Montpellier"],
  ["nantes", "Nantes"],
  ["toulouse", "Toulouse"],
];

// « A, B et C »
const liste = (t: string[]) => (t.length > 1 ? `${t.slice(0, -1).join(", ")} et ${t[t.length - 1]}` : (t[0] ?? ""));

// Le tracé du parcours déclaré, case par case : le même plus court chemin que Carte.chemin
// dans sim.js (voisinage à 4, parcouru haut, bas, gauche, droite). Calculé une fois par carte.
const traces = new WeakMap<CarteJson, [number, number][]>();
function tracer(carte: CarteJson): [number, number][] {
  const deja = traces.get(carte);
  if (deja) return deja;
  const { h, w } = carte;
  const bits = atob(carte.rues);
  const rue = (i: number) => (bits.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  const etapes = (carte.parcours ?? carte.nasses ?? []).map((cle) => carte.lieux?.[cle]).filter((l) => l !== undefined);
  const out: [number, number][] = [];
  for (let e = 0; e + 1 < etapes.length; e++) {
    const a = etapes[e][0] * w + etapes[e][1];
    const b = etapes[e + 1][0] * w + etapes[e + 1][1];
    const pred = new Int32Array(h * w).fill(-1);
    pred[a] = a;
    const file = [a];
    for (let t = 0; t < file.length && pred[b] < 0; t++) {
      const q = file[t];
      const y = Math.floor(q / w);
      const x = q - y * w;
      for (const v of [y > 0 ? q - w : -1, y < h - 1 ? q + w : -1, x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1]) {
        if (v >= 0 && pred[v] < 0 && rue(v)) {
          pred[v] = q;
          file.push(v);
        }
      }
    }
    if (pred[b] < 0) continue;
    const morceau: [number, number][] = [];
    for (let q = b; q !== a; q = pred[q]) morceau.push([Math.floor(q / w), q % w]);
    morceau.push([Math.floor(a / w), a % w]);
    out.push(...morceau.reverse());
  }
  traces.set(carte, out);
  return out;
}

// « le 5 novembre 2026 » : la date est un jour UTC ; sans timeZone, il deviendrait le 4 à l'ouest
const jour = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const heures = (tours: number) => {
  const minutes = Math.floor((tours * 10) / 60);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
};

const DEFINITION: Definition = {
  base: BASE,
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
    { type: "choix", cle: "ville", court: "ville", nom: "Ville", options: VILLES, defaut: "paris" },
    {
      type: "case", cle: "zone", court: "z", nom: "Centre fermé par arrêté", defaut: false,
      si: (_, carte) => Boolean(carte?.zone),
    },
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
      options: [[60, "Du quartier"], [1000, "De toute la ville"]], defaut: 60,
      aide: "Personne ne sait lequel est vrai, et le résultat change : si toute la ville converge, un seul cortège occupe plus la police que vingt groupes. Si chaque bloc reste dans son quartier, c'est l'inverse. Essayez les deux.",
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
  carte: (r) => (r.ville === "paris" ? `${BASE}/carte.json` : `${BASE}/villes/${r.ville}.json`),
  infoCarte: (carte) => {
    const noms = (cles: string[] = []) => cles.map((c) => carte.noms?.[c] ?? c);
    const date = carte.date ? ` (données du ${jour(carte.date)})` : "";
    const p = carte.parcours_info;
    const z = carte.zone;
    const lien = (s: { url: string; source: string }) => (
      <a href={s.url} rel="noreferrer">
        {s.source}
      </a>
    );
    // Paris : les trois places sont le parcours déclaré, comme dans les vidéos
    if (!p) {
      return `${carte.nom ?? "Paris"}. Tenus par la police sans bouger : ${liste(noms(carte.tenus))}. Places où elle peut encercler, dans l'ordre du parcours déclaré : ${liste(noms(carte.nasses))}. Carte © les contributeurs OpenStreetMap${date}.`;
    }
    return (
      <>
        {carte.nom}. Parcours déclaré du {jour(p.date)} ({lien(p)}) : {liste(noms(carte.parcours))}.{" "}
        {carte.tenus?.length ? `Tenus par la police sans bouger : ${liste(noms(carte.tenus))}. ` : ""}
        Places où elle peut encercler : {liste(noms(carte.nasses))}.{" "}
        {z && (
          <>
            Zone interdite aux manifestations le {jour(z.date)} ({lien(z)}) : {z.texte}, en contour approché
            (l&apos;arrêté publie une carte, pas une liste de rues). Avec « Centre fermé par arrêté », personne
            n&apos;y entre, sauf par les rues du parcours.{" "}
          </>
        )}
        Carte © les contributeurs OpenStreetMap{date}.
      </>
    );
  },
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
    zone: r.zone,
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
  dessiner: (g, carte, im, k, ecart, params) => {
    const pr = params as { foule?: string; zone?: boolean } | null;
    // la zone fermée : grisée, bordée d'un trait
    const zone = pr?.zone && carte.zone;
    if (zone) {
      g.beginPath();
      for (const poly of zone.polygones) {
        poly.forEach(([y, x], i) => (i ? g.lineTo(x * E, y * E) : g.moveTo(x * E, y * E)));
        g.closePath();
      }
      g.fillStyle = "rgba(18,18,18,.08)";
      g.fill();
      g.strokeStyle = "rgba(18,18,18,.45)";
      g.lineWidth = 1.5 * k;
      g.setLineDash([4 * k, 4 * k]);
      g.stroke();
      g.setLineDash([]);
    }
    // le parcours déclaré, quand une carte le suit ou que la zone ne laisse que lui
    if (carte.parcours && (pr?.foule === "declaree" || zone)) {
      const trace = tracer(carte);
      g.beginPath();
      trace.forEach(([y, x], i) => (i ? g.lineTo((x + 0.5) * E, (y + 0.5) * E) : g.moveTo((x + 0.5) * E, (y + 0.5) * E)));
      g.strokeStyle = "rgba(18,18,18,.35)";
      g.lineWidth = 2.5 * k;
      g.setLineDash([7 * k, 5 * k]);
      g.stroke();
      g.setLineDash([]);
    }
    g.font = `500 ${Math.round(12 * k)}px "IBM Plex Mono", ui-monospace, monospace`;
    g.fillStyle = "rgba(18,18,18,.6)";
    // le nom des lieux tenus et des places ; les étapes du parcours restent sans nom
    for (const cle of [...(carte.tenus ?? []), ...(carte.nasses ?? [])]) {
      const l = carte.lieux?.[cle];
      const nom = carte.noms?.[cle];
      if (!l || !nom) continue;
      // à gauche du point quand le nom déborderait du bord droit
      const texte = nom.toUpperCase();
      const large = g.measureText(texte).width;
      const x = l[1] * E + 8 * k + large > g.canvas.width ? l[1] * E - 8 * k - large : l[1] * E + 8 * k;
      g.fillText(texte, x, l[0] * E - 8 * k);
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
