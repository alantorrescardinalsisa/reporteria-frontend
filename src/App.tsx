import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  api,
  type CampanaImpacto,
  type CampanaMetric,
  type CampanaPrestadorMetric,
  type DataQuality,
  type EstadoOption,
  type EstadosCategorizados,
  type FunnelTiempos,
  type HabilitadoresAsignacion,
  type IngestStatus,
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
}: {
  icon: ReactNode;
  title: string;
  value: string;
  detail: string;
  onClick?: () => void;
  tone?: string;
  highlight?: boolean;
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
        <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
          {title}
        </span>
        <small className="font-body-md text-[13px] text-on-surface-variant/80 leading-snug">
          {detail}
        </small>
        {onClick && (
          <b className="font-label-md text-label-md text-primary mt-1 inline-flex items-center gap-0.5">
            Ver servicios
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
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  onClick?: () => void;
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
          <div className="font-body-md text-body-md font-medium text-on-surface truncate">
            {label}
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
}: {
  label: string;
  icon?: ReactNode;
  valueLabel: string;
  ratio: number;
  color: string;
  onClick?: () => void;
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
        className={`w-full overflow-auto rounded-lg ${
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

/* ---------- NUEVO (ADITIVO): paginado de a 10 para tablas largas ---------- */
function Pager({
  page,
  setPage,
  total,
  pageSize = 10,
}: {
  page: number;
  setPage: (p: number) => void;
  total: number;
  pageSize?: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize)),
    start = total === 0 ? 0 : (page - 1) * pageSize + 1,
    end = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between px-md py-sm border-t border-outline-variant/20">
      <span className="font-label-sm text-label-sm text-on-surface-variant">
        {total === 0 ? "Sin registros" : `Mostrando ${nf(start)}–${nf(end)} de ${nf(total)}`}
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
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
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
    [providerSort, setProviderSort] = useState<"total" | "score">("total"),
    [outlierTramo, setOutlierTramo] = useState<keyof Outliers>("demora_real"),
    [campanaImpactoPage, setCampanaImpactoPage] = useState(1),
    [outliersPage, setOutliersPage] = useState(1);
  const load = useCallback(async (f: TrackeoFilters) => {
    setLoading(true);
    setError(null);
    setCampanaImpactoPage(1);
    setOutliersPage(1);
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
    }));
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
  const displayedProviders = providers
    .filter((x) =>
      x.prestador.toLowerCase().includes(providerSearch.toLowerCase()),
    )
    .slice()
    .sort((a, b) =>
      providerSort === "score"
        ? (b.score_ranking ?? -1) - (a.score_ranking ?? -1)
        : b.total_general - a.total_general,
    );
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
    <div className="font-body-md text-body-md min-h-screen flex bg-background text-on-background">
      {/* ---------- Sidebar ---------- */}
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

      {/* ---------- Contenido principal ---------- */}
      <div className="flex-1 flex flex-col ml-sidebar-width w-[calc(100%-260px)] min-h-screen">
        <header className="flex justify-end items-center h-16 w-full px-md z-40 bg-surface shrink-0">
          <div className="flex items-center gap-sm text-on-surface-variant">
            <button className="p-2 hover:bg-surface-container-low transition-colors rounded-full flex items-center justify-center">
              <Icon name="notifications" />
            </button>
            <button className="p-2 hover:bg-surface-container-low transition-colors rounded-full flex items-center justify-center">
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
                    <h2 className="font-display-lg text-display-lg text-on-surface">
                      Métricas de Trackeo
                    </h2>
                    <button
                      className="bg-primary-container text-on-primary-container px-sm py-xs rounded-lg font-label-md text-label-md hover:bg-primary hover:text-on-primary transition-colors flex items-center gap-2"
                      onClick={() =>
                        summary &&
                        csv(
                          [summary as unknown as Record<string, unknown>],
                          "resumen-trackeo.csv",
                        )
                      }
                    >
                      <Icon name="download" className="text-[18px]" />
                      Exportar Reporte
                    </button>
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
                    />
                    <Card
                      icon={<Icon name="local_shipping" filled />}
                      title="Servicios vehiculares"
                      value={nf(universes?.servicios_vehiculares)}
                      detail="Tipos operativos seleccionados"
                    />
                    <Card
                      icon={<Icon name="check_circle" filled />}
                      title="Servicios evaluables"
                      value={nf(universes?.servicios_evaluables)}
                      detail="Base seleccionada para KPI"
                      tone="green"
                    />
                    <Card
                      icon={<Icon name="cancel" filled />}
                      title="Vehiculares cancelados"
                      value={nf(universes?.servicios_cancelados)}
                      detail="Estados cancelados"
                      tone="red"
                    />
                    <Card
                      icon={<Icon name="warning" filled />}
                      title="Vehiculares no finalizados"
                      value={nf(universes?.servicios_no_finalizados)}
                      detail="Pendientes o en curso"
                      tone="amber"
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
                      />
                      <IndicatorRow
                        icon={<Icon name="send_to_mobile" className="text-[18px]" />}
                        label="Uso del enviador"
                        value={pct(summary?.uso_enviador)}
                        detail={`${nf(summary?.enviador_si)} servicios`}
                        onClick={() => open("ENVIADOR_SI", "Servicios con enviador")}
                      />
                      <IndicatorRow
                        icon={<Icon name="rv_hookup" className="text-[18px]" />}
                        label="Asigna móvil"
                        value={nf(summary?.asigna_movil)}
                        detail={`${pct(summary?.efectividad_enviador)} efectividad`}
                        onClick={() => open("ASIGNA_MOVIL", "Asigna móvil")}
                      />
                      <IndicatorRow
                        icon={<Icon name="mobile_off" className="text-[18px]" />}
                        label="No asigna móvil"
                        value={nf(summary?.no_asigna_movil_cantidad)}
                        detail={pct(summary?.no_asigna_movil_porcentaje)}
                        onClick={() => open("NO_ASIGNA_MOVIL", "No asigna móvil")}
                      />
                      <IndicatorRow
                        icon={<Icon name="event_available" className="text-[18px]" />}
                        label="Servicios programados"
                        value={nf(summary?.servicios_programados)}
                        detail={pct(summary?.programados_porcentaje)}
                        onClick={() => open("PROGRAMADOS", "Programados")}
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
                      />
                      <IndicatorRow
                        icon={<Icon name="fact_check" className="text-[18px]" />}
                        label="Cobertura de medición de demora"
                        value={pct(summary?.cobertura_medicion_demora)}
                        detail={`${nf(summary?.servicios_evaluados_demora_trazable)} de ${nf(summary?.servicios_consultados)} servicios con Demora Prometida y Real cargadas`}
                      />
                    </div>
                  </div>
                </section>

                {/* ---------- Distribución + Calidad ---------- */}
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
                  <div className="flex flex-col gap-sm">
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                      Distribución de servicios cumplidos
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
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                      Calidad de información
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
                  <div className="flex flex-col gap-lg">
                    {(
                      [
                        {
                          label: "Cuánto tarda en llegar",
                          icon: "directions_car",
                          stats: funnel?.tiempos.t4_asignacion_a_arribo,
                          explicacion:
                            "Así de rápido llega el prestador al lugar una vez que le asignan el servicio.",
                        },
                        {
                          label: "Cuánto tarda en resolver el servicio",
                          icon: "build",
                          stats: funnel?.tiempos.t5_ejecucion,
                          explicacion:
                            "Así de rápido resuelve el prestador el servicio, desde que llega hasta que termina.",
                        },
                        {
                          label: "Cuánto dura todo el proceso",
                          icon: "flag_circle",
                          stats: funnel?.tiempos.t6_end_to_end,
                          explicacion:
                            "Así de rápido es el recorrido completo del servicio, de punta a punta.",
                        },
                      ] as {
                        label: string;
                        icon: string;
                        stats: TiempoStats | undefined;
                        explicacion: string;
                      }[]
                    ).map((t) => (
                      <div
                        key={t.label}
                        className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col gap-sm p-md"
                      >
                        <header className="flex items-center gap-3">
                          <Icon name={t.icon} className="text-primary" />
                          <h4 className="font-title-lg text-title-lg text-on-surface">
                            {t.label}
                          </h4>
                        </header>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1 bg-surface-container-low rounded-lg p-sm">
                            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                              Tiempo típico
                            </span>
                            <span className="font-headline-sm text-headline-sm text-on-surface">
                              {nf(t.stats?.p50)} min
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
                              {nf(t.stats?.p90)} min
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
                              {nf(t.stats?.cantidad)}
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
                              {t.stats?.cantidad_invalidos_negativos
                                ? "Con errores"
                                : "Sin problemas"}
                            </span>
                            <span className="font-label-sm text-label-sm text-on-surface-variant">
                              {t.stats?.cantidad_invalidos_negativos
                                ? `${nf(t.stats.cantidad_invalidos_negativos)} casos con datos cargados mal, no se cuentan`
                                : "No se detectaron datos cargados con error"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 bg-primary-container/50 rounded-lg px-sm py-2">
                          <Icon
                            name="auto_awesome"
                            className="text-primary text-[18px] shrink-0"
                          />
                          <span className="font-body-md text-body-md text-on-surface">
                            {t.explicacion}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="flex flex-col gap-sm">
                  <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                    SLA de llegada
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
                            <th className="py-2 pl-md pr-3">Campaña</th>
                            <th className="py-2 pr-3">Total</th>
                            <th className="py-2 pr-3">Efectividad asignación</th>
                            <th className="py-2 pr-3">Cumplimiento observado</th>
                            <th className="py-2 pr-3">Oportunidad asignación</th>
                            <th className="py-2 pr-md">Impacto asignación</th>
                          </tr>
                        </thead>
                        <tbody>
                          {campanaImpacto
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
                  <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                    Distribución horaria
                  </h3>
                  <p className="font-label-sm text-label-sm text-on-surface-variant -mt-2">
                    Volumen de servicios por hora del día (hora local
                    Argentina) — para dimensionar capacidad contra la demanda
                    real por franja horaria, no solo por día.
                  </p>
                  <div className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 overflow-x-auto">
                    <table className="w-full text-body-md font-body-md">
                      <thead>
                        <tr className="text-label-md font-label-md text-on-surface-variant uppercase text-left border-b border-outline-variant/30">
                          <th className="py-2 pl-md pr-3">Hora</th>
                          <th className="py-2 pr-3">Servicios</th>
                          <th className="py-2 pr-md w-1/3">Volumen relativo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const maxServicios = Math.max(
                            1,
                            ...(funnel?.distribucion_horaria || []).map(
                              (h) => h.servicios,
                            ),
                          );
                          return (funnel?.distribucion_horaria || []).map((h) => (
                            <tr
                              key={h.hora}
                              className="border-b border-outline-variant/10 hover:bg-surface-container-low"
                            >
                              <td className="py-2 pl-md pr-3 text-on-surface font-medium">
                                {String(h.hora).padStart(2, "0")}:00
                              </td>
                              <td className="py-2 pr-3">{nf(h.servicios)}</td>
                              <td className="py-2 pr-md">
                                <div className="w-full h-xs bg-surface-container-highest rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-primary"
                                    style={{
                                      width: `${(h.servicios / maxServicios) * 100}%`,
                                    }}
                                  />
                                </div>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* ---------- NUEVO (ADITIVO): Estados por categoría ---------- */}
                <section className="flex flex-col gap-sm">
                  <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                    Estados por categoría semántica
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
                  <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                    Trazabilidad completa del servicio
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
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                      Coordenadas como habilitador de asignación
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
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                      MóvilRegistrado como proxy de asignación
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
                  <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                    Gestión completa de servicios programados
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
                      <span className="font-label-md text-label-md text-on-surface-variant uppercase">
                        Llegada en horario
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
                    <h3 className="font-title-lg text-title-lg text-on-surface">
                      Outliers por tramo
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
                            <th className="py-2 pl-md pr-3">ID servicio</th>
                            <th className="py-2 pr-3">Prestador</th>
                            <th className="py-2 pr-3">Campaña</th>
                            <th className="py-2 pr-3">Fecha</th>
                            <th className="py-2 pr-md">Minutos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(outliers?.[outlierTramo]?.top || [])
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
                  <Icon name="person_search" className="text-primary" />
                  <div>
                    <h2 className="font-title-lg text-title-lg text-on-surface">
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
                        onChange={(e) => setProviderSearch(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center rounded-lg border border-outline-variant/40 overflow-hidden">
                      <button
                        className={`h-10 px-sm font-label-md text-label-md transition-colors ${
                          providerSort === "total"
                            ? "bg-primary text-on-primary"
                            : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low"
                        }`}
                        onClick={() => setProviderSort("total")}
                      >
                        Ordenar por total
                      </button>
                      <button
                        className={`h-10 px-sm font-label-md text-label-md transition-colors ${
                          providerSort === "score"
                            ? "bg-primary text-on-primary"
                            : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low"
                        }`}
                        onClick={() => setProviderSort("score")}
                      >
                        Ordenar por score
                      </button>
                    </div>
                  </div>
                  <button
                    className="h-10 px-sm rounded bg-primary-container text-on-primary-container font-label-md text-label-md flex items-center gap-2 hover:bg-primary hover:text-on-primary transition-colors"
                    onClick={() =>
                      csv(
                        displayedProviders as unknown as Record<string, unknown>[],
                        "prestadores.csv",
                      )
                    }
                  >
                    <Icon name="download" className="text-[18px]" />
                    Exportar
                  </button>
                </div>
                <div className="overflow-x-auto px-md pb-md">
                  <table className="w-full text-body-md font-body-md">
                    <thead>
                      <tr className="text-label-md font-label-md text-on-surface-variant uppercase text-left border-b border-outline-variant/30">
                        <th className="py-2 pr-3">Prestador</th>
                        <th className="py-2 pr-3">Total</th>
                        <th className="py-2 pr-3">Con enviador</th>
                        <th className="py-2 pr-3">Uso</th>
                        <th className="py-2 pr-3">Asigna</th>
                        <th className="py-2 pr-3">Efectividad</th>
                        <th className="py-2 pr-3">Programados</th>
                        <th className="py-2 pr-3">Cumple</th>
                        <th className="py-2 pr-3">No cumple</th>
                        <th className="py-2 pr-3">Cumplimiento</th>
                        <th className="py-2 pr-3">Índice calidad</th>
                        <th className="py-2 pr-3">Trazabilidad</th>
                        <th className="py-2 pr-3">Volumen rel.</th>
                        <th className="py-2 pr-3">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedProviders.map((x) => (
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
              </section>
            )}

            {page === "cross" && (
              <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col overflow-hidden">
                <header className="flex items-center gap-3 px-md py-md border-b border-outline-variant/20">
                  <Icon name="campaign" className="text-primary" />
                  <div>
                    <h2 className="font-title-lg text-title-lg text-on-surface">
                      Campaña × prestador
                    </h2>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      {nf(cross.length)} combinaciones
                    </p>
                  </div>
                </header>
                <div className="flex justify-end px-md py-sm">
                  <button
                    className="h-10 px-sm rounded bg-primary-container text-on-primary-container font-label-md text-label-md flex items-center gap-2 hover:bg-primary hover:text-on-primary transition-colors"
                    onClick={() =>
                      csv(
                        cross as unknown as Record<string, unknown>[],
                        "campana-prestador.csv",
                      )
                    }
                  >
                    <Icon name="download" className="text-[18px]" />
                    Exportar
                  </button>
                </div>
                <div className="overflow-x-auto px-md pb-md">
                  <table className="w-full text-body-md font-body-md">
                    <thead>
                      <tr className="text-label-md font-label-md text-on-surface-variant uppercase text-left border-b border-outline-variant/30">
                        <th className="py-2 pr-3">Campaña</th>
                        <th className="py-2 pr-3">Prestador</th>
                        <th className="py-2 pr-3">Total</th>
                        <th className="py-2 pr-3">Con enviador</th>
                        <th className="py-2 pr-3">Efectividad</th>
                        <th className="py-2 pr-3">Cumple</th>
                        <th className="py-2 pr-3">No cumple</th>
                        <th className="py-2 pr-3">Cumplimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cross.map((x, i) => (
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
              </section>
            )}

            {page === "intelligence" && (
              <div className="flex flex-col gap-lg">
                {/* ---------- Encabezado + disclaimer de mockup ---------- */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <Icon name="psychology" className="text-primary text-[32px]" filled />
                    <h2 className="font-display-lg text-display-lg text-on-surface">
                      Inteligencia Operativa
                    </h2>
                  </div>
                  <div className="flex items-start gap-2 bg-primary-container/50 border border-primary/30 rounded-xl px-md py-sm">
                    <Icon name="info" className="text-primary text-[20px] mt-0.5 shrink-0" />
                    <p className="font-body-md text-body-md text-on-surface">
                      <b>Ejemplo de cómo se vería esta pantalla — todavía no existe de
                      verdad.</b> Muestra, prestador por prestador, cómo viene rindiendo y
                      qué es probable que pase con él en el próximo mes, para ayudar a
                      decidir con quién hablar y qué proponerle. No muestra viajes ni
                      pedidos puntuales, solo el comportamiento general de cada prestador.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-lg gap-y-1 bg-surface-container-low rounded-lg px-md py-2">
                    <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                      <Icon name="event_available" className="text-[16px]" />
                      Datos actualizados al <b className="text-on-surface">30 de agosto de 2026</b>
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                      <Icon name="fact_check" className="text-[16px]" />
                      Qué tan completa está la información: <b className="text-on-surface">Alta</b>
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                      <Icon name="autorenew" className="text-[16px]" />
                      Se actualiza <b className="text-on-surface">todas las semanas</b>
                    </span>
                  </div>
                </div>

                {/* ---------- Panorama general ---------- */}
                <section className="flex flex-col gap-sm">
                  <h3 className="font-title-lg text-title-lg text-on-surface">
                    Panorama general de los prestadores
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
                    <Card
                      icon={<Icon name="error" />}
                      title="Necesitan atención urgente"
                      value="3"
                      detail="Es muy probable que sigan rindiendo peor en el próximo mes"
                      tone="red"
                    />
                    <Card
                      icon={<Icon name="warning" />}
                      title="Vienen bajando su rendimiento"
                      value="6"
                      detail="Empeoraron de forma seguida o rinden peor que prestadores parecidos"
                      tone="amber"
                    />
                    <Card
                      icon={<Icon name="trending_up" />}
                      title="Rinden bien o están mejorando"
                      value="21"
                      detail="Sin ninguna señal de alerta por ahora"
                      tone="green"
                    />
                  </div>
                </section>

                {/* ---------- Perfil de prestador ---------- */}
                <div className="flex flex-col gap-1">
                  <h3 className="font-title-lg text-title-lg text-on-surface">
                    Cómo viene rindiendo — Prestador A
                  </h3>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    Con datos de agosto de 2026
                  </p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
                  <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col gap-sm p-md">
                    <header className="flex items-center gap-3">
                      <Icon name="analytics" className="text-primary" />
                      <h3 className="font-title-lg text-title-lg text-on-surface">
                        Cómo viene trabajando
                      </h3>
                    </header>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Cumple los tiempos prometidos", value: 0.89 },
                        { label: "Consigue un móvil para el servicio", value: 0.94 },
                        { label: "Carga bien sus datos", value: 0.97 },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className="flex flex-col items-center gap-1 bg-surface-container-low rounded-lg py-sm text-center px-1"
                        >
                          <span className="font-headline-sm text-headline-sm text-on-surface">
                            {pct(s.value)}
                          </span>
                          <span className="font-label-sm text-label-sm text-on-surface-variant">
                            {s.label}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 bg-error/10 rounded-lg px-sm py-2">
                      <Icon name="trending_down" className="text-error text-[18px] shrink-0" />
                      <span className="font-body-md text-body-md text-on-surface">
                        Su puntualidad <b>bajó 5 puntos</b> en el último mes
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                        Por qué está pasando esto
                      </span>
                      {[
                        "Bajó su puntualidad en el último mes",
                        "Sus demoras más largas aumentaron respecto de antes",
                        "Sus tiempos de respuesta son menos parejos que antes",
                        "Igual sigue rindiendo mejor que la mayoría de los prestadores parecidos, pero la tendencia reciente preocupa",
                      ].map((motivo) => (
                        <div key={motivo} className="flex items-start gap-2">
                          <Icon
                            name="chevron_right"
                            className="text-[16px] text-on-surface-variant mt-0.5 shrink-0"
                          />
                          <span className="font-body-md text-body-md text-on-surface">
                            {motivo}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col gap-sm p-md">
                    <header className="flex items-center gap-3">
                      <Icon name="insights" className="text-primary" />
                      <h3 className="font-title-lg text-title-lg text-on-surface">
                        Qué es probable que pase
                      </h3>
                    </header>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1 bg-surface-container-low rounded-lg p-sm">
                        <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                          Puntualidad esperada el próximo mes
                        </span>
                        <span className="font-headline-sm text-headline-sm text-on-surface">
                          {pct(0.85)}
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant">
                          Podría variar entre {pct(0.81)} y {pct(0.88)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 bg-surface-container-low rounded-lg p-sm">
                        <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                          Riesgo de que siga empeorando
                        </span>
                        <span className="font-headline-sm text-headline-sm text-on-surface">
                          {pct(0.68)}
                        </span>
                        <span className="font-label-md text-label-md text-[#b5610a] bg-[#f59e0b]/10 rounded-full px-2 py-0.5 w-fit uppercase tracking-wide">
                          Riesgo medio
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 bg-surface-container-low rounded-lg p-sm">
                        <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                          Comparado con prestadores parecidos
                        </span>
                        <span className="font-headline-sm text-headline-sm text-on-surface">
                          Mejor que la mayoría
                        </span>
                        <span className="font-label-sm text-label-sm text-tertiary">
                          Rinde mejor que 87 de cada 100 prestadores similares
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 bg-surface-container-low rounded-lg p-sm">
                        <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                          Qué tan segura es esta predicción
                        </span>
                        <span className="font-headline-sm text-headline-sm text-on-surface">
                          Alta
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant">
                          Hay suficiente historial de este prestador
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-primary-container/50 rounded-lg px-sm py-2">
                      <Icon name="auto_awesome" className="text-primary text-[18px] shrink-0" />
                      <span className="font-body-md text-body-md text-on-surface">
                        Qué hacer: <b>revisar su rendimiento pronto</b>, antes de que el
                        problema crezca
                      </span>
                    </div>
                  </section>
                </div>

                {/* ---------- Comparativa entre prestadores ---------- */}
                <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col gap-sm p-md">
                  <header className="flex items-center gap-3">
                    <Icon name="leaderboard" className="text-primary" />
                    <div>
                      <h3 className="font-title-lg text-title-lg text-on-surface">
                        Comparativa entre prestadores
                      </h3>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">
                        Cómo viene cada uno, qué se espera de él el próximo mes, y qué
                        conviene hacer
                      </p>
                    </div>
                  </header>
                  <div className="overflow-x-auto">
                    <table className="w-full text-body-md font-body-md">
                      <thead>
                        <tr className="text-label-md font-label-md text-on-surface-variant uppercase text-left border-b border-outline-variant/30">
                          <th className="py-2 pr-3">Prestador</th>
                          <th className="py-2 pr-3">Puntualidad actual</th>
                          <th className="py-2 pr-3">Puntualidad esperada (próx. mes)</th>
                          <th className="py-2 pr-3">Comparado con similares</th>
                          <th className="py-2 pr-3">Riesgo de que empeore</th>
                          <th className="py-2 pr-3">Qué conviene hacer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          {
                            prestador: "Prestador C",
                            historico: 0.9,
                            forecast: 0.9,
                            comparativa: "Entre los mejores",
                            nivel: "bajo",
                            recomendacion: "Candidato a más volumen",
                          },
                          {
                            prestador: "Prestador B",
                            historico: 0.82,
                            forecast: 0.86,
                            comparativa: "Por encima del promedio",
                            nivel: "bajo",
                            recomendacion: "Mantener como está",
                          },
                          {
                            prestador: "Prestador A",
                            historico: 0.89,
                            forecast: 0.85,
                            comparativa: "Por encima del promedio",
                            nivel: "medio",
                            recomendacion: "Revisar su rendimiento",
                          },
                          {
                            prestador: "Prestador D",
                            historico: 0.65,
                            forecast: 0.58,
                            comparativa: "Por debajo del promedio",
                            nivel: "alto",
                            recomendacion: "Pedir un plan de mejora",
                          },
                        ].map((p) => (
                          <tr
                            key={p.prestador}
                            className="border-b border-outline-variant/10"
                          >
                            <td className="py-2 pr-3 text-on-surface font-medium">
                              {p.prestador}
                            </td>
                            <td className="py-2 pr-3">{pct(p.historico)}</td>
                            <td className="py-2 pr-3">{pct(p.forecast)}</td>
                            <td className="py-2 pr-3">{p.comparativa}</td>
                            <td className="py-2 pr-3">
                              <span
                                className={`font-label-md text-label-md rounded-full px-2 py-0.5 uppercase tracking-wide ${
                                  p.nivel === "alto"
                                    ? "text-error bg-error/10"
                                    : p.nivel === "medio"
                                      ? "text-[#b5610a] bg-[#f59e0b]/10"
                                      : "text-tertiary bg-tertiary/10"
                                }`}
                              >
                                {p.nivel === "alto" ? "Alto" : p.nivel === "medio" ? "Medio" : "Bajo"}
                              </span>
                            </td>
                            <td className="py-2 pr-3">{p.recomendacion}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
                  {/* ---------- Avisos importantes ---------- */}
                  <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col gap-sm p-md">
                    <header className="flex items-center gap-3">
                      <Icon name="notifications_active" className="text-[#f59e0b]" />
                      <h3 className="font-title-lg text-title-lg text-on-surface">
                        Avisos importantes
                      </h3>
                    </header>
                    <div className="flex flex-col gap-2">
                      {[
                        {
                          etiqueta: "Urgente",
                          texto:
                            "Prestador D: su comportamiento cambió de forma muy inusual — conviene revisarlo cuanto antes",
                          tone: "text-error bg-error/10",
                        },
                        {
                          etiqueta: "Urgente",
                          texto:
                            "Prestador A: es muy probable que su rendimiento siga bajando en el próximo mes",
                          tone: "text-error bg-error/10",
                        },
                        {
                          etiqueta: "Atención",
                          texto:
                            "Prestador D: bajó su puntualidad en las últimas semanas y rinde peor que prestadores parecidos",
                          tone: "text-[#b5610a] bg-[#f59e0b]/10",
                        },
                        {
                          etiqueta: "Informativo",
                          texto: "Prestador C: viene rindiendo bien y de forma estable",
                          tone: "text-tertiary bg-tertiary/10",
                        },
                      ].map((a) => (
                        <div
                          key={a.texto}
                          className="flex items-start gap-2 bg-surface-container-low rounded-lg px-sm py-2"
                        >
                          <span
                            className={`font-label-md text-label-md rounded px-1.5 py-0.5 uppercase tracking-wide shrink-0 ${a.tone}`}
                          >
                            {a.etiqueta}
                          </span>
                          <span className="font-body-md text-body-md text-on-surface">
                            {a.texto}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* ---------- Qué hacer con cada prestador ---------- */}
                  <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col gap-sm p-md">
                    <header className="flex items-center gap-3">
                      <Icon name="auto_awesome" className="text-tertiary" />
                      <h3 className="font-title-lg text-title-lg text-on-surface">
                        Qué hacer con cada prestador
                      </h3>
                    </header>
                    <div className="flex flex-col gap-2">
                      {[
                        "Prestador D — Pedir un plan de mejora: es probable que siga rindiendo peor y ya está por debajo de lo acordado",
                        "Prestador A — Revisar su rendimiento pronto: viene bajando de forma seguida",
                        "Prestador C — Buen candidato a más volumen: rinde muy bien y de forma estable",
                        "Prestador B — Mantener como está: sin ninguna señal de alerta",
                      ].map((accion) => (
                        <div
                          key={accion}
                          className="flex items-start gap-2 bg-tertiary/10 rounded-lg px-sm py-2"
                        >
                          <Icon
                            name="arrow_forward"
                            className="text-tertiary text-[18px] mt-0.5 shrink-0"
                          />
                          <span className="font-body-md text-body-md text-on-surface">
                            {accion}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {page === "upload" && (
              <section className="max-w-xl mx-auto w-full bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col gap-md p-lg">
                <header className="flex items-center gap-3">
                  <Icon name="upload_file" className="text-primary" />
                  <div>
                    <h2 className="font-title-lg text-title-lg text-on-surface">
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
                    <th className="py-2 pr-3">ID</th>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Prestador</th>
                    <th className="py-2 pr-3">Campaña</th>
                    <th className="py-2 pr-3">Prometida</th>
                    <th className="py-2 pr-3">Real</th>
                    <th className="py-2 pr-3">Rango</th>
                  </tr>
                </thead>
                <tbody>
                  {drill.rows.map((x) => (
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
    </div>
  );
}
