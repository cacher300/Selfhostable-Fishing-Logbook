import { state, ui } from "./app-state.js";
import { previewImage } from "./app-media.js";
import { html, joinHtml, setHtml } from "./html.js";
import { rankLuresByTripHistory } from "./lure-history.js";

let dialog = null;
let active = null;

function createDialog() {
  const picker = document.createElement("dialog");
  picker.id = "lurePickerDialog";
  picker.className = "dialog lure-picker-dialog";
  picker.setAttribute("aria-labelledby", "lurePickerTitle");
  setHtml(picker, html`
    <div class="lure-picker-shell">
      <header class="dialog-header">
        <h2 id="lurePickerTitle">Select lure</h2>
        <button class="icon-button" type="button" data-lure-picker-close aria-label="Close lure picker">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </header>
      <div class="lure-picker-controls">
        <label><span class="visually-hidden">Search lures</span><input type="search" id="lurePickerSearch" placeholder="Search lures by name, color, type, or brand" autocomplete="off" autofocus /></label>
        <label><span class="visually-hidden">Lure type</span><select id="lurePickerType"></select></label>
      </div>
      <div class="lure-picker-results">
        <section class="lure-picker-common" aria-labelledby="commonLuresTitle" hidden>
          <h3 id="commonLuresTitle">Common lures</h3>
          <div class="lure-picker-grid" data-common-lures></div>
        </section>
        <section aria-labelledby="lureLibraryTitle">
          <div class="lure-picker-library-heading">
            <h3 id="lureLibraryTitle">Lure library</h3>
            <span data-lure-count role="status"></span>
          </div>
          <div class="lure-picker-grid" data-lure-library></div>
          <p class="lure-picker-empty" hidden></p>
        </section>
      </div>
      <footer class="dialog-actions lure-picker-actions">
        <button class="button secondary" type="button" data-clear-lure>Clear selection</button>
        <button class="button secondary" type="button" data-lure-picker-close>Cancel</button>
      </footer>
    </div>`);
  picker.querySelector("#lurePickerSearch").addEventListener("input", renderResults);
  picker.querySelector("#lurePickerType").addEventListener("change", renderResults);
  picker.addEventListener("click", (event) => {
    if (event.target.closest("[data-lure-picker-close]")) {
      picker.close();
      return;
    }
    const choice = event.target.closest("[data-lure-choice], [data-clear-lure]");
    if (!choice || !active) return;
    const { onChoose } = active;
    picker.close();
    onChoose(choice.dataset.lureChoice || "");
  });
  picker.addEventListener("close", () => {
    if (picker.open) return;
    const trigger = active?.trigger;
    active = null;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  });
  document.body.append(picker);
  return picker;
}

function lureCard(lure) {
  const photo = previewImage(lure);
  const selected = lure.id === active.selectedId;
  const detail = [lure.type, lure.brand].filter(Boolean).join(" · ");
  return html`<button type="button" class="lure-picker-card${selected ? " is-selected" : ""}" data-lure-choice="${lure.id}">
    ${photo ? html`<img src="${photo}" alt="" loading="lazy" decoding="async" />` : ""}
    <span class="lure-picker-card-copy">
      <strong>${[lure.name || "Lure", lure.color].filter(Boolean).join(" · ")}</strong>
      ${detail ? html`<small>${detail}</small>` : ""}
      ${selected ? html`<small class="lure-picker-selected">Selected</small>` : ""}
    </span>
  </button>`;
}

function renderResults() {
  if (!active) return;
  const query = dialog.querySelector("#lurePickerSearch").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const type = dialog.querySelector("#lurePickerType").value;
  const matches = active.lures.filter((lure) => {
    if (type && String(lure.type || "").trim() !== type) return false;
    const text = [lure.name, lure.color, lure.type, lure.brand].filter(Boolean).join(" ").toLowerCase();
    return query.every((word) => text.includes(word));
  });
  const matchingIds = new Set(matches.map((lure) => lure.id));
  const common = active.ranked.filter((lure) => matchingIds.has(lure.id)).slice(0, 5);
  dialog.querySelector(".lure-picker-common").hidden = !common.length;
  setHtml(dialog.querySelector("[data-common-lures]"), joinHtml(common.map(lureCard)));
  setHtml(dialog.querySelector("[data-lure-library]"), joinHtml(matches.map(lureCard)));
  dialog.querySelector("[data-lure-count]").textContent = `${matches.length} ${matches.length === 1 ? "lure" : "lures"}`;
  const empty = dialog.querySelector(".lure-picker-empty");
  empty.hidden = Boolean(matches.length);
  empty.textContent = active.lures.length ? "No lures match these filters." : "No saved lures to choose from.";
  dialog.querySelector(".lure-picker-results").scrollTop = 0;
}

export function openLurePicker({ lures, selectedId, preferredType, trigger, onChoose }) {
  dialog ||= createDialog();
  const sorted = [...lures].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))
    || String(a.color || "").localeCompare(String(b.color || "")));
  const trip = ui.tripDraft || {};
  const location = state.locations.find((item) => item.id === trip.locationId)?.name || trip.location;
  const ranked = rankLuresByTripHistory(sorted, state.trips, { ...trip, location });
  active = { lures: sorted, selectedId, trigger, onChoose, ranked };
  const types = [...new Set(sorted.map((lure) => String(lure.type || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const type = dialog.querySelector("#lurePickerType");
  setHtml(type, html`<option value="">All lure types</option>${joinHtml(types.map((name) => html`<option value="${name}">${name}</option>`))}`);
  type.value = types.includes(preferredType) ? preferredType : "";
  const search = dialog.querySelector("#lurePickerSearch");
  search.value = "";
  dialog.querySelector("[data-clear-lure]").disabled = !selectedId;
  renderResults();
  dialog.showModal();
  search.focus();
}
