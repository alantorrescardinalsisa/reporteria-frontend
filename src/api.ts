export const API_URL = (
  import.meta.env.VITE_API_URL || "https://reporteria-api.onrender.com"
).replace(/\/$/, "");

export type TrackeoFilters = {
  fecha_desde: string;
  fecha_hasta: string;
  campanas: string[];
  prestador_ids: string[];
  estados: string[];
  tipos: string[];
  polizas: string[];
};
export type EstadoOption = {
  estado: string;
  estado_normalizado: string;
  cantidad: number;
};
export type TipoOption = {
  tipo_de_servicio: string;
  tipo_normalizado: string;
  cantidad: number;
  pertenece_universo_operativo_historico: boolean;
  tipo_poliza?: string | null;
};
// NUEVO v4.24.0 (ADITIVO): filtro global "Tipo de poliza". Ver nota en
// TIPO_SERVICIO_A_POLIZA (backend, app.py) sobre su caracter temporal.
export type PolizaOption = {
  tipo_poliza: string;
  tipo_poliza_normalizado: string;
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
  asigna_movil_porcentaje?: number;
  efectividad_enviador: number;
  no_asigna_movil_cantidad: number;
  no_asigna_movil_porcentaje: number;
  // Campos auxiliares de auditoria (definicion anterior, mas estricta:
  // ConEnvioOK=SI Y AsignoMovil=SI/!=SI). No se muestran en las tarjetas
  // principales, solo disponibles para diagnostico si se necesitan.
  asigna_movil_con_envio_ok?: number;
  no_asigna_movil_con_envio_ok?: number;
  servicios_programados: number;
  programados_porcentaje: number;
  servicios_evaluados_demora?: number;
  servicios_cumplidos: number;
  servicios_no_cumplidos: number;
  cumplimiento_demora: number;
  // Campos auxiliares de auditoria: definicion anterior de cumplimiento
  // (campo SQL `cumple_demora_prometida_15` de fn_consolidar_trackeo,
  // condicionado a ConEnvioOK=SI). No se muestran en la tarjeta
  // principal, solo disponibles para diagnostico si se necesitan.
  servicios_evaluados_demora_sql?: number;
  servicios_cumplidos_sql?: number;
  servicios_no_cumplidos_sql?: number;
  cumplimiento_demora_sql?: number;
  // NUEVO v4.13.0 (ADITIVO): "cumplimiento observado" solo sobre
  // servicios con DemoraPrometida Y DemoraReal cargadas (sin tratar
  // blancos como 0), y que proporcion del universo filtrado tiene esa
  // trazabilidad completa. No reemplaza a cumplimiento_demora.
  servicios_evaluados_demora_trazable?: number;
  servicios_cumplidos_trazable?: number;
  servicios_no_cumplidos_trazable?: number;
  cumplimiento_demora_trazable?: number;
  cobertura_medicion_demora?: number;
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
// NUEVO v4.15.0 (ADITIVO): score de ranking de prestadores.
export type ScoreComponentes = {
  sla: number | null;
  asignacion: number | null;
  calidad_datos: number | null;
  volumen: number | null;
};
export type PrestadorMetric = TrackeoSummary & {
  prestador_id: string;
  prestador: string;
  total_general: number;
  indice_calidad_datos?: number | null;
  volumen_relativo?: number;
  score_ranking?: number | null;
  score_componentes?: ScoreComponentes;
  score_componentes_evaluados?: string[];
  muestra_baja?: boolean;
  cantidad_tipos_servicio?: number;
  // NUEVO v4.17.0 (ADITIVO): informativo, no forma parte del score.
  porcentaje_trazabilidad_completa?: number;
};
// NUEVO v4.15.0 (ADITIVO): impacto por campana (volumen x oportunidad
// de mejora). Ver /api/metricas-trackeo/impacto-campanas.
export type CampanaImpacto = {
  campana: string;
  campana_normalizada: string;
  total_general: number;
  enviador_si: number;
  efectividad_enviador: number;
  servicios_evaluados_demora_trazable: number;
  cumplimiento_demora_trazable: number;
  oportunidad_mejora_asignacion: number | null;
  oportunidad_mejora_cumplimiento: number | null;
  impacto_asignacion: number | null;
  impacto_cumplimiento: number | null;
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
// NUEVO v4.17.0 (ADITIVO): "¿el servicio tiene TODA la secuencia de
// eventos completa?", no solo si cada campo por separado está lleno.
export type Trazabilidad = {
  total: number;
  funnel_completitud: { etapa: string; cantidad: number; porcentaje: number }[];
  servicios_trazabilidad_completa: number;
  porcentaje_trazabilidad_completa: number;
};
// NUEVO v4.25.0 (Poka-Yoke, ADITIVO): valores estructuralmente
// imposibles (demoras negativas, eventos fuera de orden cronológico).
// Ver /api/metricas-trackeo/calidad-datos.
export type Anomalias = {
  total: number;
  demora_real_negativa: number;
  demora_prometida_negativa: number;
  eventos_fuera_de_orden_cronologico: { tramo: string; cantidad: number }[];
  servicios_con_alguna_anomalia: number;
  porcentaje_servicios_con_alguna_anomalia: number;
};
// NUEVO v4.17.0 (ADITIVO): coordenadas y MovilRegistrado como
// habilitadores del proceso de asignación.
export type ResumenAsignacion = {
  total: number;
  enviador_si: number;
  asigna_movil: number;
  efectividad_enviador: number | null;
};
export type HabilitadoresAsignacion = {
  coordenadas: {
    con_coordenadas: ResumenAsignacion;
    sin_coordenadas: ResumenAsignacion;
    sin_dato: ResumenAsignacion;
  };
  conversion_envio_a_movil_registrado: {
    enviador_si: number;
    movil_registrado_si: number;
    tasa_conversion: number | null;
    asigno_movil_si: number;
    coincidencia_movil_registrado_vs_asigno_movil: number | null;
  };
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
  // Formula literal confirmada por el usuario (DemoraReal <=
  // DemoraPrometida + 15), usada por la tarjeta "Cumplimiento de
  // demora" desde v4.9.0.
  cumple_demora_prometida_15?: boolean | null;
  // Auxiliar de auditoria: valor anterior calculado por SQL en
  // Supabase (fn_consolidar_trackeo), puede no coincidir con el de arriba.
  cumple_demora_prometida_15_sql?: boolean | null;
  // NUEVO v4.13.0 (ADITIVO): version "trazable" (null si falta
  // DemoraPrometida o DemoraReal, en vez de tratarlos como 0).
  cumple_demora_prometida_15_trazable?: boolean | null;
  // Valor crudo de la columna RangoDemoraReal del Excel (sin pasar por
  // normalizar_rango_demora en la vista) — el que usa el desglose
  // "Distribucion de servicios cumplidos" desde v4.11.0.
  rango_demora_real?: string | null;
  // Auxiliar de auditoria: version normalizada por SQL en la vista.
  rango_demora_real_normalizado?: string | null;
};
export type MetricaTrackeo =
  | "ENVIADOR_SI"
  | "ENVIADOR_NO"
  | "ASIGNA_MOVIL"
  | "NO_ASIGNA_MOVIL"
  | "ASIGNA_MOVIL_CON_ENVIO_OK"
  | "NO_ASIGNA_MOVIL_CON_ENVIO_OK"
  | "PROGRAMADOS"
  | "PROGRAMADOS_ASIGNADOS"
  | "PROGRAMADOS_A_TIEMPO"
  | "PROGRAMADOS_FUERA_DE_TIEMPO"
  | "CUMPLE_DEMORA"
  | "NO_CUMPLE_DEMORA"
  | "CUMPLE_DEMORA_SQL"
  | "NO_CUMPLE_DEMORA_SQL"
  | "CUMPLE_DEMORA_TRAZABLE"
  | "NO_CUMPLE_DEMORA_TRAZABLE"
  | "MENOS_60"
  | "ENTRE_61_90"
  | "ENTRE_91_120"
  | "ENTRE_121_180"
  | "MAS_181"
  | "NA";
// NUEVO v4.14.0 (ADITIVO): funnel de tiempos T1-T6 + SLA de
// despacho/llegada. Ver /api/metricas-trackeo/funnel-tiempos.
export type TiempoStats = {
  cantidad: number;
  cantidad_invalidos_negativos: number;
  promedio: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  maximo: number | null;
};
export type SlaBucket = {
  etiqueta: string;
  cantidad: number;
  porcentaje: number;
};
export type FunnelTiempos = {
  universo_total: number;
  tiempos: {
    t1_alta_a_despachador: TiempoStats;
    t2_despachador_a_asignacion: TiempoStats;
    t3_alta_a_asignacion: TiempoStats;
    t4_asignacion_a_arribo: TiempoStats;
    t5_ejecucion: TiempoStats;
    t6_end_to_end: TiempoStats;
  };
  sla_despacho: {
    base_tiempo: string;
    cantidad_evaluable: number;
    buckets: SlaBucket[];
  };
  sla_llegada: {
    cantidad_evaluable: number;
    buckets: SlaBucket[];
  };
  // NUEVO v4.16.0 (ADITIVO): volumen y SLA de despacho por hora del
  // dia (0-23, hora local Argentina), para dimensionar capacidad
  // operativa contra la demanda real por franja horaria.
  distribucion_horaria: {
    hora: number;
    servicios: number;
    t3_promedio: number | null;
    t3_p90: number | null;
  }[];
};
// NUEVO v4.16.0 (ADITIVO): categorizacion semantica de estados. Ver
// /api/metricas-trackeo/estados-categorizados.
export type EstadoCategorizado = {
  estado_normalizado: string;
  estado: string;
  categoria: string;
  cantidad: number;
};
export type EstadosCategorizados = {
  total_servicios: number;
  categorias: { categoria: string; cantidad: number; porcentaje: number }[];
  estados: EstadoCategorizado[];
  estados_sin_clasificar: EstadoCategorizado[];
  nota: string;
};
// NUEVO v4.18.0 (ADITIVO): funnel de gestion completa de programados.
export type ProgramadosFunnel = {
  total_programados: number;
  funnel: { etapa: string; cantidad: number; porcentaje: number }[];
  llegada_en_horario: {
    evaluables: number;
    a_tiempo: number;
    porcentaje: number | null;
  };
};
// NUEVO v4.18.0 (ADITIVO): outliers por tramo del funnel + demora real.
export type OutlierItem = {
  id_servicio_prestado: number | null;
  prestador: string | null;
  campana: string | null;
  fecha: string | null;
  valor_minutos: number;
  es_anomalia_probable: boolean;
};
export type OutlierTramo = {
  cantidad_evaluable: number;
  p90_referencia: number | null;
  top: OutlierItem[];
};
// NUEVO v4.21.0 (ADITIVO). Motor de reglas sobre datos historicos
// (ver /api/inteligencia/prestadores en app.py) -- sin pronostico ni
// probabilidad de ocurrencia futura, sin modelo entrenado.
export type Clasificacion =
  | "urgente"
  | "atencion"
  | "destacado"
  | "estable"
  | "muestra_insuficiente";
export type InteligenciaPrestador = {
  prestador_id: string;
  prestador: string;
  total_general: number;
  servicios_evaluados_demora_trazable: number;
  cumplimiento_actual: number;
  tendencia_pp: number | null;
  muestra_suficiente: boolean;
  percentil_benchmark: number | null;
  clasificacion: Clasificacion;
  factores: string[];
};
export type InteligenciaPrestadores = {
  total_prestadores: number;
  resumen: Record<Clasificacion, number>;
  prestadores: InteligenciaPrestador[];
  metodologia: string;
  periodo_dias: number;
  periodo_suficiente: boolean;
  dias_minimo_recomendado: number;
};
// NUEVO v4.22.0 (ADITIVO): sistema de alertas (campanita del header).
export type PrestadorAlerta = {
  prestador_id: string;
  prestador: string;
  score_mes_anterior: number;
  score_mes_actual: number;
  servicios_mes_anterior: number;
  servicios_mes_actual: number;
};
export type CampanaAlerta = {
  campana: string;
  campana_normalizada: string;
  cumplimiento_mes_anterior: number;
  cumplimiento_mes_actual: number;
  variacion_pp: number;
  total_mes_actual: number;
};
// NUEVO v4.25.0 (Jidoka, ADITIVO): caída de trazabilidad mes a mes.
export type CalidadDatosAlerta = {
  trazabilidad_mes_anterior: number;
  trazabilidad_mes_actual: number;
  variacion_pp: number;
  total_mes_actual: number;
  mensaje: string;
};
export type Alertas = {
  mes_actual: string | null;
  mes_anterior: string | null;
  prestadores_alerta: PrestadorAlerta[];
  campanas_alerta: CampanaAlerta[];
  calidad_datos_alerta: CalidadDatosAlerta | null;
  total_alertas: number;
  mensaje?: string;
};
export type Outliers = {
  t1_alta_a_despachador: OutlierTramo;
  t2_despachador_a_asignacion: OutlierTramo;
  t3_alta_a_asignacion: OutlierTramo;
  t4_asignacion_a_arribo: OutlierTramo;
  t5_ejecucion: OutlierTramo;
  t6_end_to_end: OutlierTramo;
  demora_real: OutlierTramo;
};
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

function qs(
  values: Record<string, string | number | string[] | null | undefined>,
) {
  const p = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) =>
    Array.isArray(v)
      ? v.forEach((x) => x !== "" && p.append(k, x))
      : v !== null && v !== undefined && v !== "" && p.set(k, String(v)),
  );
  const x = p.toString();
  return x ? `?${x}` : "";
}
function fp(f: TrackeoFilters) {
  return {
    fecha_desde: f.fecha_desde,
    fecha_hasta: f.fecha_hasta,
    campana: f.campanas,
    prestador_id: f.prestador_ids,
    estado: f.estados,
    tipo: f.tipos,
    poliza: f.polizas,
  };
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API_URL + path, { cache: "no-store", ...init });
  const ct = r.headers.get("content-type") || "";
  const body = ct.includes("json") ? await r.json() : await r.text();
  if (!r.ok)
    throw new Error(
      typeof body === "object" && body?.detail
        ? typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail)
        : String(body || `HTTP ${r.status}`),
    );
  return body as T;
}

