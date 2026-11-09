import { html, insertHtml, joinHtml, setHtml } from "./html.js";
import { createId } from "./app-defaults.js";
import { state, ui } from "./app-state.js";
import { currentSavedSetups } from "./app-normalization.js";
import { updateSettings } from "./actions.js";
import { els } from "./app-elements.js";
import { runSettingsSave, scheduleSettingsAutosave, cancelSettingsAutosave, settingsUi } from "./settings-core.js";
import { getValue, syncTripFormChrome } from "./trip-editor.js";
import { addTripGearRow, populateCatchRodSelects, populateSetupLineSelects, updateAllRowSummaries } from "./trip-rows.js";
import { handleSettingsDraftControlEvent, replaceTripRows } from "./draft-binding.js";
import { comboName } from "./gear-core.js";
import { renderLiveTrollingSpread } from "./trolling-spread.js";
import { isTrollingTrip } from "./form-utils.js";
import { preferencesDraftFromSettings, savedSetupFromDraft } from "./settings-draft.js";


export let activeSavedSetupEditorId = "";
export let savedSetupDraft = null;
const collapsedSavedSetupMethods = new Set();

function savedSetupMethodKey(method) {
  return String(method || "").trim().toLowerCase();
}

export function savedSetupMethods() {
  const methods = [];
  const seen = new Set();
  const addMethod = (method) => {
    const text = String(method || "").trim();
    const key = text.toLowerCase();
    if (!text || key === "trolling" || seen.has(key)) return;
    seen.add(key);
    methods.push(text);
  };
  (state.methods || []).forEach(addMethod);
  currentSavedSetups().forEach((setup) => addMethod(setup.method));
  return methods;
}

export function savedSetupsForMethod(method, setups = state.settings?.savedSetups) {
  const methodKey = String(method || "").trim().toLowerCase();
  return currentSavedSetups(setups).filter((setup) => setup.method.toLowerCase() === methodKey);
}

export function savedSetupDefaultId(method, defaults = state.settings?.defaultSavedSetupIds) {
  const methodKey = String(method || "").trim().toLowerCase();
  const entry = Object.entries(defaults && typeof defaults === "object" ? defaults : {})
    .find(([key]) => String(key || "").trim().toLowerCase() === methodKey);
  return String(entry?.[1] || "");
}

export function savedSetupRowMarkup(item = {}, { disabled = false, sourceIndex = "", setupIndex = 0 } = {}) {
  const comboId = String(item.comboId || "");
  const rowPath = `rows.${sourceIndex === "" ? 0 : sourceIndex}.comboId`;
  const bindPath = setupIndex === null ? rowPath : `${setupIndex}.${rowPath}`;
  const comboOptions = joinHtml(state.rodReelCombos.map((combo) => (
    html`<option value="${combo.id}" ${combo.id === comboId ? "selected" : ""}>${comboName(combo.id) || "Rod / reel combo"}</option>`
  )), "");
  return html`
    <div class="saved-setup-row"${sourceIndex === "" ? "" : html` data-source-index="${sourceIndex}"`}>
      <label>
        <span>Rod / reel combo</span>
        <select class="saved-setup-combo" ${setupIndex === null ? "" : html`data-settings-draft="savedSetupsDraft"`} data-settings-bind="${bindPath}"${disabled ? " disabled" : ""}>
          <option value="">Select rod / reel combo</option>
          ${comboOptions}
        </select>
      </label>
      ${disabled ? "" : html`<button class="button danger remove-saved-setup-row" type="button">Remove</button>`}
    </div>
  `;
}

