import type { MetricViewModel } from "./metricTypes";
import { MINIMO_MEDIBLES, UMBRALES_COBERTURA, UMBRALES_EFECTIVIDAD } from "./indicatorCatalog";

const pct1 = (v: number) => `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(v * 100)} %`;
const nf = (v: number) => new Intl.NumberFormat("es-AR").format(v);

/** Síntesis del periodo con reglas deterministas (sin IA): como máximo 4 frases, en este orden de prioridad:
    1) cobertura crítica, 2) resultado de cumplimiento, 3) asignación, 4) trazabilidad.
    No menciona los servicios programados a propósito (su registro hoy no es confiable y están fuera de la auditoría). */
export function buildExecutiveSummary(metricas: MetricViewModel[], totalServicios: number | null): string[] {
  // Sin datos cargados todavia (la pantalla esta cargando): no hay nada que avisar.
  if (totalServicios == null) return [];
  const porId = Object.fromEntries(metricas.map((m) => [m.id, m]));
  const cumpl = porId["cumplimiento-observado"];
  const cob = porId["cobertura-medicion"];
  const efec = porId["efectividad-asignacion"];
  const traz = porId["trazabilidad-completa"];
  const frases: string[] = [];

  if (cob?.value != null && cob.value < UMBRALES_COBERTURA.baja) {
    frases.push(
      `La cobertura de medición es baja (${pct1(cob.value)}): solo se puede medir la demora de ${
        cob.numerator != null && cob.denominator != null ? `${nf(cob.numerator)} de ${nf(cob.denominator)}` : "una parte de los"
      } servicios, así que el cumplimiento no representa a todo el universo.`,
    );
  }
  if (cumpl?.value != null && (cumpl.denominator ?? 0) >= MINIMO_MEDIBLES) {
    frases.push(`El cumplimiento observado fue del ${pct1(cumpl.value)} sobre ${nf(cumpl.denominator ?? 0)} servicios medibles.`);
  } else if (cumpl) {
    frases.push(`No hay servicios medibles suficientes (menos de ${MINIMO_MEDIBLES}) para dar un cumplimiento confiable.`);
  }
  if (efec?.value != null) {
    if (efec.value < UMBRALES_EFECTIVIDAD.intermedia) frases.push(`La efectividad de asignación es baja (${pct1(efec.value)}) cuando se usa el enviador.`);
    else if (efec.value >= UMBRALES_EFECTIVIDAD.alta) frases.push(`La efectividad de asignación es alta (${pct1(efec.value)}) cuando se usa el enviador.`);
  }
  if (traz?.value != null && traz.value < UMBRALES_COBERTURA.baja) {
    frases.push(`Solo el ${pct1(traz.value)} de los servicios tiene la cadena de eventos completa, lo que limita la medición de tiempos.`);
  }
  if (frases.length === 0 && totalServicios != null) frases.push(`Se analizaron ${nf(totalServicios)} servicios sin alertas de lectura.`);
  return frases.slice(0, 4);
}
