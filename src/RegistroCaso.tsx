/* Registro del caso de un prestador en la pantalla de Auditoría: historia de decisiones y formulario para registrar una
   nueva (estado, nota, quién la registra y, opcionalmente, próxima revisión). Solo se agregan decisiones: nunca se
   editan ni se borran. Escribir exige una clave compartida (la pide una vez y la recuerda este navegador). */
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { AuditoriaEstadoRevision, AuditoriaRevision, AuditoriaRevisor } from "./api";
import { InfoTip } from "./InfoTip";
import type { Tooltip } from "./InfoTip";

export type GrupoRevision = "sin" | "curso" | "cerrado";
export const ESTADO_INFO: Record<string, { label: string; tone: string; grupo: GrupoRevision }> = {
  Pendiente: { label: "Sin revisar", tone: "text-on-surface-variant bg-surface-container-highest", grupo: "sin" },
  "En revision": { label: "En revisión", tone: "text-[#b5610a] bg-[#f59e0b]/15", grupo: "curso" },
  "Requiere evidencia": { label: "Requiere evidencia", tone: "text-[#b5610a] bg-[#f59e0b]/15", grupo: "curso" },
  Descartado: { label: "Descartado", tone: "text-tertiary bg-tertiary/10", grupo: "cerrado" },
  "Incumplimiento confirmado": { label: "Incumplimiento confirmado", tone: "text-error bg-error/10", grupo: "cerrado" },
};
export const infoEstado = (estado?: string | null) => ESTADO_INFO[estado || "Pendiente"] ?? ESTADO_INFO.Pendiente;

const ESTADOS_FORM: AuditoriaEstadoRevision[] = ["En revision", "Requiere evidencia", "Descartado", "Incumplimiento confirmado", "Pendiente"];
const ESTADOS_CON_NOTA = ["Requiere evidencia", "Descartado", "Incumplimiento confirmado"];
const TIPS: Record<string, Tooltip> = {
  registro: {
    titulo: "Registro del caso",
    leer: "Deja constancia de quién revisó a este prestador, qué decidió y por qué. Sirve para no repetir revisiones, saber en qué quedó cada caso y medir qué parte de las alertas se confirma.",
    calculo: "Solo se agregan decisiones: no se editan ni se borran. El estado actual del prestador es la última decisión registrada.",
  },
  clave: {
    titulo: "Clave de revisión",
    leer: "Para registrar una decisión hace falta la clave compartida del equipo de auditoría. La pide una sola vez y este navegador la recuerda.",
  },
};

const LS_CLAVE = "auditoria_clave_revision";
const LS_REVISOR = "auditoria_revisor_id";
const ls = {
  get: (k: string) => {
    try {
      return window.localStorage.getItem(k) || "";
    } catch {
      return "";
    }
  },
  set: (k: string, v: string) => {
    try {
      if (v) window.localStorage.setItem(k, v);
      else window.localStorage.removeItem(k);
    } catch {
      /* sin almacenamiento: se pide cada vez */
    }
  },
};
const nuevoId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
const fechaHora = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
};
const soloFecha = (s?: string | null) => {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : s;
};

export function BadgeRevision({ estado }: { estado?: string | null }) {
  const e = infoEstado(estado);
  return (
    <span className={`font-label-caps text-label-caps rounded-md px-2.5 py-0.5 uppercase font-bold whitespace-normal ${e.tone}`}>{e.label}</span>
  );
}

