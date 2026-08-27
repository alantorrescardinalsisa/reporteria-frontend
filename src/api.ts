export const API_URL = (import.meta.env.VITE_API_URL || 'https://reporteria-api.onrender.com').replace(/\/$/, '');

export type TrackeoFilters = {
  fecha_desde: string;
  fecha_hasta: string;
  campanas: string[];
  prestador_ids: string[];
  estados: string[];
};
export type EstadoOption = { estado: string; estado_normalizado: string; cantidad: number };
export type CampanaMetric = { campana: string; campana_normalizada?: string; servicios: number };
export type PrestadorOption = { prestador_id: string; prestador: string; servicios: number };
export type TrackeoSummary = {
  servicios_consultados:number; enviador_no:number; enviador_si:number; uso_enviador:number;
  asigna_movil:number; efectividad_enviador:number; no_asigna_movil_cantidad:number;
  no_asigna_movil_porcentaje:number; servicios_programados:number; programados_porcentaje:number;
  servicios_evaluados_demora?:number; servicios_cumplidos:number; servicios_no_cumplidos:number;
  cumplimiento_demora:number; menos_60_cantidad:number; menos_60_porcentaje:number;
  entre_61_90_cantidad:number; entre_61_90_porcentaje:number; entre_91_120_cantidad:number;
  entre_91_120_porcentaje:number; entre_121_180_cantidad:number; entre_121_180_porcentaje:number;
  mas_181_cantidad:number; mas_181_porcentaje:number; na_cantidad:number; na_porcentaje:number;
};
export type TrackeoUniversos = {
  servicios_cargados:number; servicios_vehiculares:number; servicios_evaluables:number;
  servicios_cancelados:number; servicios_no_finalizados:number; servicios_no_vehiculares:number;
  servicios_tipo_no_catalogado:number; servicios_estado_no_catalogado:number; universo_excel_historico:number;
};
export type PrestadorMetric = TrackeoSummary & { prestador_id:string; prestador:string; total_general:number };
export type TrendPoint = TrackeoSummary & { fecha:string; demora_real_promedio?:number|null; demora_prometida_promedio?:number|null; desvio_promedio?:number|null };
export type DataQuality = { total:number; tipo_servicio_completo:number; estado_completo:number; campana_completa:number; prestador_completo:number; despachador_completo:number; coordenadas_disponibles:number; movil_registrado:number; demora_prometida_completa:number; demora_real_completa:number };
export type CampanaPrestadorMetric = { campana:string; campana_normalizada:string; prestador_id:string; prestador:string; total_general:number; enviador_si:number; efectividad_enviador:number; servicios_cumplidos:number; servicios_no_cumplidos:number; cumplimiento_demora:number; demora_real_promedio?:number|null; desvio_promedio?:number|null };
export type TrackeoService = { servicio_row_id:string; report_id?:string|null; prestador_id?:string|null; prestador?:string|null; fecha?:string|null; alta_del_servicio?:string|null; id_servicio_prestado?:number|null; id_orden_de_servicio?:number|null; tipo_de_servicio?:string|null; estado?:string|null; campana?:string|null; con_envio_ok?:boolean|null; asigno_movil?:boolean|null; es_programado?:boolean|null; demora_prometida?:number|null; demora_real?:number|null; cumple_demora_prometida_15?:boolean|null; rango_demora_real?:string|null };
export type MetricaTrackeo = 'ENVIADOR_SI'|'ENVIADOR_NO'|'ASIGNA_MOVIL'|'NO_ASIGNA_MOVIL'|'PROGRAMADOS'|'CUMPLE_DEMORA'|'NO_CUMPLE_DEMORA'|'MENOS_60'|'ENTRE_61_90'|'ENTRE_91_120'|'ENTRE_121_180'|'MAS_181'|'NA';
export type PaginatedServices = { cantidad_total:number; pagina:number; tamano_pagina:number; total_paginas:number; servicios:TrackeoService[] };
export type IngestStatus = { id:string; file_name?:string; status:string; etapa?:string; error_msg?:string; filas_totales?:number; filas_procesadas?:number; periodo_desde?:string; periodo_hasta?:string };

