import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  Filter,
  Gauge,
  ListChecks,
  RefreshCw,
  Server,
  Truck,
  Upload,
  Users,
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
type Tone = 'blue' | 'green' | 'amber' | 'slate' | 'red';

const DEFAULT_FILTERS: TrackeoFilters = {
  fecha_desde: '2026-08-01',
  fecha_hasta: '2026-08-24',
  campanas: [],
  prestador_ids: [],
};

const nf = (value?: number | null) => {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('es-AR').format(value);
};

const pct = (value?: number | null) => {
  if (value === undefined || value === null) return '—';
  return `${new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 1,
  }).format(value * 100)} %`;
};

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
  options: Array<{ value: string; label: string }>;
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        multiple
        value={values}
        onChange={(event) =>
          onChange(
            Array.from(event.target.selectedOptions).map(
              (option) => option.value,
            ),
          )
        }
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <small>
        {values.length
          ? `${values.length} seleccionado(s)`
          : placeholder}
      </small>
    </label>
  );
}

function App() {
  const [page, setPage] = useState<Page>('metrics');
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
    const reason = (scope: string, value: unknown) =>
      `${scope}: ${value instanceof Error ? value.message : String(value)}`;

    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value.resumen);
    } else {
      errors.push(reason('Resumen', summaryResult.reason));
    }

    if (universeResult.status === 'fulfilled') {
      setUniverses(universeResult.value.universos);
    } else {
      errors.push(reason('Universos', universeResult.reason));
    }

    if (providerResult.status === 'fulfilled') {
      setProviders(providerResult.value.prestadores || []);
    } else {
      errors.push(reason('Prestadores', providerResult.reason));
    }

    if (campaignResult.status === 'fulfilled') {
      setCampaigns(campaignResult.value.campanas || []);
    } else {
      errors.push(reason('Campañas', campaignResult.reason));
    }

    if (optionResult.status === 'fulfilled') {
      setProviderOptions(optionResult.value.prestadores || []);
    } else {
      errors.push(reason('Lista de prestadores', optionResult.reason));
    }

    if (errors.length > 0) {
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

  const campaignOptions = useMemo(
    () =>
      campaigns.map((campaign) => ({
        value: campaign.campana,
        label: `${campaign.campana} (${nf(campaign.servicios)})`,
      })),
    [campaigns],
  );

  const providerSelectOptions = useMemo(
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
          `${
            result.mensaje || 'El archivo ya había sido cargado.'
          } Archivo existente: ${result.existente || 'sin nombre'}.`,
        );
        return;
      }

      if (!result.report_id) {
        throw new Error('El backend no devolvió report_id.');
      }

      setUploadMessage('Archivo en cola. Iniciando procesamiento masivo…');

      for (let attempt = 0; attempt < 600; attempt += 1) {
        const state = await api.ingestStatus(result.report_id);
        setIngestStatus(state);

        if (state.status === 'procesado') {
          setUploadMessage(
            `Carga completada: ${nf(
              state.filas_procesadas,
            )} filas procesadas.`,
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
          `${state.etapa || state.status}: ${nf(
            state.filas_procesadas,
          )} filas procesadas.`,
        );

        await sleep(3000);
      }

      setUploadMessage(
        'El trabajo continúa en la cola. Consultá el estado desde la plataforma.',
      );
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
                placeholder="Todas las campañas"
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

            <section className="metric-grid universe-grid">
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
                tone="amber"
              />
              <MetricCard
                icon={<Clock3 />}
                label="Vehiculares no finalizados"
                value={nf(universes?.servicios_no_finalizados)}
                caption="Pendientes o en curso"
                tone="slate"
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
              <p>
                Estos indicadores conservan la regla histórica para no alterar
                las comparaciones.
              </p>
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
                caption={`${nf(
                  summary?.enviador_si,
                )} servicios con Enviador OK`}
                tone="amber"
              />
              <MetricCard
                icon={<Truck />}
                label="Asigna móvil"
                value={nf(summary?.asigna_movil)}
                caption={`${pct(summary?.efectividad_enviador)} de efectividad`}
                tone="green"
              />
              <MetricCard
                icon={<AlertCircle />}
                label="No asigna móvil"
                value={nf(summary?.no_asigna_movil_cantidad)}
                caption={pct(summary?.no_asigna_movil_porcentaje)}
                tone="amber"
              />
              <MetricCard
                icon={<ListChecks />}
                label="Servicios programados"
                value={nf(summary?.servicios_programados)}
                caption={`${pct(
                  summary?.programados_porcentaje,
                )} sobre Enviador Sí`}
              />
              <MetricCard
                icon={<CheckCircle2 />}
                label="Cumplimiento de demora"
                value={pct(summary?.cumplimiento_demora)}
                caption={`${nf(summary?.servicios_cumplidos)} cumplen · ${nf(
                  summary?.servicios_no_cumplidos,
                )} no cumplen`}
                tone="green"
              />
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
                <h2>Prestadores</h2>
                <p>
                  {nf(providers.length)} prestadores en el universo histórico
                  filtrado.
                </p>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Prestador</th>
                    <th>Servicios</th>
                    <th>Uso enviador</th>
                    <th>Asigna móvil</th>
                    <th>Cumplimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((provider) => (
                    <tr key={provider.prestador_id}>
                      <td>{provider.prestador}</td>
                      <td>{nf(provider.servicios)}</td>
                      <td>{pct(provider.uso_enviador)}</td>
                      <td>{nf(provider.asigna_movil)}</td>
                      <td>{pct(provider.cumplimiento_demora)}</td>
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
                <p>
                  El archivo se guarda en Storage y se procesa mediante COPY,
                  staging y merge SQL.
                </p>
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
        *{box-sizing:border-box} body{margin:0}.app-shell{display:grid;grid-template-columns:280px 1fr;min-height:100vh}
        .sidebar{position:sticky;top:0;height:100vh;background:#0d2749;color:#fff;padding:28px 20px;display:flex;flex-direction:column}
        .brand{display:flex;gap:13px;align-items:center;padding:5px 12px 30px}.brand svg{background:#2463eb;padding:9px;border-radius:12px;width:42px;height:42px}
        .brand strong{display:block;font-size:22px}.brand span{color:#80d7ff}.sidebar nav{display:grid;gap:10px}
        .sidebar button{border:0;background:transparent;color:#dbe9ff;padding:15px;border-radius:12px;display:flex;gap:12px;align-items:center;font-size:16px;cursor:pointer}
        .sidebar button.active,.sidebar button:hover{background:#1b477e;color:#fff}.sidebar button svg{width:21px}.backend-badge{margin-top:auto;border:1px solid #34506f;border-radius:13px;padding:15px;display:flex;gap:12px;align-items:center}
        .backend-badge span,.backend-badge strong{display:block;font-size:13px}.backend-badge .ok{color:#36e3ac}.backend-badge .bad{color:#ff8b8b}
        .main-content{padding:34px 38px;max-width:1600px;width:100%;margin:auto}.main-content header h1{font-size:30px;margin:0}.main-content header p,.panel-title p,.section-heading p{color:#64748b;margin:6px 0 0}
        .panel{background:#fff;border:1px solid #dbe4f0;border-radius:18px;padding:24px;margin-top:22px;box-shadow:0 2px 8px #15365a0c}.panel-title{display:flex;gap:13px;align-items:flex-start}.panel-title h2,.section-heading h2{margin:0;font-size:20px}
        .filters-grid{display:grid;grid-template-columns:190px 190px 1fr 1fr;gap:18px;margin-top:20px}.field{display:grid;gap:7px;font-weight:700;font-size:13px}.field input,.field select{border:1px solid #cbd8e8;border-radius:11px;padding:12px;background:#fff;min-height:45px}.field select[multiple]{height:88px}.field small{font-weight:400;color:#7b8da5}
        .filter-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:18px}button.primary,button.secondary{border:0;border-radius:11px;padding:13px 19px;font-weight:800;display:inline-flex;gap:8px;align-items:center;cursor:pointer}button.primary{background:#2663eb;color:#fff}button.secondary{background:#edf2f7;color:#32445d}button:disabled{opacity:.55;cursor:not-allowed}
        .section-heading{margin-top:30px}.metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:14px}.metric-card{background:#fff;border:1px solid #dce6f2;border-radius:17px;padding:23px;display:flex;gap:17px;min-height:150px}.metric-card-icon{width:54px;height:54px;border-radius:14px;display:grid;place-items:center;background:#eaf2ff;color:#2563eb;flex:0 0 auto}.metric-card-content{min-width:0}
        .tone-green{border-color:#83e4bd}.tone-green .metric-card-icon{background:#e6fbf3;color:#009c68}.tone-amber{border-color:#f7ca58}.tone-amber .metric-card-icon{background:#fff7dd;color:#c66b00}.tone-slate .metric-card-icon{background:#edf1f6;color:#516176}.tone-red .metric-card-icon{background:#ffeded;color:#d33}
        .metric-label{font-weight:800;color:#5b6f8a}.metric-value{font-size:34px;font-weight:900;color:#06142e;margin-top:7px}.metric-caption{color:#667891;margin-top:5px}.distribution{display:grid;gap:14px;margin-top:22px}.bar-row{display:grid;grid-template-columns:140px 1fr 180px;gap:15px;align-items:center}.bar-row>div{height:14px;background:#e9eff7;border-radius:20px;overflow:hidden}.bar-row i{display:block;height:100%;background:#18b982;border-radius:20px}
        .table-wrap{overflow:auto;margin-top:18px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:13px;border-bottom:1px solid #e6edf5}th{color:#53667e;background:#f8fafc}.upload-panel{max-width:850px}.upload-box{margin-top:22px;border:2px dashed #9eb5d1;border-radius:16px;padding:44px;display:grid;place-items:center;gap:9px;cursor:pointer;background:#f8fbff}.upload-box input{display:none}.upload-button{margin-top:18px}.status-box{margin-top:18px;background:#eef5ff;border-radius:12px;padding:16px;display:grid;gap:5px}.alert{margin-top:20px;background:#fff0f0;color:#a80000;padding:14px;border-radius:12px;display:flex;gap:10px}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:1100px){.app-shell{grid-template-columns:1fr}.sidebar{position:static;height:auto}.sidebar nav{grid-template-columns:repeat(3,1fr)}.backend-badge{margin-top:20px}.filters-grid,.metric-grid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:700px){.main-content{padding:22px 14px}.sidebar nav,.filters-grid,.metric-grid{grid-template-columns:1fr}.bar-row{grid-template-columns:1fr}.app-shell{display:block}}
      `}</style>
    </div>
  );
}

export default App;
