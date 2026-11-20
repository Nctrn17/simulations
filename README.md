# Les simulations de walid.ai

Le code des pages [walidai.fr/simulations](https://walidai.fr/simulations) : des modèles
simplifiés qui tournent dans le navigateur, avec des réglages à changer.

- **Be water** : un cortège ou vingt groupes dans le centre de Paris ou de huit autres villes.
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
| `public/simulations/<nom>/carte.json` | La carte sur laquelle il tourne (Paris). |
| `public/simulations/be-water/villes/` | Les cartes des autres villes de Be water. |
| `public/simulations/commun.js`, `worker-commun.js` | Le tirage au sort, la lecture des cartes, le fil d'exécution séparé. |
| `src/components/SimCartes.tsx` | Le cadre commun : deux cartes, les réglages, le lien à partager, la série de tirages. |
| `src/components/SimBeWater.tsx`, `SimConvergence.tsx` | Ce que chaque simulation décrit : ses réglages, ses mesures, son dessin. |
| `src/app/simulations/` | Les trois pages et leurs textes. |
| `src/components/Chrome.tsx`, `src/app/globals.css` | L'habillage de walidai.fr, recopié ici. |
| `scripts/`, `reference/` | La vérification des moteurs et la fabrication des cartes (voir plus bas). |

## Le format d'une carte

Une carte est une grille de cases de 10 m. Le fichier `carte.json` contient :

- `h`, `w` : la hauteur et la largeur de la grille, en cases.
- `n` : le nombre de cases de rue.
- `rues` : la grille, une case par bit, ligne par ligne en partant du haut à gauche. Un bit
  à 1 est une rue. Les bits sont rangés par octets, le bit de poids fort en premier, et le
  tout est écrit en base64.
- `lieux` (Be water) ou `portes` et `centre` (la convergence) : des points nommés, chacun
  sous la forme `[ligne, colonne]`. Chaque point doit tomber sur une case de rue.
- Be water seulement : `tenus`, les lieux que la police tient sans bouger, et `nasses`,
  les places où elle peut encercler (des noms de `lieux`) ; `parcours`, les étapes du
  parcours déclaré, du départ à l'arrivée (les `nasses` si absent, comme à Paris) ; `noms`,
  le nom affiché de chaque lieu ; `nom`, la ville. Les cartes fabriquées ajoutent `source`,
  `date` (celle de l'extrait OpenStreetMap), `centre_degres`, le centre du quartier en
  latitude et longitude, `parcours_info` (`date`, `source`, `url` du parcours déclaré) et,
  quand un arrêté a interdit le centre, `zone` : les mêmes champs, un `texte`, et
  `polygones`, des listes de points `[ligne, colonne]` en cases fractionnaires.

Les deux cartes de Paris viennent des données OpenStreetMap, découpées en cases par
`osm_map.py` du dépôt [nasse-sim](https://github.com/Nctrn17/nasse-sim). La carte de Be
water n'en garde que le plus grand réseau de rues d'un seul tenant.

## Ajouter une ville à Be water

1. Ajoutez la ville à `scripts/villes-be-water.json` : ses lieux tenus (nom affiché et
   coordonnées en degrés) ; son dernier parcours déclaré, avec sa date, sa source et ses
   étapes du départ à l'arrivée, chacune en degrés ou comme carrefour de deux voies
   (`{"carrefour": ["Cours Gambetta", "Avenue Maréchal de Saxe"]}`, noms d'OpenStreetMap) ;
   ses trois places, prises parmi les étapes ; et, si un arrêté a interdit le centre, sa
   zone en polygones de degrés (ou `"interieur"` : ce que le parcours entoure). Le départ
   et l'arrivée en degrés suffisent à centrer la carte.
2. Fabriquez sa carte (il faut un accès à internet, le script interroge Overpass) :

   ```bash
   node scripts/fabriquer-villes.mjs nom_de_la_ville
   ```

   La carte arrive dans `public/simulations/be-water/villes/`. Le script prévient si un
   lieu tombe loin d'une rue ou près du bord, s'il ne trouve pas un carrefour (avec les
   noms de voies proches) et si le parcours passe sur un lieu tenu, où la foule ne passe pas.
3. Ajoutez la ville à la liste `VILLES` de `src/components/SimBeWater.tsx`, puis ouvrez la
   page et choisissez-la.

Le script reprend la méthode d'`osm_map.py` (`scripts/carte-osm.mjs` en est le portage :
il refait à l'identique la grande grille de Paris de nasse-sim à partir des mêmes rues).
Les rues sont triées comme dans nasse-sim, ce qui a été retrouvé en comparant ses données
à celles d'OpenStreetMap : refaite ainsi depuis OpenStreetMap, la carte Be water de Paris
ne change que d'une case sur 65 339.

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

Les cartes (`carte.json` et `villes/*.json`) sont dérivées d'OpenStreetMap : © les contributeurs
OpenStreetMap, données sous [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

La police Apfel Grotezk est publiée par Collletttivo sous SIL Open Font License.
