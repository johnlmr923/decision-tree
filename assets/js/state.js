import { STANDARD_FIELDS, QUICK_CHIPS } from "./utils.js";

const DEFAULT_STATE = {
  rawRows: [],
  normalisedRows: [],
  headers: [],
  mapping: {},
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  outlierCap: true,
  piiStrip: false,
  profiles: JSON.parse(localStorage.getItem("ops-copilot-profiles") || "{}"),
  savedViews: JSON.parse(localStorage.getItem("ops-copilot-views") || "[]"),
  dictionary: JSON.parse(localStorage.getItem("ops-copilot-dictionary") || "{}"),
  pinned: JSON.parse(localStorage.getItem("ops-copilot-pins") || "[]"),
  activeView: null,
  filters: {
    dateRange: null,
    market: [],
    queue: [],
    priority: []
  },
  intent: {
    raw: "",
    intents: [],
    chips: QUICK_CHIPS
  }
};

class Store {
  constructor(initial) {
    this.state = { ...initial };
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(partial) {
    this.state = { ...this.state, ...partial };
    this.persist();
    this.emit();
  }

  update(updater) {
    this.state = updater(this.state);
    this.persist();
    this.emit();
  }

  emit() {
    this.listeners.forEach((listener) => listener(this.state));
  }

  persist() {
    const { profiles, savedViews, dictionary, pinned } = this.state;
    localStorage.setItem("ops-copilot-profiles", JSON.stringify(profiles));
    localStorage.setItem("ops-copilot-views", JSON.stringify(savedViews));
    localStorage.setItem("ops-copilot-dictionary", JSON.stringify(dictionary));
    localStorage.setItem("ops-copilot-pins", JSON.stringify(pinned));
  }

  reset() {
    this.state = { ...DEFAULT_STATE };
    this.persist();
    this.emit();
  }
}

export const store = new Store(DEFAULT_STATE);

export function initialiseTimezoneSelect(select) {
  const zones = Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [DEFAULT_STATE.timezone];
  select.innerHTML = zones
    .map((zone) => `<option value="${zone}">${zone}</option>`)
    .join("");
  select.value = store.state.timezone;
  select.addEventListener("change", () => {
    store.set({ timezone: select.value });
  });
}

export function getMappingOptions(headers) {
  const options = Object.entries(STANDARD_FIELDS).map(
    ([field, meta]) => `<option value="${field}">${meta.label}</option>`
  );
  return [`<option value="">Ignore</option>`, ...options];
}

export function saveProfile(name, mapping) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  store.update((state) => ({
    ...state,
    profiles: { ...state.profiles, [trimmed]: mapping }
  }));
  return true;
}

export function deleteProfile(name) {
  store.update((state) => {
    const { [name]: _, ...rest } = state.profiles;
    return { ...state, profiles: rest };
  });
}

export function setMapping(mapping) {
  store.set({ mapping });
}

export function addPinnedInsight(insight) {
  store.update((state) => {
    const next = [...state.pinned, insight].slice(-20);
    return { ...state, pinned: next };
  });
}

export function clearPins() {
  store.set({ pinned: [] });
}

export function setIntent(raw, intents) {
  store.update((state) => ({
    ...state,
    intent: { ...state.intent, raw, intents }
  }));
}

export function setFilters(filters) {
  store.update((state) => ({ ...state, filters }));
}

export function addDictionaryEntry(key, values) {
  store.update((state) => ({
    ...state,
    dictionary: { ...state.dictionary, [key]: values }
  }));
}

export function deleteDictionaryEntry(key) {
  store.update((state) => {
    const { [key]: _, ...rest } = state.dictionary;
    return { ...state, dictionary: rest };
  });
}

export function saveDictionary(dictionary) {
  store.set({ dictionary });
}

export function saveView(view) {
  store.update((state) => ({
    ...state,
    savedViews: [...state.savedViews.filter((item) => item.name !== view.name), view ],
    activeView: view.name
  }));
}

export function activateView(name) {
  store.update((state) => ({
    ...state,
    activeView: name
  }));
}

export function setData({ rawRows, normalisedRows, headers }) {
  store.set({ rawRows, normalisedRows, headers });
}
