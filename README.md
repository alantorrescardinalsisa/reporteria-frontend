# Reportería Prestadores · Backend API (FastAPI)

Backend para el sistema de reportería de prestadores de Cardinal Assistance.
Procesa reportes Excel (Trackeo, Disponibilidad, Ficha de Seguimiento), los
deduplica y los carga en Supabase; y expone vistas de negocio (score de
prestadores, causas de demora, costo operativo).

Diseñado para **Render (free tier)**. Funciona también en Railway, Fly.io o
cualquier plataforma que corra Python/Docker y provea la variable `$PORT`.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | `/health`         | Chequeo de salud (verifica conexión a Supabase) |
| POST | `/ingestar`       | Sube un Excel (multipart `file`), lo deduplica y carga |
| GET  | `/score`          | Score de prestadores (`v_score_prestadores`) |
| GET  | `/causas-demora`  | Clasificación de causas de demora |
| GET  | `/costo-operativo`| Métricas físicas por servicio (interacciones, llamadas...) |
| GET  | `/demora-vs-sla`  | Comparativo demora crítica vs SLA |
| GET  | `/estado-costo`   | Estado del parámetro de costo ($/min o PENDIENTE) |
| GET  | `/historial`      | Reportes cargados |

Docs interactivas automáticas en `/docs`.

## Deploy en Render (2 caminos)

### Camino A — Blueprint (usa render.yaml, recomendado)
1. Subí esta carpeta a un repo de GitHub.
2. En Render: **New + → Blueprint** → seleccioná el repo. Render lee `render.yaml`.
3. Cargá los secretos cuando lo pida (ver abajo).

### Camino B — Manual
1. En Render: **New + → Web Service** → conectá el repo (o subí como Docker).
2. **Build Command:** `pip install -r requirements.txt`
3. **Start Command:** `uvicorn app:app --host 0.0.0.0 --port $PORT`
4. **Plan:** Free.

## Variables de entorno (Render → Environment)

| Nombre | Valor | Secreto |
|--------|-------|---------|
| `SUPABASE_URL`         | `https://ozrtnnyiobdcnxumplgv.supabase.co` | no |
| `SUPABASE_SERVICE_KEY` | Secret key de Supabase (`sb_secret_...`) | **sí** |
| `API_TOKEN`            | token para proteger `POST /ingestar` | **sí** |
| `CORS_ORIGINS`         | orígenes permitidos (ej. la URL del frontend) o `*` | no |

## Nota sobre el free tier
El servicio **duerme tras 15 min** de inactividad; la primera request luego
de dormir tarda ~40 s (cold start). Mitigación: un cron gratuito
(cron-job.org / GitHub Actions) que pegue a `/health` cada 10-14 min.
