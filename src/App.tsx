import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Filter,
  Gauge,
  Info,
  ListChecks,
  Loader2,
  RefreshCw,
  Server,
  Truck,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  api,
  MetricaTrackeo,
  TrackeoCampana,
  TrackeoFilters,
  TrackeoListaPrestador,
  TrackeoPrestador,
  TrackeoResumen,
  TrackeoServicio,
} from './api';
import './App.css';

type View = 'metricas' | 'prestadores' | 'carga';
type SortKey =
  | 'total_general'
  | 'uso_enviador'
  | 'efectividad_enviador'
  | 'cumplimiento_demora_porcentaje';
type UploadTone = 'success' | 'duplicate' | 'error' | 'progress';

type DrilldownState = {
  open: boolean;
  title: string;
  services: TrackeoServicio[];
  loading: boolean;
  error: string;
};

type MultiOption = { value: string; label: string; count: number };

const initialFilters: TrackeoFilters = {
  fecha_desde: '2026-08-06',
  fecha_hasta: '2026-08-19',
  campanas: [],
  prestador_ids: [],
};

const numberFormat = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 0,
});
const decimalFormat = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const nf = (value: number | null | undefined) =>
  value == null ? '—' : numberFormat.format(Number(value));

const pct = (value: number | null | undefined) =>
  value == null ? '—' : `${decimalFormat.format(Number(value) * 100)} %`;

const minutes = (value: number | null | undefined) =>
  value == null ? 'Sin dato' : `${decimalFormat.format(Number(value))} min`;

const tone = (value: number | null | undefined, good = 0.85, warn = 0.7) => {
  if (value == null) return 'neutral';
  return value >= good ? 'good' : value >= warn ? 'warn' : 'bad';
};

