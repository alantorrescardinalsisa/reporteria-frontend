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

export type TrackeoSummary = {
  fecha_desde: string;
  fecha_hasta: string;
  servicios_consultados: number;
  enviador_no: number;
  enviador_si: number;
  uso_enviador: number;
  asigna_movil: number;
  no_asigna_movil_cantidad: number;
  no_asigna_movil_porcentaje: number;
  efectividad_enviador: number;
  servicios_programados: number;
  programados_porcentaje: number;
  servicios_cumplidos: number;
  servicios_no_cumplidos: number;
  cumplimiento_demora: number;
  menos_60_cantidad: number;
  menos_60_porcentaje: number;
  entre_61_90_cantidad: number;
  entre_61_90_porcentaje: number;
  entre_91_120_cantidad: number;
  entre_91_120_porcentaje: number;
  entre_121_180_cantidad: number;
  entre_121_180_porcentaje: number;
  mas_181_cantidad: number;
  mas_181_porcentaje: number;
  na_cantidad: number;
  na_porcentaje: number;
};

export type TrackeoUniversos = {
  fecha_desde: string;
  fecha_hasta: string;
  servicios_cargados: number;
  servicios_vehiculares: number;
  servicios_evaluables: number;
  servicios_cancelados: number;
  servicios_no_finalizados: number;
  servicios_no_vehiculares: number;
  servicios_tipo_no_catalogado: number;
  servicios_estado_no_catalogado: number;
  universo_excel_historico: number;
};

export type PrestadorOption = {
  prestador_id: string;
  prestador: string;
  servicios?: number;
};

export type PrestadorMetric = PrestadorOption & {
  enviador_si?: number;
  uso_enviador?: number;
  asigna_movil?: number;
  efectividad_enviador?: number;
  cumplimiento_demora?: number;
};

export type CampanaMetric = {
  campana: string;
  servicios: number;
};

export type IngestResponse = {
  status: 'pendiente' | 'procesando' | 'duplicado';
  report_id?: string;
  report_id_existente?: string;
  existente?: string;
  mensaje: string;
  request_id?: string;
};

export type IngestStatus = {
  id: string;
  file_name: string | null;
  tipo_reporte: string | null;
  status: 'pendiente' | 'procesando' | 'procesado' | 'error' | 'reintentar' | 'cancelado';
  etapa: string | null;
  error_msg: string | null;
  filas_totales: number | null;
  filas_procesadas: number;
  periodo_desde: string | null;
  periodo_hasta: string | null;
  intentos: number;
  heartbeat_at: string | null;
  iniciado_at: string | null;
  finalizado_at: string | null;
};

function qs(params: Record<string, string | string[] | null | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else if (value !== null && value !== undefined && value !== '') search.set(key, value);
  });
  const value = search.toString();
  return value ? `?${value}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const message = body?.detail?.mensaje || body?.detail?.error || body?.detail || body?.mensaje || `HTTP ${response.status}`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  return body as T;
}

function filterQuery(filters: TrackeoFilters) {
  return qs({
    fecha_desde: filters.fecha_desde,
    fecha_hasta: filters.fecha_hasta,
    campana: filters.campanas,
    prestador_id: filters.prestador_ids,
  });
}

export const api = {
  health: () => request<{ ok: boolean; version: string }>('/health'),

  trackeoResumen: (filters: TrackeoFilters) =>
    request<{ resumen: TrackeoSummary }>(`/api/metricas-trackeo/resumen${filterQuery(filters)}`),

  trackeoUniversos: (filters: TrackeoFilters) =>
    request<{ universos: TrackeoUniversos }>(`/api/metricas-trackeo/universos${filterQuery(filters)}`),

  trackeoPrestadores: (filters: TrackeoFilters) =>
    request<{ cantidad_prestadores: number; prestadores: PrestadorMetric[] }>(
      `/api/metricas-trackeo/prestadores${filterQuery(filters)}`,
    ),

  trackeoCampanas: (fecha_desde: string, fecha_hasta: string, prestador_ids: string[] = []) =>
    request<{ cantidad_campanas: number; total_servicios: number; campanas: CampanaMetric[] }>(
      `/api/metricas-trackeo/campanas${qs({ fecha_desde, fecha_hasta, prestador_id: prestador_ids })}`,
    ),

  trackeoListaPrestadores: (fecha_desde: string, fecha_hasta: string, campanas: string[] = []) =>
    request<{ cantidad_prestadores: number; prestadores: PrestadorOption[] }>(
      `/api/metricas-trackeo/lista-prestadores${qs({ fecha_desde, fecha_hasta, campana: campanas })}`,
    ),

  ingest: async (file: File, uploadedBy = 'dashboard') => {
    const form = new FormData();
    form.append('file', file);
    form.append('uploaded_by', uploadedBy);
    return request<IngestResponse>('/ingestar', { method: 'POST', body: form });
  },

  ingestStatus: (reportId: string) => request<IngestStatus>(`/ingestar/estado/${reportId}`),
};

export { API_URL };
