const reportColumnDefinitions = [
  ["number", "#"], ["type", "Record"], ["time", "Time"], ["angler", "Angler"], ["result", "Result"], ["species", "Species"], ["spot", "Spot"], ["size", "Size"],
  ["waterDepth", "Water depth"], ["depth", "Depth Down"], ["method", "Method"], ["setup", "Line"], ["lure", "Lure"], ["flasher", "Flasher"], ["direction", "Direction"],
  ["gpsSpeed", "GPS Speed"], ["ballSpeed", "Ball Speed"], ["flatlineWeight", "Flatline Weight"],
  ["lineBehindBoard", "Line Behind Board"], ["leadcoreColors", "Leadcore Colors"], ["dipseySetting", "Dipsey Setting"],
  ["lineOut", "Line Out"], ["retrieve", "Retrieve"], ["shaker", "Shaker"], ["deepestRigger", "Deepest Rigger"],
  ["notes", "Notes"], ["photo", "Media"]
];
const reportDefaultColumns = new Set(reportColumnDefinitions.map(([key]) => key));
const reportColumnPreferenceKey = `${storageKey}-trip-report-columns-v5`;
const reportTrollingColumns = new Set([
  "setup", "flasher", "direction", "gpsSpeed", "ballSpeed", "depth", "flatlineWeight", "lineBehindBoard",
  "leadcoreColors", "dipseySetting", "lineOut", "shaker", "deepestRigger"
]);

function reportColumnDefinitionsForTrip(trip) {
  const trolling = isTrollingTripRecord(trip);
  return reportColumnDefinitions.filter(([key]) => (trolling
    ? key !== "retrieve" && key !== "method"
    : !reportTrollingColumns.has(key)));
}

function reportColumns() {
  if (activeReportTimelineColumns) return activeReportTimelineColumns;
  try {
    const saved = JSON.parse(localStorage.getItem(reportColumnPreferenceKey) || "null");
    activeReportTimelineColumns = Array.isArray(saved) ? new Set(saved) : new Set(reportDefaultColumns);
  } catch {
    activeReportTimelineColumns = new Set(reportDefaultColumns);
  }
  return activeReportTimelineColumns;
}

function reportResult(item) {
  if (item.type === "Lost") return "Lost";
  if (item.shaker) return "Shaker";
  return item.released ? "Released" : "Kept";
}

