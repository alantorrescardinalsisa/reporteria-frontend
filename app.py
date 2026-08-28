#!/usr/bin/env python3
"""Reporteria Prestadores API v4.10.0.

v4.10.0: NUEVO endpoint GET /api/metricas-trackeo/diagnostico-universo,
para investigar diferencias entre el total que muestra la plataforma
("Universo seleccionado" y todas las tarjetas que parten del mismo
universo filtrado: fecha + campana + prestador + estado + tipo) y el
total de aplicar manualmente esos mismos filtros en Excel. Detecta dos
causas que un unico archivo Excel no puede tener por definicion:
  a) IdServicioPrestado duplicado dentro del universo filtrado (mismo
     servicio consolidado desde mas de un reporte Excel subido, con
     rangos de fecha superpuestos entre uploads);
  b) variantes de texto crudo de Estado/TipoDeServicio que la
     plataforma normaliza juntas (espacios, mayusculas) pero que en el
     filtro automatico de Excel pueden listarse como opciones
     separadas.

v4.9.1: FIX del limite de "Cumplimiento de demora" introducido en
v4.9.0. La primera implementacion uso "DemoraReal - DemoraPrometida -
15 < 1" (equivalente a DemoraReal <= DemoraPrometida + 15), pero la
formula real de Excel que el usuario confirmo es:

    =SI((DemoraPrometida + 15 - DemoraReal) < 1; "No"; "Si")

que, por el "<1" estricto, da un limite distinto: DemoraReal <=
DemoraPrometida + 14 (a DemoraReal == DemoraPrometida + 15 exacto, la
formula de Excel da "No", mientras la v4.9.0 daba "Si"). compute_cumple_
demora() ahora replica la formula LITERAL, termino por termino, sin
reordenar nada, para no volver a introducir un corrimiento de 1 minuto
en el limite.

Cambio de fondo respecto de v4.8.0 (misma auditoria, mismo pedido
explicito: "necesito que el resultado de los filtros que yo coloque
manualmente en excel sean exactamente los mismos que los resultados
que arroja la plataforma"):

4) "Cumplimiento de demora" YA NO usa el campo `cumple_demora_prometida_15`
   calculado por la funcion SQL fn_consolidar_trackeo (formula opaca,
   no versionada en este repo, y sin columna equivalente en el Excel
   -> imposible de reproducir "a mano" filtrando la planilla). Ahora se
   calcula EN PYTHON, directamente desde las dos columnas crudas del
   Excel (DemoraPrometida, DemoraReal), con la formula confirmada por
   el usuario:

       cumple  <=>  (DemoraReal - DemoraPrometida - 15) < 1
       equivalente a: DemoraReal <= DemoraPrometida + 15

   Es decir: cumple si el servicio se resolvio dentro de la demora
   prometida mas una tolerancia de 15 minutos; no cumple si se paso de
   ese margen. No exige ConEnvioOK=SI (se evalua sobre CUALQUIER fila
   filtrada que tenga ambos valores cargados), igual que un calculo
   manual de esas dos columnas en Excel. Filas con DemoraPrometida o
   DemoraReal en blanco NO se cuentan ni como cumplidas ni como no
   cumplidas (quedan fuera de "servicios_evaluados_demora"), igual que
   pasaria si se intentara evaluar la formula en una fila de Excel sin
   esos dos valores.

   La version anterior (basada en el campo SQL opaco, y condicionada a
   ConEnvioOK=SI) se conserva en los campos auxiliares
   "servicios_cumplidos_sql" / "servicios_no_cumplidos_sql" /
   "cumplimiento_demora_sql", solo para comparacion/auditoria contra el
   valor que trae la vista de Supabase.

3) "Asigna movil" / "No asigna movil" YA NO exigen ConEnvioOK=SI.
   Hasta v4.7.0, "No asigna movil" (con_envio_ok=SI AND asigno_movil
   != SI) daba un numero distinto al de filtrar en Excel solo por la
   columna AsignoMovil=NO (ejemplo real detectado: 50 filas en Excel
   filtrando Prestador+Estado+AsignoMovil=NO, contra 34 en la
   plataforma, porque ~16 de esas 50 filas tenian ConEnvioOK=NO y la
   plataforma las descartaba en silencio).

   Ahora "asigna_movil" y "no_asigna_movil_cantidad" son literalmente
   count(AsignoMovil=SI) / count(AsignoMovil!=SI) sobre TODO el
   universo filtrado (fecha + campana + prestador + estado + tipo),
   igual que un filtro de una sola columna en Excel. La definicion
   anterior (mas estricta, condicionada a ConEnvioOK=SI) se conserva
   en los campos auxiliares "asigna_movil_con_envio_ok" /
   "no_asigna_movil_con_envio_ok", usados unicamente para calcular
   "efectividad_enviador" (que por definicion de negocio SI depende de
   que el enviador se haya usado) y para auditoria/drill-down via las
   metricas ASIGNA_MOVIL_CON_ENVIO_OK / NO_ASIGNA_MOVIL_CON_ENVIO_OK.

Cambios de fondo de v4.7.0 (se mantienen sin modificaciones):

1) TIPO DE SERVICIO PASA A SER UN FILTRO 100% MANUAL, igual que Estado.
   Antes, TODOS los indicadores operativos (Universo seleccionado, Uso
   del enviador, Asigna movil, Servicios programados, Cumplimiento,
   etc.) se calculaban SIEMPRE sobre un universo fijo de 10 tipos de
   servicio (OPERATIONAL_TYPES), sin que el usuario lo pidiera ni lo
   viera en la interfaz. Si en Excel el usuario filtraba solo por
   Prestador+Fecha+Estado (sin restringir Tipo de servicio), el
   universo de Excel incluia TODOS los tipos, mientras que la
   plataforma silenciosamente excluia los que no estaban en esa lista
   fija (por ejemplo "DEVOLUCION DEL VEHICULO REPARADO" y
   "VIA PUBLICA - REMOLQUE"), generando una discrepancia que el usuario
   no podia explicarse.

   Ahora: sin seleccionar ningun tipo, se incluyen TODOS los tipos
   (igual que Excel sin filtro de tipo). Si el usuario quiere replicar
   el universo operativo historico de 10 tipos, puede seleccionarlos
   manualmente en el nuevo filtro "Tipo de servicio" (se agrego el
   endpoint /api/metricas-trackeo/tipos-servicio para listarlos, con
   marca de cuales pertenecian al conjunto historico).

2) "Servicios programados" (la tarjeta) YA NO exige ConEnvioOK=SI Y
   AsignoMovil=SI ademas de EsProgramado=SI. Ahora es literalmente
   count(EsProgramado = SI) sobre el universo filtrado (fecha +
   campana + prestador + estado + tipo), replicando exactamente lo que
   se obtiene filtrando una sola columna en Excel. La definicion
   anterior (mas estricta) se conserva como campo adicional
   "servicios_programados_asignados", para no perder informacion ni
   trazabilidad, pero YA NO es la cifra que muestra la tarjeta
   principal.

Se mantiene sin cambios funcionales:
- CORS: dominio estable + regex de Preview de Vercel.
- Coalescing de descargas concurrentes (evita cache stampede).
- Filtro de Estado 100% manual (v4.4.0/v4.5.0).
- Normalizacion de texto reforzada: colapsa espacios repetidos y
  caracteres invisibles (zero-width space, BOM, etc.) (v4.5.0/v4.6.0).
- Endpoints de diagnostico /diagnostico-tipos, /diagnostico-caracteres,
  /diagnostico-programados.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import threading
import time
import unicodedata
import uuid
from collections import defaultdict
from datetime import date
from pathlib import Path
from statistics import mean
from typing import Any, Optional
from urllib.parse import quote
from uuid import UUID

import httpx
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from supabase import Client, create_client

# ============================================================
# CONFIGURACION
# ============================================================

APP_VERSION = os.getenv("APP_VERSION", "4.10.0")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")

SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_SERVICE_KEY")
    or ""
)
if not SUPABASE_KEY:
    raise RuntimeError("Falta SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SERVICE_KEY")

API_TOKEN = os.getenv("API_TOKEN")
BUCKET = os.getenv("REPORTS_BUCKET", "reportes")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "80"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
HTTP_TIMEOUT_SECONDS = float(os.getenv("HTTP_TIMEOUT_SECONDS", "120"))
ANALYTICS_CACHE_SECONDS = float(os.getenv("ANALYTICS_CACHE_SECONDS", "45"))
SUPABASE_PAGE_RETRIES = int(os.getenv("SUPABASE_PAGE_RETRIES", "3"))
BASE_TABLE = os.getenv("BASE_VIEW", "v_metricas_trackeo_base")
UNIVERSOS_TABLE = os.getenv("UNIVERSOS_VIEW", "v_metricas_trackeo_universos")

# Conjunto historico de 10 tipos de servicio que ANTES se aplicaba
# automaticamente como un gate obligatorio. Desde v4.7.0 este conjunto
# YA NO SE APLICA AUTOMATICAMENTE. Se conserva unicamente:
#   a) para marcar, en /api/metricas-trackeo/tipos-servicio y en los
#      endpoints de diagnostico, que tipos pertenecian al universo
#      historico (util para quien quiera reconstruir esa vista
#      seleccionando manualmente esos mismos tipos en el filtro);
#   b) como valor por defecto sugerido en la interfaz, si se decide
#      preseleccionar algo (decision que le corresponde al frontend,
#      no al backend).
UNIVERSO_OPERATIVO_HISTORICO = {
    "REMOLQUE",
    "REMOLQUE MOTOS",
    "EXTRACCION",
    "CAMBIO DE NEUMATICO",
    "MECANICA LIGERA",
    "REMOLQUE (PEAJES A CARGO DE CA)",
    "DEPOSITO O CUSTODIA DEL VEHICULO",
    "REMOLQUE CAMIONES (DESENGANCHAR CARDAN)",
    "EXTRACCION DE MOTOS",
    "MECANICA LIGERA CAMIONES FORD",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("reporteria-api")

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="Reporteria Prestadores API", version=APP_VERSION)


# ============================================================
# CORS
# ============================================================


def _get_allowed_origins() -> list[str]:
    raw = os.getenv(
        "FRONTEND_ORIGINS",
        "https://reporteria-frontend.vercel.app,"
        "http://localhost:5173,"
        "http://localhost:4173",
    )
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


VERCEL_PREVIEW_REGEX = (
    r"^https:\/\/reporteria-frontend"
    r"(-[a-z0-9]+)?"
    r"(-[a-z0-9-]+)?"
    r"\.vercel\.app$"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_allowed_origins(),
    allow_origin_regex=VERCEL_PREVIEW_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "HEAD"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    request_id = str(uuid.uuid4())
    logger.exception("request_id=%s path=%s error=%s", request_id, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": {
                "mensaje": "Error interno del backend.",
                "request_id": request_id,
                "error": str(exc)[:1000],
            }
        },
    )


# ============================================================
# UTILIDADES
# ============================================================


def require_token(authorization: Optional[str] = Header(None)):
    if API_TOKEN and authorization != f"Bearer {API_TOKEN}":
        raise HTTPException(status_code=401, detail="Token invalido")


def valid_uuid_or_none(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


# Caracteres invisibles conocidos que NO son detectados por \s pero que
# son comunes al copiar/pegar texto desde Excel o Word:
#   U+200B  zero-width space
#   U+200C  zero-width non-joiner
#   U+200D  zero-width joiner
#   U+FEFF  byte order mark / zero-width no-break space
_INVISIBLE_RE = re.compile("[\u200b\u200c\u200d\ufeff]")
_WHITESPACE_RE = re.compile(r"\s+")


def normalize_text(value: Any) -> Optional[str]:
    """Normaliza texto para comparaciones de filtro: colapsa espacios
    repetidos y reemplaza caracteres invisibles conocidos por un
    espacio antes de colapsar, para que variantes visualmente
    identicas normalicen exactamente igual."""

    if value is None:
        return None
    text = str(value)
    text = _INVISIBLE_RE.sub(" ", text)
    text = text.strip()
    if not text:
        return None
    text = _WHITESPACE_RE.sub(" ", text)
    return text.upper()


def char_breakdown(value: Any, max_chars: int = 60) -> list[dict[str, Any]]:
    text = "" if value is None else str(value)
    breakdown = []
    for ch in text[:max_chars]:
        try:
            name = unicodedata.name(ch)
        except ValueError:
            name = "SIN NOMBRE UNICODE"
        breakdown.append(
            {
                "caracter": ch if ch.isprintable() and ch != " " else f"[{name}]",
                "codigo_unicode": f"U+{ord(ch):04X}",
                "nombre_unicode": name,
                "es_espacio_visible": ch == " ",
                "es_invisible_no_estandar": ch in "\u200b\u200c\u200d\ufeff\u00a0",
            }
        )
    return breakdown


def is_blank(value: Any) -> bool:
    return value is None or str(value).strip() == ""


def validate_date_range(fecha_desde: date, fecha_hasta: date):
    if fecha_desde > fecha_hasta:
        raise HTTPException(
            status_code=422, detail="fecha_desde no puede ser posterior a fecha_hasta"
        )


def clean_list(values: Optional[list[str]]) -> Optional[list[str]]:
    if not values:
        return None
    cleaned = [v.strip() for v in values if v and v.strip()]
    return cleaned or None


# ============================================================
# CARGA DE DATOS BASE (coalescing de descargas concurrentes)
# ============================================================

_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_cache_data_lock = threading.Lock()
_key_locks: dict[str, threading.Lock] = {}
_key_locks_guard = threading.Lock()


def _lock_for_key(key: str) -> threading.Lock:
    with _key_locks_guard:
        lock = _key_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _key_locks[key] = lock
        return lock


def _fetch_page_with_retry(
    table: str,
    columns: str,
    fecha_desde: date,
    fecha_hasta: date,
    start: int,
    page_size: int,
) -> list[dict[str, Any]]:
    last_error: Optional[Exception] = None

    for attempt in range(1, SUPABASE_PAGE_RETRIES + 1):
        try:
            response = (
                sb.table(table)
                .select(columns)
                .gte("fecha", fecha_desde.isoformat())
                .lte("fecha", fecha_hasta.isoformat())
                .range(start, start + page_size - 1)
                .execute()
            )
            return response.data or []
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.warning(
                "supabase_page_retry table=%s start=%s intento=%s/%s error=%s",
                table,
                start,
                attempt,
                SUPABASE_PAGE_RETRIES,
                str(exc)[:300],
            )
            if attempt < SUPABASE_PAGE_RETRIES:
                time.sleep(0.4 * (2 ** (attempt - 1)))

    raise HTTPException(
        status_code=502,
        detail={
            "mensaje": "Error consultando Supabase",
            "tabla": table,
            "error": str(last_error)[:500],
        },
    )


def _fetch_all_rows(
    table: str, columns: str, fecha_desde: date, fecha_hasta: date
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    page_size = 1000
    start = 0

    while True:
        chunk = _fetch_page_with_retry(
            table, columns, fecha_desde, fecha_hasta, start, page_size
        )
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        start += page_size

    return rows


def _get_rows_cached(
    cache_prefix: str,
    table: str,
    columns: str,
    fecha_desde: date,
    fecha_hasta: date,
) -> list[dict[str, Any]]:
    key = f"{cache_prefix}:{fecha_desde.isoformat()}:{fecha_hasta.isoformat()}"
    now = time.time()

    with _cache_data_lock:
        cached = _cache.get(key)
    if cached and (now - cached[0]) < ANALYTICS_CACHE_SECONDS:
        return cached[1]

    lock = _lock_for_key(key)
    with lock:
        with _cache_data_lock:
            cached = _cache.get(key)
        now = time.time()
        if cached and (now - cached[0]) < ANALYTICS_CACHE_SECONDS:
            return cached[1]

        rows = _fetch_all_rows(table, columns, fecha_desde, fecha_hasta)

        with _cache_data_lock:
            _cache[key] = (time.time(), rows)

        return rows


def get_base_rows(fecha_desde: date, fecha_hasta: date) -> list[dict[str, Any]]:
    columns = (
        "servicio_row_id,report_id,prestador_id,prestador,"
        "campana,campana_normalizada,tipo_de_servicio,"
        "tipo_de_servicio_normalizado,estado,estado_normalizado,"
        "despachado_por,fecha,alta_del_servicio,con_envio_ok,"
        "asigno_movil,es_programado,demora_prometida,demora_real,"
        "cumple_demora_prometida_15,rango_demora_real,"
        "id_servicio_prestado,id_orden_de_servicio,raw"
    )
    return _get_rows_cached("base", BASE_TABLE, columns, fecha_desde, fecha_hasta)


def get_universos_rows(fecha_desde: date, fecha_hasta: date) -> list[dict[str, Any]]:
    columns = (
        "fecha,campana_normalizada,prestador_id,estado_normalizado,"
        "pertenece_universo_vehicular,pertenece_universo_evaluable,"
        "estado_cancelado,estado_final,motivo_universo,"
        "pertenece_universo_excel"
    )
    return _get_rows_cached(
        "universos", UNIVERSOS_TABLE, columns, fecha_desde, fecha_hasta
    )


# ============================================================
# FILTRADO
# ============================================================


def apply_common_filters(
    rows: list[dict[str, Any]],
    campanas: Optional[list[str]],
    prestador_ids: Optional[list[str]],
    estados: Optional[list[str]],
    tipos: Optional[list[str]] = None,
) -> list[dict[str, Any]]:
    """Filtra filas por campana, prestador, estado y tipo de servicio.

    TODOS estos filtros son 100% MANUALES: si una lista viene vacia o
    None, NO se restringe por ese criterio (se incluyen todos los
    valores), replicando exactamente el comportamiento de no aplicar
    ese filtro en Excel. Esto aplica igual para 'estados' (desde
    v4.4.0) y para 'tipos' (desde v4.7.0, antes forzado a un conjunto
    fijo de 10 tipos sin que el usuario lo pidiera).
    """

    campanas_norm = {normalize_text(c) for c in (campanas or [])}
    prestadores_set = set(prestador_ids or [])
    estados_norm = {normalize_text(e) for e in (estados or [])}
    tipos_norm = {normalize_text(t) for t in (tipos or [])}

    result = []
    for row in rows:
        if tipos_norm:
            tipo_row = row.get("tipo_de_servicio_normalizado") or normalize_text(
                row.get("tipo_de_servicio")
            )
            if tipo_row not in tipos_norm:
                continue

        if campanas_norm:
            campana_row = row.get("campana_normalizada") or normalize_text(
                row.get("campana")
            )
            if campana_row not in campanas_norm:
                continue

        if prestadores_set and row.get("prestador_id") not in prestadores_set:
            continue

        if estados_norm:
            estado_row = row.get("estado_normalizado") or normalize_text(
                row.get("estado")
            )
            if estado_row not in estados_norm:
                continue

        result.append(row)

    return result


# ============================================================
# CALCULO DE METRICAS
# ============================================================


def compute_cumple_demora(row: dict[str, Any]) -> Optional[bool]:
    """Cumplimiento de demora, calculado directamente desde las columnas
    crudas del Excel (DemoraPrometida = columna N, DemoraReal = columna
    Q), replicando LITERALMENTE (sin reordenar terminos, para no
    introducir un corrimiento en el limite) la formula de Excel
    confirmada por el usuario:

        =SI((DemoraPrometida + 15 - DemoraReal) < 1; "No"; "Si")

    Ojo: esto NO es lo mismo que "DemoraReal <= DemoraPrometida + 15".
    Por el "<1" estricto, el limite real es DemoraReal <= DemoraPrometida
    + 14 (a DemoraReal == DemoraPrometida + 15 exacto, la formula de
    Excel da "No"). Devuelve None si falta DemoraPrometida o DemoraReal
    (no evaluable, igual que en Excel)."""

    dp = row.get("demora_prometida")
    dr = row.get("demora_real")
    if dp is None or dr is None:
        return None
    try:
        valor = float(dp) + 15 - float(dr)
    except (TypeError, ValueError):
        return None
    return not (valor < 1)


def compute_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)

    enviador_si_rows = [r for r in rows if r.get("con_envio_ok") is True]
    enviador_no_rows = [r for r in rows if r.get("con_envio_ok") is False]

    enviador_si = len(enviador_si_rows)
    enviador_no = len(enviador_no_rows)

    # CORREGIDO v4.8.0: "asigna_movil" / "no_asigna_movil_cantidad" ahora
    # son literalmente count(AsignoMovil=SI) / count(AsignoMovil!=SI)
    # sobre TODO el universo filtrado, SIN exigir con_envio_ok=SI. Esto
    # replica exactamente lo que se obtiene filtrando una sola columna
    # (AsignoMovil) en Excel sobre el mismo conjunto de filas.
    asigna_movil_rows = [r for r in rows if r.get("asigno_movil") is True]
    asigna_movil = len(asigna_movil_rows)
    no_asigna_movil = total - asigna_movil

    # Definicion anterior (mas estricta), CONSERVADA como campo auxiliar
    # de auditoria y como base de "efectividad_enviador" (que por
    # definicion de negocio si depende de que el enviador se haya
    # usado): con_envio_ok=SI Y asigno_movil=SI/!=SI.
    asigna_movil_con_envio_rows = [
        r for r in enviador_si_rows if r.get("asigno_movil") is True
    ]
    asigna_movil_con_envio_ok = len(asigna_movil_con_envio_rows)
    no_asigna_movil_con_envio_ok = enviador_si - asigna_movil_con_envio_ok

    # CORREGIDO v4.7.0: "servicios_programados" ahora es literalmente
    # count(es_programado is True) sobre TODO el universo filtrado,
    # SIN exigir con_envio_ok ni asigno_movil. Esto replica exactamente
    # lo que se obtiene filtrando una sola columna (EsProgramado=SI)
    # en Excel sobre el mismo conjunto de filas (Prestador+Fecha+
    # Estado+Campana+Tipo, segun lo que el usuario haya seleccionado).
    servicios_programados_rows = [r for r in rows if r.get("es_programado") is True]
    servicios_programados = len(servicios_programados_rows)

    # Definicion anterior (mas estricta), CONSERVADA para auditoria y
    # contexto adicional, pero YA NO es la cifra principal de la
    # tarjeta "Servicios programados".
    programados_asignados_rows = [
        r for r in asigna_movil_rows if r.get("es_programado") is True
    ]
    servicios_programados_asignados = len(programados_asignados_rows)

    # CORREGIDO v4.9.0: "Cumplimiento de demora" ahora se calcula EN
    # PYTHON directamente desde DemoraPrometida/DemoraReal (formula
    # confirmada por el usuario: cumple si DemoraReal <= DemoraPrometida
    # + 15), sobre TODO el universo filtrado, sin exigir ConEnvioOK=SI.
    # Una fila sin DemoraPrometida o sin DemoraReal no es evaluable
    # (compute_cumple_demora devuelve None) y queda fuera tanto de
    # cumplidos como de no_cumplidos, igual que en Excel.
    cumplidos_rows = [r for r in rows if compute_cumple_demora(r) is True]
    no_cumplidos_rows = [r for r in rows if compute_cumple_demora(r) is False]

    cumplidos = len(cumplidos_rows)
    no_cumplidos = len(no_cumplidos_rows)
    evaluados = cumplidos + no_cumplidos

    # Definicion anterior (campo `cumple_demora_prometida_15` calculado
    # por la funcion SQL fn_consolidar_trackeo, condicionado a
    # ConEnvioOK=SI), CONSERVADA unicamente como campo auxiliar de
    # auditoria/comparacion contra la formula literal de arriba.
    cumplidos_sql_rows = [
        r for r in enviador_si_rows if r.get("cumple_demora_prometida_15") is True
    ]
    no_cumplidos_sql_rows = [
        r for r in enviador_si_rows if r.get("cumple_demora_prometida_15") is False
    ]
    cumplidos_sql = len(cumplidos_sql_rows)
    no_cumplidos_sql = len(no_cumplidos_sql_rows)
    evaluados_sql = cumplidos_sql + no_cumplidos_sql

    def rango_count(label: str) -> int:
        return len([r for r in cumplidos_rows if r.get("rango_demora_real") == label])

    menos_60 = rango_count("MENOS DE 60")
    entre_61_90 = rango_count("ENTRE 61 Y 90")
    entre_91_120 = rango_count("ENTRE 91 Y 120")
    entre_121_180 = rango_count("ENTRE 121 Y 180")
    mas_181 = rango_count("+ DE 181")
    na = rango_count("N/A")

    def ratio(numerator: int, denominator: int) -> float:
        return round(numerator / denominator, 10) if denominator else 0.0

    demora_reales = [
        float(r["demora_real"]) for r in enviador_si_rows if r.get("demora_real") is not None
    ]
    demora_prometidas = [
        float(r["demora_prometida"])
        for r in enviador_si_rows
        if r.get("demora_prometida") is not None
    ]

    return {
        "servicios_consultados": total,
        "enviador_no": enviador_no,
        "enviador_si": enviador_si,
        "uso_enviador": ratio(enviador_si, total),
        # Cifras principales de las tarjetas "Asigna movil" / "No asigna
        # movil": count(AsignoMovil=SI/!=SI) sobre el total filtrado,
        # igual que un filtro de una sola columna en Excel.
        "asigna_movil": asigna_movil,
        "asigna_movil_porcentaje": ratio(asigna_movil, total),
        "no_asigna_movil_cantidad": no_asigna_movil,
        "no_asigna_movil_porcentaje": ratio(no_asigna_movil, total),
        # Campos auxiliares de auditoria (definicion anterior, mas
        # estricta): con_envio_ok=SI Y asigno_movil=SI/!=SI. Base de
        # "efectividad_enviador", que por definicion de negocio depende
        # de que el enviador se haya usado.
        "asigna_movil_con_envio_ok": asigna_movil_con_envio_ok,
        "no_asigna_movil_con_envio_ok": no_asigna_movil_con_envio_ok,
        "efectividad_enviador": ratio(asigna_movil_con_envio_ok, enviador_si),
        # Cifra principal de la tarjeta "Servicios programados":
        # count(EsProgramado=SI) sobre el total filtrado, igual que un
        # filtro de una sola columna en Excel.
        "servicios_programados": servicios_programados,
        "programados_porcentaje": ratio(servicios_programados, total),
        # Campos adicionales de auditoria (definicion anterior, mas
        # estricta): con_envio_ok=SI Y asigno_movil=SI Y es_programado=SI.
        "servicios_programados_asignados": servicios_programados_asignados,
        "programados_asignados_porcentaje_sobre_enviador": ratio(
            servicios_programados_asignados, enviador_si
        ),
        # Cifras principales de la tarjeta "Cumplimiento de demora":
        # formula literal sobre DemoraPrometida/DemoraReal (ver
        # compute_cumple_demora), sobre el total filtrado.
        "servicios_evaluados_demora": evaluados,
        "servicios_cumplidos": cumplidos,
        "servicios_no_cumplidos": no_cumplidos,
        "cumplimiento_demora": ratio(cumplidos, evaluados),
        # Campos auxiliares de auditoria: definicion anterior, tomada
        # del campo `cumple_demora_prometida_15` calculado por la
        # funcion SQL fn_consolidar_trackeo (condicionada a
        # ConEnvioOK=SI). Solo para comparar contra la formula literal.
        "servicios_evaluados_demora_sql": evaluados_sql,
        "servicios_cumplidos_sql": cumplidos_sql,
        "servicios_no_cumplidos_sql": no_cumplidos_sql,
        "cumplimiento_demora_sql": ratio(cumplidos_sql, evaluados_sql),
        "menos_60_cantidad": menos_60,
        "menos_60_porcentaje": ratio(menos_60, cumplidos),
        "entre_61_90_cantidad": entre_61_90,
        "entre_61_90_porcentaje": ratio(entre_61_90, cumplidos),
        "entre_91_120_cantidad": entre_91_120,
        "entre_91_120_porcentaje": ratio(entre_91_120, cumplidos),
        "entre_121_180_cantidad": entre_121_180,
        "entre_121_180_porcentaje": ratio(entre_121_180, cumplidos),
        "mas_181_cantidad": mas_181,
        "mas_181_porcentaje": ratio(mas_181, cumplidos),
        "na_cantidad": na,
        "na_porcentaje": ratio(na, cumplidos),
        "demora_real_promedio": round(mean(demora_reales), 2) if demora_reales else None,
        "demora_prometida_promedio": (
            round(mean(demora_prometidas), 2) if demora_prometidas else None
        ),
    }


def raw_flag(row: dict[str, Any], *keywords: str) -> Optional[bool]:
    raw = row.get("raw")
    if not isinstance(raw, dict):
        return None
    for key, value in raw.items():
        key_lower = key.lower()
        if all(word in key_lower for word in keywords):
            if isinstance(value, bool):
                return value
            text = str(value).strip().upper()
            if text in {"SI", "SÍ", "S", "TRUE", "1", "YES"}:
                return True
            if text in {"NO", "N", "FALSE", "0", ""}:
                return False
    return None


def compute_quality(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)

    def count_complete(field: str) -> int:
        return len([r for r in rows if not is_blank(r.get(field))])

    coordenadas = 0
    movil_registrado = 0
    for row in rows:
        if raw_flag(row, "coorden"):
            coordenadas += 1
        if raw_flag(row, "movil", "registr"):
            movil_registrado += 1

    return {
        "total": total,
        "tipo_servicio_completo": count_complete("tipo_de_servicio"),
        "estado_completo": count_complete("estado"),
        "campana_completa": count_complete("campana"),
        "prestador_completo": len([r for r in rows if r.get("prestador_id")]),
        "despachador_completo": count_complete("despachado_por"),
        "coordenadas_disponibles": coordenadas,
        "movil_registrado": movil_registrado,
        "demora_prometida_completa": len(
            [r for r in rows if r.get("demora_prometida") is not None]
        ),
        "demora_real_completa": len(
            [r for r in rows if r.get("demora_real") is not None]
        ),
    }


def to_service(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "servicio_row_id": row.get("servicio_row_id"),
        "report_id": row.get("report_id"),
        "prestador_id": row.get("prestador_id"),
        "prestador": row.get("prestador"),
        "fecha": row.get("fecha"),
        "alta_del_servicio": row.get("alta_del_servicio"),
        "id_servicio_prestado": row.get("id_servicio_prestado"),
        "id_orden_de_servicio": row.get("id_orden_de_servicio"),
        "tipo_de_servicio": row.get("tipo_de_servicio"),
        "estado": row.get("estado"),
        "campana": row.get("campana"),
        "con_envio_ok": row.get("con_envio_ok"),
        "asigno_movil": row.get("asigno_movil"),
        "es_programado": row.get("es_programado"),
        "demora_prometida": row.get("demora_prometida"),
        "demora_real": row.get("demora_real"),
        # Resultado de la formula literal confirmada por el usuario
        # (DemoraReal <= DemoraPrometida + 15), la que usa la tarjeta
        # "Cumplimiento de demora" desde v4.9.0.
        "cumple_demora_prometida_15": compute_cumple_demora(row),
        # Campo auxiliar de auditoria: valor anterior, calculado por la
        # funcion SQL fn_consolidar_trackeo en Supabase (no
        # necesariamente igual al de arriba).
        "cumple_demora_prometida_15_sql": row.get("cumple_demora_prometida_15"),
        "rango_demora_real": row.get("rango_demora_real"),
    }


def matches_metric(row: dict[str, Any], metrica: str) -> bool:
    con_envio_ok = row.get("con_envio_ok")
    asigno_movil = row.get("asigno_movil")
    es_programado = row.get("es_programado")
    # CORREGIDO v4.9.0: "cumple" usa la formula literal calculada desde
    # DemoraPrometida/DemoraReal (ver compute_cumple_demora), no el
    # campo SQL opaco. `cumple_sql` conserva la definicion anterior
    # para las metricas auxiliares *_SQL.
    cumple = compute_cumple_demora(row)
    cumple_sql = row.get("cumple_demora_prometida_15")
    rango = row.get("rango_demora_real")

    if metrica == "ENVIADOR_SI":
        return con_envio_ok is True
    if metrica == "ENVIADOR_NO":
        return con_envio_ok is False
    if metrica == "ASIGNA_MOVIL":
        # CORREGIDO v4.8.0: coincide con la nueva definicion de la
        # tarjeta "Asigna movil": solo AsignoMovil=SI, sin exigir
        # ConEnvioOK. Asi "Ver servicios" muestra exactamente el mismo
        # conjunto que cuenta la tarjeta.
        return asigno_movil is True
    if metrica == "NO_ASIGNA_MOVIL":
        # CORREGIDO v4.8.0: idem, solo AsignoMovil!=SI.
        return asigno_movil is not True
    if metrica == "ASIGNA_MOVIL_CON_ENVIO_OK":
        # Metrica auxiliar para auditar la definicion anterior (mas
        # estricta), disponible para drill-down si se necesita.
        return con_envio_ok is True and asigno_movil is True
    if metrica == "NO_ASIGNA_MOVIL_CON_ENVIO_OK":
        return con_envio_ok is True and asigno_movil is not True
    if metrica == "PROGRAMADOS":
        # CORREGIDO v4.7.0: coincide con la nueva definicion de la
        # tarjeta "Servicios programados": solo EsProgramado=SI, sin
        # exigir con_envio_ok ni asigno_movil. Asi "Ver servicios"
        # muestra exactamente el mismo conjunto que cuenta la tarjeta.
        return es_programado is True
    if metrica == "PROGRAMADOS_ASIGNADOS":
        # Metrica adicional para auditar la definicion anterior (mas
        # estricta), disponible para drill-down si se necesita.
        return con_envio_ok is True and asigno_movil is True and es_programado is True
    if metrica == "CUMPLE_DEMORA":
        # CORREGIDO v4.9.0: coincide con la nueva definicion de la
        # tarjeta "Cumplimiento de demora": DemoraReal <= DemoraPrometida
        # + 15, sin exigir ConEnvioOK. Asi "Ver servicios" muestra
        # exactamente el mismo conjunto que cuenta la tarjeta.
        return cumple is True
    if metrica == "NO_CUMPLE_DEMORA":
        return cumple is False
    if metrica == "MENOS_60":
        return cumple is True and rango == "MENOS DE 60"
    if metrica == "ENTRE_61_90":
        return cumple is True and rango == "ENTRE 61 Y 90"
    if metrica == "ENTRE_91_120":
        return cumple is True and rango == "ENTRE 91 Y 120"
    if metrica == "ENTRE_121_180":
        return cumple is True and rango == "ENTRE 121 Y 180"
    if metrica == "MAS_181":
        return cumple is True and rango == "+ DE 181"
    if metrica == "NA":
        return cumple is True and rango == "N/A"
    if metrica == "CUMPLE_DEMORA_SQL":
        # Metrica auxiliar para auditar la definicion anterior (campo
        # SQL opaco, condicionada a ConEnvioOK=SI).
        return con_envio_ok is True and cumple_sql is True
    if metrica == "NO_CUMPLE_DEMORA_SQL":
        return con_envio_ok is True and cumple_sql is False
    return False


# ============================================================
# PARAMETROS COMUNES
# ============================================================


def metric_query_params(
    fecha_desde: date = Query(...),
    fecha_hasta: date = Query(...),
    campana: Optional[list[str]] = Query(default=None),
    prestador_id: Optional[list[UUID]] = Query(default=None),
    estado: Optional[list[str]] = Query(default=None),
    tipo: Optional[list[str]] = Query(default=None),
) -> dict[str, Any]:
    validate_date_range(fecha_desde, fecha_hasta)
    return {
        "fecha_desde": fecha_desde,
        "fecha_hasta": fecha_hasta,
        "campanas": clean_list(campana),
        "prestador_ids": [str(p) for p in prestador_id] if prestador_id else None,
        "estados": clean_list(estado),
        "tipos": clean_list(tipo),
    }


# ============================================================
# ENDPOINTS BASICOS
# ============================================================


@app.get("/")
def home():
    return {"servicio": "Reporteria Prestadores API", "estado": "activo", "version": APP_VERSION}


@app.head("/", include_in_schema=False)
def head_home():
    return Response(status_code=200)


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get("/health")
def health():
    sb.table("reportes").select("id").limit(1).execute()
    return {"ok": True, "version": APP_VERSION}


# ============================================================
# ENDPOINTS ANALITICOS
# ============================================================


@app.get("/api/metricas-trackeo/resumen")
def metricas_resumen(params: dict = Depends(metric_query_params)):
    rows = get_base_rows(params["fecha_desde"], params["fecha_hasta"])
    filtered = apply_common_filters(
        rows,
        params["campanas"],
        params["prestador_ids"],
        params["estados"],
        params["tipos"],
    )
    return {"resumen": compute_summary(filtered)}


@app.get("/api/metricas-trackeo/universos")
def metricas_universos(params: dict = Depends(metric_query_params)):
    rows = get_universos_rows(params["fecha_desde"], params["fecha_hasta"])

    # v_metricas_trackeo_universos no trae la columna tipo_de_servicio
    # en las columnas seleccionadas por get_universos_rows, por lo que
    # el filtro de tipo no aplica a este endpoint (se mantiene igual
    # que antes: solo campana, prestador y estado).
    filtered = apply_common_filters(
        rows,
        params["campanas"],
        params["prestador_ids"],
        params["estados"],
    )

    total = len(filtered)
    vehiculares = len([r for r in filtered if r.get("pertenece_universo_vehicular")])
    evaluables = len([r for r in filtered if r.get("pertenece_universo_evaluable")])
    cancelados = len(
        [r for r in filtered if r.get("pertenece_universo_vehicular") and r.get("estado_cancelado")]
    )
    no_finalizados = len(
        [
            r
            for r in filtered
            if r.get("pertenece_universo_vehicular")
            and not r.get("estado_final")
            and not r.get("estado_cancelado")
        ]
    )
    no_vehiculares = len([r for r in filtered if r.get("motivo_universo") == "NO_VEHICULAR"])
    tipo_no_catalogado = len(
        [r for r in filtered if r.get("motivo_universo") == "TIPO_NO_CATALOGADO"]
    )
    estado_no_catalogado = len(
        [
            r
            for r in filtered
            if r.get("pertenece_universo_vehicular")
            and r.get("motivo_universo") == "ESTADO_NO_CATALOGADO"
        ]
    )
    universo_excel = len([r for r in filtered if r.get("pertenece_universo_excel")])

    return {
        "universos": {
            "servicios_cargados": total,
            "servicios_vehiculares": vehiculares,
            "servicios_evaluables": evaluables,
            "servicios_cancelados": cancelados,
            "servicios_no_finalizados": no_finalizados,
            "servicios_no_vehiculares": no_vehiculares,
            "servicios_tipo_no_catalogado": tipo_no_catalogado,
            "servicios_estado_no_catalogado": estado_no_catalogado,
            "universo_excel_historico": universo_excel,
        }
    }


@app.get("/api/metricas-trackeo/prestadores")
def metricas_prestadores(params: dict = Depends(metric_query_params)):
    rows = get_base_rows(params["fecha_desde"], params["fecha_hasta"])
    filtered = apply_common_filters(
        rows,
        params["campanas"],
        params["prestador_ids"],
        params["estados"],
        params["tipos"],
    )

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    names: dict[str, str] = {}
    for row in filtered:
        pid = row.get("prestador_id") or "SIN_PRESTADOR"
        groups[pid].append(row)
        if row.get("prestador"):
            names[pid] = row["prestador"]

    prestadores = []
    for pid, group_rows in groups.items():
        summary = compute_summary(group_rows)
        prestadores.append(
            {
                "prestador_id": pid,
                "prestador": names.get(pid, "SIN PRESTADOR"),
                "total_general": len(group_rows),
                **summary,
            }
        )

    prestadores.sort(key=lambda p: p["total_general"], reverse=True)
    return {"cantidad_prestadores": len(prestadores), "prestadores": prestadores}


@app.get("/api/metricas-trackeo/campanas")
def metricas_campanas(
    fecha_desde: date = Query(...),
    fecha_hasta: date = Query(...),
    prestador_id: Optional[list[UUID]] = Query(default=None),
    estado: Optional[list[str]] = Query(default=None),
    tipo: Optional[list[str]] = Query(default=None),
):
    validate_date_range(fecha_desde, fecha_hasta)
    rows = get_base_rows(fecha_desde, fecha_hasta)
    filtered = apply_common_filters(
        rows,
        None,
        [str(p) for p in prestador_id] if prestador_id else None,
        clean_list(estado),
        clean_list(tipo),
    )

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    labels: dict[str, str] = {}
    for row in filtered:
        key = row.get("campana_normalizada") or "SIN_CAMPANA"
        groups[key].append(row)
        if row.get("campana"):
            labels[key] = row["campana"]

    campanas = [
        {"campana": labels.get(k, "SIN CAMPAÑA"), "campana_normalizada": k, "servicios": len(g)}
        for k, g in groups.items()
    ]
    campanas.sort(key=lambda c: c["servicios"], reverse=True)

    return {
        "cantidad_campanas": len(campanas),
        "total_servicios": sum(c["servicios"] for c in campanas),
        "campanas": campanas,
    }


@app.get("/api/metricas-trackeo/lista-prestadores")
def metricas_lista_prestadores(
    fecha_desde: date = Query(...),
    fecha_hasta: date = Query(...),
    campana: Optional[list[str]] = Query(default=None),
    estado: Optional[list[str]] = Query(default=None),
    tipo: Optional[list[str]] = Query(default=None),
):
    validate_date_range(fecha_desde, fecha_hasta)
    rows = get_base_rows(fecha_desde, fecha_hasta)
    filtered = apply_common_filters(
        rows, clean_list(campana), None, clean_list(estado), clean_list(tipo)
    )

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    names: dict[str, str] = {}
    for row in filtered:
        pid = row.get("prestador_id")
        if not pid:
            continue
        groups[pid].append(row)
        if row.get("prestador"):
            names[pid] = row["prestador"]

    prestadores = [
        {"prestador_id": pid, "prestador": names.get(pid, "SIN PRESTADOR"), "servicios": len(g)}
        for pid, g in groups.items()
    ]
    prestadores.sort(key=lambda p: p["prestador"])

    return {"cantidad_prestadores": len(prestadores), "prestadores": prestadores}


@app.get("/api/metricas-trackeo/estados")
def metricas_estados(
    fecha_desde: date = Query(...),
    fecha_hasta: date = Query(...),
    campana: Optional[list[str]] = Query(default=None),
    prestador_id: Optional[list[UUID]] = Query(default=None),
    tipo: Optional[list[str]] = Query(default=None),
):
    """Lista de estados disponibles. No filtra por estado (para
    poblar el dropdown completo). Admite filtrar por tipo de
    servicio, si el frontend quiere mostrar solo los estados presentes
    dentro de un tipo ya seleccionado."""

    validate_date_range(fecha_desde, fecha_hasta)
    rows = get_base_rows(fecha_desde, fecha_hasta)
    filtered = apply_common_filters(
        rows,
        clean_list(campana),
        [str(p) for p in prestador_id] if prestador_id else None,
        None,
        clean_list(tipo),
    )

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    labels: dict[str, str] = {}
    for row in filtered:
        key = row.get("estado_normalizado") or normalize_text(row.get("estado"))
        if not key:
            continue
        groups[key].append(row)
        if row.get("estado"):
            labels[key] = row["estado"]

    estados = [
        {"estado": labels.get(k, k), "estado_normalizado": k, "cantidad": len(g)}
        for k, g in groups.items()
    ]
    estados.sort(key=lambda e: e["cantidad"], reverse=True)

    return {
        "cantidad_estados": len(estados),
        "total_servicios": len(filtered),
        "estados": estados,
    }


@app.get("/api/metricas-trackeo/tipos-servicio")
def metricas_tipos_servicio(
    fecha_desde: date = Query(...),
    fecha_hasta: date = Query(...),
    campana: Optional[list[str]] = Query(default=None),
    prestador_id: Optional[list[UUID]] = Query(default=None),
    estado: Optional[list[str]] = Query(default=None),
):
    """NUEVO en v4.7.0. Lista de tipos de servicio disponibles, para
    poblar el nuevo filtro manual "Tipo de servicio" (analogo a
    /estados). No filtra por tipo (para mostrar el dropdown completo).
    Marca ademas cuales tipos pertenecian al antiguo universo operativo
    fijo, por si se quiere reconstruir esa seleccion manualmente."""

    validate_date_range(fecha_desde, fecha_hasta)
    rows = get_base_rows(fecha_desde, fecha_hasta)
    filtered = apply_common_filters(
        rows,
        clean_list(campana),
        [str(p) for p in prestador_id] if prestador_id else None,
        clean_list(estado),
        None,
    )

    groups: dict[str, dict[str, Any]] = {}
    for row in filtered:
        tipo_norm = row.get("tipo_de_servicio_normalizado") or normalize_text(
            row.get("tipo_de_servicio")
        )
        key = tipo_norm or "SIN_TIPO"
        item = groups.setdefault(
            key,
            {
                "tipo_de_servicio": row.get("tipo_de_servicio") or "SIN TIPO",
                "tipo_normalizado": key,
                "cantidad": 0,
                "pertenece_universo_operativo_historico": key
                in UNIVERSO_OPERATIVO_HISTORICO,
            },
        )
        item["cantidad"] += 1

    tipos = sorted(groups.values(), key=lambda t: t["cantidad"], reverse=True)

    return {
        "cantidad_tipos": len(tipos),
        "total_servicios": len(filtered),
        "tipos": tipos,
    }


@app.get("/api/metricas-trackeo/tendencia")
def metricas_tendencia(params: dict = Depends(metric_query_params)):
    rows = get_base_rows(params["fecha_desde"], params["fecha_hasta"])
    filtered = apply_common_filters(
        rows,
        params["campanas"],
        params["prestador_ids"],
        params["estados"],
        params["tipos"],
    )

    by_day: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in filtered:
        fecha = row.get("fecha")
        if fecha:
            by_day[fecha].append(row)

    tendencia = [
        {"fecha": fecha, **compute_summary(by_day[fecha])} for fecha in sorted(by_day.keys())
    ]
    return {"tendencia": tendencia}


@app.get("/api/metricas-trackeo/calidad-datos")
def metricas_calidad(params: dict = Depends(metric_query_params)):
    rows = get_base_rows(params["fecha_desde"], params["fecha_hasta"])
    filtered = apply_common_filters(
        rows,
        params["campanas"],
        params["prestador_ids"],
        params["estados"],
        params["tipos"],
    )
    return {"calidad": compute_quality(filtered)}


@app.get("/api/metricas-trackeo/campana-prestador")
def metricas_campana_prestador(params: dict = Depends(metric_query_params)):
    rows = get_base_rows(params["fecha_desde"], params["fecha_hasta"])
    filtered = apply_common_filters(
        rows,
        params["campanas"],
        params["prestador_ids"],
        params["estados"],
        params["tipos"],
    )

    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    campana_labels: dict[str, str] = {}
    prestador_labels: dict[str, str] = {}

    for row in filtered:
        campana_key = row.get("campana_normalizada") or "SIN_CAMPANA"
        prestador_key = row.get("prestador_id") or "SIN_PRESTADOR"
        groups[(campana_key, prestador_key)].append(row)
        if row.get("campana"):
            campana_labels[campana_key] = row["campana"]
        if row.get("prestador"):
            prestador_labels[prestador_key] = row["prestador"]

    resultados = []
    for (campana_key, prestador_key), group_rows in groups.items():
        summary = compute_summary(group_rows)
        desvio = None
        if (
            summary["demora_real_promedio"] is not None
            and summary["demora_prometida_promedio"] is not None
        ):
            desvio = round(
                summary["demora_real_promedio"] - summary["demora_prometida_promedio"], 2
            )

        resultados.append(
            {
                "campana": campana_labels.get(campana_key, "SIN CAMPAÑA"),
                "campana_normalizada": campana_key,
                "prestador_id": prestador_key,
                "prestador": prestador_labels.get(prestador_key, "SIN PRESTADOR"),
                "total_general": len(group_rows),
                "enviador_si": summary["enviador_si"],
                "efectividad_enviador": summary["efectividad_enviador"],
                "servicios_cumplidos": summary["servicios_cumplidos"],
                "servicios_no_cumplidos": summary["servicios_no_cumplidos"],
                "cumplimiento_demora": summary["cumplimiento_demora"],
                "demora_real_promedio": summary["demora_real_promedio"],
                "desvio_promedio": desvio,
            }
        )

    resultados.sort(key=lambda r: r["total_general"], reverse=True)
    return {"cantidad": len(resultados), "resultados": resultados}


@app.get("/api/metricas-trackeo/servicios")
def metricas_servicios(
    params: dict = Depends(metric_query_params),
    metrica: Optional[str] = Query(default=None),
):
    rows = get_base_rows(params["fecha_desde"], params["fecha_hasta"])
    filtered = apply_common_filters(
        rows,
        params["campanas"],
        params["prestador_ids"],
        params["estados"],
        params["tipos"],
    )
    if metrica:
        filtered = [r for r in filtered if matches_metric(r, metrica)]

    servicios = [to_service(r) for r in filtered]
    return {"cantidad_servicios": len(servicios), "servicios": servicios}


@app.get("/api/metricas-trackeo/servicios-paginados")
def metricas_servicios_paginados(
    params: dict = Depends(metric_query_params),
    metrica: Optional[str] = Query(default=None),
    pagina: int = Query(default=1, ge=1),
    tamano_pagina: int = Query(default=100, ge=1, le=500),
):
    rows = get_base_rows(params["fecha_desde"], params["fecha_hasta"])
    filtered = apply_common_filters(
        rows,
        params["campanas"],
        params["prestador_ids"],
        params["estados"],
        params["tipos"],
    )
    if metrica:
        filtered = [r for r in filtered if matches_metric(r, metrica)]

    total = len(filtered)
    total_paginas = max(1, (total + tamano_pagina - 1) // tamano_pagina)
    pagina = min(pagina, total_paginas)

    start = (pagina - 1) * tamano_pagina
    end = start + tamano_pagina
    page_rows = filtered[start:end]

    return {
        "cantidad_total": total,
        "pagina": pagina,
        "tamano_pagina": tamano_pagina,
        "total_paginas": total_paginas,
        "servicios": [to_service(r) for r in page_rows],
    }


# ============================================================
# ENDPOINTS DE DIAGNOSTICO / AUDITORIA
# ============================================================


@app.get("/api/metricas-trackeo/diagnostico-universo")
def diagnostico_universo(params: dict = Depends(metric_query_params)):
    """Auditoria dedicada de la tarjeta 'Universo seleccionado' (y por lo
    tanto de todas las demas, que parten del mismo universo filtrado).

    Pensada para cuando el total de la plataforma no coincide con el de
    filtrar manualmente en Excel las mismas columnas (Fecha, Campana,
    Prestador, Estado, Tipo de servicio). Expone dos causas posibles
    que Excel no puede tener por definicion (un unico archivo no se
    duplica a si mismo, y su filtro automatico no colapsa variantes de
    texto):

    1) Servicios duplicados: el mismo IdServicioPrestado consolidado
       mas de una vez en la plataforma (tipicamente porque quedo
       incluido en mas de un reporte Excel subido, con rangos de fecha
       superpuestos).
    2) Variantes de texto: valores crudos de Estado/TipoDeServicio que
       la plataforma normaliza juntos (mayusculas, espacios) pero que
       en el filtro automatico de Excel pueden aparecer como opciones
       separadas.
    """

    rows = get_base_rows(params["fecha_desde"], params["fecha_hasta"])
    filtered = apply_common_filters(
        rows,
        params["campanas"],
        params["prestador_ids"],
        params["estados"],
        params["tipos"],
    )

    por_id: dict[Any, list[dict[str, Any]]] = defaultdict(list)
    sin_id = 0
    for row in filtered:
        sid = row.get("id_servicio_prestado")
        if sid is None:
            sin_id += 1
            continue
        por_id[sid].append(row)

    duplicados = {sid: grp for sid, grp in por_id.items() if len(grp) > 1}
    filas_extra = sum(len(grp) - 1 for grp in duplicados.values())

    detalle_duplicados = sorted(
        [
            {
                "id_servicio_prestado": sid,
                "cantidad_filas": len(grp),
                "report_ids": sorted({str(r.get("report_id")) for r in grp}),
                "fechas": sorted({str(r.get("fecha")) for r in grp}),
                "servicio_row_ids": [r.get("servicio_row_id") for r in grp],
            }
            for sid, grp in duplicados.items()
        ],
        key=lambda d: d["cantidad_filas"],
        reverse=True,
    )[:200]

    def raw_breakdown(field: str) -> list[dict[str, Any]]:
        counts: dict[str, int] = defaultdict(int)
        for row in filtered:
            valor = row.get(field)
            if valor is not None:
                counts[valor] += 1
        return [
            {
                "valor_crudo": valor,
                "valor_normalizado": normalize_text(valor),
                "cantidad": cantidad,
            }
            for valor, cantidad in sorted(
                counts.items(), key=lambda kv: kv[1], reverse=True
            )
        ]

    return {
        "universo_total": len(filtered),
        "filtros_aplicados": {
            "fecha_desde": params["fecha_desde"].isoformat(),
            "fecha_hasta": params["fecha_hasta"].isoformat(),
            "campana": params["campanas"],
            "prestador_id": params["prestador_ids"],
            "estado": params["estados"],
            "tipo": params["tipos"],
        },
        "servicios_sin_id_servicio_prestado": sin_id,
        "duplicados_por_id_servicio_prestado": {
            "cantidad_ids_con_mas_de_una_fila": len(duplicados),
            "filas_extra_por_duplicados": filas_extra,
            "nota": (
                "Si un mismo IdServicioPrestado aparece mas de una vez, es "
                "porque quedo consolidado desde mas de un reporte Excel "
                "subido a la plataforma (ver report_ids de cada grupo). Un "
                "unico archivo Excel no puede tener este tipo de duplicado."
            ),
            "detalle": detalle_duplicados,
        },
        "valores_estado_crudos": raw_breakdown("estado"),
        "valores_tipo_crudos": raw_breakdown("tipo_de_servicio"),
    }


@app.get("/api/metricas-trackeo/diagnostico-tipos")
def diagnostico_tipos(
    fecha_desde: date = Query(...),
    fecha_hasta: date = Query(...),
    prestador_id: Optional[list[UUID]] = Query(default=None),
    estado: Optional[list[str]] = Query(default=None),
):
    validate_date_range(fecha_desde, fecha_hasta)
    rows = get_base_rows(fecha_desde, fecha_hasta)
    filtered = apply_common_filters(
        rows,
        None,
        [str(p) for p in prestador_id] if prestador_id else None,
        clean_list(estado),
        None,
    )

    groups: dict[str, dict[str, Any]] = {}
    for row in filtered:
        tipo_norm = row.get("tipo_de_servicio_normalizado") or normalize_text(
            row.get("tipo_de_servicio")
        )
        key = tipo_norm or "SIN_TIPO"
        item = groups.setdefault(
            key,
            {
                "tipo_de_servicio": row.get("tipo_de_servicio") or "SIN TIPO",
                "tipo_normalizado": key,
                "en_universo_operativo_historico": key in UNIVERSO_OPERATIVO_HISTORICO,
                "cantidad": 0,
            },
        )
        item["cantidad"] += 1

    tipos = sorted(groups.values(), key=lambda t: t["cantidad"], reverse=True)
    total = len(filtered)
    incluidos = sum(t["cantidad"] for t in tipos if t["en_universo_operativo_historico"])
    excluidos = total - incluidos

    return {
        "total_registros": total,
        "incluidos_en_universo_operativo_historico": incluidos,
        "excluidos_del_universo_operativo_historico": excluidos,
        "nota": (
            "Desde v4.7.0 este universo historico YA NO se aplica "
            "automaticamente en ningun indicador. Se muestra solo como "
            "referencia informativa."
        ),
        "tipos": tipos,
    }


@app.get("/api/metricas-trackeo/diagnostico-caracteres")
def diagnostico_caracteres(texto: str = Query(..., min_length=1, max_length=200)):
    return {
        "texto_original": texto,
        "longitud": len(texto),
        "texto_normalizado": normalize_text(texto),
        "longitud_normalizada": len(normalize_text(texto) or ""),
        "caracteres": char_breakdown(texto),
    }


@app.get("/api/metricas-trackeo/diagnostico-programados")
def diagnostico_programados(
    fecha_desde: date = Query(...),
    fecha_hasta: date = Query(...),
    campana: Optional[list[str]] = Query(default=None),
    prestador_id: Optional[list[UUID]] = Query(default=None),
    estado: Optional[list[str]] = Query(default=None),
    tipo: Optional[list[str]] = Query(default=None),
):
    """Auditoria dedicada de la tarjeta 'Servicios programados'.

    Admite tambien el filtro 'tipo' (manual, igual que en el resto de
    la plataforma). Sin seleccionar tipo, el universo incluye TODOS
    los tipos, replicando un filtro de Excel sin restriccion de Tipo
    de servicio.
    """

    validate_date_range(fecha_desde, fecha_hasta)
    rows = get_base_rows(fecha_desde, fecha_hasta)

    campanas_clean = clean_list(campana)
    prestador_ids_clean = [str(p) for p in prestador_id] if prestador_id else None
    estados_clean = clean_list(estado)
    tipos_clean = clean_list(tipo)

    sin_filtro_estado = apply_common_filters(
        rows, campanas_clean, prestador_ids_clean, None, tipos_clean
    )
    variantes_estado: dict[str, int] = defaultdict(int)
    for row in sin_filtro_estado:
        crudo = row.get("estado")
        if crudo is not None:
            variantes_estado[crudo] += 1
    valores_estado_crudos = [
        {
            "valor_crudo": valor,
            "longitud": len(valor),
            "valor_normalizado": normalize_text(valor),
            "caracteres": char_breakdown(valor, max_chars=40),
            "cantidad": cantidad,
        }
        for valor, cantidad in sorted(
            variantes_estado.items(), key=lambda kv: kv[1], reverse=True
        )
    ]

    # Universo EXACTO usado por la tarjeta: fecha + campana + prestador
    # + estado + tipo (todos manuales, igual que en /resumen).
    universo_tarjeta = apply_common_filters(
        rows, campanas_clean, prestador_ids_clean, estados_clean, tipos_clean
    )

    es_programado_si = [r for r in universo_tarjeta if r.get("es_programado") is True]

    def en_universo_historico(row: dict[str, Any]) -> bool:
        tipo_norm = row.get("tipo_de_servicio_normalizado") or normalize_text(
            row.get("tipo_de_servicio")
        )
        return tipo_norm in UNIVERSO_OPERATIVO_HISTORICO

    es_programado_si_fuera_historico = [
        r for r in es_programado_si if not en_universo_historico(r)
    ]

    combinaciones: dict[str, int] = defaultdict(int)
    for row in es_programado_si:
        con_envio = row.get("con_envio_ok")
        asigno = row.get("asigno_movil")
        clave = f"con_envio_ok={con_envio} / asigno_movil={asigno}"
        combinaciones[clave] += 1

    servicios_programados_asignados = [
        r
        for r in es_programado_si
        if r.get("con_envio_ok") is True and r.get("asigno_movil") is True
    ]

    return {
        "filtros_aplicados": {
            "fecha_desde": fecha_desde.isoformat(),
            "fecha_hasta": fecha_hasta.isoformat(),
            "campana": campanas_clean,
            "prestador_id": prestador_ids_clean,
            "estado": estados_clean,
            "tipo": tipos_clean,
        },
        "advertencia_si_prestador_vacio": (
            "prestador_id no fue enviado o quedo vacio: los resultados "
            "incluyen TODOS los prestadores, no solo el que esperas."
            if not prestador_ids_clean
            else None
        ),
        "valores_estado_crudos_sin_filtrar_estado": valores_estado_crudos,
        "universo_total_tarjeta": len(universo_tarjeta),
        "servicios_programados_metric": len(es_programado_si),
        "servicios_programados_fuera_universo_historico": len(
            es_programado_si_fuera_historico
        ),
        "tipos_fuera_universo_operativo_historico": sorted(
            {
                r.get("tipo_de_servicio")
                for r in es_programado_si_fuera_historico
                if r.get("tipo_de_servicio")
            }
        ),
        "desglose_combinaciones_con_envio_asigno": dict(combinaciones),
        "servicios_programados_asignados_metric": len(servicios_programados_asignados),
        "ids_servicios_programados_metric": [
            r.get("id_servicio_prestado") for r in es_programado_si
        ],
        "ids_servicios_programados_asignados_metric": [
            r.get("id_servicio_prestado") for r in servicios_programados_asignados
        ],
    }


# ============================================================
# INGESTA DE ARCHIVOS
# ============================================================


def detect_report_type_by_filename(filename: str) -> Optional[str]:
    name = filename.lower()
    if "ficha" in name:
        return "ficha"
    if "trackeo" in name:
        return "trackeo"
    if "disponibilidad" in name:
        return "disponibilidad"
    return None


def find_duplicate(file_hash: str):
    rows = (
        sb.table("reportes")
        .select("id,file_name,created_at,tipo_reporte,status")
        .eq("file_hash", file_hash)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def upload_file_to_storage(local_path: str, storage_path: str, content_type: str):
    encoded_path = quote(storage_path, safe="/")
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{encoded_path}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "apikey": SUPABASE_KEY,
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    with open(local_path, "rb") as source, httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = client.post(url, headers=headers, content=source)
    if response.status_code not in (200, 201):
        raise RuntimeError(
            f"Storage upload fallo ({response.status_code}): {response.text[:500]}"
        )


@app.post("/ingestar", dependencies=[Depends(require_token)])
async def ingest(file: UploadFile = File(...), uploaded_by: Optional[str] = Form(None)):
    request_id = str(uuid.uuid4())
    filename = Path(file.filename or "").name

    if not filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="El archivo debe ser .xlsx o .xlsm")

    import tempfile

    sha256 = hashlib.sha256()
    total_bytes = 0
    suffix = Path(filename).suffix.lower()
    temp_path: Optional[str] = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_path = tmp.name
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413, detail=f"El archivo supera {MAX_UPLOAD_MB} MB"
                    )
                sha256.update(chunk)
                tmp.write(chunk)

        if total_bytes == 0:
            raise HTTPException(status_code=400, detail="El archivo esta vacio")

        file_hash = sha256.hexdigest()
        duplicate = find_duplicate(file_hash)
        if duplicate:
            return {
                "status": "duplicado",
                "existente": duplicate.get("file_name"),
                "report_id_existente": duplicate.get("id"),
                "mensaje": (
                    "El archivo ya habia sido cargado. No se insertaron nuevos registros."
                ),
                "request_id": request_id,
            }

        storage_path = f"raw/{file_hash}_{filename}"
        upload_file_to_storage(
            temp_path,
            storage_path,
            file.content_type
            or "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

        payload = {
            "tipo_reporte": detect_report_type_by_filename(filename) or "pendiente",
            "file_hash": file_hash,
            "file_name": filename,
            "storage_path": storage_path,
            "uploaded_by": valid_uuid_or_none(uploaded_by),
            "status": "pendiente",
            "etapa": "en_cola",
            "filas_procesadas": 0,
            "intentos": 0,
        }
        inserted = sb.table("reportes").insert(payload).execute().data or []
        if not inserted:
            raise RuntimeError("Supabase no devolvio el reporte creado")

        return JSONResponse(
            status_code=202,
            content={
                "status": "pendiente",
                "report_id": inserted[0]["id"],
                "mensaje": "Archivo recibido y agregado a la cola de procesamiento.",
                "request_id": request_id,
            },
        )
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)


@app.get("/ingestar/estado/{report_id}")
def ingest_status(report_id: UUID):
    rows = (
        sb.table("reportes")
        .select(
            "id,file_name,tipo_reporte,status,etapa,error_msg,"
            "filas_totales,filas_procesadas,periodo_desde,periodo_hasta,"
            "intentos,heartbeat_at,created_at,iniciado_at,finalizado_at"
        )
        .eq("id", str(report_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    return rows[0]
