import type { AuditoriaResultado } from "./api";

/* La situación de un prestador en la auditoría semanal, en palabras. Vive en un archivo aparte (y no dentro de
   AuditoriaPanel.tsx) para poder usarla también desde "Detalle por prestador" sin importar el panel completo. */
export const CANDIDATO = "Candidato a auditoria prioritaria";
export const OBSERVACION = "Observacion";

export type Situacion = {
  clave: "auditar" | "seguir" | "ok" | "sin_registro" | "pocos_datos";
  label: string;
  tone: string;
  rank: number;
};

/* Un prestador que no registra la llegada NO es "sin problemas": simplemente no se lo puede medir. */
export function situacion(r: Pick<AuditoriaResultado, "alerta" | "segmento" | "prioridad">): Situacion {
  if (r.alerta === CANDIDATO) return { clave: "auditar", label: "Para auditar con prioridad", tone: "text-error bg-error/10", rank: 3 };
  if (r.alerta === OBSERVACION) return { clave: "seguir", label: "Para seguir de cerca", tone: "text-[#b5610a] bg-[#f59e0b]/10", rank: 2 };
  if (r.segmento !== "Registra")
    return { clave: "sin_registro", label: "No registra la llegada", tone: "text-on-surface-variant bg-surface-container-low", rank: 0 };
  if (r.prioridad == null)
    return { clave: "pocos_datos", label: "Pocos datos para evaluar", tone: "text-on-surface-variant bg-surface-container-low", rank: 0 };
  return { clave: "ok", label: "Sin problemas", tone: "text-tertiary bg-tertiary/10", rank: 1 };
}
