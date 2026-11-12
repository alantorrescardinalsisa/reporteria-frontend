/* NUEVO (2026-11-12, ADITIVO): detalle de la tarjeta "Trazabilidad completa del servicio".
   Ventana con los servicios a los que les falta (o no) un paso de la secuencia Alta -> Despachador -> Asignado -> Envio OK ->
   Llego -> Finalizo, o cualquiera de ellos ("Cualquier paso" = secuencia incompleta). Usa los mismos filtros globales que la
   tarjeta. Para no traer miles de servicios juntos: ranking de prestadores (clic = filtra), filtros de campania y tipo,
   paginado de a 100 y exportacion a Excel (tope en el servidor). Los servicios cancelados, en curso o pendientes no se listan
   como faltantes (decision del usuario): la ventana informa cuantos quedaron afuera para que la cuenta cierre con la tarjeta. */
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { TrackeoFilters, TrazDetalle, TrazPaso } from "./api";

const nf = (v?: number | null) => (v == null ? "—" : new Intl.NumberFormat("es-AR").format(v));
const pct = (v?: number | null) =>
  v == null ? "—" : `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(v * 100)} %`;

const PASOS: { clave: TrazPaso; etiqueta: string }[] = [
  { clave: "algun", etiqueta: "Cualquier paso" },
  { clave: "alta", etiqueta: "Alta del servicio" },
  { clave: "despachador", etiqueta: "Pasado al despachador" },
  { clave: "asignado", etiqueta: "Asignado" },
  { clave: "envio_ok", etiqueta: "Envío OK" },
  { clave: "llego", etiqueta: "Llegó a dar servicio" },
  { clave: "finalizo", etiqueta: "Finalizó" },
];
const CORTO: Record<string, string> = {
  alta: "Alta",
  despachador: "Despach.",
  asignado: "Asignado",
  envio_ok: "Envío OK",
  llego: "Llegó",
  finalizo: "Finalizó",
};

