import { saveRecord } from "./actions.js";
import { createId } from "./app-defaults.js";
import { state, ui } from "./app-state.js";
import { assignedExperimentIds, assignmentLabels, tripExperimentIds } from "./experiments-model.js";
import { html, insertHtml, setHtml } from "./html.js";
import { updateTripField } from "./draft-binding.js";
import { markTripFormChanged } from "./trip-editor.js";

export function renderTripExperimentPicker() {
  const choices = document.querySelector("#tripExperimentChoices");
  if (!choices) return;
  const selected = new Set(tripExperimentIds(ui.tripDraft));
  const assigned = assignedExperimentIds(ui.tripDraft);
  const focusedId = document.activeElement?.getAttribute("data-trip-experiment");
  const experiments = (state.experiments || [])
    .filter(experiment => !experiment.archived || selected.has(experiment.id))
    .sort((first, second) => first.name.localeCompare(second.name));
  const names = experiments.filter(experiment => selected.has(experiment.id)).map(experiment => experiment.name);
  document.querySelector("#tripExperimentSelection").textContent = names.join(", ") || "No experiments selected";
  setHtml(choices, experiments.length ? html`${experiments.map(experiment =>
    html`<label><input type="checkbox" data-trip-experiment="${experiment.id}"
      ${selected.has(experiment.id) ? "checked" : ""} ${assigned.has(experiment.id) ? "disabled" : ""}>
      <span>${experiment.name}${experiment.archived ? " (archived)" : ""}${assigned.has(experiment.id) ? " · assigned on setup" : ""}</span></label>`
  )}` : html`<small>No experiments available. Use New to create one.</small>`);
  if (focusedId) {
    const checkbox = [...choices.querySelectorAll("[data-trip-experiment]")].find(item => item.dataset.tripExperiment === focusedId);
    if (checkbox && !checkbox.disabled) checkbox.focus();
    else document.querySelector("#tripExperiment summary")?.focus();
  }
}

export function renderTripSetupExperiments() {
  const lines = new Map((ui.tripDraft?.gearUsed || []).map(line => [line.id, line]));
  const selected = new Set(tripExperimentIds(ui.tripDraft));
  for (const row of document.querySelectorAll("#tripDialog .gear-used-row")) {
    const line = lines.get(row.dataset.gearId);
    if (line) renderSetupExperiments(row, line, selected);
  }
}

function showQuickCreateMessage(message = "") {
  const target = document.querySelector("#experimentQuickCreateMessage");
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("hidden", !message);
}

export function setupExperimentQuickCreate() {
  const trigger = document.querySelector("#addExperimentFromTripButton");
  const dialog = document.querySelector("#experimentQuickCreateDialog");
  const form = document.querySelector("#experimentQuickCreateForm");
  if (!trigger || !dialog || !form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";
  const name = document.querySelector("#experimentQuickCreateName");
  const variants = document.querySelector("#experimentQuickCreateVariants");
  const variantInput = index => html`<label><span>Variant ${index}</span><input type="text" ${index <= 2 ? "required" : ""} maxlength="80"></label>`;
  const picker = document.querySelector("#tripExperiment");
  picker?.addEventListener("toggle", () => {
    if (picker.open) renderTripExperimentPicker();
  });

  trigger.addEventListener("click", () => {
    form.reset();
    setHtml(variants, html`${variantInput(1)}${variantInput(2)}`);
    showQuickCreateMessage();
    dialog.showModal();
    name.focus();
  });
  document.querySelector("#experimentQuickAddVariant").addEventListener("click", () => {
    insertHtml(variants, "beforeend", variantInput(variants.children.length + 1));
    variants.lastElementChild.querySelector("input").focus();
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const variantNames = [...variants.querySelectorAll("input")].map(input => input.value.trim()).filter(Boolean);
    if (!name.value.trim()) {
      showQuickCreateMessage("Enter a name for the experiment.");
      name.focus();
      return;
    }
    if (variantNames.length < 2) {
      showQuickCreateMessage("Enter at least two variant names.");
      return;
    }
    if (new Set(variantNames.map(value => value.toLowerCase())).size !== variantNames.length) {
      showQuickCreateMessage("Give each variant a different name.");
      return;
    }
    const record = {
      id: createId(),
      name: name.value.trim(),
      notes: "",
      archived: false,
      variants: variantNames.map(name => ({ id: createId(), name }))
    };
    const saveButton = document.querySelector("#experimentQuickCreateSave");
    saveButton.disabled = true;
    showQuickCreateMessage();
    try {
      await saveRecord("experiments", record);
      updateTripField("experimentIds", [...tripExperimentIds(ui.tripDraft), record.id]);
      renderTripExperimentPicker();
      renderTripSetupExperiments();
      markTripFormChanged();
      dialog.close();
      document.querySelector("#tripExperiment summary")?.focus();
    } catch (error) {
      showQuickCreateMessage(error instanceof Error ? error.message : "The experiment could not be saved.");
    } finally {
      saveButton.disabled = false;
    }
  });
}

export function renderSetupExperiments(row, line, selected = new Set(tripExperimentIds(ui.tripDraft))) {
  const target = row.querySelector(".experiment-assignment-list");
  if (!target) return;
  const assignments = line.experimentAssignments || [];
  const experiments = (state.experiments || []).filter(experiment => selected.has(experiment.id));
  target.hidden = !experiments.length;
  setHtml(target, html`${experiments.map(experiment => {
    const assignment = assignments.find(item => item.experimentId === experiment.id);
    return html`<fieldset><legend>${experiment.name}${experiment.archived ? " (archived)" : ""}</legend>
      <label>Variant<select data-setup-experiment="${experiment.id}">
        <option value="">Unassigned</option>
        ${experiment.variants.map(variant => html`<option value="${variant.id}" ${variant.id === assignment?.variantId ? "selected" : ""}>${variant.name}</option>`)}
      </select></label>
    </fieldset>`;
  })}`);
}

export function renderFishExperiments(row, fish) {
  const target = row.querySelector(".experiment-fish-assignment");
  if (!target) return;
  const line = ui.tripDraft?.gearUsed?.find(item => item.id === fish.setupLineId);
  const labels = assignmentLabels(state.experiments || [], line?.experimentAssignments);
  target.textContent = labels;
  target.hidden = !labels;
}
