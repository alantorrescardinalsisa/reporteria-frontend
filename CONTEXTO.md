# Backend — `reporteria-api` — Contexto técnico

Ver también el documento maestro: [../../../ARQUITECTURA_PLATAFORMA.md](../../../ARQUITECTURA_PLATAFORMA.md).

Nota: el árbol tiene una carpeta duplicada (`back_prestadores/reporteria-api-main/reporteria-api-main/`) porque proviene de descomprimir un ZIP de GitHub (`<repo>-main.zip`) dentro de una carpeta ya nombrada igual. No es un error del código, solo de organización del repositorio local.

## Qué es

API FastAPI (`app.py`, v4.10.0) + proceso worker (`worker.py`, v3.1, sin cambios desde la primera auditoría) que juntos implementan la ingesta y el cálculo de métricas de la plataforma. Ambos procesos corren en el mismo dyno de Render (plan free), lanzados por `start_free.sh`.

## Historial de correcciones de paridad Excel↔dashboard (v4.4.0 → v4.10.0)

Objetivo explícito de estas versiones: que cualquier combinación de filtros manuales (fecha, campaña, prestador, estado, tipo de servicio) produzca en la plataforma exactamente el mismo resultado que filtrar esas mismas columnas a mano en el Excel de Trackeo.

- **v4.4.0/v4.5.0** — Estado pasó a ser un filtro 100% manual (antes el "universo operativo" ya limitaba qué estados eran visibles).
- **v4.5.0/v4.6.0** — `normalize_text` ahora colapsa espacios repetidos y caracteres invisibles (zero-width space, BOM) antes de comparar, para que variantes visualmente idénticas de un mismo valor de Estado/Campaña/Tipo normalicen igual.
- **v4.7.0** — Cambio de fondo: **se eliminó el gate automático `OPERATIONAL_TYPES`** (10 tipos de servicio fijos que antes se aplicaban siempre, sin que el usuario lo pidiera). Tipo de servicio pasó a ser un filtro 100% manual (`tipo`), igual que Estado, con su propio endpoint `GET /api/metricas-trackeo/tipos-servicio` para poblar el dropdown. El conjunto histórico de 10 tipos se conserva solo como `UNIVERSO_OPERATIVO_HISTORICO`, informativo (usado en `/diagnostico-tipos` y para marcar `pertenece_universo_operativo_historico` en `/tipos-servicio`). También se corrigió que `/api/metricas-trackeo/universos` no aplicaba el filtro de Estado (bug detectado en la auditoría anterior). "Servicios programados" pasó a ser `count(EsProgramado=SI)` literal sobre el universo filtrado, sin exigir `ConEnvioOK`/`AsignoMovil` (la definición anterior, más estricta, se conserva en `servicios_programados_asignados`).
- **v4.8.0** — Mismo principio aplicado a **"Asigna móvil" / "No asigna móvil"**: dejaron de exigir `ConEnvioOK=SI` y ahora son `count(AsignoMovil=SI)` / `count(AsignoMovil≠SI)` literal sobre el total filtrado — antes, un filtro manual en Excel de solo `AsignoMovil=NO` podía dar un número mayor que la tarjeta "No asigna móvil" (caso real detectado: 50 en Excel vs. 34 en la plataforma, porque ~16 filas tenían `ConEnvioOK=NO` y la plataforma las descartaba en silencio). La definición anterior se conserva en los campos auxiliares `asigna_movil_con_envio_ok` / `no_asigna_movil_con_envio_ok`, que además son la base de `efectividad_enviador` (que sí depende, por definición de negocio, de que el enviador se haya usado).

