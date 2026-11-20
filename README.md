# Les simulations de walid.ai

Le code des pages [walidai.fr/simulations](https://walidai.fr/simulations) : des modèles
simplifiés qui tournent dans le navigateur, avec des réglages à changer.

- **Be water** : un cortège ou vingt groupes dans le centre de Paris.
- **La convergence** : des portes de Paris vers Châtelet, en petits groupes ou en un cortège.

Ce sont des modèles simplifiés, pas des preuves et pas des modes d'emploi. Aucun contact
physique n'est simulé. Les règles sont écrites sur chaque page.

## Lancer le site chez vous

Il faut [Node.js](https://nodejs.org) 20 ou plus récent.

```bash
git clone https://github.com/Nctrn17/simulations.git
cd simulations
npm install
npm run dev
```

Puis ouvrez http://localhost:3000/simulations.

## Où est quoi

| Dossier | Contenu |
| --- | --- |
| `public/simulations/<nom>/sim.js` | Le moteur d'une simulation, sans aucune dépendance. |
| `public/simulations/<nom>/carte.json` | La carte sur laquelle il tourne. |
| `public/simulations/commun.js`, `worker-commun.js` | Le tirage au sort, la lecture des cartes, le fil d'exécution séparé. |
| `src/components/SimCartes.tsx` | Le cadre commun : deux cartes, les réglages, le lien à partager, la série de tirages. |
| `src/components/SimBeWater.tsx`, `SimConvergence.tsx` | Ce que chaque simulation décrit : ses réglages, ses mesures, son dessin. |
| `src/app/simulations/` | Les trois pages et leurs textes. |
| `src/components/Chrome.tsx`, `src/app/globals.css` | L'habillage de walidai.fr, recopié ici. |
| `scripts/`, `reference/` | La vérification des moteurs (voir plus bas). |

## Le format d'une carte

Une carte est une grille de cases de 10 m. Le fichier `carte.json` contient :

- `h`, `w` : la hauteur et la largeur de la grille, en cases.
- `n` : le nombre de cases de rue.
- `rues` : la grille, une case par bit, ligne par ligne en partant du haut à gauche. Un bit
  à 1 est une rue. Les bits sont rangés par octets, le bit de poids fort en premier, et le
  tout est écrit en base64.
- `lieux` (Be water) ou `portes` et `centre` (la convergence) : des points nommés, chacun
  sous la forme `[ligne, colonne]`. Chaque point doit tomber sur une case de rue.

Les deux cartes de Paris viennent des données OpenStreetMap, découpées en cases par
`osm_map.py` du dépôt [nasse-sim](https://github.com/Nctrn17/nasse-sim).

Aujourd'hui, les pages ne savent montrer que Paris : les noms des lieux sont écrits dans
les moteurs (`POSITIONS`, `SITES_NASSE` dans `be-water/sim.js`) et dans les composants.
Ajouter une ville demande donc une carte, ses lieux, et un moyen de choisir la ville dans
la page.

## Vérifier un moteur

Les moteurs sont un portage en JavaScript des modèles Python de nasse-sim. Après toute
retouche d'un `sim.js` :

```bash
npm run verifier
```

Le script rejoue chaque réglage et compare les résultats à ceux du modèle Python, rangés
dans `reference/`. Il doit finir sur « 0 écart(s) ». Comptez une dizaine de minutes. Il ne
passe pas par le navigateur : ouvrez aussi la page pour voir que la carte s'anime.

Si votre changement modifie volontairement les règles du modèle, les résultats de
référence ne tiennent plus : dites-le dans votre proposition.

Une retouche qui ne doit rien changer aux règles (une optimisation, un nettoyage) se
vérifie aussi au bit près, en une dizaine de secondes :

```bash
npm run verifier:exact
```

Le script rejoue quelques parties aux graines fixes et compare chaque tour et chaque
résultat à `reference/empreintes.json`. Il doit finir sur « 0 écart(s) ». Si vous changez
les règles exprès, réécrivez ces empreintes avec
`node scripts/verifier-exact.mjs --ecrire`, après `npm run verifier`.

## Proposer un changement

Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licences

Le code est sous licence MIT (voir [LICENSE](LICENSE)).

Les cartes (`carte.json`) sont dérivées d'OpenStreetMap : © les contributeurs
OpenStreetMap, données sous [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

La police Apfel Grotezk est publiée par Collletttivo sous SIL Open Font License.
