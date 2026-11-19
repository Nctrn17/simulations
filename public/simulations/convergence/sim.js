// Be water, la convergence : des gens partent des portes de Paris et convergent vers le centre.
//
// Portage en JavaScript de convergence.py (dépôt nasse-sim). Mêmes règles, mêmes réglages
// par défaut ; le tirage au sort diffère, on compare les médianes sur plusieurs tirages
// (scripts/verifier-convergence.mjs).
//
// Échelle : 1 agent = 50 personnes, 1 case = 20 m, 1 tour = 15 s. On marche à une case par tour.
// Modèle simplifié : aucun contact physique n'est simulé, ce n'est pas un mode d'emploi.

import { Hasard, octets } from "../commun.js";

export const PERSONNES_PAR_AGENT = 50;
export const TOUR_S = 15;
const VOISINS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
const RACINE2 = Math.SQRT2;

export const DEFAUTS = {
  foule: "eau", // "eau" : petits groupes par toutes les portes ; "cortege" : tous ensemble d'une porte
  agents: 200,
  porte_cortege: "italie",
  vue: 5,
  cout_police: 40,
  capacite: 4,
  bruit: 0.6,
  depart_etale: 8,
  delai_cortege: 12,
  n_fixes: 2,
  n_mobiles: 12,
  rayon_bases: 75,
  secteur: 30,
  preparation: 4,
  portee: 5,
  rayon_fixes: 20,
  rayon_arrivee: 8,
  rayon_approche: 50,
  tours: 480,
  police: "17oct", // "17oct" : des blocs qui avancent puis rentrent ; "barrages" : des rues barrées
  n_barrages: 8,
  redeploiement: 8,
  installation: 4,
  horizon: 40,
};

export function config(o = {}) {
  return { ...DEFAUTS, ...o };
}

export class Carte {
  constructor(d) {
    const { h, w } = d;
    this.h = h;
    this.w = w;
    const bits = octets(d.rues);
    const idx = new Int32Array(h * w).fill(-1);
    let n = 0;
    for (let i = 0; i < h * w; i++) if ((bits[i >> 3] >> (7 - (i & 7))) & 1) idx[i] = n++;
    this.idx = idx;
    this.n = n;
    this.ys = new Int16Array(n);
    this.xs = new Int16Array(n);
    this.nbr = new Int32Array(n * 8).fill(-1);
    for (let i = 0; i < h * w; i++) {
      const q = idx[i];
      if (q < 0) continue;
      const y = (i / w) | 0;
      const x = i - y * w;
      this.ys[q] = y;
      this.xs[q] = x;
      for (let k = 0; k < 8; k++) {
        const y2 = y + VOISINS[k][0];
        const x2 = x + VOISINS[k][1];
        if (y2 >= 0 && y2 < h && x2 >= 0 && x2 < w) this.nbr[q * 8 + k] = idx[y2 * w + x2];
      }
    }
    this.portes = {};
    for (const [nom, [y, x]] of Object.entries(d.portes)) this.portes[nom] = idx[y * w + x];
    this.centre = idx[d.centre[0] * w + d.centre[1]];
    // tas binaire, alloué une fois
    this.tasD = new Float64Array(n * 8 + 16);
    this.tasN = new Int32Array(n * 8 + 16);
    this.marques = new Uint8Array(h * w);
    this.D0 = this.distances([this.centre]);
    this.anneaux = new Map();
  }

