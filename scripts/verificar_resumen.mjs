// Verificacion (sin navegador) del primer nivel de lectura del Resumen: arma las 4 tarjetas, la sintesis y renderiza el
// componente a HTML con datos de ejemplo (periodo 01/09-19/10/2026, sin medibles, sin datos, sin cobertura evaluable).
// Uso, desde front_prestadores:   node scripts/verificar_resumen.mjs
// Sale con codigo 1 si alguna comprobacion falla. Usa Vite con --configLoader runner (evita escribir en node_modules).
import { fileURLToPath, pathToFileURL } from "node:url";

const FRONT = fileURLToPath(new URL("..", import.meta.url)).replace(/[\/]$/, "");
const { createServer } = await import(pathToFileURL(FRONT + "/node_modules/vite/dist/node/index.js").href);
const server = await createServer({ root: FRONT, configLoader: "runner", server: { middlewareMode: true }, appType: "custom", logLevel: "error", optimizeDeps: { noDiscovery: true }, ssr: { external: ["react", "react-dom"] } });
try {
  const { buildPrimaryMetrics } = await server.ssrLoadModule("/src/domain/buildPrimaryMetrics.ts");
  const { buildExecutiveSummary } = await server.ssrLoadModule("/src/domain/buildExecutiveSummary.ts");
  const { PrimaryMetricsSection } = await server.ssrLoadModule("/src/components/metrics/PrimaryMetricsSection.tsx");
  const { createRequire } = await import("node:module");
  const req = createRequire(FRONT + "/package.json");
  const React = req("react");
  const { renderToString } = req("react-dom/server");

  const resumen = {
    servicios_consultados: 33194, enviador_si: 12890, uso_enviador: 12890 / 33194, asigna_movil_con_envio_ok: 11886, efectividad_enviador: 11886 / 12890,
    servicios_evaluados_demora_trazable: 10943, servicios_cumplidos_trazable: 8261, cumplimiento_demora_trazable: 8261 / 10943,
    cobertura_medicion_demora: 10943 / 33194, universo_evaluable: 14072, cobertura_medicion_evaluable: 10943 / 14072, cobertura_evaluable_nota: null,
  };
  const universes = { servicios_evaluables: 14072 };
  const trazabilidad = { total: 33194, servicios_trazabilidad_completa: 10202, porcentaje_trazabilidad_completa: 10202 / 33194 };

  const texto = (html) => html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|").replace(/&#x27;/g, "'");
  function caso(nombre, args, total) {
    const m = buildPrimaryMetrics(args);
    const frases = buildExecutiveSummary(m, total);
    console.log("\n=== " + nombre);
    for (const x of m) console.log(`  ${x.label}: value=${x.value == null ? null : (x.value * 100).toFixed(1)} num=${x.numerator} den=${x.denominator} estado=${x.status}/${x.statusLabel}`);
    console.log("  Frases:", frases);
    const html = renderToString(React.createElement(PrimaryMetricsSection, { periodo: "01/09/2026 al 19/10/2026", totalServicios: total, metricas: m, frases, onAbrirSeccion: () => {} }));
    console.log("  Texto renderizado:", texto(html).slice(0, 1400));
    return { m, frases, html };
  }

  const a = caso("Datos del periodo 01/09 al 19/10", { summary: resumen, universes, trazabilidad }, 33194);
  const b = caso("Sin servicios medibles", { summary: { ...resumen, servicios_evaluados_demora_trazable: 0, servicios_cumplidos_trazable: 0, cumplimiento_demora_trazable: 0, cobertura_medicion_demora: 0, cobertura_medicion_evaluable: null }, universes, trazabilidad }, 33194);
  const c = caso("Sin datos todavia", { summary: null, universes: null, trazabilidad: null }, null);
  const d = caso("Cobertura evaluable no disponible (filtro de tipo)", { summary: { ...resumen, cobertura_medicion_evaluable: null, universo_evaluable: null, cobertura_evaluable_nota: "No disponible con filtros de tipo de servicio, poliza o provincia." }, universes, trazabilidad }, 33194);

  // Comprobaciones
  const cumpl = a.m[0], cob = a.m[1], efec = a.m[2], traz = a.m[3];
  const ok = (cond, msg) => { if (!cond) { console.error("FALLA:", msg); process.exitCode = 1; } };
  ok(Math.abs(cumpl.value - 0.7549) < 1e-3 && cumpl.numerator === 8261 && cumpl.denominator === 10943, "cumplimiento 8.261/10.943");
  ok(Math.abs(cob.value - 10943 / 14072) < 1e-6 && cob.denominator === 14072, "cobertura sobre el evaluable");
  ok(cob.status === "neutral", "78 % de cobertura evaluable = parcial (neutral), no 'baja'");
  ok(!a.frases.join(" ").includes("cobertura de medición es baja"), "con cobertura evaluable 78 % no se dice 'baja'");
  ok(a.frases.join(" ").includes("75,5 %") && a.frases.join(" ").includes("alta"), "frase de cumplimiento y de efectividad alta");
  ok(!/program/i.test(a.frases.join(" ") + texto(a.html)), "no se mencionan los programados");
  ok(efec.numerator === 11886 && efec.denominator === 12890 && efec.statusLabel === "Alta", "efectividad 11.886/12.890 alta");
  ok(traz.value < 0.5 && traz.statusLabel === "Baja", "trazabilidad 30,7 % baja");
  ok(b.m[0].value === null && b.m[0].statusLabel === "Sin muestra", "sin medibles -> sin dato (no 0 %)");
  ok(texto(b.html).includes("—"), "se muestra el guion");
  ok(c.m.every((x) => x.value === null), "sin datos -> todo null");
  ok(d.m[1].value !== null && Math.abs(d.m[1].value - 10943 / 33194) < 1e-6 && d.m[1].status === "warning", "sin evaluable, la cobertura es la del universo (baja)");
  console.log(process.exitCode ? "\nHAY FALLAS" : "\nTODO OK");
} finally {
  await server.close();
}