export default function RegistroCaso({
  prestadorId,
  runId,
  onRegistrado,
}: {
  prestadorId: string;
  runId: string | null;
  onRegistrado: () => void;
}) {
  const [historia, setHistoria] = useState<AuditoriaRevision[] | null>(null);
  const [revisores, setRevisores] = useState<AuditoriaRevisor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState(ls.get(LS_CLAVE));
  const [claveInput, setClaveInput] = useState("");
  const [estado, setEstado] = useState<AuditoriaEstadoRevision>("En revision");
  const [revisorId, setRevisorId] = useState(ls.get(LS_REVISOR));
  const [nota, setNota] = useState("");
  const [fundamento, setFundamento] = useState("");
  const [proxima, setProxima] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [idem, setIdem] = useState(nuevoId());
  const [adminAbierto, setAdminAbierto] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [todosRevisores, setTodosRevisores] = useState<AuditoriaRevisor[]>([]);

  const cargar = useCallback(() => {
    api
      .auditoriaRevisionesPrestador(prestadorId)
      .then((d) => setHistoria(d.revisiones))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "No se pudo leer el registro del caso."));
  }, [prestadorId]);

  useEffect(() => {
    setHistoria(null);
    setError(null);
    cargar();
  }, [cargar]);

  useEffect(() => {
    api
      .auditoriaRevisores()
      .then((d) => setRevisores(d.revisores))
      .catch(() => undefined);
  }, []);

  const exigeNota = ESTADOS_CON_NOTA.includes(estado);
  const notaOk = !exigeNota || nota.trim().length >= 10;
  const puede = !!revisorId && notaOk && !enviando && !!clave;
  const actual = historia && historia.length > 0 ? historia[0] : null;

  async function guardarClave() {
    setError(null);
    try {
      await api.auditoriaVerificarClave(claveInput.trim());
      ls.set(LS_CLAVE, claveInput.trim());
      setClave(claveInput.trim());
      setClaveInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo verificar la clave.");
    }
  }

  function olvidarClave() {
    ls.set(LS_CLAVE, "");
    setClave("");
  }

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      await api.auditoriaRegistrarRevision(clave, {
        prestador_id: prestadorId,
        run_id: runId,
        estado,
        revisor_id: revisorId,
        comentario: nota.trim() || null,
        fundamento: fundamento.trim() || null,
        proxima_revision: proxima || null,
        idempotencia: idem,
      });
      ls.set(LS_REVISOR, revisorId);
      setNota("");
      setFundamento("");
      setProxima("");
      setIdem(nuevoId());
      setAbierto(false);
      cargar();
      onRegistrado();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo registrar la decisión.";
      if (/clave de revision incorrecta/i.test(msg)) olvidarClave();
      setError(msg);
    } finally {
      setEnviando(false);
    }
  }

  async function cargarAdmin() {
    try {
      const d = await api.auditoriaRevisores(true);
      setTodosRevisores(d.revisores);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la lista de revisores.");
    }
  }

  async function adminAccion(accion: "agregar" | "desactivar" | "activar", id?: string) {
    setError(null);
    try {
      const d = await api.auditoriaAdminRevisor(clave, { accion, nombre: accion === "agregar" ? nombreNuevo.trim() : undefined, id });
      setTodosRevisores(d.revisores);
      setRevisores(d.revisores.filter((r) => r.activo));
      if (accion === "agregar") setNombreNuevo("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo actualizar la lista.";
      if (/clave de revision incorrecta/i.test(msg)) olvidarClave();
      setError(msg);
    }
  }

  const campo = "w-full rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-sm py-1.5 font-body-md text-body-md text-on-surface";

  return (
    <section className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 flex flex-col gap-sm p-md">
      <header className="flex items-center gap-3 flex-wrap">
        <span className="material-symbols-outlined text-primary">assignment_turned_in</span>
        <h4 className="font-title-lg text-title-lg text-on-surface flex items-center gap-1">
          Registro del caso
          <InfoTip {...TIPS.registro} />
        </h4>
        <span className="ml-auto flex items-center gap-2">
          {historia && <BadgeRevision estado={actual?.estado} />}
          {!abierto && (
            <button
              type="button"
              className="h-8 px-sm rounded bg-primary-container text-on-primary-container font-label-md text-label-md hover:bg-primary hover:text-on-primary transition-colors"
              onClick={() => setAbierto(true)}
            >
              Registrar una decisión
            </button>
          )}
        </span>
      </header>

      {error && <p className="font-body-md text-body-md text-error">{error}</p>}

      {abierto && (
        <div className="rounded-lg bg-surface-container-low p-sm flex flex-col gap-sm">
          {!clave ? (
            <div className="flex flex-col gap-1.5">
              <span className="font-body-md text-body-md text-on-surface flex items-center gap-1">
                Ingresá la clave de revisión (se pide una sola vez)
                <InfoTip {...TIPS.clave} />
              </span>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="password"
                  className={`${campo} max-w-xs`}
                  value={claveInput}
                  onChange={(e) => setClaveInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && claveInput.trim() && guardarClave()}
                  placeholder="Clave"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="h-9 px-sm rounded bg-primary text-on-primary font-label-md text-label-md disabled:opacity-40"
                  disabled={!claveInput.trim()}
                  onClick={guardarClave}
                >
                  Continuar
                </button>
                <button type="button" className="h-9 px-sm rounded bg-surface-variant font-label-md text-label-md" onClick={() => setAbierto(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-sm">
                <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface-variant">
                  Quién registra
                  <select className={campo} value={revisorId} onChange={(e) => setRevisorId(e.target.value)}>
                    <option value="">Elegir…</option>
                    {revisores.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface-variant">
                  Estado del caso
                  <select className={campo} value={estado} onChange={(e) => setEstado(e.target.value as AuditoriaEstadoRevision)}>
                    {ESTADOS_FORM.map((e) => (
                      <option key={e} value={e}>
                        {e === "Pendiente" ? "Volver a “sin revisar”" : infoEstado(e).label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface-variant">
                  Próxima revisión (opcional)
                  <input type="date" className={campo} value={proxima} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setProxima(e.target.value)} />
                </label>
              </div>
              {revisores.length === 0 && (
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Todavía no hay revisores cargados. Agregalos en “Administrar revisores” (abajo).
                </p>
              )}
              <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface-variant">
                Nota {exigeNota ? "(obligatoria, mínimo 10 caracteres)" : "(opcional)"}
                <textarea
                  className={`${campo} min-h-[72px]`}
                  value={nota}
                  maxLength={2000}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Qué se revisó y por qué se decidió esto"
                />
              </label>
              <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface-variant">
                Fundamento (opcional): servicios revisados, base contractual, evidencia
                <textarea className={`${campo} min-h-[48px]`} value={fundamento} maxLength={2000} onChange={(e) => setFundamento(e.target.value)} />
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="h-9 px-sm rounded bg-primary text-on-primary font-label-md text-label-md disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={!puede}
                  onClick={enviar}
                >
                  {enviando ? "Guardando…" : "Guardar decisión"}
                </button>
                <button type="button" className="h-9 px-sm rounded bg-surface-variant font-label-md text-label-md" onClick={() => setAbierto(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="ml-auto font-label-md text-label-md text-primary hover:underline"
                  onClick={() => {
                    setAdminAbierto(!adminAbierto);
                    if (!adminAbierto) void cargarAdmin();
                  }}
                >
                  Administrar revisores
                </button>
                <button type="button" className="font-label-md text-label-md text-on-surface-variant hover:underline" onClick={olvidarClave}>
                  Olvidar la clave en este navegador
                </button>
              </div>
              {adminAbierto && (
                <div className="rounded-lg bg-surface-container-lowest p-sm flex flex-col gap-1.5">
                  <span className="font-label-md text-label-md text-on-surface-variant uppercase">Revisores</span>
                  <ul className="flex flex-col gap-1">
                    {todosRevisores.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 font-body-md text-body-md">
                        <span className={r.activo ? "text-on-surface" : "text-on-surface-variant line-through"}>{r.nombre}</span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant">
                          {r.ultima_actividad ? `última decisión: ${fechaHora(r.ultima_actividad)}` : "sin decisiones todavía"}
                        </span>
                        <button
                          type="button"
                          className="ml-auto font-label-md text-label-md text-primary hover:underline"
                          onClick={() => adminAccion(r.activo ? "desactivar" : "activar", r.id)}
                        >
                          {r.activo ? "Quitar de la lista" : "Volver a activar"}
                        </button>
                      </li>
                    ))}
                    {todosRevisores.length === 0 && <li className="font-body-md text-body-md text-on-surface-variant">Todavía no hay revisores.</li>}
                  </ul>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      className={`${campo} max-w-xs`}
                      value={nombreNuevo}
                      maxLength={80}
                      placeholder="Nombre y apellido"
                      onChange={(e) => setNombreNuevo(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && nombreNuevo.trim().length >= 3 && adminAccion("agregar")}
                    />
                    <button
                      type="button"
                      className="h-9 px-sm rounded bg-primary-container text-on-primary-container font-label-md text-label-md disabled:opacity-40"
                      disabled={nombreNuevo.trim().length < 3}
                      onClick={() => adminAccion("agregar")}
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {historia == null ? (
        <p className="font-body-md text-body-md text-on-surface-variant">Cargando…</p>
      ) : historia.length === 0 ? (
        <p className="font-body-md text-body-md text-on-surface-variant">Todavía nadie registró una decisión sobre este prestador.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {historia.map((h) => (
            <li key={h.id} className="border-l-2 border-outline-variant/40 pl-sm flex flex-col gap-0.5">
              <span className="flex items-center gap-2 flex-wrap font-body-md text-body-md text-on-surface">
                <BadgeRevision estado={h.estado} />
                <b>{h.responsable || "Sin nombre"}</b>
                <span className="text-on-surface-variant">{fechaHora(h.created_at)}</span>
                {h.clave_semana && <span className="text-on-surface-variant">· semana {h.clave_semana}</span>}
              </span>
              {h.comentario && <p className="font-body-md text-body-md text-on-surface whitespace-pre-line">{h.comentario}</p>}
              {h.fundamento && <p className="font-body-sm text-body-sm text-on-surface-variant whitespace-pre-line">Fundamento: {h.fundamento}</p>}
              {h.proxima_revision && (
                <span className="font-label-sm text-label-sm text-on-surface-variant">Próxima revisión: {soloFecha(h.proxima_revision)}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