  // Distance par les rues depuis `sources`. cout : surcoût par case (moyenne des deux bouts).
  // jusqua : on s'arrête dès que ces cases sont atteintes (les autres restent à l'infini).
  // origine : reçoit, pour chaque case, la source la plus proche.
  distances(sources, cout = null, jusqua = null, origine = null) {
    const { n, nbr, tasD, tasN } = this;
    const D = new Float64Array(n).fill(Infinity);
    let taille = 0;
    const pousser = (d, q) => {
      let i = taille++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (tasD[p] <= d) break;
        tasD[i] = tasD[p];
        tasN[i] = tasN[p];
        i = p;
      }
      tasD[i] = d;
      tasN[i] = q;
    };
    for (const s of sources) {
      if (D[s] !== 0) {
        D[s] = 0;
        if (origine) origine[s] = s;
        pousser(0, s);
      }
    }
    let reste = jusqua ? jusqua.length : -1;
    const voulu = jusqua ? new Set(jusqua) : null;
    while (taille > 0) {
      const d = tasD[0];
      const q = tasN[0];
      // retirer la racine
      taille--;
      if (taille > 0) {
        const dd = tasD[taille];
        const qq = tasN[taille];
        let i = 0;
        for (;;) {
          let f = 2 * i + 1;
          if (f >= taille) break;
          if (f + 1 < taille && tasD[f + 1] < tasD[f]) f++;
          if (tasD[f] >= dd) break;
          tasD[i] = tasD[f];
          tasN[i] = tasN[f];
          i = f;
        }
        tasD[i] = dd;
        tasN[i] = qq;
      }
      if (d > D[q]) continue;
      if (voulu && voulu.delete(q) && --reste === 0) break;
      const b = q * 8;
      const cq = cout ? cout[q] : 0;
      for (let k = 0; k < 8; k++) {
        const v = nbr[b + k];
        if (v < 0) continue;
        let poids = k < 4 ? 1 : RACINE2;
        if (cout) poids *= 1 + (cq + cout[v]) / 2;
        const nd = d + poids;
        if (nd < D[v]) {
          D[v] = nd;
          if (origine) origine[v] = origine[q];
          pousser(nd, v);
        }
      }
    }
    return D;
  }

  voisins(q) {
    const out = [];
    for (let k = 0; k < 8; k++) {
      const v = this.nbr[q * 8 + k];
      if (v >= 0) out.push(v);
    }
    return out;
  }

  // Nombre de taches d'un seul tenant (voisinage à 8) parmi ces cases de la grille,
  // chacune élargie en losange de `rayon` cases.
  taches(cases, rayon) {
    const { h, w, marques: m } = this;
    const posees = [];
    for (const q of cases) {
      const y = this.ys[q];
      const x = this.xs[q];
      for (let dy = -rayon; dy <= rayon; dy++) {
        const r = rayon - Math.abs(dy);
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (!m[j]) {
            m[j] = 1;
            posees.push(j);
          }
        }
      }
    }
    let n = 0;
    const pile = [];
    for (const depart of posees) {
      if (m[depart] !== 1) continue;
      n++;
      m[depart] = 2;
      pile.push(depart);
      while (pile.length) {
        const j = pile.pop();
        const y = (j / w) | 0;
        const x = j - y * w;
        for (let k = 0; k < 8; k++) {
          const yy = y + VOISINS[k][0];
          const xx = x + VOISINS[k][1];
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          const v = yy * w + xx;
          if (m[v] === 1) {
            m[v] = 2;
            pile.push(v);
          }
        }
      }
    }
    for (const j of posees) m[j] = 0;
    return n;
  }

  // Les rues qui traversent l'anneau à `rayon` cases du centre et, pour chaque case de Paris,
  // la rue de l'anneau la plus proche : celle par où la police s'attend à voir arriver les gens.
  anneau(rayon) {
    if (this.anneaux.has(rayon)) return this.anneaux.get(rayon);
    const { n, h, w, idx } = this;
    const rueDe = new Int32Array(n);
    const cases = [[]];
    const dansBande = (q) => Math.abs(this.D0[q] - rayon) < 1.5;
    // numérotation dans l'ordre de lecture de la grille, comme scipy
    const pile = [];
    for (let q = 0; q < n; q++) {
      if (!dansBande(q) || rueDe[q]) continue;
      const no = cases.length;
      cases.push([]);
      rueDe[q] = no;
      pile.push(q);
      while (pile.length) {
        const a = pile.pop();
        cases[no].push(a);
        const y = this.ys[a];
        const x = this.xs[a];
        // voisinage à 8 sur la grille : deux cases de rue en diagonale sont reliées
        for (let k = 0; k < 8; k++) {
          const yy = y + VOISINS[k][0];
          const xx = x + VOISINS[k][1];
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          const v = idx[yy * w + xx];
          if (v >= 0 && !rueDe[v] && dansBande(v)) {
            rueDe[v] = no;
            pile.push(v);
          }
        }
      }
    }
    for (const c of cases) c.sort((a, b) => a - b);
    const bord = [];
    for (let q = 0; q < n; q++) if (rueDe[q]) bord.push(q);
    const origine = new Int32Array(n).fill(-1);
    this.distances(bord, null, null, origine);
    const vers = new Int32Array(n);
    for (let q = 0; q < n; q++) vers[q] = origine[q] >= 0 ? rueDe[origine[q]] : 0;
    const an = {
      n: cases.length - 1,
      rueDe,
      cases,
      vers,
      milieu: cases.map((c) => (c.length ? c[c.length >> 1] : -1)),
    };
    this.anneaux.set(rayon, an);
    return an;
  }
}

