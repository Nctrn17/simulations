// Be water : un cortège ou plusieurs petits, face à une police qui se déplace en blocs.
//
// Portage en JavaScript de bewater.py et centre17.py (dépôt nasse-sim), mode « réelle »
// seulement. Mêmes règles, mêmes réglages par défaut. Le tirage au sort n'est pas celui
// de numpy : une partie ne se rejoue pas à l'identique entre Python et ici, on compare
// les médianes sur plusieurs tirages (scripts/verifier-be-water.mjs).
//
// Échelle : 1 agent = 50 personnes, 1 case = 10 m, 1 tour = 10 s.
// Modèle simplifié : aucun contact physique n'est simulé, ce n'est pas un mode d'emploi.

import { Hasard, octets } from "../commun.js";

export const PERSONNES_PAR_AGENT = 50;
const INF = 65535;
const MARGE_ENCERCLEMENT = 5;

export const DEFAUTS = {
  foule: "mobile", // "mobile" ou "declaree"
  n_corteges: 20,
  n_groupes: 200,
  n_unites: 300,
  T: 720,
  cap: 3,
  retard: 30,
  preparation: 30,
  alerte: 12,
  alerte_reelle: 10,
  rayon_detect: 5,
  seuil_rassemblement: 8,
  decision: 6,
  garde: 180,
  panique: 0.3,
  rayon_lieu: 14,
  seuil_lieu: 8,
  vitesse_taille: true,
  pause_min: 60,
  pause_max: 120,
  n_points: 40,
  unites_position: 30,
  rayon_position: 3,
  taille_bloc: 20,
  secteur: 1000,
  seuil_bloc: 4,
  rayon_encadre: 12,
  portee: 12,
  contact: 3,
  attente: 30,
  zone: false, // fermer la zone de l'arrêté préfectoral, si la carte en a une
};

// Largeur des rues du parcours déclaré laissées ouvertes dans une zone fermée : 30 m de
// part et d'autre, assez pour qu'un cortège y passe.
const LARGEUR_AXE = 3;

// Le point (y, x) est-il dans le polygone [[y, x], ...] ? (règle du rayon, en cases)
function dedans(poly, y, x) {
  let oui = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) oui = !oui;
  }
  return oui;
}

// Parcours déclaré : un seul cortège, et la police n'a ni retard ni préparation.
export function config(o = {}) {
  const p = { ...DEFAUTS, ...o };
  if (p.foule === "declaree") {
    p.n_corteges = 1;
    if (o.retard === undefined) p.retard = 0;
    if (o.preparation === undefined) p.preparation = 0;
  }
  p.n_corteges = Math.max(1, Math.min(p.n_corteges, p.n_groupes));
  return p;
}

// Probabilité d'avancer d'une case par tour : 500 personnes 0,8 ; 10 000 personnes 0,3.
export function vitesse(agents, selonTaille = true) {
  if (!selonTaille) return 0.55;
  const v = 0.8 - (0.5 * Math.log(agents / 10)) / Math.log(20);
  return Math.min(0.8, Math.max(0.3, v));
}

export class Carte {
  constructor(d) {
    const { h, w } = d;
    this.h = h;
    this.w = w;
    const bits = octets(d.rues);
    const rue = new Uint8Array(h * w);
    const ids = new Int32Array(h * w).fill(-1);
    let n = 0;
    for (let i = 0; i < h * w; i++) {
      if ((bits[i >> 3] >> (7 - (i & 7))) & 1) {
        rue[i] = 1;
        ids[i] = n++;
      }
    }
    this.rue = rue;
    this.ids = ids;
    this.n = n;
    this.ys = new Int16Array(n);
    this.xs = new Int16Array(n);
    this.nbr = new Int32Array(n * 4).fill(-1);
    this.bord = new Uint8Array(n);
    for (let i = 0; i < h * w; i++) {
      const q = ids[i];
      if (q < 0) continue;
      const y = (i / w) | 0;
      const x = i - y * w;
      this.ys[q] = y;
      this.xs[q] = x;
      if (y > 0) this.nbr[q * 4] = ids[i - w];
      if (y < h - 1) this.nbr[q * 4 + 1] = ids[i + w];
      if (x > 0) this.nbr[q * 4 + 2] = ids[i - 1];
      if (x < w - 1) this.nbr[q * 4 + 3] = ids[i + 1];
      if (y === 0 || y === h - 1 || x === 0 || x === w - 1) this.bord[q] = 1;
    }
    this.lieux = {};
    for (const [nom, [y, x]] of Object.entries(d.lieux)) this.lieux[nom] = ids[y * w + x];
    // les lieux que la police tient sans bouger, puis les places où elle peut encercler,
    // dans l'ordre du parcours déclaré (à Paris : Concorde et Élysée ; Madeleine, Opéra,
    // Palais-Royal)
    this.tenus = d.tenus.map((nom) => this.lieux[nom]);
    this.nasses = d.nasses.map((nom) => this.lieux[nom]);
    // les étapes du parcours déclaré, du départ à l'arrivée (à Paris : les trois places)
    this.parcours = (d.parcours ?? d.nasses).map((nom) => this.lieux[nom]);
    // la zone d'un arrêté préfectoral, si la carte en a une : les cases de rue dont le
    // centre tombe dans l'un de ses polygones (en cases, voir scripts/fabriquer-villes.mjs)
    this.zone = null;
    if (d.zone?.polygones?.length) {
      this.zone = new Uint8Array(n);
      for (let q = 0; q < n; q++) {
        if (d.zone.polygones.some((poly) => dedans(poly, this.ys[q] + 0.5, this.xs[q] + 0.5))) this.zone[q] = 1;
      }
    }
    this.file = new Int32Array(n);
    this.pred = new Int32Array(n);
    this.integrale = new Int32Array((h + 1) * (w + 1));
    this.grille = new Int16Array(h * w);
  }

