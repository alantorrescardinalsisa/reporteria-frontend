/* Guía de las tres formas de evaluar a un prestador. Se muestra en la parte de arriba de cada una de las tres
   secciones (Detalle por prestador, Panorama de la red, Auditoría de prestadores) para explicar, en palabras, para qué
   sirve cada una, cuál usar para auditar y por qué los resultados no coinciden. Solo texto y navegación. */
export type DestinoEvaluacion = "providers" | "panorama" | "auditoria";

const ITEMS: { clave: DestinoEvaluacion; icono: string; titulo: string; pregunta: string; como: string }[] = [
  {
    clave: "providers",
    icono: "person_search",
    titulo: "Detalle por prestador",
    pregunta: "¿Cuánto vale este prestador?",
    como: "Un puntaje de 0 a 100 % que suma cumplimiento, registro completo, reclamos y encuestas. Usa los filtros de arriba y siempre está actualizado.",
  },
  {
    clave: "panorama",
    icono: "insights",
    titulo: "Panorama de la red",
    pregunta: "¿Quién viene peor o mejor que los demás?",
    como: "Clasifica a los prestadores en el período elegido comparando la primera mitad con la segunda y su puesto entre todos. Usa los filtros de arriba y siempre está actualizado.",
  },
  {
    clave: "auditoria",
    icono: "fact_check",
    titulo: "Auditoría de prestadores",
    pregunta: "¿A quién conviene auditar?",
    como: "Compara a cada prestador solo con otros que hacen servicios parecidos. Es una foto que se renueva los lunes y no cambia con los filtros. Es la que hay que usar para decidir auditorías.",
  },
];

export default function GuiaEvaluaciones({ actual, onIr }: { actual: DestinoEvaluacion; onIr: (d: DestinoEvaluacion) => void }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-space-md flex flex-col gap-space-sm">
      <div className="flex items-start gap-space-md">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary">
          <span className="material-symbols-outlined text-[22px]">tips_and_updates</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-headline-md text-body-md text-on-surface font-semibold">Tres formas de mirar a un prestador</span>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Cada una responde una pregunta distinta, por eso los resultados no tienen por qué coincidir. Ninguna es una sanción automática: sirven para decidir a quién
            revisar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        {ITEMS.map((it) => {
          const esActual = it.clave === actual;
          return (
            <div
              key={it.clave}
              className={`rounded-lg p-sm flex flex-col gap-1 border ${
                esActual ? "bg-surface-container-lowest border-primary/40 shadow-sm" : "bg-surface-container-lowest/60 border-outline-variant/20"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`material-symbols-outlined text-[20px] ${esActual ? "text-primary" : "text-on-surface-variant"}`}>{it.icono}</span>
                <span className="font-body-md text-body-md text-on-surface font-semibold">{it.titulo}</span>
                {esActual && (
                  <span className="ml-auto font-label-md text-label-md rounded-full px-2 py-0.5 uppercase tracking-wide text-primary bg-primary/10">Estás acá</span>
                )}
              </div>
              <span className="font-body-sm text-body-sm text-on-surface font-medium">{it.pregunta}</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">{it.como}</span>
              {!esActual && (
                <button
                  type="button"
                  onClick={() => onIr(it.clave)}
                  className="mt-1 self-start flex items-center gap-1 font-body-sm text-body-sm text-primary font-medium hover:underline"
                >
                  Ir a {it.titulo}
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <details className="font-body-md text-body-md text-on-surface-variant">
        <summary className="cursor-pointer font-semibold text-on-surface">¿Por qué un mismo prestador puede verse distinto en cada una?</summary>
        <ul className="list-disc pl-5 pt-2 flex flex-col gap-1.5">
          <li>
            <b>Los servicios sin hora de llegada.</b> En las tres, la demora se mide solo sobre servicios que tienen hora de llegada: los demás ni suman ni restan
            al cumplimiento. Que falte la hora de llegada es un problema de carga de datos y se penaliza aparte: en el Detalle, dentro del registro completo; en la
            Auditoría, como un aspecto propio (&ldquo;sin hora de llegada&rdquo;). El Panorama solo mira la demora.
          </li>
          <li>
            <b>Con quién se compara.</b> Detalle y Panorama lo comparan con todos los prestadores del filtro, aunque hagan servicios muy distintos. La Auditoría
            lo compara solo con otros que hacen servicios parecidos (misma campaña y mismo tipo de servicio).
          </li>
          <li>
            <b>Qué período y qué servicios.</b> Detalle y Panorama miran lo que elijas arriba (por defecto, los dos últimos meses cerrados y algunos estados y
            tipos). La Auditoría mira todos los servicios terminados desde enero, sin filtros.
          </li>
          <li>
            <b>Cuándo se actualizan.</b> Detalle y Panorama cambian al instante con los filtros; la Auditoría es la foto del último lunes.
          </li>
        </ul>
      </details>
    </div>
  );
}
