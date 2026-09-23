let activeSavedSetupEditorId = "";
let savedSetupDraft = null;

function savedSetupMethods() {
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

function savedSetupsForMethod(method, setups = state.settings?.savedSetups) {
  const methodKey = String(method || "").trim().toLowerCase();
  return currentSavedSetups(setups).filter((setup) => setup.method.toLowerCase() === methodKey);
}

function savedSetupDefaultId(method, defaults = state.settings?.defaultSavedSetupIds) {
  const methodKey = String(method || "").trim().toLowerCase();
  const entry = Object.entries(defaults && typeof defaults === "object" ? defaults : {})
    .find(([key]) => String(key || "").trim().toLowerCase() === methodKey);
  return String(entry?.[1] || "");
}

function savedSetupRowMarkup(item = {}, { disabled = false, sourceIndex = "" } = {}) {
  const comboId = String(item.comboId || "");
  const comboOptions = state.rodReelCombos.map((combo) => (
    `<option value="${escapeHtml(combo.id)}" ${combo.id === comboId ? "selected" : ""}>${escapeHtml(comboName(combo.id) || "Rod / reel combo")}</option>`
  )).join("");
  return `
    <div class="saved-setup-row"${sourceIndex === "" ? "" : ` data-source-index="${sourceIndex}"`}>
      <label>
        <span>Rod / reel combo</span>
        <select class="saved-setup-combo"${disabled ? " disabled" : ""}>
          <option value="">Select rod / reel combo</option>
          ${comboOptions}
        </select>
      </label>
      ${disabled ? "" : '<button class="button danger remove-saved-setup-row" type="button">Remove</button>'}
    </div>
  `;
}

function renderSavedSetupCard(item, { draft = false } = {}) {
  const editing = draft || activeSavedSetupEditorId === item.id;
  const rows = Array.isArray(item.rows) ? item.rows : [];
  return `
    <article class="saved-setup-card${draft ? " is-draft" : ""}"
      data-saved-setup-id="${escapeHtml(item.id)}"
      data-saved-setup-method="${escapeHtml(item.method)}"
      data-saved-setup-draft="${draft ? "true" : "false"}"
      data-saved-setup-editing="${editing ? "true" : "false"}"
      data-saved-setup-toggle>
      <div class="saved-setup-card-header">
        <label class="settings-control saved-setup-name-control">
          <span>Setup name</span>
          <input class="saved-setup-name" type="text" maxlength="60" value="${escapeHtml(item.name || "")}" placeholder="Light Jigging"${editing ? "" : " readonly"} />
        </label>
        <div class="saved-setup-card-actions">
          ${editing && !draft ? '<button class="button secondary finish-saved-setup-edit" type="button">Done</button>' : !editing ? '<button class="button secondary edit-saved-setup" type="button">Edit</button>' : ""}
          ${draft ? '<button class="button secondary cancel-saved-setup" type="button">Cancel</button>' : '<button class="button danger delete-saved-setup" type="button">Delete</button>'}
        </div>
      </div>
      <div class="saved-setup-card-body"${editing ? "" : " hidden"}>
        <div class="saved-setup-card-section-heading">
          <div>
            <strong>Rod positions</strong>
            <span>Saved setups use rod / reel combos only.</span>
          </div>
          ${editing ? '<button class="button secondary add-saved-setup-row" type="button">Add Rod</button>' : ""}
        </div>
        <div class="saved-setup-list">
          ${rows.map((row, index) => savedSetupRowMarkup(row, { disabled: !editing, sourceIndex: index })).join("") || '<p class="saved-setup-empty-rows">Add at least one rod to save this setup.</p>'}
        </div>
      </div>
    </article>
  `;
}

function renderSavedSetupMethodSection(method, setups) {
  const methodSetups = setups.filter((setup) => setup.method.toLowerCase() === method.toLowerCase());
  const selectableSetups = methodSetups.filter((setup) => setup.id !== savedSetupDraft?.id);
  const defaultId = savedSetupDefaultId(method);
  const methodOptions = selectableSetups.map((setup) => (
    `<option value="${escapeHtml(setup.id)}" ${setup.id === defaultId ? "selected" : ""}>${escapeHtml(setup.name)}</option>`
  )).join("");
  return `
    <section class="saved-setup-method-section" data-saved-setup-method-section="${escapeHtml(method)}">
      <div class="saved-setup-method-header">
        <div>
          <h4>${escapeHtml(method)}</h4>
          <p>Reusable rod setups for ${escapeHtml(method)} trips.</p>
        </div>
        <div class="saved-setup-method-controls">
          <label class="settings-control">
            <span>${escapeHtml(method)} default</span>
            <select class="saved-setup-default" data-saved-setup-method="${escapeHtml(method)}">
              <option value="">No ${escapeHtml(method)} default</option>
              ${methodOptions}
            </select>
          </label>
          <button class="button secondary add-saved-setup" type="button" data-saved-setup-new-method="${escapeHtml(method)}">New Setup</button>
        </div>
      </div>
      <div class="saved-setup-list" data-saved-setup-list="${escapeHtml(method)}">
        ${methodSetups.length
          ? methodSetups.map((setup) => renderSavedSetupCard(setup, { draft: setup === savedSetupDraft })).join("")
          : '<p class="saved-setup-empty-state">No saved setups for this method yet.</p>'}
      </div>
    </section>
  `;
}

function renderSavedSetupSettings() {
  if (!els.savedSetupMethodSections) return;
  const setups = currentSavedSetups();
  const visibleSetups = savedSetupDraft ? [...setups, savedSetupDraft] : setups;
  const methods = savedSetupMethods();
  els.savedSetupMethodSections.innerHTML = methods.length
    ? methods.map((method) => renderSavedSetupMethodSection(method, visibleSetups)).join("")
    : '<p class="saved-setup-empty-state">Add a non-trolling method in Settings → Categories to create saved setups.</p>';
}

function addSavedSetup(method) {
  if (savedSetupDraft) {
    document.querySelector(`[data-saved-setup-id="${CSS.escape(savedSetupDraft.id)}"] .saved-setup-name`)?.focus();
    return;
  }
  savedSetupDraft = { id: createId(), name: "", method: String(method || "").trim(), rows: [] };
  activeSavedSetupEditorId = savedSetupDraft.id;
  renderSavedSetupSettings();
  document.querySelector(`[data-saved-setup-id="${CSS.escape(savedSetupDraft.id)}"] .saved-setup-name`)?.focus();
}

function addSavedSetupRowToCard(card) {
  const list = card?.querySelector(".saved-setup-list");
  if (!list || card.dataset.savedSetupEditing !== "true") return;
  card.querySelector(".saved-setup-empty-rows")?.remove();
  list.insertAdjacentHTML("beforeend", savedSetupRowMarkup());
  scheduleSavedSetupAutosave(card);
  list.querySelector(".saved-setup-row:last-child select")?.focus();
}

function editSavedSetup(setupId) {
  if (!currentSavedSetups().some((setup) => setup.id === setupId)) return;
  activeSavedSetupEditorId = setupId;
  renderSavedSetupSettings();
  document.querySelector(`[data-saved-setup-id="${CSS.escape(setupId)}"] .saved-setup-name`)?.focus();
}

function collectSavedSetupCard(card) {
  const id = card?.dataset.savedSetupId || createId();
  const existing = currentSavedSetups().find((setup) => setup.id === id);
  return {
    ...existing,
    id,
    method: card?.dataset.savedSetupMethod || "",
    name: card?.querySelector(".saved-setup-name")?.value.trim() || "",
    rows: [...card?.querySelectorAll(".saved-setup-row") || []].map((row) => ({
      ...(row.dataset.sourceIndex !== undefined ? existing?.rows?.[Number(row.dataset.sourceIndex)] : {}),
      comboId: row.querySelector(".saved-setup-combo")?.value || ""
    }))
  };
}

function setSavedSetupSettingsMessage(message = "") {
  if (!els.savedSetupSettingsMessage) return;
  els.savedSetupSettingsMessage.textContent = message;
  els.savedSetupSettingsMessage.classList.toggle("hidden", !message);
}

function toggleSavedSetupCard(card, event = null) {
  if (!card || card.dataset.savedSetupEditing === "true") return;
  if (event?.target?.closest("button, input, select, textarea, a")) return;
  const body = card.querySelector(".saved-setup-card-body");
  if (!body) return;
  body.hidden = !body.hidden;
  card.setAttribute("aria-expanded", String(!body.hidden));
}

async function finishSavedSetupEdit(card) {
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
  clearTimeout(settingsAutosaveTimer);
  await saveSavedSetupCard(card, { autosave: true });
  activeSavedSetupEditorId = "";
  setSavedSetupSettingsMessage("");
  renderSavedSetupSettings();
}

function scheduleSavedSetupAutosave(card) {
  if (!card || card.dataset.savedSetupEditing !== "true") return;
  scheduleSettingsAutosave(async (options = {}) => {
    const next = collectSavedSetupCard(card);
    if (!next.name || !next.rows.length) return;
    await saveSavedSetupCard(card, options);
  });
}

async function saveSavedSetupCard(card, options = {}) {
  const next = collectSavedSetupCard(card);
  const wasDraft = card?.dataset.savedSetupDraft === "true";
  if (!next.name) {
    if (!options.silentInvalid) setSavedSetupSettingsMessage("Enter a name for this setup before saving.");
    if (!options.silentInvalid) card?.querySelector(".saved-setup-name")?.focus();
    return;
  }
  if (!next.rows.length) {
    if (!options.silentInvalid) setSavedSetupSettingsMessage("Add at least one rod with a rod / reel combo before saving.");
    return;
  }
  if (next.rows.some((row) => !row.comboId)) {
    if (!options.silentInvalid) setSavedSetupSettingsMessage("Choose a combo or remove the empty rod row before saving.");
    return;
  }
  const setups = [...currentSavedSetups()];
  const duplicate = setups.some((setup) => (
    setup.id !== next.id
    && setup.method.toLowerCase() === next.method.toLowerCase()
    && setup.name.toLowerCase() === next.name.toLowerCase()
  ));
  if (duplicate) {
    if (!options.silentInvalid) setSavedSetupSettingsMessage("Setup names must be unique within each method.");
    if (!options.silentInvalid) card?.querySelector(".saved-setup-name")?.focus();
    return;
  }
  const previousState = structuredClone(state);
  const index = setups.findIndex((setup) => setup.id === next.id);
  if (index >= 0) setups[index] = next;
  else setups.push(next);
  state.settings = { ...(state.settings || {}), savedSetups: setups };
  savedSetupDraft = null;
  activeSavedSetupEditorId = next.id;
  setSavedSetupSettingsMessage("");
  try {
    await runSettingsSave(() => saveState(), "The saved setup could not be saved.", options);
    renderSavedSetupSettings();
  } catch (error) {
    state = previousState;
    savedSetupDraft = wasDraft ? next : null;
    activeSavedSetupEditorId = next.id;
    renderSavedSetupSettings();
  }
}

async function deleteSavedSetup(setupId) {
  const setup = currentSavedSetups().find((item) => item.id === setupId);
  if (!setup || !confirm(`Delete the ${setup.name} setup?`)) return;
  const previousState = structuredClone(state);
  const setups = currentSavedSetups().filter((item) => item.id !== setupId);
  const defaults = { ...(state.settings?.defaultSavedSetupIds || {}) };
  Object.entries(defaults).forEach(([method, id]) => {
    if (id === setupId) delete defaults[method];
  });
  if (activeSavedSetupEditorId === setupId) activeSavedSetupEditorId = "";
  state.settings = { ...(state.settings || {}), savedSetups: setups, defaultSavedSetupIds: defaults };
  try {
    await runSettingsSave(() => saveState(), "The saved setup could not be deleted.");
    renderSavedSetupSettings();
  } catch (error) {
    state = previousState;
    renderSavedSetupSettings();
  }
}

async function saveDefaultSavedSetupId(method, select, options = {}) {
  const nextId = select?.value || "";
  const setup = currentSavedSetups().find((item) => (
    item.id === nextId && item.method.toLowerCase() === String(method || "").trim().toLowerCase()
  ));
  if (nextId && !setup) return;
  const previousState = structuredClone(state);
  const defaults = { ...(state.settings?.defaultSavedSetupIds || {}) };
  Object.keys(defaults).forEach((key) => {
    if (key.toLowerCase() === String(method || "").trim().toLowerCase()) delete defaults[key];
  });
  if (setup) defaults[setup.method] = setup.id;
  state.settings = { ...(state.settings || {}), defaultSavedSetupIds: defaults };
  try {
    await runSettingsSave(() => saveState(), `The ${method} default setup could not be saved.`, options);
  } catch (error) {
    state = previousState;
    renderSavedSetupSettings();
  }
}

function savedSetupForCurrentMethod(setupId) {
  const method = getValue("method").trim();
  return currentSavedSetups().find((setup) => (
    setup.id === setupId && setup.method.toLowerCase() === method.toLowerCase()
  )) || null;
}

function renderSavedSetupPicker() {
  if (!els.savedSetupPickerList) return;
  const method = getValue("method").trim();
  const setups = savedSetupsForMethod(method);
  const renderOption = (setup) => {
    const rodSummary = setup.rows.map((row, index) => comboName(row.comboId) || `Rod ${index + 1}`).join(" · ");
    const summary = `${setup.rows.length} rod${setup.rows.length === 1 ? "" : "s"} · ${rodSummary}`;
    return `
        <button class="saved-setup-picker-option" type="button" data-pick-saved-setup="${escapeHtml(setup.id)}">
          <span class="saved-setup-picker-option-copy">
            <strong>${escapeHtml(setup.name)}</strong>
            <small>${escapeHtml(summary)}</small>
          </span>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        </button>
      `;
  };
  els.savedSetupPickerList.innerHTML = setups.length
    ? setups.map(renderOption).join("")
    : `<p class="saved-setup-picker-empty">No saved ${escapeHtml(method || "fishing")} setups yet. Create one in Settings → Saved Setups.</p>`;
}

function openSavedSetupPicker() {
  if (isTrollingTrip() || !els.savedSetupPickerDialog) return;
  renderSavedSetupPicker();
  els.savedSetupPickerDialog.showModal();
}

function applySavedSetup(setupId) {
  const setup = savedSetupForCurrentMethod(setupId);
  if (!setup) return;
  const rows = [...els.tripGearRows.querySelectorAll(".gear-used-row")];
  if (rows.length && !window.confirm(`Replace the current setup with ${setup.name}?`)) return;
  rows.forEach((row) => row.remove());
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
  tripFormUserChanged = true;
  syncTripFormChrome();
}

function applyStartupSavedSetup() {
  const method = getValue("method").trim();
  const methodKey = method.toLowerCase();
  if (activeTripId || !method || methodKey === "trolling" || newTripSavedSetupAppliedMethods.has(methodKey)) return false;
  newTripSavedSetupAppliedMethods.add(methodKey);
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

els.savedSetupMethodSections?.addEventListener("click", (event) => {
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
    event.target.closest(".saved-setup-row")?.remove();
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
    saveDefaultSavedSetupId(event.target.dataset.savedSetupMethod, event.target).catch(() => {});
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
