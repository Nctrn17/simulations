// Compare le portage JavaScript de be water aux résultats du modèle Python.
//
// Le tirage au sort n'est pas le même des deux côtés : on compare, pour chaque
// réglage, la médiane sur 12 parties et l'étendue. À lancer après toute retouche
// de public/simulations/be-water/sim.js :
//   node scripts/verifier-be-water.mjs
//
// Résultats Python : dossier reference/, copie de bewater_results/ du dépôt nasse-sim.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Carte, Partie, config } from "../public/simulations/be-water/sim.js";

const source = "reference";
const carte = new Carte(JSON.parse(readFileSync("public/simulations/be-water/carte.json", "utf8")));
const python = [
  ...JSON.parse(readFileSync(join(source, "grille.json"), "utf8")).parties,
  ...JSON.parse(readFileSync(join(source, "sensibilite.json"), "utf8")).parties,
];

const MESURES = ["couverture", "encadres", "visible", "police_occupee", "avances", "plus_grande_foule", "foyers"];
const FOULES = [["declaree", 1], ["mobile", 1], ["mobile", 4], ["mobile", 20]];
const REGLAGES = [{ secteur: 1000 }, { secteur: 60 }, { n_unites: 150 }, { n_unites: 600 }];
const PARTIES = Number(process.env.PARTIES ?? 12);

const mediane = (t) => {
  const s = [...t].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const f = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2)).padStart(7);

let ecarts = 0;
const debut = Date.now();
let parties = 0;
for (const reglage of REGLAGES) {
  for (const [foule, n] of FOULES) {
    const p = config({ foule, n_corteges: n, ...reglage });
    const ref = python.filter(
      (r) =>
        r.reelle && r.foule === foule && r.n_corteges === n && r.n_unites === p.n_unites && r.secteur === p.secteur &&
        r.taille_bloc === 20 && r.alerte_reelle === 10 && r.preparation === p.preparation,
    );
    if (!ref.length) continue;
    const ici = [];
    for (let s = 0; s < PARTIES; s++) {
      ici.push(new Partie(carte, p, s).jouer());
      parties++;
    }
    console.log(`\n${foule} x${n} ${JSON.stringify(reglage)} (${ref.length} parties Python)`);
    for (const m of MESURES) {
      const a = ref.map((r) => r[m]);
      const b = ici.map((r) => r[m]);
      const [ma, mb] = [mediane(a), mediane(b)];
      // hors de l'étendue Python élargie d'un quart : à regarder
      const marge = 0.25 * (Math.max(...a) - Math.min(...a)) + 0.02 * Math.abs(ma) + 1e-9;
      const dehors = mb < Math.min(...a) - marge || mb > Math.max(...a) + marge;
      if (dehors) ecarts++;
      console.log(
        `  ${m.padEnd(18)} py ${f(ma)} [${f(Math.min(...a))} ${f(Math.max(...a))}]  js ${f(mb)} [${f(Math.min(...b))} ${f(Math.max(...b))}]${dehors ? "  <-- ECART" : ""}`,
      );
    }
  }
}
console.log(`\n${parties} parties en ${((Date.now() - debut) / 1000).toFixed(1)} s, ${ecarts} écart(s)`);
process.exit(ecarts ? 1 : 0);
