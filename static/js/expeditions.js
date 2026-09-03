let activeExpeditionId = "";
let activeCalendarInputId = "";
let activeCalendarMonth = null;
let returnToTripEditorAfterExpeditionSave = false;

function calendarIsoDateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) } : null;
}

function displayDateForCalendar(value) {
  const parts = calendarIsoDateParts(value);
  return parts ? `${String(parts.month + 1).padStart(2, "0")}/${String(parts.day).padStart(2, "0")}/${parts.year}` : "";
}

function isoDateFromDisplay(value) {
  const match = /^(\d{1,2})[\\/.-](\d{1,2})[\\/.-](\d{4})$/.exec(String(value || "").trim());
  if (!match) return "";
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
}

function syncCalendarDate(inputId) {
  const valueInput = document.querySelector(`#${inputId}`);
  const displayInput = document.querySelector(`[data-calendar-field="${inputId}"] .styled-date-display`);
  if (!valueInput || !displayInput) return "";
  const parsed = isoDateFromDisplay(displayInput.value);
  valueInput.value = parsed;
  displayInput.setCustomValidity(displayInput.value.trim() && !parsed ? "Enter a valid date as mm/dd/yyyy." : "");
  return parsed;
}

function renderCalendar(inputId) {
  const valueInput = document.querySelector(`#${inputId}`);
  const popover = document.querySelector(`[data-calendar-popover="${inputId}"]`);
  if (!valueInput || !popover) return;
  const selected = calendarIsoDateParts(valueInput.value);
  const monthDate = activeCalendarMonth || new Date(Date.UTC(selected?.year || new Date().getFullYear(), selected?.month ?? new Date().getMonth(), 1));
  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month, 1)));
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const dayOffset = index - firstDay + 1;
    const date = new Date(Date.UTC(year, month, dayOffset));
    const iso = date.toISOString().slice(0, 10);
    const outside = date.getUTCMonth() !== month;
    const isSelected = iso === valueInput.value;
    const isToday = iso === new Date().toISOString().slice(0, 10);
    cells.push(`<button type="button" class="calendar-day ${outside ? "is-outside" : ""} ${isSelected ? "is-selected" : ""} ${isToday ? "is-today" : ""}" data-calendar-date="${iso}">${date.getUTCDate()}</button>`);
  }
  popover.innerHTML = `
    <div class="calendar-header">
      <strong>${escapeHtml(monthLabel)}</strong>
      <div><button type="button" class="calendar-nav" data-calendar-step="-1" aria-label="Previous month">↑</button><button type="button" class="calendar-nav" data-calendar-step="1" aria-label="Next month">↓</button></div>
    </div>
    <div class="calendar-weekdays">${dayNames.map((day) => `<span>${day}</span>`).join("")}</div>
    <div class="calendar-grid">${cells.join("")}</div>
    <div class="calendar-footer"><button type="button" data-calendar-clear>Clear</button><button type="button" data-calendar-today>Today</button></div>`;
}

function closeCalendars() {
  document.querySelectorAll(".calendar-popover:not(.hidden)").forEach((popover) => popover.classList.add("hidden"));
  activeCalendarInputId = "";
  activeCalendarMonth = null;
}

function openCalendar(inputId) {
  closeCalendars();
  activeCalendarInputId = inputId;
  const value = document.querySelector(`#${inputId}`)?.value;
  const selected = calendarIsoDateParts(value);
  activeCalendarMonth = new Date(Date.UTC(selected?.year || new Date().getFullYear(), selected?.month ?? new Date().getMonth(), 1));
  const popover = document.querySelector(`[data-calendar-popover="${inputId}"]`);
  if (!popover) return;
  renderCalendar(inputId);
  popover.classList.remove("hidden");
}

function expeditionDateRange(expedition) {
  return `${formatDate(expedition.startDate)} – ${formatDate(expedition.endDate)}`;
}

function expeditionMemberTrips(expeditionId) {
  return state.trips.filter((trip) => trip.expeditionId === expeditionId);
}

function populateTripExpeditionSelect(selectedValue = els.tripExpedition?.value || "") {
  if (!els.tripExpedition) return;
  const expeditions = ExpeditionAnalytics.sortedExpeditions(state.expeditions, "start-desc");
  els.tripExpedition.innerHTML = `<option value="">No expedition</option>${expeditions.map((expedition) => (
    `<option value="${escapeHtml(expedition.id)}" ${expedition.id === selectedValue ? "selected" : ""}>${escapeHtml(expedition.name)}</option>`
  )).join("")}`;
}

