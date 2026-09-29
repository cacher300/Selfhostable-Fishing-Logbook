import { html, joinHtml, setHtml } from "./html.js";
import { replaceState } from "./store.js";
import { protectedFetch } from "./app-config.js";
import { logbookRevision, state } from "./app-state.js";
import { formatDisplayTime } from "./app-units.js";
import { els } from "./app-elements.js";
import { cleanupDeletedMedia } from "./app-media.js";
import { formatDate, renderAll } from "./dashboard.js";
import { openTripSummary } from "./trip-timeline.js";

import { navigate } from "./router.js";

export let sharedTripImportFile = null;
export let sharedTripImportPreviewData = null;

export function sharedTripImportStatus(message = "", type = "") {
  if (!els.sharedTripImportStatus) return;
  els.sharedTripImportStatus.textContent = message;
  els.sharedTripImportStatus.dataset.type = type;
}

export function sharedTripImportText(value, fallback = "Not logged") {
  const text = String(value || "").trim();
  return text || fallback;
}

export function sharedTripImportSummaryHtml(trip) {
  const date = trip.date ? formatDate(trip.date) : "Date not logged";
  const place = [trip.location, trip.launch].filter(Boolean).join(" · ") || "Location not logged";
  const startTime = formatDisplayTime(trip.launchTime || "") || "Not logged";
  const endTime = formatDisplayTime(trip.linesPulledTime || "") || "Not logged";
  const people = Array.isArray(trip.people) && trip.people.length ? trip.people.join(", ") : "No people logged";
  return html`
    <div><dt>Trip</dt><dd>${sharedTripImportText(trip.title, "Untitled trip")}</dd></div>
    <div><dt>Date</dt><dd>${date}</dd></div>
    <div><dt>Location</dt><dd>${place}</dd></div>
    <div><dt>Method</dt><dd>${sharedTripImportText(trip.method)}</dd></div>
    <div><dt>Start time</dt><dd>${startTime}</dd></div>
    <div><dt>End time</dt><dd>${endTime}</dd></div>
    <div><dt>Log</dt><dd>${`${Number(trip.caught || 0)} landed · ${Number(trip.lost || 0)} lost`}</dd></div>
    <div><dt>People</dt><dd>${people}</dd></div>
  `;
}

export function sharedTripImportPeopleHtml(people) {
  if (!people.length) return '<div class="shared-trip-no-candidate">This trip has no named people to match.</div>';
  const existingPeople = [...(state.people || [])].sort((first, second) => String(first.name || "").localeCompare(String(second.name || "")));
  return joinHtml(people.map((person) => {
    const suggested = existingPeople.find((item) => item.id === person.suggestedPersonId);
    const choices = joinHtml(existingPeople.map((item) => (
      html`<option value="${item.id}" ${item.id === person.suggestedPersonId ? "selected" : ""}>Use ${item.name}</option>`
    )), "");
    const message = suggested
      ? `Suggested: ${suggested.name}`
      : "No automatic match — choose a person or create a new one.";
    return html`
      <label class="shared-trip-person-map">
        <span><strong>${person.name}</strong><small>${message}</small></span>
        <select data-shared-trip-person-id="${person.sourceId}" aria-label="Match ${person.name}">
          <option value="" ${suggested ? "" : "selected"}>Create “${person.name}” as a new person</option>
          ${choices}
        </select>
      </label>
    `;
  }), "");
}

export function sharedTripCandidateLabel(candidate) {
  const place = [candidate.location, candidate.launch].filter(Boolean).join(" · ") || "No location";
  const startTime = formatDisplayTime(candidate.launchTime || "");
  const endTime = formatDisplayTime(candidate.linesPulledTime || "");
  const time = [startTime, endTime].filter(Boolean).join(" – ") || "No times logged";
  return `${candidate.title || "Untitled trip"} — ${place} · ${time}`;
}

export function sharedTripImportDuplicateHtml(candidates) {
  if (!candidates.length) {
    return '<div class="shared-trip-no-candidate">No likely overlap was found. This trip will be added to your logbook.</div>';
  }
  const first = candidates[0];
  return html`
    <div class="shared-trip-candidate">
      <strong>${first.title || "Untitled trip"}</strong>
      <small>${`${first.date || "No date"} · ${[first.location, first.launch].filter(Boolean).join(" · ") || "No location"} · ${first.caught || 0} landed`}</small>
      <select class="shared-trip-candidate-select" id="sharedTripImportCandidateSelect" aria-label="Overlapping local trip">
        ${joinHtml(candidates.map((candidate) => html`<option value="${candidate.id}">${sharedTripCandidateLabel(candidate)}</option>`), "")}
      </select>
    </div>
    <div class="shared-trip-import-choices" role="radiogroup" aria-label="How to handle the overlapping trip">
      <label class="shared-trip-import-choice"><input type="radio" name="sharedTripImportAction" value="add" checked /><span><strong>Keep both trips</strong><small>Add the shared trip alongside the local trip.</small></span></label>
      <label class="shared-trip-import-choice"><input type="radio" name="sharedTripImportAction" value="replace" /><span><strong>Keep the imported trip</strong><small>Delete the selected local trip after the imported trip is saved.</small></span></label>
      <label class="shared-trip-import-choice"><input type="radio" name="sharedTripImportAction" value="keep-local" /><span><strong>Keep my local trip</strong><small>Do not import this ZIP.</small></span></label>
    </div>
  `;
}

