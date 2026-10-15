/* Pantalla "Auditoría de prestadores" (pestaña de Inteligencia Operativa).
   Muestra lo que deja el motor estadístico semanal (esquema `auditoria`) EN LENGUAJE LLANO: primero conclusiones
   ("17 de cada 100 servicios…"), y los números técnicos (z ajustado, casos, puntos porcentuales) quedan en un
   desplegable "Ver detalle técnico". SOLO LECTURA: no calcula nada ni modifica datos.
   Es una herramienta para AUDITAR: ninguna alerta es una sanción automática, requiere revisión de una persona. */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import type {
  AuditoriaCorrida,
  AuditoriaCorridaResumen,
  AuditoriaEvidencia,
  AuditoriaHistorial,
  AuditoriaResultado,
} from "./api";
import { InfoTip } from "./InfoTip";
import type { Tooltip } from "./InfoTip";
import { CANDIDATO, OBSERVACION, situacion } from "./auditoriaSituacion";

/* Textos de ayuda (tooltips ⓘ) de toda la pantalla, en lenguaje llano. Las definiciones y umbrales salen del
   motor (auditoria_prestadores.py): si se cambian alla, actualizar aca. */
const TIPS: Record<string, Tooltip> = {
  pantalla: {
    titulo: "Auditoría de prestadores",
    leer: "Cada semana se compara a cada prestador con los demás en servicios parecidos (misma campaña y mismo tipo de servicio). Sirve para decidir a quién auditar primero. No es una sanción: siempre hay que revisar los servicios antes de decidir.",
    calculo: "El análisis corre cada lunes sobre los servicios de enero a la fecha (sin programados ni prestadores de salud).",
  },
  corrida: {
    titulo: "Semana",
    leer: "Cada semana se guarda un resultado completo. Podés elegir una semana anterior para ver cómo estaba la red en esa fecha.",
  },
  candidatos: {
    titulo: "Para auditar con prioridad",
    leer: "Prestadores que se apartan mucho de lo normal en servicios parecidos, y con suficientes servicios como para que no sea casualidad. Son los primeros para revisar.",
    calculo: "Diferencia muy marcada (z ajustado de 3 o más) en algún indicador (los reclamos solos no alcanzan) y al menos 300 servicios terminados.",
  },
  observacion: {
    titulo: "Para seguir de cerca",
    leer: "Prestadores con alguna diferencia importante respecto de lo normal, pero menos marcada o con menos servicios. Conviene seguirlos.",
    calculo: "Algún indicador con diferencia significativa (z ajustado de 2 o más) y un mínimo que importa en la práctica.",
  },
  sinAlerta: {
    titulo: "Sin problemas",
    leer: "Prestadores que registran la llegada de sus servicios y no se apartan de lo normal en ningún aspecto.",
  },
  sinTrazabilidad: {
    titulo: "No registran la llegada",
    leer: "Prestadores que casi no cargan la hora de llegada en el sistema, así que no se les puede medir la demora. Se muestran aparte: el problema de fondo es que no usan el sistema.",
    calculo: "Menos de la mitad de sus servicios terminados tiene hora de llegada.",
  },
  cumplen: {
    titulo: "Cumplen lo prometido",
    leer: "De cada 100 servicios con hora de llegada registrada (de prestadores que registran), cuántos llegaron a tiempo. Los servicios sin hora de llegada no entran acá: se penalizan aparte, como problema de carga de datos.",
    calculo: "100 menos el porcentaje que llegó tarde, calculado solo sobre servicios con hora de llegada y demora prometida, sin contar las llegadas cargadas a destiempo.",
  },
  tardeComprobado: {
    titulo: "Llegaron tarde",
    leer: "Servicios donde la hora de llegada está registrada y el prestador llegó después de lo prometido.",
    calculo: "Demora real mayor a la prometida más 15 minutos de tolerancia, sin ser una carga a destiempo.",
  },
  sinHoraLlegada: {
    titulo: "Sin hora de llegada",
    leer: "Servicios terminados donde el prestador no registró cuándo llegó. No se puede comprobar si cumplió, así que NO cuenta como demora: se penaliza aparte, como problema de carga de datos.",
  },
  cargaRetroactiva: {
    titulo: "Llegada cargada a destiempo",
    leer: "Servicios cuya llegada se cargó mucho tiempo después de que ocurrió, por ejemplo al cerrar el mes. No prueba que hayan llegado tarde, pero sí que no se registró en el momento.",
    calculo: "Demora real mayor a 3 veces la que tiene el 90 % de los servicios (percentil 90).",
  },
  incumple90: {
    titulo: "Últimos 90 días",
    leer: "De cada 100 servicios de los últimos 90 días con hora de llegada registrada, cuántos llegaron tarde. Debajo se compara con los 90 días anteriores para ver si la red mejora o empeora.",
  },
  comoLeer: {
    titulo: "Cómo leer esta pantalla",
    leer: "Despliega una explicación corta de qué significan los grupos y los números.",
  },
  priorizados: {
    titulo: "Prestadores del más al menos urgente",
    leer: "Ordenados de mayor a menor urgencia. Hacé clic en una fila para ver el detalle, el historial y los servicios de ejemplo.",
  },
  filtroAlerta: {
    titulo: "Filtrar por situación",
    leer: "Para auditar: diferencia muy marcada. Para seguir de cerca: diferencia moderada. Sin problemas: dentro de lo normal.",
  },
  filtroSegmento: {
    titulo: "Registro de la llegada",
    leer: "“Registran la llegada” son los prestadores que se pueden evaluar. “No registran la llegada” son los que casi no cargan la hora de llegada: no entran en la comparación.",
  },
  colPrestador: { leer: "Nombre del prestador. Hacé clic en la fila para ver el detalle." },
  colNivel: {
    titulo: "Volumen",
    leer: "Cuántos servicios tiene el prestador, que determina si se lo puede evaluar con confianza.",
    calculo: "Alto: 50 servicios o más. Medio: de 20 a 49. Bajo: menos de 20 (no se evalúa).",
  },
  colServicios: { leer: "Servicios asignados al prestador en el período analizado (todos los estados)." },
  colCerrados: { leer: "Servicios que ya terminaron (cerrados o con encuesta). Sobre ellos se calculan los porcentajes." },
  colPrioridad: {
    titulo: "Urgencia (0 a 100)",
    leer: "Qué tan apartado de lo normal está el prestador. Sirve para ordenar la lista: cuanto más alto, antes conviene mirarlo. No es un porcentaje de incumplimiento.",
    calculo: "Suma ponderada de las diferencias importantes, sobre el máximo posible.",
  },
  colImpacto: {
    titulo: "Servicios de más",
    leer: "Cuántos servicios con problemas tiene el prestador de más, comparado con lo que tendría si rindiera como los demás prestadores en servicios parecidos. Debajo del número se aclara por qué aspecto (demora, falta de hora de llegada, etc.). Ayuda a elegir por dónde empezar: un prestador grande con una diferencia chica puede sumar más servicios problemáticos que uno chico con una diferencia enorme. No cambia la urgencia, es un dato más.",
    calculo: "Si el prestador tuviera el rendimiento normal, tendría X servicios con problemas; tiene más. La diferencia es este número. Se calcula en el aspecto donde más se aparta, y es un mínimo: no suma aspectos distintos para no contar dos veces el mismo servicio.",
  },
  colPareto: {
    titulo: "Acumulado (regla de Pareto)",
    leer: "Qué parte del total de “servicios de más” de toda la red ya se alcanzó al llegar a este prestador, ordenando de mayor a menor. El punto rojo marca al grupo chico que junta el 80 % del problema: ahí conviene empezar. Es un dato fijo de cada prestador: no cambia con los filtros ni con el orden de la tabla.",
    calculo: "Se ordenan todos los prestadores de la corrida por “servicios de más” y se va sumando. Grupo A: hasta completar el 80 % del total (incluye al que lo cruza). Grupo B: del 80 % al 95 %. Grupo C: el resto.",
  },
  colAlerta: {
    titulo: "Situación",
    leer: "Para auditar con prioridad: diferencia muy marcada y suficientes servicios. Para seguir de cerca: alguna diferencia importante. Sin problemas: dentro de lo normal.",
  },
  colMotivo: { leer: "Por qué quedó en esa situación, explicado en palabras. El detalle completo está al abrir la fila." },
  confianza: {
    titulo: "Confianza del resultado",
    leer: "Qué tan firme es la conclusión según cuántos servicios terminados tiene el prestador. Con pocos servicios, un resultado puede deberse al azar.",
    calculo: "Alta: 200 servicios terminados o más. Media: de 50 a 199. Baja: menos de 50.",
  },
  prioridad: {
    titulo: "Urgencia",
    leer: "Puntaje de 0 a 100 que ordena a los prestadores según cuánto se apartan de lo normal.",
  },
  motivos: {
    titulo: "En pocas palabras",
    leer: "Las razones por las que el prestador quedó en esta situación, de la más importante a la menos importante.",
  },
  indicadores: {
    titulo: "Comparado con otros prestadores",
    leer: "Cada tarjeta compara lo que le pasó al prestador con lo que sería normal en servicios parecidos (misma campaña y mismo tipo de servicio).",
  },
  tecnico: {
    titulo: "Detalle técnico",
    leer: "Los números estadísticos detrás de las tarjetas, para quien quiera verificarlos.",
  },
  colCasos: { leer: "Cantidad de servicios sobre los que se calcula el indicador." },
  colObservado: { leer: "Porcentaje real del prestador." },
  colEsperado: {
    titulo: "Esperado (lo normal)",
    leer: "Porcentaje que tendría si rindiera como los demás prestadores en las mismas campañas y tipos de servicio.",
    calculo: "Promedio de los otros prestadores en cada combinación de campaña y tipo de servicio, ponderado por los servicios del prestador (sin contarlo a él).",
  },
  colDiferencia: { leer: "Observado menos esperado, en puntos porcentuales. Positivo significa peor que lo normal." },
  colZ: {
    titulo: "z ajustado",
    leer: "Cuántas veces la diferencia supera lo que explicaría el azar, corregido porque los prestadores reales difieren entre sí. 2 o más es significativo; 3 o más es muy marcado.",
    calculo: "Diferencia dividida por el error estándar, y reescalada por la dispersión real entre prestadores (método robusto MAD).",
  },
  colSenal: {
    titulo: "Señal",
    leer: "“Activa” cuando la diferencia es estadísticamente significativa y además supera un mínimo que importa en la práctica.",
    calculo: "z ajustado de 2 o más y diferencia mínima: demora 3 pp, sin hora de llegada 5 pp, registro incompleto 5 pp, carga a destiempo 1 pp, reclamos 0,5 pp, encuestas 5 pp.",
  },
  composicion: {
    titulo: "De qué están hechos los problemas",
    leer: "Descompone los servicios con problemas por causa: llegar tarde (demora), no registrar la llegada (carga de datos) o cargarla a destiempo (carga de datos).",
  },
  sinDemoraPrometida: {
    titulo: "Sin demora prometida",
    leer: "Servicios con llegada registrada pero sin demora prometida cargada: no se puede comprobar si cumplió. No cuenta como demora ni se penaliza al prestador (la demora prometida la carga la compañía).",
  },
  tendencia: {
    titulo: "Evolución",
    leer: "Compara los últimos 90 días del prestador con los 90 anteriores, para ver si mejora o empeora.",
    calculo: "Diferencia entre los dos períodos en puntos porcentuales. Suma a la urgencia si empeora 5 puntos o más y es estadísticamente significativo.",
  },
  historial: {
    titulo: "Semana a semana",
    leer: "Una barra por cada semana analizada. Rojo: estuvo para auditar con prioridad. Naranja: para seguir de cerca. Gris: sin problemas. Sirve para ver si el problema es nuevo o viene de antes.",
  },
  evidencia: {
    titulo: "Servicios de ejemplo",
    leer: "Casos reales para revisar uno por uno antes de decidir. Se muestran los más extremos de cada tipo (hasta 10 o 15, según el tipo).",
  },
  colCierreMes: { leer: "Si el servicio se cerró en los últimos 3 días del mes. Muchos cierres a fin de mes pueden indicar carga masiva para cobrar." },
  colJuntos: { leer: "Si la llegada y el cierre se cargaron con menos de 15 minutos de diferencia. Es la huella típica de una carga hecha después del hecho." },
};

