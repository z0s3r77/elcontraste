// Helpers de presentación. Puros: sirven igual en el build y en el cliente.
//
// Ya no hay `esc()`: desde que el sitio se hornea, Astro escapa al interpolar
// con {}. Si alguna vez vuelve a aparecer un `set:html`, el escapado vuelve a
// ser tuyo — es la regla 1 de design.md y no ha dejado de valer.

export const SECCIONES: Record<string, string> = {
  social: "Social",
  geopolitica: "Geopolítica",
  economico: "Economía",
  deportes: "Deportes",
  arte: "Arte y cultura",
  gaming: "Gaming",
  moda: "Moda",
  kpop: "K-pop",
  tecnologia: "Tecnología",
  "sin-clasificar": "Sin clasificar",
};

export const rotula = (s: string): string => SECCIONES[s] ?? s;

/** Numeral de banda al estilo editorial: 01, 02, 03… */
export const numeral = (i: number): string => String(i + 1).padStart(2, "0");

/** Parte un texto en párrafos (línea en blanco) y líneas (salto simple). */
export const parrafos = (texto: string): string[][] =>
  texto
    .split(/\n{2,}/)
    .map((p) => p.split("\n"))
    .filter((p) => p.join("").trim() !== "");

// Prefijo de todas las URLs internas. En un *project page* de GitHub el sitio
// no cuelga de la raíz sino de /<repo>/, y Astro NO reescribe los href que
// escribimos a mano: sin este prefijo, con dominio propio funciona y en
// usuario.github.io/repo se rompen TODOS los enlaces. Con dominio propio
// BASE_URL es "/" y esto no hace nada.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const urlInicio = () => `${BASE}/`;

/** URL de una historia. Estático: ruta, no query string. */
export const urlCluster = (id: number | string) => `${BASE}/cluster/${id}/`;

/** URL de sección, con tema opcional. */
export const urlSeccion = (s: string, tema?: string | null) =>
  tema ? `${BASE}/seccion/${s}/${tema}/` : `${BASE}/seccion/${s}/`;

export const urlRadar = (s: string) => `${BASE}/radar/${s}/`;

export const urlTendencias = () => `${BASE}/tendencias/`;

export const urlContacto = () => `${BASE}/contacto/`;

/** URL de un fichero de `public/`. Mismo prefijo, misma trampa: un
 *  `href="/favicon.svg"` a pelo funciona en local y 404 en /<repo>/. */
export const urlEstatico = (nombre: string) => `${BASE}/${nombre}`;
