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

/**
 * Las marcas tipográficas que puede llevar un trozo, aparte del glosario.
 *
 * - `nombre` → negrita. Medios y entidades: quién dice cada cosa y de quién se
 *   habla. En un relato donde la atribución es la regla que sostiene el
 *   producto («según ABC», «solo El Mundo menciona»), dejarla como texto plano
 *   la esconde.
 * - `cita` → cursiva. Lo entrecomillado, con sus comillas dentro.
 */
export type Marca = "nombre" | "cita";

/** Un trozo de texto ya clasificado: literal, término del glosario, o marcado. */
export type Trozo = { texto: string; termino?: Termino; marca?: Marca };

/**
 * Lo entrecomillado, en dos formas.
 *
 * ⚠️ Medido sobre los 143 relatos que había en la base el 2026-08-19: el
 * modelo escribe **comillas rectas** (152 apariciones, en 32 relatos) y casi
 * nunca latinas (8, en 5). Marcar solo `«»` —que es lo correcto en español y lo
 * que ahora pide el prompt— habría cubierto **5 de 143**. Se aceptan las dos
 * para que lo ya publicado también gane la cursiva.
 *
 * El contenido no cruza saltos de línea ni pasa de 300 caracteres: una comilla
 * suelta y sin pareja no puede tragarse medio relato.
 */
const CITA = String.raw`«[^»\n]{1,300}»|"[^"\n]{1,300}"`;

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
function construirRegex(terminos: Termino[], nombres: string[]): RegExp | null {
  const formas = [...terminos.flatMap((t) => t.formas), ...nombres]
    .sort((a, b) => b.length - a.length)
    .map(escapar);
  const alternativas: string[] = [`(?<cita>${CITA})`];
  if (formas.length > 0) {
    alternativas.push(
      `(?<![\\p{L}\\p{N}])(?<palabra>${formas.join("|")})(?![\\p{L}\\p{N}])`,
    );
  }
  return new RegExp(alternativas.join("|"), "giu");
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
  /** minúsculas → nombre con su caja original, para exigirla al encajar. */
  private nombres: Map<string, string>;
  private usados = new Set<string>();

  /**
   * @param terminos  El diccionario del glosario, ya combinado con lo del modelo.
   * @param nombres   Medios y entidades a poner en negrita. **Se exige la caja
   *                  exacta** (ver `trocear`).
   */
  constructor(terminos: Termino[], nombres: string[] = []) {
    this.regex = construirRegex(terminos, nombres);
    this.porForma = indexar(terminos);
    this.nombres = new Map(nombres.map((n) => [n.toLowerCase(), n]));
  }

  /** Parte un texto en trozos: literales, términos del glosario y marcas. */
  trocear(texto: string): Trozo[] {
    if (!this.regex) return [{ texto }];
    const trozos: Trozo[] = [];
    let ultimo = 0;
    // `lastIndex` se reinicia a mano: la regex es `g` y se reutiliza entre
    // llamadas, así que arrastraría la posición del texto anterior.
    this.regex.lastIndex = 0;
    for (const m of texto.matchAll(this.regex)) {
      const encontrado = m[0];
      const trozo = m.groups?.cita
        ? ({ texto: encontrado, marca: "cita" } as Trozo)
        : this.clasificarPalabra(encontrado);
      if (!trozo) continue;
      const i = m.index!;
      if (i > ultimo) trozos.push({ texto: texto.slice(ultimo, i) });
      trozos.push(trozo);
      ultimo = i + encontrado.length;
    }
    if (ultimo < texto.length) trozos.push({ texto: texto.slice(ultimo) });
    return trozos;
  }

  /**
   * Decide si una palabra encajada es término, nombre, o nada. `null` = se deja
   * como texto plano y el troceador sigue.
   *
   * **El glosario gana siempre**: una definición dice más que una negrita, y si
   * el mismo texto es las dos cosas el lector se lleva la información, no el
   * énfasis.
   */
  private clasificarPalabra(encontrado: string): Trozo | null {
    const clave = encontrado.toLowerCase();

    const termino = this.porForma.get(clave);
    if (termino) {
      if (this.usados.has(termino.termino)) return null;
      this.usados.add(termino.termino);
      return { texto: encontrado, termino };
    }

    const nombre = this.nombres.get(clave);
    if (!nombre) return null;
    // ⚠️ **La caja tiene que coincidir exactamente.** La regex es `i` porque el
    // glosario la necesita, y sin esta comprobación el medio «El Mundo» pondría
    // en negrita «el mundo» en «una decisión que cambió el mundo»: un nombre
    // propio inventado en mitad de una frase corriente. Mismo problema que
    // resolvió `formas:` en el glosario cuando «fiscal» marcaba el adjetivo de
    // «rebaja fiscal», y misma lección: encajar no es acertar.
    if (encontrado !== nombre) return null;
    const marcaUsada = `nombre:${nombre}`;
    if (this.usados.has(marcaUsada)) return null;
    this.usados.add(marcaUsada);
    return { texto: encontrado, marca: "nombre" };
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