- **v4.9.0** — Se resolvió el riesgo de "Cumplimiento de demora" descrito abajo: la tarjeta dejó de depender del campo opaco `cumple_demora_prometida_15` (calculado por `fn_consolidar_trackeo` en Supabase, sin columna equivalente en el Excel) y ahora se calcula **en Python**, directamente desde `demora_prometida`/`demora_real` (columnas `DemoraPrometida`/`DemoraReal` del Excel), sin exigir `ConEnvioOK=SI`. Una fila sin alguno de los dos valores no se evalúa (no cuenta ni como cumplida ni como no cumplida). La definición anterior se conserva en los campos auxiliares `servicios_cumplidos_sql`/`servicios_no_cumplidos_sql`/`cumplimiento_demora_sql` y las métricas de drill-down `CUMPLE_DEMORA_SQL`/`NO_CUMPLE_DEMORA_SQL`, solo para comparación/auditoría.
- **v4.10.0** — Nuevo `GET /api/metricas-trackeo/diagnostico-universo`, para investigar diferencias entre el total de "Universo seleccionado" (y todas las tarjetas que parten de ese mismo universo filtrado) y el total de filtrar manualmente en Excel. Detecta: (a) `IdServicioPrestado` duplicado dentro del universo filtrado — el mismo servicio consolidado desde más de un reporte Excel subido con rangos de fecha superpuestos, algo que un único archivo Excel no puede tener; (b) variantes de texto crudo de Estado/TipoDeServicio que la plataforma normaliza juntas pero que en el filtro automático de Excel pueden listarse como opciones separadas.
- **v4.9.1** — Fix del límite exacto de la fórmula de v4.9.0. La formulación inicial (`DemoraReal - DemoraPrometida - 15 < 1`) no era algebraicamente equivalente a la fórmula real del Excel del usuario (`=SI((DemoraPrometida+15-DemoraReal)<1;"No";"Si")`): por el `<1` estricto, el límite real es `DemoraReal ≤ DemoraPrometida + 14` (a `DemoraReal == DemoraPrometida + 15` exacto, Excel da "No", pero v4.9.0 daba "Sí" — desvío de 1 minuto en el borde). `compute_cumple_demora()` ahora replica la fórmula de Excel término por término (`not ((DemoraPrometida + 15 - DemoraReal) < 1)`), sin reordenar nada, para eliminar ese riesgo de raíz.

### Riesgo ya resuelto (histórico): `cumple_demora_prometida_15`

Hasta v4.8.0, la tarjeta "Cumplimiento de demora" dependía de un campo calculado enteramente por la función SQL `fn_consolidar_trackeo` en Supabase (no versionada en este repo), sin columna equivalente en el Excel — imposible de reproducir "a mano" filtrando la planilla. Resuelto en v4.9.0 (ver arriba) reemplazando ese campo por un cálculo literal en Python sobre `DemoraPrometida`/`DemoraReal`. El campo SQL se sigue trayendo de la vista (`get_base_rows`) únicamente para poblar los campos auxiliares `*_sql`, a modo de auditoría/comparación — ya no es la fuente de la cifra principal.

### Bug sin corregir (heredado, no relacionado a los filtros)

`worker.py` sigue sin corregirse: 9 nombres de columna que no coinciden con los encabezados reales del Excel (`HoraDebeSalirSMSDemora` vs. real `HoraQueDebeSalirSMSDemora`, `AsignoMovilCuandoLlego` vs. real `AsignoMovilCuandoLLego`, etc. — ver commits/auditoría anterior para la lista completa de 9). No afectan hoy a las tarjetas principales del dashboard, pero esos campos quedan siempre en NULL en `servicios_importacion_staging`/`servicios`.

## Archivos

