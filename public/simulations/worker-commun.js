// Fait tourner une simulation hors de la page, pour que l'affichage ne saccade pas.
//
// Messages reçus :
//   { type: "carte", carte }                          la carte, une fois
//   { type: "jouer", cle, params, graine }            une partie, image par image
//   { type: "serie", cle, params, graines }           plusieurs parties, résultats seuls
//   { type: "stop" }                                  abandonne ce qui tourne
//
// Chaque simulation fournit Carte, Partie (avec pas(), terminee, image(), resultats()) et config.
export function brancher({ Carte, Partie, config }) {
  let carte = null;
  let tache = 0;

  function jouer(m) {
    const id = ++tache;
    const partie = new Partie(carte, config(m.params), m.graine);
    const envoyer = () => {
      const im = partie.image();
      self.postMessage({ type: "image", cle: m.cle, ...im }, [im.gens.buffer, im.police.buffer, im.barrages.buffer]);
    };
    envoyer();
    const boucle = () => {
      if (id !== tache) return;
      const fin = performance.now() + 12;
      while (!partie.terminee && performance.now() < fin) {
        partie.pas();
        envoyer();
      }
      if (!partie.terminee) setTimeout(boucle, 0);
      else self.postMessage({ type: "fin", cle: m.cle, resultats: partie.resultats() });
    };
    setTimeout(boucle, 0);
  }

  function serie(m) {
    const id = ++tache;
    let i = 0;
    let partie = null;
    const boucle = () => {
      if (id !== tache) return;
      if (!partie) partie = new Partie(carte, config(m.params), m.graines[i]);
      const fin = performance.now() + 30;
      while (!partie.terminee && performance.now() < fin) partie.pas();
      if (partie.terminee) {
        self.postMessage({ type: "serie", cle: m.cle, i, total: m.graines.length, resultats: partie.resultats() });
        partie = null;
        i++;
      }
      if (i < m.graines.length) setTimeout(boucle, 0);
    };
    setTimeout(boucle, 0);
  }

  self.onmessage = (e) => {
    const m = e.data;
    if (m.type === "carte") carte = new Carte(m.carte);
    else if (m.type === "stop") tache++;
    else if (m.type === "jouer") jouer(m);
    else if (m.type === "serie") serie(m);
  };
}