export const api = {
  url: API_URL,
  health: () => request<{ ok: boolean; version: string }>("/health"),
  trackeoResumen: (f: TrackeoFilters) =>
    request<{ resumen: TrackeoSummary }>(
      "/api/metricas-trackeo/resumen" + qs(fp(f)),
    ),
  trackeoUniversos: (f: TrackeoFilters) =>
    request<{ universos: TrackeoUniversos }>(
      "/api/metricas-trackeo/universos" + qs(fp(f)),
    ),
  trackeoPrestadores: (f: TrackeoFilters) =>
    request<{
      cantidad_prestadores: number;
      prestadores: PrestadorMetric[];
      advertencia_tipos_mezclados?: string | null;
    }>("/api/metricas-trackeo/prestadores" + qs(fp(f))),
  trackeoImpactoCampanas: (f: TrackeoFilters) =>
    request<{ cantidad_campanas: number; campanas: CampanaImpacto[] }>(
      "/api/metricas-trackeo/impacto-campanas" + qs(fp(f)),
    ),
  trackeoCampanas: (f: TrackeoFilters) =>
    request<{ cantidad_campanas: number; campanas: CampanaMetric[] }>(
      "/api/metricas-trackeo/campanas" +
      qs({
        fecha_desde: f.fecha_desde,
        fecha_hasta: f.fecha_hasta,
        prestador_id: f.prestador_ids,
        estado: f.estados,
        tipo: f.tipos,
        poliza: f.polizas,
      }),
    ),
  trackeoListaPrestadores: (f: TrackeoFilters) =>
    request<{ cantidad_prestadores: number; prestadores: PrestadorOption[] }>(
      "/api/metricas-trackeo/lista-prestadores" +
      qs({
        fecha_desde: f.fecha_desde,
        fecha_hasta: f.fecha_hasta,
        campana: f.campanas,
        estado: f.estados,
        tipo: f.tipos,
        poliza: f.polizas,
      }),
    ),
  trackeoEstados: (f: TrackeoFilters) =>
    request<{
      cantidad_estados: number;
      total_servicios: number;
      estados: EstadoOption[];
    }>(
      "/api/metricas-trackeo/estados" +
      qs({
        fecha_desde: f.fecha_desde,
        fecha_hasta: f.fecha_hasta,
        campana: f.campanas,
        prestador_id: f.prestador_ids,
        tipo: f.tipos,
        poliza: f.polizas,
      }),
    ),
  trackeoTiposServicio: (f: TrackeoFilters) =>
    request<{
      cantidad_tipos: number;
      total_servicios: number;
      tipos: TipoOption[];
    }>(
      "/api/metricas-trackeo/tipos-servicio" +
      qs({
        fecha_desde: f.fecha_desde,
        fecha_hasta: f.fecha_hasta,
        campana: f.campanas,
        prestador_id: f.prestador_ids,
        estado: f.estados,
        poliza: f.polizas,
      }),
    ),
  trackeoTiposPoliza: (f: TrackeoFilters) =>
    request<{
      cantidad_tipos_poliza: number;
      total_servicios: number;
      tipos_poliza: PolizaOption[];
      servicios_sin_tipo_poliza_mapeado: number;
    }>(
      "/api/metricas-trackeo/tipos-poliza" +
      qs({
        fecha_desde: f.fecha_desde,
        fecha_hasta: f.fecha_hasta,
        campana: f.campanas,
        prestador_id: f.prestador_ids,
        estado: f.estados,
        tipo: f.tipos,
      }),
    ),
  trackeoTendencia: (f: TrackeoFilters) =>
    request<{ tendencia: TrendPoint[] }>(
      "/api/metricas-trackeo/tendencia" + qs(fp(f)),
    ),
  trackeoCalidadDatos: (f: TrackeoFilters) =>
    request<{
      calidad: DataQuality;
      trazabilidad: Trazabilidad;
      anomalias: Anomalias;
    }>("/api/metricas-trackeo/calidad-datos" + qs(fp(f))),
  trackeoHabilitadoresAsignacion: (f: TrackeoFilters) =>
    request<HabilitadoresAsignacion>(
      "/api/metricas-trackeo/habilitadores-asignacion" + qs(fp(f)),
    ),
  trackeoFunnelTiempos: (f: TrackeoFilters) =>
    request<FunnelTiempos>(
      "/api/metricas-trackeo/funnel-tiempos" + qs(fp(f)),
    ),
  trackeoEstadosCategorizados: (f: TrackeoFilters) =>
    request<EstadosCategorizados>(
      "/api/metricas-trackeo/estados-categorizados" +
      qs({
        fecha_desde: f.fecha_desde,
        fecha_hasta: f.fecha_hasta,
        campana: f.campanas,
        prestador_id: f.prestador_ids,
        tipo: f.tipos,
        poliza: f.polizas,
      }),
    ),
  trackeoProgramadosFunnel: (f: TrackeoFilters) =>
    request<ProgramadosFunnel>(
      "/api/metricas-trackeo/programados-funnel" + qs(fp(f)),
    ),
  trackeoOutliers: (f: TrackeoFilters) =>
    request<Outliers>("/api/metricas-trackeo/outliers" + qs(fp(f))),
  inteligenciaPrestadores: (f: TrackeoFilters) =>
    request<InteligenciaPrestadores>(
      "/api/inteligencia/prestadores" + qs(fp(f)),
    ),
  alertas: (f: TrackeoFilters) =>
    request<Alertas>("/api/alertas" + qs(fp(f))),
  trackeoCampanaPrestador: (f: TrackeoFilters) =>
    request<{ cantidad: number; resultados: CampanaPrestadorMetric[] }>(
      "/api/metricas-trackeo/campana-prestador" + qs(fp(f)),
    ),
  trackeoServiciosPaginados: (
    f: TrackeoFilters,
    m: MetricaTrackeo,
    pagina = 1,
    tamanoPagina = 100,
  ) =>
    request<PaginatedServices>(
      "/api/metricas-trackeo/servicios-paginados" +
      qs({ ...fp(f), metrica: m, pagina, tamano_pagina: tamanoPagina }),
    ),
  ingest: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("uploaded_by", "dashboard");
    return request<{
      status: string;
      report_id?: string;
      report_id_existente?: string;
      mensaje?: string;
    }>("/ingestar", { method: "POST", body: form });
  },
  ingestStatus: (id: string) =>
    request<IngestStatus>(`/ingestar/estado/${encodeURIComponent(id)}`),
};