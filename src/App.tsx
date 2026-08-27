import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  Download,
  Filter,
  ListChecks,
  RefreshCw,
  Search,
  Server,
  Table2,
  TrendingUp,
  Truck,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  api,
  type CampanaMetric,
  type CampanaPrestadorMetric,
  type DataQuality,
  type EstadoOption,
  type IngestStatus,
  type MetricaTrackeo,
  type PrestadorMetric,
  type PrestadorOption,
  type TrackeoFilters,
  type TrackeoService,
  type TrackeoSummary,
  type TrackeoUniversos,
  type TrendPoint,
} from "./api";
import "./App.css";

type Page = "metrics" | "providers" | "cross" | "upload";
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
  };
}

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
    <div className="multi" ref={ref}>
      <span>{label}</span>
      <button type="button" onClick={() => setOpen(!open)}>
        {title}
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="menu">
          <div className="search">
            <Search size={15} />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar…"
            />
          </div>
          <div className="menu-actions">
            <button onClick={() => onChange(list.map((x) => x.value))}>
              Seleccionar visibles
            </button>
            <button onClick={() => onChange([])}>Limpiar</button>
          </div>
          <div className="options">
            {list.map((o) => (
              <label key={o.value}>
                <input
                  type="checkbox"
                  checked={values.includes(o.value)}
                  onChange={() =>
                    onChange(
                      values.includes(o.value)
                        ? values.filter((x) => x !== o.value)
                        : [...values, o.value],
                    )
                  }
                />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
function Card({
  icon,
  title,
  value,
  detail,
  onClick,
  tone = "blue",
}: {
  icon: ReactNode;
  title: string;
  value: string;
  detail: string;
  onClick?: () => void;
  tone?: string;
}) {
  return (
    <article
      className={`card ${tone} ${onClick ? "clickable" : ""}`}
      onClick={onClick}
    >
      <div className="icon">{icon}</div>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
        {onClick && <b>Ver servicios</b>}
      </div>
    </article>
  );
}
function Trend({ data }: { data: TrendPoint[] }) {
  if (!data.length) return <div className="empty">Sin datos</div>;
  const W = 900,
    H = 260,
    P = 35,
    x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, data.length - 1),
    y = (v: number) => H - P - v * (H - 2 * P),
    points = (k: keyof TrendPoint) =>
      data.map((d, i) => `${x(i)},${y(Number(d[k] || 0))}`).join(" ");
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`}>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={P} x2={W - P} y1={y(v)} y2={y(v)} />
          <text x="2" y={y(v) + 4}>
            {v * 100}%
          </text>
        </g>
      ))}
      <polyline className="line green" points={points("cumplimiento_demora")} />
      <polyline className="line cyan" points={points("efectividad_enviador")} />
      <polyline className="line purple" points={points("uso_enviador")} />
      {data.map((d, i) => (
        <text
          className="date"
          key={d.fecha}
          x={x(i)}
          y={H - 7}
          textAnchor="middle"
        >
          {d.fecha.slice(5)}
        </text>
      ))}
    </svg>
  );
}
function csv(rows: Record<string, unknown>[], name: string) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]),
    esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`,
    data =
      "\ufeff" +
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
    [trend, setTrend] = useState<TrendPoint[]>([]),
    [quality, setQuality] = useState<DataQuality | null>(null),
    [cross, setCross] = useState<CampanaPrestadorMetric[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null),
    [backend, setBackend] = useState({ ok: false, version: "" }),
    [drill, setDrill] = useState<Drill | null>(null),
    [file, setFile] = useState<File | null>(null),
    [uploading, setUploading] = useState(false),
    [uploadStatus, setUploadStatus] = useState<IngestStatus | null>(null),
    [uploadMessage, setUploadMessage] = useState(""),
    [providerSearch, setProviderSearch] = useState("");
  const load = useCallback(async (f: TrackeoFilters) => {
    setLoading(true);
    setError(null);
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
    ]);
    const errs: string[] = [];
    const take = <T,>(i: number, fn: (x: T) => void) =>
      r[i].status === "fulfilled"
        ? fn((r[i] as PromiseFulfilledResult<T>).value)
        : errs.push(String((r[i] as PromiseRejectedResult).reason));
    take<{ resumen: TrackeoSummary }>(0, (x) => setSummary(x.resumen));
    take<{ universos: TrackeoUniversos }>(1, (x) => setUniverses(x.universos));
    take<{ prestadores: PrestadorMetric[] }>(2, (x) =>
      setProviders(x.prestadores),
    );
    take<{ campanas: CampanaMetric[] }>(3, (x) => setCampaigns(x.campanas));
    take<{ prestadores: PrestadorOption[] }>(4, (x) =>
      setProviderOptions(x.prestadores),
    );
    take<{ estados: EstadoOption[] }>(5, (x) => setStates(x.estados));
    take<{ tendencia: TrendPoint[] }>(6, (x) => setTrend(x.tendencia));
    take<{ calidad: DataQuality }>(7, (x) => setQuality(x.calidad));
    take<{ resultados: CampanaPrestadorMetric[] }>(8, (x) =>
      setCross(x.resultados),
    );
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
  const displayedProviders = providers.filter((x) =>
    x.prestador.toLowerCase().includes(providerSearch.toLowerCase()),
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
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <Database />
          <div>
            <b>Reportería</b>
            <span>Prestadores</span>
          </div>
        </div>
        <nav>
          <button
            className={page === "metrics" ? "active" : ""}
            onClick={() => setPage("metrics")}
          >
            <BarChart3 />
            Métricas de Trackeo
          </button>
          <button
            className={page === "providers" ? "active" : ""}
            onClick={() => setPage("providers")}
          >
            <Users />
            Detalle por prestador
          </button>
          <button
            className={page === "cross" ? "active" : ""}
            onClick={() => setPage("cross")}
          >
            <Table2 />
            Campaña × prestador
          </button>
          <button
            className={page === "upload" ? "active" : ""}
            onClick={() => setPage("upload")}
          >
            <Upload />
            Cargar reportes
          </button>
        </nav>
        <div className="backend">
          <Server />
          <span>
            Backend v{backend.version}
            <b className={backend.ok ? "ok" : "bad"}>
              {backend.ok ? "Conectado" : "Sin conexión"}
            </b>
          </span>
        </div>
      </aside>
      <main>
        {page !== "upload" && (
          <section className="panel filters">
            <header>
              <Filter />
              <div>
                <h2>Filtros globales</h2>
                <p>
                  Estado manual. Sin selección se incluyen todos los estados.
                </p>
              </div>
            </header>
            <div className="filter-grid">
              <label>
                <span>Desde</span>
                <input
                  type="date"
                  value={draft.fecha_desde}
                  onChange={(e) =>
                    setDraft({ ...draft, fecha_desde: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Hasta</span>
                <input
                  type="date"
                  value={draft.fecha_hasta}
                  onChange={(e) =>
                    setDraft({ ...draft, fecha_hasta: e.target.value })
                  }
                />
              </label>
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
                placeholder="Todos los estados"
                onChange={(estados) => setDraft({ ...draft, estados })}
              />
              <button
                className="secondary"
                onClick={() => {
                  setDraft(DEFAULT);
                  setFilters(DEFAULT);
                }}
              >
                Restablecer
              </button>
              <button
                className="primary"
                onClick={() => setFilters({ ...draft })}
              >
                {loading && <RefreshCw className="spin" />}Aplicar filtros
              </button>
            </div>
          </section>
        )}
        {error && (
          <div className="alert">
            <AlertCircle />
            {error}
          </div>
        )}
        {page === "metrics" && (
          <>
            <div className="title">
              <h1>Métricas de Trackeo</h1>
              <p>Modelo auditable con Estado manual y filtros reproducibles.</p>
            </div>
            <h2>Universos analíticos</h2>
            <section className="cards">
              <Card
                icon={<Database />}
                title="Servicios en el periodo"
                value={nf(universes?.servicios_cargados)}
                detail="Total visible para las fechas"
              />
              <Card
                icon={<Truck />}
                title="Servicios vehiculares"
                value={nf(universes?.servicios_vehiculares)}
                detail="Tipos operativos seleccionados"
              />
              <Card
                icon={<CheckCircle2 />}
                title="Servicios evaluables"
                value={nf(universes?.servicios_evaluables)}
                detail="Base seleccionada para KPI"
                tone="green"
              />
              <Card
                icon={<AlertCircle />}
                title="Vehiculares cancelados"
                value={nf(universes?.servicios_cancelados)}
                detail="Estados cancelados"
                tone="red"
              />
              <Card
                icon={<Clock3 />}
                title="Vehiculares no finalizados"
                value={nf(universes?.servicios_no_finalizados)}
                detail="Pendientes o en curso"
                tone="amber"
              />
              <Card
                icon={<ListChecks />}
                title="Universo seleccionado"
                value={nf(summary?.servicios_consultados)}
                detail={
                  filters.estados.length
                    ? filters.estados.join(", ")
                    : "Todos los estados"
                }
              />
            </section>
            <h2>Indicadores operativos</h2>
            <section className="cards">
              <Card
                icon={<Database />}
                title="Servicios seleccionados"
                value={nf(summary?.servicios_consultados)}
                detail={`${nf(summary?.enviador_si)} con enviador · ${nf(summary?.enviador_no)} sin enviador`}
              />
              <Card
                icon={<TrendingUp />}
                title="Uso del enviador"
                value={pct(summary?.uso_enviador)}
                detail={`${nf(summary?.enviador_si)} servicios`}
                onClick={() => open("ENVIADOR_SI", "Servicios con enviador")}
              />
              <Card
                icon={<Truck />}
                title="Asigna móvil"
                value={nf(summary?.asigna_movil)}
                detail={`${pct(summary?.efectividad_enviador)} efectividad`}
                tone="purple"
                onClick={() => open("ASIGNA_MOVIL", "Asigna móvil")}
              />
              <Card
                icon={<AlertCircle />}
                title="No asigna móvil"
                value={nf(summary?.no_asigna_movil_cantidad)}
                detail={pct(summary?.no_asigna_movil_porcentaje)}
                tone="red"
                onClick={() => open("NO_ASIGNA_MOVIL", "No asigna móvil")}
              />
              <Card
                icon={<ListChecks />}
                title="Servicios programados"
                value={nf(summary?.servicios_programados)}
                detail={pct(summary?.programados_porcentaje)}
                onClick={() => open("PROGRAMADOS", "Programados")}
              />
              <Card
                icon={<CheckCircle2 />}
                title="Cumplimiento de demora"
                value={
                  (summary?.servicios_evaluados_demora ?? 0) > 0
                    ? pct(summary?.cumplimiento_demora)
                    : "N/A"
                }
                detail={`${nf(summary?.servicios_cumplidos)} cumplen · ${nf(summary?.servicios_no_cumplidos)} no cumplen`}
                tone="green"
                onClick={() => open("CUMPLE_DEMORA", "Cumple demora")}
              />
            </section>
            <section className="panel block">
              <header>
                <TrendingUp />
                <div>
                  <h2>Tendencia diaria</h2>
                  <p>Uso, efectividad y cumplimiento.</p>
                </div>
              </header>
              <Trend data={trend} />
            </section>
            <section className="panel block">
              <header>
                <BarChart3 />
                <div>
                  <h2>Distribución de servicios cumplidos</h2>
                  <p>
                    Sobre {nf(summary?.servicios_cumplidos)} servicios
                    cumplidos.
                  </p>
                </div>
              </header>
              <div className="ranges">
                {ranges.map(([label, count, r, m]) => (
                  <button key={m} onClick={() => open(m, label)}>
                    <span>{label}</span>
                    <i>
                      <b
                        style={{ width: `${Math.min(100, (r || 0) * 100)}%` }}
                      />
                    </i>
                    <strong>
                      {nf(count)} · {pct(r)}
                    </strong>
                  </button>
                ))}
              </div>
            </section>
            <section className="panel block">
              <header>
                <Database />
                <div>
                  <h2>Calidad de información</h2>
                  <p>Completitud sobre el universo filtrado.</p>
                </div>
              </header>
              <div className="quality">
                {qualityRows.map(([label, value]) => (
                  <article key={label}>
                    <span>
                      {label}
                      <b>{pct(quality?.total ? value / quality.total : 0)}</b>
                    </span>
                    <i>
                      <b
                        style={{
                          width: `${quality?.total ? (value / quality.total) * 100 : 0}%`,
                        }}
                      />
                    </i>
                    <small>
                      {nf(value)} de {nf(quality?.total)}
                    </small>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
        {page === "providers" && (
          <section className="panel page-panel">
            <header>
              <Users />
              <div>
                <h2>Detalle por prestador</h2>
                <p>{nf(displayedProviders.length)} prestadores</p>
              </div>
            </header>
            <div className="toolbar">
              <div className="search">
                <Search />
                <input
                  placeholder="Buscar prestador…"
                  value={providerSearch}
                  onChange={(e) => setProviderSearch(e.target.value)}
                />
              </div>
              <button
                onClick={() =>
                  csv(
                    displayedProviders as unknown as Record<string, unknown>[],
                    "prestadores.csv",
                  )
                }
              >
                <Download />
                Exportar
              </button>
            </div>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>Prestador</th>
                    <th>Total</th>
                    <th>Con enviador</th>
                    <th>Uso</th>
                    <th>Asigna</th>
                    <th>Efectividad</th>
                    <th>Programados</th>
                    <th>Cumple</th>
                    <th>No cumple</th>
                    <th>Cumplimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedProviders.map((x) => (
                    <tr key={x.prestador_id}>
                      <td>{x.prestador}</td>
                      <td>{nf(x.total_general)}</td>
                      <td>{nf(x.enviador_si)}</td>
                      <td>{pct(x.uso_enviador)}</td>
                      <td>{nf(x.asigna_movil)}</td>
                      <td>{pct(x.efectividad_enviador)}</td>
                      <td>{nf(x.servicios_programados)}</td>
                      <td>{nf(x.servicios_cumplidos)}</td>
                      <td>{nf(x.servicios_no_cumplidos)}</td>
                      <td>{pct(x.cumplimiento_demora)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {page === "cross" && (
          <section className="panel page-panel">
            <header>
              <Table2 />
              <div>
                <h2>Campaña × prestador</h2>
                <p>{nf(cross.length)} combinaciones</p>
              </div>
            </header>
            <div className="toolbar">
              <button
                onClick={() =>
                  csv(
                    cross as unknown as Record<string, unknown>[],
                    "campana-prestador.csv",
                  )
                }
              >
                <Download />
                Exportar
              </button>
            </div>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>Campaña</th>
                    <th>Prestador</th>
                    <th>Total</th>
                    <th>Con enviador</th>
                    <th>Efectividad</th>
                    <th>Cumple</th>
                    <th>No cumple</th>
                    <th>Cumplimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {cross.map((x, i) => (
                    <tr key={`${x.campana}-${x.prestador_id}-${i}`}>
                      <td>{x.campana}</td>
                      <td>{x.prestador}</td>
                      <td>{nf(x.total_general)}</td>
                      <td>{nf(x.enviador_si)}</td>
                      <td>{pct(x.efectividad_enviador)}</td>
                      <td>{nf(x.servicios_cumplidos)}</td>
                      <td>{nf(x.servicios_no_cumplidos)}</td>
                      <td>{pct(x.cumplimiento_demora)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {page === "upload" && (
          <section className="panel upload">
            <header>
              <Upload />
              <div>
                <h2>Cargar reportes</h2>
                <p>Archivos .xlsx o .xlsm</p>
              </div>
            </header>
            <label className="drop">
              <input
                type="file"
                accept=".xlsx,.xlsm"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <Upload size={42} />
              <b>{file?.name || "Seleccionar archivo Excel"}</b>
              <span>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                  : "Haz clic para seleccionar"}
              </span>
            </label>
            <button
              className="primary upload-button"
              disabled={!file || uploading}
              onClick={upload}
            >
              {uploading && <RefreshCw className="spin" />}Procesar reporte
            </button>
            {uploadMessage && (
              <div className="status">
                <b>{uploadMessage}</b>
                {uploadStatus && (
                  <span>
                    Estado: {uploadStatus.status} · Filas:{" "}
                    {nf(uploadStatus.filas_procesadas)}
                  </span>
                )}
              </div>
            )}
          </section>
        )}
      </main>
      {drill && (
        <div className="backdrop" onMouseDown={() => setDrill(null)}>
          <section className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <div>
                <h2>{drill.title}</h2>
                <p>
                  {nf(drill.total)} servicios · página {drill.page} de{" "}
                  {drill.pages || 1}
                </p>
              </div>
              <div>
                <button
                  onClick={() =>
                    csv(
                      drill.rows as unknown as Record<string, unknown>[],
                      `pagina-${drill.metric}.csv`,
                    )
                  }
                >
                  <Download />
                  Página
                </button>
                <button onClick={exportAll}>
                  {drill.exporting ? (
                    <RefreshCw className="spin" />
                  ) : (
                    <Download />
                  )}
                  Todo
                </button>
                <button onClick={() => setDrill(null)}>
                  <X />
                </button>
              </div>
            </header>
            {drill.error && <div className="alert">{drill.error}</div>}
            <div className="table modal-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Tipo</th>
                    <th>Prestador</th>
                    <th>Campaña</th>
                    <th>Prometida</th>
                    <th>Real</th>
                    <th>Rango</th>
                  </tr>
                </thead>
                <tbody>
                  {drill.rows.map((x) => (
                    <tr key={x.servicio_row_id}>
                      <td>{x.id_servicio_prestado}</td>
                      <td>{x.fecha}</td>
                      <td>{x.estado}</td>
                      <td>{x.tipo_de_servicio}</td>
                      <td>{x.prestador}</td>
                      <td>{x.campana}</td>
                      <td>{x.demora_prometida}</td>
                      <td>{x.demora_real}</td>
                      <td>{x.rango_demora_real}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer>
              <button
                disabled={drill.page <= 1}
                onClick={() => open(drill.metric, drill.title, drill.page - 1)}
              >
                Anterior
              </button>
              <button
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
