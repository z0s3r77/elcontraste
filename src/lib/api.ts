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

/**
 * El ASUNTO de una historia (Fase 13): el mismo suceso a lo largo de los días.
 *
 * Es lo que convierte una noticia suelta en algo que se sigue. `dia` es el día
 * que va ESTA historia dentro del asunto (1 = el día en que empezó) y `n_dias`
 * lo que lleva el asunto entero.
 */
export interface Hilo {
  id: number;
  dia: number;
  n_dias: number;
  n_clusters: number;
  n_articulos: number;
  n_medios: number;
  /** `nuevo` | `sigue` | `pausa` | `apagado`. Ver `_estado()` en pipeline/hilos.py. */
  estado: string | null;
  primer_dia: string;
  ultimo_dia: string;
}

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
  /** El asunto al que pertenece. `null` si la etapa de hilos no ha pasado. */
  hilo?: Hilo | null;
  /**
   * Día del que viene la síntesis cuando NO es de esta historia sino de otra
   * del mismo asunto. La web lo DECLARA: una síntesis de anteayer sobre algo que
   * sigue vivo es justo lo que hay que saber para juzgarla.
   */
  sintesis_del_dia?: string | null;
  /**
   * Generalistas activos que no aparecen en la historia.
   * ⚠️ Se dice «no lo ha contado», NUNCA «lo ignora»: las ventanas RSS son de
   * ~25 ítems y El País da 403 en el 86 % de sus artículos, así que la ausencia
   * en la base no prueba silencio editorial.
   */
  no_lo_cuentan?: string[];
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
   * `completa` | `breve` (Fase 14). La segunda es el resumen corto que reciben
   * las historias de dos o tres medios, seis por llamada. Compañera de `mode` y
   * por el mismo motivo: las dos dicen QUÉ SE MIRÓ. Una breve viene siempre con
   * `contraste: null` — su prompt no analiza divergencias, así que un cero ahí
   * significaría «no se buscó», no «coinciden».
   */
  synthesis_kind?: string | null;
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
  /** Reparto de los asuntos del día. Es una cifra del lector, no del pipeline:
   *  cuánto de hoy es nuevo, cuánto viene de antes y cuánto se quedó sin
   *  continuación. Alimenta la banda de apertura de la portada. */
  asuntos?: { nuevos: number; siguen: number; apagados: number };
  sections: { section: string; clusters: FichaCluster[] }[];
}

/** Un asunto tal y como lo devuelve `/api/asuntos` (la lista). */
export interface Asunto {
  id: number;
  titular: string | null;
  seccion: string | null;
  primer_dia: string;
  ultimo_dia: string;
  n_dias: number;
  n_clusters: number;
  n_articulos: number;
  n_medios: number;
  estado: string | null;
  medios: string[];
  no_lo_cuentan: string[];
  /** El clúster más reciente: es por donde se entra al asunto. */
  ultimo_cluster: number | null;
}

/** Un asunto con su cronología, de `/api/asunto/{id}`. */
export interface AsuntoDetalle extends Omit<Asunto, "ultimo_cluster"> {
  cronologia: { dia: string; clusters: FichaCluster[] }[];
  explicacion: Explicacion | null;
  explicacion_del_dia: string | null;
}

export interface Sintesis {
  relato?: string | null;
  hechos_comunes?: string[];
  hechos_divergentes?: { hecho: string; solo_en?: string[] }[];
  diferencias_de_encuadre?: string | null;
  que_falta_por_saber?: string | null;
  /**
   * Personas y organismos nombrados en el relato, para ponerlos en negrita
   * (Fase 14). Opcional a propósito: las síntesis anteriores no lo traen y la
   * página tiene que seguir pintándose sin él.
   */
  entidades?: string[];
}

/**
 * La capa llana de una historia (Fase 12), de `pipeline/explicar.py`.
 *
 * `null` mientras esa etapa no haya pasado por la historia, y siempre en modo
 * agregación: la web no pinta el bloque en vez de inventárselo.
 */
export interface Explicacion {
  impacto: {
    que_ha_pasado: string;
    quien_lo_causa: string;
    efecto_directo: string;
    repercusion: string;
  };
  /** `general` | `grupo` | `indirecto`. A cuánta gente le llega de verdad. */
  alcance: string | null;
  /** Tecnicismos de ESTA historia que no están en `config/glosario.yaml`. */
  glosario: { termino: string; definicion: string }[];
  /**
   * Dónde contrastar el contexto (Fase 14). Ya resueltas por la API a partir de
   * `config/fuentes.yaml`: el modelo solo elige identificadores de una lista
   * cerrada, así que una URL de aquí no puede ser inventada.
   * Vacío es una respuesta correcta y frecuente.
   */
  fuentes?: Fuente[];
}

/** Una fuente primaria del registro `config/fuentes.yaml`. */
export interface Fuente {
  id: string;
  nombre: string;
  url: string;
  /** Qué aporta que la noticia no tiene. Se pinta bajo el nombre. */
  aporta: string;
  materias: string[];
}

export interface Historia extends FichaCluster {
  digest_date: string;
  section: string;
  synthesis: Sintesis | null;
  explicacion: Explicacion | null;
  articles: { medio: string; url: string; title: string }[];
}

/** Una entrada del diccionario del sitio, servida por `/api/glosario`. */
export interface TerminoGlosario {
  termino: string;
  definicion: string;
  ambito: string | null;
  /** Formas en que aparece escrito, ya de más larga a más corta. */
  formas: string[];
}

/** El resumen diario, de `pipeline/briefing.py`. */
export interface Resumen {
  date: string;
  titular_del_dia: string | null;
  entradilla: string | null;
  puntos: {
    cluster_id: number;
    titulo: string;
    por_que_importa: string;
    /** `ahora` | `pronto` | `fondo`. El orden del resumen ya viene dado. */
    urgencia: string;
    section: string | null;
    headline: string | null;
    n_sources: number;
    n_articles: number;
  }[];
  /**
   * La versión para escuchar, en trozos cortos (uno por locución). Sale de la
   * misma llamada que el texto y cuenta los mismos puntos en el mismo orden,
   * solo que dicho en vez de leído. Vacío = leer la página tal cual.
   */
  guion_hablado: string[];
  /**
   * ¿Hay MP3 locutado para ESTE guion? (pipeline/locucion.py). Si lo hay,
   * la página pinta reproductor; si no, el botón de la voz del navegador.
   */
  audio: boolean;
  model: string | null;
  created_at: string | null;
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

/** El diccionario del sitio. Viene por la API porque el repo público solo
 *  tiene `web/`: `config/glosario.yaml` no viaja en el espejo. */
export const glosario = () =>
  traer<{ n: number; terminos: TerminoGlosario[] }>("/api/glosario").then((r) => r.terminos);

/**
 * El resumen del último día que tenga uno.
 *
 * A diferencia del digest, esto NO tumba el build si falta: el resumen es una
 * etapa que puede caerse sola (`run_daily` es tolerante a fallos) y publicar el
 * sitio sin la página de resumen es mucho mejor que no publicarlo. La página lo
 * dice en palabras y sigue.
 */
export async function resumenUltimo(): Promise<Resumen | null> {
  try {
    return await traer<Resumen>("/api/briefing/latest");
  } catch {
    return null;
  }
}

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
