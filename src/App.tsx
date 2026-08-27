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
  Truck,
  X,
} from 'lucide-react';
import {
  api,
  type EstadoOption,
  type MetricaTrackeo,
  type PaginatedServices,
  type TrackeoFilters,
  type TrackeoService,
  type TrackeoSummary,
} from './api';
import './App.css';

type Tone = 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'slate';

type SelectOption = {
  value: string;
  label: string;
  count?: number;
};

type DrillState = {
  title: string;
  metric: MetricaTrackeo;
  services: TrackeoService[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
    fecha_desde:
      params.get('desde') || DEFAULT_FILTERS.fecha_desde,
    fecha_hasta:
      params.get('hasta') || DEFAULT_FILTERS.fecha_hasta,
    campanas: params.getAll('campana'),
    prestador_ids: params.getAll('prestador_id'),
    estados: params.getAll('estado'),
  };
}

const numberFormat = new Intl.NumberFormat('es-AR');
const decimalFormat = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 1,
});

function nf(value?: number | null): string {
  return value === null || value === undefined
    ? '—'
    : numberFormat.format(value);
}

function pct(value?: number | null): string {
  return value === null || value === undefined
    ? '—'
    : `${decimalFormat.format(value * 100)} %`;
}

function decimal(value?: number | null): string {
  return value === null || value === undefined
    ? '—'
    : decimalFormat.format(value);
}

