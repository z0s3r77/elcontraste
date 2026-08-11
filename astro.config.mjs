import { defineConfig } from "astro/config";

// Salida estática pura: el resultado de `npm run build` (web/dist) lo sirve
// FastAPI en http://localhost:8000. Las islas hacen fetch a /api/*.
export default defineConfig({
  outDir: "./dist",
});
