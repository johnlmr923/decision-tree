import { createDownload, formatNumber, formatPercent, buildDateRangeLabel } from "./utils.js";
import { store } from "./state.js";

function buildSlackSummary(kpis, insights, dateRange) {
  const topInsights = insights.slice(0, 3).map((insight) => `• ${insight}`);
  const metrics = kpis
    .slice(0, 3)
    .map((kpi) => `${kpi.title}: ${kpi.value}${kpi.subtitle ? ` (${kpi.subtitle})` : ""}`)
    .join(" | ");
  return [
    `*Ops update – ${buildDateRangeLabel(dateRange)}*`,
    metrics,
    ...topInsights
  ].join("\n");
}

function buildEmailDraft(kpis, insights, dateRange) {
  const boundary = "----=_OpsCopilotBoundary";
  const subject = `Ops Insights – ${buildDateRangeLabel(dateRange)}`;
  const htmlBody = `
    <html><body>
      <h1>Ops insights</h1>
      <p>Range: ${buildDateRangeLabel(dateRange)}</p>
      <h2>KPIs</h2>
      <ul>
        ${kpis
          .map((kpi) => `<li><strong>${kpi.title}</strong>: ${kpi.value} ${kpi.subtitle || ""}</li>`)
          .join("")}
      </ul>
      <h2>Highlights</h2>
      <ul>
        ${insights.map((line) => `<li>${line}</li>`).join("")}
      </ul>
    </body></html>
  `;
  const mime = [
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=${boundary}`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    buildSlackSummary(kpis, insights, dateRange),
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    htmlBody,
    `--${boundary}--`
  ].join("\r\n");
  return { subject, mime };
}

export function copySlack(kpis, insights, dateRange) {
  const summary = buildSlackSummary(kpis, insights, dateRange);
  navigator.clipboard.writeText(summary);
  return summary;
}

export function downloadEmailDraft(kpis, insights, dateRange) {
  const { mime } = buildEmailDraft(kpis, insights, dateRange);
  createDownload("ops-insights.eml", mime);
}

export async function downloadPdf(element) {
  const canvas = await html2canvas(element, { scale: window.devicePixelRatio });
  const image = canvas.toDataURL("image/png");
  const pdf = new jspdf.jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width, canvas.height] });
  pdf.addImage(image, "PNG", 0, 0, canvas.width, canvas.height);
  pdf.save("ops-insights.pdf");
}

export async function downloadZip(charts, csvBlob) {
  const zip = new JSZip();
  const chartPromises = charts.map(async ({ id, canvas }) => {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve));
    zip.file(`chart-${id}.png`, blob);
  });
  await Promise.all(chartPromises);
  if (csvBlob) {
    zip.file("dataset.csv", csvBlob);
  }
  const readme = `# Ops Copilot Bundle\n\nCharts exported on ${new Date().toISOString()}\n`;
  zip.file("README.txt", readme);
  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "ops-insights.zip");
}
