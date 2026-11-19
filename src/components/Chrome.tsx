// L'en-tête et le pied de page de walidai.fr, recopiés ici pour que les pages
// aient le même habillage. Ce dépôt ne sert que /simulations : tous les autres
// liens partent vers le site principal, donc en adresse complète et en balise
// <a> (pas de <Link>, qui chercherait la page dans ce dépôt).
export const SITE = "https://walidai.fr";
export const TIKTOK = "https://www.tiktok.com/@walid.ai_";
export const YOUTUBE = "https://www.youtube.com/channel/UCP63kPTHN1N2uHe53wNcHog";
export const X = "https://x.com/walidai_";
export const DISCORD = `${SITE}/discord`;
export const DEPOT = "https://github.com/Nctrn17/simulations";

const POSTES_NAV = [
  { slug: "apprendre", nom: "Apprendre" },
  { slug: "fabriquer", nom: "Fabriquer" },
  { slug: "demonter", nom: "Démonter" },
  { slug: "veiller", nom: "Veiller" },
] as const;

export function Nav() {
  return (
    <nav className="g tete papier">
      <a href={`${SITE}/`} className="marque">
        walid.ai
      </a>
      <span className="postes">
        {POSTES_NAV.map((p) => (
          <a key={p.slug} href={`${SITE}/${p.slug}`}>
            {p.nom}
          </a>
        ))}
      </span>
      <span className="reseaux">
        <a href={TIKTOK} rel="me noopener">
          TikTok
        </a>
        <a href={YOUTUBE} rel="me noopener">
          YouTube
        </a>
      </span>
    </nav>
  );
}

export function Pied() {
  return (
    <footer className="g colophon">
      <span className="marge mono">Colophon</span>
      <span className="archives-phrase">
        Les astuces télé, téléphone et PC d&apos;avant sont aux{" "}
        <a href={`${SITE}/archives`}>archives</a>. Rien à créer, rien à payer pour
        lire.
      </span>
      <span className="liens-pied">
        <a href={TIKTOK} rel="me noopener">
          TikTok
        </a>
        <a href={DISCORD}>Discord</a>
        <a href={X} rel="me noopener">
          X
        </a>
        <a href={YOUTUBE} rel="me noopener">
          YouTube
        </a>
        <a href={`${SITE}/a-propos`}>À propos</a>
        <a href={`${SITE}/mentions-legales`}>Mentions</a>
        <a href={`${SITE}/confidentialite`}>Confidentialité</a>
      </span>
    </footer>
  );
}
