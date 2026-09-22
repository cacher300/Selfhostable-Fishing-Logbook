let sharedTripImportFile = null;
let sharedTripImportPreviewData = null;

function sharedTripImportStatus(message = "", type = "") {
  if (!els.sharedTripImportStatus) return;
  els.sharedTripImportStatus.textContent = message;
  els.sharedTripImportStatus.dataset.type = type;
}

function sharedTripImportText(value, fallback = "Not logged") {
  const text = String(value || "").trim();
  return text || fallback;
}

function sharedTripImportSummaryHtml(trip) {
  const date = trip.date ? formatDate(trip.date) : "Date not logged";
  const place = [trip.location, trip.launch].filter(Boolean).join(" · ") || "Location not logged";
  const startTime = formatDisplayTime(trip.linesSetTime || trip.startTime || trip.launchTime || "") || "Not logged";
  const endTime = formatDisplayTime(trip.linesPulledTime || trip.endTime || "") || "Not logged";
  const people = Array.isArray(trip.people) && trip.people.length ? trip.people.join(", ") : "No people logged";
  return `
    <div><dt>Trip</dt><dd>${escapeHtml(sharedTripImportText(trip.title, "Untitled trip"))}</dd></div>
    <div><dt>Date</dt><dd>${escapeHtml(date)}</dd></div>
    <div><dt>Location</dt><dd>${escapeHtml(place)}</dd></div>
    <div><dt>Method</dt><dd>${escapeHtml(sharedTripImportText(trip.method))}</dd></div>
    <div><dt>Start time</dt><dd>${escapeHtml(startTime)}</dd></div>
    <div><dt>End time</dt><dd>${escapeHtml(endTime)}</dd></div>
    <div><dt>Log</dt><dd>${escapeHtml(`${Number(trip.caught || 0)} landed · ${Number(trip.lost || 0)} lost`)}</dd></div>
    <div><dt>People</dt><dd>${escapeHtml(people)}</dd></div>
  `;
}

function sharedTripImportPeopleHtml(people) {
  if (!people.length) return '<div class="shared-trip-no-candidate">This trip has no named people to match.</div>';
  const existingPeople = [...(state.people || [])].sort((first, second) => String(first.name || "").localeCompare(String(second.name || "")));
  return people.map((person) => {
    const suggested = existingPeople.find((item) => item.id === person.suggestedPersonId);
    const choices = existingPeople.map((item) => (
      `<option value="${escapeHtml(item.id)}" ${item.id === person.suggestedPersonId ? "selected" : ""}>Use ${escapeHtml(item.name)}</option>`
    )).join("");
    const message = suggested
      ? `Suggested: ${suggested.name}`
      : "No automatic match — choose a person or create a new one.";
    return `
      <label class="shared-trip-person-map">
        <span><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(message)}</small></span>
        <select data-shared-trip-person-id="${escapeHtml(person.sourceId)}" aria-label="Match ${escapeHtml(person.name)}">
          <option value="" ${suggested ? "" : "selected"}>Create “${escapeHtml(person.name)}” as a new person</option>
          ${choices}
        </select>
      </label>
    `;
  }).join("");
}

function sharedTripCandidateLabel(candidate) {
  const place = [candidate.location, candidate.launch].filter(Boolean).join(" · ") || "No location";
  const startTime = formatDisplayTime(candidate.linesSetTime || candidate.startTime || candidate.launchTime || "");
  const endTime = formatDisplayTime(candidate.linesPulledTime || candidate.endTime || "");
  const time = [startTime, endTime].filter(Boolean).join(" – ") || "No times logged";
  return `${candidate.title || "Untitled trip"} — ${place} · ${time}`;
}

