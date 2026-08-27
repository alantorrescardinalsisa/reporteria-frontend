export const API_URL = (
  import.meta.env.VITE_API_URL || 'https://reporteria-api.onrender.com'
).replace(/\/$/, '');

export type TrackeoFilters = {
  fecha_desde: string;
  fecha_hasta: string;
  campanas: string[];
  prestador_ids: string[];
  estados: string[];
};

export type EstadoOption = {
  estado: string;
  estado_normalizado: string;
  cantidad: number;
};

export type CampanaMetric = {
  campana: string;
  campana_normalizada?: string;
  servicios: number;
};

export type PrestadorOption = {
  prestador_id: string;
  prestador: string;
  servicios: number;
};

export type TrackeoSummary = {
  servicios_consultados: number;
  enviador_no: number;
  enviador_si: number;
  uso_enviador: number;
  asigna_movil: number;
  efectividad_enviador: number;
  no_asigna_movil_cantidad: number;
  no_asigna_movil_porcentaje: number;
  servicios_programados: number;
  programados_porcentaje: number;
  servicios_evaluados_demora?: number;
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

export type PrestadorMetric = TrackeoSummary & {
  prestador_id: string;
  prestador: string;
  total_general: number;
};

export type TrendPoint = TrackeoSummary & {
  fecha: string;
  demora_real_promedio?: number | null;
  demora_prometida_promedio?: number | null;
  desvio_promedio?: number | null;
};

export type DataQuality = {
  total: number;
  tipo_servicio_completo: number;
  estado_completo: number;
  campana_completa: number;
  prestador_completo: number;
  despachador_completo: number;
  coordenadas_disponibles: number;
  movil_registrado: number;
  demora_prometida_completa: number;
  demora_real_completa: number;
};

export type CampanaPrestadorMetric = {
  campana: string;
  campana_normalizada: string;
  prestador_id: string;
  prestador: string;
  total_general: number;
  enviador_si: number;
  efectividad_enviador: number;
  servicios_cumplidos: number;
  servicios_no_cumplidos: number;
  cumplimiento_demora: number;
  demora_real_promedio?: number | null;
  desvio_promedio?: number | null;
};

export type TrackeoService = {
  servicio_row_id: string;
  report_id?: string | null;
  prestador_id?: string | null;
  prestador?: string | null;
  fecha?: string | null;
  alta_del_servicio?: string | null;
  id_servicio_prestado?: number | null;
  id_orden_de_servicio?: number | null;
  tipo_de_servicio?: string | null;
  estado?: string | null;
  campana?: string | null;
  con_envio_ok?: boolean | null;
  asigno_movil?: boolean | null;
  es_programado?: boolean | null;
  demora_prometida?: number | null;
  demora_real?: number | null;
  cumple_demora_prometida_15?: boolean | null;
  rango_demora_real?: string | null;
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

export type PaginatedServices = {
  cantidad_total: number;
  pagina: number;
  tamano_pagina: number;
  total_paginas: number;
  servicios: TrackeoService[];
};

export type IngestStatus = {
  id: string;
  file_name?: string;
  status: string;
  etapa?: string;
  error_msg?: string;
  filas_totales?: number;
  filas_procesadas?: number;
  periodo_desde?: string;
  periodo_hasta?: string;
};

type IngestResponse = {
  status: string;
  report_id?: string;
  report_id_existente?: string;
  mensaje?: string;
};

function qs(
  values: Record<string, string | number | string[] | null | undefined>,
): string {
  const params = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== '') params.append(key, item);
      });
      return;
    }

    if (value !== null && value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  });

  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

function filterParams(filters: TrackeoFilters) {
  return {
    fecha_desde: filters.fecha_desde,
    fecha_hasta: filters.fecha_hasta,
    campana: filters.campanas,
    prestador_id: filters.prestador_ids,
    estado: filters.estados,
  };
}

function getErrorDetail(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null && 'detail' in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    return typeof detail === 'string' ? detail : JSON.stringify(detail);
  }
  return null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    ...init,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail = getErrorDetail(payload);
    throw new Error(
      detail || String(payload || `La API respondio HTTP ${response.status}`),
    );
  }

  return payload as T;
}

export const api = {
  url: API_URL,

  health: () => request<{ ok: boolean; version: string }>('/health'),

  trackeoResumen: (filters: TrackeoFilters) =>
    request<{ resumen: TrackeoSummary }>(
      `/api/metricas-trackeo/resumen${qs(filterParams(filters))}`,
    ),

  trackeoUniversos: (filters: TrackeoFilters) =>
    request<{ universos: TrackeoUniversos }>(
      `/api/metricas-trackeo/universos${qs(filterParams(filters))}`,
    ),

  trackeoPrestadores: (filters: TrackeoFilters) =>
    request<{ cantidad_prestadores: number; prestadores: PrestadorMetric[] }>(
      `/api/metricas-trackeo/prestadores${qs(filterParams(filters))}`,
    ),

  trackeoCampanas: (filters: TrackeoFilters) =>
    request<{ cantidad_campanas: number; campanas: CampanaMetric[] }>(
      `/api/metricas-trackeo/campanas${qs({
        fecha_desde: filters.fecha_desde,
        fecha_hasta: filters.fecha_hasta,
        prestador_id: filters.prestador_ids,
        estado: filters.estados,
      })}`,
    ),

  trackeoListaPrestadores: (filters: TrackeoFilters) =>
    request<{ cantidad_prestadores: number; prestadores: PrestadorOption[] }>(
      `/api/metricas-trackeo/lista-prestadores${qs({
        fecha_desde: filters.fecha_desde,
        fecha_hasta: filters.fecha_hasta,
        campana: filters.campanas,
        estado: filters.estados,
      })}`,
    ),

  trackeoEstados: (filters: TrackeoFilters) =>
    request<{
      cantidad_estados: number;
      total_servicios: number;
      estados: EstadoOption[];
    }>(
      `/api/metricas-trackeo/estados${qs({
        fecha_desde: filters.fecha_desde,
        fecha_hasta: filters.fecha_hasta,
        campana: filters.campanas,
        prestador_id: filters.prestador_ids,
      })}`,
    ),

  trackeoTendencia: (filters: TrackeoFilters) =>
    request<{ tendencia: TrendPoint[] }>(
      `/api/metricas-trackeo/tendencia${qs(filterParams(filters))}`,
    ),

  trackeoCalidadDatos: (filters: TrackeoFilters) =>
    request<{ calidad: DataQuality }>(
      `/api/metricas-trackeo/calidad-datos${qs(filterParams(filters))}`,
    ),

  trackeoCampanaPrestador: (filters: TrackeoFilters) =>
    request<{ cantidad: number; resultados: CampanaPrestadorMetric[] }>(
      `/api/metricas-trackeo/campana-prestador${qs(filterParams(filters))}`,
    ),

  trackeoServiciosPaginados: (
    filters: TrackeoFilters,
    metrica: MetricaTrackeo,
    pagina = 1,
    tamanoPagina = 100,
  ) =>
    request<PaginatedServices>(
      `/api/metricas-trackeo/servicios-paginados${qs({
        ...filterParams(filters),
        metrica,
        pagina,
        tamano_pagina: tamanoPagina,
      })}`,
    ),

  ingest: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('uploaded_by', 'dashboard');
    return request<IngestResponse>('/ingestar', {
      method: 'POST',
      body: form,
    });
  },

  ingestStatus: (id: string) =>
    request<IngestStatus>(`/ingestar/estado/${encodeURIComponent(id)}`),
};