| Archivo | Rol |
|---|---|
| `app.py` | API HTTP: endpoints de ingesta y de métricas analíticas. Único archivo que corre como servidor `uvicorn`. |
| `worker.py` | Proceso en loop infinito que hace el ETL real: descarga el Excel, lo parsea, lo carga a staging y dispara la consolidación SQL. Se lanza como proceso hijo desde `start_free.sh`, no desde `app.py`. |
| `analytics_routes.py` | Módulo **no conectado**. Define `register_analytics_routes()`, endpoints alternativos que delegan el cálculo a funciones RPC de Postgres (`fn_metricas_trackeo_*`) en vez de calcular en Python. Nadie lo importa desde `app.py`. |
| `analytics_routes_operativo.py` | Módulo **no conectado**. Define `register_operational_universe_routes()`: 3 endpoints nuevos (`universos-comparados`, `resumen-operativo`, `diferencias-universos`) que tampoco existen en `app.py`. |
| `Dockerfile` | Imagen `python:3.11-slim`; solo copia `app.py` y expone `uvicorn app:app`. No copia `worker.py` — **no es la ruta de despliegue real** (ver más abajo). |
| `render.yaml` | Blueprint de Render: plan free, `buildCommand: pip install -r requirements.txt`, `startCommand: bash start_free.sh`, healthcheck en `/health`. Declara las env vars requeridas. |
| `start_free.sh` | `python worker.py &` seguido de `exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1`. Este es el **arranque real** en producción: ambos procesos comparten el contenedor. |
| `requirements.txt` | `fastapi`, `uvicorn[standard]`, `python-multipart`, `supabase` (cliente Python), `httpx`, `openpyxl`, `python-dateutil`, `psycopg[binary]`. |
| `runtime.txt` | Fija Python 3.11.9. |
| `README.md` | **Desactualizado**: documenta endpoints (`/score`, `/causas-demora`, `/costo-operativo`, `/demora-vs-sla`, `/estado-costo`, `/historial`) que no existen en `app.py`. Sí es correcta la sección de variables de entorno y el proceso de deploy en Render. |

## `app.py` en detalle

### Configuración y arranque
- Requiere `SUPABASE_URL` y (`SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_SERVICE_KEY`) en el entorno; falla al arrancar si faltan.
- `API_TOKEN` (opcional): si está seteado, protege `POST /ingestar` con `Authorization: Bearer <token>`.
- `BASE_TABLE`/`UNIVERSOS_TABLE` (env `BASE_VIEW`/`UNIVERSOS_VIEW`, default `v_metricas_trackeo_base`/`v_metricas_trackeo_universos`): nombres de las vistas Supabase que consulta. Configurable sin tocar código.
- CORS: orígenes fijos (`https://reporteria-frontend.vercel.app`, `localhost:5173`, `localhost:4173`, configurable por `FRONTEND_ORIGINS`) + regex para cualquier preview de Vercel del proyecto (`VERCEL_PREVIEW_REGEX`).
- Manejador global de excepciones (`@app.exception_handler(Exception)`): genera un `request_id` (UUID), loguea el stacktrace completo, y devuelve `500` con un detalle acotado a 1000 caracteres — buena práctica de observabilidad para debuguear producción sin exponer el stacktrace completo al cliente.

### El "universo operativo" (`OPERATIONAL_TYPES`)
Set fijo de 10 `tipos_de_servicio` en el código (no en base de datos) sobre el que se filtran **todas** las métricas de `apply_common_filters(..., require_operational_type=True)`. Ver el documento maestro para el detalle de negocio.

### Cache + coalescing (`_get_rows_cached`, `_fetch_all_rows`, `_fetch_page_with_retry`)
Patrón double-checked locking: `_cache_data_lock` protege el diccionario `_cache`; `_key_locks`/`_key_locks_guard` dan un lock por clave (`tabla:fecha_desde:fecha_hasta`) para que, si dos requests piden el mismo rango mientras la cache está fría, solo una dispare la descarga paginada real a Supabase (`page_size=1000`, con reintento exponencial `SUPABASE_PAGE_RETRIES=3`, backoff `0.4 * 2^intento`). TTL de cache: `ANALYTICS_CACHE_SECONDS=45`. Esto es la corrección de un bug real de saturación documentado en el docstring del archivo (ver documento maestro, sección 6).

### Endpoints

**Básicos**
- `GET /` — info de servicio.
- `HEAD /` y `GET /favicon.ico` — no-ops para health checks externos.
- `GET /health` — hace un `select id limit 1` sobre `reportes` para confirmar conectividad a Supabase.