export function renderSavedSetupCard(item, { draft = false, index = 0 } = {}) {
  const editing = draft || activeSavedSetupEditorId === item.id;
  const rows = Array.isArray(item.rows) ? item.rows : [];
  return html`
    <article class="saved-setup-card${draft ? " is-draft" : ""}"
      data-saved-setup-id="${item.id}"
      data-saved-setup-index="${index}"
      data-saved-setup-method="${item.method}"
      data-saved-setup-draft="${draft ? "true" : "false"}"
      data-saved-setup-editing="${editing ? "true" : "false"}"
      data-saved-setup-toggle>
      <div class="saved-setup-card-header">
        <label class="settings-control saved-setup-name-control">
          <span>Setup name</span>
          <input class="saved-setup-name" type="text" maxlength="60" value="${item.name || ""}" data-settings-draft="savedSetupsDraft" data-settings-bind="${index}.name" placeholder="Light Jigging"${editing ? "" : " readonly"} />
        </label>
        <div class="saved-setup-card-actions">
          ${editing && !draft ? html`<button class="button secondary finish-saved-setup-edit" type="button">Done</button>` : !editing ? html`<button class="button secondary edit-saved-setup" type="button">Edit</button>` : ""}
          ${draft ? html`<button class="button secondary cancel-saved-setup" type="button">Cancel</button>` : html`<button class="button danger delete-saved-setup" type="button">Delete</button>`}
        </div>
      </div>
      <div class="saved-setup-card-body"${editing ? "" : " hidden"}>
        <div class="saved-setup-card-section-heading">
          <div>
            <strong>Rods</strong>
          </div>
          ${editing ? html`<button class="button secondary add-saved-setup-row" type="button">Add Rod</button>` : ""}
        </div>
        <div class="saved-setup-list">
          ${rows.length ? joinHtml(rows.map((row, rowIndex) => savedSetupRowMarkup(row, { disabled: !editing, sourceIndex: rowIndex, setupIndex: index }))) : html`<p class="saved-setup-empty-rows">Add at least one rod to save this setup.</p>`}
        </div>
      </div>
    </article>
  `;
}

export function renderSavedSetupMethodSection(method, setups, methodIndex = 0) {
  const methodSetups = setups.filter((setup) => setup.method.toLowerCase() === method.toLowerCase());
  const selectableSetups = methodSetups.filter((setup) => setup.id !== savedSetupDraft?.id);
  const defaultId = savedSetupDefaultId(method);
  const collapsed = collapsedSavedSetupMethods.has(savedSetupMethodKey(method));
  const contentId = `savedSetupMethodContent${methodIndex}`;
  const methodOptions = joinHtml(selectableSetups.map((setup) => (
    html`<option value="${setup.id}" ${setup.id === defaultId ? "selected" : ""}>${setup.name}</option>`
  )), "");
  return html`
    <section class="saved-setup-method-section" data-saved-setup-method-section="${method}">
      <div class="saved-setup-method-header">
        <h4 class="saved-setup-method-heading">
          <button class="saved-setup-method-toggle" type="button" data-saved-setup-method-toggle="${method}" aria-expanded="${collapsed ? "false" : "true"}" aria-controls="${contentId}">
            <span>${method}</span>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 6 4.5 4 4.5-4" /></svg>
          </button>
        </h4>
        <div class="saved-setup-method-controls">
          <label class="settings-control">
            <span>${method} default</span>
            <select class="saved-setup-default" data-saved-setup-method="${method}" data-settings-draft="preferencesDraft" data-settings-bind="defaultSavedSetupIds.${method}">
              <option value="">No ${method} default</option>
              ${methodOptions}
            </select>
          </label>
          <button class="button secondary add-saved-setup" type="button" data-saved-setup-new-method="${method}">New Setup</button>
        </div>
      </div>
      <div class="saved-setup-list" id="${contentId}" data-saved-setup-list="${method}"${collapsed ? " hidden" : ""}>
        ${methodSetups.length
          ? joinHtml(methodSetups.map((setup) => renderSavedSetupCard(setup, { draft: setup === savedSetupDraft, index: setups.findIndex((item) => item.id === setup.id) })))
          : html`<p class="saved-setup-empty-state">No saved setups for this method yet.</p>`}
      </div>
    </section>
  `;
}

export function renderSavedSetupSettings() {
  if (!els.savedSetupMethodSections) return;
  const setups = currentSavedSetups();
  const visibleSetups = savedSetupDraft ? [...setups, savedSetupDraft] : setups;
  settingsUi.savedSetupsDraft = structuredClone(visibleSetups);
  if (!settingsUi.preferencesDraft) settingsUi.preferencesDraft = preferencesDraftFromSettings(state.settings || {});
  const methods = savedSetupMethods();
  setHtml(els.savedSetupMethodSections, methods.length
    ? joinHtml(methods.map((method, index) => renderSavedSetupMethodSection(method, visibleSetups, index)))
    : html`<p class="saved-setup-empty-state">Add a non-trolling method in Settings → Categories to create saved setups.</p>`);
}

