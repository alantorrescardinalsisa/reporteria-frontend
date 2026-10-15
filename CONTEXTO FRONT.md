# Frontend — `reporteria-frontend` — Contexto técnico

Ver también el documento maestro: [../ARQUITECTURA_PLATAFORMA.md](../ARQUITECTURA_PLATAFORMA.md).

Nota de estructura (2026-08-31): esta carpeta (`front_prestadores/`) es directamente la raíz del repo del frontend. Hasta esa fecha había dos niveles de carpeta duplicados (`front_prestadores/reporteria-frontend-main/reporteria-frontend-main/`, igual que en el backend) **y además** una tercera copia de código fuente huérfana dentro de `src/src/` (ver sección "Duplicación de código fuente (resuelto)" más abajo) — todo se aplanó/eliminó manualmente sin tocar ningún archivo de código real.

## Qué es

SPA en React 18 + TypeScript + Vite 6 (`package.json` v2.3.1) que consume la API del backend y ofrece el dashboard operativo: KPIs, tendencia, comparativas por prestador/campaña, drill-down a servicios y carga de archivos Excel. Sin router (todo el estado de "página" es un `useState` local). Desde la sesión de rediseño (ver más abajo), usa **Tailwind CSS vía CDN + Material Symbols** como sistema visual (antes era CSS a mano); sigue sin librería de manejo de estado ni de gráficos (el gráfico de tendencia sigue siendo un SVG dibujado a mano).

## Archivos principales (raíz real usada por Vite)

| Archivo | Rol |
|---|---|
| `src/api.ts` | Capa de acceso a la API: tipos TS espejo de las respuestas del backend, `qs()` (serializa arrays a querystring repetido, ej. `?campana=A&campana=B`), `request<T>()` (wrapper de `fetch` con manejo de errores vía `body.detail`), y el objeto `api` con **~20 métodos**, uno por endpoint del backend (ver tabla completa en la sección "Endpoints consumidos" más abajo). `API_URL` sale de `import.meta.env.VITE_API_URL` con fallback hardcodeado a `https://reporteria-api.onrender.com`. |
| `index.html` | Además del HTML raíz de la SPA, carga **Tailwind CSS vía `<script src="https://cdn.tailwindcss.com">`** con un `tailwind.config` inline (tokens de color/spacing/tipografía tipo Material Design 3) y las fuentes Google (`Inter`, `Material Symbols Outlined`). No hay build de Tailwind vía PostCSS — se inyecta en runtime en el navegador. |
| `src/App.tsx` | Componente único (~1500+ líneas tras el rediseño y las sucesivas features aditivas) que implementa toda la UI. Ver detalle abajo. |
| `src/main.tsx` | Punto de entrada React (`createRoot`). |
| `src/App.css`, `src/index.css`, `src/styles.css` | Estilos. |
| `src/vite-env.d.ts` | Tipos ambient de Vite (para `import.meta.env`). |
| `vite.config.ts` | Config mínima, solo `@vitejs/plugin-react`. |
| `package.json` | Dependencias: `react`, `react-dom`. Dev: `vite`, `typescript`, `eslint` + `typescript-eslint`. Scripts: `dev`, `build` (`tsc -b && vite build`), `lint`, `preview`. `lucide-react` ya no se usa (el rediseño reemplazó los íconos por Material Symbols vía `<span className="material-symbols-outlined">`) — queda como dependencia sin uso, no se quitó de `package.json` para no arriesgar el build sin poder verificarlo (ver nota al final). |
| `tsconfig*.json` | Config TS (app/node, project references). |
| `.env.example` | `VITE_API_URL=https://reporteria-api.onrender.com` — **apunta a producción**, no a `localhost`; un desarrollador que copie este archivo tal cual trabajará contra el backend real, no contra uno local. |
| `.gitignore` | Estándar de proyecto Vite/Node. |
| `_oxlintrc.json` | Config de `oxlint` (linter alternativo/rápido), aparentemente no referenciado en los scripts de `package.json`. |
| `probar.mjs` | Script suelto en la raíz, fuera de `scripts/` — revisar su contenido si se retoma el proyecto, no se detalla aquí. |
| `README.md` | Explica un flujo de trabajo vía **StackBlitz**: crear un proyecto React+TS ahí, reemplazar archivos por los de este repo, copiar `.env.example` a `.env`, `npm install && npm run dev`. Esto explica el origen de la duplicación de carpetas (ver abajo). |
| `public/favicon.svg`, `public/icons.svg` | Assets estáticos servidos tal cual. |
| `src/assets/hero.png`, `react.svg`, `vite.svg` | Imágenes usadas por la UI/plantilla. |
| `scripts/check-source-files.mjs` | Script de diagnóstico ad-hoc: busca entidades HTML corruptas (`&lt;`, `&gt;`, `&amp;`, etc.) coladas en el código fuente TS/TSX — indicio de que hubo problemas recurrentes de copy-paste/encoding al mover código dentro/fuera de StackBlitz. No está enchufado a ningún script de `package.json` (se corre manualmente, `node scripts/check-source-files.mjs`, desde la raíz del proyecto — las rutas que valida son relativas a `src/...`). |
| `scripts/diagnose-build.mjs` | Script de diagnóstico de fallos de build (`tsc`/`vite`): imprime entorno, versiones de Node/paquetes y config relevante. Otro indicio de problemas de build recurrentes. |

