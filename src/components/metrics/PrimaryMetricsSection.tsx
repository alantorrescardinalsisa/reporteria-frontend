import type { MetricViewModel } from "../../domain/metricTypes";
import { MetricCard } from "./MetricCard";

export type SeccionDestino = "calidad" | "tiempos" | "encuestas" | "asignacion" | "outliers";

const ATAJOS: { clave: SeccionDestino; texto: string; icono: string }[] = [
  { clave: "calidad", texto: "Calidad y trazabilidad", icono: "fact_check" },
  { clave: "tiempos", texto: "Tiempos y SLA", icono: "schedule" },
  { clave: "encuestas", texto: "Encuestas", icono: "forum" },
  { clave: "asignacion", texto: "Asignación", icono: "rv_hookup" },
  { clave: "outliers", texto: "Outliers", icono: "query_stats" },
];

/* Primer nivel de lectura del Resumen: cuatro KPI (resultado + cobertura + asignación + trazabilidad), una síntesis de
   pocas frases y accesos rápidos al resto del análisis. Todo lo demás queda debajo, en secciones que se abren a demanda. */
export function PrimaryMetricsSection({
  periodo,
  totalServicios,
  metricas,
  frases,
  onAbrirSeccion,
}: {
  periodo: string;
  totalServicios: number | null;
  metricas: MetricViewModel[];
  frases: string[];
  onAbrirSeccion: (s: SeccionDestino) => void;
}) {
  return (
    <section aria-labelledby="estado-operativo" className="flex flex-col gap-md">
      <div className="flex flex-col gap-1">
        <h2 id="estado-operativo" className="font-headline-md text-headline-md text-on-surface font-semibold">
          Estado operativo
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {periodo}
          {totalServicios != null && <> · {new Intl.NumberFormat("es-AR").format(totalServicios)} servicios en el universo filtrado</>}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-md">
        {metricas.map((m) => (
          <MetricCard key={m.id} metric={m} />
        ))}
      </div>

      {frases.length > 0 && (
        <div className="flex items-start gap-2 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-xl px-md py-sm">
          <span className="material-symbols-outlined icon-filled text-[#f59e0b] text-[20px] mt-0.5 shrink-0">info</span>
          <div className="flex flex-col gap-1">
            <b className="font-label-md text-label-md text-on-surface">Atención requerida</b>
            <p className="font-body-md text-body-md text-on-surface">{frases.join(" ")}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-space-xs print:hidden">
        <span className="font-label-md text-label-md text-on-surface-variant mr-1">Más análisis:</span>
        {ATAJOS.map((a) => (
          <button
            key={a.clave}
            type="button"
            onClick={() => onAbrirSeccion(a.clave)}
            className="flex items-center gap-1.5 px-space-md py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface hover:bg-surface-container-low text-body-sm font-body-sm transition-colors"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">{a.icono}</span>
            {a.texto}
          </button>
        ))}
      </div>
    </section>
  );
}
