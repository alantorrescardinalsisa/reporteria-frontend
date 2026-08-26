const API_URL = (import.meta.env.VITE_API_URL || 'https://reporteria-api.onrender.com').replace(/\/$/, '');

export type TrackeoFilters = { fecha_desde: string; fecha_hasta: string; campanas: string[]; prestador_ids: string[] };
export type TrackeoSummary = {
  fecha_desde:string; fecha_hasta:string; servicios_consultados:number; enviador_no:number; enviador_si:number; uso_enviador:number;
  asigna_movil:number; no_asigna_movil_cantidad:number; no_asigna_movil_porcentaje:number; efectividad_enviador:number;
  servicios_programados:number; programados_porcentaje:number; servicios_cumplidos:number; servicios_no_cumplidos:number; cumplimiento_demora:number;
  menos_60_cantidad:number; menos_60_porcentaje:number; entre_61_90_cantidad:number; entre_61_90_porcentaje:number;
  entre_91_120_cantidad:number; entre_91_120_porcentaje:number; entre_121_180_cantidad:number; entre_121_180_porcentaje:number;
  mas_181_cantidad:number; mas_181_porcentaje:number; na_cantidad:number; na_porcentaje:number;
};
export type TrackeoUniversos = { fecha_desde:string; fecha_hasta:string; servicios_cargados:number; servicios_vehiculares:number; servicios_evaluables:number; servicios_cancelados:number; servicios_no_finalizados:number; servicios_no_vehiculares:number; servicios_tipo_no_catalogado:number; servicios_estado_no_catalogado:number; universo_excel_historico:number };
export type PrestadorOption = { prestador_id:string; prestador:string; servicios?:number };
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

  /*
   * Nombres originales devueltos por Supabase.
   */
  cumplimiento_demora_cantidad?: number;
  no_cumplimiento_demora_cantidad?: number;
  cumplimiento_demora_porcentaje?: number;

  /*
   * Nombres normalizados utilizados por App.tsx.
   */
  servicios_cumplidos?: number;
* servicios_no_cumplidos?: number;
* cumplimiento_demora?: number;

  *enos_60_cantidad?: number;
  menos*60_porcentaje?: number;

  entre_6*_90_cantidad?: number;
  entre_61_*0_porcentaje?: number;

  entre_91*120_cantidad?: number;
  entre_91_*20_porcentaje?: number;

  entre_1*1_180_cantidad?: number;
  entre_1*1_180_porcentaje?: number;

  mas_*81_cantidad?: number;
  mas_181_po*centaje?: number;

  na_cantidad?:*number;
  na_porcentaje?: number;
*;
export type CampanaMetric = { campana:string; campana_normalizada?:string; servicios:number };
export type IngestResponse = { status:'pendiente'|'procesando'|'duplicado'; report_id?:string; report_id_existente?:string; existente?:string; mensaje?:string; request_id?:string };
export type IngestStatus = { id:string; file_name:string|null; tipo_reporte:string|null; status:'pendiente'|'procesando'|'procesado'|'error'|'reintentar'|'cancelado'; etapa:string|null; error_msg:string|null; filas_totales:number|null; filas_procesadas:number; periodo_desde:string|null; periodo_hasta:string|null; intentos:number; heartbeat_at:string|null; iniciado_at:string|null; finalizado_at:string|null };

type QueryValue = string|number|undefined|null|string[];
function qs(params:Record<string,QueryValue>){ const q=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>Array.isArray(v)?v.forEach(x=>x!==''&&q.append(k,x)):v!==''&&v!=null&&q.set(k,String(v))); const s=q.toString(); return s?`?${s}`:''; }
const RETRYABLE=new Set([502,503,504]);
const wait=(ms:number)=>new Promise<void>(resolve=>window.setTimeout(resolve,ms));
async function request<T>(path:string,init?:RequestInit,maxAttempts=4):Promise<T>{ let last:Error|null=null; for(let attempt=1;attempt<=maxAttempts;attempt++){ try{ const r=await fetch(`${API_URL}${path}`,{cache:'no-store',...init}); const text=await r.text(); let body:any; try{body=text?JSON.parse(text):null}catch{body=text} if(r.ok)return body as T; const d=body?.detail; const message=typeof d==='string'?d:d?.mensaje||d?.error||body?.mensaje||`Error HTTP ${r.status}`; last=new Error(d?.funcion?`${message} (${d.funcion})`:message); if(!RETRYABLE.has(r.status)||attempt>=maxAttempts)throw last; }catch(e){last=e instanceof Error?e:new Error(String(e)); if(attempt>=maxAttempts)throw last;} await wait(600*2**(attempt-1)); } throw last||new Error('No se pudo completar la consulta.'); }
function filterQuery(f:TrackeoFilters){return qs({fecha_desde:f.fecha_desde,fecha_hasta:f.fecha_hasta,campana:f.campanas,prestador_id:f.prestador_ids})}
export const api={
 url:API_URL,
 health:()=>request<{ok:boolean;version:string}>('/health'),
 trackeoResumen:(f:TrackeoFilters)=>request<{resumen:TrackeoSummary}>(`/api/metricas-trackeo/resumen${filterQuery(f)}`),
 trackeoUniversos:(f:TrackeoFilters)=>request<{universos:TrackeoUniversos}>(`/api/metricas-trackeo/universos${filterQuery(f)}`),
 trackeoPrestadores:async(f:TrackeoFilters)=>{const r=await request<{cantidad_prestadores:number;prestadores:PrestadorMetric[]}>(`/api/metricas-trackeo/prestadores${filterQuery(f)}`);return{...r,prestadores:r.prestadores.map(p=>({...p,servicios:p.servicios??p.total_general??0,cumplimiento_demora:p.cumplimiento_demora??p.cumplimiento_demora_porcentaje}))}},
 trackeoCampanas:(desde:string,hasta:string,ids:string[]=[])=>request<{cantidad_campanas:number;total_servicios:number;campanas:CampanaMetric[]}>(`/api/metricas-trackeo/campanas${qs({fecha_desde:desde,fecha_hasta:hasta,prestador_id:ids})}`),
 trackeoListaPrestadores:(desde:string,hasta:string,campanas:string[]=[])=>request<{cantidad_prestadores:number;prestadores:PrestadorOption[]}>(`/api/metricas-trackeo/lista-prestadores${qs({fecha_desde:desde,fecha_hasta:hasta,campana:campanas})}`),
 ingest:async(file:File,uploadedBy='dashboard')=>{const body=new FormData();body.append('file',file,file.name);body.append('uploaded_by',uploadedBy);return request<IngestResponse>('/ingestar',{method:'POST',body})},
 ingestStatus:(id:string)=>request<IngestStatus>(`/ingestar/estado/${id}`),
};
export {API_URL};
