import { useRef, useState } from "react";
import { createPortal } from "react-dom";

/* Tooltip de ayuda por indicador (movido desde App.tsx para poder usarlo tambien en AuditoriaPanel sin
   importar App.tsx, que generaria una importacion circular). Sin cambios de comportamiento.

   Icono "i" que al pasar el mouse muestra una descripcion breve y, si corresponde, como se calcula. El popover se
   renderiza via Portal directo a document.body, con posicion calculada en pixeles (getBoundingClientRect) -- NO
   como position:absolute dentro del arbol normal. Esto es necesario porque muchos de los contenedores que usan este
   tooltip (Card, el wrapper de las tablas con scroll horizontal, etc.) tienen overflow-hidden/overflow-x-auto, que
   recortaba el popover si se posicionaba con position:absolute adentro de ellos. Al vivir en document.body con
   position:fixed, el popover ya no depende del overflow de ningun ancestro. */
export type Tooltip = { leer: string; calculo?: string; titulo?: string };

export function InfoTip({ leer, calculo, titulo }: Tooltip) {
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
      <span className="material-symbols-outlined text-[14px] leading-none text-on-surface-variant/50 hover:text-primary cursor-help transition-colors">
        info
      </span>
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
