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
  Gauge,
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
type ProviderView = 'adoption' | 'programming' | 'compliance' | 'ranges';
type Tone = 'blue' | 'green' | 'amber' | 'slate' | 'red' | 'purple';
type SelectOption = { value: string; label: string };
type SortDirection = 'asc' | 'desc';
type ProviderSort = {
  key: keyof PrestadorMetric | 'prestador';
  direction: SortDirection;
};

type PaginatedServices = {
  cantidad_total: number;
  pagina: number;
  tamano_pagina: number;
  total_paginas: number;
  servicios: TrackeoService[];
};

type DrillState = {
  title: string;
  metric: MetricaTrackeo;
  services: TrackeoService[];
  loading: boolean;
  exporting: boolean;
  error: string | null;
  total: number;
  pagina: number;
  tamanoPagina: number;
  totalPaginas: number;
};

const DEFAULT_FILTERS: TrackeoFilters = {
  fecha_desde: '2026-08-01',
  fecha_hasta: '2026-08-24',
  campanas: [],
  prestador_ids: [],
};

function readInitialFilters(): TrackeoFilters {
  const params = new URLSearchParams(window.location.search);
  return {
    fecha_desde: params.get('desde') || DEFAULT_FILTERS.fecha_desde,
    fecha_hasta: params.get('hasta') || DEFAULT_FILTERS.fecha_hasta,
    campanas: params.getAll('campana'),
    prestador_ids: params.getAll('prestador_id'),
  };
}

const nf = (value?: number | null) =>
  value == null ? '—' : new Intl.NumberFormat('es-AR').format(value);

const pct = (value?: number | null) =>
  value == null
    ? '—'
    : `${new Intl.NumberFormat('es-AR', {
        maximumFractionDigits: 1,
      }).format(value * 100)} %`;

const decimal = (value?: number | null) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('es-AR', {
        maximumFractionDigits: 1,
      }).format(value);

const boolLabel = (value: boolean | null) =>
  value == null ? '—' : value ? 'Sí' : 'No';

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function queryString(params: Record<string, string | number | string[] | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => item && query.append(key, item));
    } else if (value !== null && value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

async function fetchPaginatedServices(
  filters: TrackeoFilters,
  metric: MetricaTrackeo,
  pagina: number,
  tamanoPagina: number,
): Promise<PaginatedServices> {
  const query = queryString({
    fecha_desde: filters.fecha_desde,
    fecha_hasta: filters.fecha_hasta,
    campana: filters.campanas,
    prestador_id: filters.prestador_ids,
    metrica: metric,
    pagina,
    tamano_pagina: tamanoPagina,
  });

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(
        `${api.url}/api/metricas-trackeo/servicios-paginados?${query}`,
        { cache: 'no-store' },
      );
      const body = await response.json();
      if (response.ok) return body as PaginatedServices;
      const detail = body?.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : detail?.mensaje || detail?.error || `Error HTTP ${response.status}`;
      lastError = new Error(message);
      if (![429, 502, 503, 504].includes(response.status)) throw lastError;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === 4) throw lastError;
    }
    await sleep(700 * 2 ** (attempt - 1));
  }
  throw lastError || new Error('No se pudo consultar el detalle.');
}

function MetricCard({
  icon,
  label,
  value,
  caption,
  tone = 'blue',
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  caption: string;
  tone?: Tone;
  onClick?: () => void;
}) {
  return (
    <article
      className={`metric-card tone-${tone}${onClick ? ' interactive' : ''}`}
      onClick={onClick}
      onKeyDown={(event) => event.key === 'Enter' && onClick?.()}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="metric-card-icon">{icon}</div>
      <div className="metric-card-content">
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
        <div className="metric-caption">{caption}</div>
        {onClick && <div className="metric-link">Ver servicios</div>}
      </div>
    </article>
  );
}