export function addSavedSetup(method) {
  if (savedSetupDraft) {
    document.querySelector(`[data-saved-setup-id="${CSS.escape(savedSetupDraft.id)}"] .saved-setup-name`)?.focus();
    return;
  }
  const setupMethod = String(method || "").trim();
  collapsedSavedSetupMethods.delete(savedSetupMethodKey(setupMethod));
  savedSetupDraft = { id: createId(), name: "", method: setupMethod, rows: [] };
  activeSavedSetupEditorId = savedSetupDraft.id;
  renderSavedSetupSettings();
  document.querySelector(`[data-saved-setup-id="${CSS.escape(savedSetupDraft.id)}"] .saved-setup-name`)?.focus();
}

export function addSavedSetupRowToCard(card) {
  const list = card?.querySelector(".saved-setup-list");
  if (!list || card.dataset.savedSetupEditing !== "true") return;
  const setup = settingsUi.savedSetupsDraft?.[Number(card.dataset.savedSetupIndex)];
  if (setup) {
    if (!Array.isArray(setup.rows)) setup.rows = [];
    setup.rows.push({ comboId: "" });
  }
  card.querySelector(".saved-setup-empty-rows")?.remove();
  insertHtml(list, "beforeend", savedSetupRowMarkup({}, { sourceIndex: setup?.rows?.length ? setup.rows.length - 1 : "" , setupIndex: Number(card.dataset.savedSetupIndex) }));
  scheduleSavedSetupAutosave(card);
  list.querySelector(".saved-setup-row:last-child select")?.focus();
}

export function editSavedSetup(setupId) {
  if (!currentSavedSetups().some((setup) => setup.id === setupId)) return;
  activeSavedSetupEditorId = setupId;
  renderSavedSetupSettings();
  document.querySelector(`[data-saved-setup-id="${CSS.escape(setupId)}"] .saved-setup-name`)?.focus();
}

export function collectSavedSetupCard(card) {
  const id = card?.dataset.savedSetupId || createId();
  const existing = currentSavedSetups().find((setup) => setup.id === id);
  const draft = settingsUi.savedSetupsDraft?.[Number(card?.dataset.savedSetupIndex)] || { id, method: card?.dataset.savedSetupMethod || "", rows: [] };
  const next = savedSetupFromDraft({ ...draft, id, method: draft.method || card?.dataset.savedSetupMethod || "" }, existing || {});
  if (existing && JSON.stringify(draft.rows || []) === JSON.stringify(existing.rows || [])) next.rows = existing.rows || [];
  return next;
}

export function setSavedSetupSettingsMessage(message = "") {
  if (!els.savedSetupSettingsMessage) return;
  els.savedSetupSettingsMessage.textContent = message;
  els.savedSetupSettingsMessage.classList.toggle("hidden", !message);
}

export function toggleSavedSetupCard(card, event = null) {
  if (!card || card.dataset.savedSetupEditing === "true") return;
  if (event?.target?.closest("button, input, select, textarea, a")) return;
  const body = card.querySelector(".saved-setup-card-body");
  if (!body) return;
  body.hidden = !body.hidden;
  card.setAttribute("aria-expanded", String(!body.hidden));
}

function toggleSavedSetupMethodSection(toggle) {
  const section = toggle.closest("[data-saved-setup-method-section]");
  const content = section?.querySelector(".saved-setup-list");
  if (!section || !content) return;
  const collapsed = !content.hidden;
  const methodKey = savedSetupMethodKey(section.dataset.savedSetupMethodSection);
  content.hidden = collapsed;
  toggle.setAttribute("aria-expanded", String(!collapsed));
  if (collapsed) collapsedSavedSetupMethods.add(methodKey);
  else collapsedSavedSetupMethods.delete(methodKey);
}

export async function finishSavedSetupEdit(card) {
  const next = collectSavedSetupCard(card);
  if (!next.name) {
    setSavedSetupSettingsMessage("Enter a name for this setup before finishing.");
    card?.querySelector(".saved-setup-name")?.focus();
    return;
  }
  if (!next.rows.length) {
    setSavedSetupSettingsMessage("Add at least one rod with a rod / reel combo before finishing.");
    return;
  }
  if (next.rows.some((row) => !row.comboId)) {
    setSavedSetupSettingsMessage("Choose a combo or remove the empty rod row before finishing.");
    return;
  }
  cancelSettingsAutosave();
  await saveSavedSetupCard(card, { autosave: true });
  activeSavedSetupEditorId = "";
  setSavedSetupSettingsMessage("");
  renderSavedSetupSettings();
}

