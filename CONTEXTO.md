# Frontend — `reporteria-frontend` — Contexto técnico

Ver también el documento maestro: [../../../ARQUITECTURA_PLATAFORMA.md](../../../ARQUITECTURA_PLATAFORMA.md).

Nota: el árbol tiene una carpeta duplicada (`front_prestadores/reporteria-frontend-main/reporteria-frontend-main/`) porque proviene de descomprimir un ZIP de GitHub dentro de una carpeta ya nombrada igual — igual que en el backend. No afecta al código.

## Qué es

SPA en React 18 + TypeScript + Vite 6 (`package.json` v2.3.1) que consume la API del backend y ofrece el dashboard operativo: KPIs, tendencia, comparativas por prestador/campaña, drill-down a servicios y carga de archivos Excel. Sin router (todo el estado de "página" es un `useState` local) y sin librería de manejo de estado ni de gráficos.

## Archivos principales (raíz real usada por Vite)

| Archivo | Rol |
|---|---|
| `src/api.ts` | Capa de acceso a la API: tipos TS espejo de las respuestas del backend, `qs()` (serializa arrays a querystring repetido, ej. `?campana=A&campana=B`), `request<T>()` (wrapper de `fetch` con manejo de errores vía `body.detail`), y el objeto `api` con un método por endpoint (`health`, `trackeoResumen`, `trackeoUniversos`, `trackeoPrestadores`, `trackeoCampanas`, `trackeoListaPrestadores`, `trackeoEstados`, `trackeoTiposServicio`, `trackeoTendencia`, `trackeoCalidadDatos`, `trackeoCampanaPrestador`, `trackeoServiciosPaginados`, `ingest`, `ingestStatus`). `API_URL` sale de `import.meta.env.VITE_API_URL` con fallback hardcodeado a `https://reporteria-api.onrender.com`. |
| `src/App.tsx` | Componente único (~1040 líneas) que implementa toda la UI. Ver detalle abajo. |
| `src/main.tsx` | Punto de entrada React (`createRoot`). |
| `src/App.css`, `src/index.css`, `src/styles.css` | Estilos. |
| `src/vite-env.d.ts` | Tipos ambient de Vite (para `import.meta.env`). |
| `vite.config.ts` | Config mínima, solo `@vitejs/plugin-react`. |
| `index.html` | HTML raíz de la SPA. |
| `package.json` | Dependencias: `react`, `react-dom`, `lucide-react` (íconos). Dev: `vite`, `typescript`, `eslint` + `typescript-eslint`. Scripts: `dev`, `build` (`tsc -b && vite build`), `lint`, `preview`. |
| `tsconfig*.json` | Config TS (app/node, project references). |
| `.env.example` | `VITE_API_URL=https://reporteria-api.onrender.com` — **apunta a producción**, no a `localhost`; un desarrollador que copie este archivo tal cual trabajará contra el backend real, no contra uno local. |
| `.gitignore` | Estándar de proyecto Vite/Node. |
| `_oxlintrc.json` | Config de `oxlint` (linter alternativo/rápido), aparentemente no referenciado en los scripts de `package.json`. |
| `probar.mjs` | Script suelto en la raíz, fuera de `scripts/` — revisar su contenido si se retoma el proyecto, no se detalla aquí. |
| `README.md` | Explica un flujo de trabajo vía **StackBlitz**: crear un proyecto React+TS ahí, reemplazar archivos por los de este repo, copiar `.env.example` a `.env`, `npm install && npm run dev`. Esto explica el origen de la duplicación de carpetas (ver abajo). |
| `public/favicon.svg`, `public/icons.svg` | Assets estáticos servidos tal cual. |
| `src/assets/hero.png`, `react.svg`, `vite.svg` | Imágenes usadas por la UI/plantilla. |
| `scripts/check-source-files.mjs` (y su copia en `src/scripts/`) | Script de diagnóstico ad-hoc: busca entidades HTML corruptas (`&lt;`, `&gt;`, `&amp;`, etc.) coladas en el código fuente TS/TSX — indicio de que hubo problemas recurrentes de copy-paste/encoding al mover código dentro/fuera de StackBlitz. |
| `scripts/diagnose-build.mjs` | Script de diagnóstico de fallos de build (`tsc`/`vite`): imprime entorno, versiones de Node/paquetes y config relevante. Otro indicio de problemas de build recurrentes. |

## `src/App.tsx` — estructura

