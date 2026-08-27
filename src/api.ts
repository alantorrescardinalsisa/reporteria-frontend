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
  servicios_evaluados_demora: number;
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

type HealthResponse = {
  ok: boolean;
  version: string;
};

type EstadosResponse = {
  estados: EstadoOption[];
  total_servicios: number;
};

type ResumenResponse = {
  resumen: TrackeoSummary;
};

function queryString(
  values: Record<
    string,
    string | number | string[] | null | undefined
  >,
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

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail =
      typeof payload === 'object' && payload !== null
        ? payload.detail
        : payload;
    throw new Error(
      typeof detail === 'string'
        ? detail
        : `La API respondió HTTP ${response.status}`,
    );
  }

  return payload as T;
}

export const api = {
  url: API_URL,

  health: () => request<HealthResponse>('/health'),

  trackeoEstados: (filters: TrackeoFilters) =>
    request<EstadosResponse>(
      `/api/metricas-trackeo/estados${queryString({
        fecha_desde: filters.fecha_desde,
        fecha_hasta: filters.fecha_hasta,
        campana: filters.campanas,
        prestador_id: filters.prestador_ids,
      })}`,
    ),

  trackeoResumen: (filters: TrackeoFilters) =>
    request<ResumenResponse>(
      `/api/metricas-trackeo/resumen${queryString(
        filterParams(filters),
      )}`,
    ),

  trackeoServiciosPaginados: (
    filters: TrackeoFilters,
    metrica: MetricaTrackeo,
    pagina = 1,
    tamanoPagina = 100,
  ) =>
    request<PaginatedServices>(
      `/api/metricas-trackeo/servicios-paginados${queryString({
        ...filterParams(filters),
        metrica,
        pagina,
        tamano_pagina: tamanoPagina,
      })}`,
    ),
};