  // Distance en cases depuis une source ou plusieurs. `permis` : cases traversables.
  bfs(sources, permis = null, pred = null) {
    const { n, nbr, file } = this;
    const d = new Uint16Array(n).fill(INF);
    let fin = 0;
    if (typeof sources === "number") {
      d[sources] = 0;
      file[fin++] = sources;
    } else {
      for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        if (d[s] !== 0) {
          d[s] = 0;
          file[fin++] = s;
        }
      }
    }
    for (let tete = 0; tete < fin; tete++) {
      const q = file[tete];
      if (permis && !permis[q]) continue;
      const dq = d[q] + 1;
      const b = q * 4;
      for (let k = 0; k < 4; k++) {
        const v = nbr[b + k];
        if (v >= 0 && d[v] === INF && (!permis || permis[v])) {
          d[v] = dq;
          if (pred) pred[v] = q;
          file[fin++] = v;
        }
      }
    }
    return d;
  }

  boule(centre, r) {
    const d = this.bfs(centre);
    const out = [];
    for (let q = 0; q < this.n; q++) if (d[q] <= r) out.push(q);
    return Int32Array.from(out);
  }

  chemin(a, b) {
    this.pred.fill(-1);
    this.bfs(a, null, this.pred);
    const out = [b];
    while (out[out.length - 1] !== a && this.pred[out[out.length - 1]] >= 0) out.push(this.pred[out[out.length - 1]]);
    return out.reverse();
  }

  // Pour chaque case : 1 si elle ne peut plus rejoindre le bord de la carte.
  enfermes(bloque) {
    const { n, nbr, file, bord } = this;
    const vu = new Uint8Array(n);
    let fin = 0;
    for (let q = 0; q < n; q++) {
      if (bord[q] && !bloque[q]) {
        vu[q] = 1;
        file[fin++] = q;
      }
    }
    for (let tete = 0; tete < fin; tete++) {
      const b = file[tete] * 4;
      for (let k = 0; k < 4; k++) {
        const v = nbr[b + k];
        if (v >= 0 && !vu[v] && !bloque[v]) {
          vu[v] = 1;
          file[fin++] = v;
        }
      }
    }
    const enf = new Uint8Array(n);
    for (let q = 0; q < n; q++) enf[q] = !vu[q] && !bloque[q] ? 1 : 0;
    return enf;
  }

  // Pose les positions dans la grille et prépare la somme par fenêtre carrée.
  compter(positions) {
    const { h, w, grille, integrale, ys, xs } = this;
    grille.fill(0);
    for (let i = 0; i < positions.length; i++) grille[ys[positions[i]] * w + xs[positions[i]]]++;
    const W = w + 1;
    for (let y = 0; y < h; y++) {
      let ligne = 0;
      for (let x = 0; x < w; x++) {
        ligne += grille[y * w + x];
        integrale[(y + 1) * W + x + 1] = integrale[y * W + x + 1] + ligne;
      }
    }
  }

  // Nombre de positions dans le carré de rayon r autour de la case q (après compter()).
  fenetre(q, r) {
    const { h, w, integrale } = this;
    const W = w + 1;
    const y0 = Math.max(0, this.ys[q] - r);
    const y1 = Math.min(h, this.ys[q] + r + 1);
    const x0 = Math.max(0, this.xs[q] - r);
    const x1 = Math.min(w, this.xs[q] + r + 1);
    return integrale[y1 * W + x1] - integrale[y0 * W + x1] - integrale[y1 * W + x0] + integrale[y0 * W + x0];
  }
}

export class Partie {
  constructor(carte, p, graine) {
    this.c = carte;
    this.p = p;
    this.rng = new Hasard(graine);
    this.t = 0;
    this._initFoule();
    const nu = p.n_unites;
    this.u = new Int32Array(nu);
    this.u_op = new Int32Array(nu).fill(-1);
    this.u_case = new Int32Array(nu).fill(-1);
    this.u_bloc = new Int32Array(nu).fill(-1);
    this.u_lieu = new Int32Array(nu).fill(-1);
    this._posterUnites();
    this.bloque = new Uint8Array(carte.n);
    this.blocageOps = false;
    this.ops = new Map();
    this.prochainOp = 0;
    this.historique = [];
    this.stats = { fermees: 0, abandonnees: 0, nasses_vides: 0, sans_effectif: 0, avances: 0, avances_sans_contact: 0 };
    this.mes = { visible: 0, occupee: 0, marche: 0, encadres: 0, foyers: 0, tailleMax: 0, rues: 0, n: 0 };
    this.vu = new Uint8Array(carte.n);
    this.compte = new Int16Array(carte.n);
    this.marques = new Uint8Array(carte.h * carte.w);
    this.derniereRues = 0;
  }

