import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal, flushSync } from "react-dom";
import {
  api,
  type Alertas,
  type CampanaImpacto,
  type CampanaMetric,
  type CampanaPrestadorMetric,
  type DataQuality,
  type EstadoOption,
  type EstadosCategorizados,
  type FunnelTiempos,
  type Clasificacion,
  type HabilitadoresAsignacion,
  type IngestStatus,
  type InteligenciaPrestador,
  type InteligenciaPrestadores,
  type MetricaTrackeo,
  type Outliers,
  type PrestadorMetric,
  type PrestadorOption,
  type ProgramadosFunnel,
  type ResumenAsignacion,
  type TiempoStats,
  type TipoOption,
  type TrackeoFilters,
  type TrackeoService,
  type TrackeoSummary,
  type TrackeoUniversos,
  type Trazabilidad,
  type TrendPoint,
} from "./api";
import "./App.css";

/* ============================================================
 * Nota de mantenimiento: este archivo fue re-diseñado visualmente
 * (Tailwind + Material Symbols, ver index.html) para calzar con el
 * layout de referencia entregado por el usuario. NINGÚN estado, hook,
 * llamada a la API ni cálculo fue modificado — solo el JSX/markup de
 * presentación. Toda la lógica de datos es idéntica a la versión
 * anterior.
 * ============================================================ */

type Page = "metrics" | "providers" | "cross" | "upload" | "intelligence";
type Option = { value: string; label: string };
type Drill = {
  title: string;
  metric: MetricaTrackeo;
  rows: TrackeoService[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  loading: boolean;
  exporting: boolean;
  error: string | null;
};
const DEFAULT: TrackeoFilters = {
  fecha_desde: "2026-08-01",
  fecha_hasta: "2026-08-24",
  campanas: [],
  prestador_ids: [],
  estados: [],
  tipos: [],
};
const nf = (v?: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("es-AR").format(v);
const pct = (v?: number | null) =>
  v == null
    ? "—"
    : `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(v * 100)} %`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function initial(): TrackeoFilters {
  const p = new URLSearchParams(location.search);
  return {
    fecha_desde: p.get("desde") || DEFAULT.fecha_desde,
    fecha_hasta: p.get("hasta") || DEFAULT.fecha_hasta,
    campanas: p.getAll("campana"),
    prestador_ids: p.getAll("prestador_id"),
    estados: p.getAll("estado"),
    tipos: p.getAll("tipo"),
  };
}

/* ---------- Iconos (Material Symbols Outlined) ---------- */
function Icon({
  name,
  className = "",
  filled = false,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span className={`material-symbols-outlined ${filled ? "icon-filled" : ""} ${className}`}>
      {name}
    </span>
  );
}
function Spinner({ className = "" }: { className?: string }) {
  return (
    <Icon name="progress_activity" className={`animate-spin ${className}`} />
  );
}

/* ---------- NUEVO (ADITIVO): tooltip de ayuda por indicador ----------
   Icono "i" que al pasar el mouse muestra una descripcion breve y, si
   corresponde, como se calcula. El popover se renderiza vía Portal
   directo a document.body, con posicion calculada en pixeles
   (getBoundingClientRect) -- NO como position:absolute dentro del
   arbol normal. Esto es necesario porque muchos de los contenedores
   que usan este tooltip (Card, el wrapper de las tablas con scroll
   horizontal, etc.) tienen overflow-hidden/overflow-x-auto, que
   recortaba el popover si se posicionaba con position:absolute
   adentro de ellos (se veia como una franja negra cortada). Al vivir
   en document.body con position:fixed, el popover ya no depende del
   overflow de ningun ancestro. */
type Tooltip = { leer: string; calculo?: string };
function InfoTip({ leer, calculo }: Tooltip) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    below: boolean;
  } | null>(null);

  const TIP_W = 256; // w-64
  const MARGIN = 8;

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = rect.top < 140;
    const centerX = rect.left + rect.width / 2;
    const left = Math.min(
      Math.max(centerX, TIP_W / 2 + MARGIN),
      window.innerWidth - TIP_W / 2 - MARGIN,
    );
    setPos({
      top: below ? rect.bottom + MARGIN : rect.top - MARGIN,
      left,
      below,
    });
  };
  const hide = () => setPos(null);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex shrink-0 normal-case tracking-normal font-normal"
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={(e) => e.stopPropagation()}
    >
      <Icon
        name="info"
        className="text-[14px] leading-none text-on-surface-variant/50 hover:text-primary cursor-help transition-colors"
      />
      {pos &&
        createPortal(
          <span
            className="fixed z-[200] pointer-events-none"
            style={{
              top: pos.top,
              left: pos.left,
              width: TIP_W,
              transform: pos.below
                ? "translateX(-50%)"
                : "translate(-50%, -100%)",
            }}
          >
            <span className="block rounded-lg bg-inverse-surface text-inverse-on-surface p-3 shadow-lg">
              <span className="block font-body-md text-[12.5px] leading-snug">
                {leer}
              </span>
              {calculo && (
                <span className="block font-body-md text-[11px] leading-snug text-inverse-on-surface/75 mt-1.5 pt-1.5 border-t border-inverse-on-surface/20">
                  <b className="font-semibold">Cómo se calcula:</b> {calculo}
                </span>
              )}
            </span>
          </span>,
          document.body,
        )}
    </span>
  );
}

/* ---------- Selector múltiple (misma lógica, nuevo estilo) ---------- */
function MultiSelect({
  label,
  values,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  options: Option[];
  placeholder: string;
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false),
    [term, setTerm] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const h = (e: MouseEvent) =>
      ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const list = options.filter((o) =>
    o.label.toLowerCase().includes(term.toLowerCase()),
  );
  const title =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? options.find((o) => o.value === values[0])?.label || values[0]
        : `${values.length} seleccionados`;
  return (
    <div className="relative flex flex-col gap-1 min-w-[170px]" ref={ref}>
      <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">
        {label}
      </label>
      <button
        type="button"
        className="form-input-styled font-body-md text-body-md text-on-surface flex items-center justify-between gap-2 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{title}</span>
        <Icon name="expand_more" className="text-[18px] text-outline shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 max-w-[80vw] z-30 bg-surface-container-lowest rounded-lg card-shadow border border-outline-variant/30 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-outline-variant/20">
            <Icon name="search" className="text-[16px] text-outline" />
            <input
              className="flex-1 text-body-md font-body-md text-on-surface outline-none bg-transparent"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar…"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-outline-variant/20">
            <button
              type="button"
              className="text-label-md font-label-md text-primary hover:underline"
              onClick={() => onChange(list.map((x) => x.value))}
            >
              Seleccionar visibles
            </button>
            <span className="text-outline-variant">·</span>
            <button
              type="button"
              className="text-label-md font-label-md text-on-surface-variant hover:underline"
              onClick={() => onChange([])}
            >
              Limpiar
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {list.map((o) => (
              <label
                key={o.value}
                className="flex items-center gap-2 px-3 py-1.5 text-body-md font-body-md text-on-surface hover:bg-surface-container-low cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="rounded border-outline-variant text-primary focus:ring-primary"
                  checked={values.includes(o.value)}
                  onChange={() =>
                    onChange(
                      values.includes(o.value)
                        ? values.filter((x) => x !== o.value)
                        : [...values, o.value],
                    )
                  }
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
            {list.length === 0 && (
              <div className="px-3 py-2 text-label-md font-label-md text-on-surface-variant">
                Sin resultados
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Tarjeta KPI (Universos Analíticos) ---------- */
const TONE_CLASSES: Record<string, string> = {
  blue: "bg-primary/10 text-primary",
  green: "bg-tertiary/10 text-tertiary",
  red: "bg-error/10 text-error",
  purple: "bg-[#7c3aed]/10 text-[#7c3aed]",
  amber: "bg-[#f59e0b]/10 text-[#f59e0b]",
};
function Card({
  icon,
  title,
  value,
  detail,
  onClick,
  tone = "blue",
  highlight = false,
  tooltip,
  linkText = "Ver servicios",
}: {
  icon: ReactNode;
  title: string;
  value: string;
  detail: string;
  onClick?: () => void;
  tone?: string;
  highlight?: boolean;
  tooltip?: Tooltip;
  linkText?: string;
}) {
  return (
    <article
      className={`bg-surface-container-lowest rounded-xl p-md card-shadow border flex flex-col gap-md relative overflow-hidden transition-colors ${
        highlight ? "border-primary/40 bg-primary/5" : "border-outline-variant/20"
      } ${onClick ? "cursor-pointer hover:border-primary/30" : ""}`}
      onClick={onClick}
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center ${
          highlight ? "bg-primary/20 text-primary" : TONE_CLASSES[tone]
        }`}
      >
        {icon}
      </div>
      <div className="flex flex-col gap-1 z-10">
        <span
          className={`font-display-lg text-display-lg leading-none ${highlight ? "text-primary" : "text-on-surface"}`}
        >
          {value}
        </span>
        <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
          {title}
          {tooltip && <InfoTip {...tooltip} />}
        </span>
        <small className="font-body-md text-[13px] text-on-surface-variant/80 leading-snug">
          {detail}
        </small>
        {onClick && (
          <b className="font-label-md text-label-md text-primary mt-1 inline-flex items-center gap-0.5">
            {linkText}
            <Icon name="chevron_right" className="text-[16px]" />
          </b>
        )}
      </div>
    </article>
  );
}

/* ---------- Fila de indicador operativo (lista compacta) ---------- */
function IndicatorRow({
  icon,
  label,
  value,
  detail,
  onClick,
  tooltip,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  onClick?: () => void;
  tooltip?: Tooltip;
}) {
  return (
    <div
      className={`bg-surface-container-lowest rounded-xl p-4 card-shadow border border-outline-variant/20 flex items-center justify-between gap-3 transition-colors ${
        onClick ? "cursor-pointer hover:bg-surface-bright" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 shrink-0 rounded bg-surface-variant flex items-center justify-center text-on-surface-variant">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-body-md text-body-md font-medium text-on-surface flex items-center gap-1 min-w-0">
            <span className="truncate">{label}</span>
            {tooltip && <InfoTip {...tooltip} />}
          </div>
          {detail && (
            <div className="font-label-sm text-label-sm text-on-surface-variant truncate">
              {detail}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="font-headline-sm text-headline-sm text-on-surface">{value}</span>
        {onClick && <Icon name="chevron_right" className="text-[18px] text-outline" />}
      </div>
    </div>
  );
}

/* ---------- Barra de progreso (Distribución / Calidad) ---------- */
function ProgressBar({
  label,
  icon,
  valueLabel,
  ratio,
  color,
  onClick,
  tooltip,
}: {
  label: string;
  icon?: ReactNode;
  valueLabel: string;
  ratio: number;
  color: string;
  onClick?: () => void;
  tooltip?: Tooltip;
}) {
  return (
    <button
      type="button"
      disabled={!onClick}
      className={`flex flex-col gap-1 w-full text-left disabled:cursor-default ${onClick ? "cursor-pointer group" : ""}`}
      onClick={onClick}
    >
      <div className="flex justify-between items-center text-label-md font-label-md gap-2">
        <span className="text-on-surface flex items-center gap-2 min-w-0">
          {icon}
          <span className="truncate">{label}</span>
          {tooltip && <InfoTip {...tooltip} />}
        </span>
        <span className="text-on-surface-variant font-bold shrink-0">{valueLabel}</span>
      </div>
      <div className="w-full h-xs bg-surface-container-highest rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(100, Math.max(0, ratio * 100))}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </button>
  );
}

/* ---------- Tendencia diaria (mismos cálculos de coordenadas) ---------- */
function TrendSvg({
  data,
  width,
  height,
  responsive = false,
}: {
  data: TrendPoint[];
  width: number;
  height: number;
  responsive?: boolean;
}) {
  const W = width,
    H = height,
    P = 35,
    x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, data.length - 1),
    y = (v: number) => H - P - v * (H - 2 * P),
    points = (k: keyof TrendPoint) =>
      data.map((d, i) => `${x(i)},${y(Number(d[k] || 0))}`).join(" ");
  return (
    <svg
      {...(responsive
        ? { className: "w-full block", style: { height: H } }
        : { width: W, height: H, className: "block" })}
      viewBox={`0 0 ${W} ${H}`}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line
            x1={P}
            x2={W - P}
            y1={y(v)}
            y2={y(v)}
            className="stroke-outline-variant/30"
            strokeWidth={1}
          />
          <text x="2" y={y(v) + 4} className="fill-outline text-[10px]">
            {v * 100}%
          </text>
        </g>
      ))}
      <polyline
        className="fill-none stroke-tertiary"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points("cumplimiento_demora")}
      />
      <polyline
        className="fill-none stroke-primary"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points("efectividad_enviador")}
      />
      <polyline
        className="fill-none stroke-[#7c3aed]"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points("uso_enviador")}
      />
      {data.map((d, i) => (
        <text
          key={d.fecha}
          x={x(i)}
          y={H - 7}
          textAnchor="middle"
          className="fill-outline text-[10px]"
        >
          {d.fecha.slice(5)}
        </text>
      ))}
    </svg>
  );
}

/* ---------- NUEVO (ADITIVO): período local + zoom + paneo por
   arrastre, todo acotado a los datos que ya trajeron los filtros
   globales (nunca se pide un rango mayor al ya cargado) ---------- */
const PERIODOS_TENDENCIA: { value: "7" | "14" | "30" | "todo"; label: string }[] = [
  { value: "7", label: "Últimos 7 días" },
  { value: "14", label: "Últimos 14 días" },
  { value: "30", label: "Último mes" },
  { value: "todo", label: "Todo el período filtrado" },
];
function TrendChart({ data }: { data: TrendPoint[] }) {
  const [periodo, setPeriodo] = useState<"7" | "14" | "30" | "todo">("30"),
    [zoom, setZoom] = useState(false),
    [dragging, setDragging] = useState(false),
    viewportRef = useRef<HTMLDivElement>(null),
    dragStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
      viewportRef.current.scrollTop = 0;
    }
  }, [periodo, zoom, data]);

  // Al exportar a PDF (window.print), si el gráfico había quedado con
  // zoom y desplazado (drag), se imprimiría justo esa porción movida y
  // cortada al alto fijo del visor -- se ve "desfazado". Antes de
  // imprimir, siempre volvemos a la vista completa (sin zoom) y con el
  // scroll en el origen.
  useEffect(() => {
    const reset = () => {
      setZoom(false);
      if (viewportRef.current) {
        viewportRef.current.scrollLeft = 0;
        viewportRef.current.scrollTop = 0;
      }
    };
    window.addEventListener("beforeprint", reset);
    return () => window.removeEventListener("beforeprint", reset);
  }, []);

  if (!data.length)
    return (
      <div className="flex-1 min-h-[260px] flex items-center justify-center text-body-md font-body-md text-on-surface-variant">
        Sin datos
      </div>
    );

  const visible = periodo === "todo" ? data : data.slice(-Number(periodo));
  const VIEWPORT_H = 300;
  const width = zoom ? Math.max(900, visible.length * 55) : 900;
  const height = zoom ? 480 : VIEWPORT_H;

  const onMouseDown = (e: ReactMouseEvent) => {
    if (!viewportRef.current) return;
    setDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: viewportRef.current.scrollLeft,
      scrollTop: viewportRef.current.scrollTop,
    };
  };
  const onMouseMove = (e: ReactMouseEvent) => {
    if (!dragging || !viewportRef.current) return;
    viewportRef.current.scrollLeft =
      dragStart.current.scrollLeft - (e.clientX - dragStart.current.x);
    viewportRef.current.scrollTop =
      dragStart.current.scrollTop - (e.clientY - dragStart.current.y);
  };
  const stopDragging = () => setDragging(false);

  return (
    <div className="flex flex-col gap-2 flex-1">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <select
          className="form-input-styled font-body-md text-body-md text-on-surface h-9"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value as typeof periodo)}
        >
          {PERIODOS_TENDENCIA.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setZoom((z) => !z)}
          className="h-9 px-sm rounded bg-surface-container-low text-on-surface font-label-md text-label-md flex items-center gap-1 hover:bg-surface-variant transition-colors"
          title={
            zoom
              ? "Quitar zoom (ajustar al ancho de la tarjeta)"
              : "Hacer zoom (arrastrar para desplazarse)"
          }
        >
          <Icon name={zoom ? "zoom_out" : "zoom_in"} className="text-[18px]" />
          {zoom ? "Quitar zoom" : "Zoom"}
        </button>
      </div>
      <div
        ref={viewportRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
        className={`trend-chart-viewport w-full overflow-auto rounded-lg ${
          zoom ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
        }`}
        style={{ height: VIEWPORT_H }}
      >
        <TrendSvg
          data={visible}
          width={width}
          height={height}
          responsive={!zoom}
        />
      </div>
      {zoom && (
        <span className="font-label-sm text-label-sm text-on-surface-variant">
          Hacé clic y arrastrá el gráfico para desplazarte
        </span>
      )}
    </div>
  );
}

/* ---------- NUEVO (ADITIVO): tarjeta de un tramo del funnel, en
   lenguaje simple (usada por "Tiempos del prestador") ---------- */
