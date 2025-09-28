export const STANDARD_FIELDS = {
  createdAt: {
    label: "Created date",
    keywords: ["created", "received", "opened", "inflow", "date", "submitted"],
    type: "date"
  },
  resolvedAt: {
    label: "Resolved date",
    keywords: ["resolved", "completed", "closed"],
    type: "date"
  },
  slaMinutes: {
    label: "SLA (minutes)",
    keywords: ["sla", "service level", "response time"],
    type: "number"
  },
  ahtMinutes: {
    label: "AHT (minutes)",
    keywords: ["aht", "handle", "duration", "talk time"],
    type: "number"
  },
  csatScore: {
    label: "CSAT",
    keywords: ["csat", "satisfaction", "nps", "score"],
    type: "number"
  },
  csatResponse: {
    label: "CSAT responded",
    keywords: ["response", "responded", "answered"],
    type: "boolean"
  },
  queue: {
    label: "Queue",
    keywords: ["queue", "team", "channel", "lob"],
    type: "string"
  },
  market: {
    label: "Market",
    keywords: ["market", "country", "region", "locale", "geo"],
    type: "string"
  },
  contactType: {
    label: "Contact type",
    keywords: ["contact", "reason", "issue", "topic", "type"],
    type: "string"
  },
  agentId: {
    label: "Agent",
    keywords: ["agent", "owner", "assignee", "handler"],
    type: "string"
  },
  escalationReason: {
    label: "Escalation",
    keywords: ["escal", "complaint", "level2", "priority"],
    type: "string"
  },
  backlogFlag: {
    label: "Backlog status",
    keywords: ["backlog", "aging", "pending", "open"],
    type: "boolean"
  },
  notes: {
    label: "Notes",
    keywords: ["note", "summary", "comment", "description"],
    type: "text"
  },
  priority: {
    label: "Priority",
    keywords: ["priority", "urgency", "severity", "tier"],
    type: "string"
  },
  slaTarget: {
    label: "SLA target",
    keywords: ["target", "goal"],
    type: "number"
  }
};

export const INTENT_KEYWORDS = {
  spike: ["spike", "surge", "increase", "jump", "peak"],
  compare: ["compare", "versus", "vs", "difference", "delta"],
  csat: ["csat", "satisfaction", "nps"],
  audit: ["audit", "policy", "adoption", "compliance"],
  sla: ["sla", "service level", "response", "handle"],
  backlog: ["backlog", "aging", "pending"],
  agent: ["agent", "outlier", "team", "performance"],
  escalation: ["escal", "complaint", "incident"]
};

export const QUICK_CHIPS = [
  "Explain inflow spikes in the last 7 days",
  "CSAT deep dive for FR/PT/ES",
  "Agent outliers in SLA",
  "Audit adoption vs target",
  "Root cause of today’s inflows"
];

export function normaliseHeader(value) {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

export function detectField(header) {
  const normalised = normaliseHeader(header);
  let bestMatch = null;
  let bestScore = 0;
  Object.entries(STANDARD_FIELDS).forEach(([field, meta]) => {
    const matches = meta.keywords.reduce((score, keyword) => {
      if (normalised.includes(keyword)) return score + keyword.length;
      return score;
    }, 0);
    if (matches > bestScore) {
      bestScore = matches;
      bestMatch = field;
    }
  });
  return bestScore > 0 ? bestMatch : null;
}

export function inferType(value) {
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "number") return "number";
  if (value instanceof Date) return "date";
  const trimmed = value.toString().trim();
  if (trimmed === "" || trimmed.toLowerCase() === "null") return "empty";
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed) || Date.parse(trimmed)) return "date";
  const normalised = trimmed.replace(/[,.](?=\d{3}\b)/g, "").replace(/,/g, ".");
  if (!Number.isNaN(Number(normalised))) return "number";
  if (["true", "false", "yes", "no"].includes(trimmed.toLowerCase())) return "boolean";
  return "string";
}

