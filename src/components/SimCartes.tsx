"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Le cadre commun aux simulations : deux foules face à la même police, côte à côte.
//
// Chaque simulation vit dans public/simulations/<nom> (sim.js, lisible tel quel)
// et tourne dans deux workers, un par carte. Elle décrit ici ses réglages, ses
// mesures et son dessin (voir SimBeWater.tsx, SimConvergence.tsx). Rien n'est
// envoyé nulle part, les réglages voyagent dans l'adresse.

export const BLEU = "#1652c8";
export const BLEU_PALE = "#b7c8ee";
export const ENCRE = "#121212";
const FOND = "#faf9f6";
const RUE = "#e1ded5";

export type CarteJson = {
  h: number;
  w: number;
  n: number;
  rues: string;
  lieux?: Record<string, [number, number]>;
  portes?: Record<string, [number, number]>;
  centre?: [number, number];
};
// gens : (ligne, colonne, état, groupe) par point. police et barrages : au choix de la simulation.
export type Image = { t: number; gens: Int16Array; police: Int16Array; barrages: Int16Array; compteur: number };
export type Resultats = Record<string, number>;
export type Valeur = number | string | boolean;
export type Reglages = Record<string, Valeur>;

type Commun = { cle: string; court: string; nom: string; avance?: boolean; si?: (r: Reglages) => boolean };
export type Champ =
  | (Commun & { type: "curseur"; min: number; max: number; pas: number; defaut: number; lu: (v: number) => string })
  | (Commun & { type: "case"; defaut: boolean })
  | (Commun & { type: "choix"; options: [string, string][]; defaut: string })
  | (Commun & { type: "segments"; options: [number | string, string][]; defaut: number | string; aide?: string });

export type Mesure = { cle: string; nom: string; aide: string; forme: (v: number) => string };

export type Definition = {
  base: string; // dossier public de la simulation
  echelle: number; // pixels par case
  secondesParTour: number;
  toursParSeconde: number;
  tirages: number;
  foules: [string, string][];
  defautA: string;
  defautB: string;
  graine: number;
  champs: Champ[];
  aideReglages?: string;
  tours: (r: Reglages) => number;
  params: (r: Reglages, foule: string) => object;
  titre: (foule: string, r: Reglages) => [string, string];
  enTete: (foule: string) => string;
  compteur: (n: number) => [string, string];
  legende: [string, string][];
  mesures: Mesure[];
  // k : grossissement des marques, selon la taille de la carte à l'écran
  dessiner: (g: CanvasRenderingContext2D, carte: CarteJson, im: Image | null, k: number, ecart: Float32Array) => void;
};

