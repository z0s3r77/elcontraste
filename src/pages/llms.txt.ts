// llms.txt (convención de llmstxt.org, no un estándar oficial): un mapa en
// Markdown para que un asistente de IA entienda de un vistazo qué es el
// sitio y a qué páginas ir, sin tener que rastrear ni adivinar por la
// maqueta. Generado, no estático, por el mismo motivo que robots.txt: la
// URL absoluta de cada enlace solo se conoce en el build (SITE_URL → `site`).
//
// Esto NO sustituye al JSON-LD de cada historia (Base.astro/[id].astro): el
// JSON-LD describe UNA página, este fichero describe el SITIO entero.
import type { APIRoute } from "astro";
import { taxonomia } from "../lib/api";
import { ORDEN_SECCIONES, SECCIONES } from "../lib/ui";

export const GET: APIRoute = async ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const abs = (ruta: string) => (site ? new URL(`${base}${ruta}`, site).href : `${base}${ruta}`);

  // MISMA fuente que src/pages/seccion/[seccion]/index.astro: la taxonomía
  // real, no la tabla de rótulos de ui.ts. `SECCIONES` incluye "sin-clasificar"
  // como etiqueta de repuesto para una historia sin sección, pero esa sección
  // NUNCA se hornea como página — listarla aquí sería un enlace muerto.
  const tax = await taxonomia();
  const activas = new Set(tax.map((t) => t.section));
  const secciones = ORDEN_SECCIONES.filter((s) => activas.has(s) && SECCIONES[s]).map(
    (s) => `- [${SECCIONES[s]}](${abs(`/seccion/${s}/`)})`,
  );

  const lineas = [
    "# La Doxa",
    "",
    "> Agregador personal de prensa española: agrupa las versiones que dan " +
      "distintos medios de la misma noticia y muestra en qué coinciden, en qué " +
      "se contradicen y qué cuenta solo uno. Sin ánimo de lucro, sin publicidad, " +
      "sin cuenta de usuario.",
    "",
    "Cada historia (`/cluster/<id>/`) lleva datos estructurados propios " +
      "(schema.org NewsArticle) con relato, fecha y citas a los originales: " +
      "es la fuente más fiable página a página. Este fichero es solo el mapa.",
    "",
    "## Secciones",
    "",
    ...secciones,
    "",
    "## Páginas",
    "",
    `- [Portada](${abs("/")}) — la primera plana del día, ordenada por relevancia.`,
    `- [Resumen diario](${abs("/resumen/")}) — 4-7 puntos con «por qué importa», con audio.`,
    `- [Focos](${abs("/focos/")}) — qué cubre mucho la prensa y qué cubre poco, un día dado.`,
    `- [Tendencias](${abs("/tendencias/")}) — qué asuntos llevan más tiempo abiertos.`,
    `- [Contacto](${abs("/contacto/")})`,
    "",
    "## Aviso",
    "",
    "No se republica el texto de los medios ni se sortean muros de pago: " +
      "cada historia enlaza a los artículos originales, que son la fuente " +
      "primaria. Las síntesis las escribe un modelo de lenguaje y pueden " +
      "contener errores.",
    "",
    `Mapa completo: [sitemap](${abs("/sitemap-index.xml")})`,
    "",
  ];

  return new Response(lineas.join("\n"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
