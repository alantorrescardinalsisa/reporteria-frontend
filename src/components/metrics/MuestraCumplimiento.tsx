import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DescarteDemora } from "../../api";
import { MINIMO_MEDIBLES } from "../../domain/indicatorCatalog";

/* "n=" del cumplimiento observado de un prestador (o de una campaña x prestador), con el detalle de QUE servicios entran en
   el cumplimiento y cuales se descartan, y por que (2026-10-19). Al pasar el mouse (o con el foco del teclado) muestra el
   desglose; al hacer clic abre el listado de los servicios no medibles. Si hay menos de MINIMO_MEDIBLES servicios medibles,
   se marca "Pocos datos".

   El desglose sale de `descarte_demora` (backend: motivo_no_medible). Los motivos son excluyentes y, con "medibles", suman el
   total de servicios del grupo. */

const nf = (v: number) => new Intl.NumberFormat("es-AR").format(v);

export const MOTIVO_NO_MEDIBLE_ETIQUETA: Record<string, string> = {
  SIN_LLEGADA_CERRADO: "Cerrado sin hora de llegada",
  EN_CURSO: "En curso o pendiente",
  CANCELADO: "Cancelado",
  SIN_DEMORA_PROMETIDA: "Sin demora prometida",
  OTRO_ESTADO: "En otro estado",
  OUTLIER_EXCLUIDO: "Outlier excluido por el filtro",
};
const MOTIVO_AYUDA: Record<string, string> = {
  SIN_LLEGADA_CERRADO: "el servicio terminó pero no tiene hora de llegada: problema de carga del prestador",
  EN_CURSO: "todavía no terminó, no se espera una demora real",
  CANCELADO: "no hubo servicio, no se espera una demora real",
  SIN_DEMORA_PROMETIDA: "la carga la hace la compañía, no el prestador",
  OTRO_ESTADO: "estado sin clasificar",
  OUTLIER_EXCLUIDO: "demora real mayor a 3 veces el P90; se excluye por el check “Excluir outliers”",
};
const ORDEN_MOTIVOS = ["SIN_LLEGADA_CERRADO", "EN_CURSO", "CANCELADO", "SIN_DEMORA_PROMETIDA", "OTRO_ESTADO", "OUTLIER_EXCLUIDO"];

/* Contenido del desglose (se separa para poder probarlo sin navegador). */
export function DetalleMuestra({
  n,
  total,
  cumplen,
  noCumplen,
  descarte,
  puedeVer,
}: {
  n: number;
  total?: number;
  cumplen?: number;
  noCumplen?: number;
  descarte?: DescarteDemora;
  puedeVer: boolean;
}) {
  const descartados = descarte
    ? ORDEN_MOTIVOS.map((m) => ({ clave: m, cantidad: descarte[m as keyof DescarteDemora] ?? 0 })).filter((x) => x.cantidad > 0)
    : [];
  const totalDescartados = descartados.reduce((a, x) => a + x.cantidad, 0);
  if (!descarte) {
    return <span className="block">Servicios medibles: con demora prometida y real cargadas. El cumplimiento se calcula solo sobre estos.</span>;
  }
  return (
    <>
      <span className="block">
        <b>{nf(total ?? n + totalDescartados)}</b> servicios = <b>{nf(n)}</b> medibles + <b>{nf(totalDescartados)}</b> descartados
      </span>
      <span className="block mt-1.5">
        <b>Entran en el cumplimiento ({nf(n)}):</b> {n > 0 ? `${nf(cumplen ?? 0)} cumplen · ${nf(noCumplen ?? 0)} no cumplen` : "ninguno"}
      </span>
      {descartados.length === 0 ? (
        <span className="block mt-1.5">No se descartó ningún servicio.</span>
      ) : (
        <>
          <span className="block mt-1.5">
            <b>Se descartan ({nf(totalDescartados)}):</b>
          </span>
          {descartados.map((d) => (
            <span key={d.clave} className="block mt-1 pl-2">
              • <b>{nf(d.cantidad)}</b> {MOTIVO_NO_MEDIBLE_ETIQUETA[d.clave]}
              <span className="block text-[11px] text-inverse-on-surface/70 pl-2">{MOTIVO_AYUDA[d.clave]}</span>
            </span>
          ))}
        </>
      )}
      {totalDescartados > 0 && puedeVer && <span className="block mt-2 text-primary-fixed-dim font-semibold">Clic para ver los servicios descartados</span>}
    </>
  );
}

export function MuestraCumplimiento({
  medibles,
  total,
  cumplen,
  noCumplen,
  descarte,
  titulo,
  onVer,
}: {
  medibles?: number;
  total?: number;
  cumplen?: number;
  noCumplen?: number;
  descarte?: DescarteDemora;
  titulo: string;
  onVer?: () => void;
}) {
  const n = medibles ?? 0;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const TIP_W = 300;
  const MARGIN = 8;

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = rect.top < 260;
    const left = Math.min(Math.max(rect.left + rect.width / 2, TIP_W / 2 + MARGIN), window.innerWidth - TIP_W / 2 - MARGIN);
    setPos({ top: below ? rect.bottom + MARGIN : rect.top - MARGIN, left, below });
  };
  const hide = () => setPos(null);

  const totalDescartados = descarte
    ? ORDEN_MOTIVOS.reduce((a, m) => a + (descarte[m as keyof DescarteDemora] ?? 0), 0)
    : 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="font-label-sm text-label-sm text-on-surface-variant whitespace-nowrap underline decoration-dotted underline-offset-2 hover:text-primary cursor-help bg-transparent border-0 p-0"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation();
          if (onVer && totalDescartados > 0) onVer();
        }}
        aria-label={`Detalle de los servicios de ${titulo}: ${nf(n)} medibles`}
      >
        n={nf(n)}
      </button>
      {pos &&
        createPortal(
          <span
            className="fixed z-[200] pointer-events-none"
            style={{ top: pos.top, left: pos.left, width: TIP_W, transform: pos.below ? "translateX(-50%)" : "translate(-50%, -100%)" }}
          >
            <span className="block rounded-lg bg-inverse-surface text-inverse-on-surface p-3 shadow-lg font-body-md text-[12.5px] leading-snug">
              <span className="block font-label-caps text-label-caps uppercase tracking-wide text-primary-fixed-dim mb-1.5 pb-1.5 border-b border-inverse-on-surface/20 truncate">
                {titulo}
              </span>
              <DetalleMuestra n={n} total={total} cumplen={cumplen} noCumplen={noCumplen} descarte={descarte} puedeVer={!!onVer} />
            </span>
          </span>,
          document.body,
        )}
      {n < MINIMO_MEDIBLES && (
        <span
          className="font-label-sm text-label-sm px-1.5 py-0.5 rounded-full text-[#b5610a] bg-[#f59e0b]/10 whitespace-nowrap"
          title={`Menos de ${MINIMO_MEDIBLES} servicios medibles: el cumplimiento no es confiable.`}
        >
          Pocos datos
        </span>
      )}
    </>
  );
}
