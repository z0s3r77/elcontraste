// Helpers de presentación. Puros: sirven igual en el build y en el cliente.
//
// Ya no hay `esc()`: desde que el sitio se hornea, Astro escapa al interpolar
// con {}. Si alguna vez vuelve a aparecer un `set:html`, el escapado vuelve a
// ser tuyo — es la regla 1 de design.md y no ha dejado de valer.

// El rótulo de cada sección. La clave es el slug de `config/taxonomy.yaml`;
// una sección sin entrada aquí sale con su slug crudo, que es feo pero no
// rompe nada — `rotula()` no inventa nombres.
export const SECCIONES: Record<string, string> = {
  social: "Social",
  "politica-nacional": "Política",
  geopolitica: "Geopolítica",
  economico: "Economía",
  tecnologia: "Tecnología",
  ciencia: "Ciencia",
  deportes: "Deportes",
  arte: "Arte y cultura",
  gaming: "Gaming",
  moda: "Moda",
  kpop: "K-pop",
  "sin-clasificar": "Sin clasificar",
};

/**
 * Orden editorial de la portada. NO es alfabético ni por volumen: es el orden
 * de un periódico, y lo que va arriba es lo que abre el día. Una sección que
 * no esté aquí va al final, en el orden que traiga la API.
 *
 * ⚠️ Ordenar por número de historias (lo que hacía `/api/digest`) pone arriba
 * al cajón más lleno, que es justo la sección menos editada del día.
 */
export const ORDEN_SECCIONES = [
  "politica-nacional",
  "social",
  "geopolitica",
  "economico",
  "tecnologia",
  "ciencia",
  "deportes",
  "arte",
  "gaming",
  "moda",
  "kpop",
  "sin-clasificar",
];

/** Posición editorial de una sección; las desconocidas, al final. */
export const pesoSeccion = (s: string): number => {
  const i = ORDEN_SECCIONES.indexOf(s);
  return i === -1 ? ORDEN_SECCIONES.length : i;
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

export const urlFocos = () => `${BASE}/focos/`;

export const urlTendencias = () => `${BASE}/tendencias/`;

export const urlContacto = () => `${BASE}/contacto/`;

/** URL de un fichero de `public/`. Mismo prefijo, misma trampa: un
 *  `href="/favicon.svg"` a pelo funciona en local y 404 en /<repo>/. */
export const urlEstatico = (nombre: string) => `${BASE}/${nombre}`;