  _initFoule() {
    const { c, p, rng } = this;
    const n = p.n_groupes;
    const K = p.n_corteges;
    this.mobile = p.foule === "mobile";
    this.cortege = new Int32Array(n);
    for (let i = 0; i < n; i++) this.cortege[i] = Math.floor((i * K) / n);
    // les positions tenues barrent des rues : les itinéraires les contournent
    this.tenu = new Uint8Array(c.n);
    this.sitesPosition = c.tenus.map((q) => c.boule(q, p.rayon_position));
    const tenus = [];
    for (const s of this.sitesPosition) for (const q of s) {
      this.tenu[q] = 1;
      tenus.push(q);
    }
    // la zone de l'arrêté, si elle est fermée : aucune foule n'y entre, sauf sur les rues du
    // parcours déclaré. Sans zone, `ferme` est `tenu`.
    this.ferme = this.tenu;
    if (p.zone && c.zone) {
      this.ferme = Uint8Array.from(this.tenu);
      let axe = [];
      for (let i = 0; i + 1 < c.parcours.length; i++) axe = axe.concat(c.chemin(c.parcours[i], c.parcours[i + 1]));
      const dAxe = c.bfs(axe.length ? axe : c.parcours);
      for (let q = 0; q < c.n; q++) if (c.zone[q] && dAxe[q] > LARGEUR_AXE) this.ferme[q] = 1;
    }
    const dTenu = c.bfs(tenus);
    const autres = [];
    for (let q = 0; q < c.n; q++) if (dTenu[q] > 8 && !this.ferme[q]) autres.push(q);
    this.autres = autres;
    // points de passage : d'abord les places (pour le parcours déclaré, ses étapes), puis des
    // rues prises partout sur la carte
    const sites = this.mobile ? c.nasses : c.parcours;
    const tirage = rng.melange(Int32Array.from(autres));
    this.points = sites.concat(Array.from(tirage.subarray(0, p.n_points - sites.length)));
    // le cortège déclaré fait halte aux places ; à une autre étape (un carrefour), il continue
    const places = new Set(c.nasses);
    this.halte = Uint8Array.from(this.points, (q, i) => (this.mobile || i >= sites.length || places.has(q) ? 1 : 0));
    const permis = new Uint8Array(c.n);
    for (let q = 0; q < c.n; q++) permis[q] = this.ferme[q] ? 0 : 1;
    this.permis = permis;
    this.D_points = this.points.map((q) => c.bfs(q, permis));
    this.route = [];
    for (let k = 0; k < K; k++) this.route.push(this.mobile ? Array.from(rng.permutation(p.n_points)) : sites.map((_, i) => i));
    this.etape = new Int32Array(K);
    this.but = Int32Array.from(this.route.map((r) => r[0]));
    this.pause = new Int32Array(K).fill(-1);
    this.fini = new Uint8Array(K);
    this.changerA = new Int32Array(K).fill(-1);
    this.calmeJusque = new Int32Array(K);
    this.fuite = new Int32Array(n);
    const taille = Math.floor(n / K);
    this.v = vitesse(taille, p.vitesse_taille);
    this.delaiInfo = Math.max(1, Math.floor(taille / 10));
    const compte = new Int16Array(c.n);
    this.pos = new Int32Array(n);
    let g = 0;
    for (let k = 0; k < K; k++) {
      const centre = this.mobile ? rng.choix(autres) : this.points[0];
      const D = c.bfs(centre);
      let r = 6;
      let pool = [];
      for (;;) {
        pool = [];
        for (let q = 0; q < c.n; q++) if (D[q] <= r && !this.ferme[q]) pool.push(q);
        if (pool.length * p.cap >= taille * 2 || r > 400) break;
        r += 2;
      }
      for (; g < n && this.cortege[g] === k; g++) {
        let q = pool[0];
        for (let essai = 0; essai < 200; essai++) {
          q = rng.choix(pool);
          if (compte[q] < p.cap) break;
        }
        compte[q]++;
        this.pos[g] = q;
      }
    }
    this.vivant = new Uint8Array(n).fill(1);
    this.nasse = new Uint8Array(n);
    this.dir = new Int8Array(n);
  }

  // ---------- foule ----------
  _prochaineEtape(k) {
    this.etape[k]++;
    const r = this.route[k];
    if (!this.mobile && this.etape[k] >= r.length) {
      this.fini[k] = 1;
      return;
    }
    this.but[k] = r[this.etape[k] % r.length];
    this.pause[k] = -1;
  }