// n cases de rue à `rayon` cases du centre par les rues, réparties tout autour.
function placerAnneau(c, rayon, n, rng) {
  const pool = [];
  const ang = [];
  for (let q = 0; q < c.n; q++) {
    if (Math.abs(c.D0[q] - rayon) < 2) {
      pool.push(q);
      ang.push(Math.atan2(c.ys[q] - c.ys[c.centre], c.xs[q] - c.xs[c.centre]));
    }
  }
  const out = [];
  const tour = 2 * Math.PI;
  for (let i = 0; i < n; i++) {
    const cible = -Math.PI + (tour * (i + 0.2 + 0.6 * rng.reel())) / n;
    let meilleur = 0;
    let ecart = Infinity;
    for (let j = 0; j < pool.length; j++) {
      const brut = ang[j] - cible + Math.PI;
      const d = Math.abs(brut - Math.floor(brut / tour) * tour - Math.PI);
      if (d < ecart) {
        ecart = d;
        meilleur = j;
      }
    }
    out.push(pool[meilleur]);
  }
  return out;
}

const ATTEND = 0;
const PREPARE = 1;
const AVANCE = 2;
const RENTRE = 3;
const TIENT = 4;
const INSTALLE = 5;

export class Partie {
  constructor(carte, p, graine) {
    const c = carte;
    this.c = c;
    this.p = p;
    const rng = new Hasard(graine);
    this.rng = rng;
    const n = p.agents;
    this.pos = new Int32Array(n);
    this.porte = new Int32Array(n);
    this.depart = new Int32Array(n);
    if (p.foule === "eau") {
      const portes = Object.values(c.portes);
      const ordre = rng.permutation(n);
      for (let i = 0; i < n; i++) {
        this.porte[i] = ordre[i] % portes.length;
        this.pos[i] = portes[this.porte[i]];
        this.depart[i] = rng.entier(0, Math.max(1, p.depart_etale));
      }
    } else {
      this.pos.fill(c.portes[p.porte_cortege] ?? c.portes.italie);
    }
    this.arrive = new Int32Array(n).fill(-1);
    this.contact = new Int32Array(n);
    this.blocs = [];
    this.barres = new Map(); // rue de l'anneau -> tour où le barrage tient
    this.occFixe = null;
    if (p.police === "barrages") {
      this.an = c.anneau(p.rayon_approche);
    } else {
      for (const k of placerAnneau(c, p.rayon_fixes, p.n_fixes, rng)) this.blocs.push({ base: k, pos: k, fixe: true, etat: ATTEND, depuis: 0, cible: -1 });
      for (const k of placerAnneau(c, p.rayon_bases, p.n_mobiles, rng)) {
        this.blocs.push({ base: k, pos: k, fixe: false, etat: ATTEND, depuis: 0, cible: -1, D: c.distances([k]) });
      }
    }
    this.champ = c.D0;
    this.cleChamp = "";
    this.champCortege = c.D0;
    this.decisionCortege = null;
    this.passages = new Set();
    this.groupes = [];
    this.charge = new Int16Array(c.n);
    this.t = 0;
    this.terminee = false;
  }