function TramoCard({
  label,
  icon,
  stats,
  explicacion,
  tooltip,
}: {
  label: string;
  icon: string;
  stats: TiempoStats | undefined;
  explicacion: string;
  tooltip?: Tooltip;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col gap-sm p-md">
      <header className="flex items-center gap-3">
        <Icon name={icon} className="text-primary" />
        <h4 className="font-title-lg text-title-lg text-on-surface flex items-center gap-1">
          {label}
          {tooltip && <InfoTip {...tooltip} />}
        </h4>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="flex flex-col gap-1 bg-surface-container-low rounded-lg p-sm">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
            Tiempo típico
          </span>
          <span className="font-headline-sm text-headline-sm text-on-surface">
            {nf(stats?.p50)} min
          </span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            La mitad de los casos tarda menos que esto
          </span>
        </div>
        <div className="flex flex-col gap-1 bg-surface-container-low rounded-lg p-sm">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
            En los casos más lentos
          </span>
          <span className="font-headline-sm text-headline-sm text-on-surface">
            {nf(stats?.p90)} min
          </span>
          <span className="font-label-md text-label-md text-[#b5610a] bg-[#f59e0b]/10 rounded-full px-2 py-0.5 w-fit uppercase tracking-wide">
            10 de cada 100 casos
          </span>
        </div>
        <div className="flex flex-col gap-1 bg-surface-container-low rounded-lg p-sm">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
            Casos medidos
          </span>
          <span className="font-headline-sm text-headline-sm text-on-surface">
            {nf(stats?.cantidad)}
          </span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            Servicios con datos completos para esta etapa
          </span>
        </div>
        <div className="flex flex-col gap-1 bg-surface-container-low rounded-lg p-sm">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
            Calidad del dato
          </span>
          <span className="font-headline-sm text-headline-sm text-on-surface">
            {stats?.cantidad_invalidos_negativos ? "Con errores" : "Sin problemas"}
          </span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            {stats?.cantidad_invalidos_negativos
              ? `${nf(stats.cantidad_invalidos_negativos)} casos con datos cargados mal, no se cuentan`
              : "No se detectaron datos cargados con error"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-primary-container/50 rounded-lg px-sm py-2">
        <Icon name="auto_awesome" className="text-primary text-[18px] shrink-0" />
        <span className="font-body-md text-body-md text-on-surface">
          {explicacion}
        </span>
      </div>
    </div>
  );
}

/* ---------- NUEVO (ADITIVO): gráfico de barras "Servicios por hora del día" ---------- */
function HourlyBarChart({
  data,
}: {
  data: { hora: number; servicios: number }[];
}) {
  if (!data.length)
    return (
      <div className="flex-1 min-h-[300px] flex items-center justify-center text-body-md font-body-md text-on-surface-variant">
        Sin datos
      </div>
    );
  const W = 1000,
    H = 320,
    PT = 34,
    PB = 26,
    n = data.length,
    max = Math.max(1, ...data.map((d) => d.servicios)),
    plotH = H - PT - PB,
    slot = W / n,
    bw = slot * 0.55,
    barX = (i: number) => i * slot + (slot - bw) / 2,
    barH = (v: number) => (v / max) * plotH,
    barY = (v: number) => PT + (plotH - barH(v));
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full block"
      style={{ height: H }}
    >
      {data.map((d, i) => (
        <g key={d.hora}>
          <text
            x={barX(i) + bw / 2}
            y={Math.max(12, barY(d.servicios) - 6)}
            textAnchor="middle"
            className="fill-on-surface text-[11px] font-semibold"
          >
            {nf(d.servicios)}
          </text>
          <rect
            x={barX(i)}
            y={barY(d.servicios)}
            width={bw}
            height={barH(d.servicios)}
            rx={2}
            className="fill-primary"
          />
          <text
            x={barX(i) + bw / 2}
            y={H - 8}
            textAnchor="middle"
            className="fill-outline text-[10px]"
          >
            {String(d.hora).padStart(2, "0")}:00
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ---------- NUEVO (ADITIVO): paginado de a 10 (u otro tamaño) para
   tablas largas. pageSize/onPageSizeChange son opcionales -- si se
   pasan, aparece un selector "Mostrar: N" para ver más registros por
   página sin tener que navegar tanto. ---------- */
function Pager({
  page,
  setPage,
  total,
  pageSize = 10,
  pageSizeOptions,
  onPageSizeChange,
}: {
  page: number;
  setPage: (p: number) => void;
  total: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (n: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize)),
    start = total === 0 ? 0 : (page - 1) * pageSize + 1,
    end = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between px-md py-sm border-t border-outline-variant/20 flex-wrap gap-2">
      <span className="font-label-sm text-label-sm text-on-surface-variant">
        {total === 0 ? "Sin registros" : `Mostrando ${nf(start)}–${nf(end)} de ${nf(total)}`}
      </span>
      <div className="flex items-center gap-2">
        {pageSizeOptions && onPageSizeChange && (
          <label className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant mr-1">
            Mostrar
            <select
              className="form-input-styled font-body-md text-body-md text-on-surface h-8 py-0"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
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
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

/* ---------- NUEVO (ADITIVO): orden por columna, para todas las tablas ---------- */
type SortDir = "asc" | "desc";
function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // los nulos/N-A siempre quedan al final
  if (b == null) return -1;
  const cmp =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "es", {
          numeric: true,
          sensitivity: "base",
        });
  return dir === "asc" ? cmp : -cmp;
}
function useSort<T>(
  rows: T[],
  initialKey: string,
  initialDir: SortDir = "desc",
  accessors?: Record<string, (row: T) => unknown>,
) {
  const [key, setKey] = useState(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);
  const toggle = (k: string, defaultDir: SortDir = "desc") => {
    if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setKey(k);
      setDir(defaultDir);
    }
  };
  const getValue = (row: T) => {
    const acc = accessors?.[key];
    return acc ? acc(row) : (row as Record<string, unknown>)[key];
  };
  const sorted = useMemo(
    () => [...rows].sort((a, b) => compareValues(getValue(a), getValue(b), dir)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, key, dir],
  );
  return { sorted, key, dir, toggle };
}
type SortState = { key: string; dir: SortDir; toggle: (k: string, d?: SortDir) => void };
/* Encabezado de columna clickeable para ordenar, con tooltip opcional */
function SortableTh({
  label,
  sortKey,
  sort,
  defaultDir = "desc",
  tooltip,
  className = "py-2 pr-3",
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  defaultDir?: SortDir;
  tooltip?: Tooltip;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th className={className}>
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => sort.toggle(sortKey, defaultDir)}
          className={`inline-flex items-center gap-0.5 hover:text-on-surface transition-colors ${
            active ? "text-on-surface" : ""
          }`}
        >
          {label}
          <Icon
            name={
              active
                ? sort.dir === "asc"
                  ? "arrow_upward"
                  : "arrow_downward"
                : "unfold_more"
            }
            className={`text-[14px] ${active ? "text-primary" : "text-on-surface-variant/40"}`}
          />
        </button>
        {tooltip && <InfoTip {...tooltip} />}
      </span>
    </th>
  );
}

/* ---------- NUEVO (ADITIVO): traducciones de la clasificación de
   Inteligencia de Prestadores a lenguaje simple ---------- */
// Orden de severidad para poder ordenar la columna "Clasificación" (y su
// derivada "Qué conviene hacer") de peor a mejor, no alfabéticamente.
const CLASIFICACION_RANK: Record<Clasificacion, number> = {
  urgente: 0,
  atencion: 1,
  estable: 2,
  destacado: 3,
  muestra_insuficiente: 4,
};
function clasificacionInfo(c: Clasificacion): {
  label: string;
  tone: string;
  icon: string;
} {
  switch (c) {
    case "urgente":
      return { label: "Urgente", tone: "text-error bg-error/10", icon: "error" };
    case "atencion":
      return {
        label: "Atención",
        tone: "text-[#b5610a] bg-[#f59e0b]/10",
        icon: "warning",
      };
    case "destacado":
      return {
        label: "Destacado",
        tone: "text-tertiary bg-tertiary/10",
        icon: "trending_up",
      };
    case "estable":
      return {
        label: "Estable",
        tone: "text-on-surface-variant bg-surface-container-low",
        icon: "check_circle",
      };
    default:
      return {
        label: "Muestra insuficiente",
        tone: "text-on-surface-variant bg-surface-container-low",
        icon: "help",
      };
  }
}
function comparadoConSimilares(percentil: number | null): string {
  if (percentil == null) return "Sin datos suficientes";
  if (percentil >= 80) return "Entre los mejores";
  if (percentil >= 50) return "Por encima del promedio";
  if (percentil >= 20) return "Por debajo del promedio";
  return "Entre los más bajos";
}
function queHacer(c: Clasificacion): string {
  switch (c) {
    case "urgente":
      return "Revisar su rendimiento cuanto antes";
    case "atencion":
      return "Monitorear de cerca";
    case "destacado":
      return "Buen candidato a más volumen";
    case "estable":
      return "Mantener como está";
    default:
      return "Esperar más datos antes de decidir";
  }
}

function csv(rows: Record<string, unknown>[], name: string) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]),
    esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`,
    data =
      "﻿" +
      [
        cols.join(";"),
        ...rows.map((r) => cols.map((c) => esc(r[c])).join(";")),
      ].join("\n"),
    url = URL.createObjectURL(new Blob([data], { type: "text/csv" })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBlob(content: string, mime: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- NUEVO (ADITIVO): exportar como planilla de Excel real (no
   solo CSV) usando el formato XML de Excel 2003 ("SpreadsheetML") -- un
   único archivo de texto que Excel abre nativamente, sin necesitar
   ninguna librería externa para armar un .xlsx comprimido. ---------- */
function excelXml(rows: Record<string, unknown>[]): string {
  const cols = Object.keys(rows[0]),
    esc = (x: unknown) =>
      String(x ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;"),
    cell = (v: unknown) =>
      `<Cell><Data ss:Type="${typeof v === "number" ? "Number" : "String"}">${esc(v)}</Data></Cell>`,
    header = `<Row>${cols.map((c) => `<Cell ss:StyleID="h"><Data ss:Type="String">${esc(c)}</Data></Cell>`).join("")}</Row>`,
    body = rows
      .map((r) => `<Row>${cols.map((c) => cell(r[c])).join("")}</Row>`)
      .join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#E5E7EB" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="Datos"><Table>${header}${body}</Table></Worksheet>
</Workbook>`;
}
function exportExcel(rows: Record<string, unknown>[], name: string) {
  if (!rows.length) return;
  downloadBlob(
    excelXml(rows),
    "application/vnd.ms-excel",
    name.replace(/\.csv$/i, "") + ".xls",
  );
}

/* ---------- NUEVO (ADITIVO): exportar como PDF = imprimir la vista actual
   de la plataforma tal cual se ve (mismos gráficos, colores y datos).
   Se probó antes con html2pdf.js (html2canvas + jsPDF), pero esa
   librería rasteriza el DOM con su propio motor de medición, que no
   entiende bien el layout con flexbox anidado de esta plataforma:
   tarjetas enteras (con "card-shadow" y break-inside:avoid) quedaban
   partidas al medio entre una hoja y la siguiente pese a la regla CSS,
   confirmado visualmente en un PDF de prueba. window.print() usa el
   mismo motor de renderizado que ya pinta la pantalla (no hay paso de
   rasterizado intermedio que pueda mal-interpretar el layout), así que
   se volvió a esa vía -- el ajuste real para el salto de página está en
   la hoja @media print de index.html (flex-col -> grid solo al
   imprimir). */
async function printCurrentView(title: string) {
  // No alcanza con escuchar "beforeprint" para sacar el menú lateral del
  // DOM: React 18 aplica ese setState de forma asíncrona, y window.print()
  // puede seguir sincrónicamente y capturar la hoja ANTES de que React
  // haya terminado de re-renderizar sin el <nav> -- volveríamos al mismo
  // bug. Por eso acá se dispara el cambio de estado explícitamente, se
  // espera a que el navegador pinte ese nuevo estado (dos
  // requestAnimationFrame: el primero encola el commit de React, el
  // segundo ya corre después de que el navegador pintó ese commit), y
  // recién ahí se llama a window.print().
  window.dispatchEvent(new Event("app:enter-print-mode"));
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  const prevTitle = document.title;
  document.title = title;
  const restore = () => {
    document.title = prevTitle;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}

/* ---------- NUEVO (ADITIVO): botón de exportar con selector de formato
   (Excel / PDF), reemplaza a los botones que exportaban CSV directo ---------- */
function ExportButton({
  rows,
  fileBaseName,
  pdfTitle,
  label = "Exportar",
  className = "h-10 px-sm rounded bg-primary-container text-on-primary-container font-label-md text-label-md flex items-center gap-2 hover:bg-primary hover:text-on-primary transition-colors",
}: {
  rows: () => Record<string, unknown>[];
  fileBaseName: string;
  pdfTitle: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const h = (e: MouseEvent) =>
      ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    // print:hidden -- este botón es una acción de la interfaz, no un
    // dato: no debe aparecer en el PDF (cerrado ni, mucho menos, con el
    // menú desplegado).
    <div className="relative print:hidden" ref={ref}>
      <button type="button" className={className} onClick={() => setOpen(!open)}>
        <Icon name="download" className="text-[18px]" />
        {label}
        <Icon name="expand_more" className="text-[16px]" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-surface-container-lowest rounded-lg card-shadow border border-outline-variant/30 overflow-hidden min-w-[200px] flex flex-col">
          <button
            type="button"
            className="flex items-center gap-2 px-md py-sm text-left font-body-md text-body-md text-on-surface hover:bg-surface-container-low transition-colors"
            onClick={() => {
              exportExcel(rows(), `${fileBaseName}.xls`);
              setOpen(false);
            }}
          >
            <Icon name="table_view" className="text-[18px] text-tertiary" />
            Planilla de Excel
          </button>
          <button
            type="button"
            className="flex items-center gap-2 px-md py-sm text-left font-body-md text-body-md text-on-surface hover:bg-surface-container-low transition-colors border-t border-outline-variant/20"
            onClick={() => {
              setOpen(false);
              printCurrentView(pdfTitle);
            }}
          >
            <Icon name="picture_as_pdf" className="text-[18px] text-error" />
            Documento PDF (vista actual)
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- NUEVO (ADITIVO): sistema de alertas -- campanita del
   header. Compara mes calendario actual vs anterior (siempre sobre los
   5 filtros globales ya aplicados, /api/alertas) para avisar de dos
   cosas que un vistazo a un solo período no muestra: prestadores con
   score bajo sostenido dos meses seguidos, y campañas enteras cuyo
   cumplimiento cae de un mes al siguiente. ---------- */
function NotificationBell({
  alertas,
  setPage,
}: {
  alertas: Alertas | null;
  setPage: (p: Page) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const h = (e: MouseEvent) =>
      ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const total = alertas?.total_alertas ?? 0;
  const irA = (p: Page) => {
    setPage(p);
    setOpen(false);
  };
  return (
    <div className="relative print:hidden" ref={ref}>
      <button
        type="button"
        className="relative p-2 hover:bg-surface-container-low transition-colors rounded-full flex items-center justify-center"
        onClick={() => setOpen(!open)}
      >
        <Icon name="notifications" filled={total > 0} />
        {total > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-error text-on-error font-label-sm text-[10px] font-bold flex items-center justify-center leading-none">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 bg-surface-container-lowest rounded-lg card-shadow border border-outline-variant/30 overflow-hidden w-[380px] max-h-[70vh] flex flex-col">
          <header className="px-md py-sm border-b border-outline-variant/20">
            <h3 className="font-title-lg text-title-lg text-on-surface">Alertas</h3>
            {alertas?.mes_actual && alertas?.mes_anterior && (
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                Comparando {alertas.mes_anterior} → {alertas.mes_actual}
              </p>
            )}
          </header>
          <div className="overflow-y-auto flex-1">
            {total === 0 && (
              <p className="p-md font-body-md text-body-md text-on-surface-variant">
                {alertas?.mensaje || "Sin alertas por ahora."}
              </p>
            )}
            {alertas && alertas.prestadores_alerta.length > 0 && (
              <div className="p-md flex flex-col gap-2">
                <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wide">
                  Prestadores con score bajo dos meses seguidos
                </span>
                {alertas.prestadores_alerta.map((p) => (
                  <button
                    key={p.prestador_id}
                    type="button"
                    onClick={() => irA("providers")}
                    className="text-left flex items-center justify-between gap-2 bg-error/5 hover:bg-error/10 rounded-lg px-sm py-2 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-body-md text-body-md font-medium text-on-surface truncate">
                        {p.prestador}
                      </div>
                      <div className="font-label-sm text-label-sm text-on-surface-variant">
                        {pct(p.score_mes_anterior)} → {pct(p.score_mes_actual)}
                      </div>
                    </div>
                    <Icon name="trending_down" className="text-error shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {alertas && alertas.campanas_alerta.length > 0 && (
              <div className="p-md flex flex-col gap-2 border-t border-outline-variant/20">
                <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wide">
                  Campañas bajando su rendimiento
                </span>
                {alertas.campanas_alerta.map((c) => (
                  <button
                    key={c.campana_normalizada}
                    type="button"
                    onClick={() => irA("cross")}
                    className="text-left flex items-center justify-between gap-2 bg-[#f59e0b]/5 hover:bg-[#f59e0b]/10 rounded-lg px-sm py-2 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-body-md text-body-md font-medium text-on-surface truncate">
                        {c.campana}
                      </div>
                      <div className="font-label-sm text-label-sm text-on-surface-variant">
                        {pct(c.cumplimiento_mes_anterior)} → {pct(c.cumplimiento_mes_actual)} (
                        {c.variacion_pp} pp)
                      </div>
                    </div>
                    <Icon name="trending_down" className="text-[#f59e0b] shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- NUEVO (ADITIVO): instructivo de ayuda (botón "?" del
   header) -- explica toda la plataforma en lenguaje simple, sin dar
   por sentado ningún conocimiento técnico previo. ---------- */
type HelpSection = { id: string; icon: string; title: string; body: ReactNode };
const HELP_SECTIONS: HelpSection[] = [
  {
    id: "intro",
    icon: "info",
    title: "Qué es esta plataforma",
    body: (
      <>
        <p>
          Reportería de Prestadores toma el mismo Excel de Trackeo que ya
          se usa hoy y lo convierte en indicadores listos para leer, sin
          tener que armar tablas dinámicas a mano. Todo lo que ves acá se
          calcula a partir de esos mismos datos — nada se inventa ni se
          estima: si un número te llama la atención, siempre podés
          contrastarlo filtrando el Excel de la misma forma.
        </p>
        <p>
          Está pensada para el área de Prestadores: para saber cómo viene
          rindiendo cada prestador, cada campaña, y para detectar rápido
          a quién conviene prestarle atención.
        </p>
      </>
    ),
  },
  {
    id: "filtros",
    icon: "tune",
    title: "Los filtros de arriba",
    body: (
      <>
        <p>
          En la parte de arriba de cada pantalla (menos en Inteligencia
          Operativa y Cargar reportes) hay 5 filtros: <b>Desde</b> /{" "}
          <b>Hasta</b> (rango de fechas), <b>Campañas</b>, <b>Prestadores</b>
          , <b>Estados</b> y <b>Tipo de servicio</b>. Estos 5 filtros
          mandan en toda la plataforma — cada indicador que ves ya está
          calculado solo sobre los servicios que cumplen lo que
          seleccionaste ahí arriba.
        </p>
        <p>
          <b>Estado y Tipo de servicio son 100% manuales</b>: si no
          elegís nada en esos dos, se incluyen TODOS los valores — igual
          que si en Excel no filtraras esa columna. No hay ningún filtro
          escondido aplicándose sin que lo elijas vos.
        </p>
        <ul>
          <li>
            Después de cambiar algo, tocá <b>Aplicar filtros</b> para que
            los indicadores se actualicen.
          </li>
          <li>
            <b>Restablecer</b> vuelve todo a los valores por defecto (los
            últimos ~2 meses, sin ningún otro filtro).
          </li>
          <li>
            Podés elegir varias campañas, prestadores, estados o tipos a
            la vez — no hace falta ver de a uno.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "metricas",
    icon: "bar_chart",
    title: "Métricas de Trackeo — lo esencial",
    body: (
      <>
        <p>
          Es la pantalla principal. Arriba de todo tenés los{" "}
          <b>Universos analíticos</b>: cuántos servicios hay en total,
          cuántos son vehiculares, cuántos quedaron cancelados, etc. Sirven
          para entender el tamaño del universo que estás mirando antes de
          leer los porcentajes de abajo (un 50% sobre 10 servicios no
          significa lo mismo que un 50% sobre 10.000).
        </p>
        <p>Después vienen los indicadores operativos principales:</p>
        <ul>
          <li>
            <b>Uso del enviador</b>: de los servicios, cuántos pasaron por
            la herramienta de asignación automática.
          </li>
          <li>
            <b>Efectividad de asignación</b>: de los que usaron esa
            herramienta, a cuántos se les consiguió un móvil.
          </li>
          <li>
            <b>Cumplimiento de demora</b>: de los servicios con tiempo
            prometido y tiempo real cargados, cuántos llegaron dentro de
            lo prometido.
          </li>
        </ul>
        <p>
          Cada tarjeta con una flechita (›) se puede clickear para ver el
          listado exacto de servicios que forman ese número — nunca tenés
          que confiar en el porcentaje "a ciegas".
        </p>
        <p>
          El gráfico <b>"Tendencia diaria"</b> muestra esos mismos
          indicadores día por día. Podés cambiar el período (última
          semana, último mes, etc.) y hacer zoom para ver el detalle día a
          día — el botón "Zoom" activa el arrastre con el mouse para
          moverte por el gráfico.
        </p>
        <p>
          <b>"Impacto por campaña"</b> no ordena las campañas por
          porcentaje, sino por cuánto se ganaría en la práctica si esa
          campaña mejorara — una campaña grande con un problema chico
          puede pesar más que una campaña chica con un problema grande.
        </p>
      </>
    ),
  },
  {
    id: "tiempos",
    icon: "schedule",
    title: "Cómo leer los tiempos del prestador",
    body: (
      <>
        <p>
          La sección "Tiempos del prestador" traduce los tiempos técnicos
          a preguntas simples: cuánto tarda en llegar, cuánto tarda en
          resolver el servicio, cuánto dura todo el proceso de punta a
          punta. A propósito <b>no incluye</b> el tiempo previo a que se
          le asigna el servicio al prestador — eso es operativa interna
          de Cardinal, no depende del prestador.
        </p>
        <p>Cada tarjeta muestra 4 datos:</p>
        <ul>
          <li>
            <b>Tiempo típico</b>: la mitad de los casos tarda menos que
            esto (es el valor "del medio", no un promedio que se puede
            distorsionar por un caso extremo).
          </li>
          <li>
            <b>En los casos más lentos</b>: cuánto tardan los peores 10 de
            cada 100 casos — para saber qué tan mal puede llegar a salir,
            no solo el caso típico.
          </li>
          <li>
            <b>Casos medidos</b>: sobre cuántos servicios se pudo calcular
            esto (si es un número chico, el dato hay que tomarlo con
            pinzas).
          </li>
          <li>
            <b>Calidad del dato</b>: si se detectaron datos cargados con
            error en esa etapa.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "horaria",
    icon: "insights",
    title: "Otros gráficos y tablas de esta pantalla",
    body: (
      <>
        <p>
          <b>"Servicios por hora del día"</b> muestra a qué hora llega más
          trabajo — útil para pensar la dotación de personal según la
          demanda real de cada franja horaria, no contra el promedio del
          día entero. Se puede filtrar por prestador o por campaña sin
          perder los filtros globales de arriba.
        </p>
        <p>
          <b>"Distribución de servicios cumplidos"</b> y{" "}
          <b>"Calidad de información"</b> muestran, respectivamente, qué
          tan ajustado (o con margen) fue el cumplimiento de los
          servicios que sí cumplieron, y qué tan completos están los
          datos cargados en el Excel (un campo vacío puede ser tan
          importante como un mal resultado).
        </p>
        <p>
          <b>"Estados por categoría"</b> agrupa los estados individuales
          del Excel en categorías más fáciles de leer (Finalizado,
          Cancelado, En curso, etc.). <b>"Trazabilidad completa del
          servicio"</b> mide qué % de los servicios tiene registrada toda
          la cadena de eventos, de punta a punta.
        </p>
        <p>
          <b>"Gestión completa de servicios programados"</b> sigue el
          camino completo de un servicio programado (con fecha y hora
          agendada) y en particular la <b>"Llegada en horario"</b>: si el
          prestador llegó dentro de la ventana prometida. Haciendo clic
          se puede ver por separado quiénes cumplieron y quiénes no.
        </p>
        <p>
          <b>"Outliers por tramo"</b> muestra, caso por caso, los 20
          valores más altos de cada tramo de tiempo — para auditar los
          casos extremos en vez de que queden escondidos dentro de un
          promedio.
        </p>
      </>
    ),
  },
  {
    id: "prestador",
    icon: "person_search",
    title: "Detalle por prestador y el Score",
    body: (
      <>
        <p>
          Esta pantalla muestra, prestador por prestador, todos los
          indicadores anteriores en una sola fila. Se puede buscar por
          nombre, ordenar por cualquier columna haciendo clic en su
          encabezado (un clic más invierte el orden), y exportar la
          tabla completa.
        </p>
        <p>
          La columna <b>Score</b> es una nota de 0% a 100% que combina 4
          cosas en una sola: cumplimiento de demora (37,5%), efectividad
          de asignación (31,25%), calidad de los datos cargados (18,75%)
          y qué tan grande es el prestador en volumen (12,5%). Si a un
          prestador le falta alguno de esos datos, el score se calcula
          solo con lo que sí tiene, ajustando los porcentajes — nunca se
          asume "0" para un dato faltante.
        </p>
        <p>
          El ⚠️ al lado del score avisa que ese prestador tiene menos de
          20 servicios en el período filtrado — con tan poca muestra, el
          número es menos confiable y conviene mirarlo con cautela.
        </p>
      </>
    ),
  },
  {
    id: "campana",
    icon: "campaign",
    title: "Campaña × prestador",
    body: (
      <p>
        Es la misma idea que "Detalle por prestador", pero cruzando cada
        prestador con cada campaña en la que trabajó — para responder
        "¿este prestador rinde igual en todas las campañas, o hay alguna
        en particular donde le va peor?". También se puede ordenar por
        columna y exportar.
      </p>
    ),
  },
  {
    id: "inteligencia",
    icon: "psychology",
    title: "Inteligencia Operativa",
    body: (
      <>
        <p>
          Esta pantalla identifica rápido a quién conviene revisar con
          urgencia, a quién prestarle atención media, y quién se está
          destacando — combinando la tendencia reciente de cada prestador
          (¿mejoró o empeoró dentro del período filtrado?) con su
          posición frente a sus pares (¿rinde mejor o peor que el resto?).
        </p>
        <p>
          <b>Importante: no es un pronóstico.</b> Todo se calcula sobre
          datos que ya ocurrieron — no hay ninguna probabilidad de lo que
          "podría pasar" a futuro. Es un motor de reglas simples
          (umbrales y comparaciones), no un modelo de inteligencia
          artificial entrenado.
        </p>
        <p>
          Las tarjetas de arriba (Urgente / Atención / Destacado) se
          pueden clickear para ver el listado de prestadores de esa
          categoría. Más abajo aparecen los 3 que más necesitan atención
          y los 3 que más se destacan, y una tabla comparativa con todos.
        </p>
      </>
    ),
  },
  {
    id: "alertas",
    icon: "notifications",
    title: "Alertas (la campanita 🔔)",
    body: (
      <>
        <p>
          La campanita de arriba a la derecha avisa, sin que tengas que
          ir a buscarlo, dos situaciones puntuales:
        </p>
        <ul>
          <li>
            Prestadores cuyo Score se mantiene bajo dos meses calendario
            seguidos (no un mal mes puntual).
          </li>
          <li>
            Campañas enteras cuyo cumplimiento de demora bajó de un mes
            al siguiente.
          </li>
        </ul>
        <p>
          Un número al lado de la campana indica cuántas alertas hay
          activas ahora mismo. Haciendo clic en cualquier alerta te lleva
          directo a la pantalla con el detalle de ese prestador o esa
          campaña.
        </p>
      </>
    ),
  },
  {
    id: "exportar",
    icon: "download",
    title: "Exportar datos",
    body: (
      <>
        <p>
          Los botones "Exportar" abren un menú con dos opciones:
        </p>
        <ul>
          <li>
            <b>Planilla de Excel</b>: descarga los datos de esa tabla en
            un archivo que Excel abre directamente, para seguir
            trabajando con esos números ahí.
          </li>
          <li>
            <b>Documento PDF (vista actual)</b>: genera un PDF con la
            pantalla tal cual se ve en ese momento — mismos gráficos,
            mismos colores — para compartir o guardar como reporte.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "cargar",
    icon: "upload_file",
    title: "Cargar reportes",
    body: (
      <p>
        Desde esta pantalla se sube el Excel de Trackeo (.xlsx o .xlsm)
        para que la plataforma lo procese y sus datos queden disponibles
        en todas las demás pantallas. Se selecciona el archivo, se toca
        "Procesar reporte", y abajo va apareciendo el estado de la carga
        (cuántas filas se procesaron).
      </p>
    ),
  },
  {
    id: "glosario",
    icon: "menu_book",
    title: "Glosario rápido",
    body: (
      <ul>
        <li>
          <b>Universo filtrado</b>: el conjunto de servicios que quedó
          después de aplicar los 5 filtros de arriba — la base sobre la
          que se calcula todo lo demás en esa pantalla.
        </li>
        <li>
          <b>Demora prometida / Demora real</b>: el tiempo que se prometió
          y el tiempo que efectivamente tardó un servicio. Un servicio
          "cumple" si la demora real no superó la prometida.
        </li>
        <li>
          <b>Enviador</b>: la herramienta de asignación automática de
          móviles. "Uso del enviador" = cuántos servicios pasaron por
          ahí; "Efectividad" = a cuántos de esos se les consiguió un
          móvil.
        </li>
        <li>
          <b>Trazabilidad</b>: qué tan completa está la cadena de eventos
          de un servicio (alta, asignación, llegada, finalización, etc.)
        </li>
        <li>
          <b>Percentil</b>: en qué posición queda un prestador frente a
          sus pares. Percentil 80 significa que rinde mejor que 80 de
          cada 100 prestadores comparables.
        </li>
        <li>
          <b>Muestra insuficiente / baja</b>: cuando un prestador o
          campaña tiene muy pocos servicios en el período filtrado como
          para que el número sea confiable — se marca en vez de
          ocultarse, para que quien lo lea sepa que hay que tomarlo con
          cautela.
        </li>
      </ul>
    ),
  },
];
function HelpModal({ onClose }: { onClose: () => void }) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const irA = (id: string) =>
    contentRef.current
      ?.querySelector(`#help-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div
      className="fixed inset-0 bg-on-surface/40 z-[100] flex items-center justify-center p-md"
      onMouseDown={onClose}
    >
      <section
        className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-md py-md border-b border-outline-variant/20">
          <div className="flex items-center gap-3">
            <Icon name="help" filled className="text-primary text-[28px]" />
            <div>
              <h2 className="font-title-lg text-title-lg text-on-surface">
                Cómo usar la plataforma
              </h2>
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                Guía completa, pensada para leerse sin conocimiento técnico previo
              </p>
            </div>
          </div>
          <button
            type="button"
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="flex flex-1 min-h-0">
          <nav className="hidden sm:flex flex-col w-64 shrink-0 border-r border-outline-variant/20 overflow-y-auto p-sm gap-1">
            {HELP_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => irA(s.id)}
                className="flex items-center gap-2 px-sm py-2 rounded-lg text-left font-body-md text-body-md text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
              >
                <Icon name={s.icon} className="text-[18px] shrink-0" />
                <span className="truncate">{s.title}</span>
              </button>
            ))}
          </nav>
          <div ref={contentRef} className="flex-1 overflow-y-auto p-lg flex flex-col gap-xl">
            {HELP_SECTIONS.map((s) => (
              <section key={s.id} id={`help-${s.id}`} className="flex flex-col gap-2 scroll-mt-4">
                <h3 className="font-title-lg text-title-lg text-on-surface flex items-center gap-2 border-b border-outline-variant/30 pb-xs">
                  <Icon name={s.icon} className="text-primary" />
                  {s.title}
                </h3>
                <div className="font-body-md text-body-md text-on-surface flex flex-col gap-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5 [&_b]:font-semibold [&_b]:text-on-surface">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------- Navegación lateral ---------- */
const NAV_ITEMS: { page: Page; label: string; icon: string }[] = [
  { page: "metrics", label: "Métricas de Trackeo", icon: "analytics" },
  { page: "providers", label: "Detalle por prestador", icon: "person_search" },
  { page: "cross", label: "Campaña × prestador", icon: "campaign" },
  { page: "intelligence", label: "Inteligencia Operativa", icon: "psychology" },
  { page: "upload", label: "Cargar reportes", icon: "upload_file" },
];

export default function App() {
  const seed = useMemo(initial, []),
    [page, setPage] = useState<Page>("metrics"),
    [draft, setDraft] = useState(seed),
    [filters, setFilters] = useState(seed),
    [summary, setSummary] = useState<TrackeoSummary | null>(null),
    [universes, setUniverses] = useState<TrackeoUniversos | null>(null),
    [providers, setProviders] = useState<PrestadorMetric[]>([]),
    [campaigns, setCampaigns] = useState<CampanaMetric[]>([]),
    [providerOptions, setProviderOptions] = useState<PrestadorOption[]>([]),
    [states, setStates] = useState<EstadoOption[]>([]),
    [types, setTypes] = useState<TipoOption[]>([]),
    [trend, setTrend] = useState<TrendPoint[]>([]),
    [quality, setQuality] = useState<DataQuality | null>(null),
    [funnel, setFunnel] = useState<FunnelTiempos | null>(null),
    [estadosCategorizados, setEstadosCategorizados] =
      useState<EstadosCategorizados | null>(null),
    [trazabilidad, setTrazabilidad] = useState<Trazabilidad | null>(null),
    [habilitadores, setHabilitadores] =
      useState<HabilitadoresAsignacion | null>(null),
    [programadosFunnel, setProgramadosFunnel] =
      useState<ProgramadosFunnel | null>(null),
    [outliers, setOutliers] = useState<Outliers | null>(null),
    [prestadoresWarning, setPrestadoresWarning] = useState<string | null>(null),
    [campanaImpacto, setCampanaImpacto] = useState<CampanaImpacto[]>([]),
    [cross, setCross] = useState<CampanaPrestadorMetric[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null),
    [backend, setBackend] = useState({ ok: false, version: "" }),
    [drill, setDrill] = useState<Drill | null>(null),
    [file, setFile] = useState<File | null>(null),
    [uploading, setUploading] = useState(false),
    [uploadStatus, setUploadStatus] = useState<IngestStatus | null>(null),
    [uploadMessage, setUploadMessage] = useState(""),
    [providerSearch, setProviderSearch] = useState(""),
    // NUEVO (ADITIVO): paginado + búsqueda en Detalle por prestador y
    // Campaña × prestador (antes mostraban todas las filas sin cortar).
    [providerPage, setProviderPage] = useState(1),
    [providerPageSize, setProviderPageSize] = useState(20),
    [crossSearch, setCrossSearch] = useState(""),
    [crossPage, setCrossPage] = useState(1),
    [crossPageSize, setCrossPageSize] = useState(20),
    [outlierTramo, setOutlierTramo] = useState<keyof Outliers>("demora_real"),
    [campanaImpactoPage, setCampanaImpactoPage] = useState(1),
    [outliersPage, setOutliersPage] = useState(1),
    [horaPrestador, setHoraPrestador] = useState(""),
    [horaCampana, setHoraCampana] = useState(""),
    [horaLocalDistribucion, setHoraLocalDistribucion] = useState<
      FunnelTiempos["distribucion_horaria"] | null
    >(null),
    [horaLocalLoading, setHoraLocalLoading] = useState(false),
    [inteligencia, setInteligencia] = useState<InteligenciaPrestadores | null>(
      null,
    ),
    [inteligenciaLoading, setInteligenciaLoading] = useState(false),
    [inteligenciaPage, setInteligenciaPage] = useState(1),
    [modalClasificacion, setModalClasificacion] =
      useState<Clasificacion | null>(null),
    // NUEVO (ADITIVO): sistema de alertas (campanita del header) --
    // visible en cualquier pantalla, así que se pide siempre (no
    // gateado por `page`, a diferencia de Inteligencia Operativa).
    [alertas, setAlertas] = useState<Alertas | null>(null),
    // NUEVO (ADITIVO): instructivo de ayuda (botón "?" del header).
    [helpOpen, setHelpOpen] = useState(false),
    // NUEVO (ADITIVO): el menú lateral seguía apareciendo en el PDF pese
    // a "display:none" en @media print, incluso probado y confirmado en
    // el sitio en vivo (ver CONTEXTO.md, sexto/séptimo ajuste). El menú
    // es "position: fixed", y hay un bug conocido de motores basados en
    // Chromium/WebKit donde ese tipo de elementos se imprime igual pese
    // al display:none (el motor de impresión pega la capa ya compuesta
    // del elemento en cada hoja). La única forma 100% confiable de que
    // no aparezca es que directamente no exista en el DOM mientras se
    // imprime -- no ocultarlo por CSS, sacarlo del árbol de React.
    [printing, setPrinting] = useState(false);
  useEffect(() => {
    // "app:enter-print-mode" lo dispara printCurrentView() ANTES de
    // llamar a window.print(), esperando a que React haya terminado de
    // re-renderizar sin el <nav> (ver el comentario en printCurrentView).
    // "beforeprint" queda como red de respaldo (ej. si alguien usa
    // Ctrl+P directo) -- no garantiza el mismo timing exacto, pero es
    // mejor que nada. "afterprint" siempre restaura, sin apuro de timing.
    // flushSync fuerza a React a aplicar el cambio al DOM real de forma
    // sincrónica, ahí mismo, en vez de dejarlo para el siguiente ciclo
    // -- importante en el fallback de "beforeprint" (Ctrl+P directo, sin
    // pasar por printCurrentView), donde no hay margen para esperar dos
    // requestAnimationFrame antes de que el navegador siga con la
    // impresión.
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("app:enter-print-mode", before);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("app:enter-print-mode", before);
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  const load = useCallback(async (f: TrackeoFilters) => {
    setLoading(true);
    setError(null);
    setCampanaImpactoPage(1);
    setOutliersPage(1);
    setProviderPage(1);
    setCrossPage(1);
    setHoraPrestador("");
    setHoraCampana("");
    setHoraLocalDistribucion(null);
    const r = await Promise.allSettled([
      api.trackeoResumen(f),
      api.trackeoUniversos(f),
      api.trackeoPrestadores(f),
      api.trackeoCampanas(f),
      api.trackeoListaPrestadores(f),
      api.trackeoEstados(f),
      api.trackeoTendencia(f),
      api.trackeoCalidadDatos(f),
      api.trackeoCampanaPrestador(f),
      api.trackeoTiposServicio(f),
      api.trackeoFunnelTiempos(f),
      api.trackeoImpactoCampanas(f),
      api.trackeoEstadosCategorizados(f),
      api.trackeoHabilitadoresAsignacion(f),
      api.trackeoProgramadosFunnel(f),
      api.trackeoOutliers(f),
    ]);
    const errs: string[] = [];
    const take = <T,>(i: number, fn: (x: T) => void) =>
      r[i].status === "fulfilled"
        ? fn((r[i] as PromiseFulfilledResult<T>).value)
        : errs.push(String((r[i] as PromiseRejectedResult).reason));
    take<{ resumen: TrackeoSummary }>(0, (x) => setSummary(x.resumen));
    take<{ universos: TrackeoUniversos }>(1, (x) => setUniverses(x.universos));
    take<{
      prestadores: PrestadorMetric[];
      advertencia_tipos_mezclados?: string | null;
    }>(2, (x) => {
      setProviders(x.prestadores);
      setPrestadoresWarning(x.advertencia_tipos_mezclados || null);
    });
    take<{ campanas: CampanaMetric[] }>(3, (x) => setCampaigns(x.campanas));
    take<{ prestadores: PrestadorOption[] }>(4, (x) =>
      setProviderOptions(x.prestadores),
    );
    take<{ estados: EstadoOption[] }>(5, (x) => setStates(x.estados));
    take<{ tendencia: TrendPoint[] }>(6, (x) => setTrend(x.tendencia));
    take<{ calidad: DataQuality; trazabilidad: Trazabilidad }>(7, (x) => {
      setQuality(x.calidad);
      setTrazabilidad(x.trazabilidad);
    });
    take<{ resultados: CampanaPrestadorMetric[] }>(8, (x) =>
      setCross(x.resultados),
    );
    take<{ tipos: TipoOption[] }>(9, (x) => setTypes(x.tipos));
    take<FunnelTiempos>(10, (x) => setFunnel(x));
    take<{ campanas: CampanaImpacto[] }>(11, (x) =>
      setCampanaImpacto(x.campanas),
    );
    take<EstadosCategorizados>(12, (x) => setEstadosCategorizados(x));
    take<HabilitadoresAsignacion>(13, (x) => setHabilitadores(x));
    take<ProgramadosFunnel>(14, (x) => setProgramadosFunnel(x));
    take<Outliers>(15, (x) => setOutliers(x));
    if (errs.length) setError(errs.join(" | "));
    setLoading(false);
  }, []);
  useEffect(() => {
    load(filters);
  }, [filters, load]);
  useEffect(() => {
    // NUEVO (ADITIVO): filtros locales de "Distribución horaria" por
    // prestador y/o campaña. Siempre parten de `filters` (los filtros
    // globales activos) y solo agregan una restriccion mas encima --
    // nunca los reemplazan ni los ignoran. `horaPrestador`/`horaCampana`
    // solo pueden valer algo que ya viene de `providers`/`cross`, que a
    // su vez ya estan acotados por los filtros globales (ver <select>
    // mas abajo).
    if (!horaPrestador && !horaCampana) {
      setHoraLocalDistribucion(null);
      return;
    }
    let cancelado = false;
    setHoraLocalLoading(true);
    api
      .trackeoFunnelTiempos({
        ...filters,
        ...(horaPrestador ? { prestador_ids: [horaPrestador] } : {}),
        ...(horaCampana ? { campanas: [horaCampana] } : {}),
      })
      .then((x) => {
        if (!cancelado) setHoraLocalDistribucion(x.distribucion_horaria);
      })
      .catch(() => {
        if (!cancelado) setHoraLocalDistribucion(null);
      })
      .finally(() => {
        if (!cancelado) setHoraLocalLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [horaPrestador, horaCampana, filters]);
  useEffect(() => {
    // NUEVO (ADITIVO): solo se pide cuando la pestaña "Inteligencia
    // Operativa" está activa, para no sumar un pedido más en cada
    // cambio de filtro si el usuario nunca la visita. Siempre parte
    // de `filters` (los mismos 5 filtros globales de toda la
    // plataforma).
    if (page !== "intelligence") return;
    let cancelado = false;
    setInteligenciaLoading(true);
    setInteligenciaPage(1);
    api
      .inteligenciaPrestadores(filters)
      .then((x) => {
        if (!cancelado) setInteligencia(x);
      })
      .catch(() => {
        if (!cancelado) setInteligencia(null);
      })
      .finally(() => {
        if (!cancelado) setInteligenciaLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [page, filters]);
  useEffect(() => {
    let cancelado = false;
    api
      .alertas(filters)
      .then((x) => {
        if (!cancelado) setAlertas(x);
      })
      .catch(() => {
        if (!cancelado) setAlertas(null);
      });
    return () => {
      cancelado = true;
    };
  }, [filters]);
  useEffect(() => {
    const run = () =>
      api
        .health()
        .then((x) => setBackend({ ok: x.ok, version: x.version }))
        .catch(() => setBackend({ ok: false, version: "" }));
    run();
    const t = setInterval(run, 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const p = new URLSearchParams({
      desde: filters.fecha_desde,
      hasta: filters.fecha_hasta,
      page,
    });
    filters.campanas.forEach((x) => p.append("campana", x));
    filters.prestador_ids.forEach((x) => p.append("prestador_id", x));
    filters.estados.forEach((x) => p.append("estado", x));
    filters.tipos.forEach((x) => p.append("tipo", x));
    history.replaceState(null, "", `?${p}`);
  }, [filters, page]);
  const campOpts = campaigns.map((x) => ({
      value: x.campana,
      label: `${x.campana} (${nf(x.servicios)})`,
    })),
    provOpts = providerOptions.map((x) => ({
      value: x.prestador_id,
      label: x.prestador,
    })),
    stateOpts = states.map((x) => ({
      value: x.estado_normalizado,
      label: `${x.estado} (${nf(x.cantidad)})`,
    })),
    typeOpts = types.map((x) => ({
      value: x.tipo_normalizado,
      label: `${x.tipo_de_servicio} (${nf(x.cantidad)})`,
    })),
    // NUEVO (ADITIVO): opciones de campaña para el filtro local del
    // gráfico "Servicios por hora del día", derivadas de `cross`
    // (/campana-prestador), que ya respeta los 5 filtros globales
    // activos (incluida la campaña, a diferencia de `campaigns`/
    // `campOpts`, que la excluye a proposito para poblar el selector
    // global). Asi, si ya elegiste campañas puntuales arriba, acá solo
    // se ofrecen esas.
    horaCampanaOpts = Array.from(
      new Map(cross.map((c) => [c.campana_normalizada, c.campana])).values(),
    ).map((c) => ({ value: c, label: c }));
  async function open(
    metric: MetricaTrackeo,
    title: string,
    p = 1,
    size = 100,
  ) {
    setDrill((d) => ({
      title,
      metric,
      rows: d?.metric === metric ? d.rows : [],
      total: d?.metric === metric ? d.total : 0,
      page: p,
      pages: d?.pages || 0,
      pageSize: size,
      loading: true,
      exporting: false,
      error: null,
    }));
    try {
      const x = await api.trackeoServiciosPaginados(filters, metric, p, size);
      setDrill({
        title,
        metric,
        rows: x.servicios,
        total: x.cantidad_total,
        page: x.pagina,
        pages: x.total_paginas,
        pageSize: x.tamano_pagina,
        loading: false,
        exporting: false,
        error: null,
      });
    } catch (e) {
      setDrill((d) => (d ? { ...d, loading: false, error: String(e) } : null));
    }
  }
  async function exportAll() {
    if (!drill) return;
    setDrill({ ...drill, exporting: true });
    try {
      const rows: TrackeoService[] = [];
      for (let p = 1; p <= Math.ceil(drill.total / 500); p++) {
        rows.push(
          ...(
            await api.trackeoServiciosPaginados(filters, drill.metric, p, 500)
          ).servicios,
        );
        await sleep(250);
      }
      csv(
        rows as unknown as Record<string, unknown>[],
        `detalle-${drill.metric}.csv`,
      );
      setDrill((d) => (d ? { ...d, exporting: false } : null));
    } catch (e) {
      setDrill((d) =>
        d ? { ...d, exporting: false, error: String(e) } : null,
      );
    }
  }
  async function upload() {
    if (!file) return;
    setUploading(true);
    setUploadMessage("Subiendo…");
    try {
      const x = await api.ingest(file);
      if (x.status === "duplicado") {
        setUploadMessage(x.mensaje || "Archivo duplicado");
        return;
      }
      if (!x.report_id) throw Error("No se recibió report_id");
      for (let i = 0; i < 600; i++) {
        const s = await api.ingestStatus(x.report_id);
        setUploadStatus(s);
        setUploadMessage(
          `${s.etapa || s.status}: ${nf(s.filas_procesadas)} filas`,
        );
        if (s.status === "procesado") {
          await load(filters);
          setFile(null);
          return;
        }
        if (["error", "cancelado"].includes(s.status))
          throw Error(s.error_msg || s.status);
        await sleep(3000);
      }
    } catch (e) {
      setUploadMessage(String(e));
    } finally {
      setUploading(false);
    }
  }
  const qualityRows: [string, number][] = quality
    ? [
        ["Tipo de servicio", quality.tipo_servicio_completo],
        ["Estado", quality.estado_completo],
        ["Campaña", quality.campana_completa],
        ["Prestador", quality.prestador_completo],
        ["Despachador", quality.despachador_completo],
        ["Coordenadas", quality.coordenadas_disponibles],
        ["Móvil registrado", quality.movil_registrado],
        ["Demora prometida", quality.demora_prometida_completa],
        ["Demora real", quality.demora_real_completa],
      ]
    : [];
  // NUEVO (ADITIVO): derivados para la pantalla "Inteligencia
  // Operativa", todos calculados en el cliente a partir de la misma
  // lista que ya trajo /api/inteligencia/prestadores -- no son
  // pedidos adicionales al backend.
  const prestadoresEvaluables = (inteligencia?.prestadores || []).filter(
      (p) => p.clasificacion !== "muestra_insuficiente",
    ),
    top3Peores = [...prestadoresEvaluables]
      .sort((a, b) => (a.percentil_benchmark ?? 0) - (b.percentil_benchmark ?? 0))
      .slice(0, 3),
    top3Mejores = [...prestadoresEvaluables]
      .sort((a, b) => (b.percentil_benchmark ?? 0) - (a.percentil_benchmark ?? 0))
      .slice(0, 3),
    avisosImportantes = [...prestadoresEvaluables]
      .filter((p) => p.clasificacion === "urgente" || p.clasificacion === "atencion")
      .sort((a, b) => (a.percentil_benchmark ?? 0) - (b.percentil_benchmark ?? 0))
      .slice(0, 6),
    destacadosParaRecomendar = [...prestadoresEvaluables]
      .filter((p) => p.clasificacion === "destacado")
      .slice(0, 3);
  const filteredProviders = providers.filter((x) =>
      x.prestador.toLowerCase().includes(providerSearch.toLowerCase()),
    ),
    filteredCross = cross.filter((x) => {
      const q = crossSearch.toLowerCase();
      return (
        x.prestador.toLowerCase().includes(q) ||
        x.campana.toLowerCase().includes(q)
      );
    });
  // ---------- NUEVO (ADITIVO): orden por columna en cada tabla ----------
  const sortCampanaImpacto = useSort(
      campanaImpacto,
      "impacto_asignacion",
      "desc",
      {
        cumplimiento_demora_trazable: (r) =>
          r.servicios_evaluados_demora_trazable > 0
            ? r.cumplimiento_demora_trazable
            : null,
      },
    ),
    sortOutliers = useSort(
      outliers?.[outlierTramo]?.top || [],
      "valor_minutos",
      "desc",
    ),
    sortProviders = useSort(filteredProviders, "total_general", "desc"),
    sortCross = useSort(filteredCross, "total_general", "desc"),
    sortInteligencia = useSort(
      inteligencia?.prestadores || [],
      "percentil_benchmark",
      "asc",
      {
        clasificacion: (r) => CLASIFICACION_RANK[r.clasificacion],
      },
    ),
    sortDrill = useSort(drill?.rows || [], "fecha", "desc");
  // Al reordenar una tabla paginada, siempre volvemos a la página 1 para
  // no dejar al usuario viendo una página "vieja" de un orden distinto.
  const sortCampanaImpactoPageable: SortState = {
      ...sortCampanaImpacto,
      toggle: (k, d) => {
        sortCampanaImpacto.toggle(k, d);
        setCampanaImpactoPage(1);
      },
    },
    sortOutliersPageable: SortState = {
      ...sortOutliers,
      toggle: (k, d) => {
        sortOutliers.toggle(k, d);
        setOutliersPage(1);
      },
    },
    sortInteligenciaPageable: SortState = {
      ...sortInteligencia,
      toggle: (k, d) => {
        sortInteligencia.toggle(k, d);
        setInteligenciaPage(1);
      },
    },
    sortProvidersPageable: SortState = {
      ...sortProviders,
      toggle: (k, d) => {
        sortProviders.toggle(k, d);
        setProviderPage(1);
      },
    },
    sortCrossPageable: SortState = {
      ...sortCross,
      toggle: (k, d) => {
        sortCross.toggle(k, d);
        setCrossPage(1);
      },
    };
  const displayedProviders = sortProviders.sorted;
  const ranges: [
    string,
    number | undefined,
    number | undefined,
    MetricaTrackeo,
  ][] = [
    [
      "Menos de 60",
      summary?.menos_60_cantidad,
      summary?.menos_60_porcentaje,
      "MENOS_60",
    ],
    [
      "61 a 90",
      summary?.entre_61_90_cantidad,
      summary?.entre_61_90_porcentaje,
      "ENTRE_61_90",
    ],
    [
      "91 a 120",
      summary?.entre_91_120_cantidad,
      summary?.entre_91_120_porcentaje,
      "ENTRE_91_120",
    ],
    [
      "121 a 180",
      summary?.entre_121_180_cantidad,
      summary?.entre_121_180_porcentaje,
      "ENTRE_121_180",
    ],
    [
      "Más de 181",
      summary?.mas_181_cantidad,
      summary?.mas_181_porcentaje,
      "MAS_181",
    ],
    ["N/A", summary?.na_cantidad, summary?.na_porcentaje, "NA"],
  ];

  const qualityColor = (ratio: number) =>
    ratio >= 0.95 ? "#006058" : ratio >= 0.7 ? "#f59e0b" : "#ba1a1a";
  const qualityIcon = (ratio: number) =>
    ratio >= 0.95 ? (
      <Icon name="check_circle" filled className="text-[16px] text-tertiary" />
    ) : ratio >= 0.7 ? (
      <Icon name="warning" filled className="text-[16px] text-[#f59e0b]" />
    ) : (
      <Icon name="cancel" filled className="text-[16px] text-error" />
    );

  return (
    <div
      className={`font-body-md text-body-md min-h-screen flex bg-background text-on-background${printing ? " is-printing" : ""}`}
    >
      {/* ---------- Sidebar ----------
          NO se oculta por CSS: se saca del DOM directamente cuando
          "printing" es true (ver el useEffect de beforeprint/afterprint
          más arriba), porque display:none en @media print no alcanzaba
          a evitar que apareciera en el PDF (ver CONTEXTO.md). */}
      {!printing && (
        <nav className="fixed left-0 top-0 h-screen w-sidebar-width z-50 flex flex-col bg-on-primary-fixed">
          <div className="px-md py-md flex flex-col gap-xs mb-sm">
            <h1 className="text-headline-md font-headline-md font-bold text-on-primary">
              Reportería
            </h1>
            <span className="text-label-sm font-label-sm text-primary-fixed-dim uppercase tracking-widest opacity-80">
              Prestadores
            </span>
          </div>
          <div className="flex flex-col flex-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.page}
                type="button"
                aria-current={page === item.page ? "page" : undefined}
                onClick={() => setPage(item.page)}
                className={`mx-2 my-1 px-4 py-3 rounded-lg flex items-center gap-3 text-left transition-colors ${
                  page === item.page
                    ? "bg-primary-container text-on-primary-container"
                    : "text-on-primary-fixed-variant hover:bg-white/10"
                }`}
              >
                <Icon name={item.icon} filled={page === item.page} />
                <span className="font-label-md text-label-md">{item.label}</span>
              </button>
            ))}
          </div>
          <div className="px-md py-md mt-auto">
            <div className="text-on-primary-fixed-variant rounded-lg flex items-center gap-3 opacity-80">
              <Icon name="dns" className="text-[16px]" />
              <span className="font-label-sm text-label-sm flex flex-col">
                Backend v{backend.version}
                <b className={backend.ok ? "text-tertiary-fixed-dim" : "text-error-container"}>
                  {backend.ok ? "Conectado" : "Sin conexión"}
                </b>
              </span>
            </div>
          </div>
        </nav>
      )}

      {/* ---------- Contenido principal ---------- */}
      <div
        className={
          printing
            ? "flex-1 flex flex-col w-full min-h-screen"
            : "flex-1 flex flex-col ml-sidebar-width w-[calc(100%-260px)] min-h-screen"
        }
      >
        <header className="flex justify-end items-center h-16 w-full px-md z-40 bg-surface shrink-0">
          <div className="flex items-center gap-sm text-on-surface-variant">
            <NotificationBell alertas={alertas} setPage={setPage} />
            <button
              type="button"
              className="p-2 hover:bg-surface-container-low transition-colors rounded-full flex items-center justify-center print:hidden"
              onClick={() => setHelpOpen(true)}
            >
              <Icon name="help" />
            </button>
            <button className="p-2 hover:bg-surface-container-low transition-colors rounded-full flex items-center justify-center ml-xs">
              <Icon name="account_circle" className="text-[32px]" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-container-max mx-auto p-xl flex flex-col gap-xl">
            {/* ---------- Filtros globales ---------- */}
            {page !== "upload" && page !== "intelligence" && (
              <section className="flex flex-col gap-md">
                {page === "metrics" && (
                  <div className="flex justify-between items-end flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <Icon name="analytics" className="text-primary text-[32px]" filled />
                      <h2 className="font-display-lg text-display-lg text-on-surface">
                        Métricas de Trackeo
                      </h2>
                    </div>
                    <ExportButton
                      label="Exportar Reporte"
                      className="bg-primary-container text-on-primary-container px-sm py-xs rounded-lg font-label-md text-label-md hover:bg-primary hover:text-on-primary transition-colors flex items-center gap-2"
                      rows={() =>
                        summary ? [summary as unknown as Record<string, unknown>] : []
                      }
                      fileBaseName="resumen-trackeo"
                      pdfTitle="Resumen de métricas de trackeo"
                    />
                  </div>
                )}
                <div className="bg-surface-container-lowest p-md rounded-xl card-shadow border border-outline-variant/20 flex flex-wrap items-end gap-md">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                        Desde
                      </label>
                      <input
                        className="form-input-styled font-body-md text-body-md text-on-surface"
                        type="date"
                        value={draft.fecha_desde}
                        onChange={(e) =>
                          setDraft({ ...draft, fecha_desde: e.target.value })
                        }
                      />
                    </div>
                    <Icon name="arrow_right_alt" className="text-outline-variant mt-5" />
                    <div className="flex flex-col gap-1">
                      <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                        Hasta
                      </label>
                      <input
                        className="form-input-styled font-body-md text-body-md text-on-surface"
                        type="date"
                        value={draft.fecha_hasta}
                        onChange={(e) =>
                          setDraft({ ...draft, fecha_hasta: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <MultiSelect
                    label="Campañas"
                    values={draft.campanas}
                    options={campOpts}
                    placeholder="Todas las campañas"
                    onChange={(campanas) => setDraft({ ...draft, campanas })}
                  />
                  <MultiSelect
                    label="Prestadores"
                    values={draft.prestador_ids}
                    options={provOpts}
                    placeholder="Todos los prestadores"
                    onChange={(prestador_ids) =>
                      setDraft({ ...draft, prestador_ids })
                    }
                  />
                  <MultiSelect
                    label="Estados"
                    values={draft.estados}
                    options={stateOpts}
                    placeholder="Todos"
                    onChange={(estados) => setDraft({ ...draft, estados })}
                  />
                  <MultiSelect
                    label="Tipo servicio"
                    values={draft.tipos}
                    options={typeOpts}
                    placeholder="Todos los tipos"
                    onChange={(tipos) => setDraft({ ...draft, tipos })}
                  />
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      className="form-input-styled font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors"
                      onClick={() => {
                        setDraft(DEFAULT);
                        setFilters(DEFAULT);
                      }}
                    >
                      Restablecer
                    </button>
                    <button
                      className="h-10 px-sm rounded bg-primary text-on-primary font-label-md text-label-md flex items-center gap-2 hover:opacity-90 transition-opacity"
                      onClick={() => setFilters({ ...draft })}
                    >
                      {loading && <Spinner className="text-[16px]" />}
                      Aplicar filtros
                    </button>
                  </div>
                </div>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  Estado y Tipo de servicio 100% manuales. Sin selección se incluyen
                  todos los valores, igual que sin filtrar esa columna en Excel.
                </p>
              </section>
            )}

            {error && (
              <div className="bg-error-container text-on-error-container rounded-lg px-md py-sm flex items-center gap-2 font-body-md text-body-md">
                <Icon name="error" />
                {error}
              </div>
            )}

            {page === "metrics" && (
              <>
                {/* ---------- Universos analíticos ---------- */}
                <section className="flex flex-col gap-sm">
                  <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                    Universos analíticos
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-md pt-xs">
                    <Card
                      icon={<Icon name="list_alt" filled />}
                      title="Servicios en el periodo"
                      value={nf(universes?.servicios_cargados)}
                      detail="Total visible para las fechas"
                      tooltip={{
                        leer: "Todos los servicios que entran en el rango de fechas elegido, sin importar tipo, estado, campaña ni prestador.",
                        calculo: "Cuenta filas cuya fecha de alta cae entre Desde y Hasta.",
                      }}
                    />
                    <Card
                      icon={<Icon name="local_shipping" filled />}
                      title="Servicios vehiculares"
                      value={nf(universes?.servicios_vehiculares)}
                      detail="Tipos operativos seleccionados"
                      tooltip={{
                        leer: "De esos, cuántos son del tipo de servicio que involucra un vehículo (remolques, extracciones, mecánica, etc.).",
                        calculo: "Marca definida en el catálogo de tipos de servicio.",
                      }}
                    />
                    <Card
                      icon={<Icon name="check_circle" filled />}
                      title="Servicios evaluables"
                      value={nf(universes?.servicios_evaluables)}
                      detail="Base seleccionada para KPI"
                      tone="green"
                      tooltip={{
                        leer: "De los vehiculares, cuántos están en condiciones de ser evaluados (no cancelados antes de tiempo, con un estado reconocido).",
                        calculo: "Marca definida en el catálogo de estados/tipos.",
                      }}
                    />
                    <Card
                      icon={<Icon name="cancel" filled />}
                      title="Vehiculares cancelados"
                      value={nf(universes?.servicios_cancelados)}
                      detail="Estados cancelados"
                      tone="red"
                      tooltip={{
                        leer: "De los vehiculares, cuántos terminaron cancelados.",
                        calculo: "Vehiculares con estado marcado como cancelado.",
                      }}
                    />
                    <Card
                      icon={<Icon name="warning" filled />}
                      title="Vehiculares no finalizados"
                      value={nf(universes?.servicios_no_finalizados)}
                      detail="Pendientes o en curso"
                      tone="amber"
                      tooltip={{
                        leer: "De los vehiculares, cuántos siguen pendientes o en curso, todavía sin llegar a un cierre ni cancelación.",
                        calculo: "Vehiculares cuyo estado no está marcado como final ni como cancelado.",
                      }}
                    />
                    <Card
                      icon={<Icon name="filter_alt" filled />}
                      title="Universo seleccionado"
                      value={nf(summary?.servicios_consultados)}
                      detail={[
                        filters.estados.length === 0
                          ? "Todos los estados"
                          : filters.estados.length === 1
                            ? `Estado: ${filters.estados[0]}`
                            : `${filters.estados.length} estados seleccionados`,
                        filters.tipos.length === 0
                          ? "Todos los tipos"
                          : filters.tipos.length === 1
                            ? `Tipo: ${filters.tipos[0]}`
                            : `${filters.tipos.length} tipos seleccionados`,
                      ].join(" · ")}
                      highlight
                      tooltip={{
                        leer: "Cuántos servicios quedan después de aplicar TODOS los filtros elegidos. Es el denominador real de los indicadores operativos.",
                        calculo: "Filas que pasan los 5 filtros (fecha, campaña, prestador, estado, tipo) a la vez.",
                      }}
                    />
                  </div>
                </section>

                {/* ---------- Tendencia + Indicadores operativos ---------- */}
                <section className="grid grid-cols-1 xl:grid-cols-12 gap-xl">
                  <div className="xl:col-span-8 flex flex-col gap-sm">
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                      Tendencia diaria
                    </h3>
                    <div className="bg-surface-container-lowest rounded-xl p-md card-shadow border border-outline-variant/20 flex-1 min-h-[350px] flex flex-col">
                      <div className="flex justify-between items-center mb-md flex-wrap gap-2">
                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-tertiary" />
                            <span className="font-label-md text-label-md text-on-surface-variant">
                              Cumplimiento de demora
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-primary" />
                            <span className="font-label-md text-label-md text-on-surface-variant">
                              Efectividad enviador
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-[#7c3aed]" />
                            <span className="font-label-md text-label-md text-on-surface-variant">
                              Uso enviador
                            </span>
                          </div>
                        </div>
                      </div>
                      <TrendChart data={trend} />
                    </div>
                  </div>
                  <div className="xl:col-span-4 flex flex-col gap-sm">
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                      Indicadores operativos
                    </h3>
                    <div className="flex flex-col gap-3">
                      <IndicatorRow
                        icon={<Icon name="database" className="text-[18px]" />}
                        label="Servicios seleccionados"
                        value={nf(summary?.servicios_consultados)}
                        detail={`${nf(summary?.enviador_si)} con enviador · ${nf(summary?.enviador_no)} sin enviador`}
                        tooltip={{
                          leer: "El total del universo filtrado, y cuántos de esos pasaron o no por el despacho automático.",
                          calculo: "Total de filas filtradas; el detalle separa por ConEnvioOK = SI / NO.",
                        }}
                      />
                      <IndicatorRow
                        icon={<Icon name="send_to_mobile" className="text-[18px]" />}
                        label="Uso del enviador"
                        value={pct(summary?.uso_enviador)}
                        detail={`${nf(summary?.enviador_si)} servicios`}
                        onClick={() => open("ENVIADOR_SI", "Servicios con enviador")}
                        tooltip={{
                          leer: "Qué porcentaje de los servicios pasó por el despacho automático (\"el enviador\"), en vez de asignarse a mano.",
                          calculo: "ConEnvioOK = SI ÷ total del universo filtrado.",
                        }}
                      />
                      <IndicatorRow
                        icon={<Icon name="rv_hookup" className="text-[18px]" />}
                        label="Asigna móvil"
                        value={nf(summary?.asigna_movil)}
                        detail={`${pct(summary?.efectividad_enviador)} efectividad`}
                        onClick={() => open("ASIGNA_MOVIL", "Asigna móvil")}
                        tooltip={{
                          leer: "Cuántos servicios terminaron con un móvil asignado. \"% efectividad\" es más específico: de los que usaron el enviador, a cuántos les asignó un móvil.",
                          calculo: "Principal: AsignoMovil=SI ÷ total filtrado. Efectividad: AsignoMovil=SI ÷ ConEnvioOK=SI.",
                        }}
                      />
                      <IndicatorRow
                        icon={<Icon name="mobile_off" className="text-[18px]" />}
                        label="No asigna móvil"
                        value={nf(summary?.no_asigna_movil_cantidad)}
                        detail={pct(summary?.no_asigna_movil_porcentaje)}
                        onClick={() => open("NO_ASIGNA_MOVIL", "No asigna móvil")}
                        tooltip={{
                          leer: "El espejo del anterior: servicios que no terminaron con un móvil asignado.",
                          calculo: "AsignoMovil ≠ SI ÷ total del universo filtrado.",
                        }}
                      />
                      <IndicatorRow
                        icon={<Icon name="event_available" className="text-[18px]" />}
                        label="Servicios programados"
                        value={nf(summary?.servicios_programados)}
                        detail={pct(summary?.programados_porcentaje)}
                        onClick={() => open("PROGRAMADOS", "Programados")}
                        tooltip={{
                          leer: "Cuántos servicios del universo filtrado estaban agendados para un horario específico, en vez de ser una urgencia inmediata.",
                          calculo: "EsProgramado = SI ÷ total del universo filtrado.",
                        }}
                      />
                      <IndicatorRow
                        icon={<Icon name="timer" className="text-[18px]" />}
                        label="Cumplimiento de demora"
                        value={
                          (summary?.servicios_evaluados_demora ?? 0) > 0
                            ? pct(summary?.cumplimiento_demora)
                            : "N/A"
                        }
                        detail={`${nf(summary?.servicios_cumplidos)} cumplen · ${nf(summary?.servicios_no_cumplidos)} no cumplen`}
                        onClick={() => open("CUMPLE_DEMORA", "Cumple demora")}
                        tooltip={{
                          leer: "El termómetro oficial de SLA: qué % llegó dentro del tiempo prometido (con 14 min de tolerancia). Si falta el tiempo real, igual cuenta como si hubiera llegado al instante — ver \"Cumplimiento observado\" al lado.",
                          calculo: "Cumple si DemoraReal ≤ DemoraPrometida + 14 (celda vacía cuenta como 0).",
                        }}
                      />
                      {/* NUEVO (ADITIVO): separa el cumplimiento "formula
                          Excel" (arriba) del cumplimiento observado solo
                          sobre servicios con trazabilidad completa, más
                          qué proporción del universo tiene esa
                          trazabilidad. No reemplaza la tarjeta anterior. */}
                      <IndicatorRow
                        icon={<Icon name="verified" className="text-[18px]" />}
                        label="Cumplimiento observado (trazable)"
                        value={
                          (summary?.servicios_evaluados_demora_trazable ?? 0) > 0
                            ? pct(summary?.cumplimiento_demora_trazable)
                            : "N/A"
                        }
                        detail={`${nf(summary?.servicios_cumplidos_trazable)} cumplen · ${nf(summary?.servicios_no_cumplidos_trazable)} no cumplen (con Demora Prometida y Real cargadas)`}
                        onClick={() =>
                          open("CUMPLE_DEMORA_TRAZABLE", "Cumple demora (trazable)")
                        }
                        tooltip={{
                          leer: "La misma pregunta, pero contestada SOLO con los servicios que tienen registrados tanto el tiempo prometido como el real — sin inflar el resultado. Suele ser más bajo, y es el número más honesto para evaluar performance real.",
                          calculo: "Misma fórmula, pero solo sobre filas con DemoraPrometida y DemoraReal cargadas.",
                        }}
                      />
                      <IndicatorRow
                        icon={<Icon name="fact_check" className="text-[18px]" />}
                        label="Cobertura de medición de demora"
                        value={pct(summary?.cobertura_medicion_demora)}
                        detail={`${nf(summary?.servicios_evaluados_demora_trazable)} de ${nf(summary?.servicios_consultados)} servicios con Demora Prometida y Real cargadas`}
                        tooltip={{
                          leer: "Qué % del universo filtrado tiene los datos completos como para medir su cumplimiento de verdad. Si es bajo, los dos indicadores anteriores hay que leerlos con pinzas.",
                          calculo: "Filas con DemoraPrometida y DemoraReal cargadas ÷ total del universo filtrado.",
                        }}
                      />
                    </div>
                  </div>
                </section>

                {/* ---------- Distribución + Calidad ---------- */}
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
                  <div className="flex flex-col gap-sm">
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                      Distribución de servicios cumplidos
                      <InfoTip
                        leer="De los servicios que SÍ cumplieron la demora prometida, cuánto tiempo real tardaron — para distinguir un cumplimiento justo de uno con mucho margen."
                        calculo="Se agrupan las filas que cumplieron, usando el valor tal cual viene en RangoDemoraReal."
                      />
                    </h3>
                    <p className="font-label-sm text-label-sm text-on-surface-variant -mt-2">
                      Sobre {nf(summary?.servicios_cumplidos)} servicios cumplidos.
                    </p>
                    <div className="bg-surface-container-lowest rounded-xl p-md card-shadow border border-outline-variant/20 flex flex-col gap-4">
                      {ranges.map(([label, count, r, m]) => (
                        <ProgressBar
                          key={m}
                          label={label}
                          valueLabel={`${nf(count)} · ${pct(r)}`}
                          ratio={r || 0}
                          color="#004ac6"
                          onClick={() => open(m, label)}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-sm">
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                      Calidad de información
                      <InfoTip
                        leer="No mide performance operativa — mide qué tan completo está el Excel cargado. Un dato faltante puede ser tan importante como un mal resultado."
                        calculo="Por cada campo: filas con esa columna no vacía ÷ total del universo filtrado."
                      />
                    </h3>
                    <p className="font-label-sm text-label-sm text-on-surface-variant -mt-2">
                      Completitud sobre el universo filtrado.
                    </p>
                    <div className="bg-surface-container-lowest rounded-xl p-md card-shadow border border-outline-variant/20 flex flex-col gap-4">
                      {qualityRows.map(([label, value]) => {
                        const ratio = quality?.total ? value / quality.total : 0;
                        return (
                          <ProgressBar
                            key={label}
                            label={label}
                            icon={qualityIcon(ratio)}
                            valueLabel={`${nf(value)} de ${nf(quality?.total)} · ${pct(ratio)}`}
                            ratio={ratio}
                            color={qualityColor(ratio)}
                          />
                        );
                      })}
                    </div>
                  </div>
                </section>

                {/* ---------- NUEVO (ADITIVO): Funnel de tiempos, en lenguaje simple ---------- */}
                <section className="flex flex-col gap-sm">
                  <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                    Tiempos del prestador
                  </h3>
                  <p className="font-label-sm text-label-sm text-on-surface-variant -mt-2">
                    Cuánto tarda el prestador en cada etapa, desde que le
                    asignan el servicio hasta que lo termina. No incluye el
                    tiempo previo a la asignación, que es operativa interna
                    de Cardinal.
                  </p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
                    <TramoCard
                      label="Cuánto tarda en llegar"
                      icon="directions_car"
                      stats={funnel?.tiempos.t4_asignacion_a_arribo}
                      explicacion="Así de rápido llega el prestador al lugar una vez que le asignan el servicio."
                      tooltip={{
                        leer: "Cuánto tarda el móvil en llegar al lugar, desde que se confirma el envío.",
                        calculo: "HoraQueLlegoADarServicio − FechaHoraEnvioOk, en minutos.",
                      }}
                    />
                    <TramoCard
                      label="Cuánto tarda en resolver el servicio"
                      icon="build"
                      stats={funnel?.tiempos.t5_ejecucion}
                      explicacion="Así de rápido resuelve el prestador el servicio, desde que llega hasta que termina."
                      tooltip={{
                        leer: "Cuánto dura la atención del servicio en el lugar, desde que llega el móvil hasta que termina.",
                        calculo: "HoraQueFinalizaServicio − HoraQueLlegoADarServicio.",
                      }}
                    />
                  </div>
                </section>

                <section className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
                  <div className="flex flex-col gap-sm">
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                      SLA de llegada
                      <InfoTip
                        leer="De los servicios con tiempo prometido y real cargados, cuántos llegaron a tiempo, y cuánto se pasaron los que no."
                        calculo="Bandas sobre DemoraReal − DemoraPrometida."
                      />
                    </h3>
                    <p className="font-label-sm text-label-sm text-on-surface-variant -mt-2">
                      DemoraReal − DemoraPrometida · sobre{" "}
                      {nf(funnel?.sla_llegada.cantidad_evaluable)} servicios con
                      trazabilidad completa.
                    </p>
                    <div className="bg-surface-container-lowest rounded-xl p-md card-shadow border border-outline-variant/20 flex flex-col gap-4">
                      {(funnel?.sla_llegada.buckets || []).map((b) => (
                        <ProgressBar
                          key={b.etiqueta}
                          label={b.etiqueta}
                          valueLabel={`${nf(b.cantidad)} · ${pct(b.porcentaje)}`}
                          ratio={b.porcentaje}
                          color="#006058"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-sm">
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                      &nbsp;
                    </h3>
                    <TramoCard
                      label="Cuánto dura todo el proceso"
                      icon="flag_circle"
                      stats={funnel?.tiempos.t6_end_to_end}
                      explicacion="Así de rápido es el recorrido completo del servicio, de punta a punta."
                      tooltip={{
                        leer: "El viaje completo del servicio, de punta a punta, desde que se crea hasta que se cierra.",
                        calculo: "HoraQueFinalizaServicio − AltaDelServicio.",
                      }}
                    />
                  </div>
                </section>

                {/* ---------- NUEVO (ADITIVO): Impacto por campaña ---------- */}
                <section className="flex flex-col gap-sm">
                  <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                    Impacto por campaña
                  </h3>
                  <p className="font-label-sm text-label-sm text-on-surface-variant -mt-2">
                    Impacto = volumen × oportunidad de mejora. Una campaña grande
                    con performance mediocre puede pesar más que una chica con
                    peor porcentaje — ordenado por impacto en asignación, no por
                    porcentaje.
                  </p>
                  <div className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col">
                    <div className="overflow-x-auto">
                      <table className="w-full text-body-md font-body-md">
                        <thead>
                          <tr className="text-label-md font-label-md text-on-surface-variant uppercase text-left border-b border-outline-variant/30">
                            <SortableTh
                              label="Campaña"
                              sortKey="campana"
                              sort={sortCampanaImpactoPageable}
                              defaultDir="asc"
                              className="py-2 pl-md pr-3"
                            />
                            <SortableTh
                              label="Total"
                              sortKey="total_general"
                              sort={sortCampanaImpactoPageable}
                            />
                            <SortableTh
                              label="Efectividad asignación"
                              sortKey="efectividad_enviador"
                              sort={sortCampanaImpactoPageable}
                              tooltip={{
                                leer: "De los servicios que usaron el enviador, qué % terminó con un móvil asignado.",
                                calculo: "AsignoMovil=SI ÷ ConEnvioOK=SI, dentro de esa campaña.",
                              }}
                            />
                            <SortableTh
                              label="Cumplimiento observado"
                              sortKey="cumplimiento_demora_trazable"
                              sort={sortCampanaImpactoPageable}
                              tooltip={{
                                leer: "Cumplimiento de demora de esa campaña, solo sobre servicios con Demora Prometida y Real cargadas.",
                                calculo: "cumplidos ÷ evaluados con ambos datos cargados.",
                              }}
                            />
                            <SortableTh
                              label="Oportunidad asignación"
                              sortKey="oportunidad_mejora_asignacion"
                              sort={sortCampanaImpactoPageable}
                              tooltip={{
                                leer: "Cuánto margen de mejora le queda a la campaña en asignación.",
                                calculo: "1 − efectividad de asignación de esa campaña.",
                              }}
                            />
                            <SortableTh
                              label="Impacto asignación"
                              sortKey="impacto_asignacion"
                              sort={sortCampanaImpactoPageable}
                              className="py-2 pr-md"
                              tooltip={{
                                leer: "Columna por la que se ordena la tabla por defecto: cuántos servicios se ganarían si esa campaña mejorara su asignación al máximo.",
                                calculo: "Total de servicios de la campaña × oportunidad de asignación.",
                              }}
                            />
                          </tr>
                        </thead>
                        <tbody>
                          {sortCampanaImpacto.sorted
                            .slice(
                              (campanaImpactoPage - 1) * 10,
                              campanaImpactoPage * 10,
                            )
                            .map((c) => (
                              <tr
                                key={c.campana_normalizada}
                                className="border-b border-outline-variant/10 hover:bg-surface-container-low"
                              >
                                <td className="py-2 pl-md pr-3 text-on-surface font-medium">
                                  {c.campana}
                                </td>
                                <td className="py-2 pr-3">{nf(c.total_general)}</td>
                                <td className="py-2 pr-3">
                                  {pct(c.efectividad_enviador)}
                                </td>
                                <td className="py-2 pr-3">
                                  {c.servicios_evaluados_demora_trazable > 0
                                    ? pct(c.cumplimiento_demora_trazable)
                                    : "N/A"}
                                </td>
                                <td className="py-2 pr-3">
                                  {pct(c.oportunidad_mejora_asignacion)}
                                </td>
                                <td className="py-2 pr-md font-medium text-on-surface">
                                  {nf(c.impacto_asignacion)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <Pager
                      page={campanaImpactoPage}
                      setPage={setCampanaImpactoPage}
                      total={campanaImpacto.length}
                    />
                  </div>
                </section>

                {/* ---------- NUEVO (ADITIVO): Distribución horaria ---------- */}
                <section className="flex flex-col gap-sm">
                  <div className="flex justify-between items-end flex-wrap gap-2 border-b border-outline-variant/30 pb-xs">
                    <h3 className="font-title-lg text-title-lg text-on-surface flex items-center gap-1">
                      Servicios por hora del día
                      <InfoTip
                        leer="A qué hora del día llega más trabajo — para pensar la dotación de personal según la demanda real, no contra el promedio del día entero."
                        calculo="Cuenta de servicios agrupados por la hora local (Argentina) de AltaDelServicio."
                      />
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        className="form-input-styled font-body-md text-body-md text-on-surface"
                        value={horaCampana}
                        onChange={(e) => setHoraCampana(e.target.value)}
                      >
                        <option value="">Todas las campañas</option>
                        {horaCampanaOpts.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="form-input-styled font-body-md text-body-md text-on-surface"
                        value={horaPrestador}
                        onChange={(e) => setHoraPrestador(e.target.value)}
                      >
                        <option value="">Todos los prestadores</option>
                        {providers.map((p) => (
                          <option key={p.prestador_id} value={p.prestador_id}>
                            {p.prestador}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="font-label-sm text-label-sm text-on-surface-variant -mt-2">
                    Volumen de servicios por hora del día (hora local
                    Argentina) — para dimensionar capacidad contra la demanda
                    real por franja horaria, no solo por día. Los
                    selectores de campaña y prestador solo ofrecen las
                    campañas/prestadores que ya están incluidos en los
                    filtros globales activos, y nunca los reemplazan —
                    solo agregan una restricción más encima.
                  </p>
                  <div className="bg-surface-container-lowest rounded-xl p-md card-shadow border border-outline-variant/20 flex-1 min-h-[350px] flex flex-col">
                    {horaLocalLoading ? (
                      <div className="flex-1 min-h-[300px] flex items-center justify-center">
                        <Spinner className="text-[24px] text-primary" />
                      </div>
                    ) : (
                      <HourlyBarChart
                        data={
                          (horaPrestador || horaCampana) && horaLocalDistribucion
                            ? horaLocalDistribucion
                            : funnel?.distribucion_horaria || []
                        }
                      />
                    )}
                  </div>
                </section>

                {/* ---------- NUEVO (ADITIVO): Estados por categoría ---------- */}
                <section className="flex flex-col gap-sm">
                  <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                    Estados por categoría semántica
                    <InfoTip
                      leer="El Excel trae docenas de estados distintos. Este panel los agrupa en familias (Finalizado, Cancelado, En proceso, Pendiente, Postservicio, Sin clasificar) para leerlos de un vistazo."
                      calculo="Cada estado crudo se asigna a una categoría por nombre exacto o por palabra clave."
                    />
                  </h3>
                  <p className="font-label-sm text-label-sm text-on-surface-variant -mt-2">
                    {estadosCategorizados?.nota ||
                      "Categorización propuesta — revisar antes de usar para decisiones de negocio."}
                  </p>
                  <div className="bg-surface-container-lowest rounded-xl p-md card-shadow border border-outline-variant/20 flex flex-col gap-4">
                    {(estadosCategorizados?.categorias || []).map((c) => (
                      <ProgressBar
                        key={c.categoria}
                        label={c.categoria.replace("_", " ")}
                        valueLabel={`${nf(c.cantidad)} · ${pct(c.porcentaje)}`}
                        ratio={c.porcentaje}
                        color={
                          c.categoria === "FINALIZADO"
                            ? "#006058"
                            : c.categoria === "CANCELADO"
                              ? "#ba1a1a"
                              : c.categoria === "SIN_CLASIFICAR"
                                ? "#f59e0b"
                                : "#004ac6"
                        }
                      />
                    ))}
                  </div>
                  {(estadosCategorizados?.estados_sin_clasificar.length || 0) > 0 && (
                    <div className="bg-[#f59e0b]/10 text-[#7a4a00] rounded-lg px-md py-sm flex items-start gap-2 font-body-md text-body-md">
                      <Icon
                        name="warning"
                        filled
                        className="text-[#f59e0b] shrink-0 mt-0.5"
                      />
                      <div>
                        <b>Estados sin categorizar</b> — revisar y ajustar la
                        clasificación en el backend:
                        <ul className="list-disc pl-5 mt-1">
                          {estadosCategorizados?.estados_sin_clasificar.map((e) => (
                            <li key={e.estado_normalizado}>
                              {e.estado} ({nf(e.cantidad)})
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </section>

                {/* ---------- NUEVO (ADITIVO): Trazabilidad completa ---------- */}
                <section className="flex flex-col gap-sm">
                  <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                    Trazabilidad completa del servicio
                    <InfoTip
                      leer="Distinto de “Calidad de información”: ahí se mide campo por campo; acá se mide si un mismo servicio tiene TODA la cadena de eventos registrada, de punta a punta."
                      calculo="Filas con las 6 columnas de tiempo cargadas ÷ total del universo filtrado."
                    />
                  </h3>
                  <p className="font-label-sm text-label-sm text-on-surface-variant -mt-2">
                    No alcanza con que cada campo esté cargado — esto mide qué
                    % de servicios tiene TODA la secuencia de eventos completa
                    (Alta → Despachador → Asignado → Envío OK → Llegó →
                    Finalizó), necesaria para poder medirlos de punta a punta.
                  </p>
                  <div className="bg-surface-container-lowest rounded-xl p-md card-shadow border border-outline-variant/20 flex flex-col gap-4">
                    <div className="flex items-baseline gap-2">
                      <span className="font-display-lg text-display-lg text-primary">
                        {pct(trazabilidad?.porcentaje_trazabilidad_completa)}
                      </span>
                      <span className="font-body-md text-body-md text-on-surface-variant">
                        {nf(trazabilidad?.servicios_trazabilidad_completa)} de{" "}
                        {nf(trazabilidad?.total)} con secuencia completa
                      </span>
                    </div>
                    <div className="flex flex-col gap-4 pt-2">
                      {(trazabilidad?.funnel_completitud || []).map((e) => (
                        <ProgressBar
                          key={e.etapa}
                          label={e.etapa}
                          valueLabel={`${nf(e.cantidad)} · ${pct(e.porcentaje)}`}
                          ratio={e.porcentaje}
                          color="#004ac6"
                        />
                      ))}
                    </div>
                  </div>
                </section>

                {/* ---------- NUEVO (ADITIVO): Habilitadores de asignación ---------- */}
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
                  <div className="flex flex-col gap-sm">
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                      Coordenadas como habilitador de asignación
                      <InfoTip
                        leer="Compara la efectividad de asignación entre servicios con y sin coordenadas cargadas. Si “con coordenadas” asigna mejor, cargar la ubicación ayuda a conseguir el móvil."
                        calculo="AsignoMovil=SI ÷ ConEnvioOK=SI, separado por si tiene coordenadas o no."
                      />
                    </h3>
                    <p className="font-label-sm text-label-sm text-on-surface-variant -mt-2">
                      Efectividad de asignación (dado que se usó el enviador)
                      según si el servicio tiene coordenadas cargadas.
                    </p>
                    <div className="bg-surface-container-lowest rounded-xl p-md card-shadow border border-outline-variant/20 flex flex-col gap-4">
                      {(
                        [
                          ["Con coordenadas", habilitadores?.coordenadas.con_coordenadas],
                          ["Sin coordenadas", habilitadores?.coordenadas.sin_coordenadas],
                          ["Sin dato", habilitadores?.coordenadas.sin_dato],
                        ] as [string, ResumenAsignacion | undefined][]
                      ).map(([label, r]) => (
                        <ProgressBar
                          key={label}
                          label={`${label} (${nf(r?.total)} servicios)`}
                          valueLabel={
                            r?.enviador_si
                              ? `${nf(r.asigna_movil)} de ${nf(r.enviador_si)} · ${pct(r.efectividad_enviador)}`
                              : "N/A"
                          }
                          ratio={r?.efectividad_enviador || 0}
                          color="#004ac6"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-sm">
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                      MóvilRegistrado como proxy de asignación
                      <InfoTip
                        leer="De los servicios que usaron el enviador, qué % terminó con el móvil concreto registrado en el sistema, y qué tan seguido eso coincide con AsignoMóvil."
                        calculo="MovilRegistrado=SI ÷ ConEnvioOK=SI."
                      />
                    </h3>
                    <p className="font-label-sm text-label-sm text-on-surface-variant -mt-2">
                      Sobre servicios con enviador, tasa de conversión a Móvil
                      Registrado y coincidencia con AsignoMóvil.
                    </p>
                    <div className="bg-surface-container-lowest rounded-xl p-md card-shadow border border-outline-variant/20 flex flex-col gap-4">
                      <ProgressBar
                        label={`Envío OK → Móvil registrado (${nf(habilitadores?.conversion_envio_a_movil_registrado.enviador_si)} servicios)`}
                        valueLabel={`${nf(habilitadores?.conversion_envio_a_movil_registrado.movil_registrado_si)} · ${pct(habilitadores?.conversion_envio_a_movil_registrado.tasa_conversion)}`}
                        ratio={
                          habilitadores?.conversion_envio_a_movil_registrado
                            .tasa_conversion || 0
                        }
                        color="#006058"
                      />
                      <ProgressBar
                        label="Coincidencia MóvilRegistrado = AsignoMóvil"
                        valueLabel={pct(
                          habilitadores?.conversion_envio_a_movil_registrado
                            .coincidencia_movil_registrado_vs_asigno_movil,
                        )}
                        ratio={
                          habilitadores?.conversion_envio_a_movil_registrado
                            .coincidencia_movil_registrado_vs_asigno_movil || 0
                        }
                        color="#7c3aed"
                      />
                    </div>
                  </div>
                </section>

                {/* ---------- NUEVO (ADITIVO): Gestión de programados ---------- */}
                <section className="flex flex-col gap-sm">
                  <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                    Gestión completa de servicios programados
                    <InfoTip
                      leer="“Servicios programados” solo cuenta cuántos estaban agendados. Esto sigue ese mismo grupo paso a paso, hasta ver cuántos realmente se cumplieron en horario."
                      calculo="Funnel: EsProgramado=SI → con prestador → ConEnvioOK → AsignoMovil → ejecutado → finalizado."
                    />
                  </h3>
                  <p className="font-label-sm text-label-sm text-on-surface-variant -mt-2">
                    "Servicios programados" mide solo EsProgramado=SI — esto
                    muestra cuántos de esos efectivamente avanzan hasta
                    finalizar, y cuántos llegaron dentro del horario
                    programado (Fecha/HoraProgramada).
                  </p>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
                    <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl p-md card-shadow border border-outline-variant/20 flex flex-col gap-4">
                      {(programadosFunnel?.funnel || []).map((e) => (
                        <ProgressBar
                          key={e.etapa}
                          label={e.etapa}
                          valueLabel={`${nf(e.cantidad)} · ${pct(e.porcentaje)}`}
                          ratio={e.porcentaje}
                          color="#004ac6"
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        open(
                          "PROGRAMADOS_A_TIEMPO",
                          "Llegada en horario · Cumplieron",
                        )
                      }
                      className="bg-surface-container-lowest rounded-xl p-md card-shadow border border-outline-variant/20 flex flex-col justify-center items-center text-center gap-1 hover:border-primary/40 transition-colors cursor-pointer"
                    >
                      <span className="font-label-md text-label-md text-on-surface-variant uppercase flex items-center gap-1">
                        Llegada en horario
                        <InfoTip
                          leer="De los programados con horario y llegada cargados, qué % llegó puntual o antes de la hora acordada con el cliente."
                          calculo="HoraQueLlegoADarServicio ≤ FechaProgramada + HoraProgramada."
                        />
                      </span>
                      <span className="font-display-lg text-display-lg text-primary">
                        {programadosFunnel?.llegada_en_horario.porcentaje != null
                          ? pct(programadosFunnel.llegada_en_horario.porcentaje)
                          : "N/A"}
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        {nf(programadosFunnel?.llegada_en_horario.a_tiempo)} de{" "}
                        {nf(programadosFunnel?.llegada_en_horario.evaluables)}{" "}
                        con Fecha/HoraProgramada y llegada cargadas
                      </span>
                      <span className="font-label-md text-label-md text-primary mt-1 inline-flex items-center gap-0.5">
                        Ver servicios
                        <Icon name="chevron_right" className="text-[16px]" />
                      </span>
                    </button>
                  </div>
                </section>

                {/* ---------- NUEVO (ADITIVO): Outliers / anomalías ---------- */}
                <section className="flex flex-col gap-sm">
                  <div className="flex justify-between items-end flex-wrap gap-2 border-b border-outline-variant/30 pb-xs">
                    <h3 className="font-title-lg text-title-lg text-on-surface flex items-center gap-1">
                      Outliers por tramo
                      <InfoTip
                        leer="Los promedios y percentiles esconden los casos extremos. Acá se los ve uno por uno, con el prestador y el servicio puntual, para auditarlos."
                        calculo="Top 20 valores más altos del tramo elegido; marcado como posible anomalía si supera 3× el P90 de ese tramo."
                      />
                    </h3>
                    <select
                      className="form-input-styled font-body-md text-body-md text-on-surface"
                      value={outlierTramo}
                      onChange={(e) => {
                        setOutlierTramo(e.target.value as keyof Outliers);
                        setOutliersPage(1);
                      }}
                    >
                      <option value="demora_real">Demora real</option>
                      <option value="t1_alta_a_despachador">T1 · Alta → Despachador</option>
                      <option value="t2_despachador_a_asignacion">T2 · Despachador → Asignación</option>
                      <option value="t3_alta_a_asignacion">T3 · Alta → Asignación</option>
                      <option value="t4_asignacion_a_arribo">T4 · Asignación → Arribo</option>
                      <option value="t5_ejecucion">T5 · Ejecución</option>
                      <option value="t6_end_to_end">T6 · Alta → Fin (end-to-end)</option>
                    </select>
                  </div>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    Top 20 valores más altos del tramo seleccionado, para
                    auditar caso por caso (P90 de referencia:{" "}
                    {nf(outliers?.[outlierTramo]?.p90_referencia)} min · marcado
                    como posible anomalía si supera 3× ese P90).
                  </p>
                  <div className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col">
                    <div className="overflow-x-auto">
                      <table className="w-full text-body-md font-body-md">
                        <thead>
                          <tr className="text-label-md font-label-md text-on-surface-variant uppercase text-left border-b border-outline-variant/30">
                            <SortableTh
                              label="ID servicio"
                              sortKey="id_servicio_prestado"
                              sort={sortOutliersPageable}
                              className="py-2 pl-md pr-3"
                            />
                            <SortableTh
                              label="Prestador"
                              sortKey="prestador"
                              sort={sortOutliersPageable}
                              defaultDir="asc"
                            />
                            <SortableTh
                              label="Campaña"
                              sortKey="campana"
                              sort={sortOutliersPageable}
                              defaultDir="asc"
                            />
                            <SortableTh
                              label="Fecha"
                              sortKey="fecha"
                              sort={sortOutliersPageable}
                            />
                            <SortableTh
                              label="Minutos"
                              sortKey="valor_minutos"
                              sort={sortOutliersPageable}
                              className="py-2 pr-md"
                            />
                          </tr>
                        </thead>
                        <tbody>
                          {sortOutliers.sorted
                            .slice((outliersPage - 1) * 10, outliersPage * 10)
                            .map((o, i) => (
                              <tr
                                key={`${o.id_servicio_prestado}-${i}`}
                                className="border-b border-outline-variant/10 hover:bg-surface-container-low"
                              >
                                <td className="py-2 pl-md pr-3">
                                  {o.id_servicio_prestado}
                                </td>
                                <td className="py-2 pr-3 text-on-surface">
                                  {o.prestador}
                                </td>
                                <td className="py-2 pr-3">{o.campana}</td>
                                <td className="py-2 pr-3">{o.fecha}</td>
                                <td className="py-2 pr-md font-medium">
                                  {nf(o.valor_minutos)}
                                  {o.es_anomalia_probable && (
                                    <span
                                      className="ml-1 text-error"
                                      title="Supera 3x el P90 del tramo"
                                    >
                                      ⚠
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <Pager
                      page={outliersPage}
                      setPage={setOutliersPage}
                      total={(outliers?.[outlierTramo]?.top || []).length}
                    />
                  </div>
                </section>
              </>
            )}

            {page === "providers" && (
              <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col overflow-hidden">
                <header className="flex items-center gap-3 px-md py-md border-b border-outline-variant/20">
                  <Icon name="person_search" className="text-primary text-[32px]" filled />
                  <div>
                    <h2 className="font-display-lg text-display-lg text-on-surface">
                      Detalle por prestador
                    </h2>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      {nf(displayedProviders.length)} prestadores
                    </p>
                  </div>
                </header>
                {prestadoresWarning && (
                  <div className="mx-md mt-md bg-[#f59e0b]/10 text-[#7a4a00] rounded-lg px-md py-sm flex items-start gap-2 font-body-md text-body-md">
                    <Icon name="warning" filled className="text-[#f59e0b] shrink-0 mt-0.5" />
                    {prestadoresWarning}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 px-md py-sm flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="form-input-styled flex items-center gap-2 min-w-[220px]">
                      <Icon name="search" className="text-[18px] text-outline" />
                      <input
                        className="flex-1 outline-none bg-transparent font-body-md text-body-md text-on-surface"
                        placeholder="Buscar prestador…"
                        value={providerSearch}
                        onChange={(e) => {
                          setProviderSearch(e.target.value);
                          setProviderPage(1);
                        }}
                      />
                    </div>
                  </div>
                  <ExportButton
                    rows={() =>
                      displayedProviders as unknown as Record<string, unknown>[]
                    }
                    fileBaseName="prestadores"
                    pdfTitle="Detalle por prestador"
                  />
                </div>
                <div className="overflow-x-auto px-md pb-md">
                  <table className="w-full text-body-md font-body-md">
                    <thead>
                      <tr className="text-label-md font-label-md text-on-surface-variant uppercase text-left border-b border-outline-variant/30">
                        <SortableTh
                          label="Prestador"
                          sortKey="prestador"
                          sort={sortProvidersPageable}
                          defaultDir="asc"
                        />
                        <SortableTh
                          label="Total"
                          sortKey="total_general"
                          sort={sortProvidersPageable}
                        />
                        <SortableTh
                          label="Con enviador"
                          sortKey="enviador_si"
                          sort={sortProvidersPageable}
                        />
                        <SortableTh label="Uso" sortKey="uso_enviador" sort={sortProvidersPageable} />
                        <SortableTh
                          label="Asigna"
                          sortKey="asigna_movil"
                          sort={sortProvidersPageable}
                        />
                        <SortableTh
                          label="Efectividad"
                          sortKey="efectividad_enviador"
                          sort={sortProvidersPageable}
                        />
                        <SortableTh
                          label="Programados"
                          sortKey="servicios_programados"
                          sort={sortProvidersPageable}
                        />
                        <SortableTh
                          label="Cumple"
                          sortKey="servicios_cumplidos"
                          sort={sortProvidersPageable}
                        />
                        <SortableTh
                          label="No cumple"
                          sortKey="servicios_no_cumplidos"
                          sort={sortProvidersPageable}
                        />
                        <SortableTh
                          label="Cumplimiento"
                          sortKey="cumplimiento_demora"
                          sort={sortProvidersPageable}
                        />
                        <SortableTh
                          label="Índice calidad"
                          sortKey="indice_calidad_datos"
                          sort={sortProvidersPageable}
                          tooltip={{
                            leer: "Qué tan completos están, en promedio, los datos de los servicios de ese prestador.",
                            calculo: "Promedio de completitud de los campos clave, solo para ese prestador.",
                          }}
                        />
                        <SortableTh
                          label="Trazabilidad"
                          sortKey="porcentaje_trazabilidad_completa"
                          sort={sortProvidersPageable}
                          tooltip={{
                            leer: "Qué % de los servicios de ese prestador tiene la cadena completa de eventos (Alta→Despachador→Asignado→Envío OK→Llegó→Finalizó).",
                            calculo: "Filas con las 6 columnas de tiempo cargadas ÷ total de ese prestador.",
                          }}
                        />
                        <SortableTh
                          label="Volumen rel."
                          sortKey="volumen_relativo"
                          sort={sortProvidersPageable}
                          tooltip={{
                            leer: "Qué tan grande es ese prestador comparado con el más grande del listado filtrado. 100% es el que más servicios tiene.",
                            calculo: "Total de ese prestador ÷ total del prestador con más volumen.",
                          }}
                        />
                        <SortableTh
                          label="Score"
                          sortKey="score_ranking"
                          sort={sortProvidersPageable}
                          tooltip={{
                            leer: "Una nota de 0 a 100% que combina las 4 columnas anteriores. El ⚠ avisa que ese prestador tiene menos de 20 servicios — con tan poca muestra, el score es poco confiable.",
                            calculo: "37,5% Cumplimiento observado + 31,25% Efectividad asignación + 18,75% Índice calidad + 12,5% Volumen relativo (se renormaliza si falta algún componente).",
                          }}
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {displayedProviders
                        .slice(
                          (providerPage - 1) * providerPageSize,
                          providerPage * providerPageSize,
                        )
                        .map((x) => (
                        <tr
                          key={x.prestador_id}
                          className="border-b border-outline-variant/10 hover:bg-surface-container-low"
                        >
                          <td className="py-2 pr-3 text-on-surface">{x.prestador}</td>
                          <td className="py-2 pr-3">{nf(x.total_general)}</td>
                          <td className="py-2 pr-3">{nf(x.enviador_si)}</td>
                          <td className="py-2 pr-3">{pct(x.uso_enviador)}</td>
                          <td className="py-2 pr-3">{nf(x.asigna_movil)}</td>
                          <td className="py-2 pr-3">{pct(x.efectividad_enviador)}</td>
                          <td className="py-2 pr-3">{nf(x.servicios_programados)}</td>
                          <td className="py-2 pr-3">{nf(x.servicios_cumplidos)}</td>
                          <td className="py-2 pr-3">{nf(x.servicios_no_cumplidos)}</td>
                          <td className="py-2 pr-3">{pct(x.cumplimiento_demora)}</td>
                          <td className="py-2 pr-3">{pct(x.indice_calidad_datos)}</td>
                          <td className="py-2 pr-3">
                            {pct(x.porcentaje_trazabilidad_completa)}
                          </td>
                          <td className="py-2 pr-3">{pct(x.volumen_relativo)}</td>
                          <td className="py-2 pr-3">
                            <span className="font-medium text-on-surface">
                              {x.score_ranking != null
                                ? pct(x.score_ranking)
                                : "N/A"}
                            </span>
                            {x.muestra_baja && (
                              <span
                                className="ml-1 text-[#f59e0b]"
                                title="Menos de 20 servicios — score poco confiable"
                              >
                                ⚠
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager
                  page={providerPage}
                  setPage={setProviderPage}
                  total={displayedProviders.length}
                  pageSize={providerPageSize}
                  pageSizeOptions={[10, 20, 50, 100]}
                  onPageSizeChange={(n) => {
                    setProviderPageSize(n);
                    setProviderPage(1);
                  }}
                />
              </section>
            )}

            {page === "cross" && (
              <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col overflow-hidden">
                <header className="flex items-center gap-3 px-md py-md border-b border-outline-variant/20">
                  <Icon name="campaign" className="text-primary text-[32px]" filled />
                  <div>
                    <h2 className="font-display-lg text-display-lg text-on-surface">
                      Campaña × prestador
                    </h2>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      {nf(sortCross.sorted.length)} combinaciones
                    </p>
                  </div>
                </header>
                <div className="flex items-center justify-between gap-3 px-md py-sm flex-wrap">
                  <div className="form-input-styled flex items-center gap-2 min-w-[220px]">
                    <Icon name="search" className="text-[18px] text-outline" />
                    <input
                      className="flex-1 outline-none bg-transparent font-body-md text-body-md text-on-surface"
                      placeholder="Buscar prestador o campaña…"
                      value={crossSearch}
                      onChange={(e) => {
                        setCrossSearch(e.target.value);
                        setCrossPage(1);
                      }}
                    />
                  </div>
                  <ExportButton
                    rows={() => sortCross.sorted as unknown as Record<string, unknown>[]}
                    fileBaseName="campana-prestador"
                    pdfTitle="Campaña × prestador"
                  />
                </div>
                <div className="overflow-x-auto px-md pb-md">
                  <table className="w-full text-body-md font-body-md">
                    <thead>
                      <tr className="text-label-md font-label-md text-on-surface-variant uppercase text-left border-b border-outline-variant/30">
                        <SortableTh
                          label="Campaña"
                          sortKey="campana"
                          sort={sortCrossPageable}
                          defaultDir="asc"
                        />
                        <SortableTh
                          label="Prestador"
                          sortKey="prestador"
                          sort={sortCrossPageable}
                          defaultDir="asc"
                        />
                        <SortableTh label="Total" sortKey="total_general" sort={sortCrossPageable} />
                        <SortableTh
                          label="Con enviador"
                          sortKey="enviador_si"
                          sort={sortCrossPageable}
                        />
                        <SortableTh
                          label="Efectividad"
                          sortKey="efectividad_enviador"
                          sort={sortCrossPageable}
                        />
                        <SortableTh
                          label="Cumple"
                          sortKey="servicios_cumplidos"
                          sort={sortCrossPageable}
                        />
                        <SortableTh
                          label="No cumple"
                          sortKey="servicios_no_cumplidos"
                          sort={sortCrossPageable}
                        />
                        <SortableTh
                          label="Cumplimiento"
                          sortKey="cumplimiento_demora"
                          sort={sortCrossPageable}
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {sortCross.sorted
                        .slice(
                          (crossPage - 1) * crossPageSize,
                          crossPage * crossPageSize,
                        )
                        .map((x, i) => (
                        <tr
                          key={`${x.campana}-${x.prestador_id}-${i}`}
                          className="border-b border-outline-variant/10 hover:bg-surface-container-low"
                        >
                          <td className="py-2 pr-3 text-on-surface">{x.campana}</td>
                          <td className="py-2 pr-3 text-on-surface">{x.prestador}</td>
                          <td className="py-2 pr-3">{nf(x.total_general)}</td>
                          <td className="py-2 pr-3">{nf(x.enviador_si)}</td>
                          <td className="py-2 pr-3">{pct(x.efectividad_enviador)}</td>
                          <td className="py-2 pr-3">{nf(x.servicios_cumplidos)}</td>
                          <td className="py-2 pr-3">{nf(x.servicios_no_cumplidos)}</td>
                          <td className="py-2 pr-3">{pct(x.cumplimiento_demora)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager
                  page={crossPage}
                  setPage={setCrossPage}
                  total={sortCross.sorted.length}
                  pageSize={crossPageSize}
                  pageSizeOptions={[10, 20, 50, 100]}
                  onPageSizeChange={(n) => {
                    setCrossPageSize(n);
                    setCrossPage(1);
                  }}
                />
              </section>
            )}

            {page === "intelligence" && (
              <div className="flex flex-col gap-lg">
                {/* ---------- Encabezado ---------- */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <Icon name="psychology" className="text-primary text-[32px]" filled />
                      <h2 className="font-display-lg text-display-lg text-on-surface">
                        Inteligencia Operativa
                      </h2>
                    </div>
                    <ExportButton
                      rows={() =>
                        (inteligencia?.prestadores ||
                          []) as unknown as Record<string, unknown>[]
                      }
                      fileBaseName="inteligencia-prestadores"
                      pdfTitle="Inteligencia Operativa — Prestadores"
                    />
                  </div>
                  <div className="flex items-start gap-2 bg-primary-container/50 border border-primary/30 rounded-xl px-md py-sm">
                    <Icon name="info" className="text-primary text-[20px] mt-0.5 shrink-0" />
                    <p className="font-body-md text-body-md text-on-surface">
                      Evalúa el comportamiento histórico de cada prestador para identificar
                      rápido a quién revisar con urgencia, a quién prestarle atención, y
                      quién se está destacando. Todo se calcula sobre datos que ya
                      ocurrieron dentro de los filtros elegidos arriba — no hay pronósticos
                      ni probabilidades de lo que podría pasar.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-lg gap-y-1 bg-surface-container-low rounded-lg px-md py-2">
                    <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                      <Icon name="groups" className="text-[16px]" />
                      <b className="text-on-surface">
                        {nf(inteligencia?.total_prestadores)}
                      </b>{" "}
                      prestadores evaluados
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                      <Icon name="rule" className="text-[16px]" />
                      Reglas sobre datos históricos, sin modelos predictivos
                    </span>
                  </div>
                </div>

                {inteligenciaLoading && (
                  <div className="flex items-center justify-center py-xl">
                    <Spinner className="text-[28px] text-primary" />
                  </div>
                )}

                {!inteligenciaLoading && !inteligencia && (
                  <p className="font-body-md text-body-md text-on-surface-variant text-center py-xl">
                    No se pudo cargar la información. Probá de nuevo o revisá los filtros.
                  </p>
                )}

                {!inteligenciaLoading && inteligencia && (
                  <>
                    {/* ---------- Panorama general ---------- */}
                    <section className="flex flex-col gap-sm">
                      <h3 className="font-title-lg text-title-lg text-on-surface">
                        Panorama general de los prestadores
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
                        <Card
                          icon={<Icon name="error" />}
                          title="Necesitan atención urgente"
                          value={nf(inteligencia.resumen.urgente)}
                          detail="Bajaron de forma sostenida o rinden muy por debajo de sus pares — clic para ver quiénes"
                          tone="red"
                          onClick={() => setModalClasificacion("urgente")}
                          linkText="Ver prestadores"
                          tooltip={{
                            leer:
                              "Prestadores que necesitan revisión cuanto antes: bajaron mucho su cumplimiento entre la primera y la segunda mitad del período filtrado, o quedaron entre el 20% más bajo comparados con sus pares dentro de ese mismo período.",
                            calculo:
                              "Se compara el cumplimiento de demora trazable de la primera mitad del período contra la segunda (ordenado por fecha). Si cayó 10 puntos porcentuales o más, o si el prestador queda en el percentil 20 o menor frente a los demás prestadores filtrados, se clasifica como Urgente.",
                          }}
                        />
                        <Card
                          icon={<Icon name="warning" />}
                          title="Requieren atención"
                          value={nf(inteligencia.resumen.atencion)}
                          detail="Vienen bajando o rinden por debajo del promedio — clic para ver quiénes"
                          tone="amber"
                          onClick={() => setModalClasificacion("atencion")}
                          linkText="Ver prestadores"
                          tooltip={{
                            leer:
                              "Prestadores que conviene monitorear de cerca: vienen bajando un poco su cumplimiento, o rinden por debajo del promedio comparados con sus pares dentro del período filtrado — sin llegar todavía al nivel de Urgente.",
                            calculo:
                              "Se clasifica como Atención cuando la caída entre la primera y la segunda mitad del período es de 5 a 10 puntos porcentuales, o cuando el percentil frente a los demás prestadores filtrados está entre 21 y 40.",
                          }}
                        />
                        <Card
                          icon={<Icon name="trending_up" />}
                          title="Se están destacando"
                          value={nf(inteligencia.resumen.destacado)}
                          detail="Rinden muy bien y de forma estable — clic para ver quiénes"
                          tone="green"
                          onClick={() => setModalClasificacion("destacado")}
                          linkText="Ver prestadores"
                          tooltip={{
                            leer:
                              "Prestadores que se están destacando: quedan entre el grupo con mejor cumplimiento dentro del período filtrado y, además, no muestran una caída reciente.",
                            calculo:
                              "Se clasifica como Destacado cuando el percentil frente a los demás prestadores filtrados es 80 o mayor, y la variación entre la primera y la segunda mitad del período no bajó más de 2 puntos porcentuales.",
                          }}
                        />
                      </div>
                    </section>

                    {/* ---------- Top 3 peores / mejores ---------- */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
                      <section className="flex flex-col gap-sm">
                        <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                          Los 3 que más necesitan atención
                          <InfoTip
                            leer="Los 3 prestadores con menor cumplimiento relativo dentro del período filtrado, entre los que tienen datos suficientes para compararlos."
                            calculo="Se ordena a todos los prestadores con muestra suficiente por su percentil de cumplimiento (de más bajo a más alto) y se muestran los 3 primeros."
                          />
                        </h3>
                        <div className="flex flex-col gap-sm">
                          {top3Peores.length === 0 && (
                            <p className="font-body-md text-body-md text-on-surface-variant">
                              No hay suficientes datos para armar este ranking.
                            </p>
                          )}
                          {top3Peores.map((p) => (
                            <div
                              key={p.prestador_id}
                              className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex items-center justify-between gap-3 p-md"
                            >
                              <div className="min-w-0">
                                <div className="font-body-md text-body-md font-medium text-on-surface truncate">
                                  {p.prestador}
                                </div>
                                <div className="font-label-sm text-label-sm text-on-surface-variant">
                                  {p.factores[0]}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className="font-headline-sm text-headline-sm text-on-surface">
                                  {pct(p.cumplimiento_actual)}
                                </span>
                                <span
                                  className={`font-label-md text-label-md rounded-full px-2 py-0.5 uppercase tracking-wide ${clasificacionInfo(p.clasificacion).tone}`}
                                >
                                  {clasificacionInfo(p.clasificacion).label}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                      <section className="flex flex-col gap-sm">
                        <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                          Los 3 que más se destacan
                          <InfoTip
                            leer="Los 3 prestadores con mayor cumplimiento relativo dentro del período filtrado, entre los que tienen datos suficientes para compararlos."
                            calculo="Se ordena a todos los prestadores con muestra suficiente por su percentil de cumplimiento (de más alto a más bajo) y se muestran los 3 primeros."
                          />
                        </h3>
                        <div className="flex flex-col gap-sm">
                          {top3Mejores.length === 0 && (
                            <p className="font-body-md text-body-md text-on-surface-variant">
                              No hay suficientes datos para armar este ranking.
                            </p>
                          )}
                          {top3Mejores.map((p) => (
                            <div
                              key={p.prestador_id}
                              className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex items-center justify-between gap-3 p-md"
                            >
                              <div className="min-w-0">
                                <div className="font-body-md text-body-md font-medium text-on-surface truncate">
                                  {p.prestador}
                                </div>
                                <div className="font-label-sm text-label-sm text-on-surface-variant">
                                  {p.factores[0]}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className="font-headline-sm text-headline-sm text-on-surface">
                                  {pct(p.cumplimiento_actual)}
                                </span>
                                <span
                                  className={`font-label-md text-label-md rounded-full px-2 py-0.5 uppercase tracking-wide ${clasificacionInfo(p.clasificacion).tone}`}
                                >
                                  {clasificacionInfo(p.clasificacion).label}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>

                    {/* ---------- Comparativa entre prestadores ---------- */}
                    <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col">
                      <header className="flex items-center gap-3 p-md pb-0">
                        <Icon name="leaderboard" className="text-primary" />
                        <div>
                          <h3 className="font-title-lg text-title-lg text-on-surface">
                            Comparativa entre prestadores
                          </h3>
                          <p className="font-label-sm text-label-sm text-on-surface-variant">
                            Cómo viene cada uno y qué conviene hacer, ordenados del que más
                            necesita atención al que mejor está
                          </p>
                        </div>
                      </header>
                      <div className="overflow-x-auto p-md">
                        <table className="w-full text-body-md font-body-md">
                          <thead>
                            <tr className="text-label-md font-label-md text-on-surface-variant uppercase text-left border-b border-outline-variant/30">
                              <SortableTh
                                label="Prestador"
                                sortKey="prestador"
                                sort={sortInteligenciaPageable}
                                defaultDir="asc"
                              />
                              <SortableTh
                                label="Puntualidad actual"
                                sortKey="cumplimiento_actual"
                                sort={sortInteligenciaPageable}
                                tooltip={{
                                  leer: "Porcentaje de servicios de este prestador que cumplieron la demora prometida, dentro del período filtrado.",
                                  calculo: "Cumplimiento de demora trazable: servicios con DemoraReal ≤ DemoraPrometida sobre el total de servicios de ese prestador que tienen ambos valores cargados (se excluyen los que no tienen dato).",
                                }}
                              />
                              <SortableTh
                                label="Comparado con similares"
                                sortKey="percentil_benchmark"
                                sort={sortInteligenciaPageable}
                                defaultDir="asc"
                                tooltip={{
                                  leer: "Indica si este prestador rinde mejor o peor que el resto de los prestadores dentro del mismo grupo de filtros.",
                                  calculo: "Percentil del prestador dentro del universo de prestadores comparables (con muestra suficiente) que quedó después de aplicar los filtros globales.",
                                }}
                              />
                              <SortableTh
                                label="Clasificación"
                                sortKey="clasificacion"
                                sort={sortInteligenciaPageable}
                                defaultDir="asc"
                                tooltip={{
                                  leer: "Resultado de combinar la tendencia reciente del prestador con su posición relativa frente a sus pares.",
                                  calculo: "Urgente / Atención / Destacado / Estable, según umbrales fijos de tendencia (primera vs. segunda mitad del período) y percentil. Sin muestra suficiente de servicios con Demora Prometida y Real cargadas, queda como Muestra insuficiente.",
                                }}
                              />
                              <SortableTh
                                label="Qué conviene hacer"
                                sortKey="clasificacion"
                                sort={sortInteligenciaPageable}
                                defaultDir="asc"
                                tooltip={{
                                  leer: "Sugerencia derivada directamente de la clasificación del prestador — no es una recomendación generada por un modelo, es una regla fija por categoría.",
                                }}
                              />
                            </tr>
                          </thead>
                          <tbody>
                            {sortInteligencia.sorted
                              .slice(
                                (inteligenciaPage - 1) * 10,
                                inteligenciaPage * 10,
                              )
                              .map((p) => (
                                <tr
                                  key={p.prestador_id}
                                  className="border-b border-outline-variant/10 hover:bg-surface-container-low"
                                >
                                  <td className="py-2 pr-3 text-on-surface font-medium">
                                    {p.prestador}
                                  </td>
                                  <td className="py-2 pr-3">
                                    {pct(p.cumplimiento_actual)}
                                  </td>
                                  <td className="py-2 pr-3">
                                    {comparadoConSimilares(p.percentil_benchmark)}
                                  </td>
                                  <td className="py-2 pr-3">
                                    <span
                                      className={`font-label-md text-label-md rounded-full px-2 py-0.5 uppercase tracking-wide ${clasificacionInfo(p.clasificacion).tone}`}
                                    >
                                      {clasificacionInfo(p.clasificacion).label}
                                    </span>
                                  </td>
                                  <td className="py-2 pr-3">
                                    {queHacer(p.clasificacion)}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      <Pager
                        page={inteligenciaPage}
                        setPage={setInteligenciaPage}
                        total={inteligencia.prestadores.length}
                      />
                    </section>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
                      {/* ---------- Avisos importantes ---------- */}
                      <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col gap-sm p-md">
                        <header className="flex items-center gap-3">
                          <Icon name="notifications_active" className="text-[#f59e0b]" />
                          <h3 className="font-title-lg text-title-lg text-on-surface flex items-center gap-1">
                            Avisos importantes
                            <InfoTip
                              leer="Prestadores clasificados como Urgente o Atención, ordenados del que peor está al que menos, con la razón puntual de por qué quedó en esa categoría."
                              calculo="Se toman los prestadores con clasificación Urgente o Atención (excluyendo los de muestra insuficiente), se ordenan por percentil ascendente y se muestran hasta 6."
                            />
                          </h3>
                        </header>
                        <div className="flex flex-col gap-2">
                          {avisosImportantes.length === 0 && (
                            <p className="font-body-md text-body-md text-on-surface-variant">
                              Sin avisos por ahora.
                            </p>
                          )}
                          {avisosImportantes.map((p) => (
                            <div
                              key={p.prestador_id}
                              className="flex items-start gap-2 bg-surface-container-low rounded-lg px-sm py-2"
                            >
                              <span
                                className={`font-label-md text-label-md rounded px-1.5 py-0.5 uppercase tracking-wide shrink-0 ${clasificacionInfo(p.clasificacion).tone}`}
                              >
                                {clasificacionInfo(p.clasificacion).label}
                              </span>
                              <span className="font-body-md text-body-md text-on-surface">
                                {p.prestador}: {p.factores.join(". ")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* ---------- Qué hacer con cada prestador ---------- */}
                      <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col gap-sm p-md">
                        <header className="flex items-center gap-3">
                          <Icon name="auto_awesome" className="text-tertiary" />
                          <h3 className="font-title-lg text-title-lg text-on-surface flex items-center gap-1">
                            Qué hacer con cada prestador
                            <InfoTip
                              leer="Combina a los prestadores con avisos importantes (Urgente/Atención) con los que se destacaron, para tener en una sola lista a quién conviene prestarle atención primero."
                              calculo="Une la lista de Avisos importantes con hasta 3 prestadores Destacados, y para cada uno muestra la acción sugerida según su clasificación (regla fija, no generada por un modelo)."
                            />
                          </h3>
                        </header>
                        <div className="flex flex-col gap-2">
                          {[...avisosImportantes, ...destacadosParaRecomendar].length ===
                            0 && (
                            <p className="font-body-md text-body-md text-on-surface-variant">
                              Sin recomendaciones por ahora.
                            </p>
                          )}
                          {[...avisosImportantes, ...destacadosParaRecomendar].map((p) => (
                            <div
                              key={p.prestador_id}
                              className="flex items-start gap-2 bg-tertiary/10 rounded-lg px-sm py-2"
                            >
                              <Icon
                                name="arrow_forward"
                                className="text-tertiary text-[18px] mt-0.5 shrink-0"
                              />
                              <span className="font-body-md text-body-md text-on-surface">
                                {p.prestador} — {queHacer(p.clasificacion)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </>
                )}
              </div>
            )}

            {page === "upload" && (
              <section className="max-w-xl mx-auto w-full bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col gap-md p-lg">
                <header className="flex items-center gap-3">
                  <Icon name="upload_file" className="text-primary text-[32px]" filled />
                  <div>
                    <h2 className="font-display-lg text-display-lg text-on-surface">
                      Cargar reportes
                    </h2>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      Archivos .xlsx o .xlsm
                    </p>
                  </div>
                </header>
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-outline-variant rounded-xl py-xl px-md cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                  <input
                    className="hidden"
                    type="file"
                    accept=".xlsx,.xlsm"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <Icon name="upload_file" className="text-[42px] text-outline" />
                  <b className="font-body-md text-body-md text-on-surface text-center">
                    {file?.name || "Seleccionar archivo Excel"}
                  </b>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {file
                      ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                      : "Haz clic para seleccionar"}
                  </span>
                </label>
                <button
                  className="h-11 rounded bg-primary text-on-primary font-label-md text-label-md flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
                  disabled={!file || uploading}
                  onClick={upload}
                >
                  {uploading && <Spinner className="text-[18px]" />}
                  Procesar reporte
                </button>
                {uploadMessage && (
                  <div className="bg-surface-container-low rounded-lg p-sm flex flex-col gap-1">
                    <b className="font-body-md text-body-md text-on-surface">
                      {uploadMessage}
                    </b>
                    {uploadStatus && (
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        Estado: {uploadStatus.status} · Filas:{" "}
                        {nf(uploadStatus.filas_procesadas)}
                      </span>
                    )}
                  </div>
                )}
              </section>
            )}

            <div className="h-xl" />
          </div>
        </main>
      </div>

      {/* ---------- Modal de drill-down ---------- */}
      {drill && (
        <div
          className="fixed inset-0 bg-on-surface/40 z-[100] flex items-center justify-center p-md"
          onMouseDown={() => setDrill(null)}
        >
          <section
            className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 px-md py-md border-b border-outline-variant/20">
              <div>
                <h2 className="font-title-lg text-title-lg text-on-surface">
                  {drill.title}
                </h2>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  {nf(drill.total)} servicios · página {drill.page} de{" "}
                  {drill.pages || 1}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="h-9 px-sm rounded bg-surface-container-low text-on-surface font-label-md text-label-md flex items-center gap-2 hover:bg-surface-container transition-colors"
                  onClick={() =>
                    csv(
                      drill.rows as unknown as Record<string, unknown>[],
                      `pagina-${drill.metric}.csv`,
                    )
                  }
                >
                  <Icon name="download" className="text-[18px]" />
                  Página
                </button>
                <button
                  className="h-9 px-sm rounded bg-primary-container text-on-primary-container font-label-md text-label-md flex items-center gap-2 hover:bg-primary hover:text-on-primary transition-colors"
                  onClick={exportAll}
                >
                  {drill.exporting ? (
                    <Spinner className="text-[18px]" />
                  ) : (
                    <Icon name="download" className="text-[18px]" />
                  )}
                  Todo
                </button>
                <button
                  className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors"
                  onClick={() => setDrill(null)}
                >
                  <Icon name="close" />
                </button>
              </div>
            </header>
            {(drill.metric === "PROGRAMADOS_A_TIEMPO" ||
              drill.metric === "PROGRAMADOS_FUERA_DE_TIEMPO") && (
              <div className="flex items-center gap-2 px-md py-sm border-b border-outline-variant/20">
                <button
                  type="button"
                  onClick={() =>
                    open("PROGRAMADOS_A_TIEMPO", "Llegada en horario · Cumplieron")
                  }
                  className={`h-8 px-sm rounded-full font-label-md text-label-md transition-colors ${
                    drill.metric === "PROGRAMADOS_A_TIEMPO"
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-low text-on-surface-variant hover:bg-surface-variant"
                  }`}
                >
                  Cumplieron (incluidos en el %)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    open(
                      "PROGRAMADOS_FUERA_DE_TIEMPO",
                      "Llegada en horario · No cumplieron",
                    )
                  }
                  className={`h-8 px-sm rounded-full font-label-md text-label-md transition-colors ${
                    drill.metric === "PROGRAMADOS_FUERA_DE_TIEMPO"
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-low text-on-surface-variant hover:bg-surface-variant"
                  }`}
                >
                  No cumplieron (fuera del %)
                </button>
              </div>
            )}
            {drill.error && (
              <div className="bg-error-container text-on-error-container px-md py-sm font-body-md text-body-md">
                {drill.error}
              </div>
            )}
            <div className="overflow-auto px-md py-sm flex-1">
              <table className="w-full text-body-md font-body-md">
                <thead>
                  <tr className="text-label-md font-label-md text-on-surface-variant uppercase text-left border-b border-outline-variant/30 sticky top-0 bg-surface-container-lowest">
                    <SortableTh label="ID" sortKey="id_servicio_prestado" sort={sortDrill} />
                    <SortableTh label="Fecha" sortKey="fecha" sort={sortDrill} />
                    <SortableTh
                      label="Estado"
                      sortKey="estado"
                      sort={sortDrill}
                      defaultDir="asc"
                    />
                    <SortableTh
                      label="Tipo"
                      sortKey="tipo_de_servicio"
                      sort={sortDrill}
                      defaultDir="asc"
                    />
                    <SortableTh
                      label="Prestador"
                      sortKey="prestador"
                      sort={sortDrill}
                      defaultDir="asc"
                    />
                    <SortableTh
                      label="Campaña"
                      sortKey="campana"
                      sort={sortDrill}
                      defaultDir="asc"
                    />
                    <SortableTh
                      label="Prometida"
                      sortKey="demora_prometida"
                      sort={sortDrill}
                    />
                    <SortableTh label="Real" sortKey="demora_real" sort={sortDrill} />
                    <SortableTh
                      label="Rango"
                      sortKey="rango_demora_real"
                      sort={sortDrill}
                      defaultDir="asc"
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortDrill.sorted.map((x) => (
                    <tr
                      key={x.servicio_row_id}
                      className="border-b border-outline-variant/10 hover:bg-surface-container-low"
                    >
                      <td className="py-2 pr-3">{x.id_servicio_prestado}</td>
                      <td className="py-2 pr-3">{x.fecha}</td>
                      <td className="py-2 pr-3">{x.estado}</td>
                      <td className="py-2 pr-3">{x.tipo_de_servicio}</td>
                      <td className="py-2 pr-3 text-on-surface">{x.prestador}</td>
                      <td className="py-2 pr-3">{x.campana}</td>
                      <td className="py-2 pr-3">{x.demora_prometida}</td>
                      <td className="py-2 pr-3">{x.demora_real}</td>
                      <td className="py-2 pr-3">{x.rango_demora_real}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {drill.loading && (
                <div className="flex items-center justify-center gap-2 py-md text-on-surface-variant">
                  <Spinner className="text-[18px]" />
                  Cargando…
                </div>
              )}
            </div>
            <footer className="flex justify-end gap-2 px-md py-sm border-t border-outline-variant/20">
              <button
                className="h-9 px-sm rounded bg-surface-container-low text-on-surface font-label-md text-label-md disabled:opacity-40 hover:bg-surface-container transition-colors"
                disabled={drill.page <= 1}
                onClick={() => open(drill.metric, drill.title, drill.page - 1)}
              >
                Anterior
              </button>
              <button
                className="h-9 px-sm rounded bg-surface-container-low text-on-surface font-label-md text-label-md disabled:opacity-40 hover:bg-surface-container transition-colors"
                disabled={drill.page >= drill.pages}
                onClick={() => open(drill.metric, drill.title, drill.page + 1)}
              >
                Siguiente
              </button>
            </footer>
          </section>
        </div>
      )}

      {/* ---------- Modal de lista de prestadores (Inteligencia Operativa) ---------- */}
      {modalClasificacion && (
        <div
          className="fixed inset-0 bg-on-surface/40 z-[100] flex items-center justify-center p-md"
          onMouseDown={() => setModalClasificacion(null)}
        >
          <section
            className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 px-md py-md border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${clasificacionInfo(modalClasificacion).tone}`}
                >
                  <Icon
                    name={clasificacionInfo(modalClasificacion).icon}
                    className="text-[18px]"
                  />
                </span>
                <div>
                  <h2 className="font-title-lg text-title-lg text-on-surface">
                    {clasificacionInfo(modalClasificacion).label}
                  </h2>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    {nf(
                      prestadoresEvaluables.filter(
                        (p) => p.clasificacion === modalClasificacion,
                      ).length,
                    )}{" "}
                    prestadores
                  </p>
                </div>
              </div>
              <button
                className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors"
                onClick={() => setModalClasificacion(null)}
              >
                <Icon name="close" />
              </button>
            </header>
            <div className="overflow-auto px-md py-sm flex-1 flex flex-col gap-2">
              {prestadoresEvaluables
                .filter((p) => p.clasificacion === modalClasificacion)
                .map((p) => (
                  <div
                    key={p.prestador_id}
                    className="bg-surface-container-low rounded-lg px-sm py-2 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-body-md text-body-md font-medium text-on-surface">
                        {p.prestador}
                      </span>
                      <span className="font-headline-sm text-headline-sm text-on-surface">
                        {pct(p.cumplimiento_actual)}
                      </span>
                    </div>
                    {p.factores.map((f) => (
                      <span
                        key={f}
                        className="font-label-sm text-label-sm text-on-surface-variant"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                ))}
            </div>
          </section>
        </div>
      )}

      {/* ---------- Modal de ayuda ---------- */}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