  // Parmi quelques points au hasard, le plus éloigné de la police.
  _butLoinDeLaPolice(k, Dp) {
    const { rng, p } = this;
    const cand = [];
    for (let i = 0; i < p.n_points; i++) if (i !== this.but[k]) cand.push(i);
    rng.melange(cand);
    let meilleur = cand[0];
    let score = -1;
    for (let j = 0; j < Math.min(6, cand.length); j++) {
      const d = Dp[this.points[cand[j]]];
      const s = (d === INF ? 1e4 : d) + rng.reel() * 5;
      if (s > score) {
        score = s;
        meilleur = cand[j];
      }
    }
    return meilleur;
  }

  // Valeur à maximiser pour rejoindre une zone calme sans passer au contact de la police.
  _versRueSansPolice(Dp) {
    const { c, p } = this;
    const libre = new Uint8Array(c.n);
    const calmes = [];
    for (let q = 0; q < c.n; q++) {
      if (Dp[q] > 2 && !this.bloque[q]) {
        libre[q] = 1;
        if (Dp[q] > 2 * p.alerte) calmes.push(q);
      }
    }
    const out = new Float32Array(c.n);
    if (!calmes.length) {
      for (let q = 0; q < c.n; q++) out[q] = Dp[q] === INF ? 1e4 : Dp[q];
      return out;
    }
    const d = c.bfs(calmes, libre);
    for (let q = 0; q < c.n; q++) out[q] = d[q] !== INF ? -d[q] : (Dp[q] === INF ? 1e4 : Dp[q]) - 1e4;
    return out;
  }

  _deplacer(g, valeur, signe, bruit) {
    const { c, p, rng, compte } = this;
    const ici = this.pos[g];
    let meilleur = -Infinity;
    let choix = -1;
    for (let k = 0; k < 4; k++) {
      const q = c.nbr[ici * 4 + k];
      if (q < 0) continue;
      const s = signe * valeur[q] + rng.reel() * bruit;
      if (this.bloque[q] || compte[q] >= p.cap) continue;
      if (s > meilleur) {
        meilleur = s;
        choix = k;
      }
    }
    if (choix < 0) return;
    const q = c.nbr[ici * 4 + choix];
    compte[ici]--;
    this.pos[g] = q;
    compte[q]++;
    this.dir[g] = choix;
  }

  _pasFoule(Dp, policeVisible) {
    const { c, p, rng, compte } = this;
    const n = p.n_groupes;
    compte.fill(0);
    for (let g = 0; g < n; g++) if (this.vivant[g]) compte[this.pos[g]]++;
    const alerte = p.alerte_reelle;
    const sortie = this.mobile && policeVisible ? this._versRueSansPolice(Dp) : null;
    let panique = null;
    if (sortie) {
      panique = new Float32Array(c.n);
      for (let q = 0; q < c.n; q++) panique[q] = Dp[q] === INF ? 1e4 : Dp[q];
    }
    const membres = Array.from({ length: p.n_corteges }, () => []);
    for (let g = 0; g < n; g++) if (this.vivant[g]) membres[this.cortege[g]].push(g);
    for (let k = 0; k < p.n_corteges; k++) {
      const m = membres[k];
      if (!m.length) continue;
      if (this.mobile) {
        if (this.t >= this.calmeJusque[k] && this.changerA[k] < 0) {
          for (let i = 0; i < m.length; i++) {
            if (Dp[this.pos[m[i]]] <= alerte) {
              this.changerA[k] = this.t + this.delaiInfo;
              break;
            }
          }
        }
        if (this.changerA[k] === this.t) {
          this.but[k] = this._butLoinDeLaPolice(k, Dp);
          this.pause[k] = -1;
          this.changerA[k] = -1;
          this.calmeJusque[k] = this.t + 60;
        }
      }
      if (this.fini[k]) continue;
      const D = this.D_points[this.but[k]];
      const d = new Uint16Array(m.length);
      for (let i = 0; i < m.length; i++) d[i] = D[this.pos[m[i]]];
      d.sort();
      const mi = m.length >> 1;
      const mediane = m.length % 2 ? d[mi] : (d[mi - 1] + d[mi]) / 2;
      if (mediane <= 10) {
        if (!this.halte[this.but[k]]) this._prochaineEtape(k);
        else if (this.pause[k] < 0) this.pause[k] = rng.entier(p.pause_min, p.pause_max);
        else if (this.pause[k] === 0) this._prochaineEtape(k);
        else this.pause[k]--;
      }
    }
    const ordre = [];
    for (let g = 0; g < n; g++) if (this.vivant[g]) ordre.push(g);
    rng.melange(ordre);
    for (let i = 0; i < ordre.length; i++) {
      const g = ordre[i];
      const k = this.cortege[g];
      if (this.mobile && Dp[this.pos[g]] <= alerte) this.fuite[g] = rng.entier(30, 90);
      if (this.fuite[g] > 0) {
        this.fuite[g]--;
        if (Dp[this.pos[g]] <= alerte * 1.5 && sortie) {
          // on court : deux pas par tour, bruit fort pour se répartir dans les rues
          const valeur = rng.reel() < p.panique ? panique : sortie;
          this._deplacer(g, valeur, 1, 2.5);
          this._deplacer(g, valeur, 1, 2.5);
          continue;
        }
      }
      if (this.fini[k] && rng.reel() < 0.7) continue;
      if (rng.reel() < this.v) this._deplacer(g, this.D_points[this.but[k]], -1, 0.6);
    }
  }

