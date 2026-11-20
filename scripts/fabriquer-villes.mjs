// Fabrique les cartes de be water des villes listées dans scripts/villes-be-water.json :
//   node scripts/fabriquer-villes.mjs            toutes les villes
//   node scripts/fabriquer-villes.mjs lyon       une seule
//
// Pour chaque ville, le script demande à Overpass (OpenStreetMap) les rues d'un quartier
// de 2,9 x 2,2 km centré sur ses lieux, les range dans les trois classes de nasse-sim, en
// fait une grille de cases de 10 m (scripts/carte-osm.mjs), ne garde que le plus grand
// réseau d'un seul tenant et pose chaque lieu sur la case de rue la plus proche.
// Résultat : public/simulations/be-water/villes/<ville>.json, au format de carte.json.
//
// Une étape du parcours se donne en degrés, ou comme le carrefour de deux voies nommées
// ({ "carrefour": ["Cours Gambetta", "Avenue de Saxe"] }) : le script le trouve dans les
// rues qu'il vient de recevoir. La zone d'un arrêté se donne en polygones de degrés ; elle
// est écrite en cases dans la carte.
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
import { accrocher, chemin, encoder, plusGrandReseau, rasteriser, versCase } from "./carte-osm.mjs";

const H = 223; // les dimensions de la carte de Paris : 2,23 km
const W = 293; // 2,93 km
const CELLULE = 10;
const MARGE = 30; // un lieu à moins de 300 m du bord laisse peu de place à la police
const RAYON_TENU = 3; // rayon_position de sim.js : la police tient 30 m autour d'un lieu tenu
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

