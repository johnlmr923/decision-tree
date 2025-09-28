import {
  computeKpis,
  buildTrendSeries,
  findSpike,
  breakdownBy,
  computeAgentOutliers,
  backlogAging,
  escalationLoop,
  getFilteredRows
} from "./analytics.js";
import { addPinnedInsight, store } from "./state.js";
import { formatPercent, formatNumber, buildDateRangeLabel } from "./utils.js";

const chartRegistry = new Map();

function destroyCharts() {
  chartRegistry.forEach((chart) => chart.destroy());
  chartRegistry.clear();
}

function createCard(container, title, bodyContent, footer) {
  const template = document.getElementById("card-template");
  const card = template.content.firstElementChild.cloneNode(true);
  card.querySelector(".card-title").textContent = title;
  const body = card.querySelector(".card-body");
  if (typeof bodyContent === "string") {
    body.innerHTML = bodyContent;
  } else if (bodyContent instanceof HTMLElement) {
    body.append(bodyContent);
  } else if (Array.isArray(bodyContent)) {
    bodyContent.forEach((node) => body.append(node));
  }
  if (footer) {
    card.querySelector(".card-footer").textContent = footer;
  }
  card.querySelector("[data-pin]").addEventListener("click", () => {
    addPinnedInsight(`${title}: ${body.textContent}`.trim());
  });
  container.append(card);
  return card;
}

function createKpiCards(container, rows) {
  container.innerHTML = "";
  const kpis = computeKpis(rows);
  kpis.forEach((kpi) => {
    createCard(
      container,
      kpi.title,
      `<strong>${kpi.value}</strong>`,
      kpi.subtitle
    );
  });
  return kpis;
}

function createTrendCard(container, series) {
  if (!series.length) return null;
  const canvas = document.createElement("canvas");
  const card = createCard(container, "Trend", canvas, "Rolling 7-day avg dotted");
  const ctx = canvas.getContext("2d");
  const labels = series.map((point) => point.date);
  const inflow = series.map((point) => point.inflow);
  const resolved = series.map((point) => point.resolved);
  const sla = series.map((point) => (point.slaTotal ? (point.slaHit / point.slaTotal) * 100 : null));
  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Inflow",
          data: inflow,
          borderColor: "#2563eb",
          tension: 0.4,
          fill: false
        },
        {
          label: "Resolved",
          data: resolved,
          borderColor: "#10b981",
          tension: 0.4,
          fill: false
        },
        {
          label: "SLA %",
          data: sla,
          borderColor: "#f59e0b",
          tension: 0.4,
          fill: false,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        },
        y1: {
          beginAtZero: true,
          position: "right",
          ticks: {
            callback: (value) => `${value}%`
          }
        }
      }
    }
  });
  chartRegistry.set(canvas, chart);
  return card;
}

function createBreakdownCard(container, rows, title, field) {
  if (!rows.length) return null;
  const breakdown = breakdownBy(rows, field);
  if (!breakdown.length) return null;
  const canvas = document.createElement("canvas");
  const card = createCard(container, title, canvas, "Top 8 share of volume");
  const ctx = canvas.getContext("2d");
  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: breakdown.map((item) => item.key),
      datasets: [
        {
          data: breakdown.map((item) => item.value),
          backgroundColor: breakdown.map((item, index) => (index === 0 ? "#ef4444" : "#2563eb"))
        }
      ]
    },
    options: {
      indexAxis: "y",
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => {
              const item = breakdown[context.dataIndex];
              return `${formatNumber(item.value, { maximumFractionDigits: 0 })} (${formatPercent(item.share, 1)})`;
            }
          }
        }
      }
    }
  });
  chartRegistry.set(canvas, chart);
  return { card, breakdown };
}

function createHistogram(container, rows) {
  const values = rows
    .map((row) => row.ahtMinutes)
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  const canvas = document.createElement("canvas");
  const card = createCard(container, "AHT distribution", canvas, "P99 capped");
  const bins = 12;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const step = (max - min) / bins || 1;
  const histogram = new Array(bins).fill(0);
  values.forEach((value) => {
    const index = Math.min(Math.floor((value - min) / step), bins - 1);
    histogram[index] += 1;
  });
  const ctx = canvas.getContext("2d");
  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: histogram.map((_, index) => `${formatNumber(min + index * step, { maximumFractionDigits: 0 })}–${formatNumber(min + (index + 1) * step, { maximumFractionDigits: 0 })}`),
      datasets: [
        {
          data: histogram,
          backgroundColor: "#6366f1"
        }
      ]
    }
  });
  chartRegistry.set(canvas, chart);
  return card;
}

function createAgentCard(container, rows) {
  const { overallAht, outliers } = computeAgentOutliers(rows);
  if (!outliers.length) return null;
  const list = document.createElement("ul");
  outliers.forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = `👤 ${entry.agent}: AHT ${formatNumber(entry.aht, { maximumFractionDigits: 1 })} vs team ${formatNumber(overallAht, { maximumFractionDigits: 1 })}`;
    list.append(item);
  });
  return createCard(container, "Agent outliers", list, `Min volume 10 cases | ${outliers.length} flagged`);
}