## `src/App.tsx` — estructura

- `type Page = "metrics" | "providers" | "cross" | "upload"` — las 4 "pantallas" de la app, sin router, controladas por `useState<Page>`. Nav lateral con íconos Material Symbols (`analytics`, `person_search`, `campaign`, `upload_file`).
- `initial()` — construye el estado inicial de filtros (`TrackeoFilters`, incluye `tipos` desde que se agregó el filtro de Tipo de servicio), leyendo la URL actual (el estado de filtros se sincroniza con `history.replaceState` para que la URL sea compartible/recargable).
- `Icon`/`Spinner` — wrappers sobre `<span className="material-symbols-outlined">` (reemplazan a `lucide-react`).
- `MultiSelect({...})` — selector múltiple genérico con búsqueda, reusado para Campañas/Prestadores/Estados/Tipo de servicio. Misma lógica desde el inicio; solo cambió el estilo (Tailwind) en el rediseño.
- `Card` — tarjeta de KPI para "Universos analíticos" (ícono circular + valor grande + detalle).
- `IndicatorRow` — fila compacta (ícono + label + valor + detalle) para "Indicadores operativos", con click opcional a drill-down.
- `ProgressBar` — barra de progreso reutilizada por casi todos los paneles nuevos (Distribución, Calidad, SLA despacho/llegada, Distribución horaria, Estados por categoría, Trazabilidad, Habilitadores, Gestión de programados).
- `Trend({ data })` — **gráfico de tendencia SVG dibujado a mano** (mismo cálculo de coordenadas de siempre, solo cambió el estilo de las líneas/grilla a clases Tailwind).
- `csv(rows, name)` — exportación a CSV en el cliente: agrega BOM UTF-8 y usa `;` como separador (formato Excel-AR).
- `export default function App()` — componente raíz. Estado: `page`, `draft`/`filters`, y un `useState` por cada bloque de datos que trae el backend (ver "Endpoints consumidos" abajo), más `loading`, `error`, `backend` (`/health`), `drill` (modal de drill-down), `file`/`uploading`/`uploadStatus`/`uploadMessage` (carga de Excel), `providerSearch`/`providerSort`, `outlierTramo` (selector del panel de outliers).
  - `load()` dispara **todas** las llamadas de métricas en paralelo vía un único `Promise.allSettled([...])` — el array creció de 9 a **16 llamadas** a medida que se agregaron endpoints aditivos (ver tabla); sigue siendo el mismo patrón que motivó el fix de cache/coalescing en el backend (`app.py`).
  - `open(...)` — abre el modal de drill-down para una métrica puntual, usando `trackeoServiciosPaginados`.
  - `exportAll()` — exporta *todas* las páginas de un drill-down a CSV, con pausa (`sleep(250ms)`) entre páginas.
  - `upload()` — sube el archivo vía `api.ingest`, luego hace polling a `api.ingestStatus(id)` cada 3s hasta ~30 min máx.

## Rediseño visual (Tailwind + Material Symbols)

A pedido del usuario, se rediseñó todo el layout para calzar con una referencia visual (Material Design 3-ish: sidebar oscura, tarjetas con ícono circular, barras de progreso, tipografía Inter) **sin tocar ninguna lógica**: mismos hooks, mismos cálculos, mismas llamadas a la API — solo cambió el JSX/markup y el sistema de estilos (de CSS a mano en `App.css`/`index.css` a clases utilitarias Tailwind cargadas vía CDN en `index.html`). `App.css`/`index.css`/`styles.css` quedaron con reglas del diseño anterior que ya no se usan (no se borraron, son inocuas).