  // ---------- police ----------
  _posterUnites() {
    const { c, p, rng } = this;
    let k = 0;
    for (const s of this.sitesPosition) {
      // les positions tenues, qui ne bougent pas de la partie
      const n = Math.min(p.unites_position, Math.floor(p.n_unites / 5));
      for (let i = 0; i < n; i++) {
        this.u[k] = rng.choix(s);
        this.u_op[k] = -2;
        k++;
      }
    }
    const restantes = p.n_unites - k;
    const nSites = c.nasses.length;
    const nBlocs = Math.max(nSites, Math.floor(restantes / p.taille_bloc));
    const D_sites = c.nasses.map((q) => c.bfs(q));
    this.lieux = D_sites.map((D) => {
      const anneau = [];
      const dedans = [];
      for (let q = 0; q < c.n; q++) {
        if (D[q] === p.rayon_lieu) anneau.push(q);
        else if (D[q] < p.rayon_lieu) dedans.push(q);
      }
      return { anneau, dedans };
    });
    const bases = [];
    if (this.mobile) {
      for (let i = 0; i < nBlocs; i++) {
        const D = D_sites[i % nSites];
        const pool = [];
        for (let q = 0; q < c.n; q++) if (D[q] >= p.rayon_lieu + 10 && D[q] <= p.rayon_lieu + 40) pool.push(q);
        const deja = bases.filter((_, j) => j % nSites === i % nSites);
        if (!deja.length) bases.push(rng.choix(pool));
        else {
          const d = c.bfs(deja);
          let meilleur = pool[0];
          for (const q of pool) if (d[q] > d[meilleur]) meilleur = q;
          bases.push(meilleur);
        }
      }
    } else {
      // parcours déclaré : les blocs attendent tout le long
      let trajet = [];
      for (let i = 0; i + 1 < c.parcours.length; i++) trajet = trajet.concat(c.chemin(this.points[i], this.points[i + 1]));
      // une seule place : les blocs attendent autour d'elle
      if (!trajet.length) trajet = [this.points[0]];
      for (let j = 0; j < nBlocs; j++) {
        const i = nBlocs === 1 ? 0 : Math.floor((j * (trajet.length - 1)) / (nBlocs - 1));
        bases.push(trajet[i]);
      }
    }
    this.D_base = [];
    bases.forEach((base, b) => {
      const n = Math.floor(restantes / nBlocs) + (b < restantes % nBlocs ? 1 : 0);
      const boule = c.boule(base, 3);
      for (let i = 0; i < n; i++) {
        this.u[k] = rng.choix(boule);
        this.u_lieu[k] = b % nSites;
        this.u_bloc[k] = b;
        k++;
      }
      this.D_base.push(c.bfs(base));
    });
    this.D_home = this.D_base.slice();
    const n = this.D_base.length;
    this.cible = new Int32Array(n).fill(-1);
    this.demarre = new Uint8Array(n);
    this.departBloc = new Int32Array(n);
    this.pauseBloc = new Int32Array(n);
    this.aVu = new Uint8Array(n);
    this.aTouche = new Uint8Array(n);
    this.D_cible = new Array(n).fill(null);
  }

  // Chaque case prend l'unité libre la plus proche (à vol d'oiseau).
  _lancer(libres, cases, dedans, lieu, depart) {
    const { c, rng } = this;
    const dispo = new Uint8Array(libres.length).fill(1);
    const ordre = rng.melange(cases.slice());
    const unites = new Int32Array(ordre.length);
    const cibles = new Int32Array(ordre.length);
    const D = [];
    ordre.forEach((cas, i) => {
      let meilleur = -1;
      let dMin = Infinity;
      for (let j = 0; j < libres.length; j++) {
        if (!dispo[j]) continue;
        const q = this.u[libres[j]];
        const d = (c.ys[q] - c.ys[cas]) ** 2 + (c.xs[q] - c.xs[cas]) ** 2;
        if (d < dMin) {
          dMin = d;
          meilleur = j;
        }
      }
      dispo[meilleur] = 0;
      unites[i] = libres[meilleur];
      cibles[i] = cas;
      D.push(c.bfs(cas));
    });
    const oid = this.prochainOp++;
    this.ops.set(oid, { unites, cibles, D, dedans, ferme: -1, lieu, depart });
    for (let i = 0; i < unites.length; i++) {
      this.u_op[unites[i]] = oid;
      this.u_case[unites[i]] = i;
    }
  }

