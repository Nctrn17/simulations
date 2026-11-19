import Link from "next/link";
import { Nav, Pied, SITE } from "@/components/Chrome";

export default function NotFound() {
  return (
    <div className="w">
      <Nav />
      <main className="g page-simple">
        <span className="marge mono">Erreur 404</span>
        <div className="contenu">
          <h1>Cette page n&apos;existe pas.</h1>
          <p className="chapeau-simple">
            Le lien est peut-être ancien, ou la page a changé d&apos;adresse.
          </p>
          <p>
            <Link href="/simulations" className="lien-fort">
              Les simulations
            </Link>{" "}
            ·{" "}
            <a href={`${SITE}/`} className="souligne">
              Retour à l&apos;accueil
            </a>
          </p>
        </div>
      </main>
      <Pied />
    </div>
  );
}