export function scheduleSavedSetupAutosave(card) {
  if (!card || card.dataset.savedSetupEditing !== "true") return;
  scheduleSettingsAutosave(async (options = {}) => {
    const next = collectSavedSetupCard(card);
    if (!next.name || !next.rows.length) return;
    await saveSavedSetupCard(card, options);
  });
}

function savedSetupValidationError(next, setups, { autosave = false } = {}) {
  if (!next.name) return { message: "Enter a name for this setup before saving.", focusName: true };
  if (!next.rows.length) return { message: "Add at least one rod with a rod / reel combo before saving." };
  if (next.rows.some((row) => !row.comboId)) {
    return {
      message: autosave
        ? "Autosave paused. Choose a combo or remove the empty rod row to continue."
        : "Choose a combo or remove the empty rod row before saving."
    };
  }
  const duplicate = setups.some((setup) => (
    setup.id !== next.id
    && setup.method.toLowerCase() === next.method.toLowerCase()
    && setup.name.toLowerCase() === next.name.toLowerCase()
  ));
  return duplicate ? { message: "Setup names must be unique within each method.", focusName: true } : null;
}

function persistSavedSetup(next, options = {}) {
  return updateSettings((settings) => {
    const setups = settings.savedSetups ?? [];
    const validation = savedSetupValidationError(next, setups, options);
    if (validation) throw new Error(validation.message);
    const index = setups.findIndex((setup) => setup.id === next.id);
    if (index >= 0) setups[index] = next;
    else setups.push(next);
    settings.savedSetups = setups;
  });
}

export async function saveSavedSetupCard(card, options = {}) {
  const next = collectSavedSetupCard(card);
  const wasDraft = card?.dataset.savedSetupDraft === "true";
  const validation = savedSetupValidationError(next, currentSavedSetups(), options);
  if (validation) {
    if (!options.silentInvalid) {
      setSavedSetupSettingsMessage(validation.message);
      if (validation.focusName) card?.querySelector(".saved-setup-name")?.focus();
    }
    return;
  }
  savedSetupDraft = null;
  activeSavedSetupEditorId = next.id;
  setSavedSetupSettingsMessage("");
  try {
    await runSettingsSave(
      () => persistSavedSetup(next, options),
      "The saved setup could not be saved.",
      options
    );
    renderSavedSetupSettings();
  } catch (error) {
    savedSetupDraft = wasDraft ? next : null;
    activeSavedSetupEditorId = next.id;
    renderSavedSetupSettings();
  }
}

export async function deleteSavedSetup(setupId) {
  const setup = currentSavedSetups().find((item) => item.id === setupId);
  if (!setup || !confirm(`Delete the ${setup.name} setup?`)) return;
  const setups = currentSavedSetups().filter((item) => item.id !== setupId);
  const defaults = { ...(state.settings?.defaultSavedSetupIds || {}) };
  Object.entries(defaults).forEach(([method, id]) => {
    if (id === setupId) delete defaults[method];
  });
  if (activeSavedSetupEditorId === setupId) activeSavedSetupEditorId = "";
  try {
    await runSettingsSave(
      () => updateSettings((settings) => {
        settings.savedSetups = setups;
        settings.defaultSavedSetupIds = defaults;
      }),
      "The saved setup could not be deleted."
    );
    renderSavedSetupSettings();
  } catch (error) {
    renderSavedSetupSettings();
  }
}

export async function saveDefaultSavedSetupId(method, options = {}) {
  const nextId = settingsUi.preferencesDraft?.defaultSavedSetupIds?.[method] || "";
  const setup = currentSavedSetups().find((item) => (
    item.id === nextId && item.method.toLowerCase() === String(method || "").trim().toLowerCase()
  ));
  if (nextId && !setup) return;
  const defaults = { ...(state.settings?.defaultSavedSetupIds || {}) };
  Object.keys(defaults).forEach((key) => {
    if (key.toLowerCase() === String(method || "").trim().toLowerCase()) delete defaults[key];
  });
  if (setup) defaults[setup.method] = setup.id;
  try {
    await runSettingsSave(
      () => updateSettings((settings) => { settings.defaultSavedSetupIds = defaults; }),
      `The ${method} default setup could not be saved.`,
      options
    );
  } catch (error) {
    renderSavedSetupSettings();
  }
}

export function savedSetupForCurrentMethod(setupId) {
  const method = getValue("method").trim();
  return currentSavedSetups().find((setup) => (
    setup.id === setupId && setup.method.toLowerCase() === method.toLowerCase()
  )) || null;
}