export function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = value
    .toString()
    .replace(/\s/g, "")
    .replace(/[,.](?=\d{3}\b)/g, "")
    .replace(/,/g, ".");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return null;
  const normalised = value.toString().trim().toLowerCase();
  if (["true", "yes", "1", "y"].includes(normalised)) return true;
  if (["false", "no", "0", "n"].includes(normalised)) return false;
  return null;
}

export function toDate(value, timezone) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number" && value > 10000000000) {
    return new Date(value);
  }
  const trimmed = value.toString().trim();
  if (!trimmed) return null;
  const { DateTime } = luxon;
  const formats = [
    "yyyy-MM-dd",
    "dd/MM/yyyy",
    "MM/dd/yyyy",
    "dd-MM-yyyy",
    "yyyy/MM/dd",
    "MMM d, yyyy",
    "MMMM d, yyyy",
    "d MMM yyyy",
    "d MMMM yyyy",
    "yyyy-MM-dd HH:mm",
    "yyyy-MM-dd HH:mm:ss",
    "dd/MM/yyyy HH:mm",
    "MM/dd/yyyy HH:mm"
  ];
  for (const fmt of formats) {
    const dt = DateTime.fromFormat(trimmed, fmt, { zone: timezone || "utc" });
    if (dt.isValid) return dt.toJSDate();
  }
  const iso = DateTime.fromISO(trimmed, { zone: timezone || "utc" });
  if (iso.isValid) return iso.toJSDate();
  const js = new Date(trimmed);
  return Number.isNaN(js.getTime()) ? null : js;
}

export function formatNumber(value, { style = "decimal", maximumFractionDigits = 1 } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat(undefined, { style, maximumFractionDigits }).format(value);
}

export function formatPercent(value, fraction = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return `${formatNumber(value * 100, { maximumFractionDigits: fraction })}%`;
}

export function formatDate(value) {
  if (!value) return "–";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toISOString().slice(0, 10);
}

export function quantile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function capOutliers(rows, field, q = 0.99) {
  const values = rows.map((row) => toNumber(row[field])).filter((value) => value !== null);
  if (!values.length) return rows;
  const cap = quantile(values, q);
  return rows.map((row) => {
    const numeric = toNumber(row[field]);
    if (numeric === null) return row;
    return { ...row, [field]: Math.min(numeric, cap) };
  });
}

export function groupBy(rows, accessor) {
  return rows.reduce((acc, row) => {
    const key = accessor(row);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

export function sum(rows, accessor) {
  return rows.reduce((total, row) => {
    const value = accessor(row);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

export function average(rows, accessor) {
  const values = rows.map(accessor).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function rate(numerator, denominator) {
  if (!denominator) return null;
  return numerator / denominator;
}

export function unique(rows, accessor) {
  return Array.from(new Set(rows.map(accessor).filter(Boolean))).sort();
}

export function rollingAverage(values, window = 7) {
  const result = [];
  for (let i = 0; i < values.length; i += 1) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((acc, val) => acc + val, 0) / slice.length;
    result.push(Number.isFinite(avg) ? avg : null);
  }
  return result;
}

export function delta(current, previous) {
  if (previous === 0 || previous === null || previous === undefined) return null;
  return (current - previous) / previous;
}

export function createDownload(filename, content) {
  const blob = content instanceof Blob ? content : new Blob([content]);
  saveAs(blob, filename);
}

export function sanitizeForExport(value, stripPII) {
  if (!stripPII || typeof value !== "string") return value;
  return value.replace(/[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/g, "[email]").replace(/\b[A-Z][a-z]+\s[A-Z][a-z]+\b/g, "[name]");
}

export function buildDateRangeLabel(range) {
  if (!range || !range.start || !range.end) return "All time";
  return `${formatDate(range.start)} → ${formatDate(range.end)}`;
}

export function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function computeChange(current, previous) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  if (previous === 0) return null;
  return (current - previous) / previous;
}

export function partition(rows, predicate) {
  return rows.reduce(
    (acc, row) => {
      acc[predicate(row) ? 0 : 1].push(row);
      return acc;
    },
    [[], []]
  );
}

export function inferDelimiter(sample) {
  if (sample.includes("\t")) return "\t";
  if (sample.includes(";")) return ";";
  return ",";
}