function MultiSelect({
  label,
  values,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  options: SelectOption[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return term
      ? options.filter((item) =>
          item.label.toLocaleLowerCase('es').includes(term),
        )
      : options;
  }, [options, search]);

  const selectedLabel =
    values.length === 1
      ? options.find((item) => item.value === values[0])?.label
      : undefined;

  const toggle = (value: string) =>
    onChange(
      values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value],
    );

  return (
    <div className="multi-select-field" ref={ref}>
      <span>{label}</span>
      <button
        type="button"
        className="multi-select-trigger"
        onClick={() => setOpen(!open)}
      >
        <span>
          {values.length === 0
            ? placeholder
            : values.length === 1
              ? selectedLabel
              : `${values.length} seleccionados`}
        </span>
        <ChevronDown size={17} className={open ? 'rotate' : ''} />
      </button>
      {open && (
        <div className="multi-select-menu">
          <div className="select-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Buscar ${label.toLowerCase()}…`}
              autoFocus
            />
          </div>
          <div className="select-actions">
            <button
              type="button"
              onClick={() =>
                onChange(
                  Array.from(
                    new Set([...values, ...visible.map((item) => item.value)]),
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
          <div className="select-options">
            {visible.map((item) => (
              <label
                key={item.value}
                className={values.includes(item.value) ? 'selected' : ''}
              >
                <input
                  type="checkbox"
                  checked={values.includes(item.value)}
                  onChange={() => toggle(item.value)}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  if (!points.length) {
    return <div className="empty-state">No hay datos diarios para el período.</div>;
  }
  const width = 900;
  const height = 260;
  const pad = 38;
  const x = (index: number) =>
    pad + (index * (width - pad * 2)) / Math.max(1, points.length - 1);
  const y = (value: number) => height - pad - value * (height - pad * 2);
  const line = (
    key: 'cumplimiento_demora' | 'efectividad_enviador' | 'uso_enviador',
  ) =>
    points
      .map((point, index) => `${x(index)},${y(Number(point[key] || 0))}`)
      .join(' ');

  return (
    <div className="trend-chart">
      <div className="chart-legend">
        <span className="green-dot">Cumplimiento</span>
        <span className="blue-dot">Efectividad</span>
        <span className="purple-dot">Uso enviador</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Tendencia diaria de métricas"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((value) => (
          <g key={value}>
            <line
              x1={pad}
              x2={width - pad}
              y1={y(value)}
              y2={y(value)}
              className="grid-line"
            />
            <text x="4" y={y(value) + 4}>
              {Math.round(value * 100)}%
            </text>
          </g>
        ))}
        <polyline points={line('cumplimiento_demora')} className="chart-line green" />
        <polyline points={line('efectividad_enviador')} className="chart-line blue" />
        <polyline points={line('uso_enviador')} className="chart-line purple" />
        {points.map((point, index) => (
          <text
            key={point.fecha}
            x={x(index)}
            y={height - 8}
            textAnchor="middle"
            className="date-label"
          >
            {point.fecha.slice(5)}
          </text>
        ))}
      </svg>
    </div>
  );
}

function DrilldownModal({
  drill,
  onClose,
  onPageChange,
  onExportPage,
  onExportAll,
}: {
  drill: DrillState;
  onClose: () => void;
  onPageChange: (page: number) => void;
  onExportPage: () => void;
  onExportAll: () => void;
}) {
  const first = drill.total === 0 ? 0 : (drill.pagina - 1) * drill.tamanoPagina + 1;
  const last = Math.min(drill.total, first + drill.services.length - 1);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2>{drill.title}</h2>
            <p>
              {nf(drill.total)} servicios totales. Mostrando {nf(first)} a{' '}
              {nf(last)}.
            </p>
          </div>
          <div className="modal-actions">
            <button onClick={onExportPage} disabled={!drill.services.length}>
              <Download size={17} /> Exportar página
            </button>
            <button
              onClick={onExportAll}
              disabled={!drill.total || drill.exporting}
            >
              {drill.exporting ? (
                <RefreshCw size={17} className="spin" />
              ) : (
                <Download size={17} />
              )}
              Exportar todo
            </button>
            <button className="icon-close" onClick={onClose}>
              <X />
            </button>
          </div>
        </header>

        {drill.error && <div className="alert modal-alert"><AlertCircle />{drill.error}</div>}

        {drill.loading ? (
          <div className="loading-state">
            <RefreshCw className="spin" /> Consultando servicios…
          </div>
        ) : drill.services.length === 0 ? (
          <div className="empty-state">No hay servicios para esta métrica.</div>
        ) : (
          <div className="table-wrap modal-table">
            <table>
              <thead>
                <tr>
                  <th>ID servicio</th>
                  <th>Fecha</th>
                  <th>Prestador</th>
                  <th>Campaña</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Prometida</th>
                  <th>Real</th>
                  <th>Cumple</th>
                  <th>Rango</th>
                </tr>
              </thead>
              <tbody>
                {drill.services.map((service) => (
                  <tr key={service.servicio_row_id}>
                    <td>{service.id_servicio_prestado ?? '—'}</td>
                    <td>{service.fecha}</td>
                    <td className="provider-name">
                      {service.prestador || 'SIN PRESTADOR'}
                    </td>
                    <td>{service.campana || 'SIN CAMPAÑA'}</td>
                    <td>{service.tipo_de_servicio || '—'}</td>
                    <td>{service.estado || '—'}</td>
                    <td>{decimal(service.demora_prometida)}</td>
                    <td>{decimal(service.demora_real)}</td>
                    <td>{boolLabel(service.cumple_demora_prometida_15)}</td>
                    <td>{service.rango_demora_real || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="pagination modal-pagination">
          <button
            disabled={drill.pagina <= 1 || drill.loading}
            onClick={() => onPageChange(drill.pagina - 1)}
          >
            Anterior
          </button>
          <span>
            Página {nf(drill.pagina)} de {nf(drill.totalPaginas || 1)}
          </span>
          <button
            disabled={
              drill.pagina >= drill.totalPaginas ||
              drill.totalPaginas === 0 ||
              drill.loading
            }
            onClick={() => onPageChange(drill.pagina + 1)}
          >
            Siguiente
          </button>
        </div>
      </section>
    </div>
  );
}

function App() {
  const initial = useMemo(readInitialFilters, []);
  const [page, setPage] = useState<Page>(() => {
    const value = new URLSearchParams(window.location.search).get('page');
    return value === 'providers' || value === 'cross' || value === 'upload'
      ? value
      : 'metrics';
  });
  const [draft, setDraft] = useState<TrackeoFilters>(initial);
  const [filters, setFilters] = useState<TrackeoFilters>(initial);
  const [summary, setSummary] = useState<TrackeoSummary | null>(null);
  const [universes, setUniverses] = useState<TrackeoUniversos | null>(null);
  const [providers, setProviders] = useState<PrestadorMetric[]>([]);
  const [campaigns, setCampaigns] = useState<CampanaMetric[]>([]);
  const [providerOptions, setProviderOptions] = useState<PrestadorOption[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [quality, setQuality] = useState<DataQuality | null>(null);
  const [cross, setCross] = useState<CampanaPrestadorMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [sectionErrors, setSectionErrors] = useState<string[]>([]);
  const [backend, setBackend] = useState<{
    connected: boolean;
    version?: string;
  }>({ connected: false });
  const [providerView, setProviderView] =
    useState<ProviderView>('adoption');
  const [providerSearch, setProviderSearch] = useState('');
  const [providerPage, setProviderPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<ProviderSort>({
    key: 'total_general',
    direction: 'desc',
  });
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [ingestStatus, setIngestStatus] = useState<IngestStatus | null>(null);

  const load = useCallback(async (next: TrackeoFilters) => {
    setLoading(true);
    setSectionErrors([]);
    const requests = await Promise.allSettled([
      api.trackeoResumen(next),
      api.trackeoUniversos(next),
      api.trackeoPrestadores(next),
      api.trackeoCampanas(
        next.fecha_desde,
        next.fecha_hasta,
        next.prestador_ids,
      ),
      api.trackeoListaPrestadores(
        next.fecha_desde,
        next.fecha_hasta,
        next.campanas,
      ),
      api.trackeoTendencia(next),
      api.trackeoCalidadDatos(next),
      api.trackeoCampanaPrestador(next),
    ]);

    const errors: string[] = [];
    const errorText = (name: string, value: PromiseRejectedResult) => {
      errors.push(
        `${name}: ${
          value.reason instanceof Error
            ? value.reason.message
            : String(value.reason)
        }`,
      );
    };
    const [r1, r2, r3, r4, r5, r6, r7, r8] = requests;
    if (r1.status === 'fulfilled') setSummary(r1.value.resumen);
    else errorText('Resumen', r1);
    if (r2.status === 'fulfilled') setUniverses(r2.value.universos);
    else errorText('Universos', r2);
    if (r3.status === 'fulfilled') setProviders(r3.value.prestadores);
    else errorText('Prestadores', r3);
    if (r4.status === 'fulfilled') setCampaigns(r4.value.campanas);
    else errorText('Campañas', r4);
    if (r5.status === 'fulfilled') setProviderOptions(r5.value.prestadores);
    else errorText('Lista de prestadores', r5);
    if (r6.status === 'fulfilled') setTrend(r6.value.tendencia);
    else errorText('Tendencia', r6);
    if (r7.status === 'fulfilled') setQuality(r7.value.calidad);
    else errorText('Calidad', r7);
    if (r8.status === 'fulfilled') setCross(r8.value.resultados);
    else errorText('Campaña × prestador', r8);
    setSectionErrors(errors);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  useEffect(() => {
    const check = async () => {
      try {
        const result = await api.health();
        setBackend({ connected: result.ok, version: result.version });
      } catch {
        setBackend({ connected: false });
      }
    };
    void check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('desde', filters.fecha_desde);
    params.set('hasta', filters.fecha_hasta);
    params.set('page', page);
    filters.campanas.forEach((value) => params.append('campana', value));
    filters.prestador_ids.forEach((value) =>
      params.append('prestador_id', value),
    );
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?${params.toString()}`,
    );
  }, [filters, page]);

  const campaignOptions = useMemo(
    () =>
      campaigns.map((item) => ({
        value: item.campana,
        label: `${item.campana} (${nf(item.servicios)})`,
      })),
    [campaigns],
  );

  const providerSelectOptions = useMemo(
    () =>
      providerOptions.map((item) => ({
        value: item.prestador_id,
        label: item.prestador,
      })),
    [providerOptions],
  );

  const filteredProviders = useMemo(() => {
    const term = providerSearch.trim().toLocaleLowerCase('es');
    return [...providers]
      .filter(
        (provider) =>
          !term || provider.prestador.toLocaleLowerCase('es').includes(term),
      )
      .sort((a, b) => {
        const av = a[sort.key as keyof PrestadorMetric] ?? '';
        const bv = b[sort.key as keyof PrestadorMetric] ?? '';
        const comparison =
          typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av).localeCompare(String(bv));
        return sort.direction === 'asc' ? comparison : -comparison;
      });
  }, [providers, providerSearch, sort]);

  const providerPages = Math.max(
    1,
    Math.ceil(filteredProviders.length / pageSize),
  );
  const visibleProviders = filteredProviders.slice(
    (providerPage - 1) * pageSize,
    providerPage * pageSize,
  );

  useEffect(() => setProviderPage(1), [providerSearch, pageSize, providerView]);

  const openDrill = async (
    metric: MetricaTrackeo,
    title: string,
    pagina = 1,
    tamanoPagina = 100,
  ) => {
    setDrill((current) => ({
      title,
      metric,
      services: current?.metric === metric ? current.services : [],
      loading: true,
      exporting: false,
      error: null,
      total: current?.metric === metric ? current.total : 0,
      pagina,
      tamanoPagina,
      totalPaginas: current?.metric === metric ? current.totalPaginas : 0,
    }));
    try {
      const result = await fetchPaginatedServices(
        filters,
        metric,
        pagina,
        tamanoPagina,
      );
      setDrill({
        title,
        metric,
        services: result.servicios,
        loading: false,
        exporting: false,
        error: null,
        total: result.cantidad_total,
        pagina: result.pagina,
        tamanoPagina: result.tamano_pagina,
        totalPaginas: result.total_paginas,
      });
    } catch (error) {
      setDrill({
        title,
        metric,
        services: [],
        loading: false,
        exporting: false,
        error: error instanceof Error ? error.message : String(error),
        total: 0,
        pagina,
        tamanoPagina,
        totalPaginas: 0,
      });
    }
  };

  const downloadCsv = (rows: Record<string, unknown>[], filename: string) => {
    if (!rows.length) return;
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
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportAllDrilldown = async () => {
    if (!drill || drill.exporting || !drill.total) return;
    setDrill({ ...drill, exporting: true, error: null });
    try {
      const rows: TrackeoService[] = [];
      const pageSize = 500;
      const pages = Math.ceil(drill.total / pageSize);
      for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
        const result = await fetchPaginatedServices(
          filters,
          drill.metric,
          pageNumber,
          pageSize,
        );
        rows.push(...result.servicios);
        if (pageNumber < pages) await sleep(300);
      }
      if (rows.length !== drill.total) {
        throw new Error(
          `La exportación recuperó ${rows.length} de ${drill.total} servicios.`,
        );
      }
      downloadCsv(
        rows as unknown as Record<string, unknown>[],
        `detalle-${drill.metric}-${filters.fecha_desde}-${filters.fecha_hasta}.csv`,
      );
      setDrill((current) =>
        current ? { ...current, exporting: false } : current,
      );
    } catch (error) {
      setDrill((current) =>
        current
          ? {
              ...current,
              exporting: false,
              error: error instanceof Error ? error.message : String(error),
            }
          : current,
      );
    }
  };

  const sortBy = (key: ProviderSort['key']) =>
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
    }));

  const qualityItems = quality
    ? ([
        ['Tipo de servicio', quality.tipo_servicio_completo],
        ['Estado', quality.estado_completo],
        ['Campaña', quality.campana_completa],
        ['Prestador', quality.prestador_completo],
        ['Despachador', quality.despachador_completo],
        ['Coordenadas', quality.coordenadas_disponibles],
        ['Móvil registrado', quality.movil_registrado],
        ['Demora prometida', quality.demora_prometida_completa],
        ['Demora real', quality.demora_real_completa],
      ] as Array<[string, number]>)
    : [];

  const submitUpload = async () => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadMessage('Subiendo archivo…');
    try {
      const result = await api.ingest(file);
      if (result.status === 'duplicado') {
        setUploadMessage(result.mensaje || 'El archivo ya fue cargado.');
        return;
      }
      if (!result.report_id) throw new Error('El backend no devolvió report_id.');
      for (let attempt = 0; attempt < 600; attempt += 1) {
        const state = await api.ingestStatus(result.report_id);
        setIngestStatus(state);
        if (state.status === 'procesado') {
          setUploadMessage(
            `Carga completada: ${nf(state.filas_procesadas)} filas.`,
          );
          setFile(null);
          await load(filters);
          return;
        }
        if (state.status === 'error' || state.status === 'cancelado') {
          throw new Error(state.error_msg || `Estado ${state.status}`);
        }
        setUploadMessage(
          `${state.etapa || state.status}: ${nf(state.filas_procesadas)} filas.`,
        );
        await sleep(3000);
      }
      throw new Error('La carga excedió el límite de seguimiento.');
    } catch (error) {
      setUploadMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo procesar el archivo.',
      );
    } finally {
      setUploading(false);
    }
  };

  const rangeRows: Array<[
    string,
    number | undefined,
    number | undefined,
    MetricaTrackeo,
  ]> = [
    ['Menos de 60', summary?.menos_60_cantidad, summary?.menos_60_porcentaje, 'MENOS_60'],
    ['61 a 90', summary?.entre_61_90_cantidad, summary?.entre_61_90_porcentaje, 'ENTRE_61_90'],
    ['91 a 120', summary?.entre_91_120_cantidad, summary?.entre_91_120_porcentaje, 'ENTRE_91_120'],
    ['121 a 180', summary?.entre_121_180_cantidad, summary?.entre_121_180_porcentaje, 'ENTRE_121_180'],
    ['Más de 181', summary?.mas_181_cantidad, summary?.mas_181_porcentaje, 'MAS_181'],
    ['N/A', summary?.na_cantidad, summary?.na_porcentaje, 'NA'],
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Database />
          <div>
            <strong>Reportería</strong>
            <span>Prestadores</span>
          </div>
        </div>
        <nav>
          <button
            className={page === 'metrics' ? 'active' : ''}
            onClick={() => setPage('metrics')}
          >
            <BarChart3 /> Métricas de Trackeo
          </button>
          <button
            className={page === 'providers' ? 'active' : ''}
            onClick={() => setPage('providers')}
          >
            <Users /> Detalle por prestador
          </button>
          <button
            className={page === 'cross' ? 'active' : ''}
            onClick={() => setPage('cross')}
          >
            <Table2 /> Campaña × prestador
          </button>
          <button
            className={page === 'upload' ? 'active' : ''}
            onClick={() => setPage('upload')}
          >
            <Upload /> Cargar reportes
          </button>
        </nav>
        <div className="backend-badge">
          <Server />
          <div>
            <span>Backend {backend.version ? `v${backend.version}` : ''}</span>
            <strong className={backend.connected ? 'ok' : 'bad'}>
              {backend.connected ? 'Conectado' : 'Sin conexión'}
            </strong>
          </div>
        </div>
      </aside>

      <main className="main-content">
        {page !== 'upload' && (
          <section className="global-filter panel">
            <div className="panel-title">
              <Filter />
              <div>
                <h2>Filtros globales</h2>
                <p>Se aplican sin modificar las reglas históricas.</p>
              </div>
            </div>
            <div className="filters-grid">
              <label className="field">
                <span>Desde</span>
                <input
                  type="date"
                  value={draft.fecha_desde}
                  onChange={(event) =>
                    setDraft({ ...draft, fecha_desde: event.target.value })
                  }
                />
              </label>
              <label className="field">
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
                label="Campañas"
                values={draft.campanas}
                options={campaignOptions}
                onChange={(campanas) => setDraft({ ...draft, campanas })}
                placeholder="Todas las campañas"
              />
              <MultiSelect
                label="Prestadores"
                values={draft.prestador_ids}
                options={providerSelectOptions}
                onChange={(prestador_ids) =>
                  setDraft({ ...draft, prestador_ids })
                }
                placeholder="Todos los prestadores"
              />
              <button
                className="secondary"
                onClick={() => {
                  setDraft(DEFAULT_FILTERS);
                  setFilters(DEFAULT_FILTERS);
                }}
              >
                Restablecer
              </button>
              <button
                className="primary"
                onClick={() => setFilters({ ...draft })}
              >
                {loading && <RefreshCw className="spin" />} Aplicar filtros
              </button>
            </div>
          </section>
        )}

        <header className="page-header">
          <h1>
            {page === 'metrics'
              ? 'Métricas de Trackeo'
              : page === 'providers'
                ? 'Detalle por prestador'
                : page === 'cross'
                  ? 'Campaña × prestador'
                  : 'Cargar reportes'}
          </h1>
          <p>
            Modelo auditable con universos cargado, vehicular, evaluable e
            histórico.
          </p>
        </header>

        {sectionErrors.length > 0 && (
          <div className="alert">
            <AlertCircle />
            <div>
              <strong>Algunas secciones no pudieron actualizarse.</strong>
              {sectionErrors.map((error) => (
                <span key={error}>{error}</span>
              ))}
            </div>
          </div>
        )}

        {page === 'metrics' && (
          <>
            <section className="section-heading">
              <h2>Universos analíticos</h2>
              <p>Información existente, sin cambios de definición.</p>
            </section>
            <section className="metric-grid">
              <MetricCard
                icon={<Database />}
                label="Servicios en el periodo"
                value={nf(universes?.servicios_cargados)}
                caption="Total visible para las fechas seleccionadas"
              />
              <MetricCard
                icon={<Truck />}
                label="Servicios vehiculares"
                value={nf(universes?.servicios_vehiculares)}
                caption="Finalizados, cancelados y en curso"
                tone="slate"
              />
              <MetricCard
                icon={<CheckCircle2 />}
                label="Servicios evaluables"
                value={nf(universes?.servicios_evaluables)}
                caption="Base ampliada recomendada para KPIs"
                tone="green"
              />
              <MetricCard
                icon={<AlertCircle />}
                label="Vehiculares cancelados"
                value={nf(universes?.servicios_cancelados)}
                caption="Separados del cumplimiento operativo"
                tone="red"
              />
              <MetricCard
                icon={<Clock3 />}
                label="Vehiculares no finalizados"
                value={nf(universes?.servicios_no_finalizados)}
                caption="Pendientes o en curso"
                tone="amber"
              />
              <MetricCard
                icon={<ListChecks />}
                label="Universo Excel histórico"
                value={nf(universes?.universo_excel_historico)}
                caption="Mantiene comparabilidad histórica"
              />
            </section>

            <section className="section-heading">
              <h2>KPIs históricos del Excel</h2>
              <p>Mismos valores y denominadores, ahora con drill-down paginado.</p>
            </section>
            <section className="metric-grid">
              <MetricCard
                icon={<Database />}
                label="Universo Excel evaluable"
                value={nf(summary?.servicios_consultados)}
                caption={`${nf(summary?.enviador_si)} con enviador · ${nf(
                  summary?.enviador_no,
                )} sin enviador`}
              />
              <MetricCard
                icon={<Gauge />}
                label="Uso del enviador"
                value={pct(summary?.uso_enviador)}
                caption={`${nf(summary?.enviador_si)} servicios con Enviador OK`}
                onClick={() => void openDrill('ENVIADOR_SI', 'Servicios con enviador')}
              />
              <MetricCard
                icon={<Truck />}
                label="Asigna móvil"
                value={nf(summary?.asigna_movil)}
                caption={`${pct(summary?.efectividad_enviador)} de efectividad`}
                tone="purple"
                onClick={() => void openDrill('ASIGNA_MOVIL', 'Servicios que asignan móvil')}
              />
              <MetricCard
                icon={<AlertCircle />}
                label="No asigna móvil"
                value={nf(summary?.no_asigna_movil_cantidad)}
                caption={pct(summary?.no_asigna_movil_porcentaje)}
                tone="red"
                onClick={() =>
                  void openDrill(
                    'NO_ASIGNA_MOVIL',
                    'Servicios que no asignan móvil',
                  )
                }
              />
              <MetricCard
                icon={<ListChecks />}
                label="Servicios programados"
                value={nf(summary?.servicios_programados)}
                caption={`${pct(summary?.programados_porcentaje)} sobre Enviador Sí`}
                onClick={() => void openDrill('PROGRAMADOS', 'Servicios programados')}
              />
              <MetricCard
                icon={<CheckCircle2 />}
                label="Cumplimiento de demora"
                value={pct(summary?.cumplimiento_demora)}
                caption={`${nf(summary?.servicios_cumplidos)} cumplen · ${nf(
                  summary?.servicios_no_cumplidos,
                )} no cumplen`}
                tone="green"
                onClick={() =>
                  void openDrill('CUMPLE_DEMORA', 'Servicios que cumplen demora')
                }
              />
            </section>

            <section className="panel analytics-panel">
              <div className="panel-title">
                <TrendingUp />
                <div>
                  <h2>Tendencia diaria</h2>
                  <p>
                    Uso del enviador, efectividad y cumplimiento sobre el mismo
                    universo histórico.
                  </p>
                </div>
              </div>
              <TrendChart points={trend} />
            </section>

            <section className="panel analytics-panel">
              <div className="panel-title">
                <BarChart3 />
                <div>
                  <h2>Distribución de servicios cumplidos</h2>
                  <p>
                    Porcentaje sobre {nf(summary?.servicios_cumplidos)} servicios
                    cumplidos.
                  </p>
                </div>
              </div>
              <div className="distribution">
                {rangeRows.map(([label, count, ratio, metric]) => (
                  <button
                    className="bar-row"
                    key={label}
                    onClick={() => void openDrill(metric, label)}
                  >
                    <span>{label}</span>
                    <div>
                      <i
                        style={{
                          width: `${Math.min(100, Number(ratio || 0) * 100)}%`,
                        }}
                      />
                    </div>
                    <strong>
                      {nf(count)} · {pct(ratio)}
                    </strong>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel analytics-panel">
              <div className="panel-title">
                <Database />
                <div>
                  <h2>Calidad de información</h2>
                  <p>
                    Completitud descriptiva. No altera ninguna métrica existente.
                  </p>
                </div>
              </div>
              <div className="quality-grid">
                {qualityItems.map(([label, value]) => {
                  const ratio = quality?.total ? value / quality.total : 0;
                  return (
                    <div key={label} className="quality-item">
                      <div>
                        <span>{label}</span>
                        <strong>{pct(ratio)}</strong>
                      </div>
                      <div className="quality-bar">
                        <i style={{ width: `${ratio * 100}%` }} />
                      </div>
                      <small>
                        {nf(value)} de {nf(quality?.total)}
                      </small>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {page === 'providers' && (
          <section className="panel providers-panel">
            <div className="panel-title">
              <Users />
              <div>
                <h2>Análisis completo por prestador</h2>
                <p>
                  {nf(filteredProviders.length)} prestadores. La tabla conserva
                  los valores originales.
                </p>
              </div>
            </div>
            <div className="table-toolbar">
              <div className="search-box">
                <Search />
                <input
                  value={providerSearch}
                  onChange={(event) => setProviderSearch(event.target.value)}
                  placeholder="Buscar prestador…"
                />
              </div>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
              >
                <option value={25}>25 por página</option>
                <option value={50}>50 por página</option>
                <option value={100}>100 por página</option>
              </select>
              <button
                onClick={() =>
                  downloadCsv(
                    filteredProviders as unknown as Record<string, unknown>[],
                    'prestadores.csv',
                  )
                }
              >
                <Download /> Exportar CSV
              </button>
            </div>
            <div className="analytics-tabs">
              {(
                [
                  ['adoption', 'Adopción'],
                  ['programming', 'Programación'],
                  ['compliance', 'Cumplimiento'],
                  ['ranges', 'Rangos de demora'],
                ] as Array<[ProviderView, string]>
              ).map(([view, label]) => (
                <button
                  key={view}
                  className={providerView === view ? 'active' : ''}
                  onClick={() => setProviderView(view)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="table-wrap provider-table">
              <table>
                <thead>
                  <tr>
                    <th onClick={() => sortBy('prestador')}>Prestador</th>
                    {providerView === 'adoption' && (
                      <>
                        <th onClick={() => sortBy('total_general')}>Total</th>
                        <th>Sin enviador</th>
                        <th>Con enviador</th>
                        <th onClick={() => sortBy('uso_enviador')}>% uso</th>
                        <th>Asigna móvil</th>
                        <th>No asigna</th>
                        <th>% no asigna</th>
                        <th onClick={() => sortBy('efectividad_enviador')}>
                          Efectividad
                        </th>
                      </>
                    )}
                    {providerView === 'programming' && (
                      <>
                        <th>Con enviador</th>
                        <th>Programados</th>
                        <th>% programados</th>
                        <th>No programados</th>
                      </>
                    )}
                    {providerView === 'compliance' && (
                      <>
                        <th>Evaluados</th>
                        <th>Cumple</th>
                        <th>No cumple</th>
                        <th onClick={() => sortBy('cumplimiento_demora')}>
                          % cumplimiento
                        </th>
                      </>
                    )}
                    {providerView === 'ranges' && (
                      <>
                        <th>&lt;60</th>
                        <th>61-90</th>
                        <th>91-120</th>
                        <th>121-180</th>
                        <th>&gt;181</th>
                        <th>N/A</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleProviders.map((provider) => (
                    <tr key={provider.prestador_id}>
                      <td className="provider-name">{provider.prestador}</td>
                      {providerView === 'adoption' && (
                        <>
                          <td>{nf(provider.total_general)}</td>
                          <td>{nf(provider.enviador_no)}</td>
                          <td>{nf(provider.enviador_si)}</td>
                          <td>{pct(provider.uso_enviador)}</td>
                          <td>{nf(provider.asigna_movil)}</td>
                          <td>{nf(provider.no_asigna_movil_cantidad)}</td>
                          <td>{pct(provider.no_asigna_movil_porcentaje)}</td>
                          <td>{pct(provider.efectividad_enviador)}</td>
                        </>
                      )}
                      {providerView === 'programming' && (
                        <>
                          <td>{nf(provider.enviador_si)}</td>
                          <td>{nf(provider.servicios_programados)}</td>
                          <td>{pct(provider.programados_porcentaje)}</td>
                          <td>
                            {nf(
                              (provider.enviador_si ?? 0) -
                                (provider.servicios_programados ?? 0),
                            )}
                          </td>
                        </>
                      )}
                      {providerView === 'compliance' && (
                        <>
                          <td>
                            {nf(
                              (provider.servicios_cumplidos ?? 0) +
                                (provider.servicios_no_cumplidos ?? 0),
                            )}
                          </td>
                          <td>{nf(provider.servicios_cumplidos)}</td>
                          <td>{nf(provider.servicios_no_cumplidos)}</td>
                          <td>{pct(provider.cumplimiento_demora)}</td>
                        </>
                      )}
                      {providerView === 'ranges' && (
                        <>
                          <td>{nf(provider.menos_60_cantidad)}</td>
                          <td>{nf(provider.entre_61_90_cantidad)}</td>
                          <td>{nf(provider.entre_91_120_cantidad)}</td>
                          <td>{nf(provider.entre_121_180_cantidad)}</td>
                          <td>{nf(provider.mas_181_cantidad)}</td>
                          <td>{nf(provider.na_cantidad)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button
                disabled={providerPage === 1}
                onClick={() => setProviderPage(providerPage - 1)}
              >
                Anterior
              </button>
              <span>
                Página {providerPage} de {providerPages}
              </span>
              <button
                disabled={providerPage === providerPages}
                onClick={() => setProviderPage(providerPage + 1)}
              >
                Siguiente
              </button>
            </div>
          </section>
        )}

        {page === 'cross' && (
          <section className="panel">
            <div className="panel-title">
              <Table2 />
              <div>
                <h2>Cruce campaña × prestador</h2>
                <p>
                  {nf(cross.length)} combinaciones. Incluye SIN CAMPAÑA y SIN
                  PRESTADOR cuando correspondan.
                </p>
              </div>
            </div>
            <div className="table-toolbar">
              <button
                onClick={() =>
                  downloadCsv(
                    cross as unknown as Record<string, unknown>[],
                    'campana-prestador.csv',
                  )
                }
              >
                <Download /> Exportar CSV
              </button>
            </div>
            <div className="table-wrap cross-table">
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
                    <th>Demora real prom.</th>
                    <th>Desvío prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {cross.map((row, index) => (
                    <tr
                      key={`${row.campana_normalizada}-${
                        row.prestador_id || 'sin-prestador'
                      }-${index}`}
                    >
                      <td>{row.campana || 'SIN CAMPAÑA'}</td>
                      <td className="provider-name">
                        {row.prestador || 'SIN PRESTADOR'}
                      </td>
                      <td>{nf(row.total_general)}</td>
                      <td>{nf(row.enviador_si)}</td>
                      <td>{pct(row.efectividad_enviador)}</td>
                      <td>{nf(row.servicios_cumplidos)}</td>
                      <td>{nf(row.servicios_no_cumplidos)}</td>
                      <td>{pct(row.cumplimiento_demora)}</td>
                      <td>{decimal(row.demora_real_promedio)}</td>
                      <td>{decimal(row.desvio_promedio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {page === 'upload' && (
          <section className="panel upload-panel">
            <div className="panel-title">
              <Upload />
              <div>
                <h2>Nueva carga</h2>
                <p>Procesamiento mediante COPY, staging y merge SQL.</p>
              </div>
            </div>
            <label className="upload-box">
              <input
                type="file"
                accept=".xlsx,.xlsm"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
              <Upload size={42} />
              <strong>{file ? file.name : 'Seleccioná un archivo Excel'}</strong>
              <span>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                  : 'Formatos admitidos: .xlsx y .xlsm'}
              </span>
            </label>
            <button
              className="primary upload-button"
              disabled={!file || uploading}
              onClick={() => void submitUpload()}
            >
              {uploading ? (
                <RefreshCw className="spin" />
              ) : (
                <Upload />
              )}
              {uploading ? 'Procesando…' : 'Procesar reporte'}
            </button>
            {uploadMessage && (
              <div className="status-box">
                <strong>{uploadMessage}</strong>
                {ingestStatus && (
                  <span>
                    Estado: {ingestStatus.status} · Etapa:{' '}
                    {ingestStatus.etapa || '—'} · Filas:{' '}
                    {nf(ingestStatus.filas_procesadas)}
                  </span>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      {drill && (
        <DrilldownModal
          drill={drill}
          onClose={() => setDrill(null)}
          onPageChange={(newPage) =>
            void openDrill(
              drill.metric,
              drill.title,
              newPage,
              drill.tamanoPagina,
            )
          }
          onExportPage={() =>
            downloadCsv(
              drill.services as unknown as Record<string, unknown>[],
              `detalle-${drill.metric}-pagina-${drill.pagina}.csv`,
            )
          }
          onExportAll={() => void exportAllDrilldown()}
        />
      )}

      <style>{`
        :root{font-family:Inter,ui-sans-serif,system-ui;color:#0a1930;background:#eef4fb}*{box-sizing:border-box}body{margin:0}.app-shell{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:100vh;background:radial-gradient(circle at 70% 5%,#e4f2ff 0,transparent 32%),#f5f8fc}.sidebar{position:sticky;top:0;height:100vh;padding:28px 18px;background:linear-gradient(180deg,#0d2b50,#0a2342);color:#fff;display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:12px;padding:4px 10px 32px}.brand>svg{width:40px;height:40px;padding:9px;border-radius:11px;background:#1768e5}.brand strong,.brand span{display:block}.brand strong{font-size:21px}.brand span{color:#73c9f4;font-size:13px}.sidebar nav{display:grid;gap:8px}.sidebar nav button{border:0;background:transparent;color:#c6d5e8;padding:13px 12px;border-radius:10px;text-align:left;display:flex;align-items:center;gap:11px;cursor:pointer}.sidebar nav button svg{width:18px}.sidebar nav button.active,.sidebar nav button:hover{background:#17487f;color:#fff}.backend-badge{margin-top:auto;border:1px solid #2d537b;border-radius:12px;padding:13px;display:flex;gap:10px;align-items:center}.backend-badge svg{width:18px}.backend-badge span,.backend-badge strong{display:block;font-size:12px}.ok{color:#46dda5}.bad{color:#ff8181}.main-content{min-width:0;width:100%;max-width:1580px;padding:28px 34px;margin:auto}.page-header{margin:32px 0 18px}.page-header h1{margin:0;font-size:31px}.page-header p,.panel-title p,.section-heading p{margin:5px 0 0;color:#687a91}.panel{background:rgba(255,255,255,.88);border:1px solid #d9e4ef;border-radius:17px;padding:22px;box-shadow:0 12px 30px rgba(31,68,112,.08)}.panel-title{display:flex;align-items:flex-start;gap:12px}.panel-title h2,.section-heading h2{margin:0;font-size:20px}.panel-title>svg{color:#1d63be}.filters-grid{display:grid;grid-template-columns:160px 160px minmax(210px,1fr) minmax(210px,1fr) auto auto;gap:12px;align-items:end;margin-top:18px}.field,.multi-select-field{display:grid;gap:6px;position:relative;min-width:0}.field>span,.multi-select-field>span{font-size:12px;font-weight:800}.field input,.multi-select-trigger{height:43px;width:100%;border:1px solid #ccd9e8;border-radius:10px;background:#fff;padding:0 11px}.multi-select-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer}.multi-select-trigger span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rotate{transform:rotate(180deg)}.multi-select-menu{position:absolute;z-index:30;top:68px;width:100%;min-width:300px;background:#fff;border:1px solid #cad8e8;border-radius:12px;box-shadow:0 18px 45px rgba(20,48,80,.2);overflow:hidden}.select-search{display:flex;gap:8px;align-items:center;padding:10px;border-bottom:1px solid #e4ebf3}.select-search input{border:0;outline:0;min-width:0;flex:1}.select-actions{display:flex;gap:8px;padding:8px;background:#f6f9fd}.select-actions button,.table-toolbar button,.modal-actions button{border:0;background:#e6effc;color:#1858ad;border-radius:8px;padding:8px 10px;font-weight:700;cursor:pointer}.select-options{max-height:240px;overflow:auto;padding:6px;display:grid;gap:2px}.select-options label{display:grid;grid-template-columns:18px 1fr;align-items:center;gap:9px;padding:8px;border-radius:7px;font-size:13px}.select-options label.selected,.select-options label:hover{background:#eaf2ff}.primary,.secondary{height:43px;border:0;border-radius:10px;padding:0 15px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}.primary{background:linear-gradient(135deg,#1767df,#347fe9);color:#fff}.secondary{background:#eaf0f7;color:#40536a}.section-heading{margin:28px 0 13px}.metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}.metric-card{min-height:144px;background:#fff;border:1px solid #dae5f0;border-radius:16px;padding:19px;display:flex;gap:14px;box-shadow:0 10px 24px rgba(29,65,106,.08)}.metric-card.interactive{cursor:pointer;transition:.18s}.metric-card.interactive:hover{transform:translateY(-2px)}.metric-card-icon{width:47px;height:47px;flex:0 0 auto;display:grid;place-items:center;border-radius:12px;background:#e5f3ff;color:#1686c1}.tone-green .metric-card-icon{background:#e1faef;color:#0ca66b}.tone-amber .metric-card-icon{background:#fff4d5;color:#c88b10}.tone-red .metric-card-icon{background:#ffe7e9;color:#d14755}.tone-purple .metric-card-icon{background:#f0e5ff;color:#8b39cb}.tone-slate .metric-card-icon{background:#edf2f6;color:#577087}.metric-label{font-weight:800;color:#50637a}.metric-value{font-size:31px;font-weight:900;margin-top:5px}.metric-caption{font-size:13px;color:#687a91;margin-top:4px}.metric-link{font-size:12px;color:#1767df;font-weight:800;margin-top:9px}.analytics-panel{margin-top:22px}.trend-chart{margin-top:18px;overflow:auto}.trend-chart svg{width:100%;min-width:760px;height:auto}.grid-line{stroke:#dce6f0}.chart-line{fill:none;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.chart-line.green{stroke:#19b97a}.chart-line.blue{stroke:#2388d8}.chart-line.purple{stroke:#8a4de0}.trend-chart text{font-size:11px;fill:#718196}.date-label{font-size:9px!important}.chart-legend{display:flex;gap:18px;justify-content:flex-end;font-size:12px;font-weight:700}.chart-legend span:before{content:'';display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}.green-dot:before{background:#19b97a}.blue-dot:before{background:#2388d8}.purple-dot:before{background:#8a4de0}.distribution{display:grid;gap:10px;margin-top:18px}.bar-row{border:0;background:transparent;display:grid;grid-template-columns:120px 1fr 145px;gap:12px;align-items:center;text-align:left;cursor:pointer;padding:6px;border-radius:8px}.bar-row:hover{background:#f2f7fd}.bar-row>div{height:13px;border-radius:20px;background:#e3ebf4;overflow:hidden}.bar-row i{display:block;height:100%;border-radius:20px;background:linear-gradient(90deg,#13b87d,#64d8ae)}.quality-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:18px}.quality-item{padding:14px;border:1px solid #e1e9f2;border-radius:12px}.quality-item>div:first-child{display:flex;justify-content:space-between}.quality-bar{height:7px;background:#e7edf5;border-radius:10px;margin:9px 0}.quality-bar i{display:block;height:100%;background:#2e7ee6;border-radius:10px}.alert{margin:18px 0;background:#fff2f2;color:#9b2a36;padding:13px;border-radius:11px;display:flex;gap:10px}.alert span{display:block}.table-toolbar{display:flex;gap:10px;justify-content:flex-end;align-items:center;margin:18px 0}.search-box{display:flex;align-items:center;gap:8px;border:1px solid #ccd9e8;background:#fff;border-radius:10px;padding:0 10px;height:41px;margin-right:auto}.search-box input{border:0;outline:0;min-width:240px}.table-toolbar select{height:41px;border:1px solid #ccd9e8;border-radius:10px;background:#fff;padding:0 10px}.table-toolbar button{display:flex;gap:7px;align-items:center}.analytics-tabs{display:flex;gap:8px;flex-wrap:wrap}.analytics-tabs button{border:1px solid #cad7e6;background:#f5f8fc;color:#52667d;border-radius:9px;padding:9px 12px;font-weight:800;cursor:pointer}.analytics-tabs button.active{border-color:#2b71d0;background:#e7f0ff;color:#194f99}.table-wrap{overflow:auto;margin-top:15px}.provider-table{max-height:620px}.provider-table thead,.cross-table thead,.modal-table thead{position:sticky;top:0;z-index:2}.provider-name{min-width:285px;font-weight:700}.table-wrap table{width:100%;border-collapse:collapse;white-space:nowrap}.table-wrap th,.table-wrap td{padding:12px;border-bottom:1px solid #e5ebf2;text-align:left}.table-wrap th{background:#f5f8fc;color:#50637a;font-size:12px;cursor:pointer}.pagination{display:flex;justify-content:center;align-items:center;gap:12px;margin-top:16px;padding:10px}.pagination button{border:0;background:#e8f0fb;color:#245da4;border-radius:8px;padding:8px 12px;font-weight:700}.pagination button:disabled,.modal-actions button:disabled{opacity:.45;cursor:not-allowed}.upload-panel{max-width:720px}.upload-box{margin-top:20px;border:2px dashed #2e6dad;border-radius:16px;min-height:280px;display:grid;place-items:center;align-content:center;gap:10px;background:#eef6ff;cursor:pointer}.upload-box input{display:none}.upload-button{width:100%;margin-top:15px}.status-box{margin-top:15px;padding:14px;border-radius:10px;background:#eaf3ff;display:grid;gap:5px}.modal-backdrop{position:fixed;inset:0;z-index:100;background:rgba(5,19,36,.55);display:grid;place-items:center;padding:30px}.modal{width:min(1280px,96vw);max-height:90vh;overflow:hidden;background:#fff;border-radius:17px;box-shadow:0 30px 80px rgba(0,0,0,.3);display:flex;flex-direction:column}.modal>header{padding:20px 22px;border-bottom:1px solid #e4eaf2;display:flex;justify-content:space-between;align-items:flex-start;gap:15px}.modal h2{margin:0}.modal p{margin:4px 0 0;color:#6b7c91}.modal-actions{display:flex;gap:8px;flex-wrap:wrap}.modal-actions button{display:flex;align-items:center;gap:6px}.icon-close{background:#f1f4f8!important;color:#506279!important}.modal-table{margin:0;overflow:auto;flex:1}.modal-alert{margin:12px 20px}.modal-pagination{border-top:1px solid #e4eaf2;margin:0}.loading-state,.empty-state{padding:50px;text-align:center;color:#66798f;display:flex;justify-content:center;gap:9px}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:1200px){.app-shell{grid-template-columns:215px 1fr}.main-content{padding:24px}.filters-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.quality-grid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:760px){.app-shell{display:block}.sidebar{position:static;height:auto}.backend-badge{margin-top:14px}.main-content{padding:18px 12px}.metric-grid,.quality-grid,.filters-grid{grid-template-columns:1fr}.bar-row{grid-template-columns:1fr}.search-box input{min-width:0}.table-toolbar{align-items:stretch;flex-direction:column}.modal-backdrop{padding:8px}.modal>header{flex-direction:column}.modal-actions{width:100%}}
      `}</style>
    </div>
  );
}

export default App;