export function renderSavedSetupPicker() {
  if (!els.savedSetupPickerList) return;
  const method = getValue("method").trim();
  const setups = savedSetupsForMethod(method);
  const renderOption = (setup) => {
    const rodSummary = setup.rows.map((row, index) => comboName(row.comboId) || `Rod ${index + 1}`).join(" · ");
    const summary = `${setup.rows.length} rod${setup.rows.length === 1 ? "" : "s"} · ${rodSummary}`;
    return html`
        <button class="saved-setup-picker-option" type="button" data-pick-saved-setup="${setup.id}">
          <span class="saved-setup-picker-option-copy">
            <strong>${setup.name}</strong>
            <small>${summary}</small>
          </span>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        </button>
      `;
  };
  setHtml(els.savedSetupPickerList, setups.length
    ? joinHtml(setups.map(renderOption))
    : html`<p class="saved-setup-picker-empty">${method ? `No saved ${method} setups yet.` : "Choose a fishing method on the trip to pick or create a setup."}</p>`);
  const createButton = document.querySelector("#createSavedSetupButton");
  if (createButton) createButton.disabled = !method;
}

export function openSavedSetupPicker() {
  if (isTrollingTrip() || !els.savedSetupPickerDialog) return;
  renderSavedSetupPicker();
  els.savedSetupPickerDialog.showModal();
}

export function applySavedSetup(setupId) {
  const setup = savedSetupForCurrentMethod(setupId);
  if (!setup) return;
  const rows = [...els.tripGearRows.querySelectorAll(".gear-used-row")];
  if (rows.length && !window.confirm(`Replace the current setup with ${setup.name}?`)) return;
  rows.forEach((row) => row.remove());
  replaceTripRows("gearUsed", []);
  setup.rows.forEach((row) => addTripGearRow({
    comboId: row.comboId,
    lureId: "",
    flasherId: "",
    cheaterLureId: "",
    hasCheater: false,
    hasLeadcore: false,
    distanceBehind: ""
  }));
  populateSetupLineSelects();
  populateCatchRodSelects();
  updateAllRowSummaries();
  renderLiveTrollingSpread();
  els.savedSetupPickerDialog?.close();
  ui.tripFormUserChanged = true;
  syncTripFormChrome();
}

export function applyStartupSavedSetup() {
  const method = getValue("method").trim();
  const methodKey = method.toLowerCase();
  if (ui.activeTripId || !method || methodKey === "trolling" || ui.newTripSavedSetupAppliedMethods.has(methodKey)) return false;
  ui.newTripSavedSetupAppliedMethods.add(methodKey);
  const rows = [...els.tripGearRows.querySelectorAll(".gear-used-row")];
  if (rows.length) return false;
  const setupId = savedSetupDefaultId(method);
  const setup = savedSetupForCurrentMethod(setupId);
  if (!setup) return false;
  setup.rows.forEach((row) => addTripGearRow({
    comboId: row.comboId,
    lureId: "",
    flasherId: "",
    cheaterLureId: "",
    hasCheater: false,
    hasLeadcore: false,
    distanceBehind: ""
  }));
  return true;
}

