// Verificacion (sin navegador) del desglose "que servicios entran en el cumplimiento observado y cuales se descartan":
// renderiza el contenido del tooltip y el n= de la tabla con datos de ejemplo (MAFAVA, un prestador sin descartes, uno con pocos
// datos y una respuesta vieja sin `descarte_demora`). Uso, desde front_prestadores:   node scripts/verificar_no_medibles.mjs
// Sale con codigo 1 si alguna comprobacion falla.
import { fileURLToPath, pathToFileURL } from "node:url";

const FRONT = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const { createServer } = await import(pathToFileURL(FRONT + "/node_modules/vite/dist/node/index.js").href);
const server = await createServer({ root: FRONT, configLoader: "runner", server: { middlewareMode: true }, appType: "custom", logLevel: "error", optimizeDeps: { noDiscovery: true }, ssr: { external: ["react", "react-dom"] } });
let fallas = 0;
const ok = (cond, msg) => {
  if (!cond) {
    console.error("FALLA:", msg);
    fallas++;
  } else {
    console.log("OK:", msg);
  }
};
try {
  const { DetalleMuestra, MuestraCumplimiento } = await server.ssrLoadModule("/src/components/metrics/MuestraCumplimiento.tsx");
  const { createRequire } = await import("node:module");
  const req = createRequire(FRONT + "/package.json");
  const React = req("react");
  const { renderToString } = req("react-dom/server");
  const texto = (el) => renderToString(el).replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "|").replace(/\s*\|\s*/g, "|").replace(/\|+/g, "|").replace(/&#x27;/g, "'");

  const cero = { medibles: 0, SIN_DEMORA_PROMETIDA: 0, SIN_LLEGADA_CERRADO: 0, EN_CURSO: 0, CANCELADO: 0, OTRO_ESTADO: 0, OUTLIER_EXCLUIDO: 0 };
  const mafava = { ...cero, medibles: 42, SIN_LLEGADA_CERRADO: 1 };

  // MAFAVA: 43 servicios, 42 medibles (34 cumplen / 8 no), 1 cerrado sin hora de llegada
  const t1 = texto(React.createElement(DetalleMuestra, { n: 42, total: 43, cumplen: 34, noCumplen: 8, descarte: mafava, puedeVer: true }));
  console.log("\nMAFAVA ->", t1);
  ok(t1.includes("43|servicios") && t1.includes("42|medibles") && t1.includes("1|descartados"), "MAFAVA: 43 servicios = 42 medibles + 1 descartados");
  ok(t1.includes("34 cumplen · 8 no cumplen"), "MAFAVA: 34 cumplen / 8 no cumplen");
  ok(t1.includes("Cerrado sin hora de llegada") && t1.includes("problema de carga del prestador"), "MAFAVA: motivo del descarte con su explicacion");
  ok(!t1.includes("En curso") && !t1.includes("Cancelado") && !t1.includes("Outlier"), "MAFAVA: solo se listan los motivos que tienen servicios");
  ok(t1.includes("Clic para ver los servicios descartados"), "MAFAVA: invita a ver el listado");

  // varios motivos, incluido outlier excluido
  const varios = { ...cero, medibles: 100, SIN_LLEGADA_CERRADO: 7, EN_CURSO: 3, CANCELADO: 5, SIN_DEMORA_PROMETIDA: 2, OTRO_ESTADO: 1, OUTLIER_EXCLUIDO: 4 };
  const t2 = texto(React.createElement(DetalleMuestra, { n: 100, total: 122, cumplen: 90, noCumplen: 10, descarte: varios, puedeVer: true }));
  ok(t2.includes("122|servicios") && t2.includes("22|descartados"), "varios motivos: 122 = 100 + 22");
  ok(["Cerrado sin hora de llegada", "En curso o pendiente", "Cancelado", "Sin demora prometida", "En otro estado", "Outlier excluido por el filtro"].every((m) => t2.includes(m)), "varios motivos: aparecen los 6 motivos");

  // sin descartes
  const t3 = texto(React.createElement(DetalleMuestra, { n: 50, total: 50, cumplen: 45, noCumplen: 5, descarte: { ...cero, medibles: 50 }, puedeVer: true }));
  ok(t3.includes("No se descartó ningún servicio") && !t3.includes("Clic para ver"), "sin descartes: lo dice y no ofrece el listado");

  // sin medibles
  const t4 = texto(React.createElement(DetalleMuestra, { n: 0, total: 5, cumplen: 0, noCumplen: 0, descarte: { ...cero, CANCELADO: 5 }, puedeVer: true }));
  ok(t4.includes("ninguno") && t4.includes("5|Cancelado"), "sin medibles: 'ninguno' y el motivo");

  // respuesta vieja del backend (sin descarte_demora): texto generico, sin romper
  const t5 = texto(React.createElement(DetalleMuestra, { n: 42, descarte: undefined, puedeVer: false }));
  ok(t5.includes("Servicios medibles"), "sin descarte_demora (backend viejo): texto generico");

  // n= y "Pocos datos"
  const celda = (n) => texto(React.createElement(MuestraCumplimiento, { medibles: n, total: n + 1, cumplen: n, noCumplen: 0, descarte: { ...cero, medibles: n, SIN_LLEGADA_CERRADO: 1 }, titulo: "Prestador X", onVer: () => {} }));
  ok(celda(42).includes("n=42") && !celda(42).includes("Pocos datos"), "42 medibles: n=42 sin 'Pocos datos'");
  ok(celda(1).includes("n=1") && celda(1).includes("Pocos datos"), "1 medible: n=1 con 'Pocos datos'");
  ok(celda(20).includes("n=20") && !celda(20).includes("Pocos datos"), "20 medibles: justo en el minimo, sin 'Pocos datos'");
  ok(celda(19).includes("Pocos datos"), "19 medibles: 'Pocos datos'");
  console.log(fallas ? `\nHAY ${fallas} FALLA(S)` : "\nTODO OK");
  process.exitCode = fallas ? 1 : 0;
} finally {
  await server.close();
}