**Analíticos** (todos `GET`, requieren `fecha_desde`/`fecha_hasta`; devuelven 422 si `fecha_desde > fecha_hasta`):
| Endpoint | Filtros extra | Qué devuelve |
|---|---|---|
| `/api/metricas-trackeo/resumen` | campana, prestador_id, estado | KPIs agregados (`compute_summary`) sobre el universo operativo filtrado. |
| `/api/metricas-trackeo/universos` | campana, prestador_id | Conteo de servicios cargados/vehiculares/evaluables/cancelados/no finalizados, usando `v_metricas_trackeo_universos` y sus flags `pertenece_universo_*`, `motivo_universo`. |
| `/api/metricas-trackeo/prestadores` | campana, prestador_id, estado | `compute_summary` agrupado por `prestador_id`, ordenado por volumen. |
| `/api/metricas-trackeo/campanas` | prestador_id, estado | Cantidad de servicios por campaña. |
| `/api/metricas-trackeo/lista-prestadores` | campana, estado | Lista simple de prestadores con conteo (para poblar el selector del frontend). |
| `/api/metricas-trackeo/estados` | campana, prestador_id | Cantidad de servicios por estado (sin filtrar por estado, obviamente). |
| `/api/metricas-trackeo/tendencia` | campana, prestador_id, estado | `compute_summary` agrupado por día (`fecha`), ordenado cronológicamente. |
| `/api/metricas-trackeo/calidad-datos` | campana, prestador_id, estado | `compute_quality`: completitud de campos clave + flags inferidos desde `raw` (coordenadas, móvil registrado) vía `raw_flag()`. |
| `/api/metricas-trackeo/campana-prestador` | campana, prestador_id, estado | Matriz cruzada campaña×prestador con resumen y desvío promedio (real − prometida). |
| `/api/metricas-trackeo/servicios` | campana, prestador_id, estado, `metrica` | Lista completa de servicios (no paginada) que matchean una métrica puntual (`matches_metric`, 13 códigos: `ENVIADOR_SI`, `CUMPLE_DEMORA`, `MENOS_60`, etc. — usado para drill-down). |
| `/api/metricas-trackeo/servicios-paginados` | ídem + `pagina`, `tamano_pagina` (máx. 500) | Igual que `/servicios` pero paginado — el que usa el modal de drill-down del frontend. |

**Ingesta**
- `POST /ingestar` (protegido por `require_token` si `API_TOKEN` está seteado): recibe `file` (multipart, debe terminar en `.xlsx`/`.xlsm`), lo escribe a un archivo temporal calculando SHA-256 en streaming (límite `MAX_UPLOAD_MB`, default 80, 100 en producción vía `render.yaml`), busca duplicado por hash en `reportes`, si es nuevo sube el archivo a Supabase Storage (`upload_file_to_storage`, PUT directo vía `httpx` con `x-upsert: true`, no usa el SDK de Supabase para esto) e inserta la fila en `reportes`. Devuelve `202` con `report_id`, o un cuerpo `status: "duplicado"` si ya existía.
- `GET /ingestar/estado/{report_id}` — consulta el estado/etapa/progreso de un reporte por UUID; usado por el polling del frontend.

## `worker.py` en detalle

