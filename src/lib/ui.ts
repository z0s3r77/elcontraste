// Utilidades compartidas por las islas de fetch.
// En dev (astro dev, puerto 4321) la API vive en :8000; servido por FastAPI, mismo origen.
export const API = location.port === "4321" ? "http://localhost:8000" : "";

const ENTIDADES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

/** Escapa SIEMPRE antes de pintar. El pipeline ingiere HTML de terceros:
 *  pintarlo crudo es XSS almacenado con el titular de otro como vector. */
export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ENTIDADES[c]!);

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

export async function traer<T>(ruta: string): Promise<T> {
  const res = await fetch(`${API}${ruta}`);
  if (!res.ok) throw new Error(`${res.status} — ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Ficha de historia. `destacada` la pinta a tamaño de portada. */
export function ficha(c: any, destacada = false): string {
  const medios = (c.media ?? []).map((m: string) => esc(m)).join(" · ");
  const temas = (c.topics ?? [])
    .map((t: string) => `<span class="tema">${esc(t)}</span>`)
    .join("");
  const entradilla = c.entradilla
    ? `<p class="ficha-entradilla">${esc(c.entradilla)}</p>`
    : c.has_synthesis
      ? ""
      : `<p class="ficha-entradilla muted">Agrupada, todavía sin síntesis.</p>`;
  return `
    <article class="ficha${destacada ? " ficha-destacada" : ""}">
      <a class="ficha-titular" href="/cluster?id=${encodeURIComponent(c.id)}">
        ${esc(c.headline ?? "(sin titular todavía)")}
      </a>
      ${entradilla}
      <p class="ficha-pie">
        <span class="dato">${c.n_sources}</span> medios ·
        <span class="dato">${c.n_articles}</span> versiones
        ${temas ? ` · ${temas}` : ""}
        <span class="ficha-medios">${medios}</span>
      </p>
    </article>`;
}
