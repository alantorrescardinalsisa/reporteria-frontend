import {
  useCallback,
  useEffect,
  useId,
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
  type Anomalias,
  type CampanaImpacto,
  type CampanaMetric,
  type CampanaPrestadorMetric,
  type DataQuality,
  type EstadoOption,
  type EstadosCategorizados,
  type EstadosEncuesta,
  type EstadosEncuestaPunto,
  type LimiteControlEncuesta,
  type CoberturaEncuestas,
  type FunnelTiempos,
  type Clasificacion,
  type HabilitadoresAsignacion,
  type IngestStatus,
  type InteligenciaPrestador,
  type InteligenciaPrestadores,
  type MetricaTrackeo,
  type Outliers,
  type PolizaOption,
  type PrestadorMetric,
  type PrestadorOption,
  type ProgramadosFunnel,
  type ProvinciaOption,
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
// NUEVO (ADITIVO): rango de fechas por defecto = "desde el mes anterior
// al último mes cerrado, hasta el último mes cerrado" -- se calcula en
// vivo contra la fecha de hoy (nunca hardcodeado), tomando como "último
// mes cargado" el último mes calendario completo (el mes en curso se
// excluye por estar incompleto, mismo criterio que /api/alertas en el
// backend). Ej.: si hoy es 2026-09-03, el último mes cerrado es agosto
// 2026 -> el rango por defecto queda 2026-07-01 a 2026-08-31.
function rangoPorDefecto(): { fecha_desde: string; fecha_hasta: string } {
  const hoy = new Date();
  const finUltimoMesCerrado = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  const inicioMesAnterior = new Date(
    hoy.getFullYear(),
    hoy.getMonth() - 2,
    1,
  );
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { fecha_desde: fmt(inicioMesAnterior), fecha_hasta: fmt(finUltimoMesCerrado) };
}
const DEFAULT: TrackeoFilters = {
  ...rangoPorDefecto(),
  campanas: [],
  prestador_ids: [],
  // NUEVO (ADITIVO): estados y tipos de servicio por defecto al iniciar
  // la plataforma, pedidos explícitamente por el usuario. "CERRADO (V H)"
  // es el valor real tal como está cargado en los datos (el usuario lo
  // había escrito como "CERRADO (VH)", sin el espacio entre la V y la H).
  estados: ["CERRADO", "CERRADO (V H)", "ENCUESTA FINAL"],
  tipos: ["MECANICA LIGERA", "REMOLQUE", "REMOLQUE MOTOS"],
  // NUEVO v4.24.0 (ADITIVO): sin poliza preseleccionada por defecto (se
  // incluyen todas, igual que campañas/prestadores).
  polizas: [],
  // NUEVO v4.26.0 (ADITIVO): idem para provincia de origen.
  provincias_origen: [],
  // NUEVO (ADITIVO, 2026-09-30): checkbox global "excluir outliers",
  // arranca activado a pedido del usuario.
  excluir_outliers: true,
  // NUEVO (ADITIVO, 2026-10-01): idem para "excluir servicios
  // programados" -- mismo comportamiento que tenían los dos checkboxes
  // locales que reemplaza (ambos arrancaban sin tildar, es decir,
  // excluyendo por defecto).
  excluir_programados: true,
};
// NUEVO v4.25.0 (Poka-Yoke, ADITIVO): nombres legibles de los tramos
// T1-T6 (mismos que usa el backend en TRAMOS_FUNNEL), para la tarjeta
// de "Anomalías detectadas".
const TRAMO_LABELS: Record<string, string> = {
  t1_alta_a_despachador: "Alta → Despachador",
  t2_despachador_a_asignacion: "Despachador → Asignación",
  t3_alta_a_asignacion: "Alta → Asignación",
  t4_asignacion_a_arribo: "Envío → Llegada",
  t5_ejecucion: "Llegada → Finalización",
  t6_end_to_end: "Alta → Finalización",
};
const nf = (v?: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("es-AR").format(v);
const pct = (v?: number | null) =>
  v == null
    ? "—"
    : `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(v * 100)} %`;
// NUEVO (ADITIVO): a diferencia de pct() (formatea una proporción 0-1 ya
// calculada), esta devuelve un número 0-100 a partir de dos conteos --
// para alimentar el ancho de una barra de progreso visual, sin agregar
// ningún indicador nuevo (solo redivide valores que la tarjeta ya muestra).
const pctOf = (num?: number | null, den?: number | null) =>
  num == null || den == null || den <= 0 ? undefined : (num / den) * 100;
// NUEVO (ADITIVO): convierte una proporción 0-1 ya calculada (la misma
// que formatea pct()) a 0-100 para el ancho de una barra de progreso.
const ratioPct = (v?: number | null) => (v == null ? undefined : v * 100);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// NUEVO v2.4.0 (memoria backend, ADITIVO). `load()` disparaba sus ~18
// pedidos analiticos TODOS a la vez (Promise.allSettled), lo que hace
// que el backend (Render plan free, 512MB, sin margen) reciba 18
// conexiones simultaneas en cada carga de pantalla -- eso genera
// presion real de memoria/recursos del lado del servidor (visto en
// los logs de Render como "[Errno 11] Resource temporarily
// unavailable" al intentar abrir mas conexiones hacia Supabase).
// runInBatches ejecuta los pedidos en tandas de a BATCH_SIZE en vez de
// todos juntos -- el backend nunca ve mas de esa cantidad en
// simultaneo desde esta pantalla, a costa de que la carga inicial
// tarda un poco mas (BATCH_SIZE tandas en secuencia en vez de una
// sola). El orden de los resultados se preserva igual que con
// Promise.allSettled, asi que el resto del codigo (los `take(i, ...)`
// por indice) no necesita cambiar.
const BATCH_SIZE = 4;
async function runInBatches(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  factories: (() => Promise<any>)[],
  batchSize = BATCH_SIZE,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<PromiseSettledResult<any>[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: PromiseSettledResult<any>[] = [];
  for (let i = 0; i < factories.length; i += batchSize) {
    const tanda = factories.slice(i, i + batchSize).map((fn) => fn());
    results.push(...(await Promise.allSettled(tanda)));
  }
  return results;
}
function initial(): TrackeoFilters {
  const p = new URLSearchParams(location.search);
  // BUGFIX: URLSearchParams.getAll(...) devuelve [] (nunca null) cuando
  // el parámetro no está en la URL -- a diferencia de p.get(...), que sí
  // devuelve null y permite el "|| DEFAULT...." de fecha_desde/hasta. Sin
  // este chequeo de longitud, los defaults de campañas/prestadores/
  // estados/tipos nunca se aplicaban (quedaban en [] para siempre en una
  // visita sin esos parámetros en la URL, que es el caso normal).
  const campanas = p.getAll("campana"),
    prestador_ids = p.getAll("prestador_id"),
    estados = p.getAll("estado"),
    tipos = p.getAll("tipo"),
    polizas = p.getAll("poliza"),
    provincias_origen = p.getAll("provincia_origen");
  return {
    fecha_desde: p.get("desde") || DEFAULT.fecha_desde,
    fecha_hasta: p.get("hasta") || DEFAULT.fecha_hasta,
    campanas: campanas.length ? campanas : DEFAULT.campanas,
    prestador_ids: prestador_ids.length ? prestador_ids : DEFAULT.prestador_ids,
    estados: estados.length ? estados : DEFAULT.estados,
    tipos: tipos.length ? tipos : DEFAULT.tipos,
    polizas: polizas.length ? polizas : DEFAULT.polizas,
    provincias_origen: provincias_origen.length
      ? provincias_origen
      : DEFAULT.provincias_origen,
    excluir_outliers:
      p.get("excluir_outliers") != null
        ? p.get("excluir_outliers") === "true"
        : DEFAULT.excluir_outliers,
    excluir_programados:
      p.get("excluir_programados") != null
        ? p.get("excluir_programados") === "true"
        : DEFAULT.excluir_programados,
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
/* ---------- NUEVO (ADITIVO): logo de la plataforma (mismo SVG que el
   favicon, público\public\favicon.svg) -- inline para que quede nítido
   en cualquier tamaño, sin pedir un archivo aparte. ---------- */
function Logo({ className = "w-9 h-9 shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1246 1246" className={className} xmlns="http://www.w3.org/2000/svg">
      <polygon points="115,148 755,148 435,468" fill="#F39200" />
      <polygon points="115,148 435,468 115,788" fill="#E6007A" />
      <polygon points="115,788 435,468 1125,1210" fill="#149999" />
    </svg>
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
type Tooltip = { leer: string; calculo?: string; titulo?: string };
function InfoTip({ leer, calculo, titulo }: Tooltip) {
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
              {titulo && (
                <span className="block font-label-caps text-label-caps uppercase tracking-wide text-primary-fixed-dim mb-1.5 pb-1.5 border-b border-inverse-on-surface/20">
                  {titulo}
                </span>
              )}
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
  icon,
}: {
  label: string;
  values: string[];
  options: Option[];
  placeholder: string;
  onChange: (v: string[]) => void;
  /* NUEVO (ADITIVO, rediseño visual): ícono opcional para el chip del
     filtro, igual que el mockup de referencia -- si no se pasa, el
     chip queda sin ícono (comportamiento anterior). */
  icon?: ReactNode;
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
  const selectedLabel =
    values.length === 1
      ? options.find((o) => o.value === values[0])?.label || values[0]
      : null;
  return (
    <div className="relative min-w-[170px]" ref={ref}>
      <button
        type="button"
        className={`flex items-center justify-between gap-space-sm px-space-sm py-1.5 rounded-lg shadow-sm text-body-sm font-body-sm cursor-pointer transition-colors w-full ${
          values.length > 0
            ? "bg-surface-container-highest text-on-surface hover:bg-surface-container-high"
            : "bg-surface-container-lowest text-on-surface hover:bg-surface-container-low"
        }`}
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {icon}
          <span className="truncate">
            {selectedLabel ? (
              <>
                {label}: <strong className="text-on-surface">{selectedLabel}</strong>
              </>
            ) : (
              <span className={values.length > 0 ? "font-medium" : "text-on-surface-variant"}>
                {label}
              </span>
            )}
          </span>
        </span>
        {values.length > 1 ? (
          <span className="px-1.5 py-0.5 rounded-full bg-primary text-on-primary font-label-code text-label-code font-bold shrink-0">
            {values.length} sel
          </span>
        ) : (
          <Icon name="expand_more" className="text-[16px] text-on-surface-variant shrink-0" />
        )}
      </button>
      <span className="sr-only">{placeholder}</span>
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

/* ---------- NUEVO (ADITIVO): selector de rango de fechas en un solo
   calendario -- reemplaza los dos <input type="date"> sueltos. Mismo
   dato que antes (fecha_desde / fecha_hasta como string "YYYY-MM-DD"
   en el draft de filtros), solo cambia la interacción: un clic marca el
   inicio, el siguiente clic marca el fin (si es anterior, se
   intercambian), y mientras se elige el fin los días intermedios se
   pintan en vivo siguiendo el mouse. */
const MESES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS_SEMANA_CORTO = ["L", "M", "M", "J", "V", "S", "D"];
const isoDe = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fechaDeIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const gridDelMes = (vista: Date) => {
  const year = vista.getFullYear(),
    month = vista.getMonth(),
    primero = new Date(year, month, 1),
    inicioSemana = (primero.getDay() + 6) % 7,
    diasEnMes = new Date(year, month + 1, 0).getDate();
  const celdas: (Date | null)[] = [];
  for (let i = 0; i < inicioSemana; i++) celdas.push(null);
  for (let d = 1; d <= diasEnMes; d++) celdas.push(new Date(year, month, d));
  while (celdas.length % 7 !== 0) celdas.push(null);
  return celdas;
};
function DateRangePicker({
  desde,
  hasta,
  onChange,
}: {
  desde: string;
  hasta: string;
  onChange: (desde: string, hasta: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [vista, setVista] = useState(() => fechaDeIso(desde || isoDe(new Date())));
  const [inicioPendiente, setInicioPendiente] = useState<string | null>(null);
  const [hoverIso, setHoverIso] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const h = (e: MouseEvent) =>
      ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => {
    if (open) {
      setInicioPendiente(null);
      setVista(fechaDeIso(desde || isoDe(new Date())));
    }
  }, [open]);

  const previewFin = inicioPendiente ? hoverIso ?? inicioPendiente : null;
  const lo = inicioPendiente
    ? previewFin && previewFin < inicioPendiente
      ? previewFin
      : inicioPendiente
    : desde;
  const hi = inicioPendiente
    ? previewFin && previewFin < inicioPendiente
      ? inicioPendiente
      : previewFin
    : hasta;

  const clickDia = (iso: string) => {
    if (!inicioPendiente) {
      setInicioPendiente(iso);
      onChange(iso, iso);
    } else {
      onChange(iso < inicioPendiente ? iso : inicioPendiente, iso < inicioPendiente ? inicioPendiente : iso);
      setInicioPendiente(null);
    }
  };

  const dias = Math.max(
    0,
    Math.round((fechaDeIso(hasta).getTime() - fechaDeIso(desde).getTime()) / 86400000) + 1,
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex items-center gap-1.5 px-space-sm py-1.5 rounded-lg bg-surface-container-lowest shadow-sm h-9 text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="date_range" className="text-primary text-[17px] shrink-0" />
        <span className="font-label-code text-label-code font-semibold text-on-surface whitespace-nowrap">
          {desde && hasta ? `${desde.slice(8, 10)}/${desde.slice(5, 7)}/${desde.slice(2, 4)} — ${hasta.slice(8, 10)}/${hasta.slice(5, 7)}/${hasta.slice(2, 4)}` : "Elegir fechas"}
        </span>
        {desde && hasta && (
          <span className="text-on-surface-variant font-label-code text-label-code uppercase shrink-0">
            {dias}d
          </span>
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 z-30 bg-surface-container-lowest rounded-lg card-shadow border border-outline-variant/30 overflow-hidden flex flex-col p-space-sm gap-space-xs">
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              className="p-1 rounded-lg hover:bg-surface-container-low text-on-surface-variant"
              onClick={() =>
                setVista((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))
              }
            >
              <Icon name="chevron_left" className="text-[18px]" />
            </button>
            <span className="font-body-md text-body-md font-semibold text-on-surface">
              {MESES_LARGO[vista.getMonth()]} {vista.getFullYear()}
            </span>
            <button
              type="button"
              className="p-1 rounded-lg hover:bg-surface-container-low text-on-surface-variant"
              onClick={() =>
                setVista((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))
              }
            >
              <Icon name="chevron_right" className="text-[18px]" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 px-1">
            {DIAS_SEMANA_CORTO.map((d, i) => (
              <span
                key={i}
                className="text-center font-label-caps text-label-caps text-on-surface-variant py-1"
              >
                {d}
              </span>
            ))}
            {gridDelMes(vista).map((d, i) => {
              if (!d) return <span key={i} />;
              const iso = isoDe(d);
              const esInicio = iso === lo,
                esFin = iso === hi,
                enRango = lo && hi && iso > lo && iso < hi;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => clickDia(iso)}
                  onMouseEnter={() => inicioPendiente && setHoverIso(iso)}
                  className={`h-7 text-body-sm font-body-sm rounded-md transition-colors ${
                    esInicio || esFin
                      ? "bg-primary text-on-primary font-semibold"
                      : enRango
                        ? "bg-primary/15 text-on-surface"
                        : "text-on-surface hover:bg-surface-container-low"
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between px-1 pt-space-xs border-t border-outline-variant/20 font-label-code text-label-code text-on-surface-variant">
            <span>
              {inicioPendiente
                ? "Elegí la fecha de fin…"
                : desde && hasta
                  ? `${dias} día${dias === 1 ? "" : "s"} seleccionados`
                  : "Elegí la fecha de inicio"}
            </span>
            <button
              type="button"
              className="text-primary font-semibold hover:underline"
              onClick={() => setOpen(false)}
            >
              Listo
            </button>
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
const PROGRESS_BAR_CLASSES: Record<string, string> = {
  blue: "bg-primary",
  green: "bg-tertiary",
  red: "bg-primary",
  purple: "bg-[#7c3aed]",
  amber: "bg-outline",
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
  progress,
  badge,
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
  progress?: number;
  badge?: string;
}) {
  return (
    <article
      className={`flex flex-col h-full gap-space-sm p-space-lg rounded-xl card-shadow border relative overflow-hidden transition-shadow hover:shadow-md ${
        highlight
          ? "bg-primary text-on-primary border-transparent"
          : "bg-surface-container-lowest border-outline-variant/20"
      } ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-space-sm">
        <span
          className={`font-label-caps text-label-caps uppercase flex items-center gap-1 min-w-0 ${
            highlight ? "text-on-primary/80" : "text-on-surface-variant"
          }`}
        >
          <span className="truncate">{title}</span>
          {tooltip && <InfoTip {...tooltip} titulo={title} />}
        </span>
        <div
          className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${
            highlight ? "bg-surface-container-lowest/20 text-on-primary" : TONE_CLASSES[tone]
          }`}
        >
          {icon}
        </div>
      </div>
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-baseline gap-space-sm">
          <span
            className={`font-metric-display text-metric-display leading-none ${highlight ? "text-on-primary" : "text-on-surface"}`}
          >
            {value}
          </span>
          {badge && (
            <span
              className={`font-label-code text-label-code px-2 py-0.5 rounded-full font-semibold ${
                highlight
                  ? "bg-surface-container-lowest/20 text-on-primary"
                  : `${TONE_CLASSES[tone] || TONE_CLASSES.blue}`
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        <small
          className={`font-body-sm text-body-sm leading-snug ${highlight ? "text-on-primary/90" : "text-on-surface-variant"}`}
        >
          {detail}
        </small>
      </div>
      <div className="mt-auto flex flex-col gap-space-xs">
        {!highlight && progress != null && (
          <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full ${PROGRESS_BAR_CLASSES[tone] || PROGRESS_BAR_CLASSES.blue}`}
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
        )}
        {onClick && (
          <b
            className={`font-label-md text-label-md inline-flex items-center gap-0.5 ${highlight ? "text-on-primary" : "text-primary"}`}
          >
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
  progress,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  onClick?: () => void;
  tooltip?: Tooltip;
  progress?: number;
}) {
  return (
    <div
      className={`flex flex-col gap-1 py-space-xs group ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm min-w-0">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="font-body-md text-body-md font-semibold text-on-surface flex items-center gap-1 min-w-0">
              <span className="truncate">{label}</span>
              {tooltip && <InfoTip {...tooltip} titulo={label} />}
            </div>
            {detail && (
              <div className="font-label-code text-label-code text-on-surface-variant truncate">
                {detail}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="font-metric-sm text-metric-sm text-on-surface">{value}</span>
          {onClick && (
            <Icon
              name="chevron_right"
              className="text-[18px] text-outline group-hover:text-primary transition-colors"
            />
          )}
        </div>
      </div>
      {progress != null && (
        <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-primary h-full rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}

/* ---------- NUEVO (ADITIVO): grupo colapsable de secciones, para no
   tener que scrollear toda la pantalla de "Métricas de Trackeo" de una
   vez. Puramente visual -- envuelve secciones ya existentes sin tocar
   su contenido ni sus cálculos. ---------- */
function CollapsibleGroup({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center justify-between gap-2 w-full text-left px-space-md py-space-sm rounded-xl bg-surface-container-lowest card-shadow border border-outline-variant/20 hover:bg-surface-container-low transition-colors"
      >
        <span className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface font-semibold">
          <Icon name={icon} className="text-primary text-[22px]" />
          {title}
        </span>
        <Icon
          name="expand_more"
          className={`text-on-surface-variant text-[22px] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="flex flex-col gap-xl pt-xs">{children}</div>}
    </section>
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
          {tooltip && <InfoTip {...tooltip} titulo={label} />}
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
// NUEVO (ADITIVO): series mostradas + su color, en un solo lugar para
// no repetir la lista al dibujar las líneas y al armar el tooltip.
const TREND_SERIES: {
  key: keyof TrendPoint;
  label: string;
  stroke: string;
  fill: string;
  hex: string;
}[] = [
  {
    key: "cumplimiento_demora",
    label: "Cumplimiento de demora",
    stroke: "stroke-tertiary",
    fill: "fill-tertiary",
    hex: "#571ac0",
  },
  {
    key: "efectividad_enviador",
    label: "Efectividad enviador",
    stroke: "stroke-primary",
    fill: "fill-primary",
    hex: "#3525cd",
  },
  {
    key: "uso_enviador",
    label: "Uso enviador",
    stroke: "stroke-[#7c3aed]",
    fill: "fill-[#7c3aed]",
    hex: "#7c3aed",
  },
];

// NUEVO (ADITIVO): convierte una serie de puntos en una curva suave
// (Catmull-Rom -> Bezier cúbica) en vez de segmentos rectos -- mismos
// datos y mismas coordenadas x/y ya calculadas, solo cambia cómo se
// dibuja la línea entre ellas.
const smoothLinePath = (pts: { x: number; y: number }[]) => {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};
// Misma curva, pero cerrada contra la línea de base (baseline) para
// rellenar el área debajo -- usada solo en la serie principal.
const smoothAreaPath = (pts: { x: number; y: number }[], baseline: number) => {
  if (pts.length === 0) return "";
  const line = smoothLinePath(pts);
  const first = pts[0],
    last = pts[pts.length - 1];
  return `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
};
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
  const svgRef = useRef<SVGSVGElement>(null);
  const gradId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = width,
    H = height,
    P = 35,
    x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, data.length - 1),
    y = (v: number) => H - P - v * (H - 2 * P),
    pointsOf = (k: keyof TrendPoint) =>
      data.map((d, i) => ({ x: x(i), y: y(Number(d[k] || 0)) }));

  // NUEVO (ADITIVO): antes se etiquetaba CADA día en el eje X -- con
  // más de ~15-20 puntos las etiquetas se pisaban entre sí y quedaban
  // ilegibles. Ahora se calcula cuántas etiquetas entran sin
  // amontonarse (según el ancho real disponible) y se saltean el resto,
  // siempre mostrando el primer y el último día.
  const anchoUtil = W - 2 * P,
    maxEtiquetas = Math.max(2, Math.floor(anchoUtil / 46)),
    paso = Math.max(1, Math.ceil(data.length / maxEtiquetas)),
    mostrarEtiqueta = (i: number) =>
      i === 0 || i === data.length - 1 || i % paso === 0;

  const moverHover = (e: ReactMouseEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg || data.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = (localX - P) / Math.max(1, anchoUtil);
    const idx = Math.round(ratio * (data.length - 1));
    setHoverIdx(Math.min(data.length - 1, Math.max(0, idx)));
  };

  const hover = hoverIdx != null ? data[hoverIdx] : null;
  // Tooltip: se ancla a la derecha del punto salvo que no entre en el
  // ancho del gráfico, en cuyo caso se ubica a la izquierda.
  // 190 (no 148): "Cumplimiento de demora: 100%" es la etiqueta más
  // larga de las 3 y no entraba en el ancho anterior -- quedaba cortada
  // contra el borde del tooltip.
  const TOOLTIP_W = 190,
    TOOLTIP_PAD = 10;
  const hoverX = hoverIdx != null ? x(hoverIdx) : 0,
    tooltipHaciaLaIzquierda = hoverX + TOOLTIP_PAD + TOOLTIP_W > W,
    tooltipX = tooltipHaciaLaIzquierda
      ? hoverX - TOOLTIP_PAD - TOOLTIP_W
      : hoverX + TOOLTIP_PAD,
    tooltipY = 8,
    tooltipH = 22 + TREND_SERIES.length * 16;

  return (
    <svg
      ref={svgRef}
      {...(responsive
        ? { className: "w-full block", style: { height: H } }
        : { width: W, height: H, className: "block" })}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      <defs>
        {TREND_SERIES.slice(0, 2).map((s) => (
          <linearGradient key={s.key} id={`${gradId}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={s.hex} stopOpacity={0.25} />
            <stop offset="100%" stopColor={s.hex} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line
            x1={P}
            x2={W - P}
            y1={y(v)}
            y2={y(v)}
            className="stroke-outline-variant/30"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <text x="2" y={y(v) + 4} className="fill-outline text-[10px]">
            {v * 100}%
          </text>
        </g>
      ))}
      {TREND_SERIES.slice(0, 2).map((s) => (
        <path
          key={`area-${s.key}`}
          d={smoothAreaPath(pointsOf(s.key), H - P)}
          fill={`url(#${gradId}-${s.key})`}
          stroke="none"
        />
      ))}
      {TREND_SERIES.map((s) => (
        <path
          key={s.key}
          className={`fill-none ${s.stroke}`}
          strokeWidth={s.key === "cumplimiento_demora" ? 2.5 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          d={smoothLinePath(pointsOf(s.key))}
        />
      ))}
      {data.map(
        (d, i) =>
          mostrarEtiqueta(i) && (
            <text
              key={d.fecha}
              x={x(i)}
              y={H - 7}
              textAnchor="middle"
              className="fill-outline text-[10px]"
            >
              {d.fecha.slice(5)}
            </text>
          ),
      )}

      {/* ---------- NUEVO (ADITIVO): hover con línea guía + tooltip ---------- */}
      {hover && (
        <g pointerEvents="none">
          <line
            x1={hoverX}
            x2={hoverX}
            y1={0}
            y2={H - P}
            className="stroke-outline"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
          {TREND_SERIES.map((s) => (
            <circle
              key={s.key}
              cx={hoverX}
              cy={y(Number(hover[s.key] || 0))}
              r={3.5}
              className={`${s.fill} stroke-surface-container-lowest`}
              strokeWidth={1.5}
            />
          ))}
          <rect
            x={tooltipX}
            y={tooltipY}
            width={TOOLTIP_W}
            height={tooltipH}
            rx={6}
            className="fill-inverse-surface"
            opacity={0.95}
          />
          <text
            x={tooltipX + 10}
            y={tooltipY + 16}
            className="fill-inverse-on-surface text-[11px] font-semibold"
          >
            {hover.fecha}
          </text>
          {TREND_SERIES.map((s, i) => (
            <g key={s.key}>
              <circle
                cx={tooltipX + 12}
                cy={tooltipY + 30 + i * 16}
                r={3}
                className={s.fill}
              />
              <text
                x={tooltipX + 20}
                y={tooltipY + 34 + i * 16}
                className="fill-inverse-on-surface text-[10px]"
              >
                {s.label}: {Math.round(Number(hover[s.key] || 0) * 100)}%
              </text>
            </g>
          ))}
        </g>
      )}

      {/* Superficie invisible para capturar el mouse en todo el
          gráfico (arriba de las líneas en el orden de pintado, para
          que el hover funcione aunque el cursor no esté exactamente
          sobre el trazo de una línea). */}
      <rect
        x={0}
        y={0}
        width={W}
        height={H}
        fill="transparent"
        onMouseMove={moverHover}
        onMouseLeave={() => setHoverIdx(null)}
      />
    </svg>
  );
}

/* ---------- NUEVO (ADITIVO): serie diaria de "ENCUESTA FINAL" /
   "ENCUESTA PENDIENTE" -- mismo lenguaje visual que TrendSvg (hover con
   linea guia + tooltip, etiquetas de eje X que se salteen para no
   amontonarse), pero con escala de CANTIDAD (eje Y dinamico segun el
   maximo real de la serie) en vez de porcentaje 0-100% fijo. */
const ENCUESTA_SERIES: {
  key: "encuesta_final" | "encuesta_pendiente";
  label: string;
  stroke: string;
  fill: string;
  hex: string;
}[] = [
  {
    key: "encuesta_final",
    label: "Encuesta final",
    stroke: "stroke-primary",
    fill: "fill-primary",
    hex: "#3525cd",
  },
  {
    key: "encuesta_pendiente",
    label: "Encuesta pendiente",
    stroke: "stroke-[#f59e0b]",
    fill: "fill-[#f59e0b]",
    hex: "#f59e0b",
  },
];
function EncuestaTrendSvg({
  data,
  limites,
  width,
  height,
}: {
  data: EstadosEncuestaPunto[];
  limites?: {
    encuesta_final: LimiteControlEncuesta;
    encuesta_pendiente: LimiteControlEncuesta;
  } | null;
  width: number;
  height: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gradId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = width,
    H = height,
    P = 35,
    maxValor = Math.max(
      1,
      ...data.map((d) => Math.max(d.encuesta_final, d.encuesta_pendiente)),
    ),
    x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, data.length - 1),
    y = (v: number) => H - P - (v / maxValor) * (H - 2 * P),
    pointsOf = (k: "encuesta_final" | "encuesta_pendiente") =>
      data.map((d, i) => ({ x: x(i), y: y(Number(d[k] || 0)) }));

  // El backend ya viene marcando, para cada dia, si dispara una
  // alerta -- combina una regla puntual (residuo de ese dia contra su
  // linea base esperada segun el dia de semana, mas de 3 sigma abajo)
  // con CUSUM (caida mas lenta mantenida en el tiempo). Ver
  // _residuos_ajustados_por_dia_semana / _alertas_cusum_caida en app.py.
  const alertaCusum = (
    d: EstadosEncuestaPunto,
    k: "encuesta_final" | "encuesta_pendiente",
  ) =>
    Boolean(
      k === "encuesta_final" ? d.encuesta_final_alerta : d.encuesta_pendiente_alerta,
    );

  const anchoUtil = W - 2 * P,
    maxEtiquetas = Math.max(2, Math.floor(anchoUtil / 46)),
    paso = Math.max(1, Math.ceil(data.length / maxEtiquetas)),
    ultimoIdx = data.length - 1,
    mostrarEtiqueta = (i: number) => {
      if (i === 0 || i === ultimoIdx) return true;
      if (i % paso !== 0) return false;
      // Si la etiqueta regular cae muy cerca de la ultima (forzada),
      // se saltea -- si no, se amontonan y se vuelven ilegibles.
      return ultimoIdx - i >= Math.max(1, Math.ceil(paso / 2));
    };

  const moverHover = (e: ReactMouseEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg || data.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = (localX - P) / Math.max(1, anchoUtil);
    const idx = Math.round(ratio * (data.length - 1));
    setHoverIdx(Math.min(data.length - 1, Math.max(0, idx)));
  };

  const hover = hoverIdx != null ? data[hoverIdx] : null;
  const TOOLTIP_W = 180,
    TOOLTIP_PAD = 10;
  const hoverX = hoverIdx != null ? x(hoverIdx) : 0,
    tooltipHaciaLaIzquierda = hoverX + TOOLTIP_PAD + TOOLTIP_W > W,
    tooltipX = tooltipHaciaLaIzquierda
      ? hoverX - TOOLTIP_PAD - TOOLTIP_W
      : hoverX + TOOLTIP_PAD,
    tooltipY = 8,
    tooltipH = 22 + ENCUESTA_SERIES.length * 16;

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-on-surface-variant font-body-md text-[13px]"
        style={{ height }}
      >
        Sin datos en el período.
      </div>
    );
  }

  return (
    <svg
      ref={svgRef}
      className="w-full block"
      style={{ height: H }}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      <defs>
        {ENCUESTA_SERIES.map((s) => (
          <linearGradient key={s.key} id={`${gradId}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={s.hex} stopOpacity={0.25} />
            <stop offset="100%" stopColor={s.hex} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line
            x1={P}
            x2={W - P}
            y1={y(v * maxValor)}
            y2={y(v * maxValor)}
            className="stroke-outline-variant/30"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <text x="2" y={y(v * maxValor) + 4} className="fill-outline text-[10px]">
            {Math.round(v * maxValor)}
          </text>
        </g>
      ))}
      {limites &&
        ENCUESTA_SERIES.map((s) => {
          const l = limites[s.key];
          if (!l) return null;
          return (
            <line
              key={`media-${s.key}`}
              x1={P}
              x2={W - P}
              y1={y(l.media)}
              y2={y(l.media)}
              className={s.stroke}
              strokeWidth={1}
              strokeDasharray="4,3"
              opacity={0.5}
            />
          );
        })}
      {ENCUESTA_SERIES.map((s) => (
        <path
          key={`area-${s.key}`}
          d={smoothAreaPath(pointsOf(s.key), H - P)}
          fill={`url(#${gradId}-${s.key})`}
          stroke="none"
        />
      ))}
      {ENCUESTA_SERIES.map((s) => (
        <path
          key={s.key}
          className={`fill-none ${s.stroke}`}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          d={smoothLinePath(pointsOf(s.key))}
        />
      ))}
      {limites &&
        data.map((d, i) =>
          ENCUESTA_SERIES.map(
            (s) =>
              alertaCusum(d, s.key) && (
                <circle
                  key={`bajo-${s.key}-${d.fecha}`}
                  cx={x(i)}
                  cy={y(Number(d[s.key] || 0))}
                  r={4.5}
                  className="fill-none stroke-red-500"
                  strokeWidth={2}
                />
              ),
          ),
        )}
      {data.map(
        (d, i) =>
          mostrarEtiqueta(i) && (
            <text
              key={d.fecha}
              x={x(i)}
              y={H - 7}
              textAnchor="middle"
              className="fill-outline text-[10px]"
            >
              {d.fecha.slice(5)}
            </text>
          ),
      )}

      {hover && (
        <g pointerEvents="none">
          <line
            x1={hoverX}
            x2={hoverX}
            y1={0}
            y2={H - P}
            className="stroke-outline"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
          {ENCUESTA_SERIES.map((s) => (
            <circle
              key={s.key}
              cx={hoverX}
              cy={y(Number(hover[s.key] || 0))}
              r={3.5}
              className={`${s.fill} stroke-surface-container-lowest`}
              strokeWidth={1.5}
            />
          ))}
          <rect
            x={tooltipX}
            y={tooltipY}
            width={TOOLTIP_W}
            height={tooltipH}
            rx={6}
            className="fill-inverse-surface"
            opacity={0.95}
          />
          <text
            x={tooltipX + 10}
            y={tooltipY + 16}
            className="fill-inverse-on-surface text-[11px] font-semibold"
          >
            {hover.fecha}
          </text>
          {ENCUESTA_SERIES.map((s, i) => (
            <g key={s.key}>
              <circle
                cx={tooltipX + 12}
                cy={tooltipY + 30 + i * 16}
                r={3}
                className={s.fill}
              />
              <text
                x={tooltipX + 20}
                y={tooltipY + 34 + i * 16}
                className="fill-inverse-on-surface text-[10px]"
              >
                {s.label}: {nf(Number(hover[s.key] || 0))}
                {alertaCusum(hover, s.key) ? " ⚠" : ""}
              </text>
            </g>
          ))}
        </g>
      )}

      <rect
        x={0}
        y={0}
        width={W}
        height={H}
        fill="transparent"
        onMouseMove={moverHover}
        onMouseLeave={() => setHoverIdx(null)}
      />
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
          className="form-input-styled font-body-sm text-body-sm text-on-surface h-9 rounded-lg"
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
          className="flex items-center gap-1.5 px-space-md py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant text-body-sm font-body-sm transition-all"
          title={
            zoom
              ? "Quitar zoom (ajustar al ancho de la tarjeta)"
              : "Hacer zoom (arrastrar para desplazarse)"
          }
        >
          <Icon name={zoom ? "zoom_out" : "zoom_in"} className="text-[16px]" />
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
          {tooltip && <InfoTip {...tooltip} titulo={label} />}
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

/* ---------- NUEVO (ADITIVO): gráfico de barras "Servicios por hora del
   día", apilado por tipo de servicio (top 8 + "Otros", ver
   distribucion_horaria() en el backend -- el mismo orden/lista de tipos
   se repite en todas las horas, así cada tipo tiene siempre el mismo
   color). Con hover sobre un segmento se ve un tooltip (tipo, cantidad,
   % de esa hora), mismo lenguaje visual que EncuestaTrendSvg. ---------- */
const HOURLY_TIPO_COLORS = [
  "#3525cd",
  "#dc2626",
  "#f59e0b",
  "#059669",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
];
const HOURLY_OTROS_COLOR = "#6b7280";
function HourlyBarChart({
  data,
}: {
  data: {
    hora: number;
    servicios: number;
    por_tipo?: { tipo: string; cantidad: number }[];
  }[];
}) {
  const [hover, setHover] = useState<{
    horaIdx: number;
    segIdx: number;
  } | null>(null);
  if (!data.length)
    return (
      <div className="flex-1 min-h-[300px] flex items-center justify-center text-body-md font-body-md text-on-surface-variant">
        Sin datos
      </div>
    );
  const tipos = data[0]?.por_tipo?.map((t) => t.tipo) || [];
  const colorDe = (idx: number) =>
    tipos[idx] === "Otros"
      ? HOURLY_OTROS_COLOR
      : HOURLY_TIPO_COLORS[idx % HOURLY_TIPO_COLORS.length];
  const W = 1000,
    H = 320,
    PT = 34,
    PB = 26,
    PL = 30,
    n = data.length,
    max = Math.max(1, ...data.map((d) => d.servicios)),
    plotH = H - PT - PB,
    slot = (W - PL) / n,
    bw = slot * 0.55,
    barX = (i: number) => PL + i * slot + (slot - bw) / 2,
    barH = (v: number) => (v / max) * plotH;
  const TOOLTIP_W = 190,
    TOOLTIP_H = 54;
  const hoverDatum = hover ? data[hover.horaIdx] : null;
  const hoverSeg = hoverDatum?.por_tipo?.[hover!.segIdx];
  return (
    <div className="flex flex-col gap-sm">
    {tipos.length > 0 && (
      <div className="flex flex-wrap items-center gap-x-md gap-y-1 px-1">
        {tipos.map((tipo, idx) => (
          <span
            key={tipo}
            className="flex items-center gap-1.5 font-label-code text-label-code uppercase text-on-surface-variant"
          >
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: colorDe(idx) }}
            />
            {tipo}
          </span>
        ))}
      </div>
    )}
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full block"
      style={{ height: H }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line
            x1={PL}
            x2={W}
            y1={PT + (plotH - v * plotH)}
            y2={PT + (plotH - v * plotH)}
            className="stroke-outline-variant/30"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <text
            x="0"
            y={PT + (plotH - v * plotH) + 4}
            className="fill-outline text-[10px]"
          >
            {nf(Math.round(v * max))}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const segmentos = d.por_tipo && d.por_tipo.length ? d.por_tipo : [{ tipo: "", cantidad: d.servicios }];
        let acumulado = 0;
        const esColumnaActiva = hover?.horaIdx === i;
        return (
          <g key={d.hora}>
            {esColumnaActiva && (
              <rect
                x={barX(i) - (slot - bw) / 2}
                y={PT}
                width={slot}
                height={plotH}
                rx={4}
                className="fill-primary/10 stroke-primary/30"
                strokeWidth={1}
              />
            )}
            <text
              x={barX(i) + bw / 2}
              y={Math.max(12, PT + (plotH - barH(d.servicios)) - 6)}
              textAnchor="middle"
              className="fill-on-surface text-[11px] font-semibold"
            >
              {nf(d.servicios)}
            </text>
            {segmentos.map((seg, segIdx) => {
              const y0 = PT + (plotH - barH(acumulado + seg.cantidad));
              const h = barH(seg.cantidad);
              acumulado += seg.cantidad;
              if (seg.cantidad <= 0) return null;
              return (
                <rect
                  key={segIdx}
                  x={barX(i)}
                  y={y0}
                  width={bw}
                  height={h}
                  fill={colorDe(segIdx)}
                  onMouseEnter={() => setHover({ horaIdx: i, segIdx })}
                  onMouseLeave={() =>
                    setHover((h) =>
                      h && h.horaIdx === i && h.segIdx === segIdx ? null : h,
                    )
                  }
                />
              );
            })}
            <text
              x={barX(i) + bw / 2}
              y={H - 8}
              textAnchor="middle"
              className={
                esColumnaActiva
                  ? "fill-primary text-[10px] font-bold"
                  : "fill-outline text-[10px]"
              }
            >
              {String(d.hora).padStart(2, "0")}:00
            </text>
          </g>
        );
      })}
      {hover &&
        hoverDatum &&
        hoverSeg &&
        (() => {
          const total = hoverDatum.servicios || 1;
          const porcentaje = hoverSeg.cantidad / total;
          let tx = barX(hover.horaIdx) + bw / 2 - TOOLTIP_W / 2;
          tx = Math.max(4, Math.min(W - TOOLTIP_W - 4, tx));
          const ty = Math.max(
            4,
            PT + (plotH - barH(hoverDatum.servicios)) - TOOLTIP_H - 10,
          );
          return (
            <g className="pointer-events-none">
              <rect
                x={tx}
                y={ty}
                width={TOOLTIP_W}
                height={TOOLTIP_H}
                rx={6}
                className="fill-inverse-surface"
                opacity={0.95}
              />
              <text
                x={tx + 10}
                y={ty + 18}
                className="fill-inverse-on-surface text-[11px] font-semibold"
              >
                {hoverSeg.tipo || "Servicio"}
              </text>
              <text
                x={tx + 10}
                y={ty + 34}
                className="fill-inverse-on-surface text-[10px]"
              >
                {nf(hoverSeg.cantidad)} servicios
              </text>
              <text
                x={tx + 10}
                y={ty + 48}
                className="fill-inverse-on-surface text-[10px]"
              >
                {pct(porcentaje)} de esa hora
              </text>
            </g>
          );
        })()}
    </svg>
    </div>
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
        {tooltip && <InfoTip {...tooltip} titulo={label} />}
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
      // "muestra_insuficiente": a propósito no se muestra ninguna
      // recomendación -- no hay datos suficientes para sugerir nada.
      return "";
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
            {alertas?.calidad_datos_alerta && (
              <div className="p-md flex flex-col gap-2 border-t border-outline-variant/20">
                <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wide">
                  Calidad de datos cayendo
                </span>
                <button
                  type="button"
                  onClick={() => irA("metrics")}
                  className="text-left flex items-center justify-between gap-2 bg-[#f59e0b]/5 hover:bg-[#f59e0b]/10 rounded-lg px-sm py-2 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-body-md text-body-md font-medium text-on-surface truncate">
                      Trazabilidad completa de los servicios
                    </div>
                    <div className="font-label-sm text-label-sm text-on-surface-variant">
                      {pct(alertas.calidad_datos_alerta.trazabilidad_mes_anterior)} →{" "}
                      {pct(alertas.calidad_datos_alerta.trazabilidad_mes_actual)} (
                      {alertas.calidad_datos_alerta.variacion_pp} pp)
                    </div>
                  </div>
                  <Icon name="report" className="text-[#f59e0b] shrink-0" />
                </button>
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
          Operativa y Cargar reportes) hay 7 filtros: <b>Desde</b> /{" "}
          <b>Hasta</b> (rango de fechas), <b>Campañas</b>, <b>Prestadores</b>
          , <b>Estados</b>, <b>Tipo de servicio</b>, <b>Tipo de póliza</b> y{" "}
          <b>Provincia de origen</b>. Estos 7 filtros mandan en toda la
          plataforma — cada indicador que ves ya está calculado solo sobre
          los servicios que cumplen lo que seleccionaste ahí arriba.
        </p>
        <p>
          <b>
            Estado, Tipo de servicio, Tipo de póliza y Provincia de origen son
            100% manuales
          </b>
          : si no elegís nada en esos, se incluyen TODOS los valores — igual
          que si en Excel no filtraras esa columna. No hay ningún filtro
          escondido aplicándose sin que lo elijas vos. <b>Tipo de póliza</b>{" "}
          agrupa los servicios por tipo de cobertura (Vehículos, AP, Hogar,
          Viajeros) a partir del Tipo de servicio — es un dato temporal
          mientras la plataforma se conecta a la base de datos de la
          empresa. <b>Provincia de origen</b> viene de un archivo separado
          (el de despachador, cruzado por número de servicio) y solo cubre
          los servicios que matchearon con ese archivo — el resto queda sin
          clasificar hasta que se suba un archivo que los incluya.
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
          categoría. Más abajo aparece una tabla comparativa con todos.
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
    // NUEVO v4.24.0 (ADITIVO): opciones del filtro global "Tipo de poliza".
    [polizaOptions, setPolizaOptions] = useState<PolizaOption[]>([]),
    // NUEVO v4.26.0 (ADITIVO): opciones del filtro global "Provincia de origen".
    [provinciaOptions, setProvinciaOptions] = useState<ProvinciaOption[]>([]),
    [trend, setTrend] = useState<TrendPoint[]>([]),
    // NUEVO (ADITIVO): indicador de "ENCUESTA FINAL" / "ENCUESTA PENDIENTE".
    [estadosEncuesta, setEstadosEncuesta] = useState<EstadosEncuesta | null>(
      null,
    ),
    // NUEVO (ADITIVO): cuantas encuestas DEBIERON enviarse (servicios
    // finalizados de companias con encuesta automatica habilitada) vs
    // cuantas se enviaron -- numero exacto, no una estimacion estadistica.
    [coberturaEncuestas, setCoberturaEncuestas] =
      useState<CoberturaEncuestas | null>(null),
    // NUEVO (ADITIVO): filtro de compañía propio de la sección
    // "Cobertura de encuestas automáticas" -- independiente de los
    // filtros globales del resto del dashboard, "" == todas.
    [coberturaCompania, setCoberturaCompania] = useState(""),
    [quality, setQuality] = useState<DataQuality | null>(null),
    [funnel, setFunnel] = useState<FunnelTiempos | null>(null),
    [estadosCategorizados, setEstadosCategorizados] =
      useState<EstadosCategorizados | null>(null),
    [trazabilidad, setTrazabilidad] = useState<Trazabilidad | null>(null),
    // NUEVO v4.25.0 (Poka-Yoke, ADITIVO): valores imposibles detectados.
    [anomalias, setAnomalias] = useState<Anomalias | null>(null),
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
    // NUEVO (ADITIVO): filtro rápido por categoría en Detalle por
    // prestador -- sobre los mismos campos que ya trae cada fila
    // (cumplimiento_demora, total_general), sin pedir nada nuevo al
    // backend.
    [providerQuickFilter, setProviderQuickFilter] = useState<
      "all" | "cumplen" | "alerta" | "alta"
    >("all"),
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
    // NUEVO (ADITIVO): búsqueda + tabs de clasificación en "Comparativa
    // entre prestadores" -- filtran la misma lista que ya trae
    // /api/inteligencia/prestadores, sin pedir nada nuevo al backend.
    [inteligenciaSearch, setInteligenciaSearch] = useState(""),
    [inteligenciaFilter, setInteligenciaFilter] = useState<Clasificacion | "todos">(
      "todos",
    ),
    // NUEVO (ADITIVO): grupos colapsables en "Métricas de Trackeo" --
    // puramente visual (qué secciones se muestran), no toca ningún
    // cálculo ni pide nada nuevo al backend.
    [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
      resumen: true,
      encuestas: true,
      calidad: true,
      tiempos: true,
      asignacion: true,
      outliers: true,
    }),
    [modalClasificacion, setModalClasificacion] =
      useState<Clasificacion | null>(null),
    // NUEVO (ADITIVO): detalle de IDs al hacer clic en las tarjetas de
    // "Cobertura de encuestas automáticas".
    [modalCobertura, setModalCobertura] = useState<
      "esperadas" | "enviadas" | "faltantes" | null
    >(null),
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
    const r = await runInBatches([
      () => api.trackeoResumen(f),
      () => api.trackeoUniversos(f),
      () => api.trackeoPrestadores(f),
      () => api.trackeoCampanas(f),
      () => api.trackeoListaPrestadores(f),
      () => api.trackeoEstados(f),
      () => api.trackeoTendencia(f),
      () => api.trackeoCalidadDatos(f),
      () => api.trackeoCampanaPrestador(f),
      () => api.trackeoTiposServicio(f),
      () => api.trackeoImpactoCampanas(f),
      () => api.trackeoEstadosCategorizados(f),
      () => api.trackeoHabilitadoresAsignacion(f),
      () => api.trackeoProgramadosFunnel(f),
      () => api.trackeoOutliers(f),
      () => api.trackeoTiposPoliza(f),
      () => api.trackeoProvinciasOrigen(f),
      () => api.trackeoEstadosEncuesta(f),
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
    take<{
      calidad: DataQuality;
      trazabilidad: Trazabilidad;
      anomalias: Anomalias;
    }>(7, (x) => {
      setQuality(x.calidad);
      setTrazabilidad(x.trazabilidad);
      setAnomalias(x.anomalias);
    });
    take<{ resultados: CampanaPrestadorMetric[] }>(8, (x) =>
      setCross(x.resultados),
    );
    take<{ tipos: TipoOption[] }>(9, (x) => setTypes(x.tipos));
    take<{ campanas: CampanaImpacto[] }>(10, (x) =>
      setCampanaImpacto(x.campanas),
    );
    take<EstadosCategorizados>(11, (x) => setEstadosCategorizados(x));
    take<HabilitadoresAsignacion>(12, (x) => setHabilitadores(x));
    take<ProgramadosFunnel>(13, (x) => setProgramadosFunnel(x));
    take<Outliers>(14, (x) => setOutliers(x));
    take<{ tipos_poliza: PolizaOption[] }>(15, (x) =>
      setPolizaOptions(x.tipos_poliza),
    );
    take<{ provincias: ProvinciaOption[] }>(16, (x) =>
      setProvinciaOptions(x.provincias),
    );
    take<EstadosEncuesta>(17, (x) => setEstadosEncuesta(x));
    // NUEVO (ADITIVO): las 18 llamadas de arriba van en paralelo -- si el
    // backend está caído (dormido en Render, o a mitad de un redeploy),
    // fallan casi todas con el mismo mensaje. Antes se mostraban las 18
    // repetidas una al lado de la otra; ahora se agrupan por mensaje
    // (con un contador) para que se pueda leer.
    if (errs.length) {
      const conteo = new Map<string, number>();
      for (const e of errs) conteo.set(e, (conteo.get(e) || 0) + 1);
      setError(
        [...conteo.entries()]
          .map(([msg, n]) => (n > 1 ? `${msg} (×${n})` : msg))
          .join(" | "),
      );
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    load(filters);
  }, [filters, load]);
  useEffect(() => {
    // NUEVO (ADITIVO): efecto independiente del batch grande de arriba
    // -- así el selector de compañía de "Cobertura de encuestas
    // automáticas" no dispara una recarga de todo el dashboard, solo
    // re-pide este indicador puntual. Sigue reaccionando a los filtros
    // globales de fecha (via `filters`) además de al filtro local de
    // compañía.
    let cancelado = false;
    api
      .trackeoCoberturaEncuestas(filters, coberturaCompania || null)
      .then((x) => {
        if (!cancelado) setCoberturaEncuestas(x);
      })
      .catch(() => {
        /* el error general ya se reporta desde load() */
      });
    return () => {
      cancelado = true;
    };
  }, [filters, coberturaCompania]);
  useEffect(() => {
    // NUEVO (ADITIVO): efecto independiente del batch grande de arriba
    // -- así "excluir_programados" (ahora un filtro global más, ver
    // DEFAULT) no dispara una recarga de todo el dashboard, solo
    // re-pide funnel-tiempos (que incluye tiempos T1-T6, sla_despacho,
    // sla_llegada y distribucion_horaria juntos, por eso se reemplaza
    // el objeto `funnel` completo).
    let cancelado = false;
    api
      .trackeoFunnelTiempos(filters)
      .then((x) => {
        if (!cancelado) setFunnel(x);
      })
      .catch(() => {
        /* el error general ya se reporta desde load() */
      });
    return () => {
      cancelado = true;
    };
  }, [filters]);
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
      excluir_outliers: String(filters.excluir_outliers),
      excluir_programados: String(filters.excluir_programados),
    });
    filters.campanas.forEach((x) => p.append("campana", x));
    filters.prestador_ids.forEach((x) => p.append("prestador_id", x));
    filters.estados.forEach((x) => p.append("estado", x));
    filters.tipos.forEach((x) => p.append("tipo", x));
    filters.polizas.forEach((x) => p.append("poliza", x));
    filters.provincias_origen.forEach((x) => p.append("provincia_origen", x));
    history.replaceState(null, "", `?${p}`);
  }, [filters, page]);
  const campOpts = campaigns.map((x) => ({
      // CORREGIDO (ADITIVO): antes usaba `x.campana` (crudo) como value,
      // a diferencia de TODOS los demas filtros (estado_normalizado,
      // tipo_normalizado, etc.), que ya usaban el campo normalizado.
      // El backend compara contra `campana_normalizada` (sin acentos),
      // pero `normalize_text()` del lado del filtro NO saca acentos --
      // asi que cualquier campaña con tilde (o, como en este caso
      // puntual, con un caracter corrupto por un problema de encoding
      // en el Excel de origen) nunca podia matchear y devolvia 0
      // resultados pese a que el backend SI tenia los datos.
      value: x.campana_normalizada || x.campana,
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
    // NUEVO v4.24.0 (ADITIVO): opciones del filtro global "Tipo de poliza".
    polizaOpts = polizaOptions.map((x) => ({
      value: x.tipo_poliza_normalizado,
      label: `${x.tipo_poliza} (${nf(x.cantidad)})`,
    })),
    // NUEVO v4.26.0 (ADITIVO): opciones del filtro global "Provincia de origen".
    provinciaOpts = provinciaOptions.map((x) => ({
      value: x.provincia_origen_normalizada,
      label: `${x.provincia_origen} (${nf(x.cantidad)})`,
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
  );
  const filteredProviders = providers
      .filter((x) =>
        x.prestador.toLowerCase().includes(providerSearch.toLowerCase()),
      )
      .filter((x) => {
        if (providerQuickFilter === "cumplen")
          return (x.cumplimiento_demora ?? 0) > 0.8;
        if (providerQuickFilter === "alerta")
          return (x.cumplimiento_demora ?? 1) < 0.7;
        if (providerQuickFilter === "alta") return x.total_general > 200;
        return true;
      }),
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
      (inteligencia?.prestadores || [])
        .filter((p) =>
          inteligenciaFilter === "todos" ? true : p.clasificacion === inteligenciaFilter,
        )
        .filter((p) =>
          p.prestador.toLowerCase().includes(inteligenciaSearch.toLowerCase()),
        ),
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
  // NUEVO (ADITIVO): tarjetas KPI de "Detalle por prestador" -- todas
  // derivadas de la misma lista `providers` que ya trae la tabla
  // (respeta los filtros globales, no la búsqueda ni el filtro rápido
  // locales), sin pedir nada nuevo al backend.
  const providerStats = useMemo(() => {
    const cumplidos = providers.reduce((a, x) => a + (x.servicios_cumplidos || 0), 0);
    const noCumplidos = providers.reduce(
      (a, x) => a + (x.servicios_no_cumplidos || 0),
      0,
    );
    const conCalidad = providers.filter((x) => x.indice_calidad_datos != null);
    const conTrazabilidad = providers.filter(
      (x) => x.porcentaje_trazabilidad_completa != null,
    );
    const lider = providers.reduce<PrestadorMetric | null>((best, x) => {
      if (x.score_ranking == null) return best;
      if (!best || (best.score_ranking ?? -1) < x.score_ranking) return x;
      return best;
    }, null);
    return {
      total: providers.length,
      cumplimientoPromedio:
        cumplidos + noCumplidos > 0 ? cumplidos / (cumplidos + noCumplidos) : null,
      indiceCalidadMedio: conCalidad.length
        ? conCalidad.reduce((a, x) => a + (x.indice_calidad_datos || 0), 0) /
          conCalidad.length
        : null,
      trazabilidadPromedio: conTrazabilidad.length
        ? conTrazabilidad.reduce(
            (a, x) => a + (x.porcentaje_trazabilidad_completa || 0),
            0,
          ) / conTrazabilidad.length
        : null,
      lider,
    };
  }, [providers]);
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
        <nav className="fixed left-0 top-0 h-screen w-sidebar-width z-50 flex flex-col justify-between py-space-lg bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col gap-space-lg px-space-md">
            <div className="flex items-center gap-space-sm px-space-xs">
              <Logo className="w-9 h-9 shrink-0" />
              <div className="flex flex-col">
                <span className="font-headline-md text-headline-md tracking-tight text-on-surface">
                  Reportería
                </span>
                <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                  Prestadores
                </span>
              </div>
            </div>
            <nav className="flex flex-col gap-space-xs">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.page}
                  type="button"
                  aria-current={page === item.page ? "page" : undefined}
                  onClick={() => setPage(item.page)}
                  className={`px-space-sm py-space-sm rounded-lg flex items-center gap-space-sm text-left transition-all ${
                    page === item.page
                      ? "bg-primary-container text-on-primary font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
                      : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                  }`}
                >
                  <Icon name={item.icon} className="text-[19px]" filled={page === item.page} />
                  <span className="font-body-md text-body-md">{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
          <div className="px-space-md flex flex-col gap-space-sm">
            <div className="flex items-center justify-between px-space-xs font-body-sm text-body-sm text-on-surface-variant">
              <span className="flex items-center gap-space-xs">
                <Icon name="dns" className="text-[16px]" />
                Backend v{backend.version}
              </span>
              <span
                className={`font-label-code text-label-code font-semibold ${backend.ok ? "text-primary" : "text-error"}`}
              >
                {backend.ok ? "Conectado" : "Sin conexión"}
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
              <section className="sticky top-0 z-30 bg-surface/90 backdrop-blur-xl rounded-xl shadow-md p-space-md flex flex-col gap-space-sm">
                <div className="flex flex-wrap items-center justify-between gap-space-md">
                  <div className="flex items-center gap-space-md">
                    {page === "metrics" && (
                      <div className="flex flex-col">
                        <span className="font-label-caps text-label-caps text-primary tracking-wider uppercase">
                          Panel Telemetría Activa
                        </span>
                        <h2 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">
                          Métricas de Trackeo
                        </h2>
                      </div>
                    )}
                    {page === "providers" && (
                      <h2 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight flex items-center gap-2">
                        <Icon name="person_search" className="text-primary text-[24px]" filled />
                        Detalle por prestador
                      </h2>
                    )}
                    {page === "cross" && (
                      <h2 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight flex items-center gap-2">
                        <Icon name="campaign" className="text-primary text-[24px]" filled />
                        Campaña × prestador
                      </h2>
                    )}
                    <div className="hidden sm:flex items-center gap-1.5 px-space-sm py-1 rounded-full bg-surface-container-high text-on-surface font-label-code text-label-code">
                      <span
                        className={`w-2 h-2 rounded-full ${backend.ok ? "bg-primary animate-pulse" : "bg-error"}`}
                      />
                      <span className="text-on-surface font-medium">
                        {backend.ok ? "En vivo" : "Sin conexión"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-space-xs">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-space-md py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant text-body-sm font-body-sm transition-all"
                      onClick={() => {
                        setDraft(DEFAULT);
                        setFilters(DEFAULT);
                      }}
                    >
                      <Icon name="restart_alt" className="text-[16px]" />
                      Restablecer
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-space-md py-1.5 rounded-lg bg-primary text-on-primary font-headline-md text-body-sm shadow-sm hover:opacity-95 active:scale-95 transition-all"
                      onClick={() => setFilters({ ...draft })}
                    >
                      {loading ? (
                        <Spinner className="text-[16px]" />
                      ) : (
                        <Icon name="tune" className="text-[16px]" />
                      )}
                      Aplicar filtros
                    </button>
                    {page === "metrics" && (
                      <ExportButton
                        label="Exportar"
                        className="flex items-center gap-1.5 px-space-md py-1.5 rounded-lg bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface-container-low text-body-sm font-body-sm transition-all"
                        rows={() =>
                          summary ? [summary as unknown as Record<string, unknown>] : []
                        }
                        fileBaseName="resumen-trackeo"
                        pdfTitle="Resumen de métricas de trackeo"
                      />
                    )}
                    {page === "metrics" && (
                      <button
                        type="button"
                        className="flex items-center gap-1.5 px-space-md py-1.5 rounded-lg bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface-container-low text-body-sm font-body-sm transition-all"
                        onClick={() => {
                          const todoAbierto = Object.values(openGroups).every(Boolean);
                          setOpenGroups({
                            resumen: !todoAbierto,
                            encuestas: !todoAbierto,
                            calidad: !todoAbierto,
                            tiempos: !todoAbierto,
                            asignacion: !todoAbierto,
                            outliers: !todoAbierto,
                          });
                        }}
                      >
                        <Icon
                          name={
                            Object.values(openGroups).every(Boolean)
                              ? "unfold_less"
                              : "unfold_more"
                          }
                          className="text-[16px]"
                        />
                        {Object.values(openGroups).every(Boolean)
                          ? "Colapsar todo"
                          : "Expandir todo"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-space-xs pt-space-xs">
                  <DateRangePicker
                    desde={draft.fecha_desde}
                    hasta={draft.fecha_hasta}
                    onChange={(fecha_desde, fecha_hasta) =>
                      setDraft({ ...draft, fecha_desde, fecha_hasta })
                    }
                  />
                  <MultiSelect
                    icon={<Icon name="hub" className="text-secondary text-[17px]" />}
                    label="Campañas"
                    values={draft.campanas}
                    options={campOpts}
                    placeholder="Todas las campañas"
                    onChange={(campanas) => setDraft({ ...draft, campanas })}
                  />
                  <MultiSelect
                    icon={<Icon name="local_shipping" className="text-secondary text-[17px]" />}
                    label="Prestadores"
                    values={draft.prestador_ids}
                    options={provOpts}
                    placeholder="Todos los prestadores"
                    onChange={(prestador_ids) =>
                      setDraft({ ...draft, prestador_ids })
                    }
                  />
                  <MultiSelect
                    icon={<Icon name="rule" className="text-primary text-[17px]" />}
                    label="Estados"
                    values={draft.estados}
                    options={stateOpts}
                    placeholder="Todos"
                    onChange={(estados) => setDraft({ ...draft, estados })}
                  />
                  <MultiSelect
                    icon={<Icon name="category" className="text-primary text-[17px]" />}
                    label="Tipo servicio"
                    values={draft.tipos}
                    options={typeOpts}
                    placeholder="Todos los tipos"
                    onChange={(tipos) => setDraft({ ...draft, tipos })}
                  />
                  <MultiSelect
                    icon={<Icon name="policy" className="text-on-surface-variant text-[17px]" />}
                    label="Tipo de póliza"
                    values={draft.polizas}
                    options={polizaOpts}
                    placeholder="Todas las pólizas"
                    onChange={(polizas) => setDraft({ ...draft, polizas })}
                  />
                  <MultiSelect
                    icon={<Icon name="place" className="text-on-surface-variant text-[17px]" />}
                    label="Provincia de origen"
                    values={draft.provincias_origen}
                    options={provinciaOpts}
                    placeholder="Todas las provincias"
                    onChange={(provincias_origen) =>
                      setDraft({ ...draft, provincias_origen })
                    }
                  />
                  {/* NUEVO (ADITIVO): checkbox global "excluir outliers" --
                      saca de todos los cálculos de cumplimiento/demora y
                      tiempos del funnel los servicios marcados como outliers
                      en "Outliers por tramo" (>3x el P90 de su propio tramo),
                      sin tocar esa tabla (que sigue mostrando todos, para
                      poder auditar). Arranca activado por defecto. */}
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({ ...draft, excluir_outliers: !draft.excluir_outliers })
                    }
                    title="Excluye de los cálculos (cumplimiento de demora, tiempos del funnel, tendencia, etc.) los servicios marcados como outliers -- la tabla 'Outliers por tramo' siempre los sigue mostrando a todos."
                    className={`flex items-center gap-1.5 px-space-sm py-1.5 rounded-lg shadow-sm text-body-sm font-body-sm cursor-pointer transition-colors ${
                      draft.excluir_outliers
                        ? "bg-surface-container-highest text-on-surface hover:bg-surface-container-high"
                        : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low"
                    }`}
                  >
                    <Icon
                      name={draft.excluir_outliers ? "check_box" : "check_box_outline_blank"}
                      className={`text-[17px] ${draft.excluir_outliers ? "text-primary" : ""}`}
                    />
                    Excluir outliers
                  </button>
                  {/* NUEVO (ADITIVO): checkbox global "excluir programados" --
                      reemplaza los dos checkboxes locales que antes vivían en
                      "Tiempos del prestador" y "SLA de llegada" (cada uno con
                      su propio estado, ahora unificados en un solo filtro
                      global). Saca los servicios con EsProgramado=Sí de T4,
                      T6 y SLA de llegada, dentro de "Tiempos, campañas y
                      estados". Arranca activado, mismo comportamiento que
                      tenían ambos checkboxes por defecto (sin tildar). */}
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        excluir_programados: !draft.excluir_programados,
                      })
                    }
                    title="Excluye los servicios programados (EsProgramado=Sí) de 'Cuánto tarda en llegar', 'Cuánto dura todo el proceso' y 'SLA de llegada', dentro de Tiempos, campañas y estados -- para un servicio programado esos tiempos se miden contra la fecha/hora pactada, no contra una urgencia, y distorsionan el indicador."
                    className={`flex items-center gap-1.5 px-space-sm py-1.5 rounded-lg shadow-sm text-body-sm font-body-sm cursor-pointer transition-colors ${
                      draft.excluir_programados
                        ? "bg-surface-container-highest text-on-surface hover:bg-surface-container-high"
                        : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low"
                    }`}
                  >
                    <Icon
                      name={draft.excluir_programados ? "check_box" : "check_box_outline_blank"}
                      className={`text-[17px] ${draft.excluir_programados ? "text-primary" : ""}`}
                    />
                    Excluir programados
                  </button>
                </div>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  Estado, Tipo de servicio, Tipo de póliza y Provincia de origen
                  100% manuales. Sin selección se incluyen todos los valores,
                  igual que sin filtrar esa columna en Excel. Provincia de
                  origen solo cubre los servicios cruzados con el archivo de
                  despachador. "Excluir outliers" saca de los cálculos los
                  servicios marcados en "Outliers por tramo" (&gt;3× el P90 de
                  su propio tramo) — la tabla de outliers siempre los muestra
                  a todos, sin importar este check. "Excluir programados" saca
                  los servicios con EsProgramado=Sí de "Cuánto tarda en
                  llegar", "Cuánto dura todo el proceso" y "SLA de llegada".
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
                <CollapsibleGroup
                  title="Resumen general"
                  icon="dashboard"
                  open={openGroups.resumen}
                  onToggle={() =>
                    setOpenGroups({ ...openGroups, resumen: !openGroups.resumen })
                  }
                >
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
                      progress={pctOf(universes?.servicios_vehiculares, universes?.servicios_cargados)}
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
                      progress={pctOf(universes?.servicios_evaluables, universes?.servicios_vehiculares)}
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
                      progress={pctOf(universes?.servicios_cancelados, universes?.servicios_vehiculares)}
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
                      progress={pctOf(universes?.servicios_no_finalizados, universes?.servicios_vehiculares)}
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
                    <div className="bg-surface-container-lowest rounded-xl p-space-lg card-shadow border border-outline-variant/20 flex flex-col divide-y divide-outline-variant/15">
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
                        progress={ratioPct(summary?.uso_enviador)}
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
                        progress={ratioPct(summary?.efectividad_enviador)}
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
                        progress={ratioPct(summary?.no_asigna_movil_porcentaje)}
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
                        progress={ratioPct(summary?.programados_porcentaje)}
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
                        progress={
                          (summary?.servicios_evaluados_demora ?? 0) > 0
                            ? ratioPct(summary?.cumplimiento_demora)
                            : undefined
                        }
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
                        progress={
                          (summary?.servicios_evaluados_demora_trazable ?? 0) > 0
                            ? ratioPct(summary?.cumplimiento_demora_trazable)
                            : undefined
                        }
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
                        progress={ratioPct(summary?.cobertura_medicion_demora)}
                        tooltip={{
                          leer: "Qué % del universo filtrado tiene los datos completos como para medir su cumplimiento de verdad. Si es bajo, los dos indicadores anteriores hay que leerlos con pinzas.",
                          calculo: "Filas con DemoraPrometida y DemoraReal cargadas ÷ total del universo filtrado.",
                        }}
                      />
                    </div>
                  </div>
                </section>
                </CollapsibleGroup>

                <CollapsibleGroup
                  title="Encuestas"
                  icon="forum"
                  open={openGroups.encuestas}
                  onToggle={() =>
                    setOpenGroups({ ...openGroups, encuestas: !openGroups.encuestas })
                  }
                >
                {/* ---------- NUEVO (ADITIVO): Encuesta post-servicio ---------- */}
                <section className="flex flex-col gap-sm">
                  <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs">
                    Encuesta post-servicio
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-md pt-xs">
                    <Card
                      icon={<Icon name="fact_check" filled />}
                      title="Promedio diario · Encuesta final"
                      value={nf(estadosEncuesta?.promedios_diarios.encuesta_final)}
                      detail={`${nf(estadosEncuesta?.totales.encuesta_final)} servicios en total · ${nf(estadosEncuesta?.dias_en_rango)} días en el rango`}
                      tooltip={{
                        leer: "Cuántos servicios, en promedio por día, están en el estado 'ENCUESTA FINAL' dentro del período filtrado.",
                        calculo: "Total de servicios con estado = 'ENCUESTA FINAL' ÷ cantidad de días del rango (Desde-Hasta inclusive).",
                      }}
                    />
                    <Card
                      icon={<Icon name="hourglass_empty" filled />}
                      title="Promedio diario · Encuesta pendiente"
                      value={nf(estadosEncuesta?.promedios_diarios.encuesta_pendiente)}
                      detail={`${nf(estadosEncuesta?.totales.encuesta_pendiente)} servicios en total · ${nf(estadosEncuesta?.dias_en_rango)} días en el rango`}
                      tone="amber"
                      tooltip={{
                        leer: "Cuántos servicios, en promedio por día, están en el estado 'ENCUESTA PENDIENTE' dentro del período filtrado.",
                        calculo: "Total de servicios con estado = 'ENCUESTA PENDIENTE' ÷ cantidad de días del rango (Desde-Hasta inclusive).",
                      }}
                    />
                  </div>
                  <div className="bg-surface-container-lowest rounded-xl p-md card-shadow border border-outline-variant/20 flex flex-col gap-md">
                    <div className="flex items-center gap-4 flex-wrap">
                      {ENCUESTA_SERIES.map((s) => {
                        const l = estadosEncuesta?.limites_control?.[s.key];
                        return (
                          <div key={s.key} className="flex items-center gap-2">
                            <div
                              className={`w-3 h-3 rounded-full ${s.fill}`}
                            />
                            <span className="font-label-md text-label-md text-on-surface-variant">
                              {s.label}
                              {l && (
                                <span className="text-on-surface-variant/70">
                                  {" "}
                                  · Media {nf(l.media)} · σ {nf(l.desvio)}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                      <span className="flex items-center gap-1 text-label-sm font-label-sm text-on-surface-variant/70">
                        <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-red-500" />
                        Caída fuera de lo esperado
                      </span>
                    </div>
                    <EncuestaTrendSvg
                      data={estadosEncuesta?.serie_diaria ?? []}
                      limites={estadosEncuesta?.limites_control}
                      width={900}
                      height={260}
                    />
                  </div>
                </section>

                {/* ---------- NUEVO (ADITIVO): Cobertura real de encuestas
                   -- cuantas DEBIERON enviarse (servicios finalizados de
                   companias con encuesta automatica habilitada) vs cuantas
                   se enviaron. Numero exacto, no una estimacion
                   estadistica -- posible porque se confirmo empiricamente
                   que "SERVICIO FINALIZADO" dispara la encuesta automatica
                   en 1-2 segundos, en el 99%+ de los casos. ---------- */}
                <section className="flex flex-col gap-sm">
                  <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                    Cobertura de encuestas automáticas
                    <InfoTip
                      titulo="Cobertura de encuestas automáticas"
                      leer="De los servicios que debieron disparar la encuesta automática (se finalizaron, en una compañía con la función habilitada), cuántos efectivamente la recibieron."
                      calculo="Esperadas = servicios finalizados en el rango filtrado, de las compañías con encuesta automática confirmada. Enviadas = encuestas reales registradas en ese mismo rango. Faltantes = Esperadas − Enviadas."
                    />
                  </h3>
                  <p className="font-label-sm text-label-sm text-on-surface-variant -mt-2">
                    Compañías con encuesta habilitada: {(coberturaEncuestas?.companias_incluidas ?? []).join(", ") || "—"}
                    {" "}— este filtro es propio de esta sección y no afecta al resto del dashboard.
                  </p>
                  <div className="flex items-center gap-sm">
                    <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="cobertura-compania">
                      Compañía
                    </label>
                    <select
                      id="cobertura-compania"
                      className="form-input-styled font-body-md text-body-md text-on-surface h-9"
                      value={coberturaCompania}
                      onChange={(e) => setCoberturaCompania(e.target.value)}
                    >
                      <option value="">Todas</option>
                      {(coberturaEncuestas?.companias_incluidas ?? []).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  {coberturaCompania && (
                    <p className="font-label-sm text-label-sm text-on-surface-variant -mt-1">
                      "Debieron enviarse" solo refleja esta compañía en los archivos de Ficha de Seguimiento cargados desde el 2026-09-15 en adelante (antes de esa fecha ese dato no distinguía compañía real).
                    </p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-md pt-xs">
                    <Card
                      icon={<Icon name="task_alt" filled />}
                      title="Debieron enviarse"
                      value={nf(coberturaEncuestas?.totales.esperadas)}
                      detail="Servicios finalizados en el rango filtrado"
                      onClick={() => setModalCobertura("esperadas")}
                      linkText="Ver servicios"
                    />
                    <Card
                      icon={<Icon name="send" filled />}
                      title="Se enviaron"
                      value={nf(coberturaEncuestas?.totales.enviadas)}
                      detail="Encuestas reales registradas"
                      onClick={() => setModalCobertura("enviadas")}
                      linkText="Ver servicios"
                    />
                    <Card
                      icon={<Icon name="report" filled />}
                      title="Faltantes"
                      value={nf(coberturaEncuestas?.totales.faltantes)}
                      detail="Esperadas − Enviadas"
                      tone={
                        (coberturaEncuestas?.totales.faltantes ?? 0) > 0
                          ? "amber"
                          : undefined
                      }
                      onClick={() => setModalCobertura("faltantes")}
                      linkText="Ver servicios"
                    />
                    <Card
                      icon={<Icon name="percent" filled />}
                      title="Cobertura"
                      value={
                        coberturaEncuestas?.totales.cobertura_pct == null
                          ? "—"
                          : `${nf(coberturaEncuestas.totales.cobertura_pct)} %`
                      }
                      detail="Enviadas ÷ Esperadas"
                    />
                  </div>
                  {(coberturaEncuestas?.serie_diaria ?? []).some(
                    (p) => p.faltantes > 0,
                  ) && (
                    <div className="bg-surface-container-lowest rounded-xl p-md card-shadow border border-outline-variant/20">
                      <p className="font-label-md text-label-md text-on-surface-variant mb-2">
                        Días con encuestas faltantes:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(coberturaEncuestas?.serie_diaria ?? [])
                          .filter((p) => p.faltantes > 0)
                          .map((p) => (
                            <span
                              key={p.fecha}
                              title={`IdOrdenDeServicio sin encuesta: ${p.ids_faltantes.join(", ")}`}
                              className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/30 px-3 py-1 text-label-sm font-label-sm text-on-surface cursor-help"
                            >
                              {p.fecha}
                              <b>−{nf(p.faltantes)}</b>
                              <span className="text-on-surface-variant/70">
                                ({nf(p.enviadas)}/{nf(p.esperadas)})
                              </span>
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                </section>
                </CollapsibleGroup>

                <CollapsibleGroup
                  title="Calidad de datos"
                  icon="verified"
                  open={openGroups.calidad}
                  onToggle={() =>
                    setOpenGroups({ ...openGroups, calidad: !openGroups.calidad })
                  }
                >
                {/* ---------- Distribución + Calidad ---------- */}
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
                  <div className="flex flex-col gap-sm">
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                      Distribución de servicios cumplidos
                      <InfoTip
                        titulo="Distribución de servicios cumplidos"
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
                          color="#3525cd"
                          onClick={() => open(m, label)}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-sm">
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                      Calidad de información
                      <InfoTip
                        titulo="Calidad de información"
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

                {/* ---------- NUEVO v4.25.0 (Poka-Yoke, ADITIVO): valores
                    estructuralmente imposibles -- no "muy altos" (eso ya
                    lo cubre Outliers), sino matemáticamente inválidos:
                    demoras negativas y eventos fuera de orden
                    cronológico. ---------- */}
                {anomalias && anomalias.total > 0 && (
                  <section className="flex flex-col gap-sm">
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                      Anomalías detectadas
                      <InfoTip
                        titulo="Anomalías detectadas"
                        leer="Valores que no deberían poder existir sin importar el umbral: demoras negativas o eventos registrados fuera de orden (ej. 'Finaliza' antes que 'Llega'). Señal de un problema en la captura de datos, no en la performance del prestador."
                        calculo="Filas con DemoraReal o DemoraPrometida < 0, o con la resta entre dos marcas horarias consecutivas dando negativo."
                      />
                    </h3>
                    <p className="font-label-sm text-label-sm text-on-surface-variant -mt-2">
                      {nf(anomalias.servicios_con_alguna_anomalia)} de{" "}
                      {nf(anomalias.total)} servicios (
                      {pct(anomalias.porcentaje_servicios_con_alguna_anomalia)})
                      con al menos una anomalía.
                    </p>
                    <div className="bg-surface-container-lowest rounded-xl p-md card-shadow border border-outline-variant/20 flex flex-col gap-4">
                      {anomalias.demora_real_negativa > 0 && (
                        <ProgressBar
                          label="Demora real negativa"
                          valueLabel={nf(anomalias.demora_real_negativa)}
                          ratio={anomalias.demora_real_negativa / anomalias.total}
                          color="#dc2626"
                          onClick={() =>
                            open(
                              "ANOMALIA_DEMORA_REAL_NEGATIVA",
                              "Demora real negativa",
                            )
                          }
                        />
                      )}
                      {anomalias.demora_prometida_negativa > 0 && (
                        <ProgressBar
                          label="Demora prometida negativa"
                          valueLabel={nf(anomalias.demora_prometida_negativa)}
                          ratio={anomalias.demora_prometida_negativa / anomalias.total}
                          color="#dc2626"
                          onClick={() =>
                            open(
                              "ANOMALIA_DEMORA_PROMETIDA_NEGATIVA",
                              "Demora prometida negativa",
                            )
                          }
                        />
                      )}
                      {anomalias.eventos_fuera_de_orden_cronologico
                        .filter((e) => e.cantidad > 0)
                        .map((e) => (
                          <ProgressBar
                            key={e.tramo}
                            label={`Fuera de orden: ${TRAMO_LABELS[e.tramo] || e.tramo}`}
                            valueLabel={nf(e.cantidad)}
                            ratio={e.cantidad / anomalias.total}
                            color="#dc2626"
                            onClick={() =>
                              open(
                                `ANOMALIA_FUERA_DE_ORDEN_${e.tramo.toUpperCase()}`,
                                `Fuera de orden: ${TRAMO_LABELS[e.tramo] || e.tramo}`,
                              )
                            }
                          />
                        ))}
                    </div>
                  </section>
                )}
                </CollapsibleGroup>

                <CollapsibleGroup
                  title="Tiempos, campañas y estados"
                  icon="schedule"
                  open={openGroups.tiempos}
                  onToggle={() =>
                    setOpenGroups({ ...openGroups, tiempos: !openGroups.tiempos })
                  }
                >
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
                        leer: `Cuánto tarda el móvil en llegar al lugar, desde que se confirma el envío.${filters.excluir_programados ? " Excluye servicios programados (ver check \"Excluir programados\" en los filtros globales)." : " Incluye servicios programados."}`,
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
                        titulo="SLA de llegada"
                        leer="De los servicios con tiempo prometido y real cargados, cuántos llegaron a tiempo, y cuánto se pasaron los que no."
                        calculo="Bandas sobre DemoraReal − DemoraPrometida."
                      />
                    </h3>
                    <p className="font-label-sm text-label-sm text-on-surface-variant -mt-2">
                      DemoraReal − DemoraPrometida · sobre{" "}
                      {nf(funnel?.sla_llegada.cantidad_evaluable)} servicios con
                      trazabilidad completa
                      {filters.excluir_programados
                        ? ' · excluye servicios programados (check "Excluir programados" en los filtros globales)'
                        : " · incluye servicios programados"}
                      .
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
                        leer: `El viaje completo del servicio, de punta a punta, desde que se crea hasta que se cierra.${filters.excluir_programados ? " Excluye servicios programados (ver check \"Excluir programados\" en los filtros globales)." : " Incluye servicios programados."}`,
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
                      <table className="w-full text-body-md font-body-md border-collapse whitespace-nowrap">
                        <thead>
                          <tr className="bg-surface-container-low text-on-surface-variant font-label-caps text-label-caps uppercase text-left">
                            <SortableTh
                              label="Campaña"
                              sortKey="campana"
                              sort={sortCampanaImpactoPageable}
                              defaultDir="asc"
                              className="py-space-sm pl-md pr-3 rounded-l-lg"
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
                              className="py-space-sm pr-md rounded-r-lg"
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
                                className="hover:bg-surface-container-low transition-colors border-b border-outline-variant/10 last:border-0"
                              >
                                <td className="py-space-sm pl-md pr-3 text-on-surface font-semibold">
                                  {c.campana}
                                </td>
                                <td className="py-space-sm pr-3 font-label-code text-label-code font-bold">
                                  {nf(c.total_general)}
                                </td>
                                <td className="py-space-sm pr-3 font-label-code text-label-code text-primary font-bold">
                                  {pct(c.efectividad_enviador)}
                                </td>
                                <td className="py-space-sm pr-3 font-label-code text-label-code">
                                  {c.servicios_evaluados_demora_trazable > 0
                                    ? pct(c.cumplimiento_demora_trazable)
                                    : "N/A"}
                                </td>
                                <td className="py-space-sm pr-3 font-label-code text-label-code text-on-surface-variant">
                                  {pct(c.oportunidad_mejora_asignacion)}
                                </td>
                                <td className="py-space-sm pr-md text-center">
                                  <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-code text-label-code font-bold">
                                    {nf(c.impacto_asignacion)}
                                  </span>
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
                        titulo="Servicios por hora del día"
                        leer="A qué hora del día llega más trabajo — para pensar la dotación de personal según la demanda real, no contra el promedio del día entero."
                        calculo="Cuenta de servicios agrupados por la hora local (Argentina) de AltaDelServicio."
                      />
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        className="form-input-styled font-body-sm text-body-sm text-on-surface h-9 rounded-lg"
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
                        className="form-input-styled font-body-sm text-body-sm text-on-surface h-9 rounded-lg"
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
                      titulo="Estados por categoría semántica"
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
                            ? "#571ac0"
                            : c.categoria === "CANCELADO"
                              ? "#ba1a1a"
                              : c.categoria === "SIN_CLASIFICAR"
                                ? "#f59e0b"
                                : "#3525cd"
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
                </CollapsibleGroup>

                <CollapsibleGroup
                  title="Trazabilidad y asignación"
                  icon="route"
                  open={openGroups.asignacion}
                  onToggle={() =>
                    setOpenGroups({ ...openGroups, asignacion: !openGroups.asignacion })
                  }
                >
                {/* ---------- NUEVO (ADITIVO): Trazabilidad completa ---------- */}
                <section className="flex flex-col gap-sm">
                  <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                    Trazabilidad completa del servicio
                    <InfoTip
                      titulo="Trazabilidad completa del servicio"
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
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-space-sm pt-2">
                      {(trazabilidad?.funnel_completitud || []).map((e, i) => (
                        <div
                          key={e.etapa}
                          className="p-space-md rounded-xl bg-surface-container-low flex flex-col justify-between relative overflow-hidden group hover:bg-surface-container-high transition-colors"
                        >
                          <div className="flex items-center justify-between text-on-surface-variant font-label-code text-label-code">
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            <span className="text-primary font-bold">{pct(e.porcentaje)}</span>
                          </div>
                          <div className="my-space-xs">
                            <span className="font-headline-md text-body-lg font-bold text-on-surface block">
                              {e.etapa}
                            </span>
                            <span className="font-body-sm text-body-sm text-on-surface-variant">
                              {nf(e.cantidad)} servicios
                            </span>
                          </div>
                          <div className="w-full bg-surface-container-highest rounded-full h-1 overflow-hidden mt-1">
                            <div
                              className="bg-primary h-full"
                              style={{
                                width: `${Math.min(100, Math.max(0, (e.porcentaje ?? 0) * 100))}%`,
                              }}
                            />
                          </div>
                        </div>
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
                        titulo="Coordenadas como habilitador de asignación"
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
                          color="#3525cd"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-sm">
                    <h3 className="font-title-lg text-title-lg text-on-surface border-b border-outline-variant/30 pb-xs flex items-center gap-1">
                      MóvilRegistrado como proxy de asignación
                      <InfoTip
                        titulo="MóvilRegistrado como proxy de asignación"
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
                      titulo="Gestión completa de servicios programados"
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
                          color="#3525cd"
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
                          titulo="Llegada en horario"
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
                </CollapsibleGroup>

                <CollapsibleGroup
                  title="Outliers y auditoría"
                  icon="fact_check"
                  open={openGroups.outliers}
                  onToggle={() =>
                    setOpenGroups({ ...openGroups, outliers: !openGroups.outliers })
                  }
                >
                {/* ---------- NUEVO (ADITIVO): Outliers / anomalías ---------- */}
                <section className="flex flex-col gap-sm">
                  <div className="flex justify-between items-end flex-wrap gap-2 border-b border-outline-variant/30 pb-xs">
                    <h3 className="font-title-lg text-title-lg text-on-surface flex items-center gap-1">
                      Outliers por tramo
                      <InfoTip
                        titulo="Outliers por tramo"
                        leer="Los promedios y percentiles esconden los casos extremos. Acá se los ve uno por uno, con el prestador y el servicio puntual, para auditarlos."
                        calculo="Los 20 valores más altos del tramo elegido, y siempre todos los que superen 3× el P90 de ese tramo aunque sean más de 20."
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
                    Los 20 valores más altos del tramo seleccionado, para
                    auditar caso por caso, y siempre todos los que superen 3×
                    el P90 aunque sean más de 20 (P90 de referencia:{" "}
                    {nf(outliers?.[outlierTramo]?.p90_referencia)} min).
                  </p>
                  <div className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between px-md py-sm border-b border-outline-variant/20">
                      <span className="flex items-center gap-1.5 font-headline-md text-headline-md text-on-surface font-semibold">
                        <Icon name="list_alt" className="text-primary text-[20px]" />
                        Registro auditado de casos
                        <span className="px-1.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-code text-label-code font-semibold normal-case">
                          {nf((outliers?.[outlierTramo]?.top || []).length)} registros
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 font-label-code text-label-code text-on-surface-variant uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-error" />
                        Ordenado por: {sortOutliersPageable.key === "valor_minutos" ? "Minutos" : sortOutliersPageable.key}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-body-md font-body-md whitespace-nowrap">
                        <thead>
                          <tr className="bg-surface-container-low font-label-caps text-label-caps text-on-surface-variant uppercase text-left">
                            <SortableTh
                              label="ID servicio"
                              sortKey="id_orden_de_servicio"
                              sort={sortOutliersPageable}
                              className="py-2 pl-md pr-3"
                            />
                            <SortableTh
                              label="Prestador / Razón social"
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
                            />
                            <SortableTh
                              label="Factor desvío"
                              sortKey="valor_minutos"
                              sort={sortOutliersPageable}
                              className="py-2 pr-md"
                              tooltip={{
                                leer: "Cuántas veces el P90 del tramo representa este valor puntual — un factor más alto es un caso más extremo.",
                                calculo: "Minutos del caso ÷ P90 de referencia del tramo elegido.",
                              }}
                            />
                          </tr>
                        </thead>
                        <tbody>
                          {sortOutliers.sorted
                            .slice((outliersPage - 1) * 10, outliersPage * 10)
                            .map((o, i) => {
                              const p90 = outliers?.[outlierTramo]?.p90_referencia;
                              const factor = p90 ? o.valor_minutos / p90 : null;
                              return (
                              <tr
                                key={`${o.id_servicio_prestado}-${i}`}
                                className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors"
                              >
                                <td className="py-2 pl-md pr-3 font-label-code text-label-code text-on-surface-variant">
                                  {o.id_orden_de_servicio}
                                </td>
                                <td className="py-2 pr-3">
                                  <div className="flex items-center gap-space-sm min-w-0">
                                    <div
                                      className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                                        i % 2 === 0
                                          ? "bg-surface-container text-primary"
                                          : "bg-surface-container text-secondary"
                                      }`}
                                    >
                                      {(o.prestador || "??").slice(0, 2).toUpperCase()}
                                    </div>
                                    <span className="font-semibold text-on-surface truncate">
                                      {o.prestador}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2 pr-3">
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface font-label-code text-label-code">
                                    <span className="w-1.5 h-1.5 rounded-full bg-secondary shrink-0" />
                                    {o.campana}
                                  </span>
                                </td>
                                <td className="py-2 pr-3 font-label-code text-label-code text-on-surface-variant">
                                  {o.fecha}
                                </td>
                                <td className="py-2 pr-3 font-label-code text-label-code font-bold text-error">
                                  {nf(o.valor_minutos)}
                                  {o.es_anomalia_probable && (
                                    <span title="Supera 3x el P90 del tramo">
                                      <Icon
                                        name="warning"
                                        filled
                                        className="inline text-[14px] ml-1 align-text-bottom"
                                      />
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 pr-md">
                                  {factor != null ? (
                                    <span className="px-2 py-0.5 rounded-full bg-error-container/60 text-error font-label-code text-label-code font-semibold">
                                      {factor.toFixed(1)}x P90
                                    </span>
                                  ) : (
                                    <span className="text-on-surface-variant">—</span>
                                  )}
                                </td>
                              </tr>
                              );
                            })}
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
                </CollapsibleGroup>
              </>
            )}

            {page === "providers" && (
              <div className="flex flex-col gap-xl">
                {/* ---------- NUEVO (ADITIVO): tarjetas KPI ---------- */}
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-md">
                  <Card
                    icon={<Icon name="domain" filled />}
                    title="Total prestadores"
                    value={nf(providerStats.total)}
                    detail={`${nf(providers.reduce((a, x) => a + (x.total_general || 0), 0))} servicios auditados`}
                  />
                  <Card
                    icon={<Icon name="timer" filled />}
                    title="Cumplimiento de demora promedio"
                    value={pct(providerStats.cumplimientoPromedio)}
                    detail="Promedio ponderado del período filtrado"
                    progress={ratioPct(providerStats.cumplimientoPromedio)}
                    tooltip={{
                      leer: "El cumplimiento de demora promedio de todos los prestadores del universo filtrado, ponderado por volumen (no es un promedio simple entre prestadores).",
                      calculo: "Suma de servicios que cumplen ÷ (suma de servicios que cumplen + suma de los que no cumplen), sobre todos los prestadores filtrados.",
                    }}
                  />
                  <Card
                    icon={<Icon name="verified" filled />}
                    title="Índice de calidad medio"
                    value={pct(providerStats.indiceCalidadMedio)}
                    detail="Completitud de datos cargados"
                    tone="green"
                    progress={ratioPct(providerStats.indiceCalidadMedio)}
                    tooltip={{
                      leer: "Qué tan completos están, en promedio, los datos de los servicios — promediado entre todos los prestadores del universo filtrado.",
                      calculo: "Promedio simple del Índice de calidad de cada prestador.",
                    }}
                  />
                  <Card
                    icon={<Icon name="timeline" filled />}
                    title="Trazabilidad promedio"
                    value={pct(providerStats.trazabilidadPromedio)}
                    detail="Cadena de eventos completa"
                    tone="purple"
                    progress={ratioPct(providerStats.trazabilidadPromedio)}
                    tooltip={{
                      leer: "Qué % de los servicios tiene la cadena completa de eventos, promediado entre todos los prestadores del universo filtrado.",
                      calculo: "Promedio simple de la Trazabilidad de cada prestador.",
                    }}
                  />
                  <div className="flex flex-col justify-between gap-space-sm p-space-lg rounded-xl bg-primary text-on-primary card-shadow">
                    <div className="flex items-center justify-between gap-space-sm">
                      <span className="font-label-caps text-label-caps uppercase text-on-primary/80">
                        Top líder operativo
                      </span>
                      <Icon name="military_tech" className="text-on-primary text-[20px]" />
                    </div>
                    {providerStats.lider ? (
                      <>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-headline-md text-headline-md font-bold text-on-primary truncate">
                            {providerStats.lider.prestador}
                          </span>
                        </div>
                        <div className="flex items-center justify-between font-label-code text-label-code">
                          <span className="font-bold text-on-primary">
                            {nf(providerStats.lider.total_general)} servicios
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-surface-container-lowest text-on-surface font-semibold">
                            {pct(providerStats.lider.score_ranking)} score
                          </span>
                        </div>
                      </>
                    ) : (
                      <span className="font-body-sm text-body-sm text-on-primary/80">
                        Sin datos suficientes
                      </span>
                    )}
                  </div>
                </section>

                <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col overflow-hidden">
                {prestadoresWarning && (
                  <div className="mx-md mt-md bg-[#f59e0b]/10 text-[#7a4a00] rounded-lg px-md py-sm flex items-start gap-2 font-body-md text-body-md">
                    <Icon name="warning" filled className="text-[#f59e0b] shrink-0 mt-0.5" />
                    {prestadoresWarning}
                  </div>
                )}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm p-space-md">
                  <div className="relative w-full md:w-96">
                    <Icon
                      name="search"
                      className="absolute left-3 top-2.5 text-on-surface-variant text-[18px]"
                    />
                    <input
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-on-surface-variant focus:outline-none focus:bg-surface-container transition-all"
                      placeholder="Buscar prestador por razón social o ID…"
                      value={providerSearch}
                      onChange={(e) => {
                        setProviderSearch(e.target.value);
                        setProviderPage(1);
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-space-xs flex-wrap">
                    <div className="inline-flex p-1 rounded-lg bg-surface-container-low flex-wrap">
                      {(
                        [
                          ["all", `Todos (${nf(providers.length)})`],
                          ["cumplen", "Cumplen >80%"],
                          ["alerta", "Alerta SLA (<70%)"],
                          ["alta", "Alta demanda (>200)"],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setProviderQuickFilter(key);
                            setProviderPage(1);
                          }}
                          className={`px-2.5 py-1 rounded-md font-body-sm text-body-sm transition-colors flex items-center gap-1 ${
                            providerQuickFilter === key
                              ? "bg-surface-container-lowest text-on-surface font-semibold shadow-xs"
                              : "text-on-surface-variant hover:text-on-surface"
                          }`}
                        >
                          {key === "alerta" && (
                            <span className="w-1.5 h-1.5 rounded-full bg-error" />
                          )}
                          {label}
                        </button>
                      ))}
                    </div>
                    <ExportButton
                      rows={() =>
                        displayedProviders as unknown as Record<string, unknown>[]
                      }
                      fileBaseName="prestadores"
                      pdfTitle="Detalle por prestador"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto px-md pb-md">
                  <table className="w-full text-body-md font-body-md whitespace-nowrap">
                    <thead>
                      <tr className="bg-surface-container-low font-label-caps text-label-caps text-on-surface-variant uppercase text-left rounded-lg">
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
                          label="Cumple / No cumple"
                          sortKey="servicios_cumplidos"
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
                          label="Demora promedio"
                          sortKey="demora_real_promedio"
                          sort={sortProvidersPageable}
                          tooltip={{
                            leer: "El tiempo promedio (en minutos) que tarda ese prestador, según la Demora Real cargada en el reporte.",
                            calculo: "Promedio de DemoraReal sobre los servicios de ese prestador que tienen ese dato cargado.",
                          }}
                        />
                        <SortableTh
                          label="Reclamos"
                          sortKey="reclamos_rotura"
                          sort={sortProvidersPageable}
                          tooltip={{
                            leer: "Cantidad de servicios de ese prestador con al menos una queja/reclamo registrada (rotura/daños, demora, etc.) en el reporte Ficha de Seguimiento, en el período filtrado.",
                            calculo: "Servicios distintos (por IdServicioPrestado) con Motivo de queja/reclamo asociado — si un mismo reclamo tiene varias filas de gestión, cuenta una sola vez.",
                          }}
                        />
                        <SortableTh
                          label="Score"
                          sortKey="score_ranking"
                          sort={sortProvidersPageable}
                          tooltip={{
                            leer: "Una nota de 0 a 100% que combina Cumplimiento observado, Trazabilidad, Reclamos y Reclamos por encuesta, con el mismo peso cada uno. El ⚠ avisa que ese prestador tiene menos de 20 servicios — con tan poca muestra, el score es poco confiable.",
                            calculo: "37,5% Cumplimiento observado + 31,25% Trazabilidad + 18,75% (1 − 0,2 × cantidad de reclamos) + 12,5% (1 − % reclamos por encuesta, según la pregunta \"opinión sobre el profesional\" de la encuesta, ≤2 = reclamo) — se renormaliza si falta algún componente. El componente de reclamos resta 20 puntos porcentuales por cada reclamo (sin tope, puede dar negativo), y reclamos por encuesta solo se calcula para prestadores con encuestas respondidas en el período filtrado. El score final nunca baja de 0%.",
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
                        .map((x, i) => {
                        const alerta = (x.cumplimiento_demora ?? 1) < 0.35;
                        return (
                        <tr
                          key={x.prestador_id}
                          className={`border-b border-outline-variant/10 transition-colors ${
                            alerta
                              ? "bg-error-container/20 hover:bg-error-container/30"
                              : "hover:bg-surface-container-low"
                          }`}
                        >
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-space-sm min-w-0">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[11px] shrink-0 ${
                                  alerta
                                    ? "bg-error text-on-error"
                                    : i % 2 === 0
                                      ? "bg-surface-container text-primary"
                                      : "bg-surface-container text-secondary"
                                }`}
                              >
                                {x.prestador.slice(0, 2).toUpperCase()}
                              </div>
                              <span className="font-headline-md text-[13px] font-bold text-on-surface truncate">
                                {x.prestador}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 pr-3 font-label-code text-label-code font-bold text-on-surface">{nf(x.total_general)}</td>
                          <td className="py-2 pr-3 font-label-code text-label-code">{nf(x.enviador_si)}</td>
                          <td className="py-2 pr-3">
                            <span className="px-2 py-0.5 rounded-full bg-surface-container text-primary font-label-code text-[11px] font-semibold">
                              {pct(x.uso_enviador)}
                            </span>
                          </td>
                          <td className="py-2 pr-3 font-label-code text-label-code">{nf(x.asigna_movil)}</td>
                          <td className="py-2 pr-3 font-label-code text-label-code font-semibold text-secondary">{pct(x.efectividad_enviador)}</td>
                          <td className="py-2 pr-3 font-label-code text-label-code">{nf(x.servicios_programados)}</td>
                          <td className="py-2 pr-3">
                            <span className="inline-flex items-center gap-1 font-label-code text-label-code">
                              <span className="text-primary font-semibold">{nf(x.servicios_cumplidos)}</span>
                              <span className="text-on-surface-variant">/</span>
                              <span className="text-error font-semibold">{nf(x.servicios_no_cumplidos)}</span>
                            </span>
                          </td>
                          <td className="py-2 pr-3 min-w-[140px]">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-surface-container rounded-full h-1.5 overflow-hidden shrink-0">
                                <div
                                  className={`h-full rounded-full ${alerta ? "bg-error" : "bg-primary"}`}
                                  style={{
                                    width: `${Math.max(0, Math.min(100, ratioPct(x.cumplimiento_demora) ?? 0))}%`,
                                  }}
                                />
                              </div>
                              <span
                                className={`font-label-code text-label-code font-bold ${alerta ? "text-error" : "text-on-surface"}`}
                              >
                                {pct(x.cumplimiento_demora)}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 pr-3 font-label-code text-label-code">{pct(x.indice_calidad_datos)}</td>
                          <td className="py-2 pr-3 font-label-code text-label-code">
                            {pct(x.porcentaje_trazabilidad_completa)}
                          </td>
                          <td className="py-2 pr-3 font-label-code text-label-code">{pct(x.volumen_relativo)}</td>
                          <td className="py-2 pr-3 font-label-code text-label-code">
                            {x.demora_real_promedio != null
                              ? `${nf(x.demora_real_promedio)} min`
                              : "N/A"}
                          </td>
                          <td className="py-2 pr-3 font-label-code text-label-code">
                            {nf(x.reclamos_rotura ?? 0)}
                          </td>
                          <td className="py-2 pr-3">
                            <span className="font-label-code text-label-code font-bold text-on-surface">
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
                        );
                      })}
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
              </div>
            )}

            {page === "cross" && (
              <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm p-space-md">
                  <div className="relative w-full md:w-96">
                    <Icon
                      name="search"
                      className="absolute left-3 top-2.5 text-on-surface-variant text-[18px]"
                    />
                    <input
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-on-surface-variant focus:outline-none focus:bg-surface-container transition-all"
                      placeholder="Buscar prestador o campaña…"
                      value={crossSearch}
                      onChange={(e) => {
                        setCrossSearch(e.target.value);
                        setCrossPage(1);
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-space-sm">
                    <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                      {nf(sortCross.sorted.length)} combinaciones
                    </span>
                    <ExportButton
                      rows={() => sortCross.sorted as unknown as Record<string, unknown>[]}
                      fileBaseName="campana-prestador"
                      pdfTitle="Campaña × prestador"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto px-md pb-md">
                  <table className="w-full text-body-md font-body-md whitespace-nowrap">
                    <thead>
                      <tr className="bg-surface-container-low font-label-caps text-label-caps text-on-surface-variant uppercase text-left">
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
                          label="Cumple / No cumple"
                          sortKey="servicios_cumplidos"
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
                          className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors"
                        >
                          <td className="py-2 pr-3 font-semibold text-on-surface">{x.campana}</td>
                          <td className="py-2 pr-3 text-on-surface">{x.prestador}</td>
                          <td className="py-2 pr-3 font-label-code text-label-code font-bold text-on-surface">{nf(x.total_general)}</td>
                          <td className="py-2 pr-3 font-label-code text-label-code">{nf(x.enviador_si)}</td>
                          <td className="py-2 pr-3 font-label-code text-label-code font-semibold text-secondary">{pct(x.efectividad_enviador)}</td>
                          <td className="py-2 pr-3">
                            <span className="inline-flex items-center gap-1 font-label-code text-label-code">
                              <span className="text-primary font-semibold">{nf(x.servicios_cumplidos)}</span>
                              <span className="text-on-surface-variant">/</span>
                              <span className="text-error font-semibold">{nf(x.servicios_no_cumplidos)}</span>
                            </span>
                          </td>
                          <td className="py-2 pr-3 min-w-[140px]">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-surface-container rounded-full h-1.5 overflow-hidden shrink-0">
                                <div
                                  className="bg-primary h-full rounded-full"
                                  style={{
                                    width: `${Math.max(0, Math.min(100, ratioPct(x.cumplimiento_demora) ?? 0))}%`,
                                  }}
                                />
                              </div>
                              <span className="font-label-code text-label-code font-bold text-on-surface">
                                {pct(x.cumplimiento_demora)}
                              </span>
                            </div>
                          </td>
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
                <div className="flex flex-col gap-space-sm">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
                    <div className="flex flex-col gap-space-xs">
                      <div className="flex items-center gap-space-sm flex-wrap">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-container text-on-primary">
                          <Icon name="psychology" className="text-[20px]" filled />
                        </div>
                        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
                          Inteligencia Operativa
                        </h1>
                        <div className="flex items-center gap-1.5 px-space-sm py-0.5 rounded-full bg-surface-container-high text-primary font-label-code text-label-code">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          <span>Heurística activa</span>
                        </div>
                      </div>
                      <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
                        Evaluación histórica y segmentación heurística de prestadores para
                        priorizar auditorías y acompañamiento operativo en campo.
                      </p>
                      <div className="flex items-center gap-space-md text-on-surface-variant font-label-code text-label-code pt-0.5 flex-wrap">
                        <span className="flex items-center gap-1 text-on-surface font-semibold">
                          <Icon name="groups" className="text-[15px] text-primary" />
                          {nf(inteligencia?.total_prestadores)} prestadores evaluados
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Icon name="rule" className="text-[15px]" />
                          Reglas sobre datos históricos (sin modelos predictivos)
                        </span>
                        {filters.fecha_desde && filters.fecha_hasta && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Icon name="date_range" className="text-[15px]" />
                              Corte: {filters.fecha_desde} — {filters.fecha_hasta}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-space-sm flex-wrap self-start lg:self-center">
                      <button
                        type="button"
                        className="flex items-center gap-space-xs px-space-md py-2 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-low transition-colors shadow-sm font-body-md text-body-md"
                        onClick={() => {
                          setDraft(DEFAULT);
                          setFilters(DEFAULT);
                        }}
                      >
                        <Icon name="restart_alt" className="text-[17px] text-on-surface-variant" />
                        Restablecer
                      </button>
                      <ExportButton
                        label="Exportar diagnóstico"
                        className="flex items-center gap-space-xs px-space-md py-2 rounded-lg bg-primary-container text-on-primary hover:bg-primary transition-all font-body-md text-body-md font-medium shadow-sm"
                        rows={() =>
                          (inteligencia?.prestadores ||
                            []) as unknown as Record<string, unknown>[]
                        }
                        fileBaseName="inteligencia-prestadores"
                        pdfTitle="Inteligencia Operativa — Prestadores"
                      />
                    </div>
                  </div>
                  <div className="rounded-xl bg-surface-container-low p-space-md shadow-sm flex items-start gap-space-md">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                      <Icon name="tips_and_updates" className="text-[22px]" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-headline-md text-body-md text-on-surface font-semibold">
                        Criterio de clasificación y gobierno operativo
                      </span>
                      <p className="font-body-md text-body-md text-on-surface-variant">
                        Evalúa el comportamiento histórico de cada prestador para identificar
                        rápido a quién revisar con urgencia, a quién prestarle atención, y
                        quién se está destacando. Todo se calcula sobre datos que ya
                        ocurrieron dentro de los filtros elegidos arriba — no hay pronósticos
                        ni probabilidades de lo que podría pasar.
                      </p>
                    </div>
                  </div>
                </div>

                {/* NUEVO (ADITIVO): con un período filtrado muy corto,
                    "primera vs segunda mitad" pierde sentido (todas las
                    filas comparten fecha) y casi ningún prestador junta
                    volumen para el ranking -- se avisa en vez de mostrar
                    un número con apariencia de preciso que es ruido. */}
                {inteligencia && !inteligencia.periodo_suficiente && (
                  <div className="flex items-start gap-2 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-xl px-md py-sm">
                    <Icon
                      name="warning"
                      filled
                      className="text-[#f59e0b] text-[20px] mt-0.5 shrink-0"
                    />
                    <p className="font-body-md text-body-md text-on-surface">
                      El período filtrado tiene {nf(inteligencia.periodo_dias)}{" "}
                      día{inteligencia.periodo_dias !== 1 ? "s" : ""} — se necesitan al
                      menos {nf(inteligencia.dias_minimo_recomendado)} días para que la
                      tendencia y la comparación entre prestadores sean confiables.
                      Mientras tanto, todos los prestadores se muestran como
                      "Muestra insuficiente", sin ranking ni recomendación.
                    </p>
                  </div>
                )}

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
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h3 className="font-headline-md text-headline-md text-on-surface">
                          Panorama general de los prestadores
                        </h3>
                        <span className="font-label-code text-label-code text-on-surface-variant">
                          Total: {nf(inteligencia.total_prestadores)} entidades auditadas
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
                        <Card
                          icon={<Icon name="error" />}
                          title="Necesitan atención urgente"
                          value={nf(inteligencia.resumen.urgente)}
                          badge={`${pct(inteligencia.resumen.urgente / Math.max(1, inteligencia.total_prestadores))} de la red`}
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
                          badge={`${pct(inteligencia.resumen.atencion / Math.max(1, inteligencia.total_prestadores))} de la red`}
                          detail="Vienen bajando o rinden por debajo del promedio — clic para ver quiénes"
                          tone="amber"
                          onClick={() => setModalClasificacion("atencion")}
                          linkText="Ver prestadores"
                          tooltip={{
                            leer:
                              "Prestadores que conviene monitorear de cerca: vienen bajando un poco su cumplimiento, o rinden por debajo del promedio comparados con sus pares dentro del período filtrado — sin llegar todavía al nivel de Urgente. Nunca incluye a un prestador con más de 85% de cumplimiento.",
                            calculo:
                              "Se clasifica como Atención cuando (la caída entre la primera y la segunda mitad del período es de 5 a 10 puntos porcentuales, o el percentil frente a los demás prestadores filtrados está entre 21 y 40) Y ADEMÁS su cumplimiento actual es de 85% o menos.",
                          }}
                        />
                        <Card
                          icon={<Icon name="trending_up" />}
                          title="Se están destacando"
                          value={nf(inteligencia.resumen.destacado)}
                          badge={`${pct(inteligencia.resumen.destacado / Math.max(1, inteligencia.total_prestadores))} de la red`}
                          detail="Rinden muy bien y de forma estable — clic para ver quiénes"
                          tone="green"
                          onClick={() => setModalClasificacion("destacado")}
                          linkText="Ver prestadores"
                          tooltip={{
                            leer:
                              "Prestadores que se están destacando: quedan entre el grupo con mejor cumplimiento dentro del período filtrado y, además, no muestran una caída reciente. Nunca incluye a un prestador con 85% de cumplimiento o menos.",
                            calculo:
                              "Se clasifica como Destacado cuando (el percentil frente a los demás prestadores filtrados es 80 o mayor, y la variación entre la primera y la segunda mitad del período no bajó más de 2 puntos porcentuales) Y ADEMÁS su cumplimiento actual es mayor a 85%.",
                          }}
                        />
                      </div>
                    </section>

                    {/* ---------- Comparativa entre prestadores ---------- */}
                    <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col">
                      <div className="p-md flex flex-col gap-space-md">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-space-xs">
                              <Icon name="table_rows" className="text-primary text-[22px]" />
                              <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">
                                Comparativa entre prestadores
                              </h3>
                            </div>
                            <p className="font-body-sm text-body-sm text-on-surface-variant">
                              Cómo viene cada prestador y qué conviene hacer, ordenados del que
                              más necesita atención al que mejor está.
                            </p>
                          </div>
                          <div className="relative w-full lg:w-80">
                            <Icon
                              name="search"
                              className="absolute left-3 top-2.5 text-[18px] text-on-surface-variant"
                            />
                            <input
                              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface placeholder:text-on-surface-variant font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-lowest focus:shadow-sm transition-all"
                              placeholder="Buscar por prestador…"
                              value={inteligenciaSearch}
                              onChange={(e) => {
                                setInteligenciaSearch(e.target.value);
                                setInteligenciaPage(1);
                              }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-container-low font-body-sm text-body-sm flex-wrap">
                          {(
                            [
                              ["todos", `Todos (${nf(inteligencia.total_prestadores)})`, null],
                              ["urgente", `Urgentes (${nf(inteligencia.resumen.urgente)})`, "bg-error"],
                              ["atencion", `En atención (${nf(inteligencia.resumen.atencion)})`, "bg-tertiary"],
                              ["destacado", `Destacados (${nf(inteligencia.resumen.destacado)})`, "bg-primary"],
                              ["estable", `Estables (${nf(inteligencia.resumen.estable)})`, null],
                              [
                                "muestra_insuficiente",
                                `Muestra insuficiente (${nf(inteligencia.resumen.muestra_insuficiente)})`,
                                "bg-outline",
                              ],
                            ] as [Clasificacion | "todos", string, string | null][]
                          ).map(([key, label, dot]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => {
                                setInteligenciaFilter(key);
                                setInteligenciaPage(1);
                              }}
                              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                                inteligenciaFilter === key
                                  ? "bg-surface-container-lowest text-on-surface font-medium shadow-xs"
                                  : "text-on-surface-variant hover:text-on-surface"
                              }`}
                            >
                              {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="overflow-x-auto p-md pt-0">
                        <table className="w-full text-body-md font-body-md whitespace-nowrap">
                          <thead>
                            <tr className="bg-surface-container-low font-label-caps text-label-caps text-on-surface-variant uppercase text-left">
                              <SortableTh
                                label="Prestador / Razón social"
                                sortKey="prestador"
                                sort={sortInteligenciaPageable}
                                defaultDir="asc"
                                className="py-2 pl-md pr-3"
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
                                  calculo: "Urgente / Atención / Destacado / Estable, según umbrales fijos de tendencia (primera vs. segunda mitad del período) y percentil. Atención y Destacado exigen además un cumplimiento actual de 85% o menos / más de 85% respectivamente. Sin muestra suficiente de servicios con Demora Prometida y Real cargadas, queda como Muestra insuficiente.",
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
                              .map((p, i) => (
                                <tr
                                  key={p.prestador_id}
                                  className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors"
                                >
                                  <td className="py-2 pl-md pr-3">
                                    <div className="flex items-center gap-space-sm min-w-0">
                                      <div
                                        className={`w-8 h-8 rounded-full flex items-center justify-center font-label-code text-label-code font-bold shrink-0 ${
                                          p.clasificacion === "urgente"
                                            ? "bg-error-container text-on-error-container"
                                            : i % 2 === 0
                                              ? "bg-surface-container text-primary"
                                              : "bg-surface-container text-secondary"
                                        }`}
                                      >
                                        {p.prestador.slice(0, 2).toUpperCase()}
                                      </div>
                                      <span className="font-semibold text-on-surface truncate">
                                        {p.prestador}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2 pr-3 min-w-[130px]">
                                    <div className="flex flex-col gap-1 w-28">
                                      <div className="flex items-baseline justify-between font-label-code text-label-code">
                                        <span
                                          className={`font-bold ${p.clasificacion === "urgente" ? "text-error" : "text-on-surface"}`}
                                        >
                                          {pct(p.cumplimiento_actual)}
                                        </span>
                                      </div>
                                      <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${p.clasificacion === "urgente" ? "bg-error" : "bg-primary"}`}
                                          style={{
                                            width: `${Math.max(0, Math.min(100, ratioPct(p.cumplimiento_actual) ?? 0))}%`,
                                          }}
                                        />
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2 pr-3 font-body-sm text-body-sm text-on-surface-variant">
                                    {comparadoConSimilares(p.percentil_benchmark)}
                                  </td>
                                  <td className="py-2 pr-3">
                                    <span
                                      className={`font-label-caps text-label-caps rounded-md px-2.5 py-0.5 uppercase font-bold ${clasificacionInfo(p.clasificacion).tone}`}
                                    >
                                      {clasificacionInfo(p.clasificacion).label}
                                    </span>
                                  </td>
                                  <td className="py-2 pr-3 font-body-md text-body-md text-on-surface">
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
                        total={sortInteligencia.sorted.length}
                      />
                    </section>
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
                      Excel de Trackeo (.xlsx/.xlsm), archivo de despachador con
                      origen/destino (.xls/.xlsb/.xlsx), Reporte de Métricas de
                      Encuestas (.xlsx), o Reporte Ficha Seguimiento filtrado por
                      Evento="USO DEL SISTEMA" y Acción="SERVICIO FINALIZADO"
                      (.xlsx) — la plataforma detecta cuál es por el nombre del
                      archivo. Si el de despachador pesa más de 50 MB, exportalo
                      como .xlsb (mucho más liviano que .xls).
                    </p>
                  </div>
                </header>
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-outline-variant rounded-xl py-xl px-md cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                  <input
                    className="hidden"
                    type="file"
                    accept=".xlsx,.xlsm,.xls,.xlsb"
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
              <table className="w-full text-body-md font-body-md whitespace-nowrap">
                <thead>
                  <tr className="text-label-md font-label-md text-on-surface-variant uppercase text-left border-b border-outline-variant/30 sticky top-0 bg-surface-container-lowest">
                    <SortableTh label="ID" sortKey="id_orden_de_servicio" sort={sortDrill} />
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
                    {/* NUEVO v4.26.0 (ADITIVO): localidad/provincia de
                        origen y destino, cruzadas desde el archivo de
                        despachador -- null si el servicio no matcheo
                        con ese archivo. */}
                    <SortableTh
                      label="Origen"
                      sortKey="provincia_origen"
                      sort={sortDrill}
                      defaultDir="asc"
                    />
                    <SortableTh
                      label="Destino"
                      sortKey="provincia_destino"
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
                      <td className="py-2 pr-3">{x.id_orden_de_servicio}</td>
                      <td className="py-2 pr-3">{x.fecha}</td>
                      <td className="py-2 pr-3">{x.estado}</td>
                      <td className="py-2 pr-3">{x.tipo_de_servicio}</td>
                      <td className="py-2 pr-3 text-on-surface">{x.prestador}</td>
                      <td className="py-2 pr-3">{x.campana}</td>
                      <td className="py-2 pr-3">{x.demora_prometida}</td>
                      <td className="py-2 pr-3">{x.demora_real}</td>
                      <td className="py-2 pr-3">{x.rango_demora_real}</td>
                      <td className="py-2 pr-3">
                        {x.localidad_origen
                          ? `${x.localidad_origen}, ${x.provincia_origen}`
                          : x.provincia_origen || "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {x.localidad_destino
                          ? `${x.localidad_destino}, ${x.provincia_destino}`
                          : x.provincia_destino || "—"}
                      </td>
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

      {/* ---------- NUEVO (ADITIVO): Modal de detalle de IDs al hacer
         clic en las tarjetas de Cobertura de encuestas automáticas ---------- */}
      {modalCobertura && (
        <div
          className="fixed inset-0 bg-on-surface/40 z-[100] flex items-center justify-center p-md"
          onMouseDown={() => setModalCobertura(null)}
        >
          <section
            className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 px-md py-md border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    modalCobertura === "faltantes"
                      ? "bg-red-500/15 text-red-600"
                      : "bg-primary/15 text-primary"
                  }`}
                >
                  <Icon
                    name={
                      modalCobertura === "esperadas"
                        ? "task_alt"
                        : modalCobertura === "enviadas"
                          ? "send"
                          : "report"
                    }
                    className="text-[18px]"
                  />
                </span>
                <div>
                  <h2 className="font-title-lg text-title-lg text-on-surface">
                    {modalCobertura === "esperadas"
                      ? "Debieron enviarse"
                      : modalCobertura === "enviadas"
                        ? "Se enviaron"
                        : "Faltantes"}
                  </h2>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    {nf(
                      (coberturaEncuestas?.serie_diaria ?? []).reduce(
                        (acc, p) => acc + p[`ids_${modalCobertura}`].length,
                        0,
                      ),
                    )}{" "}
                    servicios · IdOrdenDeServicio
                  </p>
                </div>
              </div>
              <button
                className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors"
                onClick={() => setModalCobertura(null)}
              >
                <Icon name="close" />
              </button>
            </header>
            <div className="overflow-auto px-md py-sm flex-1 flex flex-col gap-2">
              {(coberturaEncuestas?.serie_diaria ?? [])
                .filter((p) => p[`ids_${modalCobertura}`].length > 0)
                .map((p) => (
                  <div
                    key={p.fecha}
                    className="bg-surface-container-low rounded-lg px-sm py-2 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-body-md text-body-md font-medium text-on-surface">
                        {p.fecha}
                      </span>
                      <span className="font-label-md text-label-md text-on-surface-variant">
                        {nf(p[`ids_${modalCobertura}`].length)} servicios
                      </span>
                    </div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant break-all">
                      {p[`ids_${modalCobertura}`].join(", ")}
                    </span>
                  </div>
                ))}
              {(coberturaEncuestas?.serie_diaria ?? []).every(
                (p) => p[`ids_${modalCobertura}`].length === 0,
              ) && (
                <p className="font-body-md text-body-md text-on-surface-variant text-center py-lg">
                  No hay servicios en esta categoría para el rango filtrado.
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ---------- Modal de ayuda ---------- */}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