**Importante — no verificado con build real**: quien edite este proyecto en un entorno con Node/npm debe correr `npm run build` antes de dar por buena cualquier edición — el asistente que hizo el rediseño y las features aditivas posteriores trabajó en una máquina **sin Node/npm instalado**, y solo pudo validar el JSX manualmente (balance de llaves/paréntesis, revisión línea por línea). Ya se encontraron y corrigieron a mano 2 errores de sintaxis introducidos así (un tag JSX mal cerrado y un tipo de prop inválido) antes de que el usuario reportara que "no cambiaba la visual" — que en realidad fue porque el frontend deployado en Vercel era una build vieja (ver más abajo). **Siempre correr `npm run build` localmente y revisar el resultado antes de deployar.**

## Endpoints consumidos (`src/api.ts` → `app.py`)

Todos bajo `/api/metricas-trackeo/`, con los filtros globales (`fecha_desde`, `fecha_hasta`, `campana[]`, `prestador_id[]`, `estado[]`, `tipo[]`) aplicados según corresponda a cada uno (ver [../back_prestadores/CONTEXTO.md](../back_prestadores/CONTEXTO.md) para el detalle de qué filtros acepta cada endpoint):

| Método en `api` | Endpoint | Para qué panel |
|---|---|---|
| `trackeoResumen` | `/resumen` | Indicadores operativos, Universo seleccionado |
| `trackeoUniversos` | `/universos` | Universos analíticos |
| `trackeoPrestadores` | `/prestadores` | Detalle por prestador (incluye score de ranking desde v4.15.0) |
| `trackeoCampanas` | `/campanas` | Opciones del filtro Campañas |
| `trackeoListaPrestadores` | `/lista-prestadores` | Opciones del filtro Prestadores |
| `trackeoEstados` | `/estados` | Opciones del filtro Estados |
| `trackeoTendencia` | `/tendencia` | Tendencia diaria |
| `trackeoCalidadDatos` | `/calidad-datos` | Calidad de información + Trazabilidad completa (desde v4.17.0) |
| `trackeoCampanaPrestador` | `/campana-prestador` | Página Campaña × prestador |
| `trackeoTiposServicio` | `/tipos-servicio` | Opciones del filtro Tipo de servicio |
| `trackeoFunnelTiempos` | `/funnel-tiempos` | Funnel de tiempos T1-T6, SLA despacho/llegada, Distribución horaria |
| `trackeoImpactoCampanas` | `/impacto-campanas` | Impacto por campaña |
| `trackeoEstadosCategorizados` | `/estados-categorizados` | Estados por categoría semántica |
| `trackeoHabilitadoresAsignacion` | `/habilitadores-asignacion` | Coordenadas/MóvilRegistrado como habilitadores |
| `trackeoProgramadosFunnel` | `/programados-funnel` | Gestión completa de programados |
| `trackeoOutliers` | `/outliers` | Outliers por tramo |
| `trackeoServiciosPaginados` | `/servicios-paginados` | Modal de drill-down |
| `ingest` / `ingestStatus` | `POST /ingestar`, `/ingestar/estado/{id}` | Página Cargar reportes |
| `health` | `GET /health` | Estado del backend en el footer del sidebar |

## Duplicación de código fuente (resuelto 2026-08-31)

Hasta esa fecha existían **tres copias divergentes** del código (confirmado por hash, no eran copias idénticas): la real en la raíz de este proyecto (`index.html` + `src/`, la única que usaba `vite.config.ts`/`tsconfig.json` de la raíz y efectivamente compilaba), un segundo juego completo de archivos de configuración pegado por error dentro de `src/` (`src/package.json`, `src/vite.config.ts`, `src/tsconfig*.json`, `src/index.html`), y dentro de `src/src/` una tercera copia solo de los archivos fuente (`App.tsx` de 40 KB, muy anterior al rediseño Tailwind — la copia real ya pesaba 93 KB). Consistente con el flujo descrito en el propio `README.md` (StackBlitz: "reemplazar los archivos por los incluidos"): cada vuelta de ese flujo, en lugar de sobrescribir `src/`, anidó una copia más adentro.

Se verificó por hash y por referencias (ningún import ni el `index.html` real apuntaba a esas rutas) que ambas copias eran huérfanas sin ningún efecto en el build, y se eliminaron manualmente vía Explorador de Windows (sin acceso a PowerShell/cmd en esa máquina): `src/src/`, `src/package.json`, `src/vite.config.ts`, `src/tsconfig*.json`, `src/index.html`. `src/` ahora contiene únicamente los archivos fuente reales: `App.tsx`, `api.ts`, `App.css`, `index.css`, `main.tsx`, `styles.css`, `vite-env.d.ts`, `assets/`.