  _liberer(oid) {
    const op = this.ops.get(oid);
    this.ops.delete(oid);
    for (const un of op.unites) {
      this.u_op[un] = -1;
      this.u_case[un] = -1;
    }
  }

  _deciderLieux(nb) {
    const { p } = this;
    const enCours = new Set();
    for (const op of this.ops.values()) enCours.add(op.lieu);
    this.lieux.forEach((l, i) => {
      if (enCours.has(i)) return;
      let somme = 0;
      for (const q of l.dedans) somme += nb[q];
      if (somme < p.seuil_lieu) return;
      const libres = [];
      for (let j = 0; j < p.n_unites; j++) if (this.u_op[j] === -1 && this.u_lieu[j] === i) libres.push(j);
      if (l.anneau.length > libres.length) {
        this.stats.sans_effectif++;
        return;
      }
      this._lancer(libres, l.anneau, l.dedans, i, this.t + p.preparation);
    });
  }

  _deciderBlocs(vue) {
    const { c, p } = this;
    c.compter(vue);
    const candidats = [];
    const valeur = [];
    for (let q = 0; q < c.n; q++) {
      const v = c.fenetre(q, p.rayon_detect);
      if (v >= p.seuil_bloc) {
        candidats.push(q);
        valeur.push(v);
      }
    }
    const gens = [];
    for (let g = 0; g < p.n_groupes; g++) if (this.vivant[g] && !this.nasse[g]) gens.push(this.pos[g]);
    const ordre = this.rng.permutation(this.D_home.length);
    for (const b of ordre) {
      const u = [];
      for (let j = 0; j < p.n_unites; j++) if (this.u_bloc[j] === b && this.u_op[j] === -1) u.push(this.u[j]);
      if (!u.length) continue;
      if (this.cible[b] >= 0) {
        if (!this.demarre[b]) {
          if (this.t >= this.departBloc[b]) {
            this.D_base[b] = this.D_cible[b];
            this.demarre[b] = 1;
          }
          continue;
        }
        const D_u = c.bfs(u);
        let enVue = false;
        for (const q of gens) {
          if (D_u[q] <= p.contact) this.aTouche[b] = 1;
          if (D_u[q] <= p.portee) enVue = true;
        }
        if (enVue) this.aVu[b] = 1;
        let arrive = false;
        for (const q of u) if (this.D_base[b][q] <= 3) arrive = true;
        if (!enVue && (this.aVu[b] || arrive)) {
          // plus personne : on s'arrête, on ne poursuit pas
          this.stats.avances++;
          if (!this.aTouche[b]) this.stats.avances_sans_contact++;
          this.cible[b] = -1;
          this.demarre[b] = 0;
          this.D_base[b] = this.D_home[b];
          this.pauseBloc[b] = this.t + p.attente;
        }
        continue;
      }
      if (this.t < this.pauseBloc[b]) continue;
      const Dh = this.D_home[b];
      let q = -1;
      for (let i = 0; i < candidats.length; i++) {
        if (valeur[i] < p.seuil_bloc) continue;
        const cq = candidats[i];
        if (Dh[cq] <= p.secteur && (q < 0 || Dh[cq] < Dh[q])) q = cq;
      }
      if (q < 0) continue;
      const D_q = c.bfs(q);
      // une foule repérée n'attire qu'un bloc par endroit
      for (let i = 0; i < candidats.length; i++) if (D_q[candidats[i]] <= 8) valeur[i] = 0;
      this.cible[b] = q;
      this.D_cible[b] = D_q;
      this.departBloc[b] = this.t + p.preparation;
      this.aVu[b] = 0;
      this.aTouche[b] = 0;
    }
  }

  _decider() {
    const { c, p } = this;
    const presence = new Int16Array(c.n);
    for (let g = 0; g < p.n_groupes; g++) if (this.vivant[g]) presence[this.pos[g]]++;
    for (const [oid, op] of Array.from(this.ops)) {
      if (op.ferme >= 0) continue;
      let somme = 0;
      for (const q of op.dedans) somme += presence[q];
      if (somme < p.seuil_rassemblement / 2) {
        this.stats.abandonnees++;
        this._liberer(oid);
      }
    }
    // la police agit sur ce qu'elle voyait il y a `retard` tours
    if (this.historique.length <= p.retard) return;
    if (!this.mobile) return; // parcours déclaré : les blocs restent postés
    const vue = this.historique[this.historique.length - 1 - p.retard];
    const nb = new Int16Array(c.n);
    for (let i = 0; i < vue.length; i++) nb[vue[i]]++;
    this._deciderLieux(nb);
    this._deciderBlocs(vue);
  }

