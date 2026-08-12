# La Doxa — el sitio

Front de **La Doxa**, un agregador de noticias contrastadas: agrupa las
versiones que distintos medios dan de la misma noticia y muestra en qué
coinciden y en qué divergen.

Esto es **solo la web**. El pipeline que ingiere, agrupa, clasifica y sintetiza
vive en un repositorio privado.

## Cómo funciona

El sitio es **HTML estático**. No hay backend detrás de la página publicada:
los datos se hornean en el momento del build.

```
astro build ──► pide los datos a la API (que corre en un portátil,
                expuesta por un túnel de Cloudflare con Access)
            ──► genera ~180 páginas con el contenido dentro
            ──► GitHub Pages las sirve
```

Consecuencias, y son deliberadas:

- La web funciona aunque el backend esté apagado. Lo que ve el lector es la
  foto del último build.
- El digest se actualiza cuando se lanza el workflow a mano, no solo.
- No hay peticiones a ninguna API desde el navegador. El único JavaScript que
  queda es el que dibuja la gráfica de tendencias (uPlot necesita canvas).

## Desarrollo

Hace falta el backend corriendo en `http://localhost:8000`.

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/
```

Variables que entiende el build (todas opcionales en local):

| Variable | Para qué |
|---|---|
| `API_BASE_URL` | Base de la API. Por defecto `http://localhost:8000` |
| `CF_ACCESS_CLIENT_ID` / `..._SECRET` | Service token de Cloudflare Access |
| `VENTANA_DIAS` | Días de digest que se hornean (60 por defecto) |
| `SITE_URL` / `BASE_PATH` | URL canónica y prefijo de rutas |

## Diseño

El sistema visual está **bloqueado**: tema *Newsprint*, género editorial, tres
familias tipográficas y una escala de espaciado con nombre. Los tokens viven en
`@theme` dentro de `src/styles/global.css` y Tailwind los convierte en
utilidades, así que `bg-paper` o `gap-md` **son** el sistema.

No se regenera el diseño por página: se extiende. La especificación completa
está en el repositorio privado (`design.md`).

## Higiene

Uso personal, sin ánimo de lucro. No se republica el texto de los artículos: se
enlaza siempre al original. Las síntesis las redacta un modelo de lenguaje y la
página lo dice en cada historia.