## Actualización 2026-10-14 (frontend "v2.5.0") — pantalla de Auditoría y mantenimiento

> Este archivo estaba al 2026-09-01. Los cambios del frontend entre esa fecha y hoy (filtros globales de póliza, provincia, outliers y programados; la pantalla Inteligencia Operativa conectada al backend; `ExportButton` Excel/PDF; orden por columna en las tablas; `runInBatches`; paginado; tooltips ⓘ) están descritos en el changelog de [../back_prestadores/CONTEXTO.md](../back_prestadores/CONTEXTO.md), que es donde se documentaron junto con el backend. `package.json` sigue diciendo 2.3.1 (la versión "2.5.0" es lógica, solo de documentación). Hoy `type Page = "metrics" | "providers" | "cross" | "upload" | "intelligence"`.

**Archivos nuevos**
- `src/AuditoriaPanel.tsx` — pestaña **"Auditoría de prestadores"** de Inteligencia Operativa. Solo lectura: consume `/api/auditoria/*` y no calcula nada. Está escrita en **lenguaje llano** (porcentajes como "X de cada 100 servicios", situaciones "Para auditar con prioridad / Para seguir de cerca / Sin problemas / No registra la llegada") y deja los números técnicos (z ajustado, casos, puntos porcentuales) en un desplegable "Ver detalle técnico". Piezas: `Tarjeta`/`Caja` (mismo estilo que las tarjetas de Métricas), `Detalle` (ventana por prestador con "En pocas palabras", comparación contra pares, evolución, historial semanal y servicios de ejemplo), `explicarMotivo`/`separarMotivos` (traducen el texto técnico de `motivos` del motor a frases), `situacion()`, `descargarCsv()` (conserva nombres y números técnicos).
- `src/InfoTip.tsx` — el tooltip ⓘ, **extraído de `App.tsx`** para poder usarlo también en `AuditoriaPanel.tsx` sin importación circular. Mismo comportamiento (portal a `document.body`).

**Guía de las tres evaluaciones y columna "Auditoría" (opciones A y B, 2026-10-14)**
- `src/GuiaEvaluaciones.tsx` (**opción A**) — cuadro que se muestra arriba de las tres secciones (Detalle por prestador, Panorama de la red, Auditoría de prestadores): explica en palabras para qué sirve cada una, marca cuál es la actual ("Estás acá"), enlaza a las otras dos y trae un desplegable "¿Por qué un mismo prestador puede verse distinto en cada una?" (servicios sin hora de llegada, con quién se compara, período y filtros, cuándo se actualizan). Es solo texto y navegación: si cambia alguna definición de las evaluaciones, actualizar ahí.
- `src/auditoriaSituacion.ts` — `situacion()` y las constantes `CANDIDATO`/`OBSERVACION`, **extraídas de `AuditoriaPanel.tsx`** para usarlas también desde Detalle por prestador.
- **Opción B:** columna **"Auditoría"** al final de la tabla de *Detalle por prestador*: muestra la situación del prestador en la última auditoría semanal ("Para auditar con prioridad", "Para seguir de cerca", "Sin problemas", "No registra la llegada", "Pocos datos para evaluar", o "No evaluado" si no figura en la auditoría). Al hacer clic en la etiqueta se abre la pestaña *Auditoría de prestadores* ya buscando a ese prestador (`irAEvaluacion` en `App.tsx`; el panel recibe `buscarInicial` y, si viene con búsqueda, arranca en el segmento "Todos"). La columna **no depende de los filtros de la pantalla** (la auditoría es una foto semanal desde enero). Los datos se piden una sola vez (`api.auditoriaResultados()`) la primera vez que se abre Detalle por prestador; si falla (ej. falta la migración SQL) la columna muestra "—". Estados nuevos en `App`: `auditoriaBusqueda`, `auditoriaPorPrestador`, `auditoriaSemana`, `auditoriaNoDisponible`. La columna no se incluye en el export de la tabla y no es ordenable.

**Archivos modificados**
- `src/api.ts` — tipos `Auditoria*` y tres métodos: `auditoriaCorridas`, `auditoriaResultados(runId?)`, `auditoriaPrestador(id, runId?)`.
- `src/App.tsx` — Inteligencia Operativa tiene dos pestañas (`inteligenciaTab`: "panorama" = lo de siempre, "auditoria" = `<AuditoriaPanel />`); se importa `InfoTip`/`Tooltip` desde `./InfoTip`; se quitó el import de `createPortal`.
- `index.html` — la fuente Material Symbols se pide con `display=block` (los íconos quedan ocultos hasta que carga la fuente; antes con `swap` se veía el nombre del ícono como texto, ej. "analytics", en cargas sin caché).

