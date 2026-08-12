import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Salida estática pura: el resultado de `npm run build` (dist/) se publica en
// GitHub Pages. Los datos se hornean en el build (src/lib/api.ts); el sitio
// publicado NO habla con la API.
//
// Tailwind v4 entra por el plugin de Vite. El viejo `@astrojs/tailwind` está
// descontinuado y no soporta v4.
//
// SITE_URL / BASE_PATH los pone el workflow:
//   - project page  → SITE_URL=https://usuario.github.io  BASE_PATH=/el-contraste-web/
//   - dominio propio → SITE_URL=https://elcontraste.tld    BASE_PATH=/
// En local no se ponen y el sitio cuelga de la raíz, como siempre.
export default defineConfig({
  outDir: "./dist",
  site: process.env.SITE_URL ?? "http://localhost:4321",
  base: process.env.BASE_PATH ?? "/",
  trailingSlash: "always",
  vite: {
    plugins: [tailwindcss()],
  },
});
