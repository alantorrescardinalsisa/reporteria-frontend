# =====================================================================
#  Dockerfile · Backend FastAPI  (compatible Render / cualquier PaaS)
#  Proyecto: reporteria-prestadores
#  Usa la variable $PORT que provee la plataforma (Render, Railway, etc.).
#  Fallback a 8000 para pruebas locales.
# =====================================================================
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Render inyecta $PORT en runtime; usamos shell form para que se expanda
CMD uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}
