function parseWaveHeightFeet(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? convertUnitValue(value, unitPreference("waveHeight"), "ft") : null;
  const text = String(value).trim().toLowerCase();
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  if (!Number.isFinite(number) || number < 0) return null;
  const explicitUnit = explicitMeasurementUnit(text.match(/[a-zA-Z°]+/)?.[0]);
  const sourceUnit = explicitUnit || unitPreference("waveHeight");
  return convertUnitValue(number, sourceUnit, "ft") ?? null;
}

function chopLabelForWaveHeight(value) {
  const feet = parseWaveHeightFeet(value);
  if (feet === null) return "";
  const ranges = normalizeChopRanges(state.settings?.chopRanges);
  const bounded = ranges.find((range) => range.maxFeet !== null && feet <= Number(range.maxFeet));
  return (bounded || ranges.find((range) => range.maxFeet === null) || ranges.at(-1))?.label || "";
}

let settingsAutosaveTimer = null;
let settingsStatusTimer = null;
let privateLocationNameEditId = "";
let activeSettingsTab = "general";
let chopRangesEditing = false;
let chopRangesEditSnapshot = null;
let activeDefaultTrollingSpreadTargetSpecies = "";
let databaseExportInProgress = false;
let databaseImportInProgress = false;

function setSettingsSaveStatus(text = "Autosave on", status = "") {
  if (!els.settingsSaveStatus) return;
  els.settingsSaveStatus.textContent = text;
  els.settingsSaveStatus.classList.toggle("is-saving", status === "saving");
  els.settingsSaveStatus.classList.toggle("is-error", status === "error");
}

function markSettingsSaved() {
  setSettingsSaveStatus("Saved");
  clearTimeout(settingsStatusTimer);
  settingsStatusTimer = setTimeout(() => setSettingsSaveStatus("Autosave on"), 1800);
}

async function runSettingsSave(work, errorMessage, options = {}) {
  const isAutosave = options.autosave === true;
  setSettingsSaveStatus(isAutosave ? "Autosaving..." : "Saving...", "saving");
  try {
    await work();
    markSettingsSaved();
  } catch (error) {
    console.error(errorMessage, error);
    setSettingsSaveStatus("Save failed", "error");
    if (!isAutosave) alert(error.message || errorMessage);
    throw error;
  }
}

function scheduleSettingsAutosave(saveAction, delay = 650) {
  clearTimeout(settingsAutosaveTimer);
  setSettingsSaveStatus("Autosaving...", "saving");
  settingsAutosaveTimer = setTimeout(() => {
    saveAction({ autosave: true }).catch(() => {});
  }, delay);
}

function setDatabaseBackupStatus(message = "") {
  if (els.databaseBackupStatus) els.databaseBackupStatus.textContent = message;
}

async function exportDatabaseArchive() {
  const button = els.exportDatabaseButton;
  if (!button || databaseExportInProgress) return;
  databaseExportInProgress = true;
  button.disabled = false;
  button.removeAttribute("aria-disabled");
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");
  setDatabaseBackupStatus("Preparing backup...");
  try {
    const link = document.createElement("a");
    link.href = "/api/archive";
    link.download = "fishing-logbook-archive.zip";
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    setDatabaseBackupStatus("Backup download started. It includes uploaded photos.");
  } catch (error) {
    console.error("Database export failed", error);
    setDatabaseBackupStatus(error.message || "Database export failed.");
    alert(error.message || "Database export failed.");
  } finally {
    databaseExportInProgress = false;
    button.classList.remove("is-loading");
    button.setAttribute("aria-busy", "false");
    button.removeAttribute("aria-disabled");
  }
}

async function importDatabaseArchive(event) {
  const input = event.target;
  const archive = input.files?.[0];
  input.value = "";
  if (!archive) return;
  if (!confirm("Importing a backup replaces the current logbook data. Uploaded photos in the backup will be restored. Continue?")) return;

  const button = els.importDatabaseButton;
  if (databaseImportInProgress) return;
  databaseImportInProgress = true;
  if (button) button.disabled = true;
  if (button) {
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
  }
  setDatabaseBackupStatus("Importing backup...");
  try {
    const formData = new FormData();
    formData.append("archive", archive);
    const response = await protectedFetch("/api/archive", { method: "POST", body: formData });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not import the database.");
    const refreshed = await fetch("/api/logbook");
    if (!refreshed.ok) throw new Error("The backup was imported, but the logbook could not be refreshed.");
    state = normalizeState(await refreshed.json());
    localStorage.setItem(storageKey, JSON.stringify(state));
    renderAll();
    setDatabaseBackupStatus("Backup imported, including uploaded photos.");
  } catch (error) {
    console.error("Database import failed", error);
    setDatabaseBackupStatus(error.message || "Database import failed.");
    alert(error.message || "Database import failed.");
  } finally {
    databaseImportInProgress = false;
    if (button) {
      button.disabled = false;
      button.classList.remove("is-loading");
      button.setAttribute("aria-busy", "false");
    }
  }
}
