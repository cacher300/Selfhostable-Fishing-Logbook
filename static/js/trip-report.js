import { html, insertHtml, joinHtml } from "./html.js";
import { storageKey } from "./app-config.js";
import { state, ui } from "./app-state.js";
import { hasFishHawk, spotName } from "./app-normalization.js";
import { displayStoredMeasurement, formatUnitValue } from "./app-units.js";
import { els } from "./app-elements.js";
import { isVideoMedia, mediaMarkup, originalMediaUrl, previewImage } from "./app-media.js";
import { catchWeatherSummary, formatWaveHeightChopLine } from "./location-weather.js";
import { fishCount, formatDate, tripHours } from "./dashboard.js";
import { displayProbeTemperatureMeasurement, probeCatchDepths, probeTemperatureChartLegendMarkup, probeTemperatureReadings, renderProbeTemperatureProfileChartMarkup } from "./trip-editor.js";
import { comboName, flasherName, lureName, reelName, rodName } from "./gear-core.js";
import { isTrollingTripRecord, renderTrollingSpread, resolveTripLineRecord, setupLineSideLabel } from "./trolling-spread.js";
import { catchMapRecordsForTrip } from "./maps.js";
import { compactSetupDisplayLabel, displayPhotoTitle, displaySentenceText, displaySpeedValue, displayTitleText, reportAdditionalConditionRows, summaryPhotoGrid, tripSpeciesSummary } from "./trip-summary.js";
import { formatTimelineDisplayTime } from "./trip-timeline.js";
import { presentationLabel } from "./stats.js";
import { trimNumber } from "./form-utils.js";


export const reportColumnDefinitions = [
  ["number", "#"], ["type", "Record"], ["time", "Time"], ["angler", "Angler"], ["result", "Result"], ["species", "Species"], ["spot", "Spot"], ["structure", "Structure"], ["size", "Size"],
  ["waterDepth", "Water depth"], ["depth", "Depth Down"], ["setup", "Line"], ["lure", "Lure"], ["flasher", "Flasher"], ["direction", "Direction"],
  ["gpsSpeed", "GPS Speed"], ["ballSpeed", "Ball Speed"], ["ballTemp", "Ball Temp"], ["flatlineWeight", "Flatline Weight"],
  ["lineBehindBoard", "Line Behind Board"], ["leadcoreColors", "Leadcore Colors"], ["dipseySetting", "Dipsey Setting"],
  ["lineOut", "Line Out"], ["retrieve", "Retrieve"], ["shaker", "Shaker"], ["deepestRigger", "Deepest Rigger"],
  ["notes", "Notes"], ["photo", "Media"]
];
export let reportDefaultColumns;

export let reportColumnPreferenceKey;

export const reportTrollingColumns = new Set([
  "setup", "flasher", "direction", "gpsSpeed", "ballSpeed", "ballTemp", "depth", "flatlineWeight", "lineBehindBoard",
  "leadcoreColors", "dipseySetting", "lineOut", "shaker", "deepestRigger"
]);
export const reportRequiredColumns = new Set(["number", "type", "time", "result", "species"]);

export function reportColumnValueIsMeaningful(column, row) {
  if (column === "photo") return row.photos?.length > 0;
  if (column === "shaker" || column === "deepestRigger") return row[column] === "Yes";
  return row[column] !== null && row[column] !== undefined && row[column] !== "";
}

export function reportRelevantColumnDefinitions(trip, records = reportTimelineRecords(trip)) {
  const definitions = reportColumnDefinitionsForTrip(trip);
  return definitions.filter(([key]) => reportRequiredColumns.has(key)
    || records.some((row) => reportColumnValueIsMeaningful(key, row)));
}

export function reportColumnDefinitionsForTrip(trip) {
  const trolling = isTrollingTripRecord(trip);
  return reportColumnDefinitions.filter(([key]) => (trolling
    ? key !== "retrieve" && key !== "method"
    : !reportTrollingColumns.has(key)));
}

export function reportColumns() {
  if (ui.activeReportTimelineColumns) return ui.activeReportTimelineColumns;
  try {
    const saved = JSON.parse(localStorage.getItem(reportColumnPreferenceKey) || "null");
    ui.activeReportTimelineColumns = Array.isArray(saved) ? new Set(saved) : new Set(reportDefaultColumns);
  } catch {
    ui.activeReportTimelineColumns = new Set(reportDefaultColumns);
  }
  return ui.activeReportTimelineColumns;
}

export function reportResult(item) {
  if (item.type === "Lost") return "Lost";
  if (item.shaker) return "Shaker";
  return item.released ? "Released" : "Kept";
}

