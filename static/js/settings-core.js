import { replaceState } from "./store.js";
import { protectedFetch } from "./app-config.js";
import { convertUnitValue, currentChopRanges, explicitMeasurementUnit, unitPreference } from "./app-units.js";
import { els } from "./app-elements.js";
import { renderAll } from "./dashboard.js";

export const settingsUi = {};

export function parseWaveHeightFeet(value) {
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

export function chopLabelForWaveHeight(value) {
  const feet = parseWaveHeightFeet(value);
  if (feet === null) return "";
  const ranges = currentChopRanges();
  const bounded = ranges.find((range) => range.maxFeet !== null && feet <= Number(range.maxFeet));
  return (bounded || ranges.find((range) => range.maxFeet === null) || ranges.at(-1))?.label || "";
}

export let settingsAutosaveTimer = null;
export let settingsStatusTimer = null;
settingsUi.privateLocationNameEditId = "";
settingsUi.activeSettingsTab = "general";
settingsUi.chopRangesEditing = false;
settingsUi.chopRangesEditSnapshot = null;
settingsUi.activeTrollingSpreadEditorId = "";
settingsUi.trollingSpreadDraft = null;
export let databaseExportInProgress = false;
export let databaseImportInProgress = false;

export function setSettingsSaveStatus(text = "Autosave on", status = "") {
  if (!els.settingsSaveStatus) return;
  els.settingsSaveStatus.textContent = text;
  els.settingsSaveStatus.classList.toggle("is-saving", status === "saving");
  els.settingsSaveStatus.classList.toggle("is-error", status === "error");
}

export function markSettingsSaved() {
  setSettingsSaveStatus("Saved");
  clearTimeout(settingsStatusTimer);
  settingsStatusTimer = setTimeout(() => setSettingsSaveStatus("Autosave on"), 1800);
}

export async function runSettingsSave(work, errorMessage, options = {}) {
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

export function scheduleSettingsAutosave(saveAction, delay = 650) {
  clearTimeout(settingsAutosaveTimer);
  setSettingsSaveStatus("Autosaving...", "saving");
  settingsAutosaveTimer = setTimeout(() => {
    saveAction({ autosave: true }).catch(() => {});
  }, delay);
}

export function setDatabaseBackupStatus(message = "") {
  if (els.databaseBackupStatus) els.databaseBackupStatus.textContent = message;
}

export async function exportArchive() {
  const button = els.exportDatabaseButton;
  if (!button || databaseExportInProgress) return;
  databaseExportInProgress = true;
  button.disabled = true;
  button.setAttribute("aria-disabled", "true");
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");
  setDatabaseBackupStatus("Preparing logbook and media archive...");
  try {
    if (location.protocol === "file:") throw new Error("Archive export requires the app server to be running.");
    const response = await protectedFetch("/api/archive");
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Could not prepare the archive.");
    }
    const archive = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(archive);
    link.download = "fishing-logbook-archive.zip";
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setDatabaseBackupStatus("Archive download started.");
  } catch (error) {
    console.error("Database export failed", error);
    setDatabaseBackupStatus(error.message || "Database export failed.");
    alert(error.message || "Database export failed.");
  } finally {
    databaseExportInProgress = false;
    button.disabled = false;
    button.classList.remove("is-loading");
    button.setAttribute("aria-busy", "false");
    button.removeAttribute("aria-disabled");
  }
}

export async function importArchive(event) {
  const input = event.target;
  const archive = input.files?.[0];
  input.value = "";
  if (!archive) return;
  if (!confirm("Importing an archive replaces the current logbook data and uploaded media. Continue?")) return;

  const button = els.importDatabaseButton;
  if (databaseImportInProgress) return;
  databaseImportInProgress = true;
  if (button) button.disabled = true;
  if (button) {
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
  }
  setDatabaseBackupStatus("Importing database and media archive...");
  try {
    if (location.protocol === "file:") throw new Error("Archive import requires the app server to be running.");
    const formData = new FormData();
    formData.append("archive", archive);
    const response = await protectedFetch("/api/archive", { method: "POST", body: formData });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not import the database.");
    const refreshed = await fetch("/api/logbook");
    if (!refreshed.ok) throw new Error("The backup was imported, but the logbook could not be refreshed.");
    replaceState(await refreshed.json(), { revision: refreshed.headers.get("ETag") || "" });
    renderAll();
    setDatabaseBackupStatus("Database and media archive imported.");
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
