import {
  store,
  initialiseTimezoneSelect,
  saveProfile,
  deleteProfile,
  setMapping,
  clearPins,
  setIntent,
  setFilters,
  saveView
} from "./state.js";
import { handleFile, applyMapping, exportCSV } from "./dataLoader.js";
import { autoDetectMapping, buildMappingGrid, attachMappingListeners, enrichWithHints } from "./schema.js";
import { parseIntent, followUpSuggestions } from "./intent.js";
import { renderDashboard, renderPinnedList, renderActiveFilters, renderQuickChips, getRegisteredCharts } from "./dashboard.js";
import { copySlack, downloadEmailDraft, downloadPdf, downloadZip } from "./exports.js";
import { ensureArray, unique } from "./utils.js";

let lastResult = { kpis: [], insights: [] };
let currentRows = [];

const elements = {
  fileInput: document.getElementById("file-input"),
  dropZone: document.getElementById("drop-zone"),
  dropText: document.getElementById("drop-zone-text"),
  mappingGrid: document.getElementById("mapping-grid"),
  profileSelect: document.getElementById("profile-select"),
  saveProfile: document.getElementById("save-profile"),
  deleteProfile: document.getElementById("delete-profile"),
  autoMap: document.getElementById("auto-map"),
  timezone: document.getElementById("timezone-select"),
  outlierCap: document.getElementById("outlier-cap"),
  piiStrip: document.getElementById("pii-strip"),
  intentInput: document.getElementById("intent-input"),
  runAnalysis: document.getElementById("run-analysis"),
  quickChips: document.getElementById("quick-chips"),
  marketFilter: document.getElementById("market-filter"),
  queueFilter: document.getElementById("queue-filter"),
  priorityFilter: document.getElementById("priority-filter"),
  dateRange: document.getElementById("date-range"),
  applyFilters: document.getElementById("apply-filters"),
  resetFilters: document.getElementById("reset-filters"),
  copySlack: document.getElementById("copy-slack"),
  downloadEmail: document.getElementById("download-email"),
  downloadPdf: document.getElementById("download-pdf"),
  downloadZip: document.getElementById("download-zip"),
  downloadCsv: document.getElementById("download-csv"),
  pinnedClear: document.getElementById("clear-pins"),
  dictionaryDialog: document.getElementById("dictionary-dialog"),
  openDictionary: document.getElementById("open-dictionary"),
  dictionaryGrid: document.getElementById("dictionary-grid"),
  dictionaryAdd: document.getElementById("add-dictionary-entry"),
  dictionaryExport: document.getElementById("export-dictionary"),
  dictionaryImport: document.getElementById("import-dictionary"),
  toggleDark: document.getElementById("toggle-dark"),
  savedViews: document.getElementById("saved-views"),
  saveView: document.getElementById("save-view")
};

function updateProfileSelect() {
  const options = Object.keys(store.state.profiles)
    .map((name) => `<option value="${name}">${name}</option>`)
    .join("");
  elements.profileSelect.innerHTML = `<option value="">Select profile</option>${options}`;
}

function populateFilters(rows) {
  const markets = unique(rows, (row) => row.market).filter(Boolean);
  const queues = unique(rows, (row) => row.queue).filter(Boolean);
  const priorities = unique(rows, (row) => row.priority).filter(Boolean);
  const renderOptions = (values) => values.map((value) => `<option value="${value}">${value}</option>`).join("");
  elements.marketFilter.innerHTML = renderOptions(markets);
  elements.queueFilter.innerHTML = renderOptions(queues);
  elements.priorityFilter.innerHTML = renderOptions(priorities);
}

function refreshMappingGrid() {
  const fresh = elements.mappingGrid.cloneNode(false);
  elements.mappingGrid.parentNode.replaceChild(fresh, elements.mappingGrid);
  elements.mappingGrid = fresh;
  buildMappingGrid(elements.mappingGrid);
  attachMappingListeners(elements.mappingGrid, handleMappingChange);
  enrichWithHints(elements.mappingGrid, store.state.rawRows.slice(0, 5));
}

function refreshDashboard() {
  currentRows = store.state.normalisedRows;
  if (!currentRows.length) {
    lastResult = renderDashboard(store.state.intent.intents);
    renderActiveFilters(store.state.filters);
    renderPinnedList();
    return;
  }
  populateFilters(currentRows);
  const intents = store.state.intent.intents;
  lastResult = renderDashboard(intents);
  renderActiveFilters(store.state.filters);
  renderPinnedList();
}