function sharedTripImportDuplicateHtml(candidates) {
  if (!candidates.length) {
    return '<div class="shared-trip-no-candidate">No likely overlap was found. This trip will be added to your logbook.</div>';
  }
  const first = candidates[0];
  return `
    <div class="shared-trip-candidate">
      <strong>${escapeHtml(first.title || "Untitled trip")}</strong>
      <small>${escapeHtml(`${first.date || "No date"} · ${[first.location, first.launch].filter(Boolean).join(" · ") || "No location"} · ${first.caught || 0} landed`)}</small>
      <select class="shared-trip-candidate-select" id="sharedTripImportCandidateSelect" aria-label="Overlapping local trip">
        ${candidates.map((candidate) => `<option value="${escapeHtml(candidate.id)}">${escapeHtml(sharedTripCandidateLabel(candidate))}</option>`).join("")}
      </select>
    </div>
    <div class="shared-trip-import-choices" role="radiogroup" aria-label="How to handle the overlapping trip">
      <label class="shared-trip-import-choice"><input type="radio" name="sharedTripImportAction" value="add" checked /><span><strong>Keep both trips</strong><small>Add the shared trip alongside the local trip.</small></span></label>
      <label class="shared-trip-import-choice"><input type="radio" name="sharedTripImportAction" value="replace" /><span><strong>Keep the imported trip</strong><small>Delete the selected local trip after the imported trip is saved.</small></span></label>
      <label class="shared-trip-import-choice"><input type="radio" name="sharedTripImportAction" value="keep-local" /><span><strong>Keep my local trip</strong><small>Do not import this ZIP.</small></span></label>
    </div>
  `;
}

function renderSharedTripImportPreview(preview) {
  sharedTripImportPreviewData = preview;
  document.querySelector("#sharedTripImportSummary").innerHTML = sharedTripImportSummaryHtml(preview.trip || {});
  els.sharedTripImportPeople.innerHTML = sharedTripImportPeopleHtml(preview.people || []);
  els.sharedTripImportDuplicate.innerHTML = sharedTripImportDuplicateHtml(preview.candidates || []);
  els.sharedTripImportPreview.hidden = false;
  els.sharedTripImportConfirmButton.disabled = false;
}

function resetSharedTripImportDialog() {
  sharedTripImportFile = null;
  sharedTripImportPreviewData = null;
  if (els.sharedTripImportInput) els.sharedTripImportInput.value = "";
  if (els.sharedTripImportPreview) els.sharedTripImportPreview.hidden = true;
  if (els.sharedTripImportPeople) els.sharedTripImportPeople.innerHTML = "";
  if (els.sharedTripImportDuplicate) els.sharedTripImportDuplicate.innerHTML = "";
  if (els.sharedTripImportConfirmButton) els.sharedTripImportConfirmButton.disabled = true;
  sharedTripImportStatus("");
}

function openSharedTripImportDialog() {
  if (!els.sharedTripImportDialog) return;
  resetSharedTripImportDialog();
  els.sharedTripImportDialog.showModal();
  els.sharedTripImportInput?.click();
}

async function previewSharedTripImport(file) {
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

function sharedTripImportAction() {
  if (!(sharedTripImportPreviewData?.candidates || []).length) return "add";
  return document.querySelector('input[name="sharedTripImportAction"]:checked')?.value || "add";
}

function sharedTripPersonMappings() {
  return Object.fromEntries(
    [...els.sharedTripImportPeople.querySelectorAll("[data-shared-trip-person-id]")]
      .map((select) => [select.dataset.sharedTripPersonId, select.value])
      .filter(([, personId]) => Boolean(personId))
  );
}

async function confirmSharedTripImport() {
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
    logbookRevision = refreshed.headers.get("ETag") || response.headers.get("ETag") || "";
    state = normalizeState(await refreshed.json());
    localStorage.setItem(storageKey, JSON.stringify(state));
    renderAll();
    await cleanupDeletedMedia(payload.discardedMedia || []);
    const importedTrip = state.trips.find((trip) => trip.id === payload.tripId);
    els.sharedTripImportDialog.close();
    setView("trips");
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

els.importSharedTripButton?.addEventListener("click", openSharedTripImportDialog);
els.sharedTripImportChooseButton?.addEventListener("click", () => els.sharedTripImportInput?.click());
els.sharedTripImportInput?.addEventListener("change", (event) => previewSharedTripImport(event.target.files?.[0]));
els.sharedTripImportConfirmButton?.addEventListener("click", confirmSharedTripImport);
els.sharedTripImportDialog?.addEventListener("close", resetSharedTripImportDialog);
