/* Pantalla "Auditoría de prestadores" (pestaña de Inteligencia Operativa).
   Muestra lo que deja el motor estadístico semanal (esquema `auditoria`): resumen de la red, lista de prestadores
   priorizados, y el detalle de cada uno con sus indicadores contra sus pares, el historial semanal y los servicios
   concretos que respaldan cada alerta. SOLO LECTURA: no calcula nada ni modifica datos.
   Es una herramienta para AUDITAR: ninguna alerta es una sanción automática, requiere revisión de una persona. */
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type {
  AuditoriaCorrida,
  AuditoriaCorridaResumen,
  AuditoriaEvidencia,
  AuditoriaHistorial,
  AuditoriaResultado,
} from "./api";

const CANDIDATO = "Candidato a auditoria prioritaria";
const OBSERVACION = "Observacion";
const PAGE_SIZE = 15;
const Z_MIN = 2; // mismos umbrales que el motor (ver auditoria_prestadores.py)
const INDICADORES: { clave: string; nombre: string; efectoMin: number; informativo?: boolean }[] = [
  { clave: "incumple", nombre: "Incumplimiento de demora", efectoMin: 3 },
  { clave: "incompleto", nombre: "Registro incompleto (móvil / coordenadas / envío)", efectoMin: 5 },
  { clave: "extremo", nombre: "Carga retroactiva (demora extrema)", efectoMin: 1 },
  { clave: "reclamo", nombre: "Reclamos / quejas", efectoMin: 0.5 },
  { clave: "enc_baja", nombre: "Encuestas con nota baja", efectoMin: 5 },
  { clave: "cancela", nombre: "Cancelaciones tras asignar (solo informativo)", efectoMin: 2, informativo: true },
];