function handleMappingChange(mapping) {
  const rows = applyMapping(mapping);
  if (rows.length) {
    populateFilters(rows);
    renderDashboard(store.state.intent.intents);
    renderActiveFilters(store.state.filters);
    renderPinnedList();
  } else {
    renderDashboard(store.state.intent.intents);
    renderActiveFilters(store.state.filters);
    renderPinnedList();
  }
}

function runAnalysis() {
  const raw = elements.intentInput.value.trim();
  const intents = parseIntent(raw);
  setIntent(raw, intents);
  lastResult = renderDashboard(intents);
  renderActiveFilters(store.state.filters);
  renderPinnedList();
  const suggestions = [...new Set([...followUpSuggestions(intents), ...store.state.intent.chips])].slice(0, 6);
  renderQuickChips(suggestions);
}

function parseDateRange(value) {
  if (!value) return null;
  const [start, end] = value.split("to").map((part) => new Date(part.trim()));
  if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

function applyFilterState() {
  const filters = {
    dateRange: parseDateRange(elements.dateRange.value),
    market: ensureArray([...elements.marketFilter.selectedOptions].map((option) => option.value)),
    queue: ensureArray([...elements.queueFilter.selectedOptions].map((option) => option.value)),
    priority: ensureArray([...elements.priorityFilter.selectedOptions].map((option) => option.value))
  };
  setFilters(filters);
  refreshDashboard();
}

function resetFilters() {
  elements.dateRange.value = "";
  [elements.marketFilter, elements.queueFilter, elements.priorityFilter].forEach((select) => {
    Array.from(select.options).forEach((option) => {
      option.selected = false;
    });
  });
  setFilters({ dateRange: null, market: [], queue: [], priority: [] });
  refreshDashboard();
}

function renderDictionary() {
  const { dictionary } = store.state;
  elements.dictionaryGrid.innerHTML = Object.entries(dictionary)
    .map(([key, values]) => {
      const joined = (values || []).join(", ");
      return `
        <div class="dictionary-row" data-key="${key}">
          <input type="text" value="${key}" data-dict-key placeholder="Target field" />
          <input type="text" value="${joined}" data-dict-values placeholder="Synonyms (comma separated)" />
          <button type="button" class="btn ghost" data-remove>Remove</button>
        </div>
      `;
    })
    .join("");
}

function addDictionaryRow(key = "", values = []) {
  const wrapper = document.createElement("div");
  wrapper.className = "dictionary-row";
  wrapper.dataset.key = key;
  wrapper.innerHTML = `
    <input type="text" value="${key}" data-dict-key placeholder="Target field" />
    <input type="text" value="${values.join(", ")}" data-dict-values placeholder="Synonyms (comma separated)" />
    <button type="button" class="btn ghost" data-remove>Remove</button>
  `;
  elements.dictionaryGrid.append(wrapper);
}

function captureDictionary() {
  const entries = {};
  elements.dictionaryGrid.querySelectorAll(".dictionary-row").forEach((row) => {
    const key = row.querySelector('[data-dict-key]').value.trim();
    const values = row.querySelector('[data-dict-values]').value
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (key) entries[key] = values;
  });
  store.set({ dictionary: entries });
}

function renderSavedViews() {
  const options = store.state.savedViews
    .map((view) => `<option value="${view.name}">${view.name}</option>`)
    .join("");
  elements.savedViews.innerHTML = `<option value="">Select view</option>${options}`;
}

function handleThemeToggle() {
  const root = document.documentElement;
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = next;
}

async function processFile(file) {
  elements.dropText.textContent = `Loading ${file.name}…`;
  try {
    const { headers } = await handleFile(file);
    autoDetectMapping(headers, store.state.dictionary);
    refreshMappingGrid();
    const mapped = applyMapping(store.state.mapping);
    if (mapped.length) {
      elements.dropText.textContent = `${file.name} • ${mapped.length} rows`;
      renderDashboard(store.state.intent.intents);
      populateFilters(mapped);
      renderActiveFilters(store.state.filters);
      renderPinnedList();
      resetFilters();
    }
  } catch (error) {
    console.error(error);
    elements.dropText.textContent = `Failed to load ${file.name}`;
  }
}

function initDragAndDrop() {
  elements.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("dragging");
  });
  elements.dropZone.addEventListener("dragleave", () => elements.dropZone.classList.remove("dragging"));
  elements.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragging");
    const file = event.dataTransfer.files[0];
    if (file) processFile(file);
  });
}

