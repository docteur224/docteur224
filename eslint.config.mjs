import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Sortie de compilation de `scripts/test-smtp.mjs`, régénérée à chaque
    // exécution : du CommonJS produit par tsc, qu'on n'écrit ni ne relit.
    "scripts/.tmp-messagerie/**",
  ]),
]);

export default eslintConfig;