const TITULO_EVIDENCIA: Record<string, { titulo: string; leer: string }> = {
  "Tarde comprobado": { titulo: "Llegaron tarde", leer: "Llegaron después de lo prometido más 15 minutos, con hora de llegada registrada." },
  "Carga tardia / demora extrema": {
    titulo: "Llegada cargada mucho después",
    leer: "La demora real supera 3 veces la que tiene el 90 % de los servicios: la llegada se cargó mucho después de que ocurrió.",
  },
  "Sin hora de llegada": { titulo: "Sin hora de llegada registrada", leer: "Servicios terminados donde el prestador no registró la llegada." },
  "Reclamo / queja": { titulo: "Con reclamo del cliente", leer: "Servicios con un reclamo o queja registrado por el cliente." },
};

const PAGE_SIZE = 15;
const Z_MIN = 2; // mismos umbrales que el motor (ver auditoria_prestadores.py)
const INDICADORES: { clave: string; titulo: string; problema: string; efectoMin: number; informativo?: boolean }[] = [
  { clave: "incumple", titulo: "Cumplir con la demora prometida", problema: "servicios con hora de llegada que llegaron tarde (los que no tienen hora de llegada se miden aparte)", efectoMin: 3 },
  { clave: "sin_llegada", titulo: "Registrar la hora de llegada", problema: "servicios terminados sin hora de llegada (problema de carga de datos, no de demora)", efectoMin: 5 },
  { clave: "incompleto", titulo: "Registrar bien cada servicio", problema: "servicios con datos incompletos (móvil, ubicación o envío)", efectoMin: 5 },
  { clave: "extremo", titulo: "Cargar la llegada en el momento", problema: "servicios con la llegada cargada mucho después de que ocurrió", efectoMin: 1 },
  { clave: "reclamo", titulo: "Reclamos de clientes", problema: "servicios con un reclamo o queja", efectoMin: 0.5 },
  { clave: "enc_baja", titulo: "Opinión de los clientes", problema: "encuestas con nota baja", efectoMin: 5 },
  { clave: "cancela", titulo: "Cancelaciones", problema: "servicios cancelados después de asignarlos (solo informativo)", efectoMin: 2, informativo: true },
];
const NIVEL_TEXTO: Record<string, string> = { A: "alto", B: "medio", C: "bajo" };

