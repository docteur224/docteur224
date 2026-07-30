import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // La rubrique s'appelait « Blog » avant de devenir « Conseils santé » :
      // un lien déjà partagé ne doit pas tomber sur un 404.
      { source: "/blog", destination: "/conseils-sante", permanent: true },
    ];
  },
};

export default nextConfig;
