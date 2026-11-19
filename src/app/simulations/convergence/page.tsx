import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Pied } from "@/components/Chrome";
import { SimConvergence } from "@/components/SimConvergence";

const DESCRIPTION =
  "Dix mille personnes partent des portes de Paris vers Châtelet, en petits groupes ou en un seul cortège. Combien de rues la police doit-elle barrer pour les arrêter ? Le modèle tourne dans votre navigateur.";

export const metadata: Metadata = {
  title: "La convergence, la simulation · walid.ai",
  description: DESCRIPTION,
  alternates: { canonical: "/simulations/convergence" },
  openGraph: {
    type: "article",
    locale: "fr_FR",
    siteName: "walid.ai",
    title: "La convergence : par toutes les portes ou par une seule ?",
    description: DESCRIPTION,
    url: "/simulations/convergence",
  },
};

export default function PageConvergence() {
  return (
    <div className="w">
      <Nav />
      <article className="prose sim-page">
        <span className="mono manif-date">Simulation · modèle simplifié</span>
        <h1>
          La convergence
          <span className="manif-sous-titre">par toutes les portes ou par une seule ?</span>
        </h1>
        <p className="chapeau-simple">
          Dix mille personnes partent des portes de Paris et marchent vers Châtelet. En petits groupes
          par les 19 portes, ou toutes ensemble par une seule : combien de rues la police doit-elle
          barrer pour les arrêter ? Changez les réglages et regardez ce que ça donne.
        </p>
        <p className="sim-note">
          C&apos;est un modèle simplifié, pas une preuve et pas un mode d&apos;emploi. Aucun contact
          physique n&apos;est simulé. Le nombre et le comportement des unités de police sont des
          hypothèses.
        </p>

        <SimConvergence />

        <section className="manif-bloc">
          <h2>Ce que le modèle ne dit pas</h2>
          <p>
            « Pas arrivé » veut dire pas à Châtelet à la fin du temps : ces gens sont encore dans les
            rues autour, le modèle ne dit rien de ce qui leur arrive. Il n&apos;y a ni fatigue, ni
            transports, ni interpellations, ni passants.
          </p>
          <p>
            Le chiffre le plus solide est le nombre de rues d&apos;approche utilisées : il dépend
            surtout du plan de Paris. Les autres dépendent des règles ci-dessous, que vous pouvez
            contester.
          </p>
          <p>
            L&apos;autre simulation, dans le centre de Paris :{" "}
            <Link href="/simulations/be-water">un cortège ou vingt groupes ?</Link>
          </p>
        </section>

        <details className="sim-regles">
          <summary>Les règles du modèle</summary>
          <ul>
            <li>
              Un point représente 50 personnes, une case de la carte 20 m, un tour 15 secondes. On
              marche à 1,3 m par seconde.
            </li>
            <li>
              Petits groupes : les gens sont répartis sur les 19 portes et partent en 2 minutes.
              Chacun prend le chemin le plus court vers Châtelet. Quand il voit la police, les rues
              proches d&apos;elle lui coûtent plus cher et il en prend une autre. Personne ne
              coordonne.
            </li>
            <li>
              Cortège : tout le monde part de la même porte. Le cortège ne change de chemin qu&apos;en
              bloc, quand sa tête voit la police, et met du temps à se décider.
            </li>
            <li>Une rue bouche quand trop de monde s&apos;y trouve : les suivants ralentissent ou contournent.</li>
            <li>
              Police qui barre : le dernier kilomètre autour de Châtelet est traversé par 32 rues. À
              intervalle régulier, la police regarde qui approche et place ses barrages sur les rues
              où elle voit venir le plus de monde. Un barrage tient toute la rue, on ne passe pas.
            </li>
            <li>
              Police qui avance : 2 blocs fixes à 400 m du centre, et des blocs mobiles sur un anneau à
              1,5 km. Un bloc mobile repère une foule près de sa base, se prépare, marche vers elle,
              s&apos;arrête dès que plus personne n&apos;est à 100 m, ne poursuit pas et rentre.
            </li>
            <li>Arrivé : à moins de 160 m de Châtelet. Au contact : un bloc à moins de 40 m.</li>
          </ul>
          <p>
            Le moteur complet se lit ici : <a href="/simulations/convergence/sim.js">sim.js</a>. Les
            mêmes règles en Python ont servi aux vidéos. Les deux versions n&apos;ont pas le même tirage
            au sort : sur dix tirages par réglage, leurs résultats sont comparables.
          </p>
        </details>
      </article>
      <Pied />
    </div>
  );
}