  // ---------- police ----------
  // Cases tenues par un bloc (sa case et ses voisines) : infranchissables.
  _occupees() {
    if (this.occFixe) return this.occFixe;
    const occ = new Set();
    if (this.p.police === "barrages") {
      let tous = true;
      for (const [rue, t0] of this.barres) {
        if (this.t >= t0) for (const v of this.an.cases[rue]) occ.add(v);
        else tous = false;
      }
      if (tous) this.occFixe = occ; // rien ne bouge jusqu'à la prochaine décision
      return occ;
    }
    for (const b of this.blocs) {
      occ.add(b.pos);
      for (const v of this.c.voisins(b.pos)) occ.add(v);
    }
    return occ;
  }

  _blocsDesBarrages() {
    this.blocs = [];
    for (const [rue, t0] of this.barres) {
      const k = this.an.milieu[rue];
      this.blocs.push({ base: k, pos: k, fixe: true, etat: this.t >= t0 ? TIENT : INSTALLE, depuis: 0, cible: -1 });
    }
  }

  // Toutes les 2 min, la police place ses barrages sur les rues où elle voit venir le plus de
  // monde. Un barrage qui reste ne bouge pas ; un barrage déplacé met `installation` tours à tenir.
  _pasBarrages(actifs) {
    const { c, p, an } = this;
    if (this.t % p.redeploiement || !actifs.length) return;
    const compte = new Int32Array(an.n + 1);
    for (const a of actifs) {
      const d = c.D0[this.pos[a]];
      if (d > p.rayon_approche - 1 && d < p.rayon_approche + p.horizon) compte[an.vers[this.pos[a]]]++;
    }
    compte[0] = 0;
    const rues = [];
    for (let i = 1; i <= an.n; i++) if (compte[i] > 0) rues.push(i);
    rues.sort((a, b) => compte[b] - compte[a] || a - b);
    rues.length = Math.min(rues.length, p.n_barrages);
    const garder = new Map();
    for (const [rue, t0] of this.barres) if (rues.includes(rue)) garder.set(rue, t0);
    let libres = p.n_barrages - garder.size;
    for (const rue of rues) {
      if (!garder.has(rue) && libres > 0) {
        garder.set(rue, this.t + p.installation);
        libres--;
      }
    }
    // les unités inoccupées restent où elles étaient
    for (const [rue, t0] of this.barres) {
      if (garder.size >= p.n_barrages) break;
      if (!garder.has(rue)) garder.set(rue, t0);
    }
    let change = garder.size !== this.barres.size;
    if (!change) for (const [rue, t0] of garder) if (this.barres.get(rue) !== t0) change = true;
    if (change) {
      this.barres = garder;
      this.occFixe = null;
    }
    this._blocsDesBarrages();
  }

  _pasVers(b, D) {
    let meilleur = -1;
    let d = Infinity;
    for (const v of this.c.voisins(b.pos)) {
      if (D[v] < d) {
        d = D[v];
        meilleur = v;
      }
    }
    if (meilleur >= 0 && d <= D[b.pos]) {
      // min() de Python garde le premier en cas d'égalité : un voisin passe avant la case elle-même
      b.pos = meilleur;
    }
  }

