const API_URL = (
  import.meta.env.VITE_API_URL ||
  'https://reporteria-api.onrender.com'
).replace(/\/$/, '');

export type TrackeoFilters = {
  fecha_desde: string;
  fecha_hasta: string;
  campanas: string[];
  prestador_ids: string[];
};

export type MetricaTrackeo =
  | 'ENVIADOR_SI'
  | 'ENVIADOR_NO'
  | 'ASIGNA_MOVIL'
  | 'NO_ASIGNA_MOVIL'
  | 'PROGRAMADOS'
  | 'CUMPLE_DEMORA'
  | 'NO_CUMPLE_DEMORA'
  | 'MENOS_60'
  | 'ENTRE_61_90'
  | 'ENTRE_91_120'
  | 'ENTRE_121_180'
  | 'MAS_181'
  | 'NA';

export type TrackeoSummary = {
  fecha_desde: string; fecha_hasta: string; servicios_consultados: number;
  enviador_no: number; enviador_si: number; uso_enviador: number;
  asigna_movil: number; no_asigna_movil_cantidad: number;
  no_asigna_movil_porcentaje: number; efectividad_enviador: number;
  servicios_programados: number; programados_porcentaje: number;
  servicios_cumplidos: number; servicios_no_cumplidos: number;
  cumplimiento_demora: number; menos_60_cantidad: number;
  menos_60_porcentaje: number; entre_61_90_cantidad: number;
  entre_61_90_porcentaje: number; entre_91_120_cantidad: number;
  entre_91_120_porcentaje: number; entre_121_180_cantidad: number;
  entre_121_180_porcentaje: number; mas_181_cantidad: number;
  mas_181_porcentaje: number; na_cantidad: number; na_porcentaje: number;
};

export type TrackeoUniversos = {
  fecha_desde: string; fecha_hasta: string; servicios_cargados: number;
  servicios_vehiculares: number; servicios_evaluables: number;
  servicios_cancelados: number; servicios_no_finalizados: number;
  servicios_no_vehiculares: number; servicios_tipo_no_catalogado: number;
  servicios_estado_no_catalogado: number; universo_excel_historico: number;
};

export type PrestadorOption = { prestador_id: string; prestador: string; servicios?: number };

export type PrestadorMetric = PrestadorOption & {
  total_general?: number; enviador_no?: number; enviador_si?: number;
  uso_enviador?: number; asigna_movil?: number;
  no_asigna_movil_cantidad?: number; no_asigna_movil_porcentaje?: number;
  efectividad_enviador?: number; servicios_programados?: number;
  programados_porcentaje?: number; cumplimiento_demora_cantidad?: number;
  no_cumplimiento_demora_cantidad?: number; cumplimiento_demora_porcentaje?: number;
  servicios_cumplidos?: number; servicios_no_cumplidos?: number;
  cumplimiento_demora?: number; menos_60_cantidad?: number;
  menos_60_porcentaje?: number; entre_61_90_cantidad?: number;
  entre_61_90_porcentaje?: number; entre_91_120_cantidad?: number;
  entre_91_120_porcentaje?: number; entre_121_180_cantidad?: number;
  entre_121_180_porcentaje?: number; mas_181_cantidad?: number;
  mas_181_porcentaje?: number; na_cantidad?: number; na_porcentaje?: number;
};

export type CampanaMetric = { campana: string; campana_normalizada?: string; servicios: number };

export type TrackeoService = {
  servicio_row_id: string; report_id: string; prestador_id: string | null;
  prestador: string | null; fecha: string; alta_del_servicio: string | null;
  id_servicio_prestado: number | null; id_orden_de_servicio: number | null;
  tipo_de_servicio: string | null; estado: string | null; campana: string | null;
  con_envio_ok: boolean | null; asigno_movil: boolean | null;
  es_programado: boolean | null; demora_prometida: number | null;
  demora_real: number | null; cumple_demora_prometida_15: boolean | null;
  rango_demora_real: string | null;
};

export type TrendPoint = {
  fecha: string; servicios_consultados: number; enviador_no: number;
  enviador_si: number; uso_enviador: number; asigna_movil: number;
  efectividad_enviador: number; servicios_cumplidos: number;
  servicios_no_cumplidos: number; cumplimiento_demora: number;
  demora_prometida_promedio: number | null; demora_real_promedio: number | null;
  desvio_promedio: number | null;
};

export type DataQuality = {
  total: number; tipo_servicio_completo: number; estado_completo: number;
  campana_completa: number; prestador_completo: number;
  despachador_completo: number; coordenadas_disponibles: number;
  movil_registrado: number; demora_prometida_completa: number;
  demora_real_completa: number;
};

export type CampanaPrestadorMetric = {
  campana: string; campana_normalizada: string; prestador_id: string;
  prestador: string; total_general: number; enviador_si: number;
  efectividad_enviador: number; servicios_cumplidos: number;
  servicios_no_cumplidos: number; cumplimiento_demora: number;
  demora_real_promedio: number | null; desvio_promedio: number | null;
};

export type IngestResponse = {
  status: 'pendiente' | 'procesando' | 'duplicado'; report_id?: string;
  report_id_existente?: string; existente?: string; mensaje?: string; request_id?: string;
};

