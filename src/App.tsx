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
  Filter,
  Gauge,
  ListChecks,
  RefreshCw,
  Search,
  Server,
  Truck,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  api,
  type CampanaMetric,
  type IngestStatus,
  type PrestadorMetric,
  type PrestadorOption,
  type TrackeoFilters,
  type TrackeoSummary,
  type TrackeoUniversos,
} from './api';
import './App.css';

type Page = 'metrics' | 'providers' | 'upload';
type Tone = 'blue' | 'green' | 'amber' | 'slate';
type ProviderView = 'adoption' | 'programming' | 'compliance' | 'ranges';
type SelectOption = { value: string; label: string };

const DEFAULT_FILTERS: TrackeoFilters = {
  fecha_desde: '2026-08-01',
  fecha_hasta: '2026-08-24',
  campanas: [],
  prestador_ids: [],
};

const nf = (value?: number | null) =>
  value == null ? '—' : new Intl.NumberFormat('es-AR').format(value);

const pct = (value?: number | null) =>
  value == null
    ? '—'
    : `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(
        value * 100,
      )} %`;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function MetricCard({
  icon,
  label,
  value,
  caption,
  tone = 'blue',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  caption: string;
  tone?: Tone;
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-card-icon">{icon}</div>
      <div className="metric-card-content">
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
        <div className="metric-caption">{caption}</div>
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
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, []);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const filteredOptions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return term
      ? options.filter((option) =>
          option.label.toLocaleLowerCase('es').includes(term),
        )
      : options;
  }, [options, search]);

  const selectedLabels = useMemo(
    () =>
      options
        .filter((option) => values.includes(option.value))
        .map((option) => option.label),
    [options, values],
  );

  const toggle = (value: string) => {
    onChange(
      values.includes(value)
        ? values.filter((current) => current !== value)
        : [...values, value],
    );
  };

  const selectVisible = () => {
    onChange(
      Array.from(
        new Set([...values, ...filteredOptions.map((option) => option.value)]),
      ),
    );
  };

  const triggerText =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? selectedLabels[0] || '1 seleccionado'
        : `${values.length} seleccionados`;

  return (
    <div className="multi-select-field" ref={containerRef}>
      <span className="multi-select-label">{label}</span>
      <button
        type="button"
        className={`multi-select-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span
          className={
            values.length ? 'multi-select-value' : 'multi-select-placeholder'
          }
        >
          {triggerText}
        </span>
        <ChevronDown
          size={18}
          className={`multi-select-chevron${open ? ' open' : ''}`}
        />
      </button>
      <small className="multi-select-help">
        {values.length === 0
          ? placeholder
          : `${values.length} opción${values.length === 1 ? '' : 'es'} seleccionada${values.length === 1 ? '' : 's'}`}
      </small>

      {open && (
        <div className="multi-select-menu">
          <div className="multi-select-search-row">
            <Search size={16} />
            <input
              className="multi-select-search"
              type="search"
              value={search}
              placeholder={`Buscar ${label.toLocaleLowerCase('es')}…`}
              onChange={(event) => setSearch(event.target.value)}
              autoFocus
            />
            {search && (
              <button
                type="button"
                className="icon-button"
                onClick={() => setSearch('')}
                aria-label="Limpiar búsqueda"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="multi-select-actions">
            <button
              type="button"
              onClick={selectVisible}
              disabled={filteredOptions.length === 0}
            >
              Seleccionar visibles
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={values.length === 0}
            >
              Limpiar
            </button>
          </div>

          <div
            className="multi-select-options"
            role="listbox"
            aria-multiselectable="true"
          >
            {filteredOptions.length === 0 ? (
              <div className="multi-select-empty">No se encontraron opciones</div>
            ) : (
              filteredOptions.map((option) => {
                const checked = values.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className={`multi-select-option${checked ? ' selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })
            )}
          </div>

          <div className="multi-select-footer">
            <span>{nf(filteredOptions.length)} opciones visibles</span>
            <button type="button" onClick={() => setOpen(false)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [page, setPage] = useState<Page>('metrics');
  const [providerView, setProviderView] = useState<ProviderView>('adoption');
  const [draft, setDraft] = useState<TrackeoFilters>(DEFAULT_FILTERS);
  const [filters, setFilters] = useState<TrackeoFilters>(DEFAULT_FILTERS);
  const [summary, setSummary] = useState<TrackeoSummary | null>(null);
  const [universes, setUniverses] = useState<TrackeoUniversos | null>(null);
  const [providers, setProviders] = useState<PrestadorMetric[]>([]);
  const [providerOptions, setProviderOptions] = useState<PrestadorOption[]>([]);
  const [campaigns, setCampaigns] = useState<CampanaMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backend, setBackend] = useState<{
    connected: boolean;
    version?: string;
  }>({ connected: false });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [ingestStatus, setIngestStatus] = useState<IngestStatus | null>(null);

  const load = useCallback(async (next: TrackeoFilters) => {
    setLoading(true);
    setError(null);

    const results = await Promise.allSettled([
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
    ]);

    const [
      summaryResult,
      universeResult,
      providerResult,
      campaignResult,
      optionResult,
    ] = results;
    const errors: string[] = [];
    const failure = (scope: string, reason: unknown) =>
      `${scope}: ${reason instanceof Error ? reason.message : String(reason)}`;

    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value.resumen);
    } else errors.push(failure('Resumen', summaryResult.reason));

    if (universeResult.status === 'fulfilled') {
      setUniverses(universeResult.value.universos);
    } else errors.push(failure('Universos', universeResult.reason));

    if (providerResult.status === 'fulfilled') {
      setProviders(providerResult.value.prestadores || []);
    } else errors.push(failure('Prestadores', providerResult.reason));

    if (campaignResult.status === 'fulfilled') {
      setCampaigns(campaignResult.value.campanas || []);
    } else errors.push(failure('Campañas', campaignResult.reason));

    if (optionResult.status === 'fulfilled') {
      setProviderOptions(optionResult.value.prestadores || []);
    } else errors.push(failure('Lista de prestadores', optionResult.reason));

    if (errors.length) {
      setError(`Algunas consultas no pudieron actualizarse. ${errors.join(' | ')}`);
    }
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

  const campaignOptions = useMemo<SelectOption[]>(
    () =>
      campaigns.map((campaign) => ({
        value: campaign.campana,
        label: `${campaign.campana} (${nf(campaign.servicios)})`,
      })),
    [campaigns],
  );

  const providerOptionsForSelect = useMemo<SelectOption[]>(
    () =>
      providerOptions.map((provider) => ({
        value: provider.prestador_id,
        label: provider.prestador,
      })),
    [providerOptions],
  );

  const submitUpload = async () => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadMessage('Subiendo el archivo y creando el trabajo…');
    setIngestStatus(null);

    try {
      const result = await api.ingest(file);
      if (result.status === 'duplicado') {
        setUploadMessage(
          `${result.mensaje || 'El archivo ya había sido cargado.'} Archivo existente: ${result.existente || 'sin nombre'}.`,
        );
        return;
      }
      if (!result.report_id) throw new Error('El backend no devolvió report_id.');

      for (let attempt = 0; attempt < 600; attempt += 1) {
        const state = await api.ingestStatus(result.report_id);
        setIngestStatus(state);
        if (state.status === 'procesado') {
          setUploadMessage(
            `Carga completada: ${nf(state.filas_procesadas)} filas procesadas.`,
          );
          setFile(null);
          await load(filters);
          return;
        }
        if (state.status === 'error' || state.status === 'cancelado') {
          throw new Error(
            state.error_msg ||
              `El procesamiento terminó en estado ${state.status}.`,
          );
        }
        setUploadMessage(
          `${state.etapa || state.status}: ${nf(state.filas_procesadas)} filas procesadas.`,
        );
        await sleep(3000);
      }
    } catch (cause) {
      setUploadMessage(
        cause instanceof Error
          ? cause.message
          : 'No se pudo procesar el archivo.',
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Database size={26} />
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
            className={page === 'upload' ? 'active' : ''}
            onClick={() => setPage('upload')}
          >
            <Upload /> Cargar reportes
          </button>
        </nav>
        <div className="backend-badge">
          <Server size={18} />
          <div>
            <span>Backend {backend.version ? `v${backend.version}` : ''}</span>
            <strong className={backend.connected ? 'ok' : 'bad'}>
              {backend.connected ? 'Conectado' : 'Sin conexión'}
            </strong>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header>
          <h1>
            {page === 'metrics'
              ? 'Métricas de Trackeo'
              : page === 'providers'
                ? 'Detalle por prestador'
                : 'Cargar reportes'}
          </h1>
          <p>
            Modelo auditable con universos cargado, vehicular, evaluable e
            histórico.
          </p>
        </header>

        {page !== 'upload' && (
          <section className="panel filters-panel">
            <div className="panel-title">
              <Filter size={21} />
              <div>
                <h2>Filtros globales</h2>
                <p>Aplican a todos los universos e indicadores.</p>
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
                <small>Fecha inicial</small>
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
                <small>Fecha final</small>
              </label>

              <MultiSelect
                label="Campañas"
                values={draft.campanas}
                options={campaignOptions}
                placeholder="Todas las campañas"
                onChange={(campanas) => setDraft({ ...draft, campanas })}
              />

              <MultiSelect
                label="Prestadores"
                values={draft.prestador_ids}
                options={providerOptionsForSelect}
                placeholder="Todos los prestadores"
                onChange={(prestador_ids) =>
                  setDraft({ ...draft, prestador_ids })
                }
              />
            </div>

            <div className="filter-actions">
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
                {loading && <RefreshCw className="spin" size={18} />}
                Aplicar filtros
              </button>
            </div>
          </section>
        )}

        {error && (
          <div className="alert">
            <AlertCircle /> {error}
          </div>
        )}

        {page === 'metrics' && (
          <>
            <section className="section-heading">
              <h2>Universos analíticos</h2>
              <p>Control de volumen y separación de servicios aptos para KPIs.</p>
            </section>
            <section className="metric-grid">
              <MetricCard icon={<Database />} label="Servicios en el periodo" value={nf(universes?.servicios_cargados)} caption="Total visible para las fechas seleccionadas" />
              <MetricCard icon={<Truck />} label="Servicios vehiculares" value={nf(universes?.servicios_vehiculares)} caption="Finalizados, cancelados y en curso" tone="slate" />
              <MetricCard icon={<CheckCircle2 />} label="Servicios evaluables" value={nf(universes?.servicios_evaluables)} caption="Base ampliada recomendada para KPIs" tone="green" />
              <MetricCard icon={<AlertCircle />} label="Vehiculares cancelados" value={nf(universes?.servicios_cancelados)} caption="Separados del cumplimiento operativo" tone="amber" />
              <MetricCard icon={<Clock3 />} label="Vehiculares no finalizados" value={nf(universes?.servicios_no_finalizados)} caption="Pendientes o en curso" tone="slate" />
              <MetricCard icon={<ListChecks />} label="Universo Excel histórico" value={nf(universes?.universo_excel_historico)} caption="Mantiene comparabilidad histórica" />
            </section>

            <section className="section-heading">
              <h2>KPIs históricos del Excel</h2>
              <p>
                Estos indicadores conservan la regla histórica para no alterar
                las comparaciones.
              </p>
            </section>
            <section className="metric-grid">
              <MetricCard icon={<Database />} label="Universo Excel evaluable" value={nf(summary?.servicios_consultados)} caption={`${nf(summary?.enviador_si)} con enviador · ${nf(summary?.enviador_no)} sin enviador`} />
              <MetricCard icon={<Gauge />} label="Uso del enviador" value={pct(summary?.uso_enviador)} caption={`${nf(summary?.enviador_si)} servicios con Enviador OK`} tone="amber" />
              <MetricCard icon={<Truck />} label="Asigna móvil" value={nf(summary?.asigna_movil)} caption={`${pct(summary?.efectividad_enviador)} de efectividad`} tone="green" />
              <MetricCard icon={<AlertCircle />} label="No asigna móvil" value={nf(summary?.no_asigna_movil_cantidad)} caption={pct(summary?.no_asigna_movil_porcentaje)} tone="amber" />
              <MetricCard icon={<ListChecks />} label="Servicios programados" value={nf(summary?.servicios_programados)} caption={`${pct(summary?.programados_porcentaje)} sobre Enviador Sí`} />
              <MetricCard icon={<CheckCircle2 />} label="Cumplimiento de demora" value={pct(summary?.cumplimiento_demora)} caption={`${nf(summary?.servicios_cumplidos)} cumplen · ${nf(summary?.servicios_no_cumplidos)} no cumplen`} tone="green" />
            </section>

            <section className="panel">
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
                {[
                  ['Menos de 60', summary?.menos_60_cantidad, summary?.menos_60_porcentaje],
                  ['61 a 90', summary?.entre_61_90_cantidad, summary?.entre_61_90_porcentaje],
                  ['91 a 120', summary?.entre_91_120_cantidad, summary?.entre_91_120_porcentaje],
                  ['121 a 180', summary?.entre_121_180_cantidad, summary?.entre_121_180_porcentaje],
                  ['Más de 181', summary?.mas_181_cantidad, summary?.mas_181_porcentaje],
                  ['N/A', summary?.na_cantidad, summary?.na_porcentaje],
                ].map(([label, count, ratio]) => (
                  <div className="bar-row" key={String(label)}>
                    <span>{label}</span>
                    <div>
                      <i
                        style={{
                          width: `${Math.min(100, Number(ratio || 0) * 100)}%`,
                        }}
                      />
                    </div>
                    <strong>
                      {nf(Number(count))} · {pct(Number(ratio))}
                    </strong>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {page === 'providers' && (
          <section className="panel">
            <div className="panel-title">
              <Users />
              <div>
                <h2>Análisis completo por prestador</h2>
                <p>{nf(providers.length)} prestadores filtrados. Los porcentajes conservan los denominadores del Excel.</p>
              </div>
            </div>

            <div className="analytics-tabs" role="tablist" aria-label="Vista analítica">
              {([
                ['adoption', 'Adopción'],
                ['programming', 'Programación'],
                ['compliance', 'Cumplimiento'],
                ['ranges', 'Rangos de demora'],
              ] as Array<[ProviderView, string]>).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={providerView === value ? 'active' : ''}
                  onClick={() => setProviderView(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="table-wrap provider-table-wrap">
              {providerView === 'adoption' && (
                <table>
                  <thead><tr><th>Prestador</th><th>Total</th><th>Sin enviador</th><th>Con enviador</th><th>% uso</th><th>Asigna móvil</th><th>No asigna</th><th>% no asigna</th><th>Efectividad</th></tr></thead>
                  <tbody>{providers.map((p) => (
                    <tr key={p.prestador_id}><td className="provider-name">{p.prestador}</td><td>{nf(p.total_general ?? p.servicios)}</td><td>{nf(p.enviador_no)}</td><td>{nf(p.enviador_si)}</td><td>{pct(p.uso_enviador)}</td><td>{nf(p.asigna_movil)}</td><td>{nf(p.no_asigna_movil_cantidad)}</td><td>{pct(p.no_asigna_movil_porcentaje)}</td><td>{pct(p.efectividad_enviador)}</td></tr>
                  ))}</tbody>
                </table>
              )}

              {providerView === 'programming' && (
                <table>
                  <thead><tr><th>Prestador</th><th>Con enviador</th><th>Programados</th><th>% programados</th><th>No programados</th></tr></thead>
                  <tbody>{providers.map((p) => {
                    const noProgramados = p.enviador_si == null || p.servicios_programados == null ? null : Math.max(0, p.enviador_si - p.servicios_programados);
                    return <tr key={p.prestador_id}><td className="provider-name">{p.prestador}</td><td>{nf(p.enviador_si)}</td><td>{nf(p.servicios_programados)}</td><td>{pct(p.programados_porcentaje)}</td><td>{nf(noProgramados)}</td></tr>;
                  })}</tbody>
                </table>
              )}

              {providerView === 'compliance' && (
                <table>
                  <thead><tr><th>Prestador</th><th>Evaluados</th><th>Cumple</th><th>No cumple</th><th>% cumplimiento</th></tr></thead>
                  <tbody>{providers.map((p) => {
                    const evaluados = p.servicios_cumplidos == null || p.servicios_no_cumplidos == null ? p.enviador_si : p.servicios_cumplidos + p.servicios_no_cumplidos;
                    return <tr key={p.prestador_id}><td className="provider-name">{p.prestador}</td><td>{nf(evaluados)}</td><td>{nf(p.servicios_cumplidos)}</td><td>{nf(p.servicios_no_cumplidos)}</td><td>{pct(p.cumplimiento_demora)}</td></tr>;
                  })}</tbody>
                </table>
              )}

              {providerView === 'ranges' && (
                <table>
                  <thead><tr><th>Prestador</th><th>Menos de 60</th><th>61 a 90</th><th>91 a 120</th><th>121 a 180</th><th>Más de 181</th><th>N/A</th><th>Total</th></tr></thead>
                  <tbody>{providers.map((p) => {
                    const values = [p.menos_60_cantidad, p.entre_61_90_cantidad, p.entre_91_120_cantidad, p.entre_121_180_cantidad, p.mas_181_cantidad, p.na_cantidad];
                    const total = values.some((v) => v != null) ? values.reduce<number>((sum, v) => sum + Number(v ?? 0), 0) : null;
                    return <tr key={p.prestador_id}><td className="provider-name">{p.prestador}</td><td>{nf(p.menos_60_cantidad)}</td><td>{nf(p.entre_61_90_cantidad)}</td><td>{nf(p.entre_91_120_cantidad)}</td><td>{nf(p.entre_121_180_cantidad)}</td><td>{nf(p.mas_181_cantidad)}</td><td>{nf(p.na_cantidad)}</td><td><strong>{nf(total)}</strong></td></tr>;
                  })}</tbody>
                </table>
              )}
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
              <Upload size={36} />
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
              {uploading ? <RefreshCw className="spin" /> : <Upload />}
              {uploading ? 'Procesando…' : 'Procesar reporte'}
            </button>
            {uploadMessage && (
              <div className="status-box">
                <strong>{uploadMessage}</strong>
                {ingestStatus && (
                  <>
                    <span>
                      Estado: {ingestStatus.status} · Etapa:{' '}
                      {ingestStatus.etapa || 'sin etapa'}
                    </span>
                    <span>
                      Filas: {nf(ingestStatus.filas_procesadas)} /{' '}
                      {ingestStatus.filas_totales == null
                        ? 'pendiente'
                        : nf(ingestStatus.filas_totales)}
                    </span>
                  </>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      <style>{`
        :root{font-family:Inter,system-ui,sans-serif;color:#10203b;background:#f4f7fb}
        *{box-sizing:border-box}body{margin:0}.app-shell{display:grid;grid-template-columns:260px minmax(0,1fr);min-height:100vh;width:100%}
        .sidebar{position:sticky;top:0;height:100vh;background:#0d2749;color:#fff;padding:28px 20px;display:flex;flex-direction:column}.brand{display:flex;gap:13px;align-items:center;padding:5px 12px 30px}.brand svg{background:#2463eb;padding:9px;border-radius:12px;width:42px;height:42px}.brand strong{display:block;font-size:22px}.brand span{color:#80d7ff}.sidebar nav{display:grid;gap:10px}.sidebar button{border:0;background:transparent;color:#dbe9ff;padding:15px;border-radius:12px;display:flex;gap:12px;align-items:center;font-size:16px;cursor:pointer}.sidebar button.active,.sidebar button:hover{background:#1b477e;color:#fff}.sidebar button svg{width:21px}.backend-badge{margin-top:auto;border:1px solid #34506f;border-radius:13px;padding:15px;display:flex;gap:12px;align-items:center}.backend-badge span,.backend-badge strong{display:block;font-size:13px}.backend-badge .ok{color:#36e3ac}.backend-badge .bad{color:#ff8b8b}
        .main-content{min-width:0;width:100%;max-width:1600px;padding:34px 38px;margin:0 auto}.main-content header h1{font-size:30px;margin:0}.main-content header p,.panel-title p,.section-heading p{color:#64748b;margin:6px 0 0}.panel{background:#fff;border:1px solid #dbe4f0;border-radius:18px;padding:24px;margin-top:22px;box-shadow:0 2px 8px #15365a0c}.panel-title{display:flex;gap:13px;align-items:flex-start}.panel-title h2,.section-heading h2{margin:0;font-size:20px}
        .filters-grid{display:grid;grid-template-columns:minmax(160px,190px) minmax(160px,190px) minmax(240px,1fr) minmax(240px,1fr);gap:18px;margin-top:20px;align-items:start}.field,.multi-select-field{display:grid;grid-template-rows:18px 45px 18px;gap:7px;min-width:0;align-self:start;position:relative;font-size:13px;font-weight:700;color:#10203b}.field>span,.multi-select-label{display:block;height:18px;line-height:18px}.field input{width:100%;height:45px;padding:0 12px;border:1px solid #cbd8e8;border-radius:11px;background:#fff;color:#10203b}.field small,.multi-select-help{display:block;height:18px;overflow:hidden;color:#7b8da5;font-size:12px;font-weight:400;line-height:18px;white-space:nowrap;text-overflow:ellipsis}
        .multi-select-trigger{width:100%;height:45px;min-width:0;padding:0 13px;border:1px solid #cbd8e8;border-radius:11px;background:#fff;color:#10203b;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;font:inherit;cursor:pointer}.multi-select-trigger:hover{border-color:#8eadd1}.multi-select-trigger:focus-visible,.multi-select-trigger.open{outline:none;border-color:#2663eb;box-shadow:0 0 0 3px rgba(38,99,235,.12)}.multi-select-value,.multi-select-placeholder{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.multi-select-value{font-weight:600}.multi-select-placeholder{color:#64748b;font-weight:400}.multi-select-chevron{flex:0 0 auto;color:#64748b;transition:transform .15s}.multi-select-chevron.open{transform:rotate(180deg)}
        .multi-select-menu{position:absolute;z-index:1000;top:75px;left:0;width:100%;min-width:300px;max-height:390px;overflow:hidden;border:1px solid #cbd8e8;border-radius:13px;background:#fff;box-shadow:0 18px 45px rgba(15,35,65,.18)}.multi-select-search-row{height:54px;padding:8px 11px;border-bottom:1px solid #e5edf6;display:flex;align-items:center;gap:8px}.multi-select-search-row>svg{color:#64748b;flex:0 0 auto}.multi-select-search{min-width:0;flex:1;height:37px;border:0;outline:0;background:transparent;color:#10203b;font:inherit}.icon-button{border:0;background:transparent;color:#64748b;padding:4px;display:grid;place-items:center;cursor:pointer}.multi-select-actions{display:flex;gap:8px;padding:9px 11px;border-bottom:1px solid #e5edf6;background:#f8fbff}.multi-select-actions button,.multi-select-footer button{border:0;border-radius:8px;background:#e9f1ff;color:#1f56c8;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}.multi-select-actions button:disabled{opacity:.45;cursor:not-allowed}
        .multi-select-options{max-height:230px;overflow-y:auto;padding:6px;display:grid;grid-template-columns:minmax(0,1fr);gap:2px;scrollbar-width:thin}.multi-select-option{width:100%;min-height:44px;padding:9px 10px;border-radius:8px;display:grid;grid-template-columns:18px minmax(0,1fr);align-items:center;column-gap:10px;color:#253852;font-size:13px;font-weight:500;line-height:20px;cursor:pointer;user-select:none}.multi-select-option:hover{background:#f0f5fc}.multi-select-option.selected{background:#eaf2ff;color:#174ea6}.multi-select-option input[type='checkbox']{appearance:auto;-webkit-appearance:checkbox;width:17px;height:17px;margin:0;padding:0;display:block;align-self:center;justify-self:center;accent-color:#2663eb;cursor:pointer;transform:none}.multi-select-option span{min-width:0;margin:0;padding:0;display:block;align-self:center;line-height:20px;overflow-wrap:anywhere}.multi-select-empty{padding:24px 14px;color:#7b8da5;font-size:13px;text-align:center}.multi-select-footer{min-height:45px;padding:8px 11px;border-top:1px solid #e5edf6;background:#f8fbff;display:flex;align-items:center;justify-content:space-between;gap:12px}.multi-select-footer span{color:#64748b;font-size:12px}
        .filter-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:18px}button.primary,button.secondary{border:0;border-radius:11px;padding:13px 19px;font-weight:800;display:inline-flex;gap:8px;align-items:center;cursor:pointer}button.primary{background:#2663eb;color:#fff}button.secondary{background:#edf2f7;color:#32445d}button:disabled{opacity:.55;cursor:not-allowed}
        .section-heading{margin-top:30px}.metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:14px}.metric-card{background:#fff;border:1px solid #dce6f2;border-radius:17px;padding:23px;display:flex;gap:17px;min-height:150px}.metric-card-icon{width:54px;height:54px;border-radius:14px;display:grid;place-items:center;background:#eaf2ff;color:#2563eb;flex:0 0 auto}.metric-card-content{min-width:0;flex:1}.metric-label,.metric-caption{overflow-wrap:anywhere}.metric-value{white-space:nowrap}.tone-green{border-color:#83e4bd}.tone-green .metric-card-icon{background:#e6fbf3;color:#009c68}.tone-amber{border-color:#f7ca58}.tone-amber .metric-card-icon{background:#fff7dd;color:#c66b00}.tone-slate .metric-card-icon{background:#edf1f6;color:#516176}.metric-label{font-weight:800;color:#5b6f8a}.metric-value{font-size:34px;font-weight:900;color:#06142e;margin-top:7px}.metric-caption{color:#667891;margin-top:5px}.distribution{display:grid;gap:14px;margin-top:22px}.bar-row{display:grid;grid-template-columns:140px 1fr 180px;gap:15px;align-items:center}.bar-row>div{height:14px;background:#e9eff7;border-radius:20px;overflow:hidden}.bar-row i{display:block;height:100%;background:#18b982;border-radius:20px}.analytics-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}.analytics-tabs button{border:1px solid #cbd8e8;background:#f8fbff;color:#53667e;border-radius:10px;padding:9px 13px;font-weight:800;cursor:pointer}.analytics-tabs button.active{border-color:#2663eb;background:#eaf2ff;color:#174ea6}.provider-table-wrap{max-height:620px}.provider-table-wrap thead{position:sticky;top:0;z-index:2}.provider-name{min-width:320px;font-weight:700;color:#253852}.table-wrap{overflow:auto;margin-top:18px}table{border-collapse:collapse;width:100%;white-space:nowrap}th,td{text-align:left;padding:13px;border-bottom:1px solid #e6edf5}th{color:#53667e;background:#f8fafc}.upload-panel{max-width:850px}.upload-box{margin-top:22px;border:2px dashed #9eb5d1;border-radius:16px;padding:44px;display:grid;place-items:center;gap:9px;cursor:pointer;background:#f8fbff}.upload-box input{display:none}.upload-button{margin-top:18px}.status-box{margin-top:18px;background:#eef5ff;border-radius:12px;padding:16px;display:grid;gap:5px}.alert{margin-top:20px;background:#fff0f0;color:#a80000;padding:14px;border-radius:12px;display:flex;gap:10px}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
        @media(min-width:821px) and (max-width:1279px){.app-shell{grid-template-columns:220px minmax(0,1fr)}.sidebar{padding:24px 14px}.main-content{padding:28px 24px;max-width:none}.filters-grid,.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.bar-row{grid-template-columns:120px minmax(160px,1fr) 145px}}
        @media(min-width:601px) and (max-width:820px){.app-shell{display:block}.sidebar{position:static;height:auto;padding:18px 22px}.sidebar nav{grid-template-columns:repeat(3,minmax(0,1fr))}.backend-badge{margin-top:14px;width:fit-content}.main-content{padding:26px 22px}.filters-grid,.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.multi-select-menu{min-width:100%}}
        @media(max-width:600px){.app-shell{display:block}.sidebar{position:static;height:auto;padding:16px}.sidebar nav,.filters-grid,.metric-grid{grid-template-columns:1fr}.backend-badge{margin-top:14px}.main-content{padding:22px 14px}.panel{padding:18px}.filter-actions{display:grid}.filter-actions button{justify-content:center}.bar-row{grid-template-columns:1fr}.multi-select-menu{min-width:100%;max-width:calc(100vw - 28px)}.multi-select-actions{flex-wrap:wrap}}
      `}</style>
    </div>
  );
}

export default App;