function createInsightCards(container, rows, breakdowns, intents, series) {
  container.innerHTML = "";
  const insights = [];
  const spike = findSpike(series);
  if (spike) {
    const topDriver = breakdowns.contactType?.breakdown?.[0];
    const cardText = `📈 ${spike.date} inflow +${formatPercent(spike.change, 1)} vs baseline.` +
      (topDriver
        ? ` Driver: ${topDriver.key} (+${formatNumber(topDriver.value, { maximumFractionDigits: 0 })}, ${formatPercent(topDriver.share, 1)}).`
        : "");
    insights.push(cardText);
    createCard(container, "Spike detected", `<p>${cardText}</p>`, "Rolling 7-day baseline");
  }

  if (breakdowns.queue) {
    const worst = breakdowns.queue.breakdown[0];
    const slaTotals = breakdowns.queue.breakdown.map((item) => ({
      queue: item.key,
      sla: item.rows.filter((row) => row.slaTarget).length,
      slaHit: item.rows.filter((row) => row.slaTarget && row.slaMinutes <= row.slaTarget).length
    }));
    const minSla = slaTotals
      .filter((item) => item.sla > 30)
      .map((item) => ({
        queue: item.queue,
        rate: item.slaHit / item.sla
      }))
      .sort((a, b) => a.rate - b.rate)[0];
    if (minSla) {
      const text = `⚠ SLA ${formatPercent(minSla.rate, 1)}. Worst in ${minSla.queue}.`;
      insights.push(text);
      createCard(container, "SLA watch", `<p>${text}</p>`, "Min 30 cases per queue");
    }
  }

  if (breakdowns.csat) {
    const low = breakdowns.csat.breakdown.slice(-1)[0];
    if (low) {
      const text = `⭐ CSAT ${formatNumber(breakdowns.csat.breakdown[0].rows[0]?.csatScore || 0, { maximumFractionDigits: 2 })}. Lowest: ${low.key}.`;
      insights.push(text);
      createCard(container, "CSAT", `<p>${text}</p>`, "Top & bottom contact types");
    }
  }

  const backlog = backlogAging(rows);
  if (backlog.length) {
    const oldest = backlog.sort((a, b) => b.age - a.age)[0];
    const text = `📦 Backlog aging: ${formatNumber(oldest.age, { maximumFractionDigits: 1 })} days oldest (${oldest.queue || "Unassigned"}).`;
    insights.push(text);
    createCard(container, "Backlog aging", `<p>${text}</p>`, "Age = created to now");
  }

  const escalations = escalationLoop(rows);
  if (escalations.length) {
    const byReason = breakdownBy(escalations, "escalationReason");
    const text = `🚨 Escalations ${formatNumber(escalations.length, { maximumFractionDigits: 0 })}. Top reason ${byReason[0].key}.`;
    insights.push(text);
    createCard(container, "Escalation loop", `<p>${text}</p>`, "Focus on recurrence");
  }

  return insights;
}

export function renderDashboard(intents) {
  const rows = getFilteredRows();
  const kpiContainer = document.getElementById("kpi-cards");
  const chartContainer = document.getElementById("visual-cards");
  const insightContainer = document.getElementById("insight-cards");
  destroyCharts();
  const kpis = createKpiCards(kpiContainer, rows);
  chartContainer.innerHTML = "";
  insightContainer.innerHTML = "";
  if (!rows.length) return { kpis: [], insights: [] };
  const series = buildTrendSeries(rows);
  createTrendCard(chartContainer, series);
  const breakdowns = {
    queue: createBreakdownCard(chartContainer, rows, "Queues", "queue"),
    market: createBreakdownCard(chartContainer, rows, "Markets", "market"),
    contactType: createBreakdownCard(chartContainer, rows, "Contact types", "contactType"),
    csat: rows[0].csatScore !== undefined
      ? createBreakdownCard(chartContainer, rows.filter((row) => row.csatScore !== null && row.csatScore !== undefined), "CSAT", "contactType")
      : null
  };
  createHistogram(chartContainer, rows);
  createAgentCard(chartContainer, rows);
  const insightList = createInsightCards(
    insightContainer,
    rows,
    breakdowns,
    intents,
    series
  );
  return { kpis, insights: insightList };
}

export function renderPinnedList() {
  const list = document.getElementById("pinned-list");
  list.innerHTML = "";
  store.state.pinned.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  });
}

export function renderActiveFilters(filters) {
  const pill = document.getElementById("active-filters");
  pill.innerHTML = "";
  if (!filters) return;
  if (filters.dateRange) {
    const span = document.createElement("span");
    span.className = "filter-pill";
    span.textContent = buildDateRangeLabel(filters.dateRange);
    pill.append(span);
  }
  ["market", "queue", "priority"].forEach((key) => {
    if (filters[key]?.length) {
      const span = document.createElement("span");
      span.className = "filter-pill";
      span.textContent = `${key}: ${filters[key].join(", ")}`;
      pill.append(span);
    }
  });
}

export function renderQuickChips(chips) {
  const container = document.getElementById("quick-chips");
  container.innerHTML = "";
  chips.forEach((chip) => {
    const span = document.createElement("span");
    span.className = "chip";
    span.textContent = chip;
    span.tabIndex = 0;
    span.addEventListener("click", () => {
      document.getElementById("intent-input").value = chip;
    });
    span.addEventListener("keydown", (event) => {
      if (event.key === "Enter") document.getElementById("intent-input").value = chip;
    });
    container.append(span);
  });
}

export function getRegisteredCharts() {
  return Array.from(chartRegistry.keys()).map((canvas, index) => ({
    id: index + 1,
    canvas
  }));
}

