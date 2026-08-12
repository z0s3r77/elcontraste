// robots.txt generado, no estático: la línea Sitemap necesita la URL absoluta
// del sitio, que solo se conoce en el build (SITE_URL → `site`).
//
// Ojo: un robots.txt solo cuenta en la RAÍZ del dominio. Mientras el sitio
// cuelgue de /<repo>/ en github.io este fichero es decorativo; empieza a valer
// el día que noticiasdoxa.es esté conectado y BASE_PATH sea "/".
import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const lineas = ["User-agent: *", "Allow: /"];
  if (site) {
    // Con BASE_PATH el sitemap no está en la raíz sino en /<repo>/.
    const ruta = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/sitemap-index.xml`;
    lineas.push("", `Sitemap: ${new URL(ruta, site).href}`);
  }

  return new Response(lineas.join("\n") + "\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
