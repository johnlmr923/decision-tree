import { inferDelimiter, toDate, toNumber, toBoolean, sanitizeForExport } from "./utils.js";
import { store, setData } from "./state.js";

function parseCSV(file, timezone) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      const delimiter = inferDelimiter(text.slice(0, 2048));
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimiter,
        complete: (results) => resolve(results.data),
        error: (error) => reject(error)
      });
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function parseXLSX(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target.result;
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { raw: false });
        resolve(json);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function normaliseRows(rows, mapping, timezone) {
  return rows.map((row) => {
    const normalised = {};
    Object.entries(mapping).forEach(([header, target]) => {
      if (!target) return;
      const value = row[header];
      switch (target) {
        case "createdAt":
        case "resolvedAt":
          normalised[target] = toDate(value, timezone);
          break;
        case "slaMinutes":
        case "ahtMinutes":
        case "csatScore":
        case "slaTarget":
          normalised[target] = toNumber(value);
          break;
        case "csatResponse":
        case "backlogFlag":
          normalised[target] = toBoolean(value);
          break;
        case "notes":
          normalised[target] = value ? value.toString() : "";
          break;
        default:
          normalised[target] = value;
      }
    });
    return normalised;
  });
}

export async function handleFile(file) {
  if (!file) return;
  const { timezone } = store.state;
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  const mime = file.type ? file.type.toLowerCase() : "";
  const isSpreadsheet =
    ["xlsx", "xls"].includes(extension) ||
    mime.includes("spreadsheet") ||
    mime.includes("excel");
  const rawRows = isSpreadsheet ? await parseXLSX(file) : await parseCSV(file, timezone);
  const headers = rawRows.length ? Object.keys(rawRows[0]) : [];
  setData({ rawRows, normalisedRows: [], headers });
  return { rawRows, headers };
}

export function applyMapping(mapping) {
  const { rawRows, timezone } = store.state;
  if (!rawRows.length) return [];
  const normalised = normaliseRows(rawRows, mapping, timezone);
  setData({ rawRows, normalisedRows: normalised, headers: store.state.headers });
  return normalised;
}

export function exportCSV(rows, stripPII) {
  if (!rows.length) return null;
  const headers = Object.keys(rows[0]);
  const filtered = rows.map((row) => {
    const copy = {};
    headers.forEach((header) => {
      copy[header] = sanitizeForExport(row[header], stripPII);
    });
    return copy;
  });
  const csv = Papa.unparse(filtered);
  return new Blob([csv], { type: "text/csv;charset=utf-8" });
}
