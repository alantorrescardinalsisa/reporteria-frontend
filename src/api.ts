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

/**
 * Contrato compatible con los nombres reales devueltos por
 * public.fn_metricas_trackeo_prestadores y con los nombres normalizados
 * consumidos por App.tsx.
 */
export type PrestadorMetric = PrestadorOption & {
  total_general?: number;

  enviador_no?: number;
  enviador_si?: number;
  uso_enviador?: number;

  asigna_movil?: number;
  no_asigna_movil_cantidad?: number;
  no_asigna_movil_porcentaje?: number;
  efectividad_enviador?: number;

  servicios_programados?: number;
  programados_porcentaje?: number;

  /* Nombres originales de Supabase */
  cumplimiento_demora_cantidad?: number;
  no_cumplimiento_demora_cantidad?: number;
  cumplimiento_demora_porcentaje?: number;

  /* Nombres normalizados utilizados por App.tsx */
  servicios_cumplidos?: number;
  servicios_no_cumplidos?: number;
  cumplimiento_demora?: number;

  menos_60_cantidad?: number;
  menos_60_porcentaje?: number;

  entre_61_90_cantidad?: number;
  entre_61_90_porcentaje?: number;

  entre_91_120_cantidad?: number;
  entre_91_120_porcentaje?: number;

  entre_121_180_cantidad?: number;
  entre_121_180_porcentaje?: number;

  mas_181_cantidad?: number;
  mas_181_porcentaje?: number;

  na_cantidad?: number;
  na_porcentaje?: number;
};

export type CampanaMetric = {
  campana: string;
  campana_normalizada?: string;
  servicios: number;
};

export type IngestResponse = {
  status: 'pendiente' | 'procesando' | 'duplicado';
  report_id?: string;
  report_id_existente?: string;
  existente?: string;
  mensaje?: string;
  request_id?: string;
};

export type IngestStatus = {
  id: string;
  file_name: string | null;
  tipo_reporte: string | null;
  status:
    | 'pendiente'
    | 'procesando'
    | 'procesado'
    | 'error'
    | 'reintentar'
    | 'cancelado';
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

type QueryValue = string | number | undefined | null | string[];

function qs(params: Record<string, QueryValue>): string {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== '') query.append(key, item);
      });
      return;
    }

    if (value !== '' && value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  });

  const serialised = query.toString();
  return serialised ? `?${serialised}` : '';
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

async function request<T>(
  path: string,
  init?: RequestInit,
  maxAttempts = 4,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${API_URL}${path}`, {
        cache: 'no-store',
        ...init,
      });

      const text = await response.text();
      let body: unknown;

      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }

      if (response.ok) return body as T;

      const payload = body as {
        mensaje?: string;
        detail?:
          | string
          | {
              mensaje?: string;
              error?: string;
              funcion?: string;
              request_id?: string;
            };
      };

      const message =
        typeof payload?.detail === 'string'
          ? payload.detail
          : payload?.detail?.mensaje ||
            payload?.detail?.error ||
            payload?.mensaje ||
            `Error HTTP ${response.status}`;

      const functionName =
        typeof payload?.detail === 'object'
          ? payload.detail?.funcion
          : undefined;

      lastError = new Error(
        functionName ? `${message} (${functionName})` : message,
      );

      if (!RETRYABLE_STATUS.has(response.status) || attempt >= maxAttempts) {
        throw lastError;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= maxAttempts) throw lastError;
    }

    await wait(600 * 2 ** (attempt - 1));
  }

  throw lastError || new Error('No se pudo completar la consulta.');
}

function filterQuery(filters: TrackeoFilters): string {
  return qs({
    fecha_desde: filters.fecha_desde,
    fecha_hasta: filters.fecha_hasta,
    campana: filters.campanas,
    prestador_id: filters.prestador_ids,
  });
}

function normalizarPrestador(prestador: PrestadorMetric): PrestadorMetric {
  return {
    ...prestador,

    servicios:
      prestador.servicios ??
      prestador.total_general ??
      0,

    servicios_cumplidos:
      prestador.servicios_cumplidos ??
      prestador.cumplimiento_demora_cantidad,

    servicios_no_cumplidos:
      prestador.servicios_no_cumplidos ??
      prestador.no_cumplimiento_demora_cantidad,

    cumplimiento_demora:
      prestador.cumplimiento_demora ??
      prestador.cumplimiento_demora_porcentaje,
  };
}

export const api = {
  url: API_URL,

  health: () =>
    request<{
      ok: boolean;
      version: string;
    }>('/health'),

  trackeoResumen: (filters: TrackeoFilters) =>
    request<{
      resumen: TrackeoSummary;
    }>(`/api/metricas-trackeo/resumen${filterQuery(filters)}`),

  trackeoUniversos: (filters: TrackeoFilters) =>
    request<{
      universos: TrackeoUniversos;
    }>(`/api/metricas-trackeo/universos${filterQuery(filters)}`),

  trackeoPrestadores: async (filters: TrackeoFilters) => {
    const response = await request<{
      cantidad_prestadores: number;
      prestadores: PrestadorMetric[];
    }>(`/api/metricas-trackeo/prestadores${filterQuery(filters)}`);

    return {
      ...response,
      prestadores: (response.prestadores || []).map(normalizarPrestador),
    };
  },

  trackeoCampanas: (
    fechaDesde: string,
    fechaHasta: string,
    prestadorIds: string[] = [],
  ) =>
    request<{
      cantidad_campanas: number;
      total_servicios: number;
      campanas: CampanaMetric[];
    }>(
      `/api/metricas-trackeo/campanas${qs({
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        prestador_id: prestadorIds,
      })}`,
    ),

  trackeoListaPrestadores: (
    fechaDesde: string,
    fechaHasta: string,
    campanas: string[] = [],
  ) =>
    request<{
      cantidad_prestadores: number;
      prestadores: PrestadorOption[];
    }>(
      `/api/metricas-trackeo/lista-prestadores${qs({
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        campana: campanas,
      })}`,
    ),

  ingest: async (file: File, uploadedBy = 'dashboard') => {
    const body = new FormData();
    body.append('file', file, file.name);
    body.append('uploaded_by', uploadedBy);

    return request<IngestResponse>('/ingestar', {
      method: 'POST',
      body,
    });
  },

  ingestStatus: (reportId: string) =>
    request<IngestStatus>(`/ingestar/estado/${reportId}`),
};

export { API_URL };