function qs(values:Record<string,string|number|string[]|null|undefined>){ const p=new URLSearchParams(); Object.entries(values).forEach(([k,v])=>Array.isArray(v)?v.forEach(x=>x!==''&&p.append(k,x)):v!==null&&v!==undefined&&v!==''&&p.set(k,String(v))); const x=p.toString(); return x?`?${x}`:''; }
function fp(f:TrackeoFilters){return {fecha_desde:f.fecha_desde,fecha_hasta:f.fecha_hasta,campana:f.campanas,prestador_id:f.prestador_ids,estado:f.estados}}
async function request<T>(path:string, init?:RequestInit):Promise<T>{ const r=await fetch(API_URL+path,{cache:'no-store',...init}); const ct=r.headers.get('content-type')||''; const body=ct.includes('json')?await r.json():await r.text(); if(!r.ok) throw new Error(typeof body==='object'&&body?.detail?(typeof body.detail==='string'?body.detail:JSON.stringify(body.detail)):String(body||`HTTP ${r.status}`)); return body as T; }

export const api={
  url:API_URL,
  health:()=>request<{ok:boolean;version:string}>('/health'),
  trackeoResumen:(f:TrackeoFilters)=>request<{resumen:TrackeoSummary}>('/api/metricas-trackeo/resumen'+qs(fp(f))),
  trackeoUniversos:(f:TrackeoFilters)=>request<{universos:TrackeoUniversos}>('/api/metricas-trackeo/universos'+qs(fp(f))),
  trackeoPrestadores:(f:TrackeoFilters)=>request<{cantidad_prestadores:number;prestadores:PrestadorMetric[]}>('/api/metricas-trackeo/prestadores'+qs(fp(f))),
  trackeoCampanas:(f:TrackeoFilters)=>request<{cantidad_campanas:number;campanas:CampanaMetric[]}>('/api/metricas-trackeo/campanas'+qs({fecha_desde:f.fecha_desde,fecha_hasta:f.fecha_hasta,prestador_id:f.prestador_ids,estado:f.estados})),
  trackeoListaPrestadores:(f:TrackeoFilters)=>request<{cantidad_prestadores:number;prestadores:PrestadorOption[]}>('/api/metricas-trackeo/lista-prestadores'+qs({fecha_desde:f.fecha_desde,fecha_hasta:f.fecha_hasta,campana:f.campanas,estado:f.estados})),
  trackeoEstados:(f:TrackeoFilters)=>request<{cantidad_estados:number;total_servicios:number;estados:EstadoOption[]}>('/api/metricas-trackeo/estados'+qs({fecha_desde:f.fecha_desde,fecha_hasta:f.fecha_hasta,campana:f.campanas,prestador_id:f.prestador_ids})),
  trackeoTendencia:(f:TrackeoFilters)=>request<{tendencia:TrendPoint[]}>('/api/metricas-trackeo/tendencia'+qs(fp(f))),
  trackeoCalidadDatos:(f:TrackeoFilters)=>request<{calidad:DataQuality}>('/api/metricas-trackeo/calidad-datos'+qs(fp(f))),
  trackeoCampanaPrestador:(f:TrackeoFilters)=>request<{cantidad:number;resultados:CampanaPrestadorMetric[]}>('/api/metricas-trackeo/campana-prestador'+qs(fp(f))),
  trackeoServiciosPaginados:(f:TrackeoFilters,m:MetricaTrackeo,pagina=1,tamanoPagina=100)=>request<PaginatedServices>('/api/metricas-trackeo/servicios-paginados'+qs({...fp(f),metrica:m,pagina,tamano_pagina:tamanoPagina})),
  ingest:async(file:File)=>{const form=new FormData();form.append('file',file);form.append('uploaded_by','dashboard');return request<{status:string;report_id?:string;report_id_existente?:string;mensaje?:string}>('/ingestar',{method:'POST',body:form});},
  ingestStatus:(id:string)=>request<IngestStatus>(`/ingestar/estado/${encodeURIComponent(id)}`),
};
