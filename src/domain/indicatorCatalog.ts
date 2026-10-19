/* Catálogo único de definiciones y umbrales de estado de los indicadores principales (2026-10-19).
   Las definiciones de negocio completas están en CATALOGO_INDICADORES.md; acá viven las que se muestran en la pantalla de
   resumen y los umbrales que deciden el color/etiqueta de cada tarjeta, para no repetirlos en varios componentes.
   Todas las proporciones son 0-1, como las devuelve la API. */

/** Cantidad mínima de servicios medibles para dar un porcentaje de cumplimiento como confiable. */
export const MINIMO_MEDIBLES = 20;

/** Cobertura (de medición o de trazabilidad): por debajo de `baja` se avisa; por debajo de `parcial` es parcial. */
export const UMBRALES_COBERTURA = { baja: 0.5, parcial: 0.8 } as const;
/** Mismo criterio que usaban las tarjetas anteriores para avisar "cobertura baja". */
export const COBERTURA_BAJA = UMBRALES_COBERTURA.baja;

/** Efectividad de asignación: alta desde `alta`, intermedia desde `intermedia`, baja por debajo. */
export const UMBRALES_EFECTIVIDAD = { alta: 0.9, intermedia: 0.8 } as const;

/** Mínimo de prestadores comparables para mostrar un ranking o un "Top líder" (igual que MIN_PARES_BENCHMARK del backend). */
export const MIN_PARES_LIDER = 5;

/** Objetivos operativos. null = NO CONFIGURADO: no se inventa un objetivo; se define con Operaciones o desde el SLA
    contractual (paso futuro: tabla de objetivos configurables). */
export const OBJETIVOS: Record<"cumplimientoObservado" | "efectividadAsignacion" | "trazabilidadCompleta", number | null> = {
  cumplimientoObservado: null,
  efectividadAsignacion: null,
  trazabilidadCompleta: null,
};

export const INDICADORES_PRINCIPALES = {
  cumplimientoObservado: {
    label: "Cumplimiento observado",
    icon: "verified",
    leer: "El KPI principal de puntualidad: qué % de los servicios que se pueden medir (tienen el tiempo prometido y el real cargados) llegó dentro de lo prometido. Se lee SIEMPRE junto a la cobertura: hoy solo una parte del universo es medible, así que el resultado no representa a todos los servicios.",
    calculo:
      "Cumple si DemoraReal ≤ DemoraPrometida + 14, solo sobre filas con DemoraPrometida y DemoraReal cargadas. Los servicios sin esos datos no cuentan ni como cumplidos ni como incumplidos.",
  },
  coberturaMedicion: {
    label: "Cobertura de medición",
    icon: "rule",
    leer: "Qué % de los servicios que SÍ se espera medir (el universo evaluable: vehiculares, con tipo y estado catalogados) tiene los datos completos para medir su cumplimiento. Es la cobertura más justa para saber cuánto confiar en el cumplimiento observado.",
    calculo:
      "Servicios con DemoraPrometida y DemoraReal cargadas ÷ servicios del universo evaluable (referencial: solo se calcula con filtros de campaña, prestador y estado). Si no está disponible, se muestra la cobertura sobre todo el universo filtrado.",
  },
  efectividadAsignacion: {
    label: "Efectividad de asignación",
    icon: "rv_hookup",
    leer: "De los servicios que pasaron por el enviador (el despacho automático), a cuántos se les asignó un móvil. No mide cuánto se usa el enviador, sino qué tan bien funciona cuando se usa.",
    calculo: "Servicios con enviador y móvil asignado ÷ servicios con enviador (ConEnvioOK = SI).",
  },
  trazabilidadCompleta: {
    label: "Trazabilidad completa",
    icon: "timeline",
    leer: "Qué % de los servicios tiene la cadena completa de eventos registrada (Alta → Despachador → Asignado → Envío OK → Llegó → Finalizó). Sin la cadena completa no se pueden medir los tiempos.",
    calculo: "Servicios con los 6 eventos cargados ÷ total del universo filtrado.",
  },
} as const;
