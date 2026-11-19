// Compare le portage JavaScript de la convergence aux résultats du modèle Python.
//
// Le tirage au sort n'est pas le même des deux côtés : on compare, pour chaque
// réglage, la médiane et l'étendue. À lancer après toute retouche de
// public/simulations/convergence/sim.js :
//   node scripts/verifier-convergence.mjs
//
// Résultats Python : dossier reference/, copie de bewater_results/ du dépôt nasse-sim.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Carte, Partie, config } from "../public/simulations/convergence/sim.js";

const source = "reference";
const carte = new Carte(JSON.parse(readFileSync("public/simulations/convergence/carte.json", "utf8")));
const libre = JSON.parse(readFileSync(join(source, "convergence.json"), "utf8"));
const barrages = JSON.parse(readFileSync(join(source, "convergence_barrages.json"), "utf8"));

const MESURES = ["arrives", "temps_median_min", "part_jamais_au_contact", "groupes_max", "rues_approche"];
const PARTIES = Number(process.env.PARTIES ?? 10);

const mediane = (t) => {
  const s = t.filter((x) => x !== null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const etendue = (t) => {
  const s = t.filter((x) => x !== null && !Number.isNaN(x));
  return [Math.min(...s), Math.max(...s)];
};
const f = (x) => (Number.isFinite(x) ? x.toFixed(2) : "  -  ").padStart(7);

const cas = [];
for (const foule of ["eau", "cortege"]) cas.push({ nom: `${foule}, police du 17/10`, p: { foule }, ref: libre.filter((r) => r.foule === foule) });
for (const nb of [0, 2, 4, 8, 12, 16, 24]) {
  for (const foule of ["eau", "cortege"]) {
    cas.push({
      nom: `${foule}, ${nb} barrages`,
      p: { foule, police: "barrages", n_barrages: nb },
      ref: barrages.filter((r) => r.foule === foule && r.n_barrages === nb),
    });
  }
}

let ecarts = 0;
let parties = 0;
const debut = Date.now();
for (const { nom, p, ref } of cas) {
  if (!ref.length) continue;
  const ici = [];
  for (let s = 0; s < PARTIES; s++) {
    ici.push(new Partie(carte, config(p), s).jouer());
    parties++;
  }
  console.log(`\n${nom} (${ref.length} parties Python)`);
  for (const m of MESURES) {
    const a = ref.map((r) => r[m]);
    const b = ici.map((r) => r[m]);
    const [ma, mb] = [mediane(a), mediane(b)];
    const [amin, amax] = etendue(a);
    const [bmin, bmax] = etendue(b);
    // hors de l'étendue Python élargie d'un quart : à regarder
    const marge = 0.25 * (amax - amin) + 0.05 * Math.abs(ma) + 0.02;
    const dehors = Number.isFinite(ma) && (mb < amin - marge || mb > amax + marge);
    if (dehors) ecarts++;
    console.log(`  ${m.padEnd(24)} py ${f(ma)} [${f(amin)} ${f(amax)}]  js ${f(mb)} [${f(bmin)} ${f(bmax)}]${dehors ? "  <-- ECART" : ""}`);
  }
}
console.log(`\n${parties} parties en ${((Date.now() - debut) / 1000).toFixed(1)} s, ${ecarts} écart(s)`);
process.exit(ecarts ? 1 : 0);