export const pourcent = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(0)} %` : "–");
export const entier = (v: number) => (Number.isFinite(v) ? v.toFixed(0) : "–");

function defauts(d: Definition): Reglages {
  const r: Reglages = { a: d.defautA, b: d.defautB, graine: d.graine };
  for (const c of d.champs) r[c.cle] = c.defaut;
  return r;
}

// Les réglages dans l'adresse, pour qu'un lien rouvre la même partie.
function versAdresse(d: Definition, r: Reglages): string {
  const base = defauts(d);
  const morceaux: string[] = [];
  const ecrire = (cle: string, court: string) => {
    if (r[cle] !== base[cle]) morceaux.push(`${court}=${typeof r[cle] === "boolean" ? (r[cle] ? 1 : 0) : r[cle]}`);
  };
  ecrire("a", "a");
  ecrire("b", "b");
  for (const c of d.champs) ecrire(c.cle, c.court);
  ecrire("graine", "g");
  return morceaux.join("&");
}

function depuisAdresse(d: Definition, hash: string): Reglages {
  const r = defauts(d);
  const lu = new URLSearchParams(hash.replace(/^#/, ""));
  for (const cle of ["a", "b"]) {
    const v = lu.get(cle) ?? "";
    if (d.foules.some(([code]) => code === v)) r[cle] = v;
  }
  for (const c of d.champs) {
    if (!lu.has(c.court)) continue;
    const brut = lu.get(c.court) ?? "";
    if (c.type === "curseur") {
      const v = Number(brut);
      if (Number.isFinite(v)) r[c.cle] = Math.min(c.max, Math.max(c.min, Math.round(v)));
    } else if (c.type === "case") r[c.cle] = brut === "1";
    else {
      const option = c.options.find(([code]) => String(code) === brut);
      if (option) r[c.cle] = option[0];
    }
  }
  const g = Number(lu.get("g"));
  if (lu.has("g") && Number.isFinite(g)) r.graine = Math.min(999999, Math.max(0, Math.round(g)));
  return r;
}

// Le plan des rues, dessiné une fois.
function dessinerFond(carte: CarteJson, echelle: number): HTMLCanvasElement {
  const fond = document.createElement("canvas");
  fond.width = carte.w * echelle;
  fond.height = carte.h * echelle;
  const g = fond.getContext("2d")!;
  g.fillStyle = FOND;
  g.fillRect(0, 0, fond.width, fond.height);
  g.fillStyle = RUE;
  const bits = atob(carte.rues);
  for (let i = 0; i < carte.h * carte.w; i++) {
    if ((bits.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1) {
      g.fillRect((i % carte.w) * echelle, Math.floor(i / carte.w) * echelle, echelle, echelle);
    }
  }
  return fond;
}

// Une carte : son worker, ses images en attente, son dessin.
class Panneau {
  worker: Worker;
  images: Image[] = [];
  lu = 0;
  cle = 0;
  termine = false;
  trace: HTMLCanvasElement;
  ecart: Float32Array;

  constructor(
    private d: Definition,
    private canvas: HTMLCanvasElement,
    private carte: CarteJson,
    private fond: HTMLCanvasElement,
    surFin: (r: Resultats) => void,
    surErreur: () => void,
  ) {
    this.trace = document.createElement("canvas");
    this.trace.width = fond.width;
    this.trace.height = fond.height;
    // chaque point est décalé de quelques pixels : une foule dense fait masse
    this.ecart = new Float32Array(4000);
    for (let i = 0; i < this.ecart.length; i++) {
      const x = Math.sin(i * 12.9898) * 43758.5453;
      this.ecart[i] = ((x - Math.floor(x)) * 2 - 1) * 3;
    }
    this.worker = new Worker(`${d.base}/worker.js`, { type: "module" });
    this.worker.postMessage({ type: "carte", carte });
    // sans ça, une erreur du moteur laisserait « calcul… » affiché pour toujours
    this.worker.onerror = surErreur;
    this.worker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.cle !== this.cle) return;
      if (m.type === "image") this.images.push(m as Image);
      else if (m.type === "fin") {
        this.termine = true;
        surFin(m.resultats);
      }
    };
  }

  lancer(p: object, graine: number) {
    this.cle++;
    this.images = [];
    this.lu = 0;
    this.termine = false;
    this.trace.getContext("2d")!.clearRect(0, 0, this.trace.width, this.trace.height);
    this.worker.postMessage({ type: "jouer", cle: this.cle, params: p, graine });
  }

  rejouer() {
    this.lu = 0;
    this.trace.getContext("2d")!.clearRect(0, 0, this.trace.width, this.trace.height);
  }

  // Jusqu'où on peut lire : tout ce qui est calculé, sans limite si la partie est finie.
  dispo(): number {
    return this.termine ? Infinity : this.images.length - 1;
  }

  // Avance jusqu'au tour demandé, si le worker l'a déjà calculé.
  avancer(tour: number): Image | null {
    if (!this.images.length) return null;
    const e = this.d.echelle;
    const cible = Math.min(Math.floor(tour), this.images.length - 1);
    const g = this.trace.getContext("2d")!;
    g.fillStyle = BLEU_PALE;
    for (; this.lu <= cible; this.lu++) {
      const gens = this.images[this.lu].gens;
      for (let i = 0; i < gens.length; i += 4) g.fillRect(gens[i + 1] * e - 1, gens[i] * e - 1, e + 2, e + 2);
    }
    return this.images[cible];
  }

  dessiner(im: Image | null) {
    const g = this.canvas.getContext("2d")!;
    // sur un petit écran la carte est réduite : on grossit les marques d'autant
    const k = (Math.min(2.2, Math.max(1, 620 / (this.canvas.clientWidth || 620))) * this.canvas.width) / 880;
    g.drawImage(this.fond, 0, 0);
    g.drawImage(this.trace, 0, 0);
    this.d.dessiner(g, this.carte, im, k, this.ecart);
  }

  fermer() {
    this.worker.terminate();
  }
}

const mediane = (t: number[]) => {
  const s = t.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const finis = (t: number[]) => t.filter((x) => Number.isFinite(x));

function horloge(tours: number, secondesParTour: number): string {
  const minutes = Math.floor((tours * secondesParTour) / 60);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

function ChampReglage({ c, r, regler }: { c: Champ; r: Reglages; regler: (cle: string, v: Valeur) => void }) {
  if (c.type === "curseur") {
    return (
      <label className="sim-curseur">
        <span className="sim-curseur-nom">
          {c.nom} <strong>{c.lu(r[c.cle] as number)}</strong>
        </span>
        <input
          type="range"
          min={c.min}
          max={c.max}
          step={c.pas}
          value={r[c.cle] as number}
          onChange={(e) => regler(c.cle, Number(e.target.value))}
        />
      </label>
    );
  }
  if (c.type === "case") {
    return (
      <label className="sim-case">
        <input type="checkbox" checked={r[c.cle] as boolean} onChange={(e) => regler(c.cle, e.target.checked)} />
        <span>{c.nom}</span>
      </label>
    );
  }
  if (c.type === "choix") {
    return (
      <label className="sim-choix">
        <span>{c.nom}</span>
        <select value={r[c.cle] as string} onChange={(e) => regler(c.cle, e.target.value)}>
          {c.options.map(([code, nom]) => (
            <option key={code} value={code}>
              {nom}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <fieldset className="sim-secteur">
      <legend>{c.nom}</legend>
      {c.options.map(([code, nom]) => (
        <button
          type="button"
          key={String(code)}
          className={r[c.cle] === code ? "puce on" : "puce"}
          onClick={() => regler(c.cle, code)}
        >
          {nom}
        </button>
      ))}
      {c.aide && <p className="sim-aide">{c.aide}</p>}
    </fieldset>
  );
}

export function SimCartes({ d }: { d: Definition }) {
  const [r, setR] = useState<Reglages>(() => defauts(d));
  const [pret, setPret] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [tour, setTour] = useState(0);
  const [compteurs, setCompteurs] = useState<[number, number]>([0, 0]);
  const [fins, setFins] = useState<[Resultats | null, Resultats | null]>([null, null]);
  const [pause, setPause] = useState(false);
  const [rapide, setRapide] = useState(false);
  const [serie, setSerie] = useState<{ fait: number; a: Resultats[]; b: Resultats[] } | null>(null);
  const [copie, setCopie] = useState(false);
  const [forme, setForme] = useState("293 / 223");

  const canvasA = useRef<HTMLCanvasElement>(null);
  const canvasB = useRef<HTMLCanvasElement>(null);
  const panneaux = useRef<Panneau[]>([]);
  const carteRef = useRef<CarteJson | null>(null);
  const lecture = useRef({ tour: 0, pause: false, rapide: false, tours: 0 });
  const workersSerie = useRef<Worker[]>([]);

  // Montage : les réglages de l'adresse, la carte, les deux workers, la boucle de dessin.
  useEffect(() => {
    let vivant = true;
    let image = 0;
    // l'adresse ne se lit que dans le navigateur, après le premier rendu
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setR(depuisAdresse(d, window.location.hash));
    fetch(`${d.base}/carte.json`)
      .then((rep) => rep.json())
      .then((carte: CarteJson) => {
        if (!vivant || !canvasA.current || !canvasB.current) return;
        carteRef.current = carte;
        setForme(`${carte.w} / ${carte.h}`);
        const fond = dessinerFond(carte, d.echelle);
        panneaux.current = [canvasA.current, canvasB.current].map((canvas, i) => {
          canvas.width = fond.width;
          canvas.height = fond.height;
          return new Panneau(
            d,
            canvas,
            carte,
            fond,
            (res) => setFins((f) => (i === 0 ? [res, f[1]] : [f[0], res])),
            () => setErreur(true),
          );
        });
        setPret(true);
        let avant = performance.now();
        let dernierAffichage = 0;
        const boucle = (maintenant: number) => {
          if (!vivant) return;
          const l = lecture.current;
          // un écran lent affiche moins d'images, mais l'horloge garde son rythme
          const dt = Math.min(0.5, (maintenant - avant) / 1000);
          avant = maintenant;
          // on n'avance pas plus vite que la carte la plus lente à calculer
          const dispo = Math.min(...panneaux.current.map((p) => p.dispo()));
          // une partie peut finir avant l'heure (tout le monde est arrivé) : l'horloge s'arrête là
          const fin = panneaux.current.every((p) => p.termine)
            ? Math.max(...panneaux.current.map((p) => p.images.length - 1))
            : l.tours;
          if (!l.pause) l.tour = Math.min(l.tour + dt * d.toursParSeconde * (l.rapide ? 4 : 1), Math.max(0, dispo), fin);
          const vues = panneaux.current.map((p) => {
            const im = p.avancer(l.tour);
            p.dessiner(im);
            return im;
          });
          if (maintenant - dernierAffichage > 120) {
            dernierAffichage = maintenant;
            setTour(Math.floor(l.tour));
            setCompteurs([vues[0]?.compteur ?? 0, vues[1]?.compteur ?? 0]);
          }
          image = requestAnimationFrame(boucle);
        };
        image = requestAnimationFrame(boucle);
      })
      .catch(() => setErreur(true));
    return () => {
      vivant = false;
      cancelAnimationFrame(image);
      panneaux.current.forEach((p) => p.fermer());
      panneaux.current = [];
      workersSerie.current.forEach((w) => w.terminate());
    };
  }, [d]);

  // Tout changement de réglage relance les deux cartes, avec le même tirage.
  useEffect(() => {
    if (!pret) return;
    const minuteur = setTimeout(() => {
      lecture.current.tour = 0;
      lecture.current.tours = d.tours(r);
      setFins([null, null]);
      setSerie(null);
      workersSerie.current.forEach((w) => w.terminate());
      workersSerie.current = [];
      panneaux.current[0]?.lancer(d.params(r, r.a as string), r.graine as number);
      panneaux.current[1]?.lancer(d.params(r, r.b as string), r.graine as number);
      const adresse = versAdresse(d, r);
      window.history.replaceState(null, "", adresse ? `#${adresse}` : window.location.pathname);
    }, 250);
    return () => clearTimeout(minuteur);
  }, [d, r, pret]);

  useEffect(() => {
    lecture.current.pause = pause;
    lecture.current.rapide = rapide;
  }, [pause, rapide]);

  const regler = useCallback((cle: string, v: Valeur) => {
    setR((avant) => ({ ...avant, [cle]: v }));
  }, []);

  const rejouer = () => {
    lecture.current.tour = 0;
    panneaux.current.forEach((p) => p.rejouer());
    setPause(false);
  };

  // Plusieurs tirages du même réglage : un seul tirage peut tromper.
  const lancerSerie = () => {
    const carte = carteRef.current;
    if (!carte) return;
    workersSerie.current.forEach((w) => w.terminate());
    const graines = Array.from({ length: d.tirages }, (_, i) => (r.graine as number) + 1000 + i);
    setSerie({ fait: 0, a: [], b: [] });
    workersSerie.current = [r.a as string, r.b as string].map((foule, i) => {
      const w = new Worker(`${d.base}/worker.js`, { type: "module" });
      w.postMessage({ type: "carte", carte });
      w.onerror = () => setErreur(true);
      w.onmessage = (e: MessageEvent) => {
        if (e.data.type !== "serie") return;
        setSerie((s) =>
          s
            ? {
                fait: s.fait + 1,
                a: i === 0 ? [...s.a, e.data.resultats] : s.a,
                b: i === 1 ? [...s.b, e.data.resultats] : s.b,
              }
            : s,
        );
        if (e.data.i === e.data.total - 1) w.terminate();
      };
      w.postMessage({ type: "serie", cle: 1, params: d.params(r, foule), graines });
      return w;
    });
  };

  const copierLien = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopie(true);
      setTimeout(() => setCopie(false), 2200);
    } catch {
      // le lien reste dans la barre d'adresse
    }
  };

  const titres = [d.titre(r.a as string, r), d.titre(r.b as string, r)];
  const serieFinie = serie && serie.fait === d.tirages * 2;
  const visibles = d.champs.filter((c) => !c.si || c.si(r));
  const simples = visibles.filter((c) => !c.avance && c.type !== "segments");
  const segments = visibles.filter((c) => !c.avance && c.type === "segments");
  const avances = visibles.filter((c) => c.avance);

  return (
    <div className="sim">
      {erreur && <p className="sim-note">La simulation n&apos;a pas pu se lancer ou s&apos;est arrêtée. Rechargez la page, ou revenez aux réglages de départ.</p>}

      <div className="sim-cartes">
        {[0, 1].map((i) => {
          const [chiffre, texte] = d.compteur(compteurs[i]);
          return (
            <figure className="sim-carte" key={i}>
              <figcaption>
                <span className="sim-chiffre">{titres[i][0]}</span>
                <span className="sim-titre">{titres[i][1]}</span>
              </figcaption>
              <canvas
                ref={i === 0 ? canvasA : canvasB}
                style={{ aspectRatio: forme }}
                aria-label={`Carte de Paris, ${titres[i][0]} ${titres[i][1]}`}
              />
              <p className="sim-compteur">
                <strong>{chiffre}</strong> {texte}
              </p>
            </figure>
          );
        })}
      </div>

      <div className="sim-barre">
        <span className="mono sim-heure">{horloge(tour, d.secondesParTour)}</span>
        <button type="button" className="puce" onClick={() => setPause((p) => !p)}>
          {pause ? "Reprendre" : "Pause"}
        </button>
        <button type="button" className={rapide ? "puce on" : "puce"} onClick={() => setRapide((v) => !v)}>
          Vitesse × 4
        </button>
        <button type="button" className="puce" onClick={rejouer}>
          Revoir
        </button>
        <button type="button" className="puce" onClick={() => regler("graine", Math.floor(Math.random() * 100000))}>
          Autre tirage
        </button>
      </div>

      <ul className="sim-legende mono">
        {d.legende.map(([classe, texte]) => (
          <li key={classe}>
            <i className={classe} /> {texte}
          </li>
        ))}
      </ul>

      <section className="sim-reglages">
        <h2>Les réglages</h2>
        <div className="sim-grille">
          {(["a", "b"] as const).map((cle, i) => (
            <label className="sim-choix" key={cle}>
              <span>{i === 0 ? "Première carte" : "Deuxième carte"}</span>
              <select value={r[cle] as string} onChange={(e) => regler(cle, e.target.value)}>
                {d.foules.map(([code, nom]) => (
                  <option key={code} value={code}>
                    {nom}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {simples.map((c) => (
            <ChampReglage key={c.cle} c={c} r={r} regler={regler} />
          ))}
        </div>
        {d.aideReglages && <p className="sim-aide">{d.aideReglages}</p>}
        {segments.map((c) => (
          <ChampReglage key={c.cle} c={c} r={r} regler={regler} />
        ))}

        <details className="sim-plus">
          <summary>Plus de réglages</summary>
          <div className="sim-grille">
            {avances.map((c) => (
              <ChampReglage key={c.cle} c={c} r={r} regler={regler} />
            ))}
          </div>
          <div className="sim-barre">
            <button type="button" className="puce" onClick={() => setR({ ...defauts(d), graine: r.graine })}>
              Revenir aux réglages de départ
            </button>
          </div>
        </details>

        <div className="sim-barre">
          <button type="button" className="puce" onClick={copierLien}>
            {copie ? "Lien copié" : "Copier le lien de ce réglage"}
          </button>
        </div>
      </section>

      <section className="sim-resultats">
        <h2>Les chiffres</h2>
        <p className="sim-aide">
          Une partie seule peut tromper : d&apos;un tirage à l&apos;autre, certains chiffres changent
          beaucoup. Avant de conclure, lancez plusieurs tirages.
        </p>
        <div className="sim-barre">
          <button type="button" className="puce on" onClick={lancerSerie} disabled={!!serie && !serieFinie}>
            {serie && !serieFinie
              ? `Calcul : ${serie.fait} partie${serie.fait > 1 ? "s" : ""} sur ${d.tirages * 2}`
              : `Lancer ${d.tirages} tirages`}
          </button>
        </div>
        <table className="sim-table">
          <thead>
            <tr>
              <th scope="col">
                {serieFinie ? `Médiane de ${d.tirages} tirages (du plus bas au plus haut)` : "Cette partie"}
              </th>
              <th scope="col">{d.enTete(r.a as string)}</th>
              <th scope="col">{d.enTete(r.b as string)}</th>
            </tr>
          </thead>
          <tbody>
            {d.mesures.map((m) => (
              <tr key={m.cle}>
                <th scope="row">
                  {m.nom}
                  <span className="sim-aide">{m.aide}</span>
                </th>
                {[0, 1].map((i) => {
                  const lot = serieFinie ? finis((i === 0 ? serie.a : serie.b).map((x) => x[m.cle])) : null;
                  const fin = fins[i];
                  return (
                    <td key={i}>
                      {lot ? (
                        <>
                          <strong>{m.forme(mediane(lot))}</strong>
                          {lot.length > 0 && (
                            <span className="sim-aide">
                              {m.forme(Math.min(...lot))} à {m.forme(Math.max(...lot))}
                            </span>
                          )}
                        </>
                      ) : fin ? (
                        <strong>{m.forme(fin[m.cle])}</strong>
                      ) : (
                        <span className="sim-aide">calcul…</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