export function renderSharedTripImportPreview(preview) {
  sharedTripImportPreviewData = preview;
  setHtml(document.querySelector("#sharedTripImportSummary"), sharedTripImportSummaryHtml(preview.trip || {}));
  setHtml(els.sharedTripImportPeople, sharedTripImportPeopleHtml(preview.people || []));
  setHtml(els.sharedTripImportDuplicate, sharedTripImportDuplicateHtml(preview.candidates || []));
  els.sharedTripImportPreview.hidden = false;
  els.sharedTripImportConfirmButton.disabled = false;
}

export function resetSharedTripImportDialog() {
  sharedTripImportFile = null;
  sharedTripImportPreviewData = null;
  if (els.sharedTripImportInput) els.sharedTripImportInput.value = "";
  if (els.sharedTripImportPreview) els.sharedTripImportPreview.hidden = true;
  if (els.sharedTripImportPeople) setHtml(els.sharedTripImportPeople, html``);
  if (els.sharedTripImportDuplicate) setHtml(els.sharedTripImportDuplicate, html``);
  if (els.sharedTripImportConfirmButton) els.sharedTripImportConfirmButton.disabled = true;
  sharedTripImportStatus("");
}

export function openSharedTripImportDialog() {
  if (!els.sharedTripImportDialog) return;
  resetSharedTripImportDialog();
  els.sharedTripImportDialog.showModal();
  els.sharedTripImportInput?.click();
}

export async function previewSharedTripImport(file) {
  if (!file) return;
  if (location.protocol === "file:") {
    sharedTripImportStatus("Shared Trip ZIP import needs the app server to be running.", "error");
    return;
  }
  sharedTripImportFile = file;
  els.sharedTripImportPreview.hidden = true;
  els.sharedTripImportConfirmButton.disabled = true;
  sharedTripImportStatus("Reading Shared Trip ZIP…");
  try {
    const formData = new FormData();
    formData.append("archive", file);
    const response = await protectedFetch("/api/shared-trip-archive/preview", { method: "POST", body: formData });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not read the Shared Trip ZIP.");
    renderSharedTripImportPreview(payload);
  } catch (error) {
    console.error("Shared trip preview failed", error);
    sharedTripImportFile = null;
    sharedTripImportPreviewData = null;
    sharedTripImportStatus(error.message || "Could not read the Shared Trip ZIP.", "error");
  }
}

export function sharedTripImportAction() {
  if (!(sharedTripImportPreviewData?.candidates || []).length) return "add";
  return document.querySelector('input[name="sharedTripImportAction"]:checked')?.value || "add";
}

export function sharedTripPersonMappings() {
  return Object.fromEntries(
    [...els.sharedTripImportPeople.querySelectorAll("[data-shared-trip-person-id]")]
      .map((select) => [select.dataset.sharedTripPersonId, select.value])
      .filter(([, personId]) => Boolean(personId))
  );
}

export async function confirmSharedTripImport() {
  if (!sharedTripImportFile || !sharedTripImportPreviewData) return;
  const action = sharedTripImportAction();
  const replacementTripId = document.querySelector("#sharedTripImportCandidateSelect")?.value || "";
  const button = els.sharedTripImportConfirmButton;
  const original = button.textContent;
  button.disabled = true;
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");
  sharedTripImportStatus(action === "keep-local" ? "Keeping your local trip…" : "Importing shared trip…");
  try {
    const formData = new FormData();
    formData.append("archive", sharedTripImportFile);
    formData.append("personMappings", JSON.stringify(sharedTripPersonMappings()));
    formData.append("duplicateAction", action);
    formData.append("replacementTripId", replacementTripId);
    const headers = logbookRevision ? { "If-Match": logbookRevision } : {};
    const response = await protectedFetch("/api/shared-trip-archive/import", { method: "POST", headers, body: formData });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not import the shared trip.");
    if (payload.cancelled) {
      sharedTripImportStatus("Kept your local trip. Nothing was imported.", "success");
      return;
    }

    const refreshed = await fetch("/api/logbook");
    if (!refreshed.ok) throw new Error("The trip was imported, but the logbook could not be refreshed.");
    replaceState(await refreshed.json(), { revision: refreshed.headers.get("ETag") || "" });
    renderAll();
    await cleanupDeletedMedia(payload.discardedMedia || []);
    const importedTrip = state.trips.find((trip) => trip.id === payload.tripId);
    els.sharedTripImportDialog.close();
    navigate("trips");
    if (importedTrip) openTripSummary(importedTrip);
  } catch (error) {
    console.error("Shared trip import failed", error);
    sharedTripImportStatus(error.message || "Could not import the shared trip.", "error");
  } finally {
    button.disabled = !sharedTripImportPreviewData;
    button.classList.remove("is-loading");
    button.setAttribute("aria-busy", "false");
    button.textContent = original;
  }
}

export function setup() {
  els.importSharedTripButton?.addEventListener("click", openSharedTripImportDialog);

  els.sharedTripImportChooseButton?.addEventListener("click", () => els.sharedTripImportInput?.click());

  els.sharedTripImportInput?.addEventListener("change", (event) => previewSharedTripImport(event.target.files?.[0]));

  els.sharedTripImportConfirmButton?.addEventListener("click", confirmSharedTripImport);

  els.sharedTripImportDialog?.addEventListener("close", resetSharedTripImportDialog);
}
