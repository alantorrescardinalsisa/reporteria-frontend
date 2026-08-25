const API_URL = (
  import.meta.env.VITE_API_URL || 'https://reporteria-api.onrender.com'
).replace(/\/$/, '');

export type IngestStartResult = {
  status: 'procesando' | 'duplicado';
  report_id?: string;
  report_id_existente?: string;
  tipo?: string;
  filas_recibidas?: number;
  periodo_desde?: string | null;
  periodo_hasta?: string | null;
  mensaje?: string;
  existente?: string;
  cargado?: string;
  request_id?: string;
};

export type IngestStatus = {
  report_id: string;
  file_name: string | null;
  tipo: string | null;
  status: 'procesando' | 'procesado' | 'error' | 'pendiente' | null;
  detalle: string | null;
  filas_totales: number | null;
  filas_procesadas: number | null;
  periodo_desde: string | null;
  periodo_hasta: string | null;
};

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

export type TrackeoResumen = {
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

export type TrackeoPrestador = {
  prestador_id: string;
  prestador: string;
  enviador_no: number;
  enviador_si: number;
  total_general: number;
  uso_enviador: number;
  asigna_movil: number;
  no_asigna_movil_cantidad: number;
  no_asigna_movil_porcentaje: number;
  servicios_programados: number;
  programados_porcentaje: number;
  efectividad_enviador: number;
  cumplimiento_demora_cantidad: number;
  no_cumplimiento_demora_cantidad: number;
  cumplimiento_demora_porcentaje: number;
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

export type TrackeoCampana = {
  campana: string;
  campana_normalizada: string;
  servicios: number;
};
export type TrackeoListaPrestador = {
  prestador_id: string;
  prestador: string;
  servicios: number;
};

export type TrackeoServicio = {
  servicio_row_id: string;
  report_id: string;
  prestador_id: string;
  prestador: string;
  fecha: string;
  alta_del_servicio: string;
  id_servicio_prestado: number;
  id_orden_de_servicio: number;
  tipo_de_servicio: string;
  estado: string;
  campana: string;
  con_envio_ok: boolean;
  asigno_movil: boolean | null;
  es_programado: boolean | null;
  demora_prometida: number | null;
  demora_real: number | null;
  cumple_demora_prometida_15: boolean;
  rango_demora_real: string;
};

export type TrackeoResumenResponse = { resumen: TrackeoResumen };
export type TrackeoPrestadoresResponse = {
  cantidad_prestadores: number;
  prestadores: TrackeoPrestador[];
};
export type TrackeoCampanasResponse = {
  cantidad_campanas: number;
  total_servicios: number;
  campanas: TrackeoCampana[];
};
export type TrackeoListaPrestadoresResponse = {
  cantidad_prestadores: number;
  prestadores: TrackeoListaPrestador[];
};
export type TrackeoServiciosResponse = {
  cantidad_servicios: number;
  servicios: TrackeoServicio[];
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail: unknown = null
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type QueryValue = string | number | undefined | null | string[];

function qs(params: Record<string, QueryValue>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== '' && item !== undefined && item !== null) {
          query.append(key, String(item));
        }
      });
    } else if (value !== '' && value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

async function get<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  } catch (error) {
    throw new ApiError(
      0,
      error instanceof Error ? error.message : String(error)
    );
  }
  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!response.ok) {
    const payload = data as {
      detail?: string | { mensaje?: string; error?: string };
    };
    const message =
      typeof payload?.detail === 'string'
        ? payload.detail
        : payload?.detail?.mensaje ||
          payload?.detail?.error ||
          `Error HTTP ${response.status}`;
    throw new ApiError(response.status, message, data);
  }
  return data as T;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const api = {
  url: API_URL,
  health: () => get<{ ok: boolean; version: string }>('/health'),

  trackeoResumen: (filters: TrackeoFilters) =>
    get<TrackeoResumenResponse>(
      `/api/metricas-trackeo/resumen${qs({
        fecha_desde: filters.fecha_desde,
        fecha_hasta: filters.fecha_hasta,
        campana: filters.campanas,
        prestador_id: filters.prestador_ids,
      })}`
    ),

  trackeoPrestadores: (filters: TrackeoFilters) =>
    get<TrackeoPrestadoresResponse>(
      `/api/metricas-trackeo/prestadores${qs({
        fecha_desde: filters.fecha_desde,
        fecha_hasta: filters.fecha_hasta,
        campana: filters.campanas,
        prestador_id: filters.prestador_ids,
      })}`
    ),

  trackeoCampanas: (
    fechaDesde: string,
    fechaHasta: string,
    prestadorIds: string[] = []
  ) =>
    get<TrackeoCampanasResponse>(
      `/api/metricas-trackeo/campanas${qs({
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        prestador_id: prestadorIds,
      })}`
    ),

  trackeoListaPrestadores: (
    fechaDesde: string,
    fechaHasta: string,
    campanas: string[] = []
  ) =>
    get<TrackeoListaPrestadoresResponse>(
      `/api/metricas-trackeo/lista-prestadores${qs({
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        campana: campanas,
      })}`
    ),

  trackeoServicios: (
    filters: TrackeoFilters,
    metrica: MetricaTrackeo | null,
    prestadorIds: string[] | null = null
  ) =>
    get<TrackeoServiciosResponse>(
      `/api/metricas-trackeo/servicios${qs({
        fecha_desde: filters.fecha_desde,
        fecha_hasta: filters.fecha_hasta,
        campana: filters.campanas,
        prestador_id: prestadorIds ?? filters.prestador_ids,
        metrica,
      })}`
    ),

  // Despierta el backend (Render free puede estar dormido).
  wake: async (): Promise<boolean> => {
    try {
      const response = await fetchWithTimeout(
        `${API_URL}/health`,
        { cache: 'no-store' },
        90000
      );
      return response.ok;
    } catch {
      return false;
    }
  },

  // 1) Inicia la ingesta. Responde rapido con report_id (o duplicado).
  ingestarIniciar: async (
    file: File,
    timeoutMs = 120000
  ): Promise<IngestStartResult> => {
    const body = new FormData();
    body.append('file', file);
    body.append('uploaded_by', 'dashboard');

    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${API_URL}/ingestar`,
        { method: 'POST', body },
        timeoutMs
      );
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'AbortError'
          ? 'La subida del archivo tardó demasiado. Reintentá.'
          : error instanceof Error
          ? error.message
          : String(error);
      throw new ApiError(0, message);
    }

    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      const payload = data as {
        detail?: string | { mensaje?: string; error?: string };
      };
      const message =
        typeof payload?.detail === 'string'
          ? payload.detail
          : payload?.detail?.mensaje ||
            payload?.detail?.error ||
            `Error HTTP ${response.status}`;
      throw new ApiError(response.status, message, data);
    }

    return data as IngestStartResult;
  },

  // 2) Consulta el estado de un reporte en proceso.
  ingestarEstado: (reportId: string) =>
    get<IngestStatus>(`/ingestar/estado/${reportId}`),

  // 3) Polling hasta que termine (procesado | error) o se agote el tiempo.
  ingestarEsperar: async (
    reportId: string,
    onTick?: (status: IngestStatus) => void,
    intervalMs = 3000,
    maxWaitMs = 900000
  ): Promise<IngestStatus> => {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      let status: IngestStatus;
      try {
        status = await api.ingestarEstado(reportId);
      } catch {
        await sleep(intervalMs);
        continue;
      }
      if (onTick) onTick(status);
      if (status.status === 'procesado' || status.status === 'error') {
        return status;
      }
      await sleep(intervalMs);
    }
    throw new ApiError(
      0,
      'El procesamiento sigue en curso. Volvé a consultar el estado en unos minutos.'
    );
  },
};