function setupCreateSavedSetupDialog() {
  const dialog = document.querySelector("#newSavedSetupDialog");
  if (!dialog) return;
  const form = dialog.querySelector("form");
  const rows = form.querySelector(".saved-setup-list");
  const message = form.querySelector(".form-message");
  const addRod = form.querySelector(".add-saved-setup-row");
  const save = form.querySelector('button[type="submit"]');
  let saving = false;

  function showMessage(text = "") {
    message.textContent = text;
    message.classList.toggle("hidden", !text);
  }

  function renderRows() {
    setHtml(rows, joinHtml(settingsUi.newSavedSetupDraft.rows.map((row, index) => savedSetupRowMarkup(row, {
      sourceIndex: index, setupIndex: null
    }))));
  }

  document.querySelector("#createSavedSetupButton")?.addEventListener("click", () => {
    const method = getValue("method");
    if (!method || isTrollingTrip()) return;
    const hasCombos = state.rodReelCombos.length > 0;
    settingsUi.newSavedSetupDraft = { id: createId(), method, name: "", rows: hasCombos ? [{ comboId: "" }] : [] };
    form.reset();
    form.querySelector("#newSavedSetupMethod").textContent = method;
    showMessage(hasCombos ? "" : "Create a rod / reel combo in Gear before saving a setup.");
    addRod.disabled = save.disabled = !hasCombos;
    renderRows();
    dialog.showModal();
  });

  form.addEventListener("input", handleSettingsDraftControlEvent);
  form.addEventListener("change", handleSettingsDraftControlEvent);
  form.addEventListener("click", (event) => {
    const draft = settingsUi.newSavedSetupDraft;
    if (event.target.closest(".add-saved-setup-row")) {
      draft.rows.push({ comboId: "" });
      renderRows();
      rows.querySelector(".saved-setup-row:last-child select")?.focus();
    }
    const remove = event.target.closest(".remove-saved-setup-row");
    if (remove) {
      const row = remove.closest(".saved-setup-row");
      draft.rows.splice(Number(row.dataset.sourceIndex), 1);
      renderRows();
      addRod.focus();
    }
  });
  dialog.addEventListener("cancel", (event) => {
    if (saving) event.preventDefault();
  });
  dialog.addEventListener("close", () => {
    if (!dialog.open) settingsUi.newSavedSetupDraft = null;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving || save.disabled) return;
    const next = savedSetupFromDraft(settingsUi.newSavedSetupDraft);
    const controls = [...form.querySelectorAll("input, select, button")];
    saving = true;
    showMessage();
    controls.forEach((control) => { control.disabled = true; });
    try {
      await persistSavedSetup(next);
      dialog.close();
      renderSavedSetupPicker();
      els.savedSetupPickerList?.querySelector(`[data-pick-saved-setup="${CSS.escape(next.id)}"]`)?.focus();
    } catch (error) {
      showMessage(error.message || "The setup could not be saved.");
    } finally {
      saving = false;
      controls.forEach((control) => { control.disabled = false; });
      if (dialog.open) save.focus();
    }
  });
}

export function setup() {
  setupCreateSavedSetupDialog();
  els.savedSetupMethodSections?.addEventListener("click", (event) => {
    const methodToggle = event.target.closest("[data-saved-setup-method-toggle]");
    if (methodToggle) {
      toggleSavedSetupMethodSection(methodToggle);
      return;
    }
    const card = event.target.closest(".saved-setup-card");
    if (event.target.closest(".edit-saved-setup")) {
      editSavedSetup(card?.dataset.savedSetupId);
      return;
    }
    if (event.target.closest(".finish-saved-setup-edit")) {
      finishSavedSetupEdit(card).catch(() => {});
      return;
    }
    if (event.target.closest(".add-saved-setup-row")) {
      addSavedSetupRowToCard(card);
      return;
    }
    if (event.target.closest(".remove-saved-setup-row")) {
      const row = event.target.closest(".saved-setup-row");
      settingsUi.savedSetupsDraft?.[Number(card?.dataset.savedSetupIndex)]?.rows?.splice(Number(row?.dataset.sourceIndex), 1);
      row?.remove();
      scheduleSavedSetupAutosave(card);
      return;
    }
    if (event.target.closest(".cancel-saved-setup")) {
      savedSetupDraft = null;
      activeSavedSetupEditorId = "";
      setSavedSetupSettingsMessage("");
      renderSavedSetupSettings();
      return;
    }
    if (event.target.closest(".delete-saved-setup")) {
      deleteSavedSetup(card?.dataset.savedSetupId).catch(() => {});
      return;
    }
    if (event.target.closest(".add-saved-setup")) {
      addSavedSetup(event.target.closest("[data-saved-setup-new-method]")?.dataset.savedSetupNewMethod);
      return;
    }
    if (card) toggleSavedSetupCard(card, event);
  });

  els.savedSetupMethodSections?.addEventListener("change", (event) => {
    if (event.target.matches(".saved-setup-combo")) scheduleSavedSetupAutosave(event.target.closest(".saved-setup-card"));
    if (event.target.matches(".saved-setup-default")) {
      saveDefaultSavedSetupId(event.target.dataset.savedSetupMethod).catch(() => {});
    }
  });

  els.savedSetupMethodSections?.addEventListener("input", (event) => {
    if (event.target.matches(".saved-setup-name")) {
      setSavedSetupSettingsMessage("");
      scheduleSavedSetupAutosave(event.target.closest(".saved-setup-card"));
    }
  });

  els.savedSetupPickerList?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-pick-saved-setup]");
    if (option) applySavedSetup(option.dataset.pickSavedSetup);
  });
}