  _pasPolice(actifs) {
    const { c, p } = this;
    if (p.police === "barrages") {
      for (const t0 of this.barres.values()) {
        if (this.t === t0) {
          this.occFixe = null;
          this._blocsDesBarrages();
          break;
        }
      }
      return this._pasBarrages(actifs);
    }
    if (!actifs.length) return;
    for (const b of this.blocs) {
      if (b.fixe) continue;
      if (b.etat === ATTEND) {
        let cible = -1;
        let d = Infinity;
        for (const a of actifs) {
          const da = b.D[this.pos[a]];
          if (da <= p.secteur && da < d) {
            d = da;
            cible = a;
          }
        }
        if (cible >= 0) {
          b.etat = PREPARE;
          b.depuis = this.t;
          b.cible = cible;
        }
      } else if (b.etat === PREPARE) {
        if (this.t - b.depuis >= p.preparation) b.etat = AVANCE;
      } else if (b.etat === AVANCE) {
        const by = c.ys[b.pos];
        const bx = c.xs[b.pos];
        let dMin = Infinity;
        for (const a of actifs) {
          const d = Math.hypot(c.ys[this.pos[a]] - by, c.xs[this.pos[a]] - bx);
          if (d < dMin) dMin = d;
        }
        if (dMin > p.portee || this.arrive[b.cible] >= 0) {
          b.etat = RENTRE; // les gens sont partis : on ne poursuit pas
        } else {
          const autour = c.voisins(b.pos);
          autour.push(b.pos);
          this._pasVers(b, c.distances([this.pos[b.cible]], null, autour));
        }
      } else if (b.etat === RENTRE) {
        if (b.pos === b.base) b.etat = ATTEND;
        else this._pasVers(b, b.D);
      }
    }
  }

  // ---------- foule ----------
  // Surcoût des cases proches d'un bloc, pour ceux qui le voient. Rend aussi la liste des
  // blocs vus : si elle n'a pas changé, le chemin de tout le monde non plus.
  _coutVu(positions) {
    const { c, p } = this;
    const cout = new Float32Array(c.n);
    const vus = [];
    for (const b of this.blocs) {
      const by = c.ys[b.pos];
      const bx = c.xs[b.pos];
      let vu = false;
      for (const q of positions) {
        if (Math.hypot(c.ys[q] - by, c.xs[q] - bx) <= p.vue) {
          vu = true;
          break;
        }
      }
      if (!vu) continue;
      vus.push(b.pos);
      for (let dy = -p.vue; dy <= p.vue; dy++) {
        const yy = by + dy;
        if (yy < 0 || yy >= c.h) continue;
        for (let dx = -p.vue; dx <= p.vue; dx++) {
          const xx = bx + dx;
          if (xx < 0 || xx >= c.w) continue;
          const q = c.idx[yy * c.w + xx];
          if (q < 0) continue;
          const part = 1 - Math.hypot(dy, dx) / (p.vue + 1);
          if (part > 0) cout[q] += p.cout_police * part;
        }
      }
    }
    return { cout, vus };
  }

  _pasFoule(actifs) {
    const { c, p, rng, charge } = this;
    if (!actifs.length) return;
    let champ;
    if (p.foule === "eau") {
      if (this.t % 2 === 0) {
        const { cout, vus } = this._coutVu(actifs.map((a) => this.pos[a]));
        const cle = vus.join(",");
        if (cle !== this.cleChamp) {
          this.champ = vus.length ? c.distances([c.centre], cout) : c.D0;
          this.cleChamp = cle;
        }
      }
      champ = this.champ;
    } else {
      let tete = actifs[0];
      for (const a of actifs) if (c.D0[this.pos[a]] < c.D0[this.pos[tete]]) tete = a;
      const { cout, vus } = this._coutVu([this.pos[tete]]);
      if (vus.length && !this.decisionCortege) this.decisionCortege = { a: this.t + p.delai_cortege, cout };
      if (this.decisionCortege && this.t >= this.decisionCortege.a) {
        this.champCortege = c.distances([c.centre], this.decisionCortege.cout);
        this.decisionCortege = null;
      }
      champ = this.champCortege;
    }
    const occ = this._occupees();
    for (const a of actifs) charge[this.pos[a]]++;
    const ordre = rng.melange(actifs.slice());
    for (const k of ordre) {
      const ici = this.pos[k];
      let choix = ici;
      let meilleur = Infinity;
      const b = ici * 8;
      for (let j = 0; j <= 8; j++) {
        const v = j < 8 ? c.nbr[b + j] : ici;
        if (v < 0 || (v !== ici && occ.has(v))) continue;
        const bouchon = v !== ici ? 3 * Math.max(0, charge[v] + 1 - p.capacite) : 0;
        const s = champ[v] + bouchon + rng.normale(0, p.bruit);
        if (s < meilleur) {
          meilleur = s;
          choix = v;
        }
      }
      if (choix !== ici) {
        charge[ici]--;
        charge[choix]++;
        this.pos[k] = choix;
        const d = c.D0[ici];
        if (Math.abs(d - p.rayon_approche) < 1.5 || (d > p.rayon_approche && p.rayon_approche >= c.D0[choix])) this.passages.add(choix);
      }
    }
    for (const a of actifs) charge[this.pos[a]] = 0;
  }

