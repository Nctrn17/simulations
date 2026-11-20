import type { Metadata } from "next";
import { Nav, Pied } from "@/components/Chrome";
import { SimBeWater } from "@/components/SimBeWater";

const DESCRIPTION =
  "Un seul cortège ou vingt petits groupes : qu'est-ce que la police a le plus de mal à suivre ? Le modèle des vidéos tourne dans votre navigateur, avec des réglages à changer.";

export const metadata: Metadata = {
  title: "Be water, la simulation · walid.ai",
  description: DESCRIPTION,
  alternates: { canonical: "/simulations/be-water" },
  openGraph: {
    type: "article",
    locale: "fr_FR",
    siteName: "walid.ai",
    title: "Be water : un cortège ou vingt groupes ?",
    description: DESCRIPTION,
    url: "/simulations/be-water",
  },
};

export default function PageBeWater() {
  return (
    <div className="w">
      <Nav />
      <article className="prose sim-page">
        <span className="mono manif-date">Simulation · modèle simplifié</span>
        <h1>
          Be water
          <span className="manif-sous-titre">un cortège ou vingt groupes ?</span>
        </h1>
        <p className="chapeau-simple">
          Dix mille personnes dans le centre de Paris, ou d&apos;une des huit autres villes
          proposées. En un seul cortège, ou en petits groupes qui
          bougent : qu&apos;est-ce que la police a le plus de mal à suivre ? Le modèle des vidéos tourne
          ici, dans votre navigateur. Changez les réglages et regardez ce que ça donne.
        </p>
        <p className="sim-note">
          C&apos;est un modèle simplifié, pas une preuve et pas un mode d&apos;emploi. Aucun contact
          physique n&apos;est simulé. La police suit des règles écrites d&apos;après un seul témoignage,
          celui du 17 octobre 2026 à Paris. Dans les autres villes, ce sont les mêmes règles ; le
          parcours déclaré et la zone interdite viennent de la presse ou de la préfecture (les
          sources sont sous les cartes), les lieux que tient la police sont des hypothèses.
        </p>

        <SimBeWater />

        <section className="manif-bloc">
          <h2>Ce que le modèle ne dit pas</h2>
          <p>
            Il ne dit pas que la police est débordée. Il n&apos;y a ni fatigue, ni munitions, ni
            interpellations, ni blessés. Il ne connaît que les rues, le nombre de gens et le nombre
            d&apos;unités.
          </p>
          <p>
            Le chiffre le plus solide est le nombre de rues à fermer pour encercler tout le monde : il
            dépend seulement du plan de la ville et de l&apos;endroit où sont les gens. Les autres chiffres
            dépendent des règles ci-dessous, que vous pouvez contester.
          </p>
          <p>
            L&apos;autre simulation, à l&apos;échelle de tout Paris :{" "}
            <a href="/simulations/convergence">par toutes les portes ou par une seule ?</a>
          </p>
        </section>

        <details className="sim-regles">
          <summary>Les règles du modèle</summary>
          <ul>
            <li>Un point représente 50 personnes, une case de la carte 10 m, un tour 10 secondes.</li>
            <li>
              Parcours déclaré : la police connaît le trajet et se poste tout le long à l&apos;avance.
              Le cortège passe par trois places, dans l&apos;ordre, et fait halte à chacune : à Paris,
              de la Madeleine à l&apos;Opéra, puis au Palais-Royal. Dans les autres villes, il suit le
              dernier parcours déclaré trouvé, écrit sous les cartes, et ne s&apos;arrête qu&apos;aux places.
            </li>
            <li>
              Centre fermé par arrêté (dans les villes où un arrêté a interdit le centre) : personne
              n&apos;entre dans la zone, sauf par les rues du parcours déclaré, sur 30 m de part et
              d&apos;autre. La fermer ne coûte aucune unité de police, et elle compte comme un mur : ses
              rues ne sont pas à fermer pour encercler les gens qui la longent.
            </li>
            <li>
              Sans parcours : chaque groupe va d&apos;un point à un autre de la carte, tirés au hasard,
              et fait une pause de 10 à 20 minutes à chaque arrivée.
            </li>
            <li>
              Deux blocs de police tiennent deux lieux et ne bougent pas : à Paris, la Concorde et
              l&apos;Élysée ; ailleurs, en général la préfecture et l&apos;hôtel de ville. Les autres
              attendent autour des trois places du parcours.
            </li>
            <li>
              Un bloc qui repère 200 personnes ou plus dans son secteur se prépare, puis marche
              jusqu&apos;à elles. Il s&apos;arrête dès que les gens sont partis, ne poursuit pas, et
              rentre à sa base.
            </li>
            <li>
              Quand un bloc en marche arrive à portée, les gens proches partent en courant vers une rue
              sans police. Le groupe change de destination et se reforme plus loin. Plus il est gros,
              plus l&apos;information met du temps à circuler.
            </li>
            <li>
              La police n&apos;encercle que sur ces trois places, quand 400 personnes ou plus s&apos;y
              trouvent et qu&apos;elle a assez d&apos;unités pour fermer toutes les rues.
            </li>
            <li>
              Rues à fermer : le nombre de tronçons de rue situés à 50 m des gens. Les barrer tous
              enfermerait tout le monde.
            </li>
            <li>
              Les cartes viennent d&apos;OpenStreetMap, découpées en cases de 10 m sur 2,9 km de large
              et 2,2 km de haut. Les rues des autres villes sont triées comme celles de Paris : refaite
              de la même façon, la carte de Paris ne change que d&apos;une case sur 65 339.
            </li>
          </ul>
          <p>
            Le moteur complet se lit ici :{" "}
            <a href="/simulations/be-water/sim.js">sim.js</a>. Les mêmes règles en Python ont servi
            aux vidéos. Les deux versions n&apos;ont pas le même tirage au sort : sur douze tirages
            par réglage, leurs résultats sont comparables.
          </p>
        </details>
      </article>
      <Pied />
    </div>
  );
}