function renderExpeditionList(expeditions) {
  els.expeditionListEmpty.classList.toggle("hidden", state.expeditions.length > 0);
  els.expeditionList.classList.toggle("hidden", state.expeditions.length === 0);
  if (!state.expeditions.length) {
    els.expeditionList.innerHTML = "";
    return;
  }
  if (!expeditions.length) {
    els.expeditionList.innerHTML = `
      <div class="expedition-filter-empty">
        <h3>No matches</h3>
        <p>Try a different expedition search.</p>
      </div>`;
    return;
  }
  els.expeditionList.innerHTML = expeditions.map((expedition) => {
    const summary = ExpeditionAnalytics.summarize(expedition, state.trips, tripHours);
    return `
      <button class="expedition-list-item ${expedition.id === activeExpeditionId ? "is-active" : ""}" type="button" data-select-expedition="${escapeHtml(expedition.id)}">
        <span>
          <strong>${escapeHtml(expedition.name)}</strong>
          <small>${escapeHtml(expeditionDateRange(expedition))}</small>
        </span>
        <span class="expedition-list-count"><strong>${summary.tripCount}</strong><small>${summary.tripCount === 1 ? "Trip" : "Trips"}</small></span>
      </button>`;
  }).join("");
}

function expeditionMetric(label, value, detail = "") {
  return `<div class="expedition-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}

function renderExpeditionTripTable(trips) {
  if (!trips.length) {
    return `
      <div class="expedition-member-empty">
        <div class="expedition-empty-icon" aria-hidden="true">i</div>
        <div>
          <h4>No trips in this expedition yet.</h4>
          <p>Trips can be assigned to an expedition from the trip editor.</p>
          <button class="button secondary compact-action" type="button" data-go-to-trips>Go to Trips</button>
        </div>
      </div>`;
  }
  return `
    <div class="expedition-trip-table-wrap">
      <table class="expedition-trip-table">
        <thead><tr><th>Date</th><th>Location</th><th>Title</th><th>Target</th><th>Method</th><th>Hours</th><th>Fish</th><th>Rate</th></tr></thead>
        <tbody>${trips.map((trip) => `
          <tr data-expedition-open-trip="${escapeHtml(trip.id)}" tabindex="0">
            <td data-label="Date">${escapeHtml(formatDate(trip.date))}</td>
            <td data-label="Location">${escapeHtml(trip.location || "—")}</td>
            <td data-label="Title"><strong>${escapeHtml(trip.title || "Untitled trip")}</strong></td>
            <td data-label="Target">${escapeHtml(trip.targetSpecies || "—")}</td>
            <td data-label="Method">${escapeHtml(trip.method || "—")}</td>
            <td data-label="Hours">${escapeHtml(trimNumber(tripHours(trip)))}</td>
            <td data-label="Fish">${escapeHtml(totalCaught(trip))}</td>
            <td data-label="Rate">${escapeHtml(trimNumber(catchRate(trip)))}</td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function renderExpeditionDetail(expedition) {
  if (!expedition) {
    els.expeditionDetail.innerHTML = `
      <div class="expedition-detail-empty">
        <h3>Select an expedition</h3>
        <p>Choose a fishing vacation to review its trips and totals.</p>
      </div>`;
    return;
  }
  const summary = ExpeditionAnalytics.summarize(expedition, state.trips, tripHours);
  els.expeditionDetail.innerHTML = `
    <header class="expedition-detail-header">
      <div>
        <h3>${escapeHtml(expedition.name)}</h3>
        <p class="expedition-detail-dates">${escapeHtml(expeditionDateRange(expedition))} (${summary.days} ${summary.days === 1 ? "day" : "days"})</p>
        ${expedition.destination ? `<p class="expedition-detail-destination">${escapeHtml(expedition.destination)}</p>` : ""}
        ${expedition.notes ? `<p class="expedition-detail-notes">${escapeHtml(expedition.notes)}</p>` : ""}
      </div>
      <button class="button secondary" type="button" data-edit-expedition="${escapeHtml(expedition.id)}">Edit</button>
    </header>
    <div class="expedition-metrics" aria-label="Expedition statistics">
      ${expeditionMetric("Trips", summary.tripCount)}
      ${expeditionMetric("Days", summary.days)}
      ${expeditionMetric("Hours Fished", trimNumber(summary.hours))}
      ${expeditionMetric("Fish Caught", summary.fish)}
      ${expeditionMetric("Catch Rate", trimNumber(summary.catchRate), "Fish / Hour")}
      ${expeditionMetric("Species", summary.species)}
    </div>
    <section class="expedition-member-section">
      <h4>Member Trips</h4>
      ${renderExpeditionTripTable(summary.trips)}
    </section>`;
}

function renderExpeditions() {
  if (!els.expeditionsPanel) return;
  const query = String(els.expeditionSearchInput?.value || "").trim().toLowerCase();
  const sort = els.expeditionSortSelect?.value || "start-desc";
  const sorted = ExpeditionAnalytics.sortedExpeditions(state.expeditions, sort);
  const filtered = sorted.filter((expedition) => [expedition.name, expedition.destination, expedition.notes]
    .some((value) => String(value || "").toLowerCase().includes(query)));
  if (!state.expeditions.some((expedition) => expedition.id === activeExpeditionId)) {
    activeExpeditionId = ExpeditionAnalytics.sortedExpeditions(state.expeditions, "start-desc")[0]?.id || "";
  }
  renderExpeditionList(filtered);
  renderExpeditionDetail(state.expeditions.find((expedition) => expedition.id === activeExpeditionId));
}

function showExpeditionFormMessage(message) {
  els.expeditionFormMessage.textContent = message;
  els.expeditionFormMessage.classList.toggle("hidden", !message);
}

function openExpeditionDialog(expedition = null, options = {}) {
  returnToTripEditorAfterExpeditionSave = Boolean(options.fromTripEditor && !expedition);
  els.expeditionForm.reset();
  showExpeditionFormMessage("");
  els.expeditionId.value = expedition?.id || "";
  els.expeditionName.value = expedition?.name || "";
  els.expeditionStartDateValue.value = expedition?.startDate || "";
  els.expeditionEndDateValue.value = expedition?.endDate || "";
  els.expeditionStartDate.value = displayDateForCalendar(els.expeditionStartDateValue.value);
  els.expeditionEndDate.value = displayDateForCalendar(els.expeditionEndDateValue.value);
  els.expeditionDestination.value = expedition?.destination || "";
  els.expeditionNotes.value = expedition?.notes || "";
  els.expeditionDialogTitle.textContent = expedition ? "Edit Expedition" : "New Expedition";
  els.deleteExpeditionButton.classList.toggle("hidden", !expedition);
  els.expeditionDialog.showModal();
  els.expeditionName.focus();
}

async function saveExpedition(event) {
  event.preventDefault();
  syncCalendarDate("expeditionStartDateValue");
  syncCalendarDate("expeditionEndDateValue");
  if (!els.expeditionForm.reportValidity()) return;
  const expedition = {
    id: els.expeditionId.value || createId(),
    name: els.expeditionName.value.trim(),
    startDate: els.expeditionStartDateValue.value,
    endDate: els.expeditionEndDateValue.value,
    destination: els.expeditionDestination.value.trim(),
    notes: els.expeditionNotes.value.trim()
  };
  if (expedition.endDate < expedition.startDate) {
    showExpeditionFormMessage("End date must be on or after the start date.");
    return;
  }
  const outsideTrips = expeditionMemberTrips(expedition.id).filter((trip) => ExpeditionAnalytics.tripOutsideRange(trip, expedition));
  if (outsideTrips.length && !confirm(`${outsideTrips.length} assigned ${outsideTrips.length === 1 ? "trip falls" : "trips fall"} outside this date range. Save anyway?`)) return;
  const previous = structuredClone(state.expeditions);
  const index = state.expeditions.findIndex((item) => item.id === expedition.id);
  if (index >= 0) state.expeditions[index] = expedition;
  else state.expeditions.push(expedition);
  try {
    await saveState();
    activeExpeditionId = expedition.id;
    if (returnToTripEditorAfterExpeditionSave && els.tripExpedition) {
      els.tripExpedition.value = expedition.id;
    }
    returnToTripEditorAfterExpeditionSave = false;
    els.expeditionDialog.close();
    renderAll();
  } catch (error) {
    state.expeditions = previous;
    showExpeditionFormMessage(error.message || "The expedition could not be saved.");
  }
}

async function deleteActiveExpedition() {
  const expeditionId = els.expeditionId.value;
  const expedition = state.expeditions.find((item) => item.id === expeditionId);
  if (!expedition) return;
  const memberTrips = expeditionMemberTrips(expeditionId);
  const detail = memberTrips.length ? ` Its ${memberTrips.length} ${memberTrips.length === 1 ? "trip" : "trips"} will be kept and unassigned.` : "";
  if (!confirm(`Delete “${expedition.name}”?${detail}`)) return;
  const previousExpeditions = structuredClone(state.expeditions);
  const previousTrips = structuredClone(state.trips);
  state.expeditions = state.expeditions.filter((item) => item.id !== expeditionId);
  state.trips = ExpeditionAnalytics.unassignTrips(state.trips, expeditionId);
  try {
    await saveState();
    activeExpeditionId = "";
    els.expeditionDialog.close();
    renderAll();
  } catch (error) {
    state.expeditions = previousExpeditions;
    state.trips = previousTrips;
    showExpeditionFormMessage(error.message || "The expedition could not be deleted.");
  }
}

els.expeditionSearchInput?.addEventListener("input", renderExpeditions);
els.expeditionSortSelect?.addEventListener("change", renderExpeditions);
els.expeditionForm?.addEventListener("submit", saveExpedition);
els.deleteExpeditionButton?.addEventListener("click", deleteActiveExpedition);
els.newExpeditionButton?.addEventListener("click", () => openExpeditionDialog());
els.addExpeditionFromTripButton?.addEventListener("click", () => openExpeditionDialog(null, { fromTripEditor: true }));

document.addEventListener("click", (event) => {
  const calendarTrigger = event.target.closest("[data-calendar-trigger]");
  if (calendarTrigger) {
    event.preventDefault();
    openCalendar(calendarTrigger.dataset.calendarTrigger);
    return;
  }
  const calendarPopover = event.target.closest(".calendar-popover");
  if (calendarPopover && activeCalendarInputId) {
    const step = event.target.closest("[data-calendar-step]");
    if (step) {
      activeCalendarMonth.setUTCMonth(activeCalendarMonth.getUTCMonth() + Number(step.dataset.calendarStep));
      renderCalendar(activeCalendarInputId);
      return;
    }
    const day = event.target.closest("[data-calendar-date]");
    if (day) {
      const valueInput = document.querySelector(`#${activeCalendarInputId}`);
      const displayInput = document.querySelector(`[data-calendar-field="${activeCalendarInputId}"] .styled-date-display`);
      valueInput.value = day.dataset.calendarDate;
      displayInput.value = displayDateForCalendar(valueInput.value);
      displayInput.setCustomValidity("");
      displayInput.dispatchEvent(new Event("input", { bubbles: true }));
      closeCalendars();
      return;
    }
    if (event.target.closest("[data-calendar-clear]")) {
      const valueInput = document.querySelector(`#${activeCalendarInputId}`);
      const displayInput = document.querySelector(`[data-calendar-field="${activeCalendarInputId}"] .styled-date-display`);
      valueInput.value = "";
      displayInput.value = "";
      displayInput.dispatchEvent(new Event("input", { bubbles: true }));
      closeCalendars();
      return;
    }
    if (event.target.closest("[data-calendar-today]")) {
      const valueInput = document.querySelector(`#${activeCalendarInputId}`);
      const displayInput = document.querySelector(`[data-calendar-field="${activeCalendarInputId}"] .styled-date-display`);
      valueInput.value = new Date().toISOString().slice(0, 10);
      displayInput.value = displayDateForCalendar(valueInput.value);
      displayInput.setCustomValidity("");
      displayInput.dispatchEvent(new Event("input", { bubbles: true }));
      closeCalendars();
      return;
    }
    return;
  }
  if (activeCalendarInputId && !event.target.closest(".styled-date-field")) closeCalendars();
  const newButton = event.target.closest("[data-new-expedition]");
  if (newButton) openExpeditionDialog();
  const selectButton = event.target.closest("[data-select-expedition]");
  if (selectButton) {
    activeExpeditionId = selectButton.dataset.selectExpedition;
    renderExpeditions();
  }
  const editButton = event.target.closest("[data-edit-expedition]");
  if (editButton) openExpeditionDialog(state.expeditions.find((item) => item.id === editButton.dataset.editExpedition));
  const tripRow = event.target.closest("[data-expedition-open-trip]");
  if (tripRow) {
    const trip = state.trips.find((item) => item.id === tripRow.dataset.expeditionOpenTrip);
    if (trip) openTripSummary(trip);
  }
  if (event.target.closest("[data-go-to-trips]")) setView("trips");
});

document.addEventListener("keydown", (event) => {
  if (!event.target.closest("[data-expedition-open-trip]") || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  const tripRow = event.target.closest("[data-expedition-open-trip]");
  const trip = state.trips.find((item) => item.id === tripRow.dataset.expeditionOpenTrip);
  if (trip) openTripSummary(trip);
});

document.querySelectorAll(".styled-date-display").forEach((input) => {
  input.addEventListener("input", () => syncCalendarDate(input.closest(".styled-date-field")?.dataset.calendarField));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      syncCalendarDate(input.closest(".styled-date-field")?.dataset.calendarField);
      closeCalendars();
    }
  });
});
