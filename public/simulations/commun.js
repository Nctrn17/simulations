// Ce que les simulations partagent : le tirage au sort et la lecture des cartes.
//
// Le tirage n'est pas celui de numpy : une partie ne se rejoue pas à l'identique entre
// Python et ici, on compare les médianes sur plusieurs tirages.

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Hasard {
  constructor(graine) {
    this.r = mulberry32(graine * 2654435761 + 12345);
  }
  reel() {
    return this.r();
  }
  entier(a, b) {
    return a + Math.floor(this.r() * (b - a));
  }
  choix(t) {
    return t[Math.floor(this.r() * t.length)];
  }
  melange(t) {
    for (let i = t.length - 1; i > 0; i--) {
      const j = Math.floor(this.r() * (i + 1));
      const x = t[i];
      t[i] = t[j];
      t[j] = x;
    }
    return t;
  }
  // loi normale (Box-Muller)
  normale(moyenne, ecart) {
    const u = 1 - this.r();
    const v = this.r();
    return moyenne + ecart * Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307179586 * v);
  }
  permutation(n) {
    const t = new Int32Array(n);
    for (let i = 0; i < n; i++) t[i] = i;
    return this.melange(t);
  }
}

export function octets(base64) {
  const s = atob(base64);
  const o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
  return o;
}

