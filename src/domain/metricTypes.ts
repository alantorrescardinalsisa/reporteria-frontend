/* Contrato común de las tarjetas de KPI de la pantalla de resumen (2026-10-19).
   Una sola estructura para todas: valor, numerador/denominador, estado, definición. Los campos de comparación y objetivo
   (variationPp, comparisonLabel, target) están reservados para cuando existan (comparación contra el periodo anterior y
   objetivos configurables): si vienen, la tarjeta los muestra; si no, no ocupan lugar. */

export type MetricTone = "positive" | "warning" | "negative" | "neutral" | "insufficient";

export type MetricViewModel = {
  id: string;
  label: string;
  icon: string; // nombre de Material Symbols
  value: number | null; // proporción 0-1 (como la devuelve la API); null = sin dato
  numerator?: number | null;
  denominator?: number | null;
  /** Línea secundaria (por ejemplo, la otra cobertura). */
  detail?: string;
  status: MetricTone;
  statusLabel: string;
  /** Definición en lenguaje claro y cómo se calcula (se muestran en el InfoTip). */
  leer: string;
  calculo?: string;
  // Reservados (ver arriba)
  variationPp?: number | null;
  comparisonLabel?: string;
  target?: number | null;
  // Acción (abre el detalle de servicios)
  actionLabel?: string;
  onAction?: () => void;
};
