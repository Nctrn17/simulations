// Transforme des voies OpenStreetMap en carte de cases de rue, comme osm_map.py du dépôt
// nasse-sim, qui a fabriqué les cartes de Paris : mêmes largeurs de rue, mêmes places
// remplies. Utilisé par scripts/fabriquer-villes.mjs.
//
// Une voie : [classe, lat, lon, lat, lon, ...], coordonnées en degrés multipliés par 100 000.
// Classe 0 : grande voie (3 cases de large), 1 : rue, 2 : petite rue ou voie piétonne
// (1 case). Une voie piétonne fermée de moins de 300 m est une place : elle est remplie.

const RAYONS = [1.5, 0.75, 0.75]; // en cases, par classe
const PLACE_MAX_M = 300;
const M_LAT = 1.1132; // mètres par 1e-5 degré de latitude

// Grille h x w (1 = rue) centrée sur (lat, lon), en cases de `cellule` mètres.
// latRef : la latitude qui règle la longueur d'un degré de longitude (48,86 pour Paris).
export function rasteriser(voies, { lat, lon, h, w, cellule = 10, latRef = lat }) {
  const mLon = M_LAT * Math.cos(latRef * (Math.PI / 180));
  const lat0 = lat * 1e5;
  const lon0 = lon * 1e5;
  const grille = new Uint8Array(h * w);
  const places = [];
  // une case touche toute case dont le centre est à moins de r du point
  const marquer = (sy, sx, r) => {
    const fy = Math.floor(sy);
    const fx = Math.floor(sx);
    for (let dy = -2; dy <= 2; dy++) {
      const cy = fy + dy;
      if (cy < 0 || cy >= h) continue;
      const ey = cy + 0.5 - sy;
      for (let dx = -2; dx <= 2; dx++) {
        const cx = fx + dx;
        if (cx < 0 || cx >= w) continue;
        const ex = cx + 0.5 - sx;
        if (ey * ey + ex * ex <= r * r) grille[cy * w + cx] = 1;
      }
    }
  };
  for (const v of voies) {
    const classe = v[0];
    const n = (v.length - 1) / 2;
    const y = new Float64Array(n);
    const x = new Float64Array(n);
    let ymin = Infinity, ymax = -Infinity, xmin = Infinity, xmax = -Infinity;
    for (let i = 0; i < n; i++) {
      // y vers le bas = vers le sud
      y[i] = (h * cellule / 2 - (v[1 + 2 * i] - lat0) * M_LAT) / cellule;
      x[i] = ((v[2 + 2 * i] - lon0) * mLon + w * cellule / 2) / cellule;
      ymin = Math.min(ymin, y[i]);
      ymax = Math.max(ymax, y[i]);
      xmin = Math.min(xmin, x[i]);
      xmax = Math.max(xmax, x[i]);
    }
    if (ymax < -2 || ymin > h + 2 || xmax < -2 || xmin > w + 2) continue;
    const r = RAYONS[classe];
    for (let i = 0; i < n - 1; i++) {
      // un point tous les quarts de case, comme np.linspace
      const k = Math.trunc(Math.hypot(y[i + 1] - y[i], x[i + 1] - x[i]) / 0.25) + 1;
      const pas = 1 / k;
      for (let j = 0; j <= k; j++) {
        const t = j === k ? 1 : j * pas;
        marquer(y[i] + (y[i + 1] - y[i]) * t, x[i] + (x[i + 1] - x[i]) * t, r);
      }
    }
    const fermee = n > 3 && v[1] === v[2 * n - 1] && v[2] === v[2 * n];
    if (classe === 2 && fermee && Math.max(ymax - ymin, xmax - xmin) * cellule <= PLACE_MAX_M) places.push([y, x]);
  }
  for (const [py, px] of places) remplir(grille, h, w, py, px);
  return grille;
}

