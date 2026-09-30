/**
 * Chart export utilities for PNG, SVG formats.
 * A chart is either a canvas (uPlot) or an SVG (pie, donut). Both are drawn
 * onto one offscreen canvas, so no DOM screenshot library is involved.
 */

export interface ChartLegendItem {
  label: string;
  color: string;
}

export interface ChartImageOptions {
  /** Drawn under the chart. The on-screen legend is HTML, so it is not part of the chart pixels. */
  legend?: ChartLegendItem[];
  textColor?: string;
  fontFamily?: string;
}

/** SVG charts are vectors: render them above screen resolution. */
const SVG_SCALE = 2;
const LEGEND_FONT_PX = 12;
const LEGEND_ROW_PX = 20;
const LEGEND_PAD_PX = 12;

/**
 * Helper to trigger a blob download
 */
const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))),
      "image/png"
    );
  });

interface ChartSource {
  image: CanvasImageSource;
  width: number;
  height: number;
  /** Device pixels per CSS pixel in `image`. */
  scale: number;
}

const svgToImage = async (svg: SVGSVGElement): Promise<ChartSource> => {
  const rect = svg.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) throw new Error("Chart is not visible");
  const width = Math.round(rect.width * SVG_SCALE);
  const height = Math.round(rect.height * SVG_SCALE);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  // An <img> has no layout to size the SVG from, so the size must be explicit.
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.removeAttribute("class");

  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    })
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to render the chart"));
      image.src = url;
    });
    return { image, width, height, scale: SVG_SCALE };
  } finally {
    URL.revokeObjectURL(url);
  }
};

const findChartSource = async (chartElement: HTMLElement): Promise<ChartSource> => {
  const canvas = chartElement.querySelector("canvas");
  if (canvas && canvas.width > 0 && canvas.height > 0) {
    return {
      image: canvas,
      width: canvas.width,
      height: canvas.height,
      scale: canvas.clientWidth > 0 ? canvas.width / canvas.clientWidth : 1,
    };
  }
  const svg = chartElement.querySelector("svg");
  if (svg) return svgToImage(svg);
  throw new Error("No chart found");
};

/** Splits the legend into rows that fit `maxWidth`. Widths are in canvas pixels. */
const layoutLegend = (
  ctx: CanvasRenderingContext2D,
  items: ChartLegendItem[],
  maxWidth: number,
  scale: number
): { item: ChartLegendItem; width: number }[][] => {
  const swatch = 18 * scale; // dot plus the gap before the text
  const gap = 16 * scale;
  const rows: { item: ChartLegendItem; width: number }[][] = [[]];
  let used = 0;
  for (const item of items) {
    const width = swatch + ctx.measureText(item.label).width;
    const row = rows[rows.length - 1];
    if (row.length > 0 && used + gap + width > maxWidth) {
      rows.push([{ item, width }]);
      used = width;
    } else {
      used += (row.length > 0 ? gap : 0) + width;
      row.push({ item, width });
    }
  }
  return rows;
};

/** Draws the chart, and its legend when given, on a filled offscreen canvas. */
const renderChartCanvas = async (
  chartElement: HTMLElement,
  backgroundColor: string,
  options: ChartImageOptions = {}
): Promise<HTMLCanvasElement> => {
  const source = await findChartSource(chartElement);
  const { scale } = source;
  const legend = options.legend ?? [];
  const font = `${LEGEND_FONT_PX * scale}px ${options.fontFamily ?? "system-ui, sans-serif"}`;
  const pad = LEGEND_PAD_PX * scale;
  const rowHeight = LEGEND_ROW_PX * scale;

  const offscreen = document.createElement("canvas");
  const ctx = offscreen.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context");

  ctx.font = font;
  const rows = legend.length ? layoutLegend(ctx, legend, source.width - pad * 2, scale) : [];

  offscreen.width = source.width;
  offscreen.height = source.height + (rows.length ? rows.length * rowHeight + pad : 0);
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, offscreen.width, offscreen.height);
  ctx.drawImage(source.image, 0, 0, source.width, source.height);

  // Resizing the canvas reset the context state.
  ctx.font = font;
  ctx.textBaseline = "middle";
  rows.forEach((row, r) => {
    const gap = 16 * scale;
    const rowWidth = row.reduce((sum, e) => sum + e.width, 0) + gap * (row.length - 1);
    let x = Math.max(pad, (source.width - rowWidth) / 2);
    const y = source.height + r * rowHeight + rowHeight / 2;
    for (const { item, width } of row) {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(x + 5 * scale, y, 5 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = options.textColor ?? "#000000";
      ctx.fillText(item.label, x + 18 * scale, y);
      x += width + gap;
    }
  });

  return offscreen;
};