function boolLabel(value?: boolean | null): string {
  if (value === null || value === undefined) return '—';
  return value ? 'Sí' : 'No';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="metric-icon">{icon}</div>
      <div className="metric-content">
        <span className="metric-label">{label}</span>
        <strong className="metric-value">{value}</strong>
        <span className="metric-caption">{caption}</span>
        {onClick && <span className="metric-link">Ver servicios</span>}
      </div>
    </article>
  );
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
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const visibleOptions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    if (!term) return options;
    return options.filter((option) =>
      option.label.toLocaleLowerCase('es').includes(term),
    );
  }, [options, search]);

  const selectedLabel = useMemo(() => {
    if (values.length === 0) return placeholder;
    if (values.length === 1) {
      return (
        options.find((option) => option.value === values[0])?.label ||
        values[0]
      );
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
    <div className="multi-select" ref={rootRef}>
      <span className="field-label">{label}</span>
      <button
        type="button"
        className="multi-select-trigger"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedLabel}</span>
        <ChevronDown
          size={17}
          className={open ? 'rotate' : ''}
        />
      </button>

      {open && (
        <div className="multi-select-menu">
          <div className="select-search">
            <Search size={16} />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Buscar ${label.toLowerCase()}…`}
            />
          </div>

          <div className="select-actions">
            <button
              type="button"
              onClick={() =>
                onChange(
                  Array.from(
                    new Set([
                      ...values,
                      ...visibleOptions.map((option) => option.value),
                    ]),
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
            {visibleOptions.length === 0 && (
              <div className="select-empty">Sin coincidencias.</div>
            )}
            {visibleOptions.map((option) => (
              <label
                key={option.value}
                className={
                  values.includes(option.value) ? 'selected' : ''
                }
              >
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

function downloadCsv(
  rows: TrackeoService[],
  filename: string,
): void {
  if (rows.length === 0) return;

  const columns: Array<keyof TrackeoService> = [
    'servicio_row_id',
    'id_servicio_prestado',
    'id_orden_de_servicio',
    'fecha',
    'alta_del_servicio',
    'prestador',
    'campana',
    'tipo_de_servicio',
    'estado',
    'con_envio_ok',
    'asigno_movil',
    'es_programado',
    'demora_prometida',
    'demora_real',
    'cumple_demora_prometida_15',
    'rango_demora_real',
  ];

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
  const first =
    state.total === 0
      ? 0
      : (state.page - 1) * state.pageSize + 1;
  const last = Math.min(
    state.total,
    first + state.services.length - 1,
  );

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2>{state.title}</h2>
            <p>
              {nf(state.total)} servicios totales. Mostrando {nf(first)} a{' '}
              {nf(last)}.
            </p>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              onClick={onExportPage}
              disabled={state.services.length === 0}
            >
              <Download size={16} /> Exportar página
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
              Exportar todo
            </button>
            <button
              type="button"
              className="close-button"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {state.error && (
          <div className="alert modal-alert">
            <AlertCircle size={20} />
            <span>{state.error}</span>
          </div>
        )}

        {state.loading ? (
          <div className="loading-state">
            <RefreshCw className="spin" />
            Consultando servicios…
          </div>
        ) : state.services.length === 0 ? (
          <div className="empty-state">
            No hay servicios para los filtros seleccionados.
          </div>
        ) : (
          <div className="table-wrapper modal-table">
            <table>
              <thead>
                <tr>
                  <th>ID servicio</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Tipo de servicio</th>
                  <th>Prestador</th>
                  <th>Campaña</th>
                  <th>Enviador</th>
                  <th>Asigna móvil</th>
                  <th>Programado</th>
                  <th>Prometida</th>
                  <th>Real</th>
                  <th>Cumple</th>
                  <th>Rango</th>
                </tr>
              </thead>
              <tbody>
                {state.services.map((service) => (
                  <tr key={service.servicio_row_id}>
                    <td>{service.id_servicio_prestado ?? '—'}</td>
                    <td>{service.fecha || '—'}</td>
                    <td>{service.estado || '—'}</td>
                    <td>{service.tipo_de_servicio || '—'}</td>
                    <td className="provider-cell">
                      {service.prestador || 'SIN PRESTADOR'}
                    </td>
                    <td>{service.campana || 'SIN CAMPAÑA'}</td>
                    <td>{boolLabel(service.con_envio_ok)}</td>
                    <td>{boolLabel(service.asigno_movil)}</td>
                    <td>{boolLabel(service.es_programado)}</td>
                    <td>{decimal(service.demora_prometida)}</td>
                    <td>{decimal(service.demora_real)}</td>
                    <td>
                      {boolLabel(service.cumple_demora_prometida_15)}
                    </td>
                    <td>{service.rango_demora_real || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="pagination modal-pagination">
          <button
            type="button"
            disabled={state.page <= 1 || state.loading}
            onClick={() => onPage(state.page - 1)}
          >
            Anterior
          </button>
          <span>
            Página {nf(state.page)} de {nf(state.totalPages || 1)}
          </span>
          <button
            type="button"
            disabled={
              state.loading ||
              state.totalPages === 0 ||
              state.page >= state.totalPages
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
  const [draft, setDraft] =
    useState<TrackeoFilters>(initialFilters);
  const [filters, setFilters] =
    useState<TrackeoFilters>(initialFilters);
  const [summary, setSummary] =
    useState<TrackeoSummary | null>(null);
  const [states, setStates] = useState<EstadoOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backend, setBackend] = useState<{
    connected: boolean;
    version?: string;
  }>({ connected: false });
  const [drill, setDrill] = useState<DrillState | null>(null);

  const load = useCallback(async (next: TrackeoFilters) => {
    setLoading(true);
    setError(null);

    const [summaryResult, statesResult] = await Promise.allSettled([
      api.trackeoResumen(next),
      api.trackeoEstados(next),
    ]);

    const errors: string[] = [];

    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value.resumen);
    } else {
      errors.push(
        summaryResult.reason instanceof Error
          ? summaryResult.reason.message
          : String(summaryResult.reason),
      );
    }

    if (statesResult.status === 'fulfilled') {
      setStates(statesResult.value.estados);
    } else {
      errors.push(
        statesResult.reason instanceof Error
          ? statesResult.reason.message
          : String(statesResult.reason),
      );
    }

    if (errors.length > 0) setError(errors.join(' | '));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  useEffect(() => {
    const check = async () => {
      try {
        const response = await api.health();
        setBackend({
          connected: response.ok,
          version: response.version,
        });
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
    filters.campanas.forEach((value) =>
      params.append('campana', value),
    );
    filters.prestador_ids.forEach((value) =>
      params.append('prestador_id', value),
    );
    filters.estados.forEach((value) =>
      params.append('estado', value),
    );
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?${params.toString()}`,
    );
  }, [filters]);

  const stateOptions = useMemo<SelectOption[]>(
    () =>
      states.map((item) => ({
        value: item.estado_normalizado,
        label: `${item.estado} (${nf(item.cantidad)})`,
        count: item.cantidad,
      })),
    [states],
  );

  const selectedStatesText = useMemo(
    () =>
      filters.estados.length === 0
        ? 'Todos los estados'
        : filters.estados.join(', '),
    [filters.estados],
  );

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

  const openDrill = async (
    metric: MetricaTrackeo,
    title: string,
    page = 1,
    pageSize = 100,
  ) => {
    setDrill((current) => ({
      title,
      metric,
      services:
        current?.metric === metric ? current.services : [],
      total: current?.metric === metric ? current.total : 0,
      page,
      pageSize,
      totalPages:
        current?.metric === metric ? current.totalPages : 0,
      loading: true,
      exporting: false,
      error: null,
    }));

    try {
      const response = await api.trackeoServiciosPaginados(
        filters,
        metric,
        page,
        pageSize,
      );
      setDrill({
        title,
        metric,
        services: response.servicios,
        total: response.cantidad_total,
        page: response.pagina,
        pageSize: response.tamano_pagina,
        totalPages: response.total_paginas,
        loading: false,
        exporting: false,
        error: null,
      });
    } catch (caught) {
      setDrill({
        title,
        metric,
        services: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
        loading: false,
        exporting: false,
        error:
          caught instanceof Error ? caught.message : String(caught),
      });
    }
  };

  const exportAll = async () => {
    if (!drill || drill.exporting || drill.total === 0) return;

    setDrill({ ...drill, exporting: true, error: null });
    try {
      const rows: TrackeoService[] = [];
      const exportPageSize = 500;
      const pages = Math.ceil(drill.total / exportPageSize);

      for (let page = 1; page <= pages; page += 1) {
        const response: PaginatedServices =
          await api.trackeoServiciosPaginados(
            filters,
            drill.metric,
            page,
            exportPageSize,
          );
        rows.push(...response.servicios);
        if (page < pages) await sleep(300);
      }

      if (rows.length !== drill.total) {
        throw new Error(
          `Se recuperaron ${nf(rows.length)} de ${nf(
            drill.total,
          )} servicios. No se generó un archivo incompleto.`,
        );
      }

      downloadCsv(
        rows,
        `detalle-${drill.metric}-${filters.fecha_desde}-${filters.fecha_hasta}.csv`,
      );
      setDrill((current) =>
        current ? { ...current, exporting: false } : current,
      );
    } catch (caught) {
      setDrill((current) =>
        current
          ? {
              ...current,
              exporting: false,
              error:
                caught instanceof Error
                  ? caught.message
                  : String(caught),
            }
          : current,
      );
    }
  };

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
      label: 'Más de 181',
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
          <button type="button" className="active">
            <BarChart3 size={18} />
            Métricas de Trackeo
          </button>
        </nav>

        <div className="backend-card">
          <Server size={18} />
          <div>
            <span>
              Backend {backend.version ? `v${backend.version}` : ''}
            </span>
            <strong className={backend.connected ? 'ok' : 'bad'}>
              {backend.connected ? 'Conectado' : 'Sin conexión'}
            </strong>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <section className="panel filter-panel">
          <div className="panel-heading">
            <Filter size={23} />
            <div>
              <h2>Filtros globales</h2>
              <p>
                El Estado es completamente manual. Sin selección se incluyen
                todos los estados.
              </p>
            </div>
          </div>

          <div className="filters-grid">
            <label className="field">
              <span className="field-label">Desde</span>
              <input
                type="date"
                value={draft.fecha_desde}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    fecha_desde: event.target.value,
                  })
                }
              />
            </label>

            <label className="field">
              <span className="field-label">Hasta</span>
              <input
                type="date"
                value={draft.fecha_hasta}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    fecha_hasta: event.target.value,
                  })
                }
              />
            </label>

            <MultiSelect
              label="Estados"
              values={draft.estados}
              options={stateOptions}
              placeholder="Todos los estados"
              onChange={(estados) =>
                setDraft({ ...draft, estados })
              }
            />

            <button
              type="button"
              className="secondary-button"
              onClick={resetFilters}
            >
              Restablecer
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={applyFilters}
              disabled={loading}
            >
              {loading && <RefreshCw size={17} className="spin" />}
              Aplicar filtros
            </button>
          </div>
        </section>

        <header className="page-header">
          <h1>Métricas de Trackeo</h1>
          <p>
            Universo de tipos operativos con selección manual y reproducible
            de Estado.
          </p>
        </header>

        {error && (
          <div className="alert">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        <section className="filter-context">
          <strong>Estados aplicados:</strong>
          <span>{selectedStatesText}</span>
        </section>

        <section className="section-heading">
          <h2>Universo seleccionado</h2>
          <p>
            Los resultados respetan el período y los estados seleccionados.
          </p>
        </section>

        <section className="metrics-grid">
          <MetricCard
            icon={<Database />}
            label="Servicios seleccionados"
            value={nf(summary?.servicios_consultados)}
            caption="Sin filtro automático de Estado"
            tone="blue"
          />
          <MetricCard
            icon={<Gauge />}
            label="Uso del enviador"
            value={pct(summary?.uso_enviador)}
            caption={`${nf(summary?.enviador_si)} con enviador`}
            tone="blue"
            onClick={() =>
              void openDrill('ENVIADOR_SI', 'Servicios con enviador')
            }
          />
          <MetricCard
            icon={<Clock3 />}
            label="Evaluados para demora"
            value={nf(summary?.servicios_evaluados_demora)}
            caption="Solo servicios con evaluación disponible"
            tone="amber"
          />
          <MetricCard
            icon={<Truck />}
            label="Asigna móvil"
            value={nf(summary?.asigna_movil)}
            caption={`${pct(
              summary?.efectividad_enviador,
            )} de efectividad`}
            tone="purple"
            onClick={() =>
              void openDrill(
                'ASIGNA_MOVIL',
                'Servicios que asignan móvil',
              )
            }
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
            caption={`${pct(
              summary?.programados_porcentaje,
            )} sobre Enviador Sí`}
            tone="slate"
            onClick={() =>
              void openDrill('PROGRAMADOS', 'Servicios programados')
            }
          />
          <MetricCard
            icon={<CheckCircle2 />}
            label="Cumplimiento de demora"
            value={
              summary?.servicios_evaluados_demora
                ? pct(summary.cumplimiento_demora)
                : 'N/A'
            }
            caption={`${nf(
              summary?.servicios_cumplidos,
            )} cumplen · ${nf(
              summary?.servicios_no_cumplidos,
            )} no cumplen`}
            tone="green"
            onClick={() =>
              void openDrill(
                'CUMPLE_DEMORA',
                'Servicios que cumplen demora',
              )
            }
          />
          <MetricCard
            icon={<AlertCircle />}
            label="No cumple demora"
            value={nf(summary?.servicios_no_cumplidos)}
            caption="Servicios con evaluación negativa"
            tone="red"
            onClick={() =>
              void openDrill(
                'NO_CUMPLE_DEMORA',
                'Servicios que no cumplen demora',
              )
            }
          />
          <MetricCard
            icon={<Database />}
            label="Sin enviador"
            value={nf(summary?.enviador_no)}
            caption={`${nf(summary?.enviador_si)} con enviador`}
            tone="slate"
            onClick={() =>
              void openDrill('ENVIADOR_NO', 'Servicios sin enviador')
            }
          />
        </section>

        <section className="panel distribution-panel">
          <div className="panel-heading">
            <BarChart3 size={23} />
            <div>
              <h2>Distribución de servicios cumplidos</h2>
              <p>
                Porcentaje sobre {nf(summary?.servicios_cumplidos)} servicios
                cumplidos del universo seleccionado.
              </p>
            </div>
          </div>

          <div className="distribution-list">
            {ranges.map((range) => (
              <button
                type="button"
                className="range-row"
                key={range.metric}
                onClick={() =>
                  void openDrill(range.metric, range.label)
                }
              >
                <span className="range-label">{range.label}</span>
                <span className="range-bar">
                  <i
                    style={{
                      width: `${Math.min(
                        100,
                        Number(range.ratio || 0) * 100,
                      )}%`,
                    }}
                  />
                </span>
                <strong>
                  {nf(range.count)} · {pct(range.ratio)}
                </strong>
              </button>
            ))}
          </div>
        </section>
      </main>

      {drill && (
        <DrilldownModal
          state={drill}
          onClose={() => setDrill(null)}
          onPage={(page) =>
            void openDrill(
              drill.metric,
              drill.title,
              page,
              drill.pageSize,
            )
          }
          onExportPage={() =>
            downloadCsv(
              drill.services,
              `detalle-${drill.metric}-pagina-${drill.page}.csv`,
            )
          }
          onExportAll={() => void exportAll()}
        />
      )}
    </div>
  );
}