function MultiSelect({
  label,
  placeholder,
  options,
  selected,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: MultiOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleUpperCase('es-AR');
    if (!query) return options;
    return options.filter((option) =>
      option.label.toLocaleUpperCase('es-AR').includes(query)
    );
  }, [options, search]);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? options.find((option) => option.value === selected[0])?.label ||
        '1 seleccionado'
      : `${selected.length} seleccionados`;

  return (
    <div className="multiSelect" ref={containerRef}>
      <span className="multiLabel">{label}</span>
      <button
        type="button"
        className="multiTrigger"
        onClick={() => setOpen((value) => !value)}
      >
        <span className={selected.length ? 'multiValue' : 'multiPlaceholder'}>
          {summary}
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="multiPanel">
          <div className="multiPanelHead">
            <input
              type="search"
              value={search}
              placeholder="Buscar…"
              onChange={(event) => setSearch(event.target.value)}
            />
            {selected.length > 0 && (
              <button
                type="button"
                className="multiClear"
                onClick={() => onChange([])}
              >
                Limpiar
              </button>
            )}
          </div>
          <div className="multiOptions">
            {filtered.map((option) => (
              <label key={option.value} className="multiOption">
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => toggle(option.value)}
                />
                <span className="multiOptionLabel">{option.label}</span>
                <span className="multiOptionCount">
                  {numberFormat.format(option.count)}
                </span>
              </label>
            ))}
            {filtered.length === 0 && (
              <div className="multiEmpty">Sin resultados.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>('metricas');
  const [online, setOnline] = useState<boolean | null>(null);
  const [version, setVersion] = useState('');
  const [filters, setFilters] = useState<TrackeoFilters>(initialFilters);
  const [applied, setApplied] = useState<TrackeoFilters>(initialFilters);
  const [campaigns, setCampaigns] = useState<TrackeoCampana[]>([]);
  const [providerOptions, setProviderOptions] = useState<
    TrackeoListaPrestador[]
  >([]);
  const [summary, setSummary] = useState<TrackeoResumen | null>(null);
  const [providers, setProviders] = useState<TrackeoPrestador[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [providerSearch, setProviderSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('total_general');
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadTone, setUploadTone] = useState<UploadTone>('success');

  const [drilldown, setDrilldown] = useState<DrilldownState>({
    open: false,
    title: '',
    services: [],
    loading: false,
    error: '',
  });

  const loadData = async (nextFilters = applied) => {
    if (!nextFilters.fecha_desde || !nextFilters.fecha_hasta) {
      setError('Selecciona una fecha desde y una fecha hasta.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const health = await api.health();
      setOnline(health.ok);
      setVersion(health.version);

      const [
        summaryResponse,
        providersResponse,
        campaignsResponse,
        listResponse,
      ] = await Promise.all([
        api.trackeoResumen(nextFilters),
        api.trackeoPrestadores(nextFilters),
        api.trackeoCampanas(
          nextFilters.fecha_desde,
          nextFilters.fecha_hasta,
          nextFilters.prestador_ids
        ),
        api.trackeoListaPrestadores(
          nextFilters.fecha_desde,
          nextFilters.fecha_hasta,
          nextFilters.campanas
        ),
      ]);

      setSummary(summaryResponse.resumen);
      setProviders(providersResponse.prestadores);
      setCampaigns(campaignsResponse.campanas);
      setProviderOptions(listResponse.prestadores);
    } catch (loadError) {
      setOnline(false);
      setSummary(null);
      setProviders([]);
      setError(
        loadError instanceof Error ? loadError.message : String(loadError)
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(initialFilters);
  }, []);

  const applyFilters = () => {
    if (filters.fecha_desde > filters.fecha_hasta) {
      setError('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }
    setApplied(filters);
    setExpandedProvider(null);
    void loadData(filters);
  };

  const resetFilters = () => {
    const reset = { ...initialFilters, campanas: [], prestador_ids: [] };
    setFilters(reset);
    setApplied(reset);
    setExpandedProvider(null);
    void loadData(reset);
  };

  const onDateChange = (key: 'fecha_desde' | 'fecha_hasta', value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      campanas: [],
      prestador_ids: [],
    }));
  };

  const onCampaignsChange = (next: string[]) => {
    const nextFilters = { ...filters, campanas: next };
    setFilters(nextFilters);
    void api
      .trackeoListaPrestadores(
        nextFilters.fecha_desde,
        nextFilters.fecha_hasta,
        next
      )
      .then((response) => setProviderOptions(response.prestadores))
      .catch(() => setProviderOptions([]));
  };

  const onProvidersChange = (next: string[]) => {
    const nextFilters = { ...filters, prestador_ids: next };
    setFilters(nextFilters);
    void api
      .trackeoCampanas(nextFilters.fecha_desde, nextFilters.fecha_hasta, next)
      .then((response) => setCampaigns(response.campanas))
      .catch(() => setCampaigns([]));
  };

  const openDrilldown = async (
    title: string,
    metric: MetricaTrackeo | null,
    prestadorIds: string[] | null = null
  ) => {
    setDrilldown({ open: true, title, services: [], loading: true, error: '' });
    try {
      const response = await api.trackeoServicios(
        applied,
        metric,
        prestadorIds
      );
      setDrilldown((current) => ({
        ...current,
        services: response.servicios,
        loading: false,
      }));
    } catch (drillError) {
      setDrilldown((current) => ({
        ...current,
        loading: false,
        error:
          drillError instanceof Error ? drillError.message : String(drillError),
      }));
    }
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadTone('progress');
    setUploadMessage('Conectando con el servidor…');

    try {
      await api.wake();

      // 1) Iniciar la ingesta (responde rápido)
      setUploadMessage('Subiendo el archivo…');
      const start = await api.ingestarIniciar(file);

      if (start.status === 'duplicado') {
        setUploadTone('duplicate');
        setUploadMessage(
          `${start.mensaje || 'El archivo ya había sido cargado.'}${
            start.existente ? ` Archivo existente: ${start.existente}.` : ''
          }`
        );
        setFile(null);
        return;
      }

      if (!start.report_id) {
        throw new Error('El servidor no devolvió un identificador de reporte.');
      }

      // 2) Polling del estado hasta que termine
      setUploadTone('progress');
      setUploadMessage(
        'Procesando en el servidor… Podés seguir usando la app; esto puede tardar en reportes grandes.'
      );

      const finalStatus = await api.ingestarEsperar(start.report_id, (tick) => {
        if (tick.status === 'procesando') {
          setUploadTone('progress');
          setUploadMessage(
            'Procesando en el servidor… (los datos se están insertando)'
          );
        }
      });

      if (finalStatus.status === 'error') {
        setUploadTone('error');
        setUploadMessage(
          `El procesamiento falló: ${
            finalStatus.detalle || 'error desconocido'
          }`
        );
        return;
      }

      setUploadTone('success');
      const procesadas =
        finalStatus.filas_procesadas ?? finalStatus.filas_totales ?? 0;
      setUploadMessage(
        `Carga completada. Filas del reporte en la base: ${procesadas}.`
      );
      setFile(null);
      await loadData(applied);
    } catch (uploadError) {
      setUploadTone('error');
      const message =
        uploadError instanceof Error ? uploadError.message : 'Error al cargar.';
      const looksLikeNetwork =
        message === '' ||
        message.toLowerCase().includes('failed to fetch') ||
        message.toLowerCase().includes('networkerror') ||
        message.toLowerCase().includes('load failed');
      setUploadMessage(
        looksLikeNetwork
          ? 'No se pudo conectar con el servidor. Reintentá en unos segundos.'
          : message
      );
    } finally {
      setUploading(false);
    }
  };

  const comparisonLabel = useMemo(() => {
    const parts: string[] = [];
    if (applied.prestador_ids.length)
      parts.push(`${applied.prestador_ids.length} prestador(es)`);
    if (applied.campanas.length)
      parts.push(`${applied.campanas.length} campaña(s)`);
    return parts.length ? `Comparando: ${parts.join(' · ')}` : '';
  }, [applied]);

  const campaignOptions: MultiOption[] = useMemo(
    () =>
      campaigns.map((campaign) => ({
        value: campaign.campana,
        label: campaign.campana,
        count: campaign.servicios,
      })),
    [campaigns]
  );

  const providerSelectOptions: MultiOption[] = useMemo(
    () =>
      providerOptions.map((option) => ({
        value: option.prestador_id,
        label: option.prestador,
        count: option.servicios,
      })),
    [providerOptions]
  );

  const delayDistribution = useMemo(
    () =>
      summary
        ? [
            {
              key: 'MENOS_60' as const,
              label: 'Menos de 60',
              value: summary.menos_60_cantidad,
              percentage: summary.menos_60_porcentaje,
            },
            {
              key: 'ENTRE_61_90' as const,
              label: '61 a 90',
              value: summary.entre_61_90_cantidad,
              percentage: summary.entre_61_90_porcentaje,
            },
            {
              key: 'ENTRE_91_120' as const,
              label: '91 a 120',
              value: summary.entre_91_120_cantidad,
              percentage: summary.entre_91_120_porcentaje,
            },
            {
              key: 'ENTRE_121_180' as const,
              label: '121 a 180',
              value: summary.entre_121_180_cantidad,
              percentage: summary.entre_121_180_porcentaje,
            },
            {
              key: 'MAS_181' as const,
              label: 'Más de 181',
              value: summary.mas_181_cantidad,
              percentage: summary.mas_181_porcentaje,
            },
            {
              key: 'NA' as const,
              label: 'Sin demora real',
              value: summary.na_cantidad,
              percentage: summary.na_porcentaje,
            },
          ]
        : [],
    [summary]
  );

  const filteredProviders = useMemo(() => {
    const query = providerSearch.trim().toLocaleUpperCase('es-AR');
    const filtered = query
      ? providers.filter((provider) =>
          provider.prestador.toLocaleUpperCase('es-AR').includes(query)
        )
      : [...providers];

    return filtered.sort((a, b) => {
      if (sortKey === 'total_general') return b.total_general - a.total_general;
      return Number(a[sortKey]) - Number(b[sortKey]);
    });
  }, [providers, providerSearch, sortKey]);

  const UploadMessageIcon =
    uploadTone === 'duplicate'
      ? Info
      : uploadTone === 'error'
      ? AlertCircle
      : uploadTone === 'progress'
      ? Loader2
      : CheckCircle2;

  return (
    <div className="app">
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
            className={view === 'metricas' ? 'active' : ''}
            onClick={() => setView('metricas')}
          >
            <BarChart3 />
            Métricas de Trackeo
          </button>
          <button
            className={view === 'prestadores' ? 'active' : ''}
            onClick={() => setView('prestadores')}
          >
            <Users />
            Detalle por prestador
          </button>
          <button
            className={view === 'carga' ? 'active' : ''}
            onClick={() => setView('carga')}
          >
            <Upload />
            Cargar reportes
          </button>
        </nav>

        <div className="apiStatus">
          <Server />
          <div>
            <span>Backend {version ? `v${version}` : ''}</span>
            <strong className={online ? 'ok' : 'bad'}>
              {online === null
                ? 'Comprobando'
                : online
                ? 'Conectado'
                : 'Sin conexión'}
            </strong>
          </div>
        </div>
      </aside>

      <main>
        <header className="pageHeader">
          <div>
            <p>Cardinal Assistance</p>
            <h1>
              {view === 'metricas'
                ? 'Métricas de Trackeo'
                : view === 'prestadores'
                ? 'Análisis por prestador'
                : 'Carga de reportes'}
            </h1>
            <span className="subtitle">
              {comparisonLabel ||
                'Modelo equivalente al Excel, recalculado desde Trackeo como única fuente de verdad'}
            </span>
          </div>
          <button
            className="outlineButton"
            onClick={() => void loadData(applied)}
            disabled={loading}
          >
            <RefreshCw className={loading ? 'spin' : ''} />
            Actualizar
          </button>
        </header>

        {view !== 'carga' && (
          <section className="filterPanel">
            <div className="filterTitle">
              <Filter />
              <div>
                <strong>Filtros globales</strong>
                <span>
                  Seleccioná varias campañas y/o prestadores para comparar en
                  conjunto
                </span>
              </div>
            </div>
            <div className="filterGrid trackeoFilters">
              <label>
                Desde
                <input
                  type="date"
                  value={filters.fecha_desde}
                  onChange={(event) =>
                    onDateChange('fecha_desde', event.target.value)
                  }
                />
              </label>
              <label>
                Hasta
                <input
                  type="date"
                  value={filters.fecha_hasta}
                  onChange={(event) =>
                    onDateChange('fecha_hasta', event.target.value)
                  }
                />
              </label>
              <MultiSelect
                label="Campañas"
                placeholder="Todas las campañas"
                options={campaignOptions}
                selected={filters.campanas}
                onChange={onCampaignsChange}
              />
              <MultiSelect
                label="Prestadores"
                placeholder="Todos los prestadores"
                options={providerSelectOptions}
                selected={filters.prestador_ids}
                onChange={onProvidersChange}
              />
            </div>
            <div className="filterActions">
              <button className="ghostButton" onClick={resetFilters}>
                Restablecer
              </button>
              <button
                className="primaryButton"
                onClick={applyFilters}
                disabled={loading}
              >
                Aplicar filtros
              </button>
            </div>
          </section>
        )}

        {error && (
          <div className="notice errorNotice">
            <AlertCircle />
            <div>
              <strong>No se pudieron cargar las métricas</strong>
              <span>{error}</span>
            </div>
          </div>
        )}

        {loading && view !== 'carga' && (
          <div className="loadingPanel">Actualizando métricas…</div>
        )}

        {!loading && view === 'metricas' && summary && (
          <>
            <section className="metricGrid">
              <MetricCard
                icon={<Database />}
                label="Servicios consultados"
                value={nf(summary.servicios_consultados)}
                caption={`${nf(summary.enviador_si)} con enviador · ${nf(
                  summary.enviador_no
                )} sin enviador`}
                onClick={() =>
                  void openDrilldown('Todos los servicios consultados', null)
                }
              />
              <MetricCard
                icon={<Gauge />}
                label="Uso del enviador"
                value={pct(summary.uso_enviador)}
                caption={`${nf(summary.enviador_si)} servicios con Enviador OK`}
                tone={tone(summary.uso_enviador, 0.9, 0.8)}
                onClick={() =>
                  void openDrilldown('Servicios con Enviador OK', 'ENVIADOR_SI')
                }
              />
              <MetricCard
                icon={<Truck />}
                label="Asigna móvil"
                value={nf(summary.asigna_movil)}
                caption={`${pct(summary.efectividad_enviador)} de efectividad`}
                tone={tone(summary.efectividad_enviador, 0.9, 0.8)}
                onClick={() =>
                  void openDrilldown(
                    'Servicios que asignaron móvil',
                    'ASIGNA_MOVIL'
                  )
                }
              />
              <MetricCard
                icon={<AlertCircle />}
                label="No asigna móvil"
                value={nf(summary.no_asigna_movil_cantidad)}
                caption={pct(summary.no_asigna_movil_porcentaje)}
                tone={
                  summary.no_asigna_movil_porcentaje <= 0.1 ? 'good' : 'warn'
                }
                onClick={() =>
                  void openDrilldown(
                    'Servicios que no asignaron móvil',
                    'NO_ASIGNA_MOVIL'
                  )
                }
              />
              <MetricCard
                icon={<ListChecks />}
                label="Servicios programados"
                value={nf(summary.servicios_programados)}
                caption={`${pct(
                  summary.programados_porcentaje
                )} sobre Enviador SI`}
                onClick={() =>
                  void openDrilldown('Servicios programados', 'PROGRAMADOS')
                }
              />
              <MetricCard
                icon={<CheckCircle2 />}
                label="Cumplimiento de demora"
                value={pct(summary.cumplimiento_demora)}
                caption={`${nf(summary.servicios_cumplidos)} cumplen · ${nf(
                  summary.servicios_no_cumplidos
                )} no cumplen`}
                tone={tone(summary.cumplimiento_demora)}
                onClick={() =>
                  void openDrilldown(
                    'Servicios que cumplen la demora',
                    'CUMPLE_DEMORA'
                  )
                }
              />
            </section>

            <section className="contentGrid">
              <article className="card chartCard">
                <div className="cardHead">
                  <div>
                    <h2>Distribución de los servicios cumplidos</h2>
                    <p>
                      Porcentaje calculado sobre{' '}
                      {nf(summary.servicios_cumplidos)} servicios cumplidos
                    </p>
                  </div>
                </div>
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={delayDistribution}
                      margin={{ top: 10, right: 10, left: -18, bottom: 12 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip
                        formatter={(value: number) => [nf(value), 'Servicios']}
                      />
                      <Bar
                        dataKey="value"
                        name="Servicios"
                        radius={[8, 8, 0, 0]}
                      >
                        {delayDistribution.map((item, index) => (
                          <Cell
                            key={item.key}
                            fill={
                              [
                                '#10b981',
                                '#3b82f6',
                                '#f59e0b',
                                '#f97316',
                                '#ef4444',
                                '#94a3b8',
                              ][index]
                            }
                            cursor="pointer"
                            onClick={() =>
                              void openDrilldown(
                                `Cumplidos: ${item.label}`,
                                item.key
                              )
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="card funnelCard">
                <div className="cardHead">
                  <div>
                    <h2>Embudo del enviador</h2>
                    <p>
                      Secuencia equivalente a las tablas dinámicas del Excel
                    </p>
                  </div>
                </div>
                <div className="funnelList">
                  <FunnelRow
                    label="Universo consultado"
                    value={summary.servicios_consultados}
                    percentage={1}
                  />
                  <FunnelRow
                    label="Enviador OK"
                    value={summary.enviador_si}
                    percentage={summary.uso_enviador}
                  />
                  <FunnelRow
                    label="Asigna móvil"
                    value={summary.asigna_movil}
                    percentage={summary.efectividad_enviador}
                  />
                  <FunnelRow
                    label="Programados"
                    value={summary.servicios_programados}
                    percentage={summary.programados_porcentaje}
                  />
                  <FunnelRow
                    label="Cumplen demora"
                    value={summary.servicios_cumplidos}
                    percentage={summary.cumplimiento_demora}
                  />
                </div>
              </article>
            </section>

            <section className="card compactTableCard">
              <div className="cardHead">
                <div>
                  <h2>Resumen de rangos</h2>
                  <p>
                    Haz clic en una fila para ver los servicios individuales
                  </p>
                </div>
              </div>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Rango</th>
                      <th>Servicios</th>
                      <th>Porcentaje sobre cumplidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delayDistribution.map((item) => (
                      <tr
                        key={item.key}
                        className="clickableRow"
                        onClick={() =>
                          void openDrilldown(
                            `Cumplidos: ${item.label}`,
                            item.key
                          )
                        }
                      >
                        <td className="provider">{item.label}</td>
                        <td>{nf(item.value)}</td>
                        <td>{pct(item.percentage)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {!loading && view === 'prestadores' && (
          <>
            <section className="providerControls">
              <label className="searchControl">
                Buscar prestador
                <input
                  type="search"
                  value={providerSearch}
                  placeholder="Nombre del prestador"
                  onChange={(event) => setProviderSearch(event.target.value)}
                />
              </label>
              <label>
                Ordenar por
                <select
                  value={sortKey}
                  onChange={(event) =>
                    setSortKey(event.target.value as SortKey)
                  }
                >
                  <option value="total_general">Más servicios</option>
                  <option value="uso_enviador">Menor uso del enviador</option>
                  <option value="efectividad_enviador">
                    Menor efectividad
                  </option>
                  <option value="cumplimiento_demora_porcentaje">
                    Menor cumplimiento
                  </option>
                </select>
              </label>
              <div className="providerCount">
                {nf(filteredProviders.length)} prestadores
              </div>
            </section>

            <section className="card tableCard">
              <div className="tableWrap providerTableWrap">
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Prestador</th>
                      <th>Total</th>
                      <th>Env. SI</th>
                      <th>Env. NO</th>
                      <th>% uso</th>
                      <th>Asigna móvil</th>
                      <th>% no asigna</th>
                      <th>Programados</th>
                      <th>Efectividad</th>
                      <th>Cumplidos</th>
                      <th>% cumplimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProviders.map((provider) => {
                      const expanded =
                        expandedProvider === provider.prestador_id;
                      return (
                        <Fragment key={provider.prestador_id}>
                          <tr
                            className="clickableRow"
                            onClick={() =>
                              setExpandedProvider(
                                expanded ? null : provider.prestador_id
                              )
                            }
                          >
                            <td>
                              {expanded ? (
                                <ChevronDown size={16} />
                              ) : (
                                <ChevronRight size={16} />
                              )}
                            </td>
                            <td className="provider">{provider.prestador}</td>
                            <td>{nf(provider.total_general)}</td>
                            <td>{nf(provider.enviador_si)}</td>
                            <td>{nf(provider.enviador_no)}</td>
                            <td>
                              <span
                                className={`pill ${tone(
                                  provider.uso_enviador,
                                  0.9,
                                  0.8
                                )}`}
                              >
                                {pct(provider.uso_enviador)}
                              </span>
                            </td>
                            <td>{nf(provider.asigna_movil)}</td>
                            <td>{pct(provider.no_asigna_movil_porcentaje)}</td>
                            <td>{nf(provider.servicios_programados)}</td>
                            <td>
                              <span
                                className={`pill ${tone(
                                  provider.efectividad_enviador,
                                  0.9,
                                  0.8
                                )}`}
                              >
                                {pct(provider.efectividad_enviador)}
                              </span>
                            </td>
                            <td>{nf(provider.cumplimiento_demora_cantidad)}</td>
                            <td>
                              <span
                                className={`pill ${tone(
                                  provider.cumplimiento_demora_porcentaje
                                )}`}
                              >
                                {pct(provider.cumplimiento_demora_porcentaje)}
                              </span>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="providerDetailRow">
                              <td></td>
                              <td colSpan={11}>
                                <div className="providerDetail">
                                  <ProviderMetric
                                    label="Enviador SI"
                                    value={provider.enviador_si}
                                    percentage={provider.uso_enviador}
                                    onClick={() =>
                                      void openDrilldown(
                                        `${provider.prestador}: Enviador SI`,
                                        'ENVIADOR_SI',
                                        [provider.prestador_id]
                                      )
                                    }
                                  />
                                  <ProviderMetric
                                    label="Enviador NO"
                                    value={provider.enviador_no}
                                    onClick={() =>
                                      void openDrilldown(
                                        `${provider.prestador}: Enviador NO`,
                                        'ENVIADOR_NO',
                                        [provider.prestador_id]
                                      )
                                    }
                                  />
                                  <ProviderMetric
                                    label="No asigna móvil"
                                    value={provider.no_asigna_movil_cantidad}
                                    percentage={
                                      provider.no_asigna_movil_porcentaje
                                    }
                                    onClick={() =>
                                      void openDrilldown(
                                        `${provider.prestador}: no asigna móvil`,
                                        'NO_ASIGNA_MOVIL',
                                        [provider.prestador_id]
                                      )
                                    }
                                  />
                                  <ProviderMetric
                                    label="Programados"
                                    value={provider.servicios_programados}
                                    percentage={provider.programados_porcentaje}
                                    onClick={() =>
                                      void openDrilldown(
                                        `${provider.prestador}: programados`,
                                        'PROGRAMADOS',
                                        [provider.prestador_id]
                                      )
                                    }
                                  />
                                  <ProviderMetric
                                    label="Cumplen demora"
                                    value={
                                      provider.cumplimiento_demora_cantidad
                                    }
                                    percentage={
                                      provider.cumplimiento_demora_porcentaje
                                    }
                                    onClick={() =>
                                      void openDrilldown(
                                        `${provider.prestador}: cumplen demora`,
                                        'CUMPLE_DEMORA',
                                        [provider.prestador_id]
                                      )
                                    }
                                  />
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                {filteredProviders.length === 0 && (
                  <div className="empty">
                    No hay prestadores para los filtros seleccionados.
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {view === 'carga' && (
          <section className="card uploadCard standaloneUpload">
            <div className="cardHead">
              <div>
                <h2>Ingestar un reporte</h2>
                <p>
                  Se procesa en segundo plano: podés cargar reportes grandes sin
                  que se corte por tiempo
                </p>
              </div>
            </div>
            <div className="uploadBody">
              <label className="filePicker">
                <Upload />
                <span>{file?.name || 'Elegir archivo Excel'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  disabled={uploading}
                  onChange={(event) => {
                    setFile(event.target.files?.[0] || null);
                    setUploadMessage('');
                  }}
                />
              </label>
              <button
                className="primaryButton"
                disabled={!file || uploading}
                onClick={() => void upload()}
              >
                {uploading ? 'Procesando…' : 'Procesar reporte'}
              </button>
            </div>
            {uploadMessage && (
              <div className={`uploadMessage ${uploadTone}`}>
                <UploadMessageIcon
                  className={uploadTone === 'progress' ? 'spin' : ''}
                />
                <span>{uploadMessage}</span>
              </div>
            )}
          </section>
        )}
      </main>

      {drilldown.open && (
        <div
          className="modalBackdrop"
          onMouseDown={() =>
            setDrilldown((current) => ({ ...current, open: false }))
          }
        >
          <section
            className="modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modalHead">
              <div>
                <h2>{drilldown.title}</h2>
                <p>
                  {drilldown.loading
                    ? 'Consultando…'
                    : `${nf(drilldown.services.length)} servicios`}
                </p>
              </div>
              <button
                className="iconButton"
                onClick={() =>
                  setDrilldown((current) => ({ ...current, open: false }))
                }
              >
                <X />
              </button>
            </div>
            {drilldown.error && (
              <div className="notice errorNotice">
                <AlertCircle />
                <span>{drilldown.error}</span>
              </div>
            )}
            {drilldown.loading ? (
              <div className="loadingPanel">Cargando servicios…</div>
            ) : (
              <div className="tableWrap modalTableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Servicio</th>
                      <th>Orden</th>
                      <th>Fecha</th>
                      <th>Prestador</th>
                      <th>Campaña</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th>Prometida</th>
                      <th>Real</th>
                      <th>Rango</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drilldown.services.map((service) => (
                      <tr key={service.servicio_row_id}>
                        <td>{service.id_servicio_prestado}</td>
                        <td>{service.id_orden_de_servicio}</td>
                        <td>
                          {new Date(
                            `${service.fecha}T00:00:00`
                          ).toLocaleDateString('es-AR')}
                        </td>
                        <td className="provider">{service.prestador}</td>
                        <td>{service.campana}</td>
                        <td>{service.tipo_de_servicio}</td>
                        <td>{service.estado}</td>
                        <td>{minutes(service.demora_prometida)}</td>
                        <td>{minutes(service.demora_real)}</td>
                        <td>
                          {service.rango_demora_real === 'N/A'
                            ? 'Sin demora real'
                            : service.rango_demora_real}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {drilldown.services.length === 0 && (
                  <div className="empty">
                    No hay servicios para esta métrica.
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  caption,
  tone: cardTone = 'neutral',
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  caption: string;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button className={`metricCard ${cardTone}`} onClick={onClick}>
      <span className="metricIcon">{icon}</span>
      <span className="metricBody">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{caption}</small>
      </span>
    </button>
  );
}

function FunnelRow({
  label,
  value,
  percentage,
}: {
  label: string;
  value: number;
  percentage: number;
}) {
  return (
    <div className="funnelRow">
      <div>
        <span>{label}</span>
        <strong>{nf(value)}</strong>
      </div>
      <div className="funnelTrack">
        <span
          style={{ width: `${Math.max(2, Math.min(100, percentage * 100))}%` }}
        />
      </div>
      <small>{pct(percentage)}</small>
    </div>
  );
}

function ProviderMetric({
  label,
  value,
  percentage,
  onClick,
}: {
  label: string;
  value: number;
  percentage?: number;
  onClick: () => void;
}) {
  return (
    <button className="providerMetric" onClick={onClick}>
      <span>{label}</span>
      <strong>{nf(value)}</strong>
      {percentage != null && <small>{pct(percentage)}</small>}
    </button>
  );
}
