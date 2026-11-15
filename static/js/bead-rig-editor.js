import { html, joinHtml, setHtml } from "./html.js";
import { state } from "./app-state.js";
import { draftRecordForRow, updateTripRow } from "./draft-binding.js";
import { beadRigPatch } from "./bead-rig.js";

function refreshBeadChoices(select, selected = "") {
  const choices = state.lures.filter((item) => item.type?.trim().toLowerCase() === "bead" || item.id === selected);
  const signature = JSON.stringify([selected, choices.map((item) => [item.id, item.name])]);
  if (select.dataset.beadChoices === signature) return;
  select.dataset.beadChoices = signature;
  setHtml(select, html`<option value="">Select bead</option>${joinHtml(choices.map((item) => html`<option value="${item.id}">${item.name}</option>`))}${selected && !choices.some((item) => item.id === selected) ? html`<option value="${selected}">Unavailable bead</option>` : ""}`);
  select.value = selected;
}

export function refreshBeadRigEditor(row, populate = false) {
  if (!row) return;
  const record = draftRecordForRow(row) || {};
  const panel = row.querySelector(".bead-rig-editor");
  if (!panel) return;
  const bead = state.lures.find((item) => item.id === record.lureId)?.type?.toLowerCase() === "bead";
  panel.classList.toggle("hidden", (!bead && !record.beadCount) || Boolean(record.detailsUnknown));
  const count = Number(record.beadCount) || 1;
  for (const key of ["secondBeadLureId", "thirdBeadLureId"]) refreshBeadChoices(panel.querySelector(`[data-bind="${key}"]`), record[key]);
  panel.querySelectorAll("[data-bead-min]").forEach((field) => field.classList.toggle("hidden", count < Number(field.dataset.beadMin)));
  if (populate) panel.querySelectorAll("[data-bind]").forEach((control) => {
    control.value = record[control.dataset.bind] ?? (control.dataset.bind === "beadCount" ? "1" : "");
  });
}

export function mountBeadRigEditor(row) {
  const panel = document.createElement("section");
  panel.className = "gear-editor-panel bead-rig-editor hidden";
  const record = draftRecordForRow(row) || {};
  setHtml(panel, html`<div class="gear-panel-heading"><h4>Bead rig</h4></div><div class="form-grid">
    <label><span>Beads on rig</span><select data-bind="beadCount"><option value="1">1 bead</option><option value="2">2 beads</option><option value="3">3 beads</option></select></label>
    <label><span>Bead attachment</span><input data-bind="beadAttachment" placeholder="Pegged, banded, other" /></label>
    <label><span>Nearest bead to hook</span><input data-bind="beadToHookDistance" placeholder="Include units, e.g. 2 in" /></label>
    <label data-bead-min="2"><span>Bead 2</span><select data-bind="secondBeadLureId"></select></label>
    <label data-bead-min="2"><span>Bead 1–2 spacing</span><input data-bind="beadSpacing" placeholder="Include units, e.g. 12 in" /></label>
    <label data-bead-min="3"><span>Bead 3</span><select data-bind="thirdBeadLureId"></select></label>
    <label data-bead-min="3"><span>Bead 2–3 spacing</span><input data-bind="thirdBeadSpacing" placeholder="Include units, e.g. 12 in" /></label>
  </div>`);
  row.querySelector(".collapsible-row-body").append(panel);
  panel.addEventListener("change", (event) => {
    if (event.target.dataset.bind !== "beadCount") return;
    const collection = row.classList.contains("gear-used-row") ? "gearUsed" : row.classList.contains("lost-fish-row") ? "lostFish" : "catches";
    updateTripRow(collection, record.id, beadRigPatch({ ...draftRecordForRow(row), beadCount: event.target.value }));
    refreshBeadRigEditor(row, true);
  });
  refreshBeadRigEditor(row, true);
}
