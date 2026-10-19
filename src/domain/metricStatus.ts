import { MINIMO_MEDIBLES, OBJETIVOS, UMBRALES_COBERTURA, UMBRALES_EFECTIVIDAD } from "./indicatorCatalog";
import type { MetricTone } from "./metricTypes";

export type Estado = { tone: MetricTone; label: string };

/** Cobertura de medición / trazabilidad: una cobertura baja NO es un incumplimiento (por eso es ámbar, nunca rojo). */
export function estadoCobertura(valor: number | null, etiquetas = { baja: "Cobertura baja", parcial: "Cobertura parcial", ok: "Cobertura suficiente" }): Estado {
  if (valor == null) return { tone: "insufficient", label: "Sin datos" };
  if (valor < UMBRALES_COBERTURA.baja) return { tone: "warning", label: etiquetas.baja };
  if (valor < UMBRALES_COBERTURA.parcial) return { tone: "neutral", label: etiquetas.parcial };
  return { tone: "positive", label: etiquetas.ok };
}

export function estadoEfectividad(valor: number | null, usos: number | null | undefined): Estado {
  if (valor == null || !usos) return { tone: "insufficient", label: "Sin muestra" };
  const objetivo = OBJETIVOS.efectividadAsignacion;
  if (objetivo != null) {
    return valor >= objetivo ? { tone: "positive", label: "Objetivo cumplido" } : { tone: "negative", label: "Bajo objetivo" };
  }
  if (valor >= UMBRALES_EFECTIVIDAD.alta) return { tone: "positive", label: "Alta" };
  if (valor >= UMBRALES_EFECTIVIDAD.intermedia) return { tone: "warning", label: "Intermedia" };
  return { tone: "negative", label: "Baja" };
}

/** Cumplimiento: sin muestra suficiente -> gris; con cobertura baja -> aviso de cobertura (no se califica el resultado);
    si no hay objetivo configurado no se inventa uno. */
export function estadoCumplimiento(medibles: number | null | undefined, valor: number | null, cobertura: number | null): Estado {
  if (valor == null || (medibles ?? 0) < MINIMO_MEDIBLES) return { tone: "insufficient", label: "Sin muestra" };
  const objetivo = OBJETIVOS.cumplimientoObservado;
  if (cobertura != null && cobertura < UMBRALES_COBERTURA.baja) return { tone: "warning", label: "Cobertura baja" };
  if (objetivo == null) return { tone: "neutral", label: "Sin objetivo definido" };
  return valor >= objetivo ? { tone: "positive", label: "Objetivo cumplido" } : { tone: "negative", label: "Bajo objetivo" };
}