function reportText(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function reportPersonName(trip, personId) {
  return displayTitleText((trip.people || []).find((person) => person.id === personId)?.name || "");
}

function reportCoordinates(record) {
  const coordinates = record.manualCoordinates || record.coordinates || record.lockedLocationCoordinates;
  if (!coordinates || !Number.isFinite(Number(coordinates.latitude)) || !Number.isFinite(Number(coordinates.longitude))) return "";
  return `${Number(coordinates.latitude).toFixed(5)}, ${Number(coordinates.longitude).toFixed(5)}`;
}

function reportMetadataLocks(record) {
  const locks = record.metadataLocks || {};
  const values = [["time", "Time"], ["location", "Location"], ["fow", "FOW"]].filter(([key]) => locks[key]).map(([, label]) => label);
  return values.length ? values.join(", ") : "None";
}

function reportDepthDown(record, catchItem) {
  const ballDepth = Number.parseFloat(record.ballDepth);
  const cheater = String(record.presentation || "").toLowerCase() === "cheater"
    || String(catchItem.setupLineId || "").endsWith("::cheater");
  if (cheater && Number.isFinite(ballDepth)) {
    return reportDepthValue(trimNumber(ballDepth / 2));
  }
  if (record.depthDown) return reportDepthValue(record.depthDown);
  if (record.ballDepth) return reportDepthValue(record.ballDepth);
  if (record.estimatedLureDepth) return reportDepthValue(record.estimatedLureDepth);
  if (record.estimatedDepth) return reportDepthValue(record.estimatedDepth);
  return "";
}

function reportDepthValue(value) {
  const withoutFow = String(value || "").replace(/\bFOW\b/gi, "").trim();
  if (!withoutFow) return "";
  const rounded = withoutFow.replace(/-?\d+(?:\.\d+)?/g, (number) => String(Math.round(Number(number))));
  return displayStoredMeasurement(rounded, "depth");
}

function reportTimelineRecords(trip) {
  const makeRecord = (item, index, type) => {
    const record = resolveTripLineRecord({ ...item, trip });
    const lure = displayTitleText(lureName(record.lureId));
    const flasher = displayTitleText(flasherName(record.flasherId));
    const status = type === "lost" ? "Lost" : reportResult(item);
    return {
      index, catchIndex: type === "catch" ? index : null, type, time: item.time || "", result: status,
      species: displayTitleText(item.species || item.possibleSpecies || "Unknown"),
      spot: type === "catch" ? spotName(item.spotId) : "",
      size: [displayStoredMeasurement(record.length, "fishLength"), displayStoredMeasurement(record.weight, "fishWeight")].filter(Boolean).join(" / "),
      method: displayTitleText(presentationLabel(record.presentation) || trip.method || ""),
      type: type === "lost" ? "Lost fish" : "Catch", angler: reportPersonName(trip, item.personId), setup: compactSetupDisplayLabel(record),
      waterDepth: reportDepthValue(record.fowCaught || record.waterDepth), depth: reportDepthDown(record, item), lure, flasher,
      lureId: record.lureId || "", flasherId: record.flasherId || "",
      direction: displayTitleText(record.direction), gpsSpeed: displaySpeedValue(record.gpsSpeed || record.speed), ballSpeed: displaySpeedValue(record.ballSpeed),
      flatlineWeight: record.flatlineWeightOz ? `${record.flatlineWeightOz} oz` : "",
      lineBehindBoard: reportDepthValue(record.lineBehindBoard), leadcoreColors: record.leadcoreColors,
      dipseySetting: record.dipseySetting, lineOut: reportDepthValue(record.lineOut), retrieve: record.retrieve,
      shaker: record.shaker ? "Yes" : "No", deepestRigger: record.deepestRigger ? "Yes" : "No", location: record.photoLocationId || "",
      coordinates: reportCoordinates(record), locks: reportMetadataLocks(record), weather: catchWeatherSummary(item.weatherData || {}),
      notes: displaySentenceText(item.notes || ""), photos: item.photos || []
    };
  };
  return [
    ...(trip.catches || []).map((item, index) => makeRecord(item, index, "catch")),
    ...(trip.lostFish || []).map((item, index) => makeRecord(item, index, "lost"))
  ];
}

function renderReportKeyValue(title, rows) {
  const values = rows.filter(([, value]) => value);
  if (!values.length) return "";
  return `<section class="report-fact-section"><h3>${escapeHtml(title)}</h3><dl>${values.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl></section>`;
}

function renderReportTimeline(trip) {
  const definitions = reportColumnDefinitionsForTrip(trip);
  const columns = reportColumns();
  let records = reportTimelineRecords(trip).filter((row) => activeReportTimelineFilter === "all" || row.result.toLowerCase() === activeReportTimelineFilter);
  const { key, direction } = activeReportTimelineSort;
  records = records.sort((a, b) => String(a[key] || "").localeCompare(String(b[key] || ""), undefined, { numeric: true }) * (direction === "asc" ? 1 : -1));
  const visible = definitions.filter(([key]) => columns.has(key));
  const filters = [["all", "All results"], ["kept", "Kept"], ["released", "Released"], ["lost", "Lost"]];
  return `<section class="report-timeline-section">
    <div class="report-timeline-heading"><div><h3>Catch timeline</h3></div>
      <div class="report-timeline-tools"><div class="report-filter-group" role="group" aria-label="Filter catches">${filters.map(([value, label]) => `<button type="button" class="report-filter ${activeReportTimelineFilter === value ? "is-active" : ""}" data-report-filter="${value}">${escapeHtml(label)}</button>`).join("")}</div>
        <details class="report-column-picker"><summary>Columns</summary><div class="report-column-picker-menu">${definitions.map(([key, label]) => `<label><input type="checkbox" data-report-column="${key}" ${columns.has(key) ? "checked" : ""}> ${escapeHtml(label)}</label>`).join("")}</div></details></div></div>
    <div class="report-table-scroll" tabindex="0" aria-label="Catch timeline. Scroll horizontally for more columns.">
      <table class="report-catch-table"><thead><tr>${visible.map(([column, label]) => `<th scope="col"><button type="button" data-report-sort="${column}" aria-label="Sort by ${escapeHtml(label)}">${escapeHtml(label)}${key === column ? `<span aria-hidden="true"> ${direction === "asc" ? "↑" : "↓"}</span>` : ""}</button></th>`).join("")}</tr></thead>
      <tbody>${records.length ? records.map((row, index) => `<tr ${row.catchIndex !== null ? `data-summary-catch-index="${row.catchIndex}" tabindex="0" role="button" aria-label="Open details for ${escapeHtml(row.species)}"` : ""}>${visible.map(([column]) => {
        if (column === "number") return `<td>${index + 1}</td>`;
        if (column === "time") return `<td>${escapeHtml(row.time ? formatTimelineDisplayTime(row.time) : "—")}</td>`;
        if (column === "result") return `<td><span class="report-result result-${row.result.toLowerCase()}">${escapeHtml(row.result)}</span></td>`;
        if (column === "photo") return `<td>${row.photos[0] ? mediaMarkup(row.photos[0], "report-row-photo", { download: false }) : "—"}</td>`;
        if (column === "lure") return `<td>${row.lureId ? `<button class="report-gear-link" type="button" data-report-lure-id="${escapeHtml(row.lureId)}" aria-label="View lure details for ${escapeHtml(row.lure || "lure")}">${escapeHtml(row.lure || "—")}</button>` : escapeHtml(row.lure || "—")}</td>`;
        if (column === "flasher") return `<td>${row.flasherId ? `<button class="report-gear-link" type="button" data-report-flasher-id="${escapeHtml(row.flasherId)}" aria-label="View flasher details for ${escapeHtml(row.flasher || "flasher")}">${escapeHtml(row.flasher || "—")}</button>` : escapeHtml(row.flasher || "—")}</td>`;
        return `<td title="${escapeHtml(row[column] || "")}">${escapeHtml(row[column] || "—")}</td>`;
      }).join("")}</tr>`).join("") : `<tr><td colspan="${visible.length}" class="report-empty-row">No catches were logged for this trip.</td></tr>`}</tbody></table>
    </div></section>`;
}

function refreshReportTimeline() {
  const trip = state.trips.find((item) => item.id === activeSummaryTripId);
  const section = document.querySelector(".report-timeline-section");
  if (trip && section) section.replaceWith(document.createRange().createContextualFragment(renderReportTimeline(trip)));
}

function reportRatingLabel(value) {
  return ["", "Bad", "Mediocre", "Good", "Outstanding"][Math.min(4, Math.max(1, Number(value) || 1))];
}

function renderProbeTemperatureProfileReport(profile = []) {
  const readings = (Array.isArray(profile) ? profile : [])
    .filter((entry) => entry && Number.isFinite(Number(entry.depthFeet)))
    .sort((a, b) => Number(a.depthFeet) - Number(b.depthFeet));
  if (!readings.length) return "Not logged";
  return `<div class="report-probe-scroll"><div class="report-probe-profile">${readings.map((entry) => `<span><b>${escapeHtml(formatUnitValue(Number(entry.depthFeet), "depth", "ft", { decimals: 0 }))}</b><em>${escapeHtml(displayStoredMeasurement(entry.temperature, "waterTemperature"))}</em></span>`).join("")}</div></div>`;
}

function biggestCatchMeasurement(catches = []) {
  const records = Array.isArray(catches) ? catches : [];
  const largest = (field) => records
    .map((catchItem) => Number(String(catchItem?.[field] || "").match(/[\d.]+/)?.[0]) || 0)
    .reduce((value, measurement) => Math.max(value, measurement), 0);
  const weight = largest("weight");
  if (weight) return { value: weight, unit: "fishWeight" };
  const length = largest("length");
  return length ? { value: length, unit: "fishLength" } : null;
}

function renderReportSetupTable(trip) {
  const rows = trip.gearUsed || [];
  const trolling = isTrollingTripRecord(trip);
  const columns = ["#", "Start", "End", "Side", "Line", "Combo", "Rod", "Reel", "Lure", ...(trolling ? ["Flasher", "Presentation", "Distance Behind", "Leadcore", "Deepest Rigger", "Cheater", "Cheater Lure", "Lure Minutes", "Flasher Minutes"] : []), "Change Note"];
  const values = (gearItem, index) => [
    index + 1, gearItem.startTime ? formatTimelineDisplayTime(gearItem.startTime) : "", gearItem.endTime ? formatTimelineDisplayTime(gearItem.endTime) : "",
    setupLineSideLabel(gearItem.side), gearItem.lineLabel, comboName(gearItem.comboId), rodName(gearItem.rodId), reelName(gearItem.reelId),
    lureName(gearItem.lureId), ...(trolling ? [
      flasherName(gearItem.flasherId), presentationLabel(gearItem.presentation), reportDepthValue(gearItem.distanceBehind),
      gearItem.hasLeadcore ? "Yes" : "No", gearItem.deepestRigger ? "Yes" : "No", gearItem.hasCheater ? "Yes" : "No", lureName(gearItem.cheaterLureId),
      gearItem.lureMinutes, gearItem.flasherMinutes
    ] : []), displaySentenceText(gearItem.changeNote || "")
  ];
  return `<section class="report-setup-section"><div class="report-section-title"><h3>Setup details</h3></div><div class="report-table-scroll" tabindex="0" aria-label="Setup details. Scroll horizontally for more columns."><table class="report-catch-table report-setup-table"><thead><tr>${columns.map((label) => `<th scope="col"><span>${escapeHtml(label)}</span></th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((gearItem, index) => `<tr>${values(gearItem, index).map((value) => `<td>${escapeHtml(reportText(value))}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}" class="report-empty-row">No setup lines were logged for this trip.</td></tr>`}</tbody></table></div></section>`;
}

function renderTripReport(trip) {
  const species = tripSpeciesSummary(trip);
  const landed = (trip.catches || []).reduce((total, item) => total + fishCount(item), 0);
  const lost = (trip.lostFish || []).length;
  const biggestFish = biggestCatchMeasurement(trip.catches);
  const hours = tripHours(trip);
  const fishPerHour = hours ? trimNumber(landed / hours) : "";
  const hero = null;
  const reportMeta = [formatDate(trip.date), trip.launchTime ? formatTimelineDisplayTime(trip.launchTime) : ""].filter(Boolean).join(" · ");
  const overview = [["Date", formatDate(trip.date)], ["Location", displayTitleText(trip.location)], ["Launch / area", displayTitleText(trip.launch)], ["Lines set time", trip.linesSetTime || trip.startTime ? formatTimelineDisplayTime(trip.linesSetTime || trip.startTime) : ""], ["Lines pulled time", trip.linesPulledTime || trip.endTime ? formatTimelineDisplayTime(trip.linesPulledTime || trip.endTime) : ""], ["Duration", tripHours(trip) ? `${trimNumber(tripHours(trip))} hours` : ""], ["People", (trip.people || []).map((person) => displayTitleText(person.name)).filter(Boolean).join(", ")], ["Target species", displayTitleText(trip.targetSpecies)], ["Method", displayTitleText(trip.method)], ["Intent", displayTitleText(trip.intent)], ["Rating", reportRatingLabel(trip.tripRating)]];
  const conditions = [["Weather", displayTitleText(trip.weather)], ["Water temperature", displayStoredMeasurement(trip.waterTemp, "waterTemperature")], ["Water clarity", displayTitleText(trip.waterClarity)], ["Structure", displayTitleText(trip.structureType)], ["FOW range", displayStoredMeasurement(trip.structure, "depth")], ["Wind", trip.wind], ["Waves / chop", formatWaveHeightChopLine(trip, trip.weatherData)], ...reportAdditionalConditionRows(trip)];
  const mapRecords = catchMapRecordsForTrip(trip);
  return `<article class="trip-report">
    <header class="report-header"><div class="report-header-copy"><p class="report-date">${escapeHtml(reportMeta)}${trip.location ? ` · ${escapeHtml(displayTitleText(trip.location))}` : ""}</p><h3>${escapeHtml(displayTitleText(trip.title || trip.location || "Trip report"))}</h3><p class="report-subtitle">${escapeHtml([trip.targetSpecies, trip.method].filter(Boolean).map(displayTitleText).join(" · ") || "Fishing trip report")}</p><div class="report-actions"><button class="button primary" type="button" data-report-action="edit">Edit trip</button><button class="button secondary" type="button" data-report-action="share">Share trip</button></div></div>${hero ? `<button class="report-hero-photo" type="button" data-report-open-photo aria-label="Open trip photo">${mediaMarkup(hero, "report-hero-asset", { download: false })}</button>` : ""}</header>
    <section class="report-stat-strip">${[["Landed", landed], ["Missed / lost", lost], ["Biggest fish", biggestFish ? displayStoredMeasurement(biggestFish.value, biggestFish.unit) : ""], ["Fish / hr", fishPerHour], ["Hours", trimNumber(hours)], ["Species", species.count]].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value === "" || value === null || value === undefined ? "Not logged" : value))}</strong></div>`).join("")}</section>
    <section class="report-notes"><h3>Trip notes</h3><p>${escapeHtml(trip.notes || "Not logged")}</p></section>
    <div class="report-fact-grid report-overview-grid">${renderReportKeyValue("Trip details", overview)}${renderReportKeyValue("Conditions", conditions)}${(trip.probeTemperatureProfile || []).some((entry) => entry && Number.isFinite(Number(entry.depthFeet)) && String(entry.temperature || "").trim()) ? `<section class="report-fact-section report-probe-section"><h3>Probe temperature profile</h3>${renderProbeTemperatureProfileReport(trip.probeTemperatureProfile)}</section>` : ""}</div>
    ${isTrollingTripRecord(trip) ? `<section class="report-spread"><div class="report-section-title"><h3>Trolling spread</h3></div>${renderTrollingSpread(trip)}</section>` : ""}
    ${renderReportSetupTable(trip)}
    ${renderReportTimeline(trip)}
    ${mapRecords.length ? `<section class="report-map-section"><div class="report-section-title"><h3>Fish map</h3></div><div class="summary-map-tools"><label><span>Species</span><select id="tripSummaryMapFilter"></select></label></div><div id="tripSummaryMap" class="fish-map trip-summary-map"></div></section>` : ""}
    <section class="report-photos"><div><h3>Photos</h3><p>${escapeHtml(`${(trip.notePhotos || []).length} saved`)}</p></div>${summaryPhotoGrid(trip.notePhotos || [], "No trip photos", { compact: true })}</section>
    <div id="catchDetailHost"></div>
  </article>`;
}

function openTripReportPhotoLightbox(photo) {
  const source = originalMediaUrl(photo) || previewImage(photo);
  if (!source) return;
  document.querySelector(".report-photo-lightbox")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="report-photo-lightbox" role="dialog" aria-modal="true" aria-label="Trip photo"><button type="button" class="report-photo-lightbox-close" data-close-report-photo aria-label="Close photo">×</button><img src="${escapeHtml(source)}" alt="${escapeHtml(displayPhotoTitle(photo))}"></div>`);
  document.querySelector("[data-close-report-photo]")?.focus();
}