- `type Page = "metrics" | "providers" | "cross" | "upload"` — las 4 "pantallas" de la app, sin router, controladas por `useState<Page>`.
- `initial()` — construye el estado inicial de filtros (`TrackeoFilters`), probablemente leyendo la URL actual (el estado de filtros se sincroniza con `history.replaceState` para que la URL sea compartible/recargable).
- `MultiSelect({...})` — componente de selección múltiple genérico con búsqueda (`term`) reusado para campañas/prestadores/estados.
- `Card({...})` — tarjeta de KPI reutilizable.
- `Trend({ data })` — **gráfico de tendencia SVG dibujado a mano**, sin librería de charts (no hay `recharts`/`chart.js`/etc. en `package.json`).
- `csv(rows, name)` — exportación a CSV en el cliente: agrega BOM UTF-8 y usa `;` como separador (formato esperado por Excel en configuración regional Argentina/Latam).
- `export default function App()` — componente raíz:
  - Estado: `page`, `draft`/`filters` (filtros en edición vs. aplicados), y un `useState` por cada bloque de datos (`summary`, `universes`, `providers`, `campaigns`, `providerOptions`, `states`, `trend`, `quality`, `cross`), más `loading`, `error`, `backend` (resultado de `/health`), `drill` (estado del modal de drill-down), `file`/`uploading`/`uploadStatus`/`uploadMessage` (flujo de carga), `providerSearch`.
  - Carga de datos: dispara **9 llamadas a la API en paralelo** vía `Promise.allSettled([...])` — exactamente el patrón que motivó el fix de cache/coalescing en el backend (ver `app.py`).
  - `open(...)` — abre el modal de drill-down para una métrica puntual, usando `trackeoServiciosPaginados`.
  - `exportAll()` — exporta *todas* las páginas de un drill-down a CSV, iterando páginas con una pausa (`sleep(250ms)`) entre cada request para no saturar la API — mismo espíritu defensivo que el backend.
  - `upload()` — sube el archivo vía `api.ingest`, luego hace polling a `api.ingestStatus(id)` cada 3 segundos hasta que `status` deje de ser `pendiente`/`procesando` o se agote un máximo de intentos (~600 ⇒ ~30 min).

## Duplicación de código fuente (hallazgo importante)

Existen **tres copias divergentes** del código (confirmado por hash, no son copias idénticas):
1. La copia real, en la raíz de este proyecto: `index.html` + `src/` (la que usa `vite.config.ts`/`tsconfig.json` de la raíz — **esta es la fuente de verdad**, la que efectivamente compila y corre con `npm run dev` / `npm run build`).
2. Dentro de `src/` hay **otro juego completo de archivos de configuración** (`src/package.json` — con un script `check:source` que no está en el `package.json` raíz —, `src/vite.config.ts`, `src/tsconfig*.json`, `src/index.html`): una copia de la envoltura del proyecto anidada donde no debería estar.
3. Dentro de `src/src/` hay una **tercera copia**, solo de los archivos fuente (`App.tsx`, `api.ts`, `App.css`, `index.css`, `main.tsx`, `vite-env.d.ts`), con contenido distinto a las otras dos.

Esto es consistente con el flujo descrito en el propio `README.md` (StackBlitz: "reemplazar los archivos por los incluidos"): cada vez que se volvió a pegar una nueva versión del proyecto dentro de la carpeta `src/` ya existente, en lugar de sobrescribirla se fue anidando una copia más. **No tiene ningún propósito funcional** — Vite solo construye a partir de la copia en la raíz — pero sí representa un riesgo real: alguien puede editar `src/src/App.tsx` o `src/App.tsx` (el de dentro, no el de la raíz) pensando que está tocando el código vigente, y el cambio nunca se reflejaría en el build.

**Recomendación si se retoma el proyecto**: eliminar `src/src/` completo y los archivos de configuración duplicados dentro de `src/` (`package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`), dejando en `src/` únicamente los archivos fuente reales (`App.tsx`, `api.ts`, `main.tsx`, `*.css`, `vite-env.d.ts`, `scripts/`, `assets/`).

## Archivo Excel en esta carpeta

`Reporte Metricas_de_prestadores Trackeo_de_servicios 2026-08-25 11_59_06.057.xlsx` — otra copia de muestra del reporte de Trackeo (mismo origen que el de `esquemas/esquema_supabase_prestadores/`, exportado de SMV). Está mezclado con el código fuente del frontend por descuido de organización, no tiene relación funcional con el build de Vite.
