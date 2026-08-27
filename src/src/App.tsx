import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
} from 'lucide-react';
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
} from './api';
import './App.css';

type Page = 'metrics' | 'providers' | 'cross' | 'upload';

type SelectOption = {
  value: string;
  label: string;
};

type DrillState = {
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

const DEFAULT_FILTERS: TrackeoFilters = {
  fecha_desde: '2026-08-01',
  fecha_hasta: '2026-08-24',
  campanas: [],
  prestador_ids: [],
  estados: [],
};

function readInitialFilters(): TrackeoFilters {
  const params = new URLSearchParams(window.location.search);
  return {
    fecha_desde: params.get('desde') || DEFAULT_FILTERS.fecha_desde,
    fecha_hasta: params.get('hasta') || DEFAULT_FILTERS.fecha_hasta,
    campanas: params.getAll('campana'),
    prestador_ids: params.getAll('prestador_id'),
    estados: params.getAll('estado'),
  };
}

function readInitialPage(): Page {
  const value = new URLSearchParams(window.location.search).get('page');
  if (value === 'providers' || value === 'cross' || value === 'upload') {
    return value;
  }
  return 'metrics';
}

const numberFormat = new Intl.NumberFormat('es-AR');
const decimalFormat = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 1,
});

function nf(value?: number | null): string {
  return value === null || value === undefined
    ? '\u2014'
    : numberFormat.format(value);
}

function pct(value?: number | null): string {
  return value === null || value === undefined
    ? '\u2014'
    : `${decimalFormat.format(value * 100)} %`;
}

