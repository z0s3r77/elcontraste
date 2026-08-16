// Marcado de tecnicismos en el relato (Fase 12).
//
// El sitio es para quien no sigue la actualidad. Un relato sobre el IPC puede
// ser impecable y no decirle nada a quien no sabe qué es «subyacente»: aquí se
// localizan esas palabras en el texto para que la página pueda pintarlas con
// su definición al lado.
//
// Corre en el BUILD, como el resto de `lib/`. Nada de esto llega al navegador.

/** Una entrada del diccionario, tal y como la sirve `/api/glosario`. */
export interface Termino {
  termino: string;
  definicion: string;
  /** Todas las formas en que aparece escrito, de más larga a más corta. */
  formas: string[];
  /** `true` cuando la definición la escribió el modelo para ESTA historia. */
  delModelo?: boolean;
}

/** Un trozo de texto ya clasificado: literal, o término con su definición. */
export type Trozo = { texto: string; termino?: Termino };

/** Escapa lo que va dentro de una clase de caracteres o una alternancia. */
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Construye el buscador de términos.
 *
 * ⚠️ **No se usa `\b`.** En JavaScript `\b` es ASCII, así que en «inflación»
 * la `ó` cuenta como frontera y `\binflación\b` no encaja nunca: media palabra
 * del castellano quedaría sin marcar. La frontera se escribe a mano con
 * lookarounds sobre `\p{L}\p{N}`, que sí entiende tildes y eñes.
 *
 * El orden de la alternancia importa: gana la primera que encaja, y las formas
 * llegan ya ordenadas de más larga a más corta (lo garantiza `/api/glosario`).
 * Sin eso, «inflación subyacente» se marcaría como «inflación» y el lector
 * vería explicada la palabra fácil en lugar de la difícil.
 */
function construirRegex(terminos: Termino[]): RegExp | null {
  const formas = terminos
    .flatMap((t) => t.formas)
    .sort((a, b) => b.length - a.length)
    .map(escapar);
  if (formas.length === 0) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(${formas.join("|")})(?![\\p{L}\\p{N}])`, "giu");
}

/** Índice forma normalizada → entrada, para resolver qué encajó. */
const indexar = (terminos: Termino[]): Map<string, Termino> => {
  const mapa = new Map<string, Termino>();
  for (const t of terminos) {
    for (const forma of t.formas) {
      const clave = forma.toLowerCase();
      if (!mapa.has(clave)) mapa.set(clave, t);
    }
  }
  return mapa;
};

/**
 * Un marcador con memoria: parte textos en trozos y marca cada término **una
 * sola vez por página**.
 *
 * Lo de "una sola vez" no es una optimización: un relato de economía menciona
 * el IPC seis veces, y seis palabras en azul en el mismo párrafo convierten la
 * prosa en un campo de minas. Se marca la primera aparición —donde el lector
 * tropieza— y las demás se leen ya sabiendo qué son.
 *
 * Se instancia UNO por página, no por párrafo, porque la memoria tiene que
 * cruzar los párrafos.
 */
export class Marcador {
  private regex: RegExp | null;
  private porForma: Map<string, Termino>;
  private usados = new Set<string>();

  constructor(terminos: Termino[]) {
    this.regex = construirRegex(terminos);
    this.porForma = indexar(terminos);
  }

  /** Parte un texto en trozos literales y trozos con término. */
  trocear(texto: string): Trozo[] {
    if (!this.regex) return [{ texto }];
    const trozos: Trozo[] = [];
    let ultimo = 0;
    // `lastIndex` se reinicia a mano: la regex es `g` y se reutiliza entre
    // llamadas, así que arrastraría la posición del texto anterior.
    this.regex.lastIndex = 0;
    for (const m of texto.matchAll(this.regex)) {
      const encontrado = m[0];
      const termino = this.porForma.get(encontrado.toLowerCase());
      if (!termino || this.usados.has(termino.termino)) continue;
      this.usados.add(termino.termino);
      const i = m.index!;
      if (i > ultimo) trozos.push({ texto: texto.slice(ultimo, i) });
      trozos.push({ texto: encontrado, termino });
      ultimo = i + encontrado.length;
    }
    if (ultimo < texto.length) trozos.push({ texto: texto.slice(ultimo) });
    return trozos;
  }
}

/**
 * Une el diccionario del sitio con los términos que el modelo definió para una
 * historia concreta.
 *
 * **El diccionario manda** (decisión del usuario, 2026-08-16): si el modelo
 * propone algo que ya está escrito a mano, gana lo escrito a mano. Es lo que
 * garantiza que el IPC signifique lo mismo el martes y el jueves — un modelo no
 * puede prometer eso, y un diccionario sí. Lo del modelo solo cubre la cola
 * larga, y va marcado como suyo para que el lector sepa qué está leyendo.
 */
export function combinar(
  diccionario: Termino[],
  delModelo: { termino: string; definicion: string }[] = [],
): Termino[] {
  const yaEstan = new Set(diccionario.flatMap((t) => t.formas).map((f) => f.toLowerCase()));
  const extra = delModelo
    .filter((t) => !yaEstan.has(t.termino.toLowerCase()))
    .map((t) => ({ ...t, formas: [t.termino], delModelo: true }));
  return [...diccionario, ...extra];
}
