import { detectField, STANDARD_FIELDS, inferType } from "./utils.js";
import { store, setMapping } from "./state.js";

export function autoDetectMapping(headers, dictionary) {
  const mapping = {};
  headers.forEach((header) => {
    const normalised = header.toString().trim();
    const synonyms = Object.entries(dictionary).find(([key, values]) => {
      return [key, ...(values || [])].some((value) => value.toLowerCase() === normalised.toLowerCase());
    });
    if (synonyms) {
      mapping[header] = synonyms[0];
      return;
    }
    mapping[header] = detectField(header);
  });
  setMapping(mapping);
  return mapping;
}

export function buildMappingGrid(container) {
  const { headers, mapping } = store.state;
  const options = Object.entries(STANDARD_FIELDS).map(
    ([field, meta]) => `<option value="${field}">${meta.label}</option>`
  );
  container.innerHTML = headers
    .map((header) => {
      const selected = mapping[header] || "";
      return `
        <div class="mapping-row">
          <label>
            ${header}
            <select data-header="${header}">
              <option value="">Ignore</option>
              ${options
                .map((option) => option.replace(`value="${selected}"`, `value="${selected}" selected`))
                .join("")}
            </select>
          </label>
          <span class="field-hint" data-hint="${header}"></span>
        </div>
      `;
    })
    .join("");
}

export function attachMappingListeners(container, onChange) {
  container.addEventListener("change", (event) => {
    const select = event.target.closest("select[data-header]");
    if (!select) return;
    const { mapping } = store.state;
    const next = { ...mapping, [select.dataset.header]: select.value };
    setMapping(next);
    if (onChange) onChange(next);
  });
}

export function enrichWithHints(container, sampleRows) {
  container.querySelectorAll(".field-hint").forEach((span) => {
    const header = span.dataset.hint;
    const sample = sampleRows
      .map((row) => row[header])
      .filter((value) => value !== undefined && value !== null)
      .slice(0, 3);
    if (!sample.length) {
      span.textContent = "";
      return;
    }
    const types = sample.map((value) => inferType(value));
    const typeSummary = types.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    const summary = Object.entries(typeSummary)
      .map(([type, count]) => `${type} ×${count}`)
      .join(", ");
    span.textContent = `${sample.join(", ")} (${summary})`;
  });
}
