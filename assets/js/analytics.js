import {
  average,
  groupBy,
  sum,
  rate,
  unique,
  formatNumber,
  formatPercent,
  formatDate,
  delta,
  rollingAverage,
  computeChange,
  quantile,
  capOutliers
} from "./utils.js";
import { store } from "./state.js";

function filterRows(rows, filters) {
  if (!filters) return rows;
  return rows.filter((row) => {
    const { dateRange, market, queue, priority } = filters;
    if (dateRange && dateRange.start && row.createdAt && row.createdAt < dateRange.start) return false;
    if (dateRange && dateRange.end && row.createdAt && row.createdAt > dateRange.end) return false;
    if (market?.length && row.market && !market.includes(row.market)) return false;
    if (queue?.length && row.queue && !queue.includes(row.queue)) return false;
    if (priority?.length && row.priority && !priority.includes(row.priority)) return false;
    return true;
  });
}

export function getFilteredRows() {
  const { normalisedRows, filters, mapping } = store.state;
  const mappedFields = new Set(Object.values(mapping));
  let rows = normalisedRows;
  if (mappedFields.has("ahtMinutes") && store.state.outlierCap) {
    rows = capOutliers(rows, "ahtMinutes");
  }
  if (!rows.length) return [];
  return filterRows(rows, filters);
}

export function computeKpis(rows) {
  if (!rows.length) return [];
  const inflow = rows.length;
  const resolved = rows.filter((row) => row.resolvedAt).length;
  const csatResponses = rows.filter((row) => row.csatScore !== null && row.csatScore !== undefined);
  const csatAverage = average(csatResponses, (row) => row.csatScore);
  const csatRate = rate(csatResponses.length, rows.length);
  const slaValues = rows.filter((row) => row.slaMinutes !== null && row.slaTarget);
  const slaHits = slaValues.filter((row) => row.slaMinutes <= row.slaTarget);
  const slaRate = rate(slaHits.length, slaValues.length);
  const ahtAverage = average(rows, (row) => row.ahtMinutes);
  const backlog = rows.filter((row) => row.backlogFlag).length;
  const insight = [];
  if (csatAverage !== null) {
    insight.push({
      title: "CSAT",
      value: formatNumber(csatAverage, { maximumFractionDigits: 2 }),
      subtitle: `Resp. ${formatPercent(csatRate, 1)}`
    });
  }
  insight.unshift({
    title: "Inflow",
    value: formatNumber(inflow, { maximumFractionDigits: 0 }),
    subtitle: `${formatNumber(resolved, { maximumFractionDigits: 0 })} resolved`
  });
  if (slaRate !== null) {
    insight.push({
      title: "SLA hit",
      value: formatPercent(slaRate, 1),
      subtitle: `${formatNumber(slaHits.length)} / ${formatNumber(slaValues.length)} cases`
    });
  }
  if (ahtAverage !== null) {
    insight.push({
      title: "AHT",
      value: `${formatNumber(ahtAverage, { maximumFractionDigits: 1 })} min`,
      subtitle: "P99 " + formatNumber(quantile(rows.map((row) => row.ahtMinutes || 0), 0.99), {
        maximumFractionDigits: 1
      })
    });
  }
  if (backlog) {
    insight.push({
      title: "Backlog",
      value: formatNumber(backlog, { maximumFractionDigits: 0 }),
      subtitle: "Open beyond SLA"
    });
  }
  return insight;
}

export function buildTrendSeries(rows) {
  const grouped = groupBy(rows, (row) => formatDate(row.createdAt));
  const series = Object.entries(grouped)
    .filter(([date]) => date !== "–")
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, entries]) => ({
      date,
      inflow: entries.length,
      resolved: entries.filter((row) => row.resolvedAt).length,
      slaHit: entries.filter((row) => row.slaTarget && row.slaMinutes <= row.slaTarget).length,
      slaTotal: entries.filter((row) => row.slaTarget).length,
      csatAverage: average(entries.filter((row) => row.csatScore !== null && row.csatScore !== undefined), (row) => row.csatScore)
    }));
  return series;
}

export function findSpike(series) {
  if (!series.length) return null;
  const values = series.map((point) => point.inflow);
  const baseline = rollingAverage(values, 7);
  let best = null;
  values.forEach((value, index) => {
    const base = baseline[index - 1];
    if (!base || base === 0) return;
    const pct = (value - base) / base;
    if (!best || pct > best.change) {
      best = { index, change: pct, current: value, baseline: base };
    }
  });
  if (!best) return null;
  return { date: series[best.index].date, change: best.change, current: best.current };
}

export function breakdownBy(rows, field, metric = (group) => group.length) {
  const grouped = groupBy(rows, (row) => row[field] || "Unmapped");
  const breakdown = Object.entries(grouped)
    .map(([key, group]) => ({ key, value: metric(group), share: group.length / rows.length, rows: group }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  return breakdown;
}

export function computeAgentOutliers(rows) {
  const byAgent = groupBy(rows, (row) => row.agentId || "Unknown");
  const records = Object.entries(byAgent)
    .map(([agent, group]) => ({
      agent,
      aht: average(group, (row) => row.ahtMinutes),
      slaHit: rate(group.filter((row) => row.slaTarget && row.slaMinutes <= row.slaTarget).length, group.filter((row) => row.slaTarget).length),
      volume: group.length
    }))
    .filter((entry) => entry.volume >= 10);
  const overallAht = average(rows, (row) => row.ahtMinutes);
  const outliers = records
    .filter((entry) => entry.aht && overallAht && entry.aht > overallAht * 1.3)
    .sort((a, b) => b.aht - a.aht)
    .slice(0, 5);
  return { overallAht, outliers };
}

export function comparePeriods(rows, previousRows) {
  const curr = {
    inflow: rows.length,
    csat: average(rows, (row) => row.csatScore),
    sla: rate(
      rows.filter((row) => row.slaTarget && row.slaMinutes <= row.slaTarget).length,
      rows.filter((row) => row.slaTarget).length
    )
  };
  const prev = {
    inflow: previousRows.length,
    csat: average(previousRows, (row) => row.csatScore),
    sla: rate(
      previousRows.filter((row) => row.slaTarget && row.slaMinutes <= row.slaTarget).length,
      previousRows.filter((row) => row.slaTarget).length
    )
  };
  return {
    current: curr,
    previous: prev,
    change: {
      inflow: computeChange(curr.inflow, prev.inflow),
      csat: computeChange(curr.csat, prev.csat),
      sla: computeChange(curr.sla, prev.sla)
    }
  };
}

export function backlogAging(rows) {
  return rows
    .filter((row) => row.backlogFlag && row.createdAt)
    .map((row) => {
      const age = row.resolvedAt
        ? (row.resolvedAt - row.createdAt) / (1000 * 60 * 60 * 24)
        : (Date.now() - row.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      return { ...row, age };
    });
}

export function escalationLoop(rows) {
  return rows.filter((row) => row.escalationReason);
}
