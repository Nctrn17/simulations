import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// Apfel Grotezk (le texte et les titres) est déclarée dans globals.css avec
// ses deux fichiers sous public/fonts. Plex Mono ne sert qu'aux petites mentions.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: "400",
});

const MESURE = "G-VCDEHV37P1";

const TITRE = "Les simulations · walid.ai";
const DESCRIPTION =
  "Les simulations des vidéos de walid.ai, à faire tourner soi-même dans le navigateur.";

// Les adresses canoniques restent celles de walidai.fr : c'est là que les pages
// sont servies au public, ce dépôt n'en est que la source.
export const metadata: Metadata = {
  metadataBase: new URL("https://walidai.fr"),
  title: TITRE,
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "fr_FR", siteName: "Walid.ai", title: TITRE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITRE, description: DESCRIPTION },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      className={`${plexMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="preload" href="/fonts/ApfelGrotezk-Regular.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/ApfelGrotezk-Mittel.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body className="min-h-full">
        {children}
        {/* Mesure d'audience Google, volontairement sans cookie : le site ne
            demande rien pour lire, un bandeau de consentement serait la seule
            friction de la page. client_storage a "none" empeche tout depot, et
            les quatre consentements restent refuses, donc rien de durable n'est
            ecrit dans le navigateur et aucune demande n'est necessaire.

            Ce qu'on perd : distinguer un visiteur qui revient d'un nouveau. Ce
            qu'on garde : pages vues et sources de trafic, qui sont ce qu'on
            regarde. A rebasculer vers un consentement complet le jour ou le
            volume justifie de suivre les retours, ou en cas de publicite. */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${MESURE}`}
          strategy="afterInteractive"
        />
        {/* Un seul bloc : l'ordre des appels gtag compte, "consent" doit
            preceder "config". */}
        <Script id="gtag-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied'
});
gtag('js', new Date());
gtag('config', '${MESURE}', {
  client_storage: 'none',
  allow_google_signals: false,
  allow_ad_personalization_signals: false
});`}
        </Script>
      </body>
    </html>
  );
}