export type IngestStatus = {
  id: string; file_name: string | null; tipo_reporte: string | null;
  status: 'pendiente' | 'procesando' | 'procesado' | 'error' | 'reintentar' | 'cancelado';
  etapa: string | null; error_msg: string | null; filas_totales: number | null;
  filas_procesadas: number; periodo_desde: string | null; periodo_hasta: string | null;
  intentos: number; heartbeat_at: string | null; iniciado_at: string | null;
  finalizado_at: string | null;
};

type QueryValue = string | number | undefined | null | string[];
function qs(params: Record<string, QueryValue>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => item !== '' && query.append(key, item));
    else if (value !== '' && value !== undefined && value !== null) query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

const RETRYABLE = new Set([502, 503, 504]);
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function request<T>(path: string, init?: RequestInit, maxAttempts = 4): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${API_URL}${path}`, { cache: 'no-store', ...init });
      const text = await response.text();
      let body: unknown;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }
      if (response.ok) return body as T;
      const payload = body as { mensaje?: string; detail?: string | { mensaje?: string; error?: string; funcion?: string } };
      const detail = payload?.detail;
      const message = typeof detail === 'string'
        ? detail
        : detail?.mensaje || detail?.error || payload?.mensaje || `Error HTTP ${response.status}`;
      lastError = new Error(typeof detail === 'object' && detail.funcion ? `${message} (${detail.funcion})` : message);
      if (!RETRYABLE.has(response.status) || attempt >= maxAttempts) throw lastError;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= maxAttempts) throw lastError;
    }
    await wait(600 * 2 ** (attempt - 1));
  }
  throw lastError || new Error('No se pudo completar la consulta.');
}

function filterParams(filters: TrackeoFilters) {
  return {
    fecha_desde: filters.fecha_desde,
    fecha_hasta: filters.fecha_hasta,
    campana: filters.campanas,
    prestador_id: filters.prestador_ids,
  };
}
function filterQuery(filters: TrackeoFilters) { return qs(filterParams(filters)); }
function normalizarPrestador(p: PrestadorMetric): PrestadorMetric {
  return {
    ...p,
    servicios: p.servicios ?? p.total_general ?? 0,
    servicios_cumplidos: p.servicios_cumplidos ?? p.cumplimiento_demora_cantidad,
    servicios_no_cumplidos: p.servicios_no_cumplidos ?? p.no_cumplimiento_demora_cantidad,
    cumplimiento_demora: p.cumplimiento_demora ?? p.cumplimiento_demora_porcentaje,
  };
}

export const api = {
  url: API_URL,
  health: () => request<{ ok: boolean; version: string }>('/health'),
  trackeoResumen: (filters: TrackeoFilters) =>
    request<{ resumen: TrackeoSummary }>(`/api/metricas-trackeo/resumen${filterQuery(filters)}`),
  trackeoUniversos: (filters: TrackeoFilters) =>
    request<{ universos: TrackeoUniversos }>(`/api/metricas-trackeo/universos${filterQuery(filters)}`),
  trackeoPrestadores: async (filters: TrackeoFilters) => {
    const result = await request<{ cantidad_prestadores: number; prestadores: PrestadorMetric[] }>(
      `/api/metricas-trackeo/prestadores${filterQuery(filters)}`,
    );
    return { ...result, prestadores: (result.prestadores || []).map(normalizarPrestador) };
  },
  trackeoCampanas: (desde: string, hasta: string, ids: string[] = []) =>
    request<{ cantidad_campanas: number; total_servicios: number; campanas: CampanaMetric[] }>(
      `/api/metricas-trackeo/campanas${qs({ fecha_desde: desde, fecha_hasta: hasta, prestador_id: ids })}`,
    ),
  trackeoListaPrestadores: (desde: string, hasta: string, campanas: string[] = []) =>
    request<{ cantidad_prestadores: number; prestadores: PrestadorOption[] }>(
      `/api/metricas-trackeo/lista-prestadores${qs({ fecha_desde: desde, fecha_hasta: hasta, campana: campanas })}`,
    ),
  trackeoServicios: (filters: TrackeoFilters, metrica?: MetricaTrackeo) =>
    request<{ cantidad_servicios: number; servicios: TrackeoService[] }>(
      `/api/metricas-trackeo/servicios${qs({ ...filterParams(filters), metrica })}`,
    ),
  trackeoTendencia: (filters: TrackeoFilters) =>
    request<{ tendencia: TrendPoint[] }>(`/api/metricas-trackeo/tendencia${filterQuery(filters)}`),
  trackeoCalidadDatos: (filters: TrackeoFilters) =>
    request<{ calidad: DataQuality }>(`/api/metricas-trackeo/calidad-datos${filterQuery(filters)}`),
  trackeoCampanaPrestador: (filters: TrackeoFilters) =>
    request<{ cantidad: number; resultados: CampanaPrestadorMetric[] }>(
      `/api/metricas-trackeo/campana-prestador${filterQuery(filters)}`,
    ),
  ingest: async (file: File, uploadedBy = 'dashboard') => {
    const body = new FormData();
    body.append('file', file, file.name);
    body.append('uploaded_by', uploadedBy);
    return request<IngestResponse>('/ingestar', { method: 'POST', body });
  },
  ingestStatus: (reportId: string) => request<IngestStatus>(`/ingestar/estado/${reportId}`),
};

export { API_URL };