function initProfiles() {
  updateProfileSelect();
  elements.profileSelect.addEventListener("change", () => {
    const { value } = elements.profileSelect;
    if (!value) return;
    const mapping = store.state.profiles[value];
    if (!mapping) return;
    setMapping(mapping);
    refreshMappingGrid();
    applyMapping(mapping);
    refreshDashboard();
  });
  elements.saveProfile.addEventListener("click", () => {
    const name = prompt("Profile name");
    if (!name) return;
    if (saveProfile(name, store.state.mapping)) {
      updateProfileSelect();
    }
  });
  elements.deleteProfile.addEventListener("click", () => {
    const selected = elements.profileSelect.value;
    if (!selected) return;
    deleteProfile(selected);
    updateProfileSelect();
  });
}

function initDictionary() {
  renderDictionary();
  elements.openDictionary.addEventListener("click", () => {
    renderDictionary();
    elements.dictionaryDialog.showModal();
  });
  elements.dictionaryDialog.addEventListener("close", () => {
    captureDictionary();
  });
  elements.dictionaryGrid.addEventListener("click", (event) => {
    if (event.target.matches("[data-remove]")) {
      event.target.closest(".dictionary-row").remove();
    }
  });
  elements.dictionaryAdd.addEventListener("click", () => addDictionaryRow());
  elements.dictionaryExport.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(store.state.dictionary, null, 2)], { type: "application/json" });
    saveAs(blob, "dictionary.json");
  });
  elements.dictionaryImport.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    const json = JSON.parse(text);
    store.set({ dictionary: json });
    renderDictionary();
  });
}

function initFilters() {
  elements.applyFilters.addEventListener("click", applyFilterState);
  elements.resetFilters.addEventListener("click", resetFilters);
}

function initExports() {
  elements.copySlack.addEventListener("click", () => {
    const summary = copySlack(lastResult.kpis, lastResult.insights, store.state.filters.dateRange);
    elements.copySlack.textContent = "Copied!";
    setTimeout(() => {
      elements.copySlack.textContent = "Slack update";
    }, 1200);
  });
  elements.downloadEmail.addEventListener("click", () => {
    downloadEmailDraft(lastResult.kpis, lastResult.insights, store.state.filters.dateRange);
  });
  elements.downloadPdf.addEventListener("click", () => {
    downloadPdf(document.querySelector(".content"));
  });
  elements.downloadZip.addEventListener("click", async () => {
    const charts = getRegisteredCharts();
    const csvBlob = exportCSV(store.state.normalisedRows, store.state.piiStrip);
    await downloadZip(charts, csvBlob);
  });
  elements.downloadCsv.addEventListener("click", () => {
    const csvBlob = exportCSV(store.state.normalisedRows, store.state.piiStrip);
    if (csvBlob) saveAs(csvBlob, "ops-copilot.csv");
  });
}

function initPinned() {
  elements.pinnedClear.addEventListener("click", clearPins);
}

function initTheme() {
  elements.toggleDark.addEventListener("click", handleThemeToggle);
}

function initSavedViews() {
  renderSavedViews();
  elements.saveView.addEventListener("click", () => {
    if (!store.state.normalisedRows.length) return;
    const name = prompt("View name");
    if (!name) return;
    saveView({
      name,
      filters: store.state.filters,
      intent: store.state.intent.raw,
      timestamp: Date.now()
    });
    renderSavedViews();
  });
  elements.savedViews.addEventListener("change", () => {
    const name = elements.savedViews.value;
    if (!name) return;
    const view = store.state.savedViews.find((item) => item.name === name);
    if (!view) return;
    elements.intentInput.value = view.intent;
    setIntent(view.intent, parseIntent(view.intent));
    setFilters(view.filters);
    renderActiveFilters(view.filters);
    renderDashboard(store.state.intent.intents);
  });
}

function initControls() {
  initialiseTimezoneSelect(elements.timezone);
  initDragAndDrop();
  initProfiles();
  initDictionary();
  initFilters();
  initExports();
  initPinned();
  initTheme();
  initSavedViews();

  renderQuickChips(store.state.intent.chips);
  renderPinnedList();

  elements.outlierCap.checked = store.state.outlierCap;
  elements.piiStrip.checked = store.state.piiStrip;

  elements.outlierCap.addEventListener("change", () => {
    store.set({ outlierCap: elements.outlierCap.checked });
    refreshDashboard();
  });
  elements.piiStrip.addEventListener("change", () => {
    store.set({ piiStrip: elements.piiStrip.checked });
  });

  elements.fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) processFile(file);
  });

  elements.autoMap.addEventListener("click", () => {
    if (!store.state.headers.length) return;
    autoDetectMapping(store.state.headers, store.state.dictionary);
    refreshMappingGrid();
    handleMappingChange(store.state.mapping);
  });

  elements.runAnalysis.addEventListener("click", runAnalysis);

  store.subscribe(() => {
    renderPinnedList();
    updateProfileSelect();
    renderSavedViews();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initControls();
});
