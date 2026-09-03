// html2pdf.js no publica tipos propios -- declaración mínima para el
// subconjunto de la API que usamos en App.tsx (exportPdfSnapshot).
declare module "html2pdf.js" {
  interface Html2PdfOptions {
    margin?: number | [number, number, number, number];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: Record<string, unknown>;
    pagebreak?: {
      mode?: string | string[];
      before?: string | string[];
      after?: string | string[];
      avoid?: string | string[];
    };
  }
  interface Html2PdfJsPdfDoc {
    setProperties(props: { title?: string }): void;
  }
  interface Html2PdfWorker {
    set(opt: Html2PdfOptions): Html2PdfWorker;
    from(element: HTMLElement | string): Html2PdfWorker;
    toPdf(): Html2PdfWorker;
    get(key: "pdf"): Promise<Html2PdfJsPdfDoc>;
    save(filename?: string): Promise<void>;
  }
  function html2pdf(): Html2PdfWorker;
  export default html2pdf;
}
