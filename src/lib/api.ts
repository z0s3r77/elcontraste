// Data layer de BUILD. Esto corre en Node durante `astro build`, nunca en el
// navegador: el sitio publicado es HTML horneado y no habla con la API.
//
// Ver docs/plan-fase-11.md, bloques B3 y E7.

/** Base de la API. En local, el contenedor; en CI, el túnel de Cloudflare. */
const BASE = (import.meta.env.API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

/** Días de digest que se hornean. Más allá, el archivo vive en la DB. */
export const VENTANA_DIAS = Number(import.meta.env.VENTANA_DIAS ?? 60);

// Cloudflare Access delante del túnel: el runner entra con un service token,
// un humano que acierte el hostname no. Vacías en local, donde no hay Access.
const CABECERAS: Record<string, string> = {};
if (import.meta.env.CF_ACCESS_CLIENT_ID && import.meta.env.CF_ACCESS_CLIENT_SECRET) {
  CABECERAS["CF-Access-Client-Id"] = import.meta.env.CF_ACCESS_CLIENT_ID;
  CABECERAS["CF-Access-Client-Secret"] = import.meta.env.CF_ACCESS_CLIENT_SECRET;
}

export async function traer<T>(ruta: string): Promise<T> {
  const url = `${BASE}${ruta}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: CABECERAS });
  } catch (causa) {
    throw new Error(
      `No se pudo conectar con la API en ${url}. ¿Está el backend levantado ` +
        `(docker compose up) o el túnel arriba?\n  ${causa}`,
    );
  }

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} al pedir ${url}`);
  }

  // Access, cuando rechaza, NO devuelve un 401 limpio: devuelve 200 con el
  // HTML de su pantalla de login. Sin esta comprobación el fallo aparece
  // cinco pasos más tarde, como un JSON.parse incomprensible.
  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) {
    throw new Error(
      `${url} devolvió "${tipo}" en vez de JSON. Suele ser la pantalla de ` +
        `login de Cloudflare Access: revisa CF_ACCESS_CLIENT_ID/SECRET.`,
    );
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------- tipos

export interface FichaCluster {
  id: number;
  headline: string | null;
  /** Medio del que sale el titular cuando NO hay síntesis. Ver _cluster_card. */
  titular_de?: string | null;
  entradilla?: string | null;
  n_articles: number;
  n_sources: number;
  media?: string[];
  topics?: string[];
  has_synthesis?: boolean;
  digest_date?: string;
  section?: string;
}

export interface Digest {
  date: string;
  n_clusters: number;
  sections: { section: string; clusters: FichaCluster[] }[];
}

export interface Sintesis {
  relato?: string | null;
  hechos_comunes?: string[];
  hechos_divergentes?: { hecho: string; solo_en?: string[] }[];
  diferencias_de_encuadre?: string | null;
  que_falta_por_saber?: string | null;
}

export interface Historia extends FichaCluster {
  digest_date: string;
  section: string;
  synthesis: Sintesis | null;
  articles: { medio: string; url: string; title: string }[];
}

export interface Radar {
  section: string;
  days: number;
  dias_de_historia: number;
  senal_fiable: boolean;
  temas: { topic: string; n_clusters: number; n_articles: number; momentum: number | null }[];
}

export interface Tendencia {
  topic: string;
  section: string;
  points: { day: string; n_clusters: number }[];
}

// ------------------------------------------------------------- consultas

export const taxonomia = () => traer<{ section: string; topics: string[] }[]>("/api/topics");

export const digests = () => traer<{ date: string; n_clusters: number }[]>("/api/digests");

/**
 * Digest más reciente, con guardarraíl.
 *
 * Publicar un sitio vacío encima de uno bueno es peor que no publicar: si el
 * pipeline no corrió, el build TIENE que caerse aquí y no desplegar nada.
 */
export async function digestUltimo(): Promise<Digest> {
  const d = await traer<Digest>("/api/digest/latest");
  const n = d.sections?.reduce((a, s) => a + s.clusters.length, 0) ?? 0;
  if (!n) {
    throw new Error(
      `El digest de ${d.date} no tiene ni un clúster. Casi seguro que el ` +
        `pipeline no ha corrido hoy: lánzalo antes de construir. ` +
        `El build se detiene aquí a propósito.`,
    );
  }
  return d;
}

/** Fechas de digest dentro de la ventana de horneado, de la más nueva a la más vieja. */
export async function fechasHorneables(): Promise<string[]> {
  const todos = await digests();
  return todos.slice(0, VENTANA_DIAS).map((d) => d.date);
}
