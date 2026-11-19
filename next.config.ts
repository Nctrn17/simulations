import type { NextConfig } from "next";

// Ce dépôt est une « zone » de walidai.fr : le site principal lui renvoie tout ce
// qui commence par /simulations. Les pages et les fichiers publics gardent donc
// leur adresse (/simulations/...), et seuls les fichiers fabriqués par Next
// passent sous /simulations-static pour ne pas se mélanger à ceux du site.
const nextConfig: NextConfig = {
  assetPrefix: "/simulations-static",
  async redirects() {
    // Hors de walidai.fr (en local, sur un aperçu), la racine n'a rien à montrer.
    return [{ source: "/", destination: "/simulations", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
