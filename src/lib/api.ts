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

/** Reintentos ante 429/5xx. Ver `traer`. */
const INTENTOS = 4;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function traer<T>(ruta: string): Promise<T> {
  const url = `${BASE}${ruta}`;
  let res: Response;

  // El build hace cientos de peticiones seguidas por un quick tunnel, y
  // Cloudflare estrangula: el 2026-08-13 el build murió con 429 al pedir el
  // clúster nº 20 de 93. Un 429 no significa "no existe", significa "espera",
  // así que se espera — con backoff exponencial y respetando Retry-After.
  // Los 5xx entran en el mismo saco: por el túnel son casi siempre
  // congestión, no un fallo real de la API.
  for (let intento = 1; ; intento++) {
    try {
      res = await fetch(url, { headers: CABECERAS });
    } catch (causa) {
      throw new Error(
        `No se pudo conectar con la API en ${url}. ¿Está el backend levantado ` +
          `(docker compose up) o el túnel arriba?\n  ${causa}`,
      );
    }
    if (res.ok || intento >= INTENTOS || (res.status !== 429 && res.status < 500)) break;

    const cabecera = Number(res.headers.get("retry-after"));
    const pausa = Number.isFinite(cabecera) && cabecera > 0 ? cabecera * 1000 : 400 * 2 ** intento;
    console.warn(`  ${res.status} en ${ruta}; reintento ${intento}/${INTENTOS - 1} en ${pausa} ms`);
    await espera(pausa);
  }

  if (!res.ok) {
    throw new Error(
      `${res.status} ${res.statusText} al pedir ${url}` +
        (res.status === 429
          ? ". El túnel estranguló la petición incluso tras reintentar: baja EN_PARALELO."
          : ""),
    );
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

/** Peticiones simultáneas máximas contra la API. Ver `enLote`. */
const EN_PARALELO = 6;

/**
 * Pide muchas rutas con un tope de peticiones en vuelo.
 *
 * `Promise.all(ids.map(traer))` abre TODAS a la vez: con 93 clústeres son 93
 * conexiones simultáneas por el túnel, y ahí es donde saltó el 429. El tope
 * no hace el build más lento de forma apreciable (la latencia domina, no el
 * paralelismo) y lo hace independiente del número de historias del día, que
 * es lo que no puede seguir creciendo sin avisar.
 */
export async function enLote<T>(rutas: string[], enParalelo = EN_PARALELO): Promise<T[]> {
  const salida = new Array<T>(rutas.length);
  let siguiente = 0;

  const obrero = async () => {
    while (siguiente < rutas.length) {
      const i = siguiente++;
      salida[i] = await traer<T>(rutas[i]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(enParalelo, rutas.length) }, obrero));
  return salida;
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
  /**
   * Contraste medido sobre la síntesis (ver `_contraste` en api/main.py).
   * `null` o ausente = no hay síntesis, así que no hay NADA medido: la web
   * pinta el hueco, no un cero (regla 2 de design.md).
   */
  contraste?: {
    /** Dos o más medios dan versiones distintas del mismo hecho. */
    contradicciones: number;
    /** Un solo medio lo cuenta. Cobertura diferencial, no desacuerdo. */
    exclusivas: number;
    encuadre: boolean;
  } | null;
  /**
   * `contraste` | `agregacion`. Hace falta para leer los ceros: en agregación
   * (deportes, arte…) el prompt barato ni analiza divergencias, así que
   * `contradicciones: 0` significa "no se buscó", no "coinciden".
   */
  mode?: string | null;
  /**
   * Cobertura ponderada por la edad media de los artículos, calculada en la API
   * (`pipeline/relevancia.py`). Es el orden en el que vienen los clústeres; la
   * portada lo necesita como número porque mezcla secciones y tiene que
   * reordenar. `null` en respuestas que no la traen (el detalle de un clúster).
   */
  relevancia?: number | null;
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
  /** Modo dominante de la sección. En `agregacion` no se buscan divergencias:
   *  sus ceros no son ceros y el frontend no pinta el bloque de contraste. */
  modo: string | null;
  /** Sección entera, sin duplicar clústeres que tienen dos temas. */
  totales: {
    historias: number;
    contrastadas: number;
    contradicciones: number;
    exclusivas: number;
    articulos: number;
  };
  temas: {
    topic: string;
    historias: number;
    /** Cuántas de esas historias tienen síntesis en modo contraste. El resto
     *  no tiene NADA medido: la web pinta el hueco, no un cero. */
    contrastadas: number;
    contradicciones: number;
    exclusivas: number;
    momentum: number | null;
  }[];
  medios: { medio: string; leaning: string | null; articulos: number }[];
}

export interface Tendencia {
  topic: string;
  section: string;
  points: { day: string; n_clusters: number; n_articles: number }[];
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