const nf = (v?: number | null, dec = 0) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("es-AR", { maximumFractionDigits: dec, minimumFractionDigits: dec }).format(v);
const pp = (v?: number | null) => (v == null ? "—" : `${nf(v, 1)} %`);
const signed = (v?: number | null, dec = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${nf(v, dec)}`);
/* "17" / "1,9": un porcentaje como cantidad cada 100 (con decimal solo si es chico). */
const cada100 = (v?: number | null) => {
  if (v == null) return "—";
  if (v >= 10) return nf(Math.round(v));
  const r = Math.round(v * 10) / 10;
  return nf(r, Number.isInteger(r) ? 0 : 1);
};
const plural = (n: number, uno: string, varios: string) => `${nf(n)} ${n === 1 ? uno : varios}`;
const fechaHora = (s?: string | number | null) => {
  if (s == null || s === "") return "—";
  const d = new Date(String(s));
  return isNaN(d.getTime())
    ? String(s)
    : d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const soloFecha = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s.length <= 10 ? s + "T12:00:00" : s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const minutos = (v: unknown) => {
  if (typeof v !== "number") return "—";
  if (v >= 1440) return `${nf(v / 1440, 1)} días`;
  if (v >= 60) return `${Math.floor(v / 60)} h ${Math.round(v % 60)} min`;
  return `${Math.round(v)} min`;
};
const mnum = (r: AuditoriaResultado, k: string): number | null => {
  const v = r.metricas?.[k];
  return typeof v === "number" ? v : null;
};
/* De qué aspecto sale el "servicios de más" (lo calcula el motor en `impacto_indicador`). */
const ASPECTO_IMPACTO: Record<string, string> = {
  incumple: "por demora",
  sin_llegada: "por falta de hora de llegada",
  incompleto: "por datos incompletos",
  extremo: "por llegada cargada a destiempo",
  reclamo: "por reclamos",
  enc_baja: "por encuestas con nota baja",
};
const aspectoImpacto = (r: AuditoriaResultado): string | null => {
  const v = r.metricas?.["impacto_indicador"];
  return typeof v === "string" ? ASPECTO_IMPACTO[v] ?? null : null;
};

function Icon({ name, className = "", filled = false }: { name: string; className?: string; filled?: boolean }) {
  return <span className={`material-symbols-outlined ${filled ? "icon-filled" : ""} ${className}`}>{name}</span>;
}

/* ---- Motivos de la alerta, en palabras ----
   El motor guarda los motivos como un texto tecnico separado por " | " (y con detalles entre corchetes que tambien
   usan " | "). Aca se separan sin cortar los corchetes y se traducen a frases comprensibles. */
function separarMotivos(texto: string | null): string[] {
  const out: string[] = [];
  let actual = "";
  let profundidad = 0;
  const t = texto || "";
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "[") profundidad++;
    if (c === "]") profundidad = Math.max(0, profundidad - 1);
    if (profundidad === 0 && t.startsWith(" | ", i)) {
      if (actual.trim()) out.push(actual.trim());
      actual = "";
      i += 2;
      continue;
    }
    actual += c;
  }
  if (actual.trim()) out.push(actual.trim());
  return out;
}

const acentuar = (s: string) =>
  s.replace(/ultimos/g, "últimos").replace(/\bdias\b/g, "días").replace(/despues/g, "después").replace(/\bmovil\b/g, "móvil");

/* Aclaraciones entre corchetes del motor ("tarde comprobado 43.2%") a frases ("43 de cada 100 llegaron tarde").
   Las que valen 0 se omiten. */
function suavizarAclaracion(s: string): string | null {
  const reglas: [RegExp, (n: string) => string][] = [
    [/^tarde comprobado ([\d.]+)%$/, (n) => `${cada100(parseFloat(n))} de cada 100 llegaron tarde`],
    [/^sin hora de llegada ([\d.]+)%$/, (n) => `${cada100(parseFloat(n))} de cada 100 no registran la llegada`],
    [/^sin demora prometida ([\d.]+)%$/, (n) => `${cada100(parseFloat(n))} de cada 100 sin demora prometida cargada`],
    [/^([\d.]+)% cerrados en los ultimos 3 dias del mes$/, (n) => `${cada100(parseFloat(n))} de cada 100 se cerraron en los últimos 3 días del mes`],
    [/^([\d.]+)% con llegada y cierre cargados juntos$/, (n) => `${cada100(parseFloat(n))} de cada 100 tienen la llegada y el cierre cargados juntos`],
  ];
  for (const [re, f] of reglas) {
    const m = s.match(re);
    if (m) return parseFloat(m[1]) === 0 ? null : f(m[1]);
  }
  return acentuar(s);
}

type MotivoInterpretado = { clave: string; obs: number; esp: number; diff: number; z: number; n: number; extras: string[] };

/* Del nombre largo que genera el motor al indicador al que corresponde. */
const CLAVES_POR_PREFIJO: [string, string][] = [
  ["Demora comprobada", "incumple"],
  ["Sin hora de llegada", "sin_llegada"],
  ["Incumplimiento de demora", "incumple_v1"], // corridas anteriores al 2026-10-15 (la demora incluia los servicios sin hora de llegada)
  ["Datos de registro incompletos", "incompleto"],
  ["Carga tardia", "extremo"],
  ["Cancelaciones", "cancela"],
  ["Reclamos", "reclamo"],
  ["Encuestas con calificacion baja", "enc_baja"],
];

function interpretarMotivo(texto: string): MotivoInterpretado | null {
  const m = texto.match(/^(.*?): ([\d.]+)% vs ([\d.]+)% esperado \(\+?(-?[\d.]+) pp, z ajustado=(-?[\d.]+), n=(\d+)\)\s*(?:\[(.*)\])?\s*$/s);
  if (!m) return null;
  const base = m[1].replace(/\s*\(.*\)\s*$/, "").trim();
  const clave = CLAVES_POR_PREFIJO.find(([pref]) => base.startsWith(pref))?.[1] ?? base;
  return {
    clave,
    obs: parseFloat(m[2]),
    esp: parseFloat(m[3]),
    diff: parseFloat(m[4]),
    z: parseFloat(m[5]),
    n: parseInt(m[6], 10),
    extras: m[7] ? m[7].split(" | ").map(suavizarAclaracion).filter((x): x is string => x != null) : [],
  };
}

/* Una frase por motivo. `tecnico` guarda el texto original por si hace falta (se muestra en el detalle tecnico). */
function explicarMotivo(raw: string): { frase: string; aclaraciones: string[]; tecnico: string } {
  const m = interpretarMotivo(raw);
  if (m) {
    const o = cada100(m.obs);
    const e = cada100(m.esp);
    const frases: Record<string, string> = {
      incumple: `Llega tarde en ${o} de cada 100 servicios con hora de llegada registrada (lo normal en servicios parecidos: ${e}).`,
      sin_llegada: `No registra la hora de llegada en ${o} de cada 100 servicios terminados (lo normal: ${e}). Es un problema de carga de datos, no de demora.`,
      incumple_v1: `Llega tarde o no registra la llegada en ${o} de cada 100 servicios (lo normal en servicios parecidos: ${e}).`,
      incompleto: `Carga datos incompletos (móvil, ubicación o envío) en ${o} de cada 100 servicios (lo normal: ${e}).`,
      extremo: `Carga la llegada mucho después de que ocurrió en ${o} de cada 100 servicios (lo normal: ${e}).`,
      reclamo: `Recibe reclamos en ${o} de cada 100 servicios (lo normal: ${e}).`,
      enc_baja: `${o} de cada 100 clientes que respondieron la encuesta le pusieron nota baja (lo normal: ${e}).`,
      cancela: `Cancela ${o} de cada 100 servicios después de asignarlos (lo normal: ${e}).`,
    };
    const frase = frases[m.clave] ?? `${m.clave}: ${o} de cada 100 (lo normal: ${e}).`;
    return { frase, aclaraciones: m.extras, tecnico: raw };
  }
  const empeora = raw.match(/^Empeora: incumplimiento ultimos 90 dias \+?(-?[\d.]+) pp/);
  if (empeora) {
    return {
      frase: `Está empeorando: en los últimos 90 días incumple ${nf(parseFloat(empeora[1]), 1)} puntos porcentuales más que en los 90 días anteriores.`,
      aclaraciones: [],
      tecnico: raw,
    };
  }
  const noRegistra = raw.match(/^NO REGISTRA en el sistema \(([\d.]+)% con hora de llegada\)/);
  if (noRegistra) {
    return {
      frase: `No registra la hora de llegada en el sistema: solo ${cada100(parseFloat(noRegistra[1]))} de cada 100 servicios la tienen.`,
      aclaraciones: [],
      tecnico: raw,
    };
  }
  if (raw.startsWith("Datos insuficientes")) {
    return { frase: "Tiene pocos servicios para evaluarlo con confianza.", aclaraciones: [], tecnico: raw };
  }
  return { frase: acentuar(raw), aclaraciones: [], tecnico: raw };
}

/* compacto: una frase por motivo (tabla). detallado: con aclaraciones debajo (ventana de detalle). */
function MotivosLista({ texto, detallado = false }: { texto: string | null; detallado?: boolean }) {
  const motivos = separarMotivos(texto).map(explicarMotivo);
  if (motivos.length === 0) return <span>Sin diferencias importantes.</span>;
  return (
    <ul className={detallado ? "list-disc pl-5 flex flex-col gap-2" : "flex flex-col gap-1"}>
      {motivos.map((m, i) => (
        <li key={i} className={detallado ? "" : "list-none"}>
          {m.frase}
          {detallado && m.aclaraciones.length > 0 && (
            <span className="block text-on-surface-variant text-[12.5px]">{m.aclaraciones.join(" · ")}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ---- Piezas visuales (mismo estilo que las tarjetas de Métricas de Trackeo) ---- */
function Caja({
  titulo,
  valor,
  explicacion,
  badge,
  badgeTone = "text-[#b5610a] bg-[#f59e0b]/10",
  tip,
  valorTone = "text-on-surface",
}: {
  titulo: string;
  valor: string;
  explicacion?: string;
  badge?: string;
  badgeTone?: string;
  tip?: Tooltip;
  valorTone?: string;
}) {
  return (
    <div className="flex flex-col gap-1 bg-surface-container-low rounded-lg p-sm">
      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide flex items-center gap-1">
        {titulo}
        {tip && <InfoTip {...tip} />}
      </span>
      <span className={`font-headline-sm text-headline-sm ${valorTone}`}>{valor}</span>
      {badge && <span className={`font-label-md text-label-md rounded-full px-2 py-0.5 w-fit uppercase tracking-wide ${badgeTone}`}>{badge}</span>}
      {explicacion && <span className="font-label-sm text-label-sm text-on-surface-variant">{explicacion}</span>}
    </div>
  );
}

function Tarjeta({
  icono,
  titulo,
  tip,
  children,
  resumen,
}: {
  icono: string;
  titulo: string;
  tip?: Tooltip;
  children: ReactNode;
  resumen?: ReactNode;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col gap-sm p-md">
      <header className="flex items-center gap-3">
        <Icon name={icono} className="text-primary" />
        <h4 className="font-title-lg text-title-lg text-on-surface flex items-center gap-1">
          {titulo}
          {tip && <InfoTip {...tip} />}
        </h4>
      </header>
      {children}
      {resumen && (
        <div className="flex items-center gap-2 bg-primary-container/50 rounded-lg px-sm py-2">
          <Icon name="auto_awesome" className="text-primary text-[18px] shrink-0" />
          <span className="font-body-md text-body-md text-on-surface">{resumen}</span>
        </div>
      )}
    </div>
  );
}

/* Barras simples con la prioridad de cada semana (historial del prestador). */
function MiniHistorial({ historial }: { historial: AuditoriaHistorial[] }) {
  const max = Math.max(10, ...historial.map((h) => h.prioridad ?? 0));
  const W = 28;
  const H = 70;
  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(historial.length * W + 10, 120)} height={H + 28} role="img" aria-label="Urgencia por semana">
        {historial.map((h, i) => {
          const v = h.prioridad ?? 0;
          const alto = Math.max(1, (v / max) * H);
          const color = h.alerta === CANDIDATO ? "#ba1a1a" : h.alerta === OBSERVACION ? "#f59e0b" : "#8a8f98";
          const estado = h.alerta === CANDIDATO ? "para auditar con prioridad" : h.alerta === OBSERVACION ? "para seguir de cerca" : "sin problemas";
          return (
            <g key={h.clave_semana} transform={`translate(${5 + i * W},0)`}>
              <title>{`Semana ${h.clave_semana}: urgencia ${nf(h.prioridad, 1)} — ${estado}`}</title>
              <rect x={3} y={H - alto} width={W - 8} height={alto} fill={color} rx={2} />
              <text x={W / 2 - 1} y={H + 12} fontSize={9} textAnchor="middle" fill="currentColor">
                {h.clave_semana.slice(-3)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* Estado de un indicador en palabras (a partir de las mismas reglas que usa el motor). */
function estadoIndicador(z: number | null, diff: number | null, efectoMin: number, informativo = false) {
  if (z != null && diff != null && z >= 3 && diff >= efectoMin)
    return { texto: informativo ? "Dato informativo" : "Se aparta mucho de lo normal", tone: "text-error bg-error/10", activa: true };
  if (z != null && diff != null && z >= Z_MIN && diff >= efectoMin)
    return { texto: informativo ? "Dato informativo" : "Se aparta de lo normal", tone: "text-[#b5610a] bg-[#f59e0b]/10", activa: true };
  if (z != null && diff != null && z <= -Z_MIN && diff <= -efectoMin)
    return { texto: "Mejor que lo normal", tone: "text-tertiary bg-tertiary/10", activa: false };
  return { texto: "Dentro de lo normal", tone: "text-on-surface-variant bg-surface-container-highest", activa: false };
}

function Detalle({ r, run, onClose }: { r: AuditoriaResultado; run: AuditoriaCorrida | null; onClose: () => void }) {
  const [ev, setEv] = useState<AuditoriaEvidencia[] | null>(null);
  const [hist, setHist] = useState<AuditoriaHistorial[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setEv(null);
    setErr(null);
    api
      .auditoriaPrestador(r.prestador_id, run?.run_id)
      .then((d) => {
        if (!vivo) return;
        setEv(d.evidencia);
        setHist(d.historial);
      })
      .catch((e: unknown) => vivo && setErr(e instanceof Error ? e.message : "No se pudo cargar el detalle."));
    return () => {
      vivo = false;
    };
  }, [r.prestador_id, run?.run_id]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const sit = situacion(r);
  const motivos = separarMotivos(r.motivos);
  const grupos = useMemo(() => {
    const m = new Map<string, AuditoriaEvidencia[]>();
    (ev || []).forEach((e) => m.set(e.tipo_evidencia, [...(m.get(e.tipo_evidencia) || []), e]));
    return [...m.entries()];
  }, [ev]);
  const registra = r.segmento === "Registra";
  const pctHora = mnum(r, "pct_hora_llego");

  const comp: [string, string, Tooltip][] = [
    ["Llegaron tarde", "tarde_comprobado%", TIPS.tardeComprobado],
    ["No registran la hora de llegada", "sin_hora_llegada%", TIPS.sinHoraLlegada],
    ["No tienen demora prometida cargada", "sin_demora_prometida%", TIPS.sinDemoraPrometida],
    ["Tienen la llegada cargada a destiempo", "carga_tardia_extremo%", TIPS.cargaRetroactiva],
  ];
  const tendInc = mnum(r, "incumple_tend_pp");
  const tendComp = mnum(r, "incompleto_tend_pp");
  const frasesTendencia = (v: number | null, que: string) => {
    if (v == null) return null;
    if (v >= 5) return { icono: "trending_up", tone: "text-error", texto: `Está empeorando: ${que} ${nf(v, 1)} puntos porcentuales más que en los 90 días anteriores.` };
    if (v <= -5) return { icono: "trending_down", tone: "text-tertiary", texto: `Está mejorando: ${que} ${nf(Math.abs(v), 1)} puntos porcentuales menos que en los 90 días anteriores.` };
    return { icono: "trending_flat", tone: "text-on-surface-variant", texto: `Se mantiene parecido a los 90 días anteriores (${signed(v)} puntos porcentuales).` };
  };
  const evolInc = frasesTendencia(tendInc, "incumple");
  const evolComp = frasesTendencia(tendComp, "carga datos incompletos en");
  const semanasAuditar = hist.filter((h) => h.alerta === CANDIDATO).length;
  const semanasSeguir = hist.filter((h) => h.alerta === OBSERVACION).length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto p-md" onClick={onClose}>
      <div
        className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 w-full max-w-5xl my-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="p-md flex items-start justify-between gap-md border-b border-outline-variant/20">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-space-sm flex-wrap">
              <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">{r.prestador || "Sin nombre"}</h3>
              <span className={`font-label-caps text-label-caps rounded-md px-2.5 py-0.5 uppercase font-bold ${sit.tone}`}>{sit.label}</span>
            </div>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {registra ? "Registra la llegada de sus servicios" : "No registra la llegada de sus servicios"}
              {pctHora != null && ` (${cada100(pctHora)} de cada 100 tienen hora de llegada)`} · Volumen {NIVEL_TEXTO[r.nivel || ""] || "—"}{" "}
              <InfoTip {...TIPS.colNivel} /> · {nf(r.servicios)} servicios, {nf(r.cerrados)} terminados
              {r.prioridad != null && (
                <>
                  {" "}
                  · Urgencia {nf(r.prioridad, 1)} de 100 <InfoTip {...TIPS.prioridad} />
                </>
              )}
              {mnum(r, "impacto_servicios") != null && mnum(r, "impacto_servicios")! > 0 && (
                <>
                  {" "}
                  · {nf(mnum(r, "impacto_servicios"))} servicios de más{aspectoImpacto(r) ? ` ${aspectoImpacto(r)}` : ""} <InfoTip {...TIPS.colImpacto} />
                </>
              )}{" "}
              · Confianza del resultado: {r.confianza || "—"} <InfoTip {...TIPS.confianza} />
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-surface-container-low hover:bg-surface-variant flex items-center justify-center shrink-0"
            aria-label="Cerrar"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        <div className="p-md flex flex-col gap-lg">
          <Tarjeta
            icono="summarize"
            titulo="En pocas palabras"
            tip={TIPS.motivos}
            resumen="Es un insumo para auditar, no una sanción: la decisión la toma una persona después de revisar los servicios de ejemplo de más abajo."
          >
            {motivos.length > 0 ? (
              <div className="flex flex-col gap-1 font-body-md text-body-md text-on-surface">
                <span>
                  {sit.rank >= 2
                    ? `Quedó en “${sit.label.toLowerCase()}” por estos motivos:`
                    : "Esto es lo que se observa en este prestador:"}
                </span>
                <MotivosLista texto={r.motivos} detallado />
              </div>
            ) : (
              <p className="font-body-md text-body-md text-on-surface">
                {registra
                  ? "No se aparta de forma importante de lo normal en servicios parecidos. Ningún aspecto medido muestra una diferencia significativa."
                  : "Casi no registra la hora de llegada de sus servicios, por lo que no se le puede medir la demora. El problema de fondo es que no usa el sistema."}
              </p>
            )}
            {r.informativo && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                <b>Dato informativo (no suma a la urgencia):</b> {acentuar(r.informativo)}
              </p>
            )}
          </Tarjeta>

          <Tarjeta icono="compare_arrows" titulo="Comparado con otros prestadores" tip={TIPS.indicadores}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {INDICADORES.filter((i) => mnum(r, `${i.clave}_obs%`) != null).map((i) => {
                const obs = mnum(r, `${i.clave}_obs%`);
                const esp = mnum(r, `${i.clave}_esp%`);
                const est = estadoIndicador(mnum(r, `${i.clave}_z_adj`), mnum(r, `${i.clave}_diff_pp`), i.efectoMin, i.informativo);
                return (
                  <Caja
                    key={i.clave}
                    titulo={i.titulo}
                    valor={`${cada100(obs)} de cada 100`}
                    badge={est.texto}
                    badgeTone={est.tone}
                    explicacion={`${i.problema}. Lo normal en servicios parecidos: ${cada100(esp)} de cada 100 (sobre ${nf(mnum(r, `${i.clave}_n`))} servicios).`}
                  />
                );
              })}
            </div>
            <details className="rounded-lg bg-surface-container-low p-sm font-body-sm text-body-sm text-on-surface-variant">
              <summary className="cursor-pointer font-semibold text-on-surface">
                <span className="inline-flex items-center gap-1.5">
                  Ver detalle técnico
                  <InfoTip {...TIPS.tecnico} />
                </span>
              </summary>
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-body-md font-body-md whitespace-nowrap">
                  <thead>
                    <tr className="bg-surface-container-lowest font-label-caps text-label-caps text-on-surface-variant uppercase text-left">
                      <th className="py-2 px-2">Indicador</th>
                      {(
                        [
                          ["Casos", TIPS.colCasos],
                          ["Observado", TIPS.colObservado],
                          ["Esperado", TIPS.colEsperado],
                          ["Diferencia", TIPS.colDiferencia],
                          ["z ajustado", TIPS.colZ],
                        ] as [string, Tooltip][]
                      ).map(([nombre, tip]) => (
                        <th key={nombre} className="py-2 px-2 text-right">
                          <span className="inline-flex items-center gap-1 justify-end">
                            {nombre}
                            <InfoTip {...tip} />
                          </span>
                        </th>
                      ))}
                      <th className="py-2 px-2">
                        <span className="inline-flex items-center gap-1">
                          Señal
                          <InfoTip {...TIPS.colSenal} />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {INDICADORES.filter((i) => mnum(r, `${i.clave}_obs%`) != null).map((i) => {
                      const diff = mnum(r, `${i.clave}_diff_pp`);
                      const z = mnum(r, `${i.clave}_z_adj`);
                      const activa = z != null && diff != null && z >= Z_MIN && diff >= i.efectoMin;
                      return (
                        <tr key={i.clave} className="border-t border-outline-variant/20">
                          <td className="py-2 px-2 text-on-surface">{i.titulo}</td>
                          <td className="py-2 px-2 text-right">{nf(mnum(r, `${i.clave}_n`))}</td>
                          <td className="py-2 px-2 text-right">{pp(mnum(r, `${i.clave}_obs%`))}</td>
                          <td className="py-2 px-2 text-right">{pp(mnum(r, `${i.clave}_esp%`))}</td>
                          <td className={`py-2 px-2 text-right ${activa ? "text-error font-semibold" : ""}`}>{signed(diff)} pp</td>
                          <td className="py-2 px-2 text-right">{signed(z)}</td>
                          <td className="py-2 px-2">{activa ? (i.informativo ? "Informativo" : "Activa") : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </Tarjeta>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <Tarjeta
              icono="rule"
              titulo="Qué pasa con los servicios terminados"
              tip={TIPS.composicion}
              resumen={
                mnum(r, "tarde_comprobado%") != null
                  ? `De cada 100 servicios terminados de este prestador: ${cada100(mnum(r, "tarde_comprobado%"))} llegaron tarde, ${cada100(mnum(r, "sin_hora_llegada%"))} no tienen hora de llegada (carga de datos) y ${cada100(mnum(r, "carga_tardia_extremo%"))} tienen la llegada cargada a destiempo.`
                  : undefined
              }
            >
              <ul className="flex flex-col gap-1.5 font-body-md text-body-md text-on-surface">
                {comp.map(([label, k, tip]) => (
                  <li key={k} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <InfoTip {...tip} />
                    </span>
                    <span className="font-semibold">{mnum(r, k) == null ? "—" : `${cada100(mnum(r, k))} de cada 100`}</span>
                  </li>
                ))}
              </ul>
              {(mnum(r, "extremos_cerrados_fin_de_mes%") != null || mnum(r, "extremos_llegada_y_cierre_juntos%") != null) && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  De sus llegadas cargadas a destiempo: {cada100(mnum(r, "extremos_cerrados_fin_de_mes%"))} de cada 100 se cerraron en los últimos 3 días del mes y{" "}
                  {cada100(mnum(r, "extremos_llegada_y_cierre_juntos%"))} de cada 100 tienen la llegada y el cierre cargados juntos.
                </p>
              )}
            </Tarjeta>

            <Tarjeta icono="timeline" titulo="Cómo viene evolucionando" tip={TIPS.tendencia}>
              {[evolInc, evolComp].filter(Boolean).length === 0 && (
                <p className="font-body-md text-body-md text-on-surface-variant">Todavía no hay suficientes datos para comparar los últimos 90 días con los anteriores.</p>
              )}
              {[evolInc, evolComp].map(
                (e, i) =>
                  e && (
                    <p key={i} className="flex items-start gap-2 font-body-md text-body-md text-on-surface">
                      <Icon name={e.icono} className={`${e.tone} text-[20px] shrink-0`} />
                      {e.texto}
                    </p>
                  ),
              )}
              <h5 className="font-label-caps text-label-caps text-on-surface-variant uppercase flex items-center gap-1 pt-1">
                Semana a semana
                <InfoTip {...TIPS.historial} />
              </h5>
              {hist.length > 0 ? (
                <>
                  <MiniHistorial historial={hist} />
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    En las últimas {plural(hist.length, "semana", "semanas")} estuvo {semanasAuditar} {semanasAuditar === 1 ? "vez" : "veces"} para auditar con prioridad y {semanasSeguir}{" "}
                    {semanasSeguir === 1 ? "vez" : "veces"} para seguir de cerca.
                  </span>
                </>
              ) : (
                <span className="font-body-sm text-body-sm text-on-surface-variant">Todavía no hay historial.</span>
              )}
            </Tarjeta>
          </section>

          <Tarjeta icono="manage_search" titulo="Servicios de ejemplo para revisar" tip={TIPS.evidencia}>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Estos son casos reales de este prestador. Conviene revisarlos uno por uno antes de decidir.
            </p>
            {err && <p className="font-body-md text-body-md text-error">{err}</p>}
            {!err && ev == null && <p className="font-body-md text-body-md text-on-surface-variant">Cargando…</p>}
            {!err && ev != null && grupos.length === 0 && (
              <p className="font-body-md text-body-md text-on-surface-variant">
                No hay servicios de ejemplo guardados para este prestador (solo se guardan para los que tienen alguna diferencia importante).
              </p>
            )}
            {grupos.map(([tipo, filas]) => {
              const nombre = TITULO_EVIDENCIA[tipo];
              return (
                <div key={tipo} className="flex flex-col gap-1">
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase flex items-center gap-1">
                    {nombre?.titulo ?? tipo} ({filas.length})
                    {nombre && <InfoTip titulo={nombre.titulo} leer={nombre.leer} />}
                  </span>
                  <div className="overflow-x-auto max-h-72 overflow-y-auto border border-outline-variant/20 rounded-lg">
                    <table className="w-full text-body-sm font-body-sm whitespace-nowrap">
                      <thead className="sticky top-0">
                        <tr className="bg-surface-container-low font-label-caps text-label-caps text-on-surface-variant uppercase text-left">
                          <th className="py-1.5 px-2">Servicio</th>
                          <th className="py-1.5 px-2">Orden</th>
                          <th className="py-1.5 px-2">Campaña</th>
                          <th className="py-1.5 px-2">Tipo de servicio</th>
                          <th className="py-1.5 px-2">Se dio de alta</th>
                          <th className="py-1.5 px-2">Llegó</th>
                          <th className="py-1.5 px-2">Terminó</th>
                          <th className="py-1.5 px-2 text-right">Demora prometida</th>
                          <th className="py-1.5 px-2 text-right">Demora real</th>
                          <th className="py-1.5 px-2">
                            <span className="inline-flex items-center gap-1">
                              Cerrado a fin de mes
                              <InfoTip {...TIPS.colCierreMes} />
                            </span>
                          </th>
                          <th className="py-1.5 px-2">
                            <span className="inline-flex items-center gap-1">
                              Llegada y cierre juntos
                              <InfoTip {...TIPS.colJuntos} />
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((e, i) => (
                          <tr key={`${e.id_servicio_prestado}-${i}`} className="border-t border-outline-variant/20">
                            <td className="py-1.5 px-2">{e.id_servicio_prestado ?? "—"}</td>
                            <td className="py-1.5 px-2">{e.id_orden_de_servicio ?? "—"}</td>
                            <td className="py-1.5 px-2">{String(e.datos?.campana ?? "—")}</td>
                            <td className="py-1.5 px-2">{String(e.datos?.tipo_de_servicio ?? "—")}</td>
                            <td className="py-1.5 px-2">{fechaHora(e.datos?.alta)}</td>
                            <td className="py-1.5 px-2">{fechaHora(e.datos?.llegada)}</td>
                            <td className="py-1.5 px-2">{fechaHora(e.datos?.finalizacion)}</td>
                            <td className="py-1.5 px-2 text-right">{minutos(e.datos?.demora_prometida)}</td>
                            <td className="py-1.5 px-2 text-right">{minutos(e.datos?.demora_real)}</td>
                            <td className="py-1.5 px-2">{e.datos?.cierre_ultimos_3_dias_del_mes === "Si" ? "Sí" : e.datos?.cierre_ultimos_3_dias_del_mes === "No" ? "No" : "—"}</td>
                            <td className="py-1.5 px-2">{e.datos?.llegada_y_cierre_juntos === "Si" ? "Sí" : e.datos?.llegada_y_cierre_juntos === "No" ? "No" : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}

/* Regla de Pareto sobre el "servicios de más": se ordena TODA la corrida (sin filtros) de mayor a menor impacto y se
   acumula. A = hasta el 80 % del total (incluye al prestador que lo cruza); B = hasta el 95 %; C = el resto. */
type ParetoInfo = { acumulado: number; grupo: "A" | "B" | "C"; posicion: number };
function calcularPareto(resultados: AuditoriaResultado[]): { mapa: Map<string, ParetoInfo>; total: number; conImpacto: number; nA: number } {
  const lista = resultados
    .map((r) => ({ id: r.prestador_id, v: mnum(r, "impacto_servicios") ?? 0 }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
  const total = lista.reduce((t, x) => t + x.v, 0);
  const mapa = new Map<string, ParetoInfo>();
  let acum = 0;
  let nA = 0;
  lista.forEach((x, i) => {
    const antes = total > 0 ? acum / total : 0;
    acum += x.v;
    const grupo = antes < 0.8 ? "A" : antes < 0.95 ? "B" : "C";
    if (grupo === "A") nA += 1;
    mapa.set(x.id, { acumulado: total > 0 ? (100 * acum) / total : 0, grupo, posicion: i + 1 });
  });
  return { mapa, total, conImpacto: lista.length, nA };
}

type SortKey = "prestador" | "servicios" | "cerrados" | "prioridad" | "impacto" | "alerta" | "nivel";

function descargarCsv(filas: AuditoriaResultado[], clave: string, pareto: ReturnType<typeof calcularPareto>) {
  const cols: [string, (r: AuditoriaResultado) => unknown][] = [
    ["Prestador", (r) => r.prestador],
    ["Segmento", (r) => r.segmento],
    ["Nivel", (r) => r.nivel],
    ["Servicios", (r) => r.servicios],
    ["Cerrados", (r) => r.cerrados],
    ["Prioridad", (r) => r.prioridad],
    ["Servicios por encima de lo normal", (r) => mnum(r, "impacto_servicios")],
    ["Aspecto del impacto", (r) => aspectoImpacto(r)],
    ["Acumulado del total de servicios de mas (%)", (r) => { const p = pareto.mapa.get(r.prestador_id); return p ? Math.round(p.acumulado * 10) / 10 : null; }],
    ["Grupo Pareto (A=80%)", (r) => pareto.mapa.get(r.prestador_id)?.grupo ?? null],
    ["Situacion", (r) => situacion(r).label],
    ["Confianza", (r) => r.confianza],
    ["% tarde comprobado", (r) => mnum(r, "tarde_comprobado%")],
    ["% sin hora de llegada", (r) => mnum(r, "sin_hora_llegada%")],
    ["% carga retroactiva", (r) => mnum(r, "carga_tardia_extremo%")],
    ["% incumple total", (r) => mnum(r, "incumple_total%")],
    ["% incumple esperado", (r) => mnum(r, "incumple_esp%")],
    ["% registro incompleto", (r) => mnum(r, "incompleto_obs%")],
    ["Motivos", (r) => separarMotivos(r.motivos).map((m) => explicarMotivo(m).frase).join(" | ")],
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const texto = [cols.map((c) => c[0]).join(";"), ...filas.map((r) => cols.map((c) => esc(c[1](r))).join(";"))].join("\r\n");
  const blob = new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `auditoria-prestadores-${clave}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditoriaPanel({ buscarInicial = "" }: { buscarInicial?: string }) {
  const [corridas, setCorridas] = useState<AuditoriaCorridaResumen[]>([]);
  const [runId, setRunId] = useState("");
  const [data, setData] = useState<{ corrida: AuditoriaCorrida | null; resultados: AuditoriaResultado[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(buscarInicial);
  const [fAlerta, setFAlerta] = useState<"todas" | "auditar" | "seguir" | "ok">("todas");
  const [fSegmento, setFSegmento] = useState<"Registra" | "Sin trazabilidad" | "todos">(buscarInicial ? "todos" : "Registra");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "prioridad", dir: "desc" });
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<AuditoriaResultado | null>(null);

  useEffect(() => {
    api
      .auditoriaCorridas()
      .then((d) => setCorridas(d.corridas))
      .catch(() => undefined); // si falla, igual se muestra la ultima corrida
  }, []);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError(null);
    api
      .auditoriaResultados(runId || undefined)
      .then((d) => vivo && setData(d))
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar la auditoría."))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [runId]);

  const filas = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = (data?.resultados || []).filter((r) => {
      if (fSegmento !== "todos" && r.segmento !== fSegmento) return false;
      if (q && !(r.prestador || "").toLowerCase().includes(q)) return false;
      const clave = situacion(r).clave;
      if (fAlerta === "auditar") return clave === "auditar";
      if (fAlerta === "seguir") return clave === "seguir";
      if (fAlerta === "ok") return clave === "ok";
      return true;
    });
    const val = (r: AuditoriaResultado): string | number | null => {
      switch (sort.key) {
        case "prestador":
          return (r.prestador || "").toLowerCase();
        case "alerta":
          return situacion(r).rank;
        case "nivel":
          return r.nivel;
        case "impacto":
          return mnum(r, "impacto_servicios");
        default:
          return r[sort.key];
      }
    };
    return [...arr].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es");
      return sort.dir === "asc" ? c : -c;
    });
  }, [data, search, fAlerta, fSegmento, sort]);
  const pareto = useMemo(() => calcularPareto(data?.resultados ?? []), [data]);

  const corrida = data?.corrida || null;
  const resumen = corrida?.conteos?.resumen || {};
  const alertas = corrida?.conteos?.alertas_registran || {};
  const totalPaginas = Math.max(1, Math.ceil(filas.length / PAGE_SIZE));
  const visibles = filas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const th = (key: SortKey, label: string, tip: Tooltip, right = false) => (
    <th className={`py-2 pr-3 ${right ? "text-right" : ""}`}>
      <div className={`flex items-center gap-1 ${right ? "justify-end" : ""}`}>
        <button
          type="button"
          className="uppercase hover:text-on-surface flex items-center gap-1"
          onClick={() => {
            setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
            setPage(1);
          }}
        >
          {label}
          {sort.key === key && <Icon name={sort.dir === "desc" ? "arrow_downward" : "arrow_upward"} className="text-[14px]" />}
        </button>
        <InfoTip {...tip} />
      </div>
    </th>
  );
  const v90 = resumen.incumple_total_90d;
  const vPrev = resumen.incumple_total_previo_90d;

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-xl">
        <Icon name="progress_activity" className="animate-spin text-[28px] text-primary" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-xl px-md py-sm">
        <Icon name="warning" filled className="text-[#f59e0b] text-[20px] mt-0.5 shrink-0" />
        <p className="font-body-md text-body-md text-on-surface">{error}</p>
      </div>
    );
  }
  if (!corrida) {
    return (
      <p className="font-body-md text-body-md text-on-surface-variant text-center py-xl">
        Todavía no hay ningún análisis guardado. El análisis corre automáticamente los lunes; también se puede ejecutar a mano desde GitHub Actions.
      </p>
    );
  }

  const nAuditar = alertas[CANDIDATO] ?? 0;
  const nSeguir = alertas[OBSERVACION] ?? 0;
  const nSinProblemas = alertas["Sin alerta"] ?? 0;
  const nRegistran = resumen.prestadores_registran ?? 0;
  const nSinRegistro = resumen.prestadores_sin_trazabilidad ?? 0;
  const diff90 = v90 != null && vPrev != null ? v90 - vPrev : null;
  const tendenciaRed =
    diff90 == null
      ? null
      : diff90 >= 1
        ? { texto: `Empeoró ${nf(diff90, 1)} puntos`, tone: "text-error bg-error/10", frase: `empeoró ${nf(diff90, 1)} puntos porcentuales respecto de los 90 días anteriores` }
        : diff90 <= -1
          ? { texto: `Mejoró ${nf(Math.abs(diff90), 1)} puntos`, tone: "text-tertiary bg-tertiary/10", frase: `mejoró ${nf(Math.abs(diff90), 1)} puntos porcentuales respecto de los 90 días anteriores` }
          : { texto: "Sin cambios", tone: "text-on-surface-variant bg-surface-container-highest", frase: "se mantiene parecida a la de los 90 días anteriores" };

  return (
    <div className="flex flex-col gap-lg">
      <section className="flex flex-col gap-space-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex flex-col">
            <h3 className="font-headline-md text-headline-md text-on-surface font-semibold flex items-center gap-1.5">
              Auditoría de prestadores
              <InfoTip {...TIPS.pantalla} />
            </h3>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Resultado de la semana {corrida.clave_semana} · con datos del {soloFecha(corrida.periodo_desde)} al {soloFecha(corrida.periodo_hasta)} · calculado el{" "}
              {fechaHora(corrida.ejecutada_at)}
            </span>
          </div>
          <label className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
            Semana
            <InfoTip {...TIPS.corrida} />
            <select
              className="form-input-styled font-body-md text-body-md text-on-surface h-8 py-0"
              value={runId || corrida.run_id}
              onChange={(e) => {
                setRunId(e.target.value);
                setPage(1);
              }}
            >
              {corridas.map((c) => (
                <option key={c.run_id} value={c.run_id}>
                  {c.clave_semana} ({soloFecha(c.ejecutada_at)})
                </option>
              ))}
              {corridas.length === 0 && <option value={corrida.run_id}>{corrida.clave_semana}</option>}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-md">
          <Tarjeta
            icono="fact_check"
            titulo="A quién conviene mirar primero"
            resumen={`Esta semana hay ${plural(nAuditar, "prestador", "prestadores")} para auditar con prioridad y ${plural(nSeguir, "prestador", "prestadores")} para seguir de cerca, entre los ${nf(nRegistran)} que registran la llegada de sus servicios. ${
              nSinRegistro > 0 ? `Otros ${plural(nSinRegistro, "prestador", "prestadores")} no registran la llegada, así que no se los puede medir.` : ""
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Caja
                titulo="Para auditar con prioridad"
                valor={`${nf(nAuditar)} ${nAuditar === 1 ? "prestador" : "prestadores"}`}
                valorTone={nAuditar > 0 ? "text-error" : "text-on-surface"}
                explicacion="Se apartan mucho de lo normal y tienen suficientes servicios como para que no sea casualidad."
                tip={TIPS.candidatos}
              />
              <Caja
                titulo="Para seguir de cerca"
                valor={`${nf(nSeguir)} ${nSeguir === 1 ? "prestador" : "prestadores"}`}
                valorTone={nSeguir > 0 ? "text-[#b5610a]" : "text-on-surface"}
                explicacion="Tienen alguna diferencia importante, pero menos marcada."
                tip={TIPS.observacion}
              />
              <Caja
                titulo="Sin problemas"
                valor={`${nf(nSinProblemas)} ${nSinProblemas === 1 ? "prestador" : "prestadores"}`}
                explicacion={`Dentro de lo normal, de ${nf(nRegistran)} que registran la llegada.`}
                tip={TIPS.sinAlerta}
              />
              <Caja
                titulo="No registran la llegada"
                valor={`${nf(nSinRegistro)} ${nSinRegistro === 1 ? "prestador" : "prestadores"}`}
                explicacion={`No se les puede medir la demora (${nf(resumen.servicios_sin_trazabilidad ?? undefined)} servicios).`}
                tip={TIPS.sinTrazabilidad}
              />
            </div>
          </Tarjeta>

          <Tarjeta
            icono="directions_car"
            titulo="Cómo está la red de prestadores"
            resumen={`De cada 100 servicios terminados de los prestadores que registran, ${cada100(resumen.pct_cumple)} se cumplieron como se prometió.${
              tendenciaRed ? ` En los últimos 90 días la situación ${tendenciaRed.frase}.` : ""
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Caja
                titulo="Cumplen lo prometido"
                valor={`${cada100(resumen.pct_cumple)} de cada 100`}
                explicacion="De los servicios con hora de llegada registrada, los que llegaron a tiempo."
                tip={TIPS.cumplen}
              />
              <Caja
                titulo="Llegan tarde"
                valor={`${cada100(resumen.pct_tarde_comprobado)} de cada 100`}
                explicacion="De los servicios con hora de llegada registrada, los que llegaron después de lo prometido."
                tip={TIPS.tardeComprobado}
              />
              <Caja
                titulo="No registran la llegada"
                valor={`${cada100(resumen.pct_sin_hora_llegada)} de cada 100`}
                explicacion="Problema de carga de datos: no cuenta como demora, pero se penaliza aparte."
                tip={TIPS.sinHoraLlegada}
              />
              <Caja
                titulo="Cargan la llegada a destiempo"
                valor={`${cada100(resumen.pct_carga_retroactiva)} de cada 100`}
                explicacion="La llegada se cargó mucho después de que ocurrió."
                tip={TIPS.cargaRetroactiva}
              />
              <Caja
                titulo="Llegan tarde en los últimos 90 días"
                valor={`${cada100(v90)} de cada 100`}
                badge={tendenciaRed?.texto}
                badgeTone={tendenciaRed?.tone}
                explicacion={vPrev != null ? `En los 90 días anteriores eran ${cada100(vPrev)} de cada 100.` : undefined}
                tip={TIPS.incumple90}
              />
            </div>
          </Tarjeta>
        </div>

        <details className="rounded-xl bg-surface-container-low p-space-md font-body-md text-body-md text-on-surface-variant">
          <summary className="cursor-pointer font-semibold text-on-surface">
            <span className="inline-flex items-center gap-1.5">
              Cómo leer esta pantalla
              <InfoTip {...TIPS.comoLeer} />
            </span>
          </summary>
          <div className="pt-2 flex flex-col gap-1">
            <p>
              Cada semana se compara a cada prestador con los demás en servicios parecidos (misma campaña y mismo tipo de servicio). Si un prestador se
              aparta mucho de lo normal, y no es por casualidad, queda marcado.
            </p>
            <p>
              <b>Para auditar con prioridad</b>: se aparta mucho de lo normal y tiene al menos 300 servicios terminados. <b>Para seguir de cerca</b>: se aparta
              de lo normal, pero menos o con menos servicios. <b>Urgencia</b>: un puntaje de 0 a 100 que ordena la lista; no es un porcentaje.
            </p>
            <p>
              <b>No registran la llegada</b>: prestadores que casi no cargan la hora de llegada; no se les puede medir la demora, por eso se listan aparte. Los
              servicios programados no se incluyen. Nada de esto es una sanción automática: hay que revisar los servicios de cada caso.
            </p>
          </div>
        </details>
      </section>

      <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col">
        <div className="p-md flex flex-col gap-space-md">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm">
            <div className="flex items-center gap-space-xs">
              <Icon name="format_list_numbered" className="text-primary text-[22px]" />
              <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">Prestadores, del más al menos urgente</h3>
              <InfoTip {...TIPS.priorizados} />
              <span className="font-label-code text-label-code text-on-surface-variant">({nf(filas.length)})</span>
            </div>
            <div className="flex items-center gap-space-sm flex-wrap">
              <div className="relative w-full sm:w-72">
                <Icon name="search" className="absolute left-3 top-2.5 text-[18px] text-on-surface-variant" />
                <input
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface placeholder:text-on-surface-variant font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-lowest focus:shadow-sm transition-all"
                  placeholder="Buscar por prestador…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <button
                type="button"
                className="flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-primary-container text-on-primary hover:bg-primary transition-all font-body-sm text-body-sm font-medium shadow-sm"
                onClick={() => descargarCsv(filas, corrida.clave_semana, pareto)}
              >
                <Icon name="download" className="text-[17px]" />
                Descargar CSV
              </button>
            </div>
          </div>
          <div className="flex items-center gap-space-md flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-container-low font-body-sm text-body-sm flex-wrap">
              {(
                [
                  ["todas", "Todos"],
                  ["auditar", "Para auditar"],
                  ["seguir", "Para seguir de cerca"],
                  ["ok", "Sin problemas"],
                ] as ["todas" | "auditar" | "seguir" | "ok", string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setFAlerta(k);
                    setPage(1);
                  }}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    fAlerta === k ? "bg-surface-container-lowest text-on-surface font-medium shadow-xs" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {label}
                </button>
              ))}
              <span className="pr-2">
                <InfoTip {...TIPS.filtroAlerta} />
              </span>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-container-low font-body-sm text-body-sm flex-wrap">
              {(
                [
                  ["Registra", "Registran la llegada"],
                  ["Sin trazabilidad", "No registran la llegada"],
                  ["todos", "Todos"],
                ] as ["Registra" | "Sin trazabilidad" | "todos", string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setFSegmento(k);
                    setPage(1);
                  }}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    fSegmento === k ? "bg-surface-container-lowest text-on-surface font-medium shadow-xs" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {label}
                </button>
              ))}
              <span className="pr-2">
                <InfoTip {...TIPS.filtroSegmento} />
              </span>
            </div>
          </div>
        </div>
        {pareto.conImpacto > 0 && (
          <p className="px-md pb-sm font-body-md text-body-md text-on-surface-variant">
            <b className="text-on-surface">{pareto.nA === 1 ? "1 prestador junta" : `${pareto.nA} prestadores juntan`}</b> el 80 % de los{" "}
            {nf(pareto.total)} servicios de más de toda la red (hay {pareto.conImpacto} prestadores con alguna diferencia importante). Son los que tienen el punto rojo en
            “Acumulado”: ahí se concentra el mayor esfuerzo de auditoría.
          </p>
        )}
        <div className="overflow-x-auto p-md pt-0">
          <table className="w-full text-body-md font-body-md whitespace-nowrap">
            <thead>
              <tr className="bg-surface-container-low font-label-caps text-label-caps text-on-surface-variant text-left">
                {th("prestador", "Prestador", TIPS.colPrestador)}
                {th("nivel", "Volumen", TIPS.colNivel)}
                {th("servicios", "Servicios", TIPS.colServicios, true)}
                {th("cerrados", "Terminados", TIPS.colCerrados, true)}
                {th("prioridad", "Urgencia", TIPS.colPrioridad, true)}
                {th("impacto", "Servicios de más", TIPS.colImpacto, true)}
                <th className="py-2 pr-3 uppercase">
                  <span className="flex items-center gap-1 justify-end">
                    Acumulado
                    <InfoTip {...TIPS.colPareto} />
                  </span>
                </th>
                {th("alerta", "Situación", TIPS.colAlerta)}
                <th className="py-2 pr-3 uppercase">
                  <span className="flex items-center gap-1">
                    Por qué
                    <InfoTip {...TIPS.colMotivo} />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => {
                const a = situacion(r);
                const barra = r.prioridad == null ? 0 : Math.min(100, r.prioridad);
                return (
                  <tr
                    key={r.prestador_id}
                    className="border-t border-outline-variant/20 hover:bg-surface-container-low cursor-pointer"
                    onClick={() => setSel(r)}
                  >
                    <td className="py-2 pr-3 font-body-md text-body-md text-on-surface font-medium align-top">{r.prestador || "Sin nombre"}</td>
                    <td className="py-2 pr-3 text-on-surface-variant align-top capitalize">{NIVEL_TEXTO[r.nivel || ""] || "—"}</td>
                    <td className="py-2 pr-3 text-right align-top">{nf(r.servicios)}</td>
                    <td className="py-2 pr-3 text-right align-top">{nf(r.cerrados)}</td>
                    <td className="py-2 pr-3 align-top">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                          <div
                            className={`h-full ${a.clave === "auditar" ? "bg-error" : a.clave === "seguir" ? "bg-[#f59e0b]" : "bg-primary"}`}
                            style={{ width: `${barra}%` }}
                          />
                        </div>
                        <span className="w-10 text-right">{r.prioridad == null ? "—" : nf(r.prioridad, 1)}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right align-top">
                      {mnum(r, "impacto_servicios") == null ? "—" : nf(mnum(r, "impacto_servicios"))}
                      {mnum(r, "impacto_servicios") != null && mnum(r, "impacto_servicios")! > 0 && aspectoImpacto(r) && (
                        <span className="block font-body-sm text-body-sm text-on-surface-variant whitespace-normal">{aspectoImpacto(r)}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right align-top">
                      {(() => {
                        const p = pareto.mapa.get(r.prestador_id);
                        if (!p) return "—";
                        return (
                          <span className="inline-flex items-center justify-end gap-1.5" title={`Puesto ${p.posicion} de ${pareto.conImpacto} por servicios de más · grupo ${p.grupo}`}>
                            <span className={`inline-block w-2 h-2 rounded-full ${p.grupo === "A" ? "bg-error" : p.grupo === "B" ? "bg-[#f59e0b]" : "bg-outline-variant"}`} />
                            {nf(p.acumulado)} %
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-2 pr-3 align-top">
                      <span className={`font-label-caps text-label-caps rounded-md px-2.5 py-0.5 uppercase font-bold whitespace-normal ${a.tone}`}>{a.label}</span>
                    </td>
                    <td className="py-2 pr-3 font-body-sm text-body-sm text-on-surface-variant min-w-[340px] max-w-[480px] whitespace-normal align-top">
                      <MotivosLista texto={r.motivos} />
                    </td>
                  </tr>
                );
              })}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-lg text-center font-body-md text-body-md text-on-surface-variant">
                    No hay prestadores con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-md py-sm border-t border-outline-variant/20 flex-wrap gap-2">
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            {filas.length === 0
              ? "Sin registros"
              : `Mostrando ${nf((page - 1) * PAGE_SIZE + 1)}–${nf(Math.min(page * PAGE_SIZE, filas.length))} de ${nf(filas.length)}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-8 px-sm rounded bg-surface-container-low text-on-surface font-label-md text-label-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-variant transition-colors"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <button
              type="button"
              className="h-8 px-sm rounded bg-primary-container text-on-primary-container font-label-md text-label-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary hover:text-on-primary transition-colors"
              disabled={page >= totalPaginas}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      </section>

      {sel && <Detalle r={sel} run={corrida} onClose={() => setSel(null)} />}
    </div>
  );
}