export function reportText(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export function reportPersonName(trip, personId) {
  return displayTitleText((trip.people || []).find((person) => person.id === personId)?.name || "");
}

export function reportCoordinates(record) {
  const coordinates = record.manualCoordinates || record.coordinates || record.lockedLocationCoordinates;
  if (!coordinates || !Number.isFinite(Number(coordinates.latitude)) || !Number.isFinite(Number(coordinates.longitude))) return "";
  return `${Number(coordinates.latitude).toFixed(5)}, ${Number(coordinates.longitude).toFixed(5)}`;
}

export function reportMetadataLocks(record) {
  const locks = record.metadataLocks || {};
  const values = [["time", "Time"], ["location", "Location"], ["fow", "FOW"]].filter(([key]) => locks[key]).map(([, label]) => label);
  return values.length ? values.join(", ") : "None";
}

export function reportDepthDown(record, catchItem) {
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

export function reportDepthValue(value) {
  const withoutFow = String(value || "").replace(/\bFOW\b/gi, "").trim();
  if (!withoutFow) return "";
  const rounded = withoutFow.replace(/-?\d+(?:\.\d+)?/g, (number) => String(Math.round(Number(number))));
  return displayStoredMeasurement(rounded, "depth");
}

export function reportTimelineRecords(trip) {
  const makeRecord = (item, index, type) => {
    const record = resolveTripLineRecord({ ...item, trip });
    const lure = displayTitleText(lureName(record.lureId));
    const flasher = displayTitleText(flasherName(record.flasherId));
    const status = type === "lost" ? "Lost" : reportResult(item);
    return {
      index, catchIndex: index, catchType: type, time: item.time || "", result: status,
      species: displayTitleText(item.species || item.possibleSpecies || "Unknown"),
      spot: type === "catch" ? spotName(item.spotId) : "",
      structure: displayTitleText(item.structureType || item.structure || ""),
      size: [displayStoredMeasurement(record.length, "fishLength"), displayStoredMeasurement(record.weight, "fishWeight")].filter(Boolean).join(" / "),
      method: displayTitleText(presentationLabel(record.presentation) || trip.method || ""),
      type: type === "lost" ? "Lost fish" : "Catch", angler: reportPersonName(trip, item.personId), setup: compactSetupDisplayLabel(record),
      waterDepth: reportDepthValue(record.fowCaught || record.waterDepth), depth: reportDepthDown(record, item), lure, flasher,
      lureId: record.lureId || "", flasherId: record.flasherId || "",
      direction: displayTitleText(record.direction), gpsSpeed: displaySpeedValue(record.gpsSpeed), ballSpeed: displaySpeedValue(record.ballSpeed), ballTemp: displayStoredMeasurement(record.ballTemp, "waterTemperature"),
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

export function renderReportKeyValue(title, rows) {
  const values = rows.filter(([, value]) => value);
  if (!values.length) return "";
  return html`<section class="report-fact-section"><h3>${title}</h3><dl>${joinHtml(values.map(([label, value]) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`), "")}</dl></section>`;
}

export function renderReportTimeline(trip) {
  const definitions = reportRelevantColumnDefinitions(trip);
  const columns = reportColumns();
  let records = reportTimelineRecords(trip).filter((row) => ui.activeReportTimelineFilter === "all" || row.result.toLowerCase() === ui.activeReportTimelineFilter);
  const { key, direction } = ui.activeReportTimelineSort;
  records = records.sort((a, b) => String(a[key] || "").localeCompare(String(b[key] || ""), undefined, { numeric: true }) * (direction === "asc" ? 1 : -1));
  const visible = definitions.filter(([key]) => columns.has(key));
  const filters = [["all", "All results"], ["kept", "Kept"], ["released", "Released"], ["lost", "Lost"]];
  return html`<section class="report-timeline-section">
    <div class="report-timeline-heading"><div><h3>Catch timeline</h3></div>
      <div class="report-timeline-tools"><div class="report-filter-group" role="group" aria-label="Filter catches">${joinHtml(filters.map(([value, label]) => html`<button type="button" class="report-filter ${ui.activeReportTimelineFilter === value ? "is-active" : ""}" data-report-filter="${value}">${label}</button>`), "")}</div>
        <details class="report-column-picker"><summary>Columns</summary><div class="report-column-picker-menu">${joinHtml(definitions.map(([key, label]) => html`<label><input type="checkbox" data-report-column="${key}" ${columns.has(key) ? "checked" : ""}> ${label}</label>`), "")}</div></details></div></div>
    <div class="report-table-scroll" tabindex="0" aria-label="Catch timeline. Scroll horizontally for more columns.">
      <table class="report-catch-table"><thead><tr>${joinHtml(visible.map(([column, label]) => html`<th scope="col"><button type="button" data-report-sort="${column}" aria-label="Sort by ${label}">${label}${key === column ? html`<span aria-hidden="true"> ${direction === "asc" ? "↑" : "↓"}</span>` : ""}</button></th>`), "")}</tr></thead>
      <tbody>${records.length ? joinHtml(records.map((row, index) => html`<tr data-summary-catch-index="${row.catchIndex}" data-summary-catch-type="${row.catchType}" tabindex="0" role="button" aria-label="Open details for ${row.species}">${joinHtml(visible.map(([column]) => {
        if (column === "number") return html`<td>${index + 1}</td>`;
        if (column === "time") return html`<td>${row.time ? formatTimelineDisplayTime(row.time) : "—"}</td>`;
        if (column === "result") return html`<td><span class="report-result result-${row.result.toLowerCase()}">${row.result}</span></td>`;
        if (column === "photo") return html`<td>${row.photos[0] ? mediaMarkup(row.photos[0], "report-row-photo", { download: false }) : "—"}</td>`;
        if (column === "lure") return html`<td>${row.lureId ? html`<button class="report-gear-link" type="button" data-report-lure-id="${row.lureId}" aria-label="View lure details for ${row.lure || "lure"}">${row.lure || "—"}</button>` : row.lure || "—"}</td>`;
        if (column === "flasher") return html`<td>${row.flasherId ? html`<button class="report-gear-link" type="button" data-report-flasher-id="${row.flasherId}" aria-label="View flasher details for ${row.flasher || "flasher"}">${row.flasher || "—"}</button>` : row.flasher || "—"}</td>`;
        return html`<td title="${row[column] || ""}">${row[column] || "—"}</td>`;
      }), "")}</tr>`), "") : html`<tr><td colspan="${visible.length}" class="report-empty-row">No catches were logged for this trip.</td></tr>`}</tbody></table>
    </div></section>`;
}

export function refreshReportTimeline() {
  const trip = state.trips.find((item) => item.id === ui.activeSummaryTripId);
  const section = document.querySelector(".report-timeline-section");
  if (trip && section) section.replaceWith(document.createRange().createContextualFragment(renderReportTimeline(trip)));
}

export function reportRatingLabel(value) {
  return ["", "Bad", "Mediocre", "Good", "Outstanding"][Math.min(4, Math.max(1, Number(value) || 1))];
}

export function renderProbeTemperatureProfileReport(profile = [], catches = []) {
  const readings = probeTemperatureReadings(profile);
  if (!readings.length) return "Not logged";
  const catchDepthEntries = probeCatchDepths(catches);
  return html`<div class="report-probe-chart-wrap"><div class="report-probe-chart">${renderProbeTemperatureProfileChartMarkup(readings, { compact: true, idPrefix: "reportProbeTemperature", catchDepths: catchDepthEntries })}</div>${probeTemperatureChartLegendMarkup(catchDepthEntries)}<div class="report-probe-values" aria-label="Recorded probe readings">${joinHtml(readings.map((entry) => html`<span><b>${formatUnitValue(Number(entry.depthFeet), "depth", "ft", { decimals: 0 })}</b><em>${displayProbeTemperatureMeasurement(entry.temperature)}</em></span>`), "")}</div></div>`;
}

export function biggestCatchMeasurement(catches = []) {
  const records = Array.isArray(catches) ? catches : [];
  const largest = (field) => records
    .map((catchItem) => Number(String(catchItem?.[field] || "").match(/[\d.]+/)?.[0]) || 0)
    .reduce((value, measurement) => Math.max(value, measurement), 0);
  const weight = largest("weight");
  if (weight) return { value: weight, unit: "fishWeight" };
  const length = largest("length");
  return length ? { value: length, unit: "fishLength" } : null;
}

export function biggestCatchRecord(catches = []) {
  const records = Array.isArray(catches) ? catches : [];
  const field = records.some((catchItem) => Number(String(catchItem?.weight || "").match(/[\d.]+/)?.[0]) > 0) ? "weight" : "length";
  return records.reduce((biggest, catchItem) => {
    const currentValue = Number(String(catchItem?.[field] || "").match(/[\d.]+/)?.[0]) || 0;
    const biggestValue = Number(String(biggest?.[field] || "").match(/[\d.]+/)?.[0]) || 0;
    return currentValue > biggestValue ? catchItem : biggest;
  }, null);
}

export function catchPhotosByPriority(trip) {
  const catches = trip.catches || [];
  const biggest = biggestCatchRecord(catches);
  return [
    ...(biggest?.photos || []),
    ...catches.filter((catchItem) => catchItem !== biggest).flatMap((catchItem) => catchItem.photos || []),
    ...(trip.lostFish || []).flatMap((catchItem) => catchItem.photos || []),
  ];
}

export function renderReportSetupTable(trip) {
  const rows = trip.gearUsed || [];
  const trolling = isTrollingTripRecord(trip);
  const columns = ["#", "Start", "End", "Side", "Line", "Combo", "Rod", "Reel", "Lure", ...(trolling ? ["Flasher", "Presentation", "Distance Behind", "Dipsey Diver Color", "Leadcore", "Cheater", "Cheater Lure", "Lure Minutes", "Flasher Minutes"] : []), "Change Note"];
  const values = (gearItem, index) => [
    index + 1, gearItem.startTime ? formatTimelineDisplayTime(gearItem.startTime) : "", gearItem.endTime ? formatTimelineDisplayTime(gearItem.endTime) : "",
    setupLineSideLabel(gearItem.side), gearItem.lineLabel, comboName(gearItem.comboId), rodName(gearItem.rodId), reelName(gearItem.reelId),
    lureName(gearItem.lureId), ...(trolling ? [
      flasherName(gearItem.flasherId), presentationLabel(gearItem.presentation), reportDepthValue(gearItem.distanceBehind), gearItem.dipseyDiverColor,
      gearItem.hasLeadcore ? "Yes" : "No", gearItem.hasCheater ? "Yes" : "No", lureName(gearItem.cheaterLureId),
      gearItem.lureMinutes, gearItem.flasherMinutes
    ] : []), displaySentenceText(gearItem.changeNote || "")
  ];
  const rowValues = rows.map((gearItem, index) => values(gearItem, index));
  const visibleIndexes = rows.length
    ? columns.map((_, index) => index).filter((index) => rowValues.some((row) => {
      const value = row[index];
      return value !== null && value !== undefined && String(value).trim() !== "";
    }))
    : columns.map((_, index) => index);
  const visibleColumns = visibleIndexes.map((index) => columns[index]);
  return html`<section class="report-setup-section"><div class="report-section-title"><h3>Setup details</h3></div><div class="report-table-scroll" tabindex="0" aria-label="Setup details. Scroll horizontally for more columns."><table class="report-catch-table report-setup-table"><thead><tr>${joinHtml(visibleColumns.map((label) => html`<th scope="col"><span>${label}</span></th>`), "")}</tr></thead><tbody>${rows.length ? joinHtml(rowValues.map((row) => html`<tr>${joinHtml(visibleIndexes.map((index) => html`<td>${reportText(row[index])}</td>`), "")}</tr>`), "") : html`<tr><td colspan="${visibleColumns.length}" class="report-empty-row">No setup lines were logged for this trip.</td></tr>`}</tbody></table></div></section>`;
}

export function renderTripReport(trip) {
  const species = tripSpeciesSummary(trip);
  const landed = (trip.catches || []).reduce((total, item) => total + fishCount(item), 0);
  const lost = (trip.lostFish || []).length;
  const biggestFish = biggestCatchMeasurement(trip.catches);
  const hours = tripHours(trip);
  const fishPerHour = hours ? trimNumber(landed / hours) : "";
  const tripPhotos = trip.notePhotos || [];
  const catchPhotos = catchPhotosByPriority(trip);
  const hero = [...tripPhotos, ...catchPhotos].find((photo) => !isVideoMedia(photo) && previewImage(photo));
  const reportMeta = [formatDate(trip.date), trip.launchTime ? formatTimelineDisplayTime(trip.launchTime) : ""].filter(Boolean).join(" · ");
  const overview = [["Date", formatDate(trip.date)], ["Location", displayTitleText(trip.location)], ["Launch / area", displayTitleText(trip.launch)], ["Start time", trip.launchTime ? formatTimelineDisplayTime(trip.launchTime) : ""], ["End time", trip.linesPulledTime ? formatTimelineDisplayTime(trip.linesPulledTime) : ""], ["Duration", tripHours(trip) ? `${trimNumber(tripHours(trip))} hours` : ""], ["People", (trip.people || []).map((person) => displayTitleText(person.name)).filter(Boolean).join(", ")], ["Target species", displayTitleText(trip.targetSpecies)], ["Method", displayTitleText(trip.method)], ["Intent", displayTitleText(trip.intent)], ["Rating", reportRatingLabel(trip.tripRating)]];
  const conditions = [["Weather", displayTitleText(trip.weather)], ["Water temperature", displayStoredMeasurement(trip.waterTemp, "waterTemperature")], ["Water clarity", displayTitleText(trip.waterClarity)], ["Structure", displayTitleText(trip.structureType)], ["FOW range", displayStoredMeasurement(trip.structure, "depth")], ["Wind", trip.wind], ["Waves / chop", formatWaveHeightChopLine(trip, trip.weatherData)], ...reportAdditionalConditionRows(trip)];
  const mapRecords = catchMapRecordsForTrip(trip);
  return html`<article class="trip-report">
    <header class="report-header${hero ? " has-hero" : ""}">${hero ? html`<div class="report-header-media" aria-hidden="true">${mediaMarkup(hero, "report-hero-asset", { download: false })}</div>` : ""}<div class="report-header-copy"><p class="report-date">${reportMeta}${trip.location ? ` · ${displayTitleText(trip.location)}` : ""}</p><h3>${displayTitleText(trip.title || trip.location || "Trip report")}</h3><p class="report-subtitle">${[trip.targetSpecies, trip.method].filter(Boolean).map(displayTitleText).join(" · ") || "Fishing trip report"}</p><div class="report-actions"><button class="button primary" type="button" data-report-action="edit">Edit trip</button><button class="button secondary" type="button" data-report-action="share">Share trip</button></div></div></header>
    <section class="report-stat-strip">${joinHtml([["Landed", landed], ["Missed / lost", lost], ["Biggest fish", biggestFish ? displayStoredMeasurement(biggestFish.value, biggestFish.unit) : ""], ["Fish / hr", fishPerHour], ["Hours", trimNumber(hours)], ["Species", species.count]].map(([label, value]) => html`<div><span>${label}</span><strong>${String(value === "" || value === null || value === undefined ? "Not logged" : value)}</strong></div>`), "")}</section>
    <section class="report-notes"><h3>Trip notes</h3><p>${trip.notes || "Not logged"}</p></section>
    <div class="report-fact-grid report-overview-grid">${renderReportKeyValue("Trip details", overview)}${renderReportKeyValue("Conditions", conditions)}${hasFishHawk() ? html`<section class="report-fact-section report-probe-section"><h3>Probe temperature profile</h3>${renderProbeTemperatureProfileReport(trip.probeTemperatureProfile, trip.catches)}</section>` : ""}</div>
    ${isTrollingTripRecord(trip) ? html`<section class="report-spread"><div class="report-section-title"><h3>Trolling spread</h3></div>${renderTrollingSpread(trip)}</section>` : ""}
    ${renderReportSetupTable(trip)}
    ${renderReportTimeline(trip)}
    ${mapRecords.length ? html`<section class="report-map-section"><div class="report-section-title"><h3>Fish map</h3></div><div class="summary-map-tools"><label><span>Species</span><select id="tripSummaryMapFilter"></select></label></div><div id="tripSummaryMap" class="fish-map trip-summary-map"></div></section>` : ""}
    <section class="report-photos"><h3>Photos</h3>${summaryPhotoGrid(trip.notePhotos || [], "No trip photos", { compact: true, openable: true })}</section>
    <div id="catchDetailHost"></div>
  </article>`;
}

export function openTripReportPhotoLightbox(photo) {
  const source = originalMediaUrl(photo) || previewImage(photo);
  if (!source) return;
  document.querySelector(".report-photo-lightbox")?.remove();
  const lightboxHost = els.tripSummaryDialog?.open ? els.tripSummaryDialog : document.body;
  insertHtml(lightboxHost, "beforeend", html`<div class="report-photo-lightbox" role="dialog" aria-modal="true" aria-label="Trip photo"><button type="button" class="report-photo-lightbox-close" data-close-report-photo aria-label="Close photo">×</button><img src="${source}" alt="${displayPhotoTitle(photo)}"></div>`);
  document.body.classList.add("report-photo-lightbox-open");
  document.querySelector("[data-close-report-photo]")?.focus();
}

export function closeTripReportPhotoLightbox() {
  document.querySelector(".report-photo-lightbox")?.remove();
  document.body.classList.remove("report-photo-lightbox-open");
}

export function setup() {
  reportDefaultColumns = new Set(reportColumnDefinitions.map(([key]) => key));

  reportColumnPreferenceKey = `${storageKey}-trip-report-columns-v6`;
}