/**
 * Export chart as PNG image, from the chart's own canvas or SVG.
 */
export const exportChartAsPNG = async (
  chartElement: HTMLElement,
  fileName: string = "chart.png",
  backgroundColor: string = "#ffffff",
  options?: ChartImageOptions
): Promise<void> => {
  try {
    const canvas = await renderChartCanvas(chartElement, backgroundColor, options);
    downloadBlob(await canvasToBlob(canvas), fileName);
  } catch (error) {
    console.error("Failed to export chart as PNG:", error);
    throw new Error("Failed to export chart as PNG. Please try again.");
  }
};

/**
 * Export chart as SVG (works for SVG-based charts like pie/donut)
 * For canvas-based charts (uPlot), falls back to PNG export.
 */
export const exportChartAsSVG = async (
  chartElement: HTMLElement,
  fileName: string = "chart.svg"
): Promise<void> => {
  try {
    // Find SVG element in the chart
    const svgElement = chartElement.querySelector("svg");
    if (!svgElement) {
      // Canvas-based chart (uPlot): fall back to PNG
      await exportChartAsPNG(chartElement, fileName.replace(/\.svg$/, ".png"));
      return;
    }

    // Clone SVG to avoid modifying original
    const clonedSvg = svgElement.cloneNode(true) as SVGElement;

    // Add XML namespace if not present
    if (!clonedSvg.hasAttribute("xmlns")) {
      clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }

    // Get SVG string
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);

    // Create blob and download
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to export chart as SVG:", error);
    throw new Error("Failed to export chart as SVG. Please try again.");
  }
};

/**
 * Copy chart as image to clipboard
 */
export const copyChartToClipboard = async (
  chartElement: HTMLElement,
  backgroundColor: string = "#ffffff",
  options?: ChartImageOptions
): Promise<void> => {
  try {
    const canvas = await renderChartCanvas(chartElement, backgroundColor, options);
    const blob = await canvasToBlob(canvas);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } catch (error) {
    console.error("Failed to copy chart to clipboard:", error);
    throw new Error("Failed to copy chart to clipboard. Please try again.");
  }
};

/**
 * Print chart
 */
export const printChart = (chartElement: HTMLElement): void => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Failed to open print window. Please allow popups.");
  }

  // Try SVG first, then canvas (uPlot)
  const svgElement = chartElement.querySelector("svg");
  const canvasElement = chartElement.querySelector("canvas");

  if (!svgElement && !canvasElement) {
    printWindow.close();
    throw new Error("No chart found to print");
  }

  let chartContent: string;
  if (svgElement) {
    const clonedSvg = svgElement.cloneNode(true) as SVGElement;
    const serializer = new XMLSerializer();
    chartContent = serializer.serializeToString(clonedSvg);
  } else {
    const dataUrl = canvasElement!.toDataURL("image/png");
    chartContent = `<img src="${dataUrl}" style="max-width:100%;height:auto;" />`;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print Chart</title>
        <style>
          @media print {
            body {
              margin: 0;
              padding: 20px;
            }
            svg, img {
              max-width: 100%;
              height: auto;
            }
          }
        </style>
      </head>
      <body>
        ${chartContent}
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </body>
    </html>
  `);

  printWindow.document.close();
};

/**
 * Generate shareable URL with chart configuration
 */
export const generateShareableURL = (
  chartConfig: Record<string, unknown>,
  querySQL?: string
): string => {
  const params = new URLSearchParams();

  // Encode chart configuration
  params.set("chart", btoa(JSON.stringify(chartConfig)));

  // Optionally include query
  if (querySQL) {
    params.set("query", btoa(querySQL));
  }

  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
};

/**
 * Parse chart configuration from URL
 */
export const parseChartFromURL = (): {
  chartConfig?: Record<string, unknown>;
  query?: string;
} | null => {
  try {
    const params = new URLSearchParams(window.location.search);

    const chartParam = params.get("chart");
    const queryParam = params.get("query");

    if (!chartParam) return null;

    return {
      chartConfig: JSON.parse(atob(chartParam)),
      query: queryParam ? atob(queryParam) : undefined,
    };
  } catch (error) {
    console.error("Failed to parse chart from URL:", error);
    return null;
  }
};

/**
 * Get chart element dimensions for export
 */
export const getChartDimensions = (
  chartElement: HTMLElement
): { width: number; height: number } => {
  const rect = chartElement.getBoundingClientRect();
  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
};