const nf = (v?: number | null, dec = 0) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("es-AR", { maximumFractionDigits: dec, minimumFractionDigits: dec }).format(v);
const pp = (v?: number | null) => (v == null ? "—" : `${nf(v, 1)} %`);
const signed = (v?: number | null, dec = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${nf(v, dec)}`);
const fechaHora = (s?: string | number | null) => {
  if (s == null || s === "") return "—";
  const d = new Date(String(s));
  return isNaN(d.getTime())
    ? String(s)
    : d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const soloFecha = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s.length <= 10 ? s + "T12:00:00" : s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const minutos = (v: unknown) => {
  if (typeof v !== "number") return "—";
  if (v >= 1440) return `${nf(v / 1440, 1)} días`;
  if (v >= 60) return `${Math.floor(v / 60)} h ${Math.round(v % 60)} min`;
  return `${Math.round(v)} min`;
};
const mnum = (r: AuditoriaResultado, k: string): number | null => {
  const v = r.metricas?.[k];
  return typeof v === "number" ? v : null;
};

function Icon({ name, className = "", filled = false }: { name: string; className?: string; filled?: boolean }) {
  return <span className={`material-symbols-outlined ${filled ? "icon-filled" : ""} ${className}`}>{name}</span>;
}

function alertaInfo(a: string | null): { label: string; tone: string; rank: number } {
  if (a === CANDIDATO) return { label: "Candidato a auditoría", tone: "text-error bg-error/10", rank: 2 };
  if (a === OBSERVACION) return { label: "Observación", tone: "text-[#b5610a] bg-[#f59e0b]/10", rank: 1 };
  return { label: "Sin alerta", tone: "text-on-surface-variant bg-surface-container-low", rank: 0 };
}

function Kpi({ titulo, valor, detalle, tone = "" }: { titulo: string; valor: string; detalle?: string; tone?: string }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 p-md flex flex-col gap-1">
      <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">{titulo}</span>
      <span className={`font-headline-lg text-headline-lg font-semibold ${tone || "text-on-surface"}`}>{valor}</span>
      {detalle && <span className="font-body-sm text-body-sm text-on-surface-variant">{detalle}</span>}
    </div>
  );
}

/* Barras simples con la prioridad de cada semana (historial del prestador). */
function MiniHistorial({ historial }: { historial: AuditoriaHistorial[] }) {
  const max = Math.max(10, ...historial.map((h) => h.prioridad ?? 0));
  const W = 28;
  const H = 70;
  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(historial.length * W + 10, 120)} height={H + 28} role="img" aria-label="Prioridad por semana">
        {historial.map((h, i) => {
          const v = h.prioridad ?? 0;
          const alto = Math.max(1, (v / max) * H);
          const color = h.alerta === CANDIDATO ? "#ba1a1a" : h.alerta === OBSERVACION ? "#f59e0b" : "#8a8f98";
          return (
            <g key={h.clave_semana} transform={`translate(${5 + i * W},0)`}>
              <title>{`${h.clave_semana}: prioridad ${nf(h.prioridad, 1)}${h.alerta ? " — " + alertaInfo(h.alerta).label : ""}`}</title>
              <rect x={3} y={H - alto} width={W - 8} height={alto} fill={color} rx={2} />
              <text x={W / 2 - 1} y={H + 12} fontSize={9} textAnchor="middle" fill="currentColor">
                {h.clave_semana.slice(-3)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Detalle({ r, run, onClose }: { r: AuditoriaResultado; run: AuditoriaCorrida | null; onClose: () => void }) {
  const [ev, setEv] = useState<AuditoriaEvidencia[] | null>(null);
  const [hist, setHist] = useState<AuditoriaHistorial[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setEv(null);
    setErr(null);
    api
      .auditoriaPrestador(r.prestador_id, run?.run_id)
      .then((d) => {
        if (!vivo) return;
        setEv(d.evidencia);
        setHist(d.historial);
      })
      .catch((e: unknown) => vivo && setErr(e instanceof Error ? e.message : "No se pudo cargar el detalle."));
    return () => {
      vivo = false;
    };
  }, [r.prestador_id, run?.run_id]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const a = alertaInfo(r.alerta);
  const motivos = (r.motivos || "").split(" | ").filter(Boolean);
  const grupos = useMemo(() => {
    const m = new Map<string, AuditoriaEvidencia[]>();
    (ev || []).forEach((e) => m.set(e.tipo_evidencia, [...(m.get(e.tipo_evidencia) || []), e]));
    return [...m.entries()];
  }, [ev]);
  const comp: [string, string][] = [
    ["Tarde comprobado", "tarde_comprobado%"],
    ["Sin hora de llegada", "sin_hora_llegada%"],
    ["Sin demora prometida", "sin_demora_prometida%"],
    ["Carga retroactiva", "carga_tardia_extremo%"],
    ["Incumplimiento total", "incumple_total%"],
  ];
  const tendInc = mnum(r, "incumple_tend_pp");
  const tendIncZ = mnum(r, "incumple_tend_z");
  const tendComp = mnum(r, "incompleto_tend_pp");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto p-md" onClick={onClose}>
      <div
        className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 w-full max-w-5xl my-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="p-md flex items-start justify-between gap-md border-b border-outline-variant/20">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-space-sm flex-wrap">
              <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">{r.prestador || "Sin nombre"}</h3>
              <span className={`font-label-caps text-label-caps rounded-md px-2.5 py-0.5 uppercase font-bold ${a.tone}`}>{a.label}</span>
            </div>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {r.segmento || "—"} · Nivel {r.nivel || "—"} · {nf(r.servicios)} servicios ({nf(r.cerrados)} cerrados) · Prioridad{" "}
              {r.prioridad == null ? "—" : `${nf(r.prioridad, 1)} / 100`} · Confianza {r.confianza || "—"}
              {mnum(r, "pct_hora_llego") != null && ` · ${nf(mnum(r, "pct_hora_llego"), 1)} % con hora de llegada`}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-surface-container-low hover:bg-surface-variant flex items-center justify-center shrink-0"
            aria-label="Cerrar"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        <div className="p-md flex flex-col gap-lg">
          <div className="rounded-xl bg-surface-container-low p-space-md flex items-start gap-space-md">
            <Icon name="gavel" className="text-primary text-[22px] mt-0.5" />
            <p className="font-body-md text-body-md text-on-surface-variant">
              Este resultado es un insumo para <b>auditar</b>: ordena a quién mirar primero y deja a mano la evidencia. No es una sanción
              automática; la decisión la toma una persona después de revisar los servicios.
            </p>
          </div>

          {motivos.length > 0 && (
            <section className="flex flex-col gap-1">
              <h4 className="font-headline-md text-body-md text-on-surface font-semibold">Por qué quedó marcado</h4>
              <ul className="list-disc pl-5 flex flex-col gap-0.5 font-body-md text-body-md text-on-surface">
                {motivos.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </section>
          )}
          {r.informativo && (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              <b>Informativo (no suma a la prioridad):</b> {r.informativo}
            </p>
          )}

          <section className="flex flex-col gap-2">
            <h4 className="font-headline-md text-body-md text-on-surface font-semibold">Indicadores contra sus pares</h4>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              “Esperado” es lo que tendría el prestador si rindiera como los demás en las mismas campañas y tipos de servicio. La señal se
              activa si la diferencia es estadísticamente significativa (z ajustado ≥ {Z_MIN}) y supera un mínimo en puntos porcentuales.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-body-md font-body-md whitespace-nowrap">
                <thead>
                  <tr className="bg-surface-container-low font-label-caps text-label-caps text-on-surface-variant uppercase text-left">
                    <th className="py-2 px-2">Indicador</th>
                    <th className="py-2 px-2 text-right">Casos</th>
                    <th className="py-2 px-2 text-right">Observado</th>
                    <th className="py-2 px-2 text-right">Esperado</th>
                    <th className="py-2 px-2 text-right">Diferencia</th>
                    <th className="py-2 px-2 text-right">z ajustado</th>
                    <th className="py-2 px-2">Señal</th>
                  </tr>
                </thead>
                <tbody>
                  {INDICADORES.filter((i) => mnum(r, `${i.clave}_obs%`) != null).map((i) => {
                    const diff = mnum(r, `${i.clave}_diff_pp`);
                    const z = mnum(r, `${i.clave}_z_adj`);
                    const activa = z != null && diff != null && z >= Z_MIN && diff >= i.efectoMin;
                    return (
                      <tr key={i.clave} className="border-t border-outline-variant/20">
                        <td className="py-2 px-2 font-body-md text-body-md text-on-surface">{i.nombre}</td>
                        <td className="py-2 px-2 text-right">{nf(mnum(r, `${i.clave}_n`))}</td>
                        <td className="py-2 px-2 text-right">{pp(mnum(r, `${i.clave}_obs%`))}</td>
                        <td className="py-2 px-2 text-right">{pp(mnum(r, `${i.clave}_esp%`))}</td>
                        <td className={`py-2 px-2 text-right ${activa ? "text-error font-semibold" : ""}`}>{signed(diff)} pp</td>
                        <td className="py-2 px-2 text-right">{signed(z)}</td>
                        <td className="py-2 px-2">
                          {activa ? (
                            <span className="font-label-caps text-label-caps rounded-md px-2 py-0.5 uppercase font-bold text-error bg-error/10">
                              {i.informativo ? "Informativo" : "Activa"}
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
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div className="flex flex-col gap-2">
              <h4 className="font-headline-md text-body-md text-on-surface font-semibold">De qué está hecho el incumplimiento</h4>
              <table className="w-full text-body-md font-body-md">
                <tbody>
                  {comp.map(([label, k]) => (
                    <tr key={k} className="border-t border-outline-variant/20">
                      <td className="py-1.5 px-2 text-on-surface">{label}</td>
                      <td className="py-1.5 px-2 text-right">{pp(mnum(r, k))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(mnum(r, "extremos_cerrados_fin_de_mes%") != null || mnum(r, "extremos_llegada_y_cierre_juntos%") != null) && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  De sus cargas retroactivas: {nf(mnum(r, "extremos_cerrados_fin_de_mes%"), 0)} % se cerraron en los últimos 3 días del mes y{" "}
                  {nf(mnum(r, "extremos_llegada_y_cierre_juntos%"), 0)} % tienen llegada y cierre cargados juntos.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <h4 className="font-headline-md text-body-md text-on-surface font-semibold">Tendencia (últimos 90 días contra los 90 anteriores)</h4>
              <table className="w-full text-body-md font-body-md">
                <tbody>
                  <tr className="border-t border-outline-variant/20">
                    <td className="py-1.5 px-2 text-on-surface">Incumplimiento</td>
                    <td className="py-1.5 px-2 text-right">
                      {signed(tendInc)} pp {tendIncZ != null && <span className="text-on-surface-variant">(z {signed(tendIncZ)})</span>}
                    </td>
                  </tr>
                  <tr className="border-t border-outline-variant/20">
                    <td className="py-1.5 px-2 text-on-surface">Registro incompleto</td>
                    <td className="py-1.5 px-2 text-right">{signed(tendComp)} pp</td>
                  </tr>
                </tbody>
              </table>
              <h4 className="font-headline-md text-body-md text-on-surface font-semibold pt-2">Prioridad semana a semana</h4>
              {hist.length > 0 ? (
                <MiniHistorial historial={hist} />
              ) : (
                <span className="font-body-sm text-body-sm text-on-surface-variant">Todavía no hay historial.</span>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h4 className="font-headline-md text-body-md text-on-surface font-semibold">Servicios que respaldan la alerta</h4>
            {err && <p className="font-body-md text-body-md text-error">{err}</p>}
            {!err && ev == null && <p className="font-body-md text-body-md text-on-surface-variant">Cargando…</p>}
            {!err && ev != null && grupos.length === 0 && (
              <p className="font-body-md text-body-md text-on-surface-variant">
                No hay servicios de evidencia guardados para este prestador (solo se guardan para los que tienen prioridad mayor a 0).
              </p>
            )}
            {grupos.map(([tipo, filas]) => (
              <div key={tipo} className="flex flex-col gap-1">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  {tipo} ({filas.length})
                </span>
                <div className="overflow-x-auto max-h-72 overflow-y-auto border border-outline-variant/20 rounded-lg">
                  <table className="w-full text-body-sm font-body-sm whitespace-nowrap">
                    <thead className="sticky top-0">
                      <tr className="bg-surface-container-low font-label-caps text-label-caps text-on-surface-variant uppercase text-left">
                        <th className="py-1.5 px-2">Servicio</th>
                        <th className="py-1.5 px-2">Orden</th>
                        <th className="py-1.5 px-2">Campaña</th>
                        <th className="py-1.5 px-2">Tipo</th>
                        <th className="py-1.5 px-2">Alta</th>
                        <th className="py-1.5 px-2">Llegada</th>
                        <th className="py-1.5 px-2">Finalización</th>
                        <th className="py-1.5 px-2 text-right">Prometida</th>
                        <th className="py-1.5 px-2 text-right">Real</th>
                        <th className="py-1.5 px-2">Cierre fin de mes</th>
                        <th className="py-1.5 px-2">Llegada y cierre juntos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((e, i) => (
                        <tr key={`${e.id_servicio_prestado}-${i}`} className="border-t border-outline-variant/20">
                          <td className="py-1.5 px-2">{e.id_servicio_prestado ?? "—"}</td>
                          <td className="py-1.5 px-2">{e.id_orden_de_servicio ?? "—"}</td>
                          <td className="py-1.5 px-2">{String(e.datos?.campana ?? "—")}</td>
                          <td className="py-1.5 px-2">{String(e.datos?.tipo_de_servicio ?? "—")}</td>
                          <td className="py-1.5 px-2">{fechaHora(e.datos?.alta)}</td>
                          <td className="py-1.5 px-2">{fechaHora(e.datos?.llegada)}</td>
                          <td className="py-1.5 px-2">{fechaHora(e.datos?.finalizacion)}</td>
                          <td className="py-1.5 px-2 text-right">{minutos(e.datos?.demora_prometida)}</td>
                          <td className="py-1.5 px-2 text-right">{minutos(e.datos?.demora_real)}</td>
                          <td className="py-1.5 px-2">{String(e.datos?.cierre_ultimos_3_dias_del_mes ?? "—")}</td>
                          <td className="py-1.5 px-2">{String(e.datos?.llegada_y_cierre_juntos ?? "—")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

type SortKey = "prestador" | "servicios" | "cerrados" | "prioridad" | "alerta" | "nivel";

function descargarCsv(filas: AuditoriaResultado[], clave: string) {
  const cols: [string, (r: AuditoriaResultado) => unknown][] = [
    ["Prestador", (r) => r.prestador],
    ["Segmento", (r) => r.segmento],
    ["Nivel", (r) => r.nivel],
    ["Servicios", (r) => r.servicios],
    ["Cerrados", (r) => r.cerrados],
    ["Prioridad", (r) => r.prioridad],
    ["Alerta", (r) => alertaInfo(r.alerta).label],
    ["Confianza", (r) => r.confianza],
    ["% tarde comprobado", (r) => mnum(r, "tarde_comprobado%")],
    ["% sin hora de llegada", (r) => mnum(r, "sin_hora_llegada%")],
    ["% carga retroactiva", (r) => mnum(r, "carga_tardia_extremo%")],
    ["% incumple total", (r) => mnum(r, "incumple_total%")],
    ["% incumple esperado", (r) => mnum(r, "incumple_esp%")],
    ["% registro incompleto", (r) => mnum(r, "incompleto_obs%")],
    ["Motivos", (r) => r.motivos],
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const texto = [cols.map((c) => c[0]).join(";"), ...filas.map((r) => cols.map((c) => esc(c[1](r))).join(";"))].join("\r\n");
  const blob = new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `auditoria-prestadores-${clave}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditoriaPanel() {
  const [corridas, setCorridas] = useState<AuditoriaCorridaResumen[]>([]);
  const [runId, setRunId] = useState("");
  const [data, setData] = useState<{ corrida: AuditoriaCorrida | null; resultados: AuditoriaResultado[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fAlerta, setFAlerta] = useState<"todas" | "candidato" | "observacion" | "sin">("todas");
  const [fSegmento, setFSegmento] = useState<"Registra" | "Sin trazabilidad" | "todos">("Registra");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "prioridad", dir: "desc" });
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<AuditoriaResultado | null>(null);

  useEffect(() => {
    api
      .auditoriaCorridas()
      .then((d) => setCorridas(d.corridas))
      .catch(() => undefined); // si falla, igual se muestra la ultima corrida
  }, []);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError(null);
    api
      .auditoriaResultados(runId || undefined)
      .then((d) => vivo && setData(d))
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar la auditoría."))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [runId]);

  const filas = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = (data?.resultados || []).filter((r) => {
      if (fSegmento !== "todos" && r.segmento !== fSegmento) return false;
      if (q && !(r.prestador || "").toLowerCase().includes(q)) return false;
      const rank = alertaInfo(r.alerta).rank;
      if (fAlerta === "candidato") return rank === 2;
      if (fAlerta === "observacion") return rank === 1;
      if (fAlerta === "sin") return rank === 0;
      return true;
    });
    const val = (r: AuditoriaResultado): string | number | null => {
      switch (sort.key) {
        case "prestador":
          return (r.prestador || "").toLowerCase();
        case "alerta":
          return alertaInfo(r.alerta).rank;
        case "nivel":
          return r.nivel;
        default:
          return r[sort.key];
      }
    };
    return [...arr].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es");
      return sort.dir === "asc" ? c : -c;
    });
  }, [data, search, fAlerta, fSegmento, sort]);

  const corrida = data?.corrida || null;
  const resumen = corrida?.conteos?.resumen || {};
  const alertas = corrida?.conteos?.alertas_registran || {};
  const totalPaginas = Math.max(1, Math.ceil(filas.length / PAGE_SIZE));
  const visibles = filas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const th = (key: SortKey, label: string, right = false) => (
    <th className={`py-2 pr-3 ${right ? "text-right" : ""}`}>
      <button
        type="button"
        className={`uppercase hover:text-on-surface flex items-center gap-1 ${right ? "ml-auto" : ""}`}
        onClick={() => {
          setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
          setPage(1);
        }}
      >
        {label}
        {sort.key === key && <Icon name={sort.dir === "desc" ? "arrow_downward" : "arrow_upward"} className="text-[14px]" />}
      </button>
    </th>
  );
  const v90 = resumen.incumple_total_90d;
  const vPrev = resumen.incumple_total_previo_90d;

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-xl">
        <Icon name="progress_activity" className="animate-spin text-[28px] text-primary" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-xl px-md py-sm">
        <Icon name="warning" filled className="text-[#f59e0b] text-[20px] mt-0.5 shrink-0" />
        <p className="font-body-md text-body-md text-on-surface">{error}</p>
      </div>
    );
  }
  if (!corrida) {
    return (
      <p className="font-body-md text-body-md text-on-surface-variant text-center py-xl">
        Todavía no hay ninguna corrida de auditoría guardada. El motor corre los lunes; también se puede ejecutar a mano desde GitHub Actions.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      <section className="flex flex-col gap-space-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex flex-col">
            <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">Auditoría de prestadores</h3>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Semana {corrida.clave_semana} · datos del {soloFecha(corrida.periodo_desde)} al {soloFecha(corrida.periodo_hasta)} · motor v
              {corrida.version_motor} · calculada el {fechaHora(corrida.ejecutada_at)}
            </span>
          </div>
          <label className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
            Corrida
            <select
              className="form-input-styled font-body-md text-body-md text-on-surface h-8 py-0"
              value={runId || corrida.run_id}
              onChange={(e) => {
                setRunId(e.target.value);
                setPage(1);
              }}
            >
              {corridas.map((c) => (
                <option key={c.run_id} value={c.run_id}>
                  {c.clave_semana} ({soloFecha(c.ejecutada_at)})
                </option>
              ))}
              {corridas.length === 0 && <option value={corrida.run_id}>{corrida.clave_semana}</option>}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-md">
          <Kpi titulo="Candidatos a auditoría" valor={nf(alertas[CANDIDATO] ?? 0)} detalle="z ajustado ≥ 3 y volumen suficiente" tone="text-error" />
          <Kpi titulo="En observación" valor={nf(alertas[OBSERVACION] ?? 0)} detalle="Alguna señal significativa, menos fuerte" tone="text-[#b5610a]" />
          <Kpi titulo="Sin alerta" valor={nf(alertas["Sin alerta"] ?? 0)} detalle={`${nf(resumen.prestadores_registran ?? undefined)} prestadores que registran`} />
          <Kpi
            titulo="Sin trazabilidad"
            valor={nf(resumen.prestadores_sin_trazabilidad ?? undefined)}
            detalle={`${nf(resumen.servicios_sin_trazabilidad ?? undefined)} servicios: no registran la llegada`}
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-md">
          <Kpi titulo="Cumplen la demora" valor={pp(resumen.pct_cumple)} detalle="Prestadores que registran" />
          <Kpi titulo="Tarde comprobado" valor={pp(resumen.pct_tarde_comprobado)} />
          <Kpi titulo="Sin hora de llegada" valor={pp(resumen.pct_sin_hora_llegada)} />
          <Kpi titulo="Carga retroactiva" valor={pp(resumen.pct_carga_retroactiva)} />
          <Kpi
            titulo="Incumple (90 días)"
            valor={pp(v90)}
            detalle={vPrev != null && v90 != null ? `${signed(v90 - vPrev)} pp contra los 90 días anteriores` : undefined}
          />
        </div>
        <details className="rounded-xl bg-surface-container-low p-space-md font-body-md text-body-md text-on-surface-variant">
          <summary className="cursor-pointer font-semibold text-on-surface">Cómo leer esta pantalla</summary>
          <div className="pt-2 flex flex-col gap-1">
            <p>
              Cada prestador se compara contra los demás en las mismas campañas y tipos de servicio. Se marca cuando se aparta más de lo que
              explicaría el azar y la diferencia es relevante en puntos porcentuales.
            </p>
            <p>
              <b>Prioridad</b> (0 a 100): suma ponderada de las señales activas; sirve para ordenar la lista. <b>Candidato a auditoría</b>:
              señal fuerte (z ajustado ≥ 3) con al menos 300 servicios cerrados. <b>Observación</b>: alguna señal activa, menos fuerte.
            </p>
            <p>
              <b>Sin trazabilidad</b>: prestadores que casi no registran la hora de llegada; no se les puede medir la demora, se listan aparte. Los
              servicios programados no se incluyen. Nada de esto es una sanción automática: hay que revisar la evidencia de cada caso.
            </p>
          </div>
        </details>
      </section>

      <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col">
        <div className="p-md flex flex-col gap-space-md">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm">
            <div className="flex items-center gap-space-xs">
              <Icon name="fact_check" className="text-primary text-[22px]" />
              <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">Prestadores priorizados</h3>
              <span className="font-label-code text-label-code text-on-surface-variant">({nf(filas.length)})</span>
            </div>
            <div className="flex items-center gap-space-sm flex-wrap">
              <div className="relative w-full sm:w-72">
                <Icon name="search" className="absolute left-3 top-2.5 text-[18px] text-on-surface-variant" />
                <input
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface placeholder:text-on-surface-variant font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-lowest focus:shadow-sm transition-all"
                  placeholder="Buscar por prestador…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <button
                type="button"
                className="flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-primary-container text-on-primary hover:bg-primary transition-all font-body-sm text-body-sm font-medium shadow-sm"
                onClick={() => descargarCsv(filas, corrida.clave_semana)}
              >
                <Icon name="download" className="text-[17px]" />
                Descargar CSV
              </button>
            </div>
          </div>
          <div className="flex items-center gap-space-md flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-container-low font-body-sm text-body-sm flex-wrap">
              {(
                [
                  ["todas", "Todas"],
                  ["candidato", "Candidatos"],
                  ["observacion", "Observación"],
                  ["sin", "Sin alerta"],
                ] as ["todas" | "candidato" | "observacion" | "sin", string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setFAlerta(k);
                    setPage(1);
                  }}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    fAlerta === k ? "bg-surface-container-lowest text-on-surface font-medium shadow-xs" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-container-low font-body-sm text-body-sm flex-wrap">
              {(
                [
                  ["Registra", "Registran la llegada"],
                  ["Sin trazabilidad", "Sin trazabilidad"],
                  ["todos", "Todos"],
                ] as ["Registra" | "Sin trazabilidad" | "todos", string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setFSegmento(k);
                    setPage(1);
                  }}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    fSegmento === k ? "bg-surface-container-lowest text-on-surface font-medium shadow-xs" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto p-md pt-0">
          <table className="w-full text-body-md font-body-md whitespace-nowrap">
            <thead>
              <tr className="bg-surface-container-low font-label-caps text-label-caps text-on-surface-variant text-left">
                {th("prestador", "Prestador")}
                {th("nivel", "Nivel")}
                {th("servicios", "Servicios", true)}
                {th("cerrados", "Cerrados", true)}
                {th("prioridad", "Prioridad", true)}
                {th("alerta", "Alerta")}
                <th className="py-2 pr-3 uppercase">Motivo principal</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => {
                const a = alertaInfo(r.alerta);
                const motivo = (r.motivos || "").split(" | ")[0];
                const barra = r.prioridad == null ? 0 : Math.min(100, r.prioridad);
                return (
                  <tr
                    key={r.prestador_id}
                    className="border-t border-outline-variant/20 hover:bg-surface-container-low cursor-pointer"
                    onClick={() => setSel(r)}
                  >
                    <td className="py-2 pr-3 font-body-md text-body-md text-on-surface font-medium">{r.prestador || "Sin nombre"}</td>
                    <td className="py-2 pr-3 text-on-surface-variant">{r.nivel || "—"}</td>
                    <td className="py-2 pr-3 text-right">{nf(r.servicios)}</td>
                    <td className="py-2 pr-3 text-right">{nf(r.cerrados)}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                          <div
                            className={`h-full ${a.rank === 2 ? "bg-error" : a.rank === 1 ? "bg-[#f59e0b]" : "bg-primary"}`}
                            style={{ width: `${barra}%` }}
                          />
                        </div>
                        <span className="w-10 text-right">{r.prioridad == null ? "—" : nf(r.prioridad, 1)}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`font-label-caps text-label-caps rounded-md px-2.5 py-0.5 uppercase font-bold ${a.tone}`}>{a.label}</span>
                    </td>
                    <td className="py-2 pr-3 font-body-sm text-body-sm text-on-surface-variant max-w-md truncate" title={r.motivos || ""}>
                      {motivo || "—"}
                    </td>
                  </tr>
                );
              })}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-lg text-center font-body-md text-body-md text-on-surface-variant">
                    No hay prestadores con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-md py-sm border-t border-outline-variant/20 flex-wrap gap-2">
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            {filas.length === 0
              ? "Sin registros"
              : `Mostrando ${nf((page - 1) * PAGE_SIZE + 1)}–${nf(Math.min(page * PAGE_SIZE, filas.length))} de ${nf(filas.length)}`}
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
              disabled={page >= totalPaginas}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      </section>

      {sel && <Detalle r={sel} run={corrida} onClose={() => setSel(null)} />}
    </div>
  );
}