  _pasPolice() {
    const { c, p } = this;
    const { nbr } = c;
    this.bloque.set(this.ferme);
    this.blocageOps = false;
    let marche = 0;
    for (const op of this.ops.values()) {
      if (this.t < op.depart) continue; // le temps de se coordonner
      let tous = true;
      for (let i = 0; i < op.unites.length; i++) {
        const un = op.unites[i];
        const ici = this.u[un];
        const D = op.D[i];
        let d = D[ici];
        let vers = ici;
        for (let k = 0; k < 4; k++) {
          const q = nbr[ici * 4 + k];
          if (q >= 0 && D[q] < d) {
            d = D[q];
            vers = q;
          }
        }
        if (vers !== ici) {
          this.u[un] = vers;
          marche++;
        }
        if (vers === op.cibles[i]) {
          this.bloque[vers] = 1;
          this.blocageOps = true;
        } else tous = false;
      }
      if (op.ferme < 0 && tous) op.ferme = this.t;
    }
    // les unités sans mission rentrent à leur base, ou marchent vers la foule repérée
    for (let j = 0; j < p.n_unites; j++) {
      if (this.u_op[j] !== -1 || this.u_bloc[j] < 0) continue;
      const D = this.D_base[this.u_bloc[j]];
      const ici = this.u[j];
      if (D[ici] <= 3) continue;
      let d = D[ici];
      let vers = ici;
      for (let k = 0; k < 4; k++) {
        const q = nbr[ici * 4 + k];
        if (q >= 0 && D[q] < d) {
          d = D[q];
          vers = q;
        }
      }
      if (vers !== ici) {
        this.u[j] = vers;
        marche++;
      }
    }
    this.mes.marche += marche;
  }

  _bilanNasses() {
    const { c, p } = this;
    if (!this.blocageOps) return; // les deux positions tenues n'enferment personne
    const enf = c.enfermes(this.bloque);
    const dedans = new Uint8Array(p.n_groupes);
    for (let g = 0; g < p.n_groupes; g++) {
      if (this.vivant[g] && enf[this.pos[g]]) {
        dedans[g] = 1;
        this.nasse[g] = 1;
      }
    }
    for (const [oid, op] of Array.from(this.ops)) {
      if (op.ferme < 0) continue;
      const boule = new Uint8Array(c.n);
      for (const q of op.dedans) boule[q] = 1;
      const pris = [];
      for (let g = 0; g < p.n_groupes; g++) if (dedans[g] && boule[this.pos[g]]) pris.push(g);
      if (this.t === op.ferme) {
        if (pris.length) this.stats.fermees++;
        else {
          this.stats.nasses_vides++;
          this._liberer(oid);
          continue;
        }
      }
      if (this.t - op.ferme >= p.garde) {
        for (const g of pris) this.vivant[g] = 0;
        this._liberer(oid);
      }
    }
  }

  // La foule ne réagit qu'aux unités en mouvement.
  _distancePolice() {
    const { p } = this;
    const vus = [];
    for (const op of this.ops.values()) if (this.t >= op.depart) for (const un of op.unites) vus.push(this.u[un]);
    for (let j = 0; j < p.n_unites; j++) {
      if (this.u_op[j] === -1 && this.u_bloc[j] >= 0 && this.demarre[this.u_bloc[j]]) vus.push(this.u[j]);
    }
    return { Dp: vus.length ? this.c.bfs(vus) : new Uint16Array(this.c.n).fill(INF), visible: vus.length > 0 };
  }

