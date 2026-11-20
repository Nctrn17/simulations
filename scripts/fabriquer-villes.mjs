// Fabrique les cartes de be water des villes listées dans scripts/villes-be-water.json :
//   node scripts/fabriquer-villes.mjs            toutes les villes
//   node scripts/fabriquer-villes.mjs lyon       une seule
//
// Pour chaque ville, le script demande à Overpass (OpenStreetMap) les rues d'un quartier
// de 2,9 x 2,2 km centré sur ses cinq lieux, les range dans les trois classes de
// nasse-sim, en fait une grille de cases de 10 m (scripts/carte-osm.mjs), ne garde que le
// plus grand réseau d'un seul tenant et pose chaque lieu sur la case de rue la plus proche.
// Résultat : public/simulations/be-water/villes/<ville>.json, au format de carte.json.
//
// Le classement des rues a été retrouvé en comparant les données de nasse-sim à celles
// d'OpenStreetMap dans le centre de Paris (toutes les voies appariées tombent dans une
// seule classe) : grandes voies primary et secondary, rues tertiary, residential et
// unclassified, petites rues pedestrian et living_street. Trottoirs, escaliers, pistes
// cyclables et voies de service sont laissés de côté. trunk et secondary_link, absents du
// centre de Paris, sont rangés avec les grandes voies.
//
// Les données sont © les contributeurs OpenStreetMap, sous licence ODbL ; la date de
// l'extrait est écrite dans chaque carte.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { accrocher, encoder, plusGrandReseau, rasteriser, versCase } from "./carte-osm.mjs";

const H = 223; // les dimensions de la carte de Paris : 2,23 km
const W = 293; // 2,93 km
const CELLULE = 10;
const MARGE = 30; // un lieu à moins de 300 m du bord laisse peu de place à la police
const OVERPASS = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const CLASSES = {
  primary: 0, primary_link: 0, secondary: 0, secondary_link: 0, trunk: 0, trunk_link: 0,
  tertiary: 1, tertiary_link: 1, residential: 1, unclassified: 1,
  pedestrian: 2, living_street: 2,
};

const villes = JSON.parse(readFileSync("scripts/villes-be-water.json", "utf8"));
const demandees = process.argv.slice(2);
const codes = Object.keys(villes).filter((k) => !k.startsWith("_") && (!demandees.length || demandees.includes(k)));
if (!codes.length) {
  console.error(`Ville inconnue. Villes de scripts/villes-be-water.json : ${Object.keys(villes).filter((k) => !k.startsWith("_")).join(", ")}`);
  process.exit(1);
}
mkdirSync("public/simulations/be-water/villes", { recursive: true });

let problemes = 0;
for (const code of codes) {
  const v = villes[code];
  if (!v.tenus?.length || !v.nasses?.length) {
    console.error(`${code} : il faut au moins un lieu tenu et une place (tenus, nasses)`);
    problemes++;
    continue;
  }
  const lieux = [...v.tenus, ...v.nasses];
  const lats = lieux.map((l) => l[2]);
  const lons = lieux.map((l) => l[3]);
  // le quartier est centré sur ses lieux
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lon = (Math.min(...lons) + Math.max(...lons)) / 2;
  const reglage = { lat, lon, h: H, w: W, cellule: CELLULE };
  // la zone, avec 100 m de marge pour les rues qui entrent dans la carte
  const dLat = (H * CELLULE / 2 + 100) / 111320;
  const dLon = (W * CELLULE / 2 + 100) / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((x) => x.toFixed(5)).join(",");
  const requete = `[out:json][timeout:120];way["highway"~"^(${Object.keys(CLASSES).join("|")})$"](${bbox});out tags geom;`;
  // Overpass refuse souvent une requête quand il est chargé (429, 502, 504) : on réessaie
  let rep;
  for (let essai = 1; essai <= 4; essai++) {
    rep = await fetch(OVERPASS, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "simulations-cartes/0.1" },
      body: `data=${encodeURIComponent(requete)}`,
    });
    if (rep.ok || essai === 4) break;
    console.log(`${code} : Overpass a répondu ${rep.status}, nouvel essai dans ${essai * 15} s`);
    await new Promise((ok) => setTimeout(ok, essai * 15000));
  }
  if (!rep.ok) {
    console.error(`${code} : Overpass a répondu ${rep.status}, réessayez plus tard`);
    problemes++;
    continue;
  }
  const osm = await rep.json();
  const voies = [];
  for (const e of osm.elements) {
    if (e.type !== "way" || !e.geometry || CLASSES[e.tags.highway] === undefined) continue;
    const v2 = [CLASSES[e.tags.highway]];
    for (const p of e.geometry) v2.push(Math.round(p.lat * 1e5), Math.round(p.lon * 1e5));
    voies.push(v2);
  }
  const grille = plusGrandReseau(rasteriser(voies, reglage), H, W);
  const carte = { nom: v.nom, source: "OpenStreetMap (ODbL), contributeurs OpenStreetMap", date: osm.osm3s.timestamp_osm_base.slice(0, 10), centre_degres: [Number(lat.toFixed(5)), Number(lon.toFixed(5))], h: H, w: W, ...encoder(grille), lieux: {}, tenus: [], nasses: [], noms: {} };
  const notes = [];
  for (const [role, liste] of [["tenus", v.tenus], ["nasses", v.nasses]]) {
    for (const [cle, nom, la, lo] of liste) {
      const [y, x] = versCase(la, lo, reglage);
      const ici = accrocher(grille, H, W, y, x);
      if (!ici) {
        notes.push(`${nom} : aucune rue à moins de 300 m`);
        problemes++;
        continue;
      }
      const decale = Math.hypot(ici[0] + 0.5 - y, ici[1] + 0.5 - x) * CELLULE;
      const bord = Math.min(ici[0], ici[1], H - 1 - ici[0], W - 1 - ici[1]);
      if (bord < MARGE) notes.push(`${nom} à ${bord * CELLULE} m du bord`);
      if (decale > 50) notes.push(`${nom} posé à ${decale.toFixed(0)} m de son point`);
      carte.lieux[cle] = ici;
      carte[role].push(cle);
      carte.noms[cle] = nom;
    }
  }
  writeFileSync(`public/simulations/be-water/villes/${code}.json`, `${JSON.stringify(carte)}\n`);
  console.log(`${code.padEnd(12)} ${voies.length} voies, ${carte.n} cases de rue (${((100 * carte.n) / (H * W)).toFixed(0)} %), OSM du ${carte.date}${notes.length ? `\n  ${notes.join("\n  ")}` : ""}`);
  // Overpass demande de ne pas enchaîner les requêtes
  if (code !== codes[codes.length - 1]) await new Promise((ok) => setTimeout(ok, 2000));
}
process.exit(problemes ? 1 : 0);
