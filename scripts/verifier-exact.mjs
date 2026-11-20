// Vérifie qu'une retouche d'un moteur ne change aucune partie : mêmes graines, mêmes
// tours, mêmes résultats, au bit près. À lancer après une optimisation ou un nettoyage
// d'un sim.js qui ne doit rien changer aux règles :
//   npm run verifier:exact
//
// Chaque cas rejoue une partie et la compare à reference/empreintes.json : les résultats,
// et une empreinte de tous les tours (positions des gens, de la police et des barrages).
// Une dizaine de secondes, contre plusieurs minutes pour la comparaison au modèle Python.
//
// Si la retouche change volontairement les règles, les empreintes ne tiennent plus :
// passez la comparaison au modèle Python (npm run verifier), réécrivez les empreintes
//   node scripts/verifier-exact.mjs --ecrire
// et dites-le dans votre proposition.
//
// Les empreintes dépendent aussi des fonctions mathématiques de Node (Math.log,
// Math.hypot...). Si tous les cas sont en écart sur une autre version de Node, réécrivez
// les empreintes sur la branche main avec votre version, puis comparez de nouveau.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import * as beWater from "../public/simulations/be-water/sim.js";
import * as convergence from "../public/simulations/convergence/sim.js";

const FICHIER = "reference/empreintes.json";
// une empreinte intermédiaire tous les 60 tours : dit à partir d'où une partie change
const JALON = 60;

// Peu de cas, mais qui passent par toutes les règles : nasse fermée, parcours déclaré,
// police absente, barrages, blocs qui avancent puis rentrent.
const MOTEURS = {
  "be-water": {
    sim: beWater,
    cas: [
      ["1 cortège, renforts du quartier", { foule: "mobile", n_corteges: 1, secteur: 60 }, 0],
      ["20 groupes, renforts du quartier", { foule: "mobile", n_corteges: 20, secteur: 60 }, 0],
      ["4 groupes, renforts de tout Paris, 600 unités", { foule: "mobile", n_corteges: 4, secteur: 1000, n_unites: 600 }, 0],
      ["parcours déclaré", { foule: "declaree" }, 0],
      ["sans police", { foule: "mobile", n_unites: 0 }, 0],
    ],
  },
  convergence: {
    sim: convergence,
    cas: [
      ["petits groupes, 8 barrages", { foule: "eau", police: "barrages", n_barrages: 8 }, 0],
      ["cortège porte d'Italie, 8 barrages", { foule: "cortege", police: "barrages", n_barrages: 8 }, 0],
      ["cortège porte Maillot, 24 barrages", { foule: "cortege", porte_cortege: "maillot", police: "barrages", n_barrages: 24 }, 0],
      ["petits groupes, aucun barrage", { foule: "eau", police: "barrages", n_barrages: 0 }, 0],
      ["petits groupes, blocs qui avancent", { foule: "eau", police: "17oct" }, 0],
      ["cortège, blocs qui avancent", { foule: "cortege", police: "17oct" }, 0],
    ],
  },
};

function rejouer(sim, carte, reglages, graine) {
  const partie = new sim.Partie(carte, sim.config(reglages), graine);
  const h = createHash("sha256");
  const jalons = [];
  const ajouter = () => {
    const im = partie.image();
    h.update(Int32Array.of(im.t, im.compteur, im.gens.length, im.police.length, im.barrages.length));
    h.update(im.gens);
    h.update(im.police);
    h.update(im.barrages);
    if (im.t % JALON === 0) jalons.push(h.copy().digest("hex").slice(0, 8));
  };
  ajouter();
  while (!partie.terminee) {
    partie.pas();
    ajouter();
  }
  // JSON.stringify écrit chaque nombre de façon exacte (NaN devient null des deux côtés)
  return { tours: partie.t, empreinte: h.digest("hex").slice(0, 16), jalons, resultats: JSON.parse(JSON.stringify(partie.resultats())) };
}

const ecrire = process.argv.includes("--ecrire");
let avant = null;
if (!ecrire) {
  try {
    avant = JSON.parse(readFileSync(FICHIER, "utf8"));
  } catch {
    console.error(`${FICHIER} introuvable : lancez le script depuis la racine du dépôt, ou écrivez les empreintes sur main avec --ecrire.`);
    process.exit(1);
  }
}
const sortie = { node: process.version, moteurs: {} };
let ecarts = 0;
let nombre = 0;
const debut = Date.now();
for (const [nom, { sim, cas }] of Object.entries(MOTEURS)) {
  const carte = new sim.Carte(JSON.parse(readFileSync(`public/simulations/${nom}/carte.json`, "utf8")));
  sortie.moteurs[nom] = {};
  console.log(`\n${nom}`);
  for (const [libelle, reglages, graine] of cas) {
    const cle = `${libelle} (graine ${graine})`;
    const ici = rejouer(sim, carte, reglages, graine);
    sortie.moteurs[nom][cle] = ici;
    nombre++;
    if (ecrire) {
      console.log(`  écrit   ${cle}`);
      continue;
    }
    const ref = avant.moteurs[nom]?.[cle];
    if (!ref) {
      ecarts++;
      console.log(`  ABSENT  ${cle} : pas d'empreinte rangée pour ce cas`);
      continue;
    }
    const differents = Object.keys({ ...ref.resultats, ...ici.resultats }).filter(
      (k) => JSON.stringify(ref.resultats[k]) !== JSON.stringify(ici.resultats[k]),
    );
    if (ref.empreinte === ici.empreinte && ref.tours === ici.tours && !differents.length) {
      console.log(`  ok      ${cle}`);
      continue;
    }
    ecarts++;
    const j = ici.jalons.findIndex((x, i) => x !== ref.jalons[i]);
    console.log(`  ÉCART   ${cle}`);
    if (j === 0) console.log("          la partie change dès le départ");
    else if (j > 0) console.log(`          la partie change entre le tour ${(j - 1) * JALON} et le tour ${j * JALON}`);
    if (ref.tours !== ici.tours) console.log(`          durée : ${ref.tours} -> ${ici.tours} tours`);
    for (const k of differents) console.log(`          ${k} : ${JSON.stringify(ref.resultats[k])} -> ${JSON.stringify(ici.resultats[k])}`);
  }
}
if (ecrire) writeFileSync(FICHIER, `${JSON.stringify(sortie, null, 1)}\n`);
const duree = ((Date.now() - debut) / 1000).toFixed(1);
if (ecrire) console.log(`\n${nombre} cas écrits dans ${FICHIER} en ${duree} s (Node ${process.version})`);
else console.log(`\n${nombre} cas en ${duree} s, ${ecarts} écart(s)${ecarts && avant.node !== process.version ? ` (empreintes écrites avec Node ${avant.node}, vous avez ${process.version})` : ""}`);
process.exit(ecarts ? 1 : 0);