**Reglas de mantenimiento**
- Los textos de ayuda están en la constante `TIPS` de `AuditoriaPanel.tsx` y las definiciones/umbrales reflejan `auditoria_prestadores/auditoria_prestadores.py` (candidato = z ajustado ≥ 3 y ≥ 300 cerrados; niveles A/B/C = 50/20 servicios; mínimos en pp por indicador). Si el motor cambia, actualizar ahí. **TypeScript no detecta una clave inexistente de `TIPS`** (es un `Record<string, Tooltip>`): al agregar usos, verificar que existan (hay un chequeo en el historial de la sesión: comparar `TIPS.xxx` usadas contra definidas).
- Los motivos llegan del motor como texto técnico separado por `" | "` (con corchetes que también usan `" | "`); `separarMotivos` respeta los corchetes. Si cambia el formato de `motivos` en el motor, ajustar `interpretarMotivo`/`explicarMotivo`.
- El backend responde HTTP 400 con un mensaje claro cuando el período + filtros superan el tope de filas (`MAX_FILAS_RANGO`, ver CONTEXTO del backend); `request()` lo muestra como error. El período por defecto (`rangoPorDefecto`) son los 2 meses cerrados anteriores; las direcciones guardadas con `desde`/`hasta` largos (ej. enero a octubre) siguen funcionando solo si los filtros dejan pocas filas.
- **Verificación antes de dar por bueno un cambio:** `npx tsc -b --force` (NO `tsc --noEmit -p .`, que da falsos "sin errores" con esta configuración de referencias). En este entorno aparecen dos errores `TS5033` sobre `node_modules/.tmp/*.tsbuildinfo` que son ruido; solo importan los `error TS####` con ruta en `src/`. `npm run dev`/`vite build` no se pudieron correr en el entorno del asistente: no hay verificación visual automática, hay que revisar la pantalla desplegada.
- **Despliegue:** el usuario sube los archivos a GitHub a mano (sin git local) desde esta carpeta, sin `node_modules`; Vercel despliega solo. Si el front se sube antes que el backend y las migraciones SQL, la pestaña de Auditoría muestra un error hasta que estén.

## Actualización 2026-10-15 — columna "Servicios de más" en Auditoría

`AuditoriaPanel.tsx`: nueva columna ordenable "Servicios de más" (tabla de prestadores, CSV y detalle del prestador) con tooltip `TIPS.colImpacto`. Lee `metricas.impacto_servicios` (lo calcula el motor, ver `CONTEXTO_AUDITORIA_PRESTADORES.md` §26); para corridas anteriores a este cambio muestra "—". Sin cambios en `api.ts` (`metricas` ya es un objeto libre) ni en el SQL del panel.

## Actualización 2026-10-15 (2) — regla única de demora y datos faltantes

`AuditoriaPanel.tsx` y `GuiaEvaluaciones.tsx` reflejan la opción C: "Demora comprobada" (solo servicios con hora de llegada) e indicador propio "Sin hora de llegada" (carga de datos). Nuevas claves en `INDICADORES`, `CLAVES_POR_PREFIJO` (con `incumple_v1` para corridas anteriores a esta fecha) y textos de `TIPS`. Definiciones: `CATALOGO_INDICADORES.md`.

## Actualización 2026-10-15 (3) — aspecto del impacto y regla de Pareto

`AuditoriaPanel.tsx`: debajo de "Servicios de más" se muestra de qué aspecto sale (`metricas.impacto_indicador`, mapa `ASPECTO_IMPACTO`) y se agregó la columna "Acumulado" (regla de Pareto, `calcularPareto()`): se ordena TODA la corrida (sin filtros) por servicios de más y se acumula; grupo A hasta el 80 % del total (incluye al que lo cruza), B hasta el 95 %, C el resto. Es un dato fijo por prestador (no depende del filtro ni del orden de la tabla). También en el CSV y en una línea resumen sobre la tabla.

## Archivo Excel en esta carpeta

`Reporte Metricas_de_prestadores Trackeo_de_servicios 2026-08-25 11_59_06.057.xlsx` — otra copia de muestra del reporte de Trackeo (mismo origen que el de `esquemas/esquema_supabase_prestadores/`, exportado de SMV). Está mezclado con el código fuente del frontend por descuido de organización, no tiene relación funcional con el build de Vite.
