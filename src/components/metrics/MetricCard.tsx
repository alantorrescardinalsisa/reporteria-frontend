import { InfoTip } from "../../InfoTip";
import type { MetricTone, MetricViewModel } from "../../domain/metricTypes";

/* Tarjeta de KPI con el contrato MetricViewModel. Mismo lenguaje visual que el resto de la plataforma (tokens del diseño),
   no clases de color sueltas. */

const BADGE: Record<MetricTone, string> = {
  positive: "text-tertiary bg-tertiary/10",
  warning: "text-[#b5610a] bg-[#f59e0b]/10",
  negative: "text-error bg-error/10",
  neutral: "text-on-surface-variant bg-surface-container-highest",
  insufficient: "text-on-surface-variant bg-surface-container-low",
};
const BARRA: Record<MetricTone, string> = {
  positive: "bg-tertiary",
  warning: "bg-[#f59e0b]",
  negative: "bg-error",
  neutral: "bg-primary",
  insufficient: "bg-outline",
};

const fmtPct = (v: number | null) =>
  v == null || Number.isNaN(v) ? "—" : `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(v * 100)} %`;
const nf = (v: number) => new Intl.NumberFormat("es-AR").format(v);

export function MetricCard({ metric }: { metric: MetricViewModel }) {
  const m = metric;
  const clickable = !!m.onAction;
  return (
    <article
      className={`flex flex-col h-full gap-space-sm p-space-lg rounded-xl card-shadow border border-outline-variant/20 bg-surface-container-lowest relative overflow-hidden transition-shadow hover:shadow-md ${clickable ? "cursor-pointer" : ""}`}
      onClick={m.onAction}
    >
      <div className="flex items-start justify-between gap-space-sm">
        <span className="font-label-caps text-label-caps uppercase flex items-center gap-1 min-w-0 text-on-surface-variant">
          <span className="truncate">{m.label}</span>
          <InfoTip leer={m.leer} calculo={m.calculo} titulo={m.label} />
        </span>
        <div className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
          <span className="material-symbols-outlined icon-filled">{m.icon}</span>
        </div>
      </div>

      <div className="flex flex-col gap-space-xs">
        <div className="flex items-baseline flex-wrap gap-x-space-sm gap-y-1">
          <span className="font-metric-display text-metric-display leading-none text-on-surface">{fmtPct(m.value)}</span>
          <span className={`font-label-code text-label-code px-2 py-0.5 rounded-full font-semibold ${BADGE[m.status]}`}>
            {m.statusLabel}
          </span>
        </div>
        {m.numerator != null && m.denominator != null && (
          <small className="font-body-sm text-body-sm text-on-surface">
            {nf(m.numerator)} de {nf(m.denominator)}
          </small>
        )}
        {m.detail && <small className="font-body-sm text-body-sm leading-snug text-on-surface-variant">{m.detail}</small>}
        {m.variationPp != null && (
          <small className="font-body-sm text-body-sm text-on-surface-variant">
            <span className={m.variationPp > 0 ? "text-tertiary" : m.variationPp < 0 ? "text-error" : ""}>
              {m.variationPp > 0 ? "▲" : m.variationPp < 0 ? "▼" : "•"}{" "}
              {new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(m.variationPp))} pp
            </span>{" "}
            {m.comparisonLabel ?? "frente al periodo anterior"}
          </small>
        )}
        {m.target != null && <small className="font-body-sm text-body-sm text-on-surface-variant">Objetivo: {fmtPct(m.target)}</small>}
      </div>

      <div className="mt-auto flex flex-col gap-space-xs">
        {m.value != null && (
          <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
            <div className={`h-full rounded-full ${BARRA[m.status]}`} style={{ width: `${Math.max(0, Math.min(100, m.value * 100))}%` }} />
          </div>
        )}
        {m.actionLabel && m.onAction && (
          <b className="font-label-md text-label-md inline-flex items-center gap-0.5 text-primary">
            {m.actionLabel}
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </b>
        )}
      </div>
    </article>
  );
}
