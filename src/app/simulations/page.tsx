import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Pied } from "@/components/Chrome";

const DESCRIPTION =
  "Les simulations des vidéos, à faire tourner soi-même : un cortège ou vingt groupes dans le centre de Paris, et la convergence des portes vers Châtelet. Avec des réglages à changer.";

export const metadata: Metadata = {
  title: "Les simulations · walid.ai",
  description: DESCRIPTION,
  alternates: { canonical: "/simulations" },
  openGraph: {
    type: "article",
    locale: "fr_FR",
    siteName: "walid.ai",
    title: "Les simulations, à faire tourner vous-même",
    description: DESCRIPTION,
    url: "/simulations",
  },
};

const SIMULATIONS = [
  {
    href: "/simulations/be-water",
    titre: "Be water",
    question: "Un cortège ou vingt groupes ?",
    texte:
      "Dix mille personnes dans le centre de Paris. Vous réglez le nombre de groupes, le nombre de policiers, d'où viennent les renforts.",
  },
  {
    href: "/simulations/convergence",
    titre: "La convergence",
    question: "Par toutes les portes ou par une seule ?",
    texte:
      "Dix mille personnes partent des portes de Paris vers Châtelet. Vous réglez la porte du cortège et le nombre de rues que la police barre.",
  },
];

export default function PageSimulations() {
  return (
    <div className="w">
      <Nav />
      <article className="prose">
        <span className="mono manif-date">Simulations · modèles simplifiés</span>
        <h1>
          Les simulations
          <span className="manif-sous-titre">à faire tourner vous-même</span>
        </h1>
        <p className="chapeau-simple">
          Les modèles des vidéos tournent ici, dans votre navigateur. Changez les réglages, lancez
          plusieurs tirages, envoyez votre réglage à quelqu&apos;un : le lien garde tout.
        </p>
        {SIMULATIONS.map((s) => (
          <section className="manif-bloc" key={s.href}>
            <h2>
              <Link href={s.href}>{s.titre}</Link>
            </h2>
            <p>
              <strong>{s.question}</strong> {s.texte}
            </p>
          </section>
        ))}
        <p className="sim-note">
          Ce sont des modèles simplifiés, pas des preuves et pas des modes d&apos;emploi. Aucun contact
          physique n&apos;est simulé. Les règles sont écrites sur chaque page, et vous pouvez les
          contester.
        </p>
      </article>
      <Pied />
    </div>
  );
}