function fechaHora(v?: string | null) {
  if (!v) return "Sin dato";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function Icono({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>;
}

function descargarExcel(filas: Record<string, string | number>[], nombre: string) {
  const esc = (x: unknown) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cols = Object.keys(filas[0] || {});
  const celda = (v: unknown) =>
    `<Cell><Data ss:Type="${typeof v === "number" ? "Number" : "String"}">${esc(v)}</Data></Cell>`;
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#E5E7EB" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="Datos"><Table><Row>${cols
    .map((c) => `<Cell ss:StyleID="h"><Data ss:Type="String">${esc(c)}</Data></Cell>`)
    .join("")}</Row>${filas.map((f) => `<Row>${cols.map((c) => celda(f[c])).join("")}</Row>`).join("")}</Table></Worksheet>
</Workbook>`;
  const url = URL.createObjectURL(new Blob([xml], { type: "application/vnd.ms-excel" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TrazabilidadDetalle({
  filters,
  pasoInicial,
  onClose,
}: {
  filters: TrackeoFilters;
  pasoInicial: TrazPaso;
  onClose: () => void;
}) {
  const [paso, setPaso] = useState<TrazPaso>(pasoInicial);
  const [modo, setModo] = useState<"falta" | "tiene">("falta");
  const [pagina, setPagina] = useState(1);
  const [prestador, setPrestador] = useState<string>("");
  const [campana, setCampana] = useState<string>("");
  const [tipo, setTipo] = useState<string>("");
  const [verTodos, setVerTodos] = useState(false);
  const [datos, setDatos] = useState<TrazDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const pedido = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const mio = ++pedido.current;
    setCargando(true);
    setError(null);
    api
      .trackeoTrazabilidadDetalle(filters, {
        paso,
        modo,
        pagina,
        tamano_pagina: 100,
        prestador_foco: prestador || undefined,
        campana_foco: campana || undefined,
        tipo_foco: tipo || undefined,
      })
      .then((x) => {
        if (mio !== pedido.current) return;
        setDatos(x);
        setCargando(false);
      })
      .catch((e) => {
        if (mio !== pedido.current) return;
        setError(String(e?.message || e));
        setCargando(false);
      });
  }, [filters, paso, modo, pagina, prestador, campana, tipo]);

  // Al cambiar de paso / modo / filtros se vuelve a la primera pagina.
  const cambiar = (fn: () => void) => {
    fn();
    setPagina(1);
  };

  async function exportar() {
    setExportando(true);
    try {
      const x = await api.trackeoTrazabilidadDetalle(filters, {
        paso,
        modo,
        prestador_foco: prestador || undefined,
        campana_foco: campana || undefined,
        tipo_foco: tipo || undefined,
        exportar: true,
      });
      const etiquetas = x.pasos;
      descargarExcel(
        x.servicios.map((s) => {
          const f: Record<string, string | number> = {
            "ID orden": s.id_orden_de_servicio ?? "",
            "ID servicio": s.id_servicio_prestado ?? "",
            Prestador: s.prestador ?? "",
            Campaña: s.campana ?? "",
            Tipo: s.tipo_de_servicio ?? "",
            Estado: s.estado ?? "",
          };
          etiquetas.forEach((p) => (f[p.etiqueta] = s.pasos[p.clave] ? fechaHora(s.pasos[p.clave]) : "FALTA"));
          f["Pasos que faltan"] = s.faltan.join(" · ");
          return f;
        }),
        `trazabilidad-${modo}-${paso}.xls`,
      );
      if (x.truncado)
        setError(`Se exportaron los primeros ${nf(x.servicios.length)} de ${nf(x.cantidad_total)}: filtrá por prestador, campaña o tipo para ver el resto.`);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setExportando(false);
    }
  }

  const etapa = PASOS.find((p) => p.clave === paso)?.etiqueta ?? "";
  const titulo =
    paso === "algun"
      ? modo === "falta"
        ? "Servicios con la secuencia incompleta"
        : "Servicios con la secuencia completa"
      : modo === "falta"
        ? `Servicios sin el paso «${etapa}»`
        : `Servicios que completaron el paso «${etapa}»`;
  const ranking = datos ? (verTodos ? datos.ranking : datos.ranking.slice(0, 8)) : [];
  const prestadorActivo = datos?.ranking.find((r) => r.prestador_id === prestador)?.prestador ?? (prestador ? "Prestador elegido" : "");

  return (
    <div className="fixed inset-0 bg-on-surface/40 z-[100] flex items-center justify-center p-md" onMouseDown={onClose}>
      <section
        className="bg-surface-container-lowest rounded-xl card-shadow border border-outline-variant/20 w-full max-w-6xl flex flex-col overflow-hidden"
        style={{ height: "calc(100vh - 2rem)", maxHeight: "100%" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 px-md py-sm border-b border-outline-variant/20" style={{ flexShrink: 0 }}>
          <div className="min-w-0">
            <h2 className="font-title-lg text-title-lg text-on-surface">{titulo}</h2>
            {datos && (
              <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">
                {modo === "falta" ? (
                  <>
                    La tarjeta cuenta {nf(datos.n_tarjeta)}
                    {datos.excluidos_por_estado > 0 && (
                      <>
                        {" "}
                        · {nf(datos.excluidos_por_estado)} son servicios cancelados, en curso o pendientes y no se listan (no se
                        espera que tengan el paso)
                      </>
                    )}
                    {" "}· <b>{nf(datos.n_tarjeta - datos.excluidos_por_estado)} para revisar</b>
                  </>
                ) : (
                  <>La tarjeta cuenta {nf(datos.n_tarjeta)} servicios con este dato</>
                )}
                {(prestador || campana || tipo) && <> · con tus filtros: <b>{nf(datos.cantidad_total)}</b></>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              className="h-9 px-sm rounded bg-primary-container text-on-primary-container font-label-md text-label-md flex items-center gap-2 hover:bg-primary hover:text-on-primary transition-colors disabled:opacity-50"
              onClick={exportar}
              disabled={exportando || !datos || datos.cantidad_total === 0}
            >
              <Icono name={exportando ? "progress_activity" : "download"} className={`text-[18px] ${exportando ? "animate-spin" : ""}`} />
              Exportar a Excel
            </button>
            <button
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <Icono name="close" />
            </button>
          </div>
        </header>

        <div className="px-md py-sm border-b border-outline-variant/20 flex flex-col gap-sm" style={{ flexShrink: 0 }}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full bg-surface-container-low p-0.5">
              {(["falta", "tiene"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => cambiar(() => setModo(m))}
                  className={`h-8 px-sm rounded-full font-label-md text-label-md transition-colors ${
                    modo === m ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-variant"
                  }`}
                >
                  {m === "falta" ? "Les falta" : "Lo completaron"}
                </button>
              ))}
            </div>
            <span className="w-px h-6 bg-outline-variant/40 mx-1" />
            {PASOS.map((p) => (
              <button
                key={p.clave}
                type="button"
                onClick={() => cambiar(() => setPaso(p.clave))}
                className={`h-8 px-sm rounded-full font-label-md text-label-md transition-colors ${
                  paso === p.clave
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-variant"
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 rounded border border-outline-variant/40 bg-surface-container-lowest px-2 font-label-md text-label-md"
              value={campana}
              onChange={(e) => cambiar(() => setCampana(e.target.value))}
              aria-label="Campaña"
            >
              <option value="">Todas las campañas</option>
              {(datos?.campanas ?? []).map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded border border-outline-variant/40 bg-surface-container-lowest px-2 font-label-md text-label-md"
              value={tipo}
              onChange={(e) => cambiar(() => setTipo(e.target.value))}
              aria-label="Tipo de servicio"
            >
              <option value="">Todos los tipos</option>
              {(datos?.tipos ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {prestador && (
              <button
                type="button"
                onClick={() => cambiar(() => setPrestador(""))}
                className="h-9 px-sm rounded-full bg-primary/10 text-primary font-label-md text-label-md flex items-center gap-1"
              >
                {prestadorActivo}
                <Icono name="close" className="text-[16px]" />
              </button>
            )}
          </div>
          {paso === "algun" && modo === "falta" && (
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              Cada fila muestra la secuencia completa: ✓ = paso cargado, ✗ = falta. Pasá el mouse por cada marca para ver la fecha y hora.
            </p>
          )}
        </div>

        {datos && datos.ranking.length > 0 && (
          <div className="px-md py-sm border-b border-outline-variant/20" style={{ flexShrink: 0 }}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                {modo === "falta" ? "Prestadores con más faltantes" : "Prestadores con más servicios"} · clic para filtrar
              </span>
              {datos.ranking.length > 8 && (
                <button type="button" className="font-label-md text-label-md text-primary" onClick={() => setVerTodos((v) => !v)}>
                  {verTodos ? "Ver menos" : `Ver ${datos.ranking.length >= 100 ? "los primeros 100" : "todos"}`}
                </button>
              )}
            </div>
            <div
              className="flex gap-2"
              style={
                verTodos
                  ? { flexWrap: "wrap", maxHeight: "9rem", overflowY: "auto" }
                  : { flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4 }
              }
            >
              {ranking.map((r) => (
                <button
                  key={r.prestador_id}
                  type="button"
                  onClick={() => cambiar(() => setPrestador(prestador === r.prestador_id ? "" : r.prestador_id))}
                  style={{ flexShrink: 0, minWidth: "13rem", maxWidth: "16rem", lineHeight: 1.3 }}
                  className={`px-sm py-1 rounded-lg text-left transition-colors ${
                    prestador === r.prestador_id ? "bg-primary text-on-primary" : "bg-surface-container-low hover:bg-surface-container"
                  }`}
                  title={`${r.prestador}: ${nf(r.cantidad)} de ${nf(r.total)} servicios (${pct(r.porcentaje)})`}
                >
                  <span className="block font-label-md text-label-md truncate" style={{ lineHeight: 1.3 }}>{r.prestador}</span>
                  <span className="block font-label-sm text-label-sm opacity-80" style={{ lineHeight: 1.3 }}>
                    {nf(r.cantidad)} de {nf(r.total)} · {pct(r.porcentaje)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <div className="bg-error-container text-on-error-container px-md py-sm font-body-md text-body-md">{error}</div>}

        <div className="overflow-auto px-md py-sm" style={{ flex: "1 1 0", minHeight: 0 }}>
          {cargando && !datos ? (
            <p className="py-lg text-center text-on-surface-variant">Cargando…</p>
          ) : (
            <table className={`w-full text-body-md font-body-md whitespace-nowrap ${cargando ? "opacity-50" : ""}`}>
              <thead>
                <tr className="text-label-md font-label-md text-on-surface-variant uppercase text-left border-b border-outline-variant/30 sticky top-0 bg-surface-container-lowest">
                  <th className="py-1 pr-3">ID orden</th>
                  <th className="pr-3">Prestador</th>
                  <th className="pr-3">Campaña</th>
                  <th className="pr-3">Tipo</th>
                  <th className="pr-3">Estado</th>
                  {(datos?.pasos ?? []).map((p) => (
                    <th key={p.clave} className="pr-3 text-center">
                      {CORTO[p.clave]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(datos?.servicios ?? []).map((s, i) => (
                  <tr key={`${s.id_orden_de_servicio}-${i}`} className="border-b border-outline-variant/10 hover:bg-surface-container-low">
                    <td className="py-1 pr-3">{s.id_orden_de_servicio ?? "—"}</td>
                    <td className="pr-3 max-w-[16rem] truncate" title={s.prestador ?? ""}>
                      {s.prestador ?? "—"}
                    </td>
                    <td className="pr-3">{s.campana ?? "—"}</td>
                    <td className="pr-3">{s.tipo_de_servicio ?? "—"}</td>
                    <td className="pr-3">{s.estado ?? "—"}</td>
                    {(datos?.pasos ?? []).map((p) => {
                      const v = s.pasos[p.clave];
                      return (
                        <td key={p.clave} className="pr-3 text-center" title={`${p.etiqueta}: ${fechaHora(v)}`}>
                          {v ? <span className="text-tertiary font-bold">✓</span> : <span className="text-error font-bold">✗</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {datos && datos.servicios.length === 0 && !cargando && (
            <p className="py-lg text-center text-on-surface-variant">No hay servicios con estos filtros.</p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 px-md py-sm border-t border-outline-variant/20 bg-surface-container-lowest" style={{ flexShrink: 0 }}>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            {datos ? `${nf(datos.cantidad_total)} servicios · página ${datos.pagina} de ${datos.total_paginas}` : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-8 px-sm rounded bg-surface-container-low font-label-md text-label-md disabled:opacity-40"
              disabled={!datos || datos.pagina <= 1 || cargando}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <button
              type="button"
              className="h-8 px-sm rounded bg-surface-container-low font-label-md text-label-md disabled:opacity-40"
              disabled={!datos || datos.pagina >= datos.total_paginas || cargando}
              onClick={() => setPagina((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