  // ---------- partie ----------
  _actifs() {
    const out = [];
    for (let i = 0; i < this.p.agents; i++) if (this.depart[i] <= this.t && this.arrive[i] < 0) out.push(i);
    return out;
  }

  pas() {
    const { c, p } = this;
    let actifs = this._actifs();
    this._pasPolice(actifs);
    this._pasFoule(actifs);
    for (const a of actifs) if (c.D0[this.pos[a]] <= p.rayon_arrivee) this.arrive[a] = this.t;
    actifs = this._actifs();
    for (const b of this.blocs) {
      const by = c.ys[b.pos];
      const bx = c.xs[b.pos];
      for (const a of actifs) {
        if (Math.hypot(c.ys[this.pos[a]] - by, c.xs[this.pos[a]] - bx) <= 2) this.contact[a]++;
      }
    }
    if (this.t % 4 === 0) this.groupes.push(actifs.length ? c.taches(actifs.map((a) => this.pos[a]), 2) : 0);
    let tous = true;
    for (let i = 0; i < p.agents; i++) if (this.arrive[i] < 0) tous = false;
    this.t++;
    if (tous || this.t >= p.tours) this.terminee = true;
  }

  jouer() {
    while (!this.terminee) this.pas();
    return this.resultats();
  }

  ruesApproche() {
    return this.passages.size ? this.c.taches(Array.from(this.passages), 1) : 0;
  }

  resultats() {
    const { p } = this;
    const temps = [];
    let jamais = 0;
    let contact = 0;
    for (let i = 0; i < p.agents; i++) {
      if (this.arrive[i] >= 0) temps.push(this.arrive[i]);
      if (this.contact[i] === 0) jamais++;
      contact += this.contact[i];
    }
    temps.sort((a, b) => a - b);
    const centile = (q) => {
      const r = (temps.length - 1) * q;
      const bas = Math.floor(r);
      const haut = Math.min(temps.length - 1, bas + 1);
      return temps[bas] + (temps[haut] - temps[bas]) * (r - bas);
    };
    return {
      arrives: temps.length / p.agents,
      temps_median_min: temps.length ? (centile(0.5) * TOUR_S) / 60 : NaN,
      temps_90_min: temps.length > 10 ? (centile(0.9) * TOUR_S) / 60 : NaN,
      contact_min_par_personne: ((contact / p.agents) * TOUR_S) / 60,
      part_jamais_au_contact: jamais / p.agents,
      groupes_max: this.groupes.reduce((a, b) => Math.max(a, b), 0),
      rues_approche: this.ruesApproche(),
    };
  }

  // Ce qu'il faut pour dessiner le tour en cours.
  image() {
    const { c, p } = this;
    const gens = [];
    let arrives = 0;
    for (let i = 0; i < p.agents; i++) {
      if (this.arrive[i] >= 0) arrives++;
      if (this.depart[i] <= this.t) gens.push(c.ys[this.pos[i]], c.xs[this.pos[i]], this.arrive[i] >= 0 ? 1 : 0, this.porte[i]);
    }
    const police = [];
    for (const b of this.blocs) police.push(c.ys[b.pos], c.xs[b.pos], b.etat);
    const barrages = [];
    if (p.police === "barrages") {
      for (const [rue, t0] of this.barres) {
        if (this.t >= t0) for (const q of this.an.cases[rue]) barrages.push(c.ys[q], c.xs[q]);
      }
    }
    return {
      t: this.t,
      gens: Int16Array.from(gens),
      police: Int16Array.from(police),
      barrages: Int16Array.from(barrages),
      compteur: arrives * PERSONNES_PAR_AGENT,
    };
  }
}