  // Foules d'un seul tenant (dilatation de 2 cases) : effectifs libres, en agents.
  _foyers(libres) {
    const { c } = this;
    const { h, w, rue } = c;
    const m = this.marques;
    const occ = c.grille;
    c.compter(libres);
    const marquees = [];
    for (let i = 0; i < libres.length; i++) {
      const y = c.ys[libres[i]];
      const x = c.xs[libres[i]];
      for (let dy = -2; dy <= 2; dy++) {
        const r = 2 - Math.abs(dy);
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (rue[j] && !m[j]) {
            m[j] = 1;
            marquees.push(j);
          }
        }
      }
    }
    const tailles = [];
    const pile = [];
    for (const depart of marquees) {
      if (m[depart] !== 1) continue;
      m[depart] = 2;
      pile.push(depart);
      let somme = 0;
      while (pile.length) {
        const j = pile.pop();
        somme += occ[j];
        const x = j % w;
        const voisins = [j >= w ? j - w : -1, j < (h - 1) * w ? j + w : -1, x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1];
        for (const v of voisins) {
          if (v >= 0 && m[v] === 1) {
            m[v] = 2;
            pile.push(v);
          }
        }
      }
      tailles.push(somme);
    }
    for (const j of marquees) m[j] = 0;
    return tailles;
  }

  // Rues à fermer pour encercler tout le monde à 50 m : les tronçons de rue situés à
  // cette distance des gens, comptés d'un seul tenant (voisinage à 8 cases).
  ruesAFermer(libres) {
    const { c } = this;
    const { h, w } = c;
    if (!libres.length) return 0;
    // zone fermée : ses rues le sont déjà, il n'y a pas à les compter
    const d = c.bfs(libres, this.p.zone && c.zone ? this.permis : null);
    const m = this.marques;
    const cases = [];
    for (let q = 0; q < c.n; q++) {
      if (d[q] === MARGE_ENCERCLEMENT) {
        const j = c.ys[q] * w + c.xs[q];
        m[j] = 1;
        cases.push(j);
      }
    }
    let n = 0;
    const pile = [];
    for (const depart of cases) {
      if (m[depart] !== 1) continue;
      n++;
      m[depart] = 2;
      pile.push(depart);
      while (pile.length) {
        const j = pile.pop();
        const y = (j / w) | 0;
        const x = j - y * w;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
            const k = yy * w + xx;
            if (m[k] === 1) {
              m[k] = 2;
              pile.push(k);
            }
          }
        }
      }
    }
    for (const j of cases) m[j] = 0;
    return n;
  }

  // ---------- partie ----------
  pas() {
    const { c, p } = this;
    const n = p.n_groupes;
    const vivants = [];
    for (let g = 0; g < n; g++) if (this.vivant[g]) vivants.push(this.pos[g]);
    this.historique.push(Int32Array.from(vivants));
    if (this.historique.length > p.retard + 1) this.historique.shift();
    if (this.t % p.decision === 0) this._decider();
    this._pasPolice();
    this._bilanNasses();
    const { Dp, visible } = this._distancePolice();
    this._pasFoule(Dp, visible);

    const tous = [];
    const libres = [];
    for (let g = 0; g < n; g++) {
      if (!this.vivant[g]) continue;
      tous.push(this.pos[g]);
      if (!this.nasse[g]) libres.push(this.pos[g]);
    }
    c.compter(tous);
    let enFoule = 0;
    for (const q of libres) {
      if (c.fenetre(q, p.rayon_detect) >= p.seuil_rassemblement) enFoule++;
      this.vu[q] = 1;
    }
    this.mes.visible += enFoule / n;
    let occupees = 0;
    for (let j = 0; j < p.n_unites; j++) {
      if (this.u_op[j] >= 0 || (this.u_bloc[j] >= 0 && this.demarre[this.u_bloc[j]])) occupees++;
    }
    this.mes.occupee += p.n_unites ? occupees / p.n_unites : 0;
    if (this.t % 6 === 0) {
      const f = this._foyers(libres);
      let nf = 0;
      let max = 0;
      for (const s of f) {
        if (s >= p.seuil_rassemblement) nf++;
        if (s > max) max = s;
      }
      this.mes.foyers += nf;
      this.mes.tailleMax += max;
      this.mes.n++;
      if (p.n_unites) {
        const D = c.bfs(this.u);
        let e = 0;
        for (const q of libres) if (D[q] <= p.rayon_encadre) e++;
        this.mes.encadres += e / n;
      }
      this.derniereRues = this.ruesAFermer(libres);
      this.mes.rues += this.derniereRues;
    }
    this.t++;
  }

  get terminee() {
    return this.t >= this.p.T;
  }

  jouer() {
    while (this.t < this.p.T) this.pas();
    return this.resultats();
  }

  resultats() {
    const { c, p, mes } = this;
    const T = Math.max(1, this.t);
    const nm = Math.max(1, mes.n);
    const carres = new Set();
    const vus = new Set();
    for (let q = 0; q < c.n; q++) {
      const k = Math.floor(c.ys[q] / 10) * 1000 + Math.floor(c.xs[q] / 10);
      carres.add(k);
      if (this.vu[q]) vus.add(k);
    }
    let nasses = 0;
    let libres = 0;
    for (let g = 0; g < p.n_groupes; g++) {
      nasses += this.nasse[g];
      if (this.vivant[g] && !this.nasse[g]) libres++;
    }
    return {
      nasses: nasses / p.n_groupes,
      libres_fin: libres / p.n_groupes,
      visible: mes.visible / T,
      encadres: mes.encadres / nm,
      foyers: mes.foyers / nm,
      plus_grande_foule: (mes.tailleMax / nm) * PERSONNES_PAR_AGENT,
      couverture: vus.size / carres.size,
      police_occupee: mes.occupee / T,
      km_par_unite: p.n_unites ? (mes.marche * 10) / 1000 / p.n_unites : 0,
      rues_a_fermer: mes.rues / nm,
      ...this.stats,
    };
  }

  // Ce qu'il faut pour dessiner le tour en cours.
  image() {
    const { c, p } = this;
    const gens = [];
    for (let g = 0; g < p.n_groupes; g++) {
      if (this.vivant[g]) gens.push(c.ys[this.pos[g]], c.xs[this.pos[g]], this.nasse[g], this.cortege[g]);
    }
    const police = new Int16Array(p.n_unites * 2);
    for (let j = 0; j < p.n_unites; j++) {
      police[j * 2] = c.ys[this.u[j]];
      police[j * 2 + 1] = c.xs[this.u[j]];
    }
    const barrages = [];
    if (this.blocageOps) {
      for (let q = 0; q < c.n; q++) if (this.bloque[q] && !this.ferme[q]) barrages.push(c.ys[q], c.xs[q]);
    }
    return {
      t: this.t,
      gens: Int16Array.from(gens),
      police,
      barrages: Int16Array.from(barrages),
      compteur: this.derniereRues,
    };
  }
}