// « Cours Jean-Jaurès » et « cours jean jaures » : le même nom
const norme = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[-'’]/g, " ").replace(/\s+/g, " ").trim();
const moyenne = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

// Les points de toutes les portions d'une voie (« A|B » : l'une ou l'autre), dans la réponse d'Overpass.
function pointsDe(osm, motif) {
  const voulus = motif.split("|").map(norme);
  const pts = [];
  for (const e of osm.elements) {
    if (e.type !== "way" || !e.geometry || !e.tags?.name) continue;
    const nom = norme(e.tags.name);
    if (voulus.some((v) => nom.includes(v))) for (const p of e.geometry) pts.push([p.lat, p.lon]);
  }
  return pts;
}

// Le carrefour de deux voies : leurs points communs ; sinon le milieu de leurs deux points
// les plus proches, s'ils sont à moins de `jusqua` mètres (40 par défaut : un rond-point ou
// un bout de voie sans nom entre les deux ; plus pour deux voies reliées par une place).
function carrefour(osm, [a, b], jusqua = 40) {
  const pa = pointsDe(osm, a);
  const pb = pointsDe(osm, b);
  if (!pa.length || !pb.length) {
    // les noms qui partagent le mot le plus long du motif : souvent la bonne orthographe
    const motif = !pa.length ? a : b;
    const mot = norme(motif).split(/[ |]/).sort((x, y) => y.length - x.length)[0];
    const proches = new Set();
    for (const e of osm.elements) if (e.tags?.name && norme(e.tags.name).includes(mot)) proches.add(e.tags.name);
    return { erreur: `aucune voie « ${motif} »${proches.size ? ` (proches : ${[...proches].slice(0, 6).join(", ")})` : ""}` };
  }
  const deA = new Set(pa.map((p) => `${p[0]},${p[1]}`));
  const communs = pb.filter((p) => deA.has(`${p[0]},${p[1]}`));
  if (communs.length) return { point: moyenne(communs), ecart: communs };
  const kx = Math.cos((pa[0][0] * Math.PI) / 180);
  let meilleur = Infinity;
  let paire = null;
  for (const p of pa) {
    for (const q of pb) {
      const d = (p[0] - q[0]) ** 2 + ((p[1] - q[1]) * kx) ** 2;
      if (d < meilleur) {
        meilleur = d;
        paire = [p, q];
      }
    }
  }
  const m = Math.sqrt(meilleur) * 111320;
  if (m > jusqua) return { erreur: `« ${a} » et « ${b} » ne se croisent pas (${m.toFixed(0)} m au plus près)` };
  return { point: moyenne(paire), ecart: paire };
}

let problemes = 0;
for (const code of codes) {
  const v = villes[code];
  const etapes = v.parcours?.etapes ?? [];
  const tenus = v.tenus ?? [];
  if (etapes.length < 2 || !v.nasses?.length || v.nasses.some((cle) => !etapes.some((e) => e[0] === cle))) {
    console.error(`${code} : il faut un parcours d'au moins deux étapes, et des places (nasses) prises parmi ses étapes`);
    problemes++;
    continue;
  }
  // le quartier est centré sur les lieux donnés en degrés (le départ et l'arrivée au moins),
  // ou sur le centre écrit dans la ville
  const enDegres = [...tenus, ...etapes].filter((l) => typeof l[2] === "number");
  const lats = enDegres.map((l) => l[2]);
  const lons = enDegres.map((l) => l[3]);
  const [lat, lon] = v.centre ?? [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2];
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
  const carte = {
    nom: v.nom, source: "OpenStreetMap (ODbL), contributeurs OpenStreetMap", date: osm.osm3s.timestamp_osm_base.slice(0, 10),
    centre_degres: [Number(lat.toFixed(5)), Number(lon.toFixed(5))], h: H, w: W, ...encoder(grille),
    lieux: {}, tenus: [], nasses: [...v.nasses], parcours: [], noms: {},
  };
  const notes = [];
  const poser = (cle, nom, la, lo) => {
    const [y, x] = versCase(la, lo, reglage);
    const ici = accrocher(grille, H, W, y, x);
    if (!ici) {
      notes.push(`ERREUR ${nom} : aucune rue à moins de 300 m (hors de la carte ?)`);
      problemes++;
      return false;
    }
    const decale = Math.hypot(ici[0] + 0.5 - y, ici[1] + 0.5 - x) * CELLULE;
    const bord = Math.min(ici[0], ici[1], H - 1 - ici[0], W - 1 - ici[1]);
    if (bord < MARGE) notes.push(`${nom} à ${bord * CELLULE} m du bord`);
    if (decale > 50) notes.push(`${nom} posé à ${decale.toFixed(0)} m de son point`);
    carte.lieux[cle] = ici;
    carte.noms[cle] = nom;
    return true;
  };
  for (const [cle, nom, la, lo] of tenus) if (poser(cle, nom, la, lo)) carte.tenus.push(cle);
  const enDegresEtapes = [];
  for (const [cle, nom, ou, lo] of etapes) {
    let la = ou;
    let lon2 = lo;
    if (typeof ou === "object") {
      const r = carrefour(osm, ou.carrefour, ou.jusqua);
      if (r.erreur) {
        notes.push(`ERREUR ${nom} : ${r.erreur}`);
        problemes++;
        continue;
      }
      [la, lon2] = r.point;
      const etendue = Math.max(...r.ecart.map((p) => Math.hypot(p[0] - la, (p[1] - lon2) * Math.cos((la * Math.PI) / 180)) * 111320));
      if (etendue > 80) notes.push(`${nom} : carrefour étalé sur ${etendue.toFixed(0)} m, à vérifier`);
    }
    if (poser(cle, nom, la, lon2)) {
      carte.parcours.push(cle);
      enDegresEtapes.push([la, lon2]);
    }
  }
  // le parcours ne doit pas buter sur un lieu tenu : la foule n'y passe pas
  for (let i = 0; i + 1 < carte.parcours.length; i++) {
    const [a, b] = [carte.parcours[i], carte.parcours[i + 1]];
    const trajet = chemin(grille, H, W, carte.lieux[a], carte.lieux[b]);
    if (!trajet.length) {
      notes.push(`ERREUR ${carte.noms[a]} et ${carte.noms[b]} ne sont pas reliés`);
      problemes++;
      continue;
    }
    for (const cle of carte.tenus) {
      const [ty, tx] = carte.lieux[cle];
      const pres = trajet.some(([y, x]) => Math.abs(y - ty) + Math.abs(x - tx) <= RAYON_TENU + 1);
      if (pres) {
        notes.push(`ERREUR le parcours ${carte.noms[a]} → ${carte.noms[b]} passe sur ${carte.noms[cle]}, tenu par la police`);
        problemes++;
      }
    }
  }
  const info = (o) => ({ date: o.date, source: o.source, url: o.url, ...(o.texte ? { texte: o.texte } : {}) });
  carte.parcours_info = info(v.parcours);
  if (v.zone) {
    // "interieur": la zone est ce que le parcours entoure (une boucle par les boulevards)
    const polygones = v.zone.polygones === "interieur" ? [enDegresEtapes] : v.zone.polygones;
    carte.zone = {
      ...info(v.zone),
      polygones: polygones.map((poly) => poly.map(([la, lo]) => versCase(la, lo, reglage).map((c) => Math.round(c * 10) / 10))),
    };
  }
  writeFileSync(`public/simulations/be-water/villes/${code}.json`, `${JSON.stringify(carte)}\n`);
  console.log(`${code.padEnd(12)} ${voies.length} voies, ${carte.n} cases de rue (${((100 * carte.n) / (H * W)).toFixed(0)} %), OSM du ${carte.date}${notes.length ? `\n  ${notes.join("\n  ")}` : ""}`);
  // Overpass demande de ne pas enchaîner les requêtes
  if (code !== codes[codes.length - 1]) await new Promise((ok) => setTimeout(ok, 2000));
}
process.exit(problemes ? 1 : 0);
