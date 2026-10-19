import type { Trazabilidad, TrackeoSummary, TrackeoUniversos } from "../api";
import { INDICADORES_PRINCIPALES as CAT } from "./indicatorCatalog";
import { estadoCobertura, estadoCumplimiento, estadoEfectividad } from "./metricStatus";
import type { MetricViewModel } from "./metricTypes";

type Entrada = {
  summary: TrackeoSummary | null;
  universes: TrackeoUniversos | null;
  trazabilidad: Trazabilidad | null;
  acciones?: { cumplimiento?: () => void; efectividad?: () => void };
};

const pct1 = (v: number) => `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(v * 100)} %`;
const nf = (v: number) => new Intl.NumberFormat("es-AR").format(v);

/** Los cuatro KPI principales del resumen, solo a partir de datos que la pantalla ya tiene (no pide nada nuevo).
    Un porcentaje sin denominador (sin servicios medibles) es null, nunca 0 %. */
export function buildPrimaryMetrics({ summary, universes, trazabilidad, acciones }: Entrada): MetricViewModel[] {
  const medibles = summary?.servicios_evaluados_demora_trazable ?? 0;
  const consultados = summary?.servicios_consultados ?? 0;
  const universoEvaluable = summary?.universo_evaluable ?? universes?.servicios_evaluables ?? null;
  const coberturaEvaluable = summary?.cobertura_medicion_evaluable ?? null;
  const coberturaUniverso = consultados > 0 ? (summary?.cobertura_medicion_demora ?? null) : null;
  // La cobertura de referencia es la del universo evaluable cuando existe (es la más justa); si no, la del universo filtrado.
  const coberturaRef = coberturaEvaluable ?? coberturaUniverso;

  const cumplimiento = medibles > 0 ? (summary?.cumplimiento_demora_trazable ?? null) : null;
  const estCumpl = estadoCumplimiento(medibles, cumplimiento, coberturaRef);

  const usosEnviador = summary?.enviador_si ?? 0;
  const efectividad = usosEnviador > 0 ? (summary?.efectividad_enviador ?? null) : null;
  const estEfec = estadoEfectividad(efectividad, usosEnviador);

  const totalTraz = trazabilidad?.total ?? null;
  const trazabilidadPct = totalTraz && totalTraz > 0 ? (trazabilidad?.porcentaje_trazabilidad_completa ?? null) : null;
  const estTraz = estadoCobertura(trazabilidadPct, { baja: "Baja", parcial: "Parcial", ok: "Completa" });

  const estCob = estadoCobertura(coberturaRef);
  const detalleCobertura =
    coberturaEvaluable != null && coberturaUniverso != null
      ? `${pct1(coberturaUniverso)} sobre todo el universo filtrado (${nf(medibles)} de ${nf(consultados)}), que incluye servicios que no se esperan medir.`
      : (summary?.cobertura_evaluable_nota ?? undefined);

  return [
    {
      id: "cumplimiento-observado",
      label: CAT.cumplimientoObservado.label,
      icon: CAT.cumplimientoObservado.icon,
      value: cumplimiento,
      numerator: medibles > 0 ? (summary?.servicios_cumplidos_trazable ?? null) : null,
      denominator: medibles > 0 ? medibles : null,
      detail:
        coberturaRef != null
          ? `Cobertura ${pct1(coberturaRef)} ${coberturaEvaluable != null ? "del universo evaluable" : "del universo filtrado"}${coberturaRef < 0.5 ? ": no representa a todo el universo" : ""}.`
          : undefined,
      status: estCumpl.tone,
      statusLabel: estCumpl.label,
      leer: CAT.cumplimientoObservado.leer,
      calculo: CAT.cumplimientoObservado.calculo,
      actionLabel: "Ver servicios",
      onAction: acciones?.cumplimiento,
    },
    {
      id: "cobertura-medicion",
      label: CAT.coberturaMedicion.label,
      icon: CAT.coberturaMedicion.icon,
      value: coberturaRef,
      numerator: coberturaRef != null ? medibles : null,
      denominator: coberturaRef != null ? (coberturaEvaluable != null ? universoEvaluable : consultados) : null,
      detail: detalleCobertura,
      status: estCob.tone,
      statusLabel: estCob.label,
      leer: CAT.coberturaMedicion.leer,
      calculo: CAT.coberturaMedicion.calculo,
    },
    {
      id: "efectividad-asignacion",
      label: CAT.efectividadAsignacion.label,
      icon: CAT.efectividadAsignacion.icon,
      value: efectividad,
      numerator: usosEnviador > 0 ? (summary?.asigna_movil_con_envio_ok ?? null) : null,
      denominator: usosEnviador > 0 ? usosEnviador : null,
      detail: summary ? `Uso del enviador: ${pct1(summary.uso_enviador ?? 0)} (${nf(usosEnviador)} de ${nf(consultados)} servicios).` : undefined,
      status: estEfec.tone,
      statusLabel: estEfec.label,
      leer: CAT.efectividadAsignacion.leer,
      calculo: CAT.efectividadAsignacion.calculo,
      actionLabel: "Ver servicios",
      onAction: acciones?.efectividad,
    },
    {
      id: "trazabilidad-completa",
      label: CAT.trazabilidadCompleta.label,
      icon: CAT.trazabilidadCompleta.icon,
      value: trazabilidadPct,
      numerator: totalTraz ? (trazabilidad?.servicios_trazabilidad_completa ?? null) : null,
      denominator: totalTraz && totalTraz > 0 ? totalTraz : null,
      status: estTraz.tone,
      statusLabel: estTraz.label,
      leer: CAT.trazabilidadCompleta.leer,
      calculo: CAT.trazabilidadCompleta.calculo,
    },
  ];
}