function decimal(value?: number | null): string {
  return value === null || value === undefined
    ? '\u2014'
    : decimalFormat.format(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function downloadCsv(rows: Record<string, unknown>[], filename: string): void {
  if (rows.length === 0) return;

  const columns = Object.keys(rows[0]);
  const escape = (value: unknown) =>
    `"${String(value ?? '').replace(/"/g, '""')}"`;

  const csv =
    '\ufeff' +
    [
      columns.join(';'),
      ...rows.map((row) =>
        columns.map((column) => escape(row[column])).join(';'),
      ),
    ].join('\n');

  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
  options: SelectOption[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const visible = useMemo(() => {
    const query = term.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(query),
    );
  }, [options, term]);

  const title = useMemo(() => {
    if (values.length === 0) return placeholder;
    if (values.length === 1) {
      return options.find((option) => option.value === values[0])?.label ||
        values[0];
    }
    return `${values.length} seleccionados`;
  }, [options, placeholder, values]);

  const toggle = (value: string) => {
    onChange(
      values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value],
    );
  };

  return (
    <div className="multi" ref={rootRef}>
      <span>{label}</span>
      <button type="button" onClick={() => setOpen((current) => !current)}>
        <span>{title}</span>
        <ChevronDown size={16} />
      </button>

      {open && (
        <div className="menu">
          <div className="search">
            <Search size={15} />
            <input
              autoFocus
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Buscar..."
            />
          </div>

          <div className="menu-actions">
            <button
              type="button"
              onClick={() =>
                onChange(
                  Array.from(
                    new Set([...values, ...visible.map((o) => o.value)]),
                  ),
                )
              }
            >
              Seleccionar visibles
            </button>
            <button type="button" onClick={() => onChange([])}>
              Limpiar
            </button>
          </div>

          <div className="options">
            {visible.map((option) => (
              <label key={option.value}>
                <input
                  type="checkbox"
                  checked={values.includes(option.value)}
                  onChange={() => toggle(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  title,
  value,
  detail,
  onClick,
  tone = 'blue',
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
      className={`card ${tone} ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
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

function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return <div className="empty">Sin datos para el periodo.</div>;
  }

  const width = 900;
  const height = 260;
  const pad = 35;

  const x = (index: number) =>
    pad + (index * (width - pad * 2)) / Math.max(1, data.length - 1);
  const y = (value: number) => height - pad - value * (height - pad * 2);

  const points = (key: 'cumplimiento_demora' | 'efectividad_enviador' | 'uso_enviador') =>
    data.map((point, index) => `${x(index)},${y(Number(point[key] || 0))}`).join(' ');

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`}>
      {[0, 0.25, 0.5, 0.75, 1].map((value) => (
        <g key={value}>
          <line x1={pad} x2={width - pad} y1={y(value)} y2={y(value)} />
          <text x="2" y={y(value) + 4}>
            {value * 100}%
          </text>
        </g>
      ))}

      <polyline className="line green" points={points('cumplimiento_demora')} />
      <polyline className="line cyan" points={points('efectividad_enviador')} />
      <polyline className="line purple" points={points('uso_enviador')} />

      {data.map((point, index) => (
        <text
          className="date"
          key={point.fecha}
          x={x(index)}
          y={height - 7}
          textAnchor="middle"
        >
          {point.fecha.slice(5)}
        </text>
      ))}
    </svg>
  );
}

function DrilldownModal({
  state,
  onClose,
  onPage,
  onExportPage,
  onExportAll,
}: {
  state: DrillState;
  onClose: () => void;
  onPage: (page: number) => void;
  onExportPage: () => void;
  onExportAll: () => void;
}) {
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <section className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2>{state.title}</h2>
            <p>
              {nf(state.total)} servicios &middot; pagina {state.page} de{' '}
              {state.pages || 1}
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={onExportPage}
              disabled={state.rows.length === 0}
            >
              <Download size={16} />
              Pagina
            </button>
            <button
              type="button"
              onClick={onExportAll}
              disabled={state.total === 0 || state.exporting}
            >
              {state.exporting ? (
                <RefreshCw size={16} className="spin" />
              ) : (
                <Download size={16} />
              )}
              Todo
            </button>
            <button type="button" onClick={onClose} aria-label="Cerrar">
              <X size={20} />
            </button>
          </div>
        </header>

        {state.error && (
          <div className="alert">
            <AlertCircle size={18} />
            <span>{state.error}</span>
          </div>
        )}

        {state.loading ? (
          <div className="empty">
            <RefreshCw className="spin" size={18} />
            Consultando servicios...
          </div>
        ) : state.rows.length === 0 ? (
          <div className="empty">No hay servicios para los filtros seleccionados.</div>
        ) : (
          <div className="table modal-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Tipo</th>
                  <th>Prestador</th>
                  <th>Campana</th>
                  <th>Prometida</th>
                  <th>Real</th>
                  <th>Rango</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((service) => (
                  <tr key={service.servicio_row_id}>
                    <td>{service.id_servicio_prestado ?? '\u2014'}</td>
                    <td>{service.fecha || '\u2014'}</td>
                    <td>{service.estado || '\u2014'}</td>
                    <td>{service.tipo_de_servicio || '\u2014'}</td>
                    <td>{service.prestador || 'SIN PRESTADOR'}</td>
                    <td>{service.campana || 'SIN CAMPANA'}</td>
                    <td>{decimal(service.demora_prometida)}</td>
                    <td>{decimal(service.demora_real)}</td>
                    <td>{service.rango_demora_real || '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer>
          <button
            type="button"
            disabled={state.page <= 1 || state.loading}
            onClick={() => onPage(state.page - 1)}
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={
              state.loading || state.pages === 0 || state.page >= state.pages
            }
            onClick={() => onPage(state.page + 1)}
          >
            Siguiente
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function App() {
  const initialFilters = useMemo(readInitialFilters, []);
  const initialPage = useMemo(readInitialPage, []);

  const [page, setPage] = useState<Page>(initialPage);
  const [draft, setDraft] = useState<TrackeoFilters>(initialFilters);
  const [filters, setFilters] = useState<TrackeoFilters>(initialFilters);

  const [summary, setSummary] = useState<TrackeoSummary | null>(null);
  const [universes, setUniverses] = useState<TrackeoUniversos | null>(null);
  const [providers, setProviders] = useState<PrestadorMetric[]>([]);
  const [campaigns, setCampaigns] = useState<CampanaMetric[]>([]);
  const [providerOptions, setProviderOptions] = useState<PrestadorOption[]>([]);
  const [states, setStates] = useState<EstadoOption[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [quality, setQuality] = useState<DataQuality | null>(null);
  const [cross, setCross] = useState<CampanaPrestadorMetric[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backend, setBackend] = useState<{ ok: boolean; version: string }>({
    ok: false,
    version: '',
  });

  const [drill, setDrill] = useState<DrillState | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<IngestStatus | null>(null);
  const [uploadMessage, setUploadMessage] = useState('');

  const [providerSearch, setProviderSearch] = useState('');

  const load = useCallback(async (next: TrackeoFilters) => {
    setLoading(true);
    setError(null);

    const results = await Promise.allSettled([
      api.trackeoResumen(next),
      api.trackeoUniversos(next),
      api.trackeoPrestadores(next),
      api.trackeoCampanas(next),
      api.trackeoListaPrestadores(next),
      api.trackeoEstados(next),
      api.trackeoTendencia(next),
      api.trackeoCalidadDatos(next),
      api.trackeoCampanaPrestador(next),
    ]);

    const errors: string[] = [];

    function take<T>(index: number, handler: (value: T) => void) {
      const result = results[index];
      if (result.status === 'fulfilled') {
        handler(result.value as T);
      } else {
        errors.push(String(result.reason));
      }
    }

    take<{ resumen: TrackeoSummary }>(0, (x) => setSummary(x.resumen));
    take<{ universos: TrackeoUniversos }>(1, (x) => setUniverses(x.universos));
    take<{ prestadores: PrestadorMetric[] }>(2, (x) => setProviders(x.prestadores));
    take<{ campanas: CampanaMetric[] }>(3, (x) => setCampaigns(x.campanas));
    take<{ prestadores: PrestadorOption[] }>(4, (x) =>
      setProviderOptions(x.prestadores),
    );
    take<{ estados: EstadoOption[] }>(5, (x) => setStates(x.estados));
    take<{ tendencia: TrendPoint[] }>(6, (x) => setTrend(x.tendencia));
    take<{ calidad: DataQuality }>(7, (x) => setQuality(x.calidad));
    take<{ resultados: CampanaPrestadorMetric[] }>(8, (x) => setCross(x.resultados));

    if (errors.length > 0) setError(errors.join(' | '));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  useEffect(() => {
    const check = () => {
      api
        .health()
        .then((response) => setBackend({ ok: response.ok, version: response.version }))
        .catch(() => setBackend({ ok: false, version: '' }));
    };
    check();
    const timer = window.setInterval(check, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('desde', filters.fecha_desde);
    params.set('hasta', filters.fecha_hasta);
    params.set('page', page);
    filters.campanas.forEach((value) => params.append('campana', value));
    filters.prestador_ids.forEach((value) => params.append('prestador_id', value));
    filters.estados.forEach((value) => params.append('estado', value));
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [filters, page]);

  const campaignOptions = useMemo<SelectOption[]>(
    () =>
      campaigns.map((item) => ({
        value: item.campana,
        label: `${item.campana} (${nf(item.servicios)})`,
      })),
    [campaigns],
  );

  const providerSelectOptions = useMemo<SelectOption[]>(
    () =>
      providerOptions.map((item) => ({
        value: item.prestador_id,
        label: item.prestador,
      })),
    [providerOptions],
  );

  const stateOptions = useMemo<SelectOption[]>(
    () =>
      states.map((item) => ({
        value: item.estado_normalizado,
        label: `${item.estado} (${nf(item.cantidad)})`,
      })),
    [states],
  );

  async function openDrill(
    metric: MetricaTrackeo,
    title: string,
    targetPage = 1,
    pageSize = 100,
  ) {
    setDrill((current) => ({
      title,
      metric,
      rows: current?.metric === metric ? current.rows : [],
      total: current?.metric === metric ? current.total : 0,
      page: targetPage,
      pages: current?.metric === metric ? current.pages : 0,
      pageSize,
      loading: true,
      exporting: false,
      error: null,
    }));

    try {
      const response = await api.trackeoServiciosPaginados(
        filters,
        metric,
        targetPage,
        pageSize,
      );
      setDrill({
        title,
        metric,
        rows: response.servicios,
        total: response.cantidad_total,
        page: response.pagina,
        pages: response.total_paginas,
        pageSize: response.tamano_pagina,
        loading: false,
        exporting: false,
        error: null,
      });
    } catch (caught) {
      setDrill((current) =>
        current
          ? { ...current, loading: false, error: String(caught) }
          : current,
      );
    }
  }

  async function exportAll() {
    if (!drill || drill.exporting || drill.total === 0) return;
    setDrill({ ...drill, exporting: true, error: null });

    try {
      const rows: TrackeoService[] = [];
      const pageSize = 500;
      const totalPages = Math.ceil(drill.total / pageSize);

      for (let page = 1; page <= totalPages; page += 1) {
        const response = await api.trackeoServiciosPaginados(
          filters,
          drill.metric,
          page,
          pageSize,
        );
        rows.push(...response.servicios);
        if (page < totalPages) await sleep(250);
      }

      if (rows.length !== drill.total) {
        throw new Error(
          `Se recuperaron ${nf(rows.length)} de ${nf(drill.total)} servicios.`,
        );
      }

      downloadCsv(
        rows as unknown as Record<string, unknown>[],
        `detalle-${drill.metric}-${filters.fecha_desde}-${filters.fecha_hasta}.csv`,
      );
      setDrill((current) => (current ? { ...current, exporting: false } : current));
    } catch (caught) {
      setDrill((current) =>
        current
          ? { ...current, exporting: false, error: String(caught) }
          : current,
      );
    }
  }

  async function submitUpload() {
    if (!file || uploading) return;
    setUploading(true);
    setUploadMessage('Subiendo...');

    try {
      const result = await api.ingest(file);

      if (result.status === 'duplicado') {
        setUploadMessage(result.mensaje || 'El archivo ya fue cargado.');
        return;
      }

      if (!result.report_id) {
        throw new Error('El backend no devolvio report_id.');
      }

      for (let attempt = 0; attempt < 600; attempt += 1) {
        const status = await api.ingestStatus(result.report_id);
        setUploadStatus(status);
        setUploadMessage(
          `${status.etapa || status.status}: ${nf(status.filas_procesadas)} filas`,
        );

        if (status.status === 'procesado') {
          setUploadMessage(
            `Carga completada: ${nf(status.filas_procesadas)} filas.`,
          );
          setFile(null);
          await load(filters);
          return;
        }

        if (status.status === 'error' || status.status === 'cancelado') {
          throw new Error(status.error_msg || `Estado ${status.status}`);
        }

        await sleep(3000);
      }

      throw new Error('La carga excedio el limite de seguimiento.');
    } catch (caught) {
      setUploadMessage(
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setUploading(false);
    }
  }

  const applyFilters = () => {
    if (!draft.fecha_desde || !draft.fecha_hasta) {
      setError('Selecciona las fechas Desde y Hasta.');
      return;
    }
    if (draft.fecha_desde > draft.fecha_hasta) {
      setError('La fecha Desde no puede superar la fecha Hasta.');
      return;
    }
    setFilters({ ...draft });
  };

  const resetFilters = () => {
    setDraft(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
  };

  const qualityRows: Array<[string, number]> = quality
    ? [
        ['Tipo de servicio', quality.tipo_servicio_completo],
        ['Estado', quality.estado_completo],
        ['Campana', quality.campana_completa],
        ['Prestador', quality.prestador_completo],
        ['Despachador', quality.despachador_completo],
        ['Coordenadas', quality.coordenadas_disponibles],
        ['Movil registrado', quality.movil_registrado],
        ['Demora prometida', quality.demora_prometida_completa],
        ['Demora real', quality.demora_real_completa],
      ]
    : [];

  const displayedProviders = useMemo(
    () =>
      providers.filter((provider) =>
        provider.prestador.toLowerCase().includes(providerSearch.toLowerCase()),
      ),
    [providers, providerSearch],
  );

  const selectedStatesText = useMemo(
    () =>
      filters.estados.length === 0
        ? 'Todos los estados'
        : filters.estados.join(', '),
    [filters.estados],
  );

  const ranges: Array<{
    label: string;
    count?: number;
    ratio?: number;
    metric: MetricaTrackeo;
  }> = [
    {
      label: 'Menos de 60',
      count: summary?.menos_60_cantidad,
      ratio: summary?.menos_60_porcentaje,
      metric: 'MENOS_60',
    },
    {
      label: '61 a 90',
      count: summary?.entre_61_90_cantidad,
      ratio: summary?.entre_61_90_porcentaje,
      metric: 'ENTRE_61_90',
    },
    {
      label: '91 a 120',
      count: summary?.entre_91_120_cantidad,
      ratio: summary?.entre_91_120_porcentaje,
      metric: 'ENTRE_91_120',
    },
    {
      label: '121 a 180',
      count: summary?.entre_121_180_cantidad,
      ratio: summary?.entre_121_180_porcentaje,
      metric: 'ENTRE_121_180',
    },
    {
      label: 'Mas de 181',
      count: summary?.mas_181_cantidad,
      ratio: summary?.mas_181_porcentaje,
      metric: 'MAS_181',
    },
    {
      label: 'N/A',
      count: summary?.na_cantidad,
      ratio: summary?.na_porcentaje,
      metric: 'NA',
    },
  ];

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <Database />
          <div>
            <b>Reporteria</b>
            <span>Prestadores</span>
          </div>
        </div>

        <nav>
          <button
            type="button"
            className={page === 'metrics' ? 'active' : ''}
            onClick={() => setPage('metrics')}
          >
            <BarChart3 size={18} />
            Metricas de Trackeo
          </button>
          <button
            type="button"
            className={page === 'providers' ? 'active' : ''}
            onClick={() => setPage('providers')}
          >
            <Users size={18} />
            Detalle por prestador
          </button>
          <button
            type="button"
            className={page === 'cross' ? 'active' : ''}
            onClick={() => setPage('cross')}
          >
            <Table2 size={18} />
            Campana x prestador
          </button>
          <button
            type="button"
            className={page === 'upload' ? 'active' : ''}
            onClick={() => setPage('upload')}
          >
            <Upload size={18} />
            Cargar reportes
          </button>
        </nav>

        <div className="backend">
          <Server size={18} />
          <span>
            Backend v{backend.version}
            <b className={backend.ok ? 'ok' : 'bad'}>
              {backend.ok ? 'Conectado' : 'Sin conexion'}
            </b>
          </span>
        </div>
      </aside>

      <main>
        {page !== 'upload' && (
          <section className="panel filters">
            <header>
              <Filter size={22} />
              <div>
                <h2>Filtros globales</h2>
                <p>Estado manual. Sin seleccion se incluyen todos los estados.</p>
              </div>
            </header>

            <div className="filter-grid">
              <label>
                <span>Desde</span>
                <input
                  type="date"
                  value={draft.fecha_desde}
                  onChange={(event) =>
                    setDraft({ ...draft, fecha_desde: event.target.value })
                  }
                />
              </label>

              <label>
                <span>Hasta</span>
                <input
                  type="date"
                  value={draft.fecha_hasta}
                  onChange={(event) =>
                    setDraft({ ...draft, fecha_hasta: event.target.value })
                  }
                />
              </label>

              <MultiSelect
                label="Campanas"
                values={draft.campanas}
                options={campaignOptions}
                placeholder="Todas las campanas"
                onChange={(campanas) => setDraft({ ...draft, campanas })}
              />

              <MultiSelect
                label="Prestadores"
                values={draft.prestador_ids}
                options={providerSelectOptions}
                placeholder="Todos los prestadores"
                onChange={(prestador_ids) =>
                  setDraft({ ...draft, prestador_ids })
                }
              />

              <MultiSelect
                label="Estados"
                values={draft.estados}
                options={stateOptions}
                placeholder="Todos los estados"
                onChange={(estados) => setDraft({ ...draft, estados })}
              />

              <button type="button" className="secondary" onClick={resetFilters}>
                Restablecer
              </button>

              <button
                type="button"
                className="primary"
                onClick={applyFilters}
                disabled={loading}
              >
                {loading && <RefreshCw size={16} className="spin" />}
                Aplicar filtros
              </button>
            </div>
          </section>
        )}

        {error && (
          <div className="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {page === 'metrics' && (
          <>
            <div className="title">
              <h1>Metricas de Trackeo</h1>
              <p>Estado manual y filtros reproducibles.</p>
            </div>

            <p>
              <b>Estados aplicados:</b> {selectedStatesText}
            </p>

            <h2>Universos analiticos</h2>
            <section className="cards">
              <MetricCard
                icon={<Database />}
                title="Servicios en el periodo"
                value={nf(universes?.servicios_cargados)}
                detail="Total visible para las fechas"
              />
              <MetricCard
                icon={<Truck />}
                title="Servicios vehiculares"
                value={nf(universes?.servicios_vehiculares)}
                detail="Tipos operativos seleccionados"
              />
              <MetricCard
                icon={<CheckCircle2 />}
                title="Servicios evaluables"
                value={nf(universes?.servicios_evaluables)}
                detail="Base seleccionada para KPI"
                tone="green"
              />
              <MetricCard
                icon={<AlertCircle />}
                title="Vehiculares cancelados"
                value={nf(universes?.servicios_cancelados)}
                detail="Estados cancelados"
                tone="red"
              />
              <MetricCard
                icon={<Clock3 />}
                title="Vehiculares no finalizados"
                value={nf(universes?.servicios_no_finalizados)}
                detail="Pendientes o en curso"
                tone="amber"
              />
              <MetricCard
                icon={<ListChecks />}
                title="Universo seleccionado"
                value={nf(summary?.servicios_consultados)}
                detail={selectedStatesText}
              />
            </section>

            <h2>Indicadores operativos</h2>
            <section className="cards">
              <MetricCard
                icon={<Database />}
                title="Servicios seleccionados"
                value={nf(summary?.servicios_consultados)}
                detail={`${nf(summary?.enviador_si)} con enviador \u00b7 ${nf(summary?.enviador_no)} sin enviador`}
              />
              <MetricCard
                icon={<TrendingUp />}
                title="Uso del enviador"
                value={pct(summary?.uso_enviador)}
                detail={`${nf(summary?.enviador_si)} servicios`}
                onClick={() => void openDrill('ENVIADOR_SI', 'Servicios con enviador')}
              />
              <MetricCard
                icon={<Truck />}
                title="Asigna movil"
                value={nf(summary?.asigna_movil)}
                detail={`${pct(summary?.efectividad_enviador)} efectividad`}
                tone="purple"
                onClick={() => void openDrill('ASIGNA_MOVIL', 'Asigna movil')}
              />
              <MetricCard
                icon={<AlertCircle />}
                title="No asigna movil"
                value={nf(summary?.no_asigna_movil_cantidad)}
                detail={pct(summary?.no_asigna_movil_porcentaje)}
                tone="red"
                onClick={() =>
                  void openDrill('NO_ASIGNA_MOVIL', 'No asigna movil')
                }
              />
              <MetricCard
                icon={<ListChecks />}
                title="Servicios programados"
                value={nf(summary?.servicios_programados)}
                detail={pct(summary?.programados_porcentaje)}
                onClick={() => void openDrill('PROGRAMADOS', 'Programados')}
              />
              <MetricCard
                icon={<CheckCircle2 />}
                title="Cumplimiento de demora"
                value={
                  (summary?.servicios_evaluados_demora ?? 0) > 0
                    ? pct(summary?.cumplimiento_demora)
                    : 'N/A'
                }
                detail={`${nf(summary?.servicios_cumplidos)} cumplen \u00b7 ${nf(summary?.servicios_no_cumplidos)} no cumplen`}
                tone="green"
                onClick={() => void openDrill('CUMPLE_DEMORA', 'Cumple demora')}
              />
            </section>

            <section className="panel block">
              <header>
                <TrendingUp size={22} />
                <div>
                  <h2>Tendencia diaria</h2>
                  <p>Uso, efectividad y cumplimiento.</p>
                </div>
              </header>
              <TrendChart data={trend} />
            </section>

            <section className="panel block">
              <header>
                <BarChart3 size={22} />
                <div>
                  <h2>Distribucion de servicios cumplidos</h2>
                  <p>Sobre {nf(summary?.servicios_cumplidos)} servicios cumplidos.</p>
                </div>
              </header>

              <div className="ranges">
                {ranges.map((range) => (
                  <button
                    type="button"
                    key={range.metric}
                    onClick={() => void openDrill(range.metric, range.label)}
                  >
                    <span>{range.label}</span>
                    <i>
                      <b
                        style={{
                          width: `${Math.min(100, Number(range.ratio || 0) * 100)}%`,
                        }}
                      />
                    </i>
                    <strong>
                      {nf(range.count)} &middot; {pct(range.ratio)}
                    </strong>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel block">
              <header>
                <Database size={22} />
                <div>
                  <h2>Calidad de informacion</h2>
                  <p>Completitud sobre el universo filtrado.</p>
                </div>
              </header>

              <div className="quality">
                {qualityRows.map(([label, value]) => {
                  const ratio = quality?.total ? value / quality.total : 0;
                  return (
                    <article key={label}>
                      <span>
                        {label}
                        <b>{pct(ratio)}</b>
                      </span>
                      <i>
                        <b style={{ width: `${ratio * 100}%` }} />
                      </i>
                      <small>
                        {nf(value)} de {nf(quality?.total)}
                      </small>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {page === 'providers' && (
          <section className="panel page-panel">
            <header>
              <Users size={22} />
              <div>
                <h2>Detalle por prestador</h2>
                <p>{nf(displayedProviders.length)} prestadores</p>
              </div>
            </header>

            <div className="toolbar">
              <div className="search">
                <Search size={16} />
                <input
                  placeholder="Buscar prestador..."
                  value={providerSearch}
                  onChange={(event) => setProviderSearch(event.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    displayedProviders as unknown as Record<string, unknown>[],
                    'prestadores.csv',
                  )
                }
              >
                <Download size={16} />
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
                  {displayedProviders.map((provider) => (
                    <tr key={provider.prestador_id}>
                      <td>{provider.prestador}</td>
                      <td>{nf(provider.total_general)}</td>
                      <td>{nf(provider.enviador_si)}</td>
                      <td>{pct(provider.uso_enviador)}</td>
                      <td>{nf(provider.asigna_movil)}</td>
                      <td>{pct(provider.efectividad_enviador)}</td>
                      <td>{nf(provider.servicios_programados)}</td>
                      <td>{nf(provider.servicios_cumplidos)}</td>
                      <td>{nf(provider.servicios_no_cumplidos)}</td>
                      <td>{pct(provider.cumplimiento_demora)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {page === 'cross' && (
          <section className="panel page-panel">
            <header>
              <Table2 size={22} />
              <div>
                <h2>Campana x prestador</h2>
                <p>{nf(cross.length)} combinaciones</p>
              </div>
            </header>

            <div className="toolbar">
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    cross as unknown as Record<string, unknown>[],
                    'campana-prestador.csv',
                  )
                }
              >
                <Download size={16} />
                Exportar
              </button>
            </div>

            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>Campana</th>
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
                  {cross.map((row, index) => (
                    <tr key={`${row.campana}-${row.prestador_id}-${index}`}>
                      <td>{row.campana}</td>
                      <td>{row.prestador}</td>
                      <td>{nf(row.total_general)}</td>
                      <td>{nf(row.enviador_si)}</td>
                      <td>{pct(row.efectividad_enviador)}</td>
                      <td>{nf(row.servicios_cumplidos)}</td>
                      <td>{nf(row.servicios_no_cumplidos)}</td>
                      <td>{pct(row.cumplimiento_demora)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {page === 'upload' && (
          <section className="panel upload">
            <header>
              <Upload size={22} />
              <div>
                <h2>Cargar reportes</h2>
                <p>Archivos .xlsx o .xlsm</p>
              </div>
            </header>

            <label className="drop">
              <input
                type="file"
                accept=".xlsx,.xlsm"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
              <Upload size={42} />
              <b>{file?.name || 'Seleccionar archivo Excel'}</b>
              <span>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                  : 'Haz clic para seleccionar'}
              </span>
            </label>

            <button
              type="button"
              className="primary upload-button"
              disabled={!file || uploading}
              onClick={() => void submitUpload()}
            >
              {uploading && <RefreshCw className="spin" size={16} />}
              Procesar reporte
            </button>

            {uploadMessage && (
              <div className="status">
                <b>{uploadMessage}</b>
                {uploadStatus && (
                  <span>
                    Estado: {uploadStatus.status} &middot; Filas:{' '}
                    {nf(uploadStatus.filas_procesadas)}
                  </span>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      {drill && (
        <DrilldownModal
          state={drill}
          onClose={() => setDrill(null)}
          onPage={(nextPage) =>
            void openDrill(drill.metric, drill.title, nextPage, drill.pageSize)
          }
          onExportPage={() =>
            downloadCsv(
              drill.rows as unknown as Record<string, unknown>[],
              `pagina-${drill.metric}.csv`,
            )
          }
          onExportAll={() => void exportAll()}
        />
      )}
    </div>
  );
}