// Remplit les cases dont le centre est dans le polygone (règle pair-impair).
function remplir(grille, h, w, py, px) {
  let ymin = Infinity, ymax = -Infinity, xmin = Infinity, xmax = -Infinity;
  for (let i = 0; i < py.length; i++) {
    ymin = Math.min(ymin, py[i]);
    ymax = Math.max(ymax, py[i]);
    xmin = Math.min(xmin, px[i]);
    xmax = Math.max(xmax, px[i]);
  }
  const y0 = Math.max(0, Math.floor(ymin));
  const x0 = Math.max(0, Math.floor(xmin));
  const y1 = Math.ceil(ymax) + 1;
  const x1 = Math.ceil(xmax) + 1;
  for (let cy = y0; cy < h; cy++) {
    const yc = cy + 0.5;
    if (yc > y1) break;
    for (let cx = x0; cx < w; cx++) {
      const xc = cx + 0.5;
      if (xc > x1) break;
      let dedans = false;
      for (let i = 0, j = py.length - 1; i < py.length; j = i++) {
        if (py[i] > yc !== py[j] > yc && xc < ((px[j] - px[i]) * (yc - py[i])) / (py[j] - py[i]) + px[i]) dedans = !dedans;
      }
      if (dedans) grille[cy * w + cx] = 1;
    }
  }
}

// Ne garde que le plus grand réseau de rues d'un seul tenant (voisinage à 4), comme la
// carte be water de Paris : les bouts de rue isolés au bord ne servent à personne.
export function plusGrandReseau(grille, h, w) {
  const marque = new Int32Array(h * w).fill(-1);
  let meilleur = -1;
  let taille = 0;
  const pile = [];
  for (let s = 0; s < h * w; s++) {
    if (!grille[s] || marque[s] >= 0) continue;
    let n = 0;
    marque[s] = s;
    pile.push(s);
    while (pile.length) {
      const q = pile.pop();
      n++;
      const y = (q / w) | 0;
      const x = q - y * w;
      for (const v of [y > 0 ? q - w : -1, y < h - 1 ? q + w : -1, x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1]) {
        if (v >= 0 && grille[v] && marque[v] < 0) {
          marque[v] = s;
          pile.push(v);
        }
      }
    }
    if (n > taille) {
      taille = n;
      meilleur = s;
    }
  }
  const out = new Uint8Array(h * w);
  for (let i = 0; i < h * w; i++) out[i] = marque[i] === meilleur ? 1 : 0;
  return out;
}

// La case de rue la plus proche de (y, x), à moins de `rayon` cases ; null sinon.
export function accrocher(grille, h, w, y, x, rayon = 30) {
  let meilleur = null;
  let dMin = Infinity;
  const y0 = Math.round(y);
  const x0 = Math.round(x);
  for (let yy = Math.max(0, y0 - rayon); yy <= Math.min(h - 1, y0 + rayon); yy++) {
    for (let xx = Math.max(0, x0 - rayon); xx <= Math.min(w - 1, x0 + rayon); xx++) {
      if (!grille[yy * w + xx]) continue;
      const d = (yy + 0.5 - y) ** 2 + (xx + 0.5 - x) ** 2;
      if (d < dMin) {
        dMin = d;
        meilleur = [yy, xx];
      }
    }
  }
  return meilleur && dMin <= rayon * rayon ? meilleur : null;
}

// Position (ligne, colonne, en cases fractionnaires) d'un point dans une grille rasterisée
// avec les mêmes réglages.
export function versCase(latPoint, lonPoint, { lat, lon, h, w, cellule = 10, latRef = lat }) {
  const mLon = M_LAT * Math.cos(latRef * (Math.PI / 180));
  return [(h * cellule / 2 - (latPoint - lat) * 1e5 * M_LAT) / cellule, ((lonPoint - lon) * 1e5 * mLon + w * cellule / 2) / cellule];
}

// La grille au format carte.json : un bit par case, octet par octet, poids fort d'abord,
// en base64.
export function encoder(grille) {
  const octets = new Uint8Array(Math.ceil(grille.length / 8));
  let n = 0;
  for (let i = 0; i < grille.length; i++) {
    if (grille[i]) {
      octets[i >> 3] |= 0x80 >> (i & 7);
      n++;
    }
  }
  return { n, rues: Buffer.from(octets).toString("base64") };
}

export function decoder(base64, taille) {
  const octets = Buffer.from(base64, "base64");
  const grille = new Uint8Array(taille);
  for (let i = 0; i < taille; i++) grille[i] = (octets[i >> 3] >> (7 - (i & 7))) & 1;
  return grille;
}