- Variables de entorno: `DATABASE_URL` (conexión Postgres directa, no vía SDK de Supabase — necesaria para `COPY` y para llamar funciones SQL), `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`/`SUPABASE_SERVICE_ROLE_KEY`, `REPORTS_BUCKET`, `WORKER_POLL_SECONDS` (default 2), `WORKER_HEARTBEAT_EVERY` (default 1000 filas), `WORKER_STALE_MINUTES` (default 10), `WORKER_ID` (default `hostname-pid`), `SOURCE_TIMEZONE` (default `America/Argentina/Buenos_Aires`).
- Maneja `SIGTERM`/`SIGINT` con una bandera `STOP` para terminar de forma ordenada después del trabajo en curso (importante en Render, que manda `SIGTERM` al hacer deploy/restart).
- `claim_job()`: llama a la función SQL `public.fn_reclamar_reporte_pendiente(worker_id, stale_minutes)` — lock optimista que también permite "robar" un job que quedó colgado (`heartbeat_at` viejo) de un worker caído.
- `process_tracking(job)`: pipeline completo —
  1. `descargando`: baja el archivo de Storage por streaming HTTP (`httpx.stream`, no SDK).
  2. `leyendo_excel`: abre con `openpyxl.load_workbook(read_only=True, data_only=True, keep_links=False)` — modo streaming, apto para archivos grandes sin cargar todo en memoria. Valida headers contra `REQUIRED_HEADERS`.
  3. `cargando_staging`: `DELETE` de cualquier staging previo del mismo `report_id`, luego `COPY ... FROM STDIN` fila por fila (`cur.copy()` de psycopg 3, `copy.write_row(record)`), con conversión de tipos por columna (`as_int`, `as_float`, `as_bool`, `as_datetime`/`as_date`/`as_time` — estos últimos manejan tanto números seriales de Excel vía `openpyxl.utils.datetime.from_excel(value, workbook.epoch)` como strings con `dateutil.parser.parse(dayfirst=True)`). Cada 1000 filas actualiza `filas_procesadas` y `heartbeat_at` en `reportes` (para que el frontend vea progreso real).
  4. `consolidando`: llama a `select public.fn_consolidar_trackeo(report_id)` — la lógica de merge/normalización final vive en esa función SQL, **no está en este repositorio**.
  5. Si cualquier paso falla, captura la excepción, marca `status="error"` con el mensaje (truncado a 1000 chars) en `reportes.error_msg`, y sigue con el siguiente job del loop (no crashea el proceso).
- Solo procesa jobs cuyo `tipo_reporte == "trackeo"` o cuyo nombre de archivo contenga "trackeo"; cualquier otro tipo (ficha, disponibilidad, o no reconocido) se marca `status="error"`, `etapa="tipo_no_soportado"` sin intentar procesarlo — es decir, el soporte para "Ficha de Seguimiento" y "Disponibilidad de prestador" (que sí tienen tablas en el esquema Supabase) **no está implementado en este worker**.

## `analytics_routes.py` / `analytics_routes_operativo.py`: por qué existen y por qué no se usan

Ambos módulos siguen el mismo patrón: reciben `app`, una función `execute_rpc(nombre_funcion, params)` para llamar a una función RPC de Postgres vía Supabase, y `metric_params(...)` para armar los parámetros. Definen versiones **alternativas** de endpoints que ya existen en `app.py` (`tendencia`, `calidad-datos`, `campana-prestador`, `servicios-paginados`) delegando el cálculo a SQL en vez de a Python, más 3 endpoints nuevos de "universo operativo comparado" que no tienen equivalente en `app.py`. Como `app.py` nunca los importa ni los registra, **actualmente no tienen ningún efecto**: son código muerto / una migración de arquitectura (Python-en-memoria → SQL/RPC) que se dejó preparada pero no se terminó de enchufar. Si se retoma, requeriría además que existan en Supabase las funciones `fn_metricas_trackeo_tendencia`, `fn_metricas_trackeo_calidad_datos`, `fn_metricas_trackeo_campana_prestador`, `fn_metricas_trackeo_servicios_total`, `fn_metricas_trackeo_servicios_paginados`, `fn_metricas_trackeo_universos_comparados`, `fn_metricas_trackeo_resumen_operativo`, `fn_metricas_trackeo_diferencias_universos` — ninguna está documentada en `esquemas/esquema_supabase_prestadores/supabase_prestadores.sql` (ese dump solo tiene tablas).

## Despliegue real vs. `Dockerfile`

El despliegue productivo usa `render.yaml` (Blueprint) → `buildCommand: pip install -r requirements.txt` → `startCommand: bash start_free.sh`, que arranca **tanto** `worker.py` como `uvicorn`. El `Dockerfile` (que solo copia `app.py` y arranca únicamente `uvicorn`) parece pensado para un despliegue alternativo (Railway, Fly.io, etc. — el propio comentario del archivo lo sugiere) pero, tal como está, **no correría el worker** y por lo tanto nunca procesaría ningún Excel subido. No hay evidencia de que se use en producción.
