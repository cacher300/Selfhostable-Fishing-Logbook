import { saveRecord } from "./actions.js";
import { createId } from "./app-defaults.js";
import { state } from "./app-state.js";
import { setupExperimentQuickCreate } from "./experiment-trip.js";
import { experimentResults } from "./experiments-model.js";
import { html, setHtml } from "./html.js";
import { openTripSummary } from "./trip-timeline.js";

let draft = null;
let saving = false;
const expanded = new Set();
const panel = () => document.querySelector("#experimentsPanel");
const editor = () => document.querySelector("#experimentEditor");
const metric = (value, suffix = "") => value == null ? "—" : `${Number(value.toFixed(2))}${suffix}`;
const button = (action, label, id) => html`<button type="button" class="button secondary" data-experiment-action="${action}" data-experiment-id="${id}">${label}</button>`;

function deployment(row) {
  return html`<li class="experiment-deployment">
    ${button("trip", row.tripTitle, row.tripId)}
    <p>${[row.date, row.label, [row.startTime, row.endTime].filter(Boolean).join("–"), row.hours === null ? "Timing incomplete" : `${metric(row.hours)} rod-hours`].filter(Boolean).join(" · ")}</p>
    ${row.events.length ? html`<ul>${row.events.map(fish => html`<li>${fish.missed ? "Missed" : "Landed"} · ${fish.quantity} × ${fish.species || "Unknown species"}${fish.time ? ` · ${fish.time}` : ""}</li>`)}</ul>` : html`<p>No fish logged</p>`}
  </li>`;
}

export function renderExperiments() {
  const target = document.querySelector("#experimentResults");
  if (!target) return;
  const experiments = state.experiments || [];
  setHtml(target, experiments.length ? html`${experiments.map(experiment => html`<article class="experiment-card">
    <header class="experiment-heading">
      <div><h3>${experiment.name}${experiment.archived ? html` <small>Archived</small>` : ""}</h3>${experiment.notes ? html`<p>${experiment.notes}</p>` : ""}</div>
      <div class="experiment-actions">${button("edit", "Edit", experiment.id)} ${button("archive", experiment.archived ? "Restore" : "Archive", experiment.id)}</div>
    </header>
    ${experimentResults(state, experiment).map(result => {
      const key = `${experiment.id}/${result.variant.id}`;
      return html`<section class="experiment-variant" aria-label="${result.variant.name}">
        <h4>${result.variant.name}</h4>
        <dl class="experiment-metrics">${[
          ["Rod-hours", metric(result.hours)], ["Landed", result.landed], ["Missed", result.missed],
          ["Landed / rod-hour", metric(result.landedRate)], ["Strikes / rod-hour", metric(result.strikeRate)],
          ["Percent landed", metric(result.percentLanded, "%")]
        ].map(([label, value]) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`)}</dl>
        ${result.untimed ? html`<p>${result.untimed} ${result.untimed === 1 ? "deployment has" : "deployments have"} incomplete timing.</p>` : ""}
        ${result.rows.length ? html`<details data-experiment-variant="${key}" ${expanded.has(key) ? "open" : ""}>
          <summary>Deployments <small>${result.rows.length}</small></summary>
          <ul class="experiment-deployments">${result.rows.map(deployment)}</ul>
        </details>` : html`<p>No setups assigned to this variant.</p>`}
      </section>`;
    })}
  </article>`)}` : html`<p class="experiment-card">Create an experiment to compare timed rod setups and their catches.</p>`);
}

function feedback(message = "") {
  const node = document.querySelector("#experimentFeedback");
  node.textContent = message;
  node.hidden = !message;
}

function namedInput(label, path, value, required = true) {
  return html`<label>${label}<input data-experiment-field="${path}" value="${value}" ${required ? "required" : ""}></label>`;
}

function renderEditor() {
  const form = editor();
  form.hidden = !draft;
  if (!draft) return;
  setHtml(form, html`<h3>${(state.experiments || []).some(item => item.id === draft.id) ? "Edit experiment" : "New experiment"}</h3>
    ${namedInput("Experiment name", "name", draft.name)}
    <label>Notes<textarea data-experiment-field="notes" rows="2">${draft.notes || ""}</textarea></label>
    <fieldset><legend>Variants</legend>
      ${draft.variants.map((variant, i) => html`<div class="experiment-variant-editor">
        ${namedInput(`Variant ${i + 1}`, `variants.${i}.name`, variant.name)}
        ${draft.variants.length > 2 && !(state.experiments || []).find(item => item.id === draft.id)?.variants.some(item => item.id === variant.id)
          ? button("remove-variant", "Remove variant", i) : ""}
      </div>`)}
      ${button("variant", "Add variant")}
    </fieldset>
    <div class="experiment-actions"><button type="submit" class="button primary">Save experiment</button>${button("cancel", "Cancel")}</div>`);
}

async function persistExperiment(record, close = false) {
  if (saving) return;
  saving = true;
  feedback();
  try {
    await saveRecord("experiments", record);
    if (close) {
      draft = null;
      renderEditor();
      panel().querySelector('[data-experiment-action="new"]').focus();
    }
    renderExperiments();
    feedback("Experiment saved.");
  } catch (error) {
    feedback(error.message);
  } finally {
    saving = false;
  }
}

export function setupExperiments() {
  const root = panel();
  if (!root) return;
  setupExperimentQuickCreate();
  root.addEventListener("toggle", event => {
    const key = event.target.getAttribute("data-experiment-variant");
    if (key && event.target.isConnected) {
      if (event.target.open) expanded.add(key);
      else expanded.delete(key);
    }
  }, true);
  root.addEventListener("click", event => {
    const control = event.target.closest("[data-experiment-action]");
    if (!control || saving) return;
    const { experimentAction: action, experimentId: id } = control.dataset;
    const existing = (state.experiments || []).find(item => item.id === id);
    if (action === "trip") {
      const trip = state.trips.find(item => item.id === id);
      if (trip) openTripSummary(trip);
      return;
    }
    if (action === "archive" && existing) {
      if (draft?.id === id) return;
      void persistExperiment({ ...existing, archived: !existing.archived });
      return;
    }
    if (action === "new") draft = { id: createId(), name: "", notes: "", variants: Array.from({ length: 2 }, () => ({ id: createId(), name: "" })) };
    if (action === "edit" && existing) draft = structuredClone(existing);
    if (action === "cancel") draft = null;
    if (action === "variant") draft.variants.push({ id: createId(), name: "" });
    if (action === "remove-variant") draft.variants.splice(Number(id), 1);
    feedback();
    renderEditor();
    if (action === "new" || action === "edit") editor().querySelector("input")?.focus();
    if (action === "variant") Array.from(editor().querySelectorAll('[data-experiment-field^="variants."]')).at(-1)?.focus();
    if (action === "remove-variant") editor().querySelector('[data-experiment-action="variant"]')?.focus();
    if (action === "cancel") root.querySelector('[data-experiment-action="new"]').focus();
  });
  editor().addEventListener("input", event => {
    const path = event.target.getAttribute("data-experiment-field")?.split(".");
    if (!draft || !path) return;
    const key = path.pop();
    path.reduce((value, step) => value[step], draft)[key] = event.target.value;
  });
  editor().addEventListener("submit", event => {
    event.preventDefault();
    if (!draft) return;
    const cleanName = item => ({ ...item, name: item.name.trim() });
    const record = {
      ...cleanName(draft), notes: draft.notes?.trim(), variants: draft.variants.map(cleanName)
    };
    void persistExperiment(record, true);
  });
}
