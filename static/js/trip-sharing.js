let activeShareTrip = null;
let activeShareMode = "image";
let shareTextDirty = false;
let shareLastPreviewFrameSize = "";
let shareBestLurePhotoFlipped = false;

const SHARE_REPORT_WIDTH = 1200;

function shareEscape(value = "") {
  return escapeHtml(String(value));
}

function shareLaunch(trip) {
  return displayTitleText(trip.launch || "Launch not logged");
}

function sharePhotoUrl(media) {
  return originalMediaUrl(media) || previewImage(media);
}

function shareFow(value) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? String(Math.round(numeric)) : (value || "—");
}

function shareNumber(value) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function shareControl(id) {
  return document.querySelector(`#${id}`);
}

function shareColor(value, fallback) {
  return /^#[\da-f]{6}$/i.test(String(value || "")) ? value : fallback;
}

function shareAppearancePresets() {
  return (Array.isArray(state.settings?.shareAppearancePresets) ? state.settings.shareAppearancePresets : [])
    .map((preset) => ({
      id: String(preset?.id || "").trim(),
      name: String(preset?.name || "").trim(),
      theme: preset?.theme === "clean-light" ? "clean-light" : "deep-water",
      accent: shareColor(preset?.accent, "#42c98a"),
      background: shareColor(preset?.background, "#131b24"),
      textColor: shareColor(preset?.textColor, "#edf3f8"),
      cardBackground: shareColor(preset?.cardBackground, "#141f29")
    }))
    .filter((preset) => preset.id && preset.name);
}

function shareSelectedAppearancePreset() {
  const value = shareControl("shareTripTheme")?.value || "";
  if (!value.startsWith("preset:")) return null;
  return shareAppearancePresets().find((preset) => preset.id === value.slice(7)) || null;
}

function shareAppearanceTheme() {
  return shareSelectedAppearancePreset()?.theme || shareControl("shareTripTheme")?.value || "deep-water";
}

function shareRenderAppearanceOptions(selected = "deep-water") {
  const select = shareControl("shareTripTheme");
  if (!select) return;
  const presets = shareAppearancePresets();
  select.innerHTML = `<option value="deep-water">Dark mode</option><option value="clean-light">Light mode</option>${presets.length ? `<optgroup label="Saved appearances">${presets.map((preset) => `<option value="preset:${shareEscape(preset.id)}">${shareEscape(preset.name)}</option>`).join("")}</optgroup>` : ""}`;
  select.value = [...select.options].some((option) => option.value === selected) ? selected : "deep-water";
}

function shareApplyAppearance(value = shareControl("shareTripTheme")?.value || "deep-water") {
  const preset = value.startsWith("preset:") ? shareAppearancePresets().find((item) => item.id === value.slice(7)) : null;
  const lightTheme = (preset?.theme || value) === "clean-light";
  shareControl("shareTripAccent").value = preset?.accent || "#42c98a";
  shareControl("shareTripBackground").value = preset?.background || (lightTheme ? "#f8fafb" : "#131b24");
  shareControl("shareTripTextColor").value = preset?.textColor || (lightTheme ? "#17212b" : "#edf3f8");
  shareControl("shareTripCardBackground").value = preset?.cardBackground || (lightTheme ? "#ffffff" : "#141f29");
}

function shareChecked(id) {
  return Boolean(shareControl(id)?.checked);
}

function shareFishPhotoOptions(trip) {
  const tripPhotos = (trip.notePhotos || []).map((photo, index) => ({
    label: photo.caption?.trim() || `Trip photo ${index + 1}`,
    media: photo,
    kind: "trip"
  }));
  const catchPhotos = (trip.catches || []).flatMap((fish, fishIndex) => (fish.photos || []).map((photo, index) => ({
    label: photo.caption?.trim() || `${fish.species || "Catch"} ${fishIndex + 1} photo ${index + 1}`,
    media: photo,
    kind: "catch",
    fishIndex,
    weight: shareNumber(fish.weight) || 0,
    length: shareNumber(fish.length) || 0
  })));
  return [...catchPhotos, ...tripPhotos];
}

function defaultSharePhotoIndex(trip) {
  const options = shareFishPhotoOptions(trip);
  const biggest = options
    .filter((item) => item.kind === "catch")
    .sort((a, b) => b.weight - a.weight || b.length - a.length || a.fishIndex - b.fishIndex)[0];
  if (biggest) return options.indexOf(biggest);
  const firstCatch = options.find((item) => item.kind === "catch");
  if (firstCatch) return options.indexOf(firstCatch);
  const firstTrip = options.find((item) => item.kind === "trip");
  return firstTrip ? options.indexOf(firstTrip) : "";
}

function shareSelectedPhoto() {
  const selected = shareControl("shareTripPhoto")?.value ?? "";
  if (selected === "" || !activeShareTrip) return null;
  return shareFishPhotoOptions(activeShareTrip)[Number(selected)]?.media || null;
}

function shareEventRecords(trip, includeMisses = shareChecked("shareIncludeMisses")) {
  const landed = (trip.catches || []).map((item, index) => ({
    ...item,
    eventType: item.released ? "Released" : "Landed",
    landed: true,
    number: index + 1
  }));
  const misses = includeMisses
    ? (trip.lostFish || []).map((item, index) => ({
        ...item,
        eventType: /\blost\b/i.test(item.notes || "") ? "Lost" : "Missed",
        landed: false,
        number: landed.length + index + 1
      }))
    : [];
  return [...landed, ...misses].sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")) || a.number - b.number);
}

function shareSpecies(trip) {
  return Object.entries((trip.catches || []).reduce((counts, fish) => {
    const name = displayTitleText(fish.species || "Unspecified");
    counts[name] = (counts[name] || 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function shareBiggestFish(trip) {
  return [...(trip.catches || [])].sort((a, b) => (
    (shareNumber(b.weight) || 0) - (shareNumber(a.weight) || 0)
    || (shareNumber(b.length) || 0) - (shareNumber(a.length) || 0)
  ))[0] || null;
}

function shareRankedValues(trip, getter) {
  const scores = new Map();
  const add = (fish, landed) => {
    const value = getter(fish);
    if (!value) return;
    const key = String(value).trim();
    if (!key) return;
    const current = scores.get(key) || { value: key, landed: 0, encounters: 0, score: 0 };
    current.landed += landed ? 1 : 0;
    current.encounters += 1;
    current.score += landed ? 2 : 1;
    scores.set(key, current);
  };
  (trip.catches || []).forEach((fish) => add(fish, true));
  (trip.lostFish || []).forEach((fish) => add(fish, false));
  const ranked = [...scores.values()].sort((a, b) => (
    b.landed - a.landed || b.encounters - a.encounters || b.score - a.score || a.value.localeCompare(b.value)
  ));
  if (!ranked.length) return [];
  const best = ranked[0];
  return ranked.filter((item) => item.landed === best.landed && item.encounters === best.encounters && item.score === best.score);
}

function shareCatchLureName(trip, fish) {
  const setupLineId = String(fish?.setupLineId || "").split("::")[0];
  const setup = (trip.gearUsed || []).find((item) => item.id === setupLineId);
  return lureName(fish?.lureId)
    || lureName(setup?.lureId)
    || String(fish?.lureName || fish?.lure || "").trim();
}

function shareCatchFlasherName(trip, fish) {
  const setupLineId = String(fish?.setupLineId || "").split("::")[0];
  const setup = (trip.gearUsed || []).find((item) => item.id === setupLineId);
  return flasherName(fish?.flasherId)
    || flasherName(setup?.flasherId)
    || String(fish?.flasherName || fish?.flasher || "").trim();
}

function shareBestLures(trip) {
  const counts = new Map();
  (trip.catches || []).forEach((fish) => {
    const lure = shareCatchLureName(trip, fish);
    if (!lure) return;
    counts.set(lure, (counts.get(lure) || 0) + 1);
  });
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!ranked.length) return [];
  const bestCount = ranked[0][1];
  return ranked.filter(([, count]) => count === bestCount).map(([name]) => name);
}

function shareBestFlashers(trip) {
  const counts = new Map();
  (trip.catches || []).forEach((fish) => {
    const flasher = shareCatchFlasherName(trip, fish);
    if (!flasher) return;
    counts.set(flasher, (counts.get(flasher) || 0) + 1);
  });
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!ranked.length) return [];
  const bestCount = ranked[0][1];
  return ranked.filter(([, count]) => count === bestCount).map(([name]) => name);
}

function shareBestMethods(trip) {
  return shareRankedValues(trip, (fish) => fish.presentation || "").map((item) => item.value);
}

function shareLocationText(trip) {
  const pieces = [shareLaunch(trip)];
  if (trip.location) pieces.push(displayTitleText(trip.location));
  return pieces.filter(Boolean).join(" · ");
}

function shareWeatherParts(trip) {
  const weather = trip.weatherData?.tripWindow || {};
  return [
    trip.weather,
    weather.temperatureC != null ? `${Math.round(weather.temperatureC)}°C air` : "",
    trip.wind || (weather.windSpeedMph != null ? `${Math.round(weather.windSpeedMph)} mph wind` : ""),
    trip.waveHeight ? `Waves ${displayStoredMeasurement(trip.waveHeight, "waveHeight")}` : "",
    trip.waterTemp ? `Water ${displayStoredMeasurement(trip.waterTemp, "waterTemperature")}` : "",
    trip.waterClarity ? `Clarity ${trip.waterClarity}` : ""
  ].filter(Boolean);
}

function shareFormatSize(fish) {
  const weight = fish?.weight ? displayStoredMeasurement(fish.weight, "fishWeight") : "";
  const length = fish?.length ? displayStoredMeasurement(fish.length, "fishLength") : "";
  return [weight, length].filter(Boolean).join(" · ");
}

function shareDepthText(fish) {
  const depth = fish.depthDown || fish.estimatedDepth;
  if (depth) return `${depth} down`;
  if (fish.lineOut) return `${fish.lineOut} back`;
  if (fish.leadcoreColors) return `${fish.leadcoreColors} colors`;
  return "";
}

function shareTextMeasurement(value, key) {
  if (value === null || value === undefined || value === "") return "";
  const fromUnit = unitPreference(key);
  const toUnit = unitPreference(key);
  const converted = convertedMeasurementText(value, fromUnit, toUnit);
  return `${converted} ${toUnit}`.replace(new RegExp(`\\s+${toUnit}\\s+${toUnit}$`, "i"), ` ${toUnit}`);
}

function shareTextFishSize(fish) {
  return [
    fish.weight ? shareTextMeasurement(fish.weight, "fishWeight") : "",
    fish.length ? shareTextMeasurement(fish.length, "fishLength") : ""
  ].filter(Boolean).join(" · ");
}

function shareTextDepth(fish) {
  const depth = fish.depthDown || fish.estimatedDepth;
  if (depth) return `${shareTextMeasurement(depth, "depth")} down`;
  if (fish.lineOut) return `${shareTextMeasurement(fish.lineOut, "depth")} back`;
  if (fish.leadcoreColors) return `${fish.leadcoreColors} colors`;
  return "";
}

function shareLinesSetTime(trip) {
  return trip.linesSetTime
    || trip.startTime
    || (trip.gearUsed || []).map((item) => item.startTime).filter(Boolean).sort()[0]
    || "";
}

function shareLinesPulledTime(trip) {
  return trip.linesPulledTime || trip.endTime || "";
}

function shareOverviewItems(trip) {
  const directions = [...new Set((trip.catches || []).map((fish) => fish.direction).filter(Boolean))].join(", ");
  const fows = (trip.catches || []).map((fish) => shareNumber(fish.fowCaught || fish.waterDepth)).filter((value) => value != null);
  const items = [
    ["Direction", directions],
    ["Water depth", fows.length ? `${Math.round(Math.min(...fows))}–${Math.round(Math.max(...fows))}` : ""]
  ];
  return items.filter(([, value]) => value);
}

function shareStatTime(value) {
  const formatted = formatTimelineDisplayTime(value);
  return timeFormatPreference() === "12" ? formatted.replace(/\s(?:AM|PM)$/, "") : formatted;
}

function shareMetricData(trip) {
  const landed = (trip.catches || []).length;
  const misses = (trip.lostFish || []).length;
  const encounters = landed + misses;
  const hours = Number(tripHours(trip)) || 0;
  return {
    landed,
    misses,
    encounters,
    hours
  };
}

function shareConditionItems(trip) {
  const weather = trip.weatherData?.tripWindow || {};
  const items = [
    ["Weather", trip.weather],
    ["Wind", trip.wind || (weather.windSpeedMph != null ? `${Math.round(weather.windSpeedMph)} mph` : "")],
    ["Water temp", trip.waterTemp ? displayStoredMeasurement(trip.waterTemp, "waterTemperature") : ""],
    ["Waves", trip.waveHeight ? displayStoredMeasurement(trip.waveHeight, "waveHeight") : ""],
    ["Air temp", weather.temperatureC != null ? `${Math.round(weather.temperatureC)}°C` : ""],
    ["Clarity", trip.waterClarity]
  ];
  return items.filter(([, value]) => value);
}

function shareTimelineHtml(trip) {
  if (!shareChecked("shareShowTimeline")) return "";
  const events = shareEventRecords(trip);
  const rows = events.map((fish, index) => {
    const lure = shareCatchLureName(trip, fish);
    const flasher = shareCatchFlasherName(trip, fish);
    return `<tr class="status-${fish.eventType.toLowerCase()}">
      <td>${index + 1}</td>
      <td>${shareEscape(fish.time ? formatTimelineDisplayTime(fish.time) : "—")}</td>
      <td class="report-timeline-result">${shareEscape(fish.eventType)}</td>
      <td>${shareEscape(fish.species || fish.possibleSpecies || "Fish")}</td>
      <td>${shareEscape(shareFormatSize(fish) || "—")}</td>
      <td>${shareEscape(shareFow(fish.fowCaught || fish.waterDepth) || "—")}</td>
      <td>${shareEscape(fish.presentation || "—")}</td>
      <td>${shareEscape(shareDepthText(fish) || "—")}</td>
      <td>${shareEscape(fish.speed ? displayStoredMeasurement(fish.speed, "speed") : "—")}</td>
      <td>${shareEscape(lure || "—")}</td>
      <td>${shareEscape(flasher || "—")}</td>
    </tr>`;
  }).join("");
  return `<section class="report-timeline report-timeline-grid"><div class="report-section-heading"><h4>Trip Timeline</h4></div><table><colgroup><col class="timeline-number" /><col class="timeline-time" /><col class="timeline-result" /><col class="timeline-species" /><col class="timeline-size" /><col class="timeline-fow" /><col class="timeline-method" /><col class="timeline-depth" /><col class="timeline-speed" /><col class="timeline-lure" /><col class="timeline-flasher" /></colgroup><thead><tr><th>#</th><th>Time</th><th>Result</th><th>Species</th><th>Size</th><th>Water depth</th><th>Method</th><th>Depth</th><th>Speed</th><th>Lure</th><th>Flasher</th></tr></thead><tbody>${rows || '<tr><td colspan="11" class="report-timeline-empty">No events recorded</td></tr>'}</tbody></table></section>`;
}

function shareReportHtml(trip) {
  const theme = shareAppearanceTheme();
  const headline = shareControl("shareTripHeadline")?.value.trim() || `${shareLaunch(trip)} fishing report`;
  const subtitle = shareControl("shareTripSubtitle")?.value.trim() || "";
  const metrics = shareMetricData(trip);
  const biggest = shareBiggestFish(trip);
  const bestLures = shareBestLures(trip);
  const bestFlashers = shareBestFlashers(trip);
  const bestMethods = shareBestMethods(trip);
  const bestLurePhoto = (state.lures || []).find((lure) => bestLures.includes(lure.name) && sharePhotoUrl(lure));
  const bestFlasherPhoto = (state.flashers || []).find((flasher) => bestFlashers.includes(flasher.name) && sharePhotoUrl(flasher));
  const showBestLure = shareChecked("shareShowBestLure") && bestLures.length;
  const showBestFlasher = shareChecked("shareShowBestFlasher") && bestFlashers.length;
  const selectedPhoto = shareSelectedPhoto();
  const heroUrl = sharePhotoUrl(selectedPhoto);
  const heroFallback = selectedPhoto ? previewImage(selectedPhoto) : "";
  const hero = heroUrl
    ? `<figure class="report-hero"><img src="${shareEscape(heroUrl)}" data-fallback="${shareEscape(heroFallback)}" alt="Selected trip photo" /></figure>`
    : "";
  const overview = shareOverviewItems(trip);
  const conditionItems = shareChecked("shareShowConditions") ? shareConditionItems(trip) : [];
  const showHighlights = shareChecked("shareShowHighlights");
  const species = shareSpecies(trip);
  const biggestSize = biggest ? shareFormatSize(biggest) || (biggest.shaker ? "Shaker" : "Size not logged") : "";
  const biggestLabel = biggest ? [biggestSize, biggest.species || "Fish"].filter(Boolean).join(" ") : "No landed fish";
  const fishPerHour = metrics.hours ? trimNumber(metrics.landed / metrics.hours) : "Not logged";
  const launchHeaderTime = trip.launchTime ? shareStatTime(trip.launchTime) : "";
  const biggestWeight = biggest?.weight ? displayStoredMeasurement(biggest.weight, "fishWeight") : "Not logged";
  const fowRange = overview.find(([label]) => label === "Water depth")?.[1] || "Not logged";
  const headerMeta = [
    formatDate(trip.date),
    launchHeaderTime,
    shareLocationText(trip)
  ].filter(Boolean).join(" · ");
  const topMetrics = [
    ["shareStatLanded", "Landed", metrics.landed],
    ["shareStatMissed", "Lost", metrics.misses],
    ["shareStatBiggest", "Biggest fish", biggestWeight],
    ["shareStatRate", "Fish / hr", fishPerHour],
    ["shareStatHours", "Hours", trimNumber(metrics.hours)],
    ["shareStatFow", "Water depth", fowRange]
  ].filter(([controlId]) => shareChecked(controlId));
  const highlightItems = [
    ["Biggest fish", biggestLabel],
    ["Best presentation", bestMethods.join(" / ")]
  ].filter(([, value]) => value);
  const notesText = shareChecked("shareShowNotes") ? displaySentenceText(trip.notes || "") : "";
  const notes = notesText ? `<section class="report-notes"><h4>Trip Notes</h4><p>${shareEscape(notesText)}</p></section>` : "";
  const branding = `<footer>Fishing Logbook</footer>`;
  return `<article class="share-report layout-complete theme-${theme}" data-dynamic="true" style="--report-accent:${shareEscape(shareControl("shareTripAccent")?.value || "#42c98a")};--report-bg:${shareEscape(shareControl("shareTripBackground")?.value || "#131b24")};--report-text:${shareEscape(shareControl("shareTripTextColor")?.value || "#edf3f8")};--report-surface-2:${shareEscape(shareControl("shareTripCardBackground")?.value || "#141f29")};--report-surface:color-mix(in srgb, var(--report-surface-2) 97%, #fff)">
    <header class="report-header">
      <div class="report-title"><p class="report-meta">${shareEscape(headerMeta)}</p><h3>${shareEscape(headline)}</h3>${subtitle ? `<p class="report-subtitle">${shareEscape(subtitle)}</p>` : ""}</div>
      ${hero}
    </header>
    ${topMetrics.length ? `<section class="report-metrics" style="--report-metric-count:${topMetrics.length}">${topMetrics.map(([, label, value]) => `<div${label === "Start / end" ? " class=\"report-metric-time\"" : ""}><strong>${shareEscape(String(value))}</strong><span>${shareEscape(label)}</span></div>`).join("")}</section>` : ""}
    <div class="report-body">${notes}</div>
    ${shareTimelineHtml(trip)}
    ${(conditionItems.length || showHighlights) ? `<section class="report-highlights${conditionItems.length && showHighlights ? "" : " is-single"}">
      ${conditionItems.length ? `<section class="report-highlight-group report-conditions"><h4>Conditions</h4><dl>${conditionItems.map(([label, value]) => `<div><dt>${shareEscape(label)}</dt><dd>${shareEscape(value || "Not logged")}</dd></div>`).join("")}</dl></section>` : ""}
      ${showHighlights ? `<section class="report-highlight-group"><h4>Trip Highlights</h4><dl>${highlightItems.map(([label, value]) => `<div><dt>${shareEscape(label)}</dt><dd>${shareEscape(value || "Not logged")}</dd></div>`).join("") || "<div><dd>No highlights logged</dd></div>"}</dl>${species.length ? `<table class="report-species-table"><thead><tr><th>Species</th><th>Count</th></tr></thead><tbody>${species.map(([name, count]) => `<tr><td>${shareEscape(name)}</td><td>${shareEscape(String(count))}</td></tr>`).join("")}</tbody></table>` : ""}</section>` : ""}
    </section>` : ""}
    ${(showBestLure || showBestFlasher) ? `<section class="report-best-gear-row">
      ${showBestLure ? `<section class="report-best-gear-section"><div class="report-best-gear-copy"><h4>Best lure</h4><p>${shareEscape(bestLures.join(" / "))}</p></div>${bestLurePhoto ? `<figure class="report-best-lure-photo" style="--best-lure-rotation:${shareBestLurePhotoFlipped ? "-90deg" : "90deg"}"><img src="${shareEscape(sharePhotoUrl(bestLurePhoto))}" alt="${shareEscape(bestLurePhoto.name)}" /></figure>` : ""}</section>` : ""}
      ${showBestFlasher ? `<section class="report-best-gear-section"><div class="report-best-gear-copy"><h4>Best flasher</h4><p>${shareEscape(bestFlashers.join(" / "))}</p></div>${bestFlasherPhoto ? `<figure class="report-best-lure-photo"><img src="${shareEscape(sharePhotoUrl(bestFlasherPhoto))}" alt="${shareEscape(bestFlasherPhoto.name)}" /></figure>` : ""}</section>` : ""}
    </section>` : ""}
    ${branding}
  </article>`;
}

function shareFormatEventSentence(trip, fish, index) {
  const details = [];
  if (shareChecked("shareTextTimelineTime") && fish.time) details.push(formatTimelineDisplayTime(fish.time));
  if (shareChecked("shareTextTimelineWaterDepth") && (fish.fowCaught || fish.waterDepth)) {
    details.push(`${shareTextMeasurement(shareFow(fish.fowCaught || fish.waterDepth), "depth")} water depth`);
  }
  if (shareChecked("shareTextTimelineMethod") && fish.presentation) details.push(displayTitleText(fish.presentation));
  const depth = shareTextDepth(fish);
  if (shareChecked("shareTextTimelineDepth") && depth) details.push(depth);
  if (shareChecked("shareTextTimelineSpeed") && fish.speed) details.push(displayStoredMeasurement(fish.speed, "speed"));
  const lure = shareCatchLureName(trip, fish);
  if (shareChecked("shareTextTimelineLure") && lure) details.push(lure);
  const flasher = shareCatchFlasherName(trip, fish);
  if (shareChecked("shareTextTimelineFlasher") && flasher) details.push(flasher);

  const result = [];
  if (fish.landed) {
    if (shareChecked("shareTextTimelineSpecies")) result.push(fish.shaker ? "Shaker" : displayTitleText(fish.species || "Fish"));
    if (shareChecked("shareTextTimelineSize") && shareTextFishSize(fish)) result.push(shareTextFishSize(fish));
    if (shareChecked("shareTextTimelineResult")) result.push(fish.released ? "released" : "landed");
  } else {
    if (shareChecked("shareTextTimelineResult")) result.push(fish.eventType);
    if (shareChecked("shareTextTimelineSpecies") && fish.possibleSpecies) result.push(`possible ${displayTitleText(fish.possibleSpecies)}`);
  }

  const number = shareChecked("shareTextTimelineNumber") ? `Fish ${index + 1}` : "";
  const lead = number
    ? `${number}${details.length ? ` - ${details.join(", ")}.` : " -"}`
    : (details.length ? `${details.join(", ")}.` : "");
  const outcome = result.length ? `${result.join(", ")}.` : "";
  const notes = shareChecked("shareTextTimelineNotes") && fish.notes ? displaySentenceText(fish.notes) : "";
  return [lead, outcome, notes].filter(Boolean).join(" ").replace(/\.\./g, ".");
}

function shareGroupedEventParagraphs(trip) {
  return shareEventRecords(trip, shareChecked("shareTextIncludeMisses"))
    .map((event, index) => shareFormatEventSentence(trip, event, index))
    .filter(Boolean);
}

function shareTextReport(trip) {
  const headline = shareControl("shareTripHeadline")?.value.trim() || `${shareLaunch(trip)} fishing report`;
  const subtitle = shareControl("shareTripSubtitle")?.value.trim();
  const metrics = shareMetricData(trip);
  const linesSet = shareLinesSetTime(trip);
  const location = shareLocationText(trip);
  const intro = [`${headline} - ${formatDate(trip.date)}.`, subtitle].filter(Boolean).join("\n");
  const timing = [
    `Out of ${location}${trip.launchTime ? ` at ${formatTimelineDisplayTime(trip.launchTime)}` : ""}`,
    linesSet ? `lines set by ${formatTimelineDisplayTime(linesSet)}` : "",
    shareLinesPulledTime(trip) ? `lines pulled at ${formatTimelineDisplayTime(shareLinesPulledTime(trip))}` : ""
  ].filter(Boolean).join(", ");
  const timingSentence = timing ? `${timing.charAt(0).toUpperCase()}${timing.slice(1)}.` : "";
  const score = `Finished ${metrics.landed} for ${metrics.encounters}${metrics.hours ? ` over ${trimNumber(metrics.hours)} hours` : ""}.`;
  const conditions = shareChecked("shareTextShowConditions") ? shareWeatherParts(trip).join(" · ") : "";
  const notes = shareChecked("shareTextShowNotes") ? displaySentenceText(trip.notes || "") : "";
  const highlights = shareChecked("shareTextShowHighlights") ? [
    shareBestLures(trip).length ? `Best lure: ${shareBestLures(trip).join(" / ")}.` : "",
    shareBestMethods(trip).length ? `Best method: ${shareBestMethods(trip).join(" / ")}.` : ""
  ].filter(Boolean).join(" ") : "";
  const eventParagraphs = shareChecked("shareTextShowTimeline") ? shareGroupedEventParagraphs(trip) : [];

  return [
    intro,
    timingSentence,
    score,
    notes,
    conditions ? `Conditions: ${conditions}.` : "",
    highlights,
    eventParagraphs.join("\n\n")
  ].filter(Boolean).join("\n\n");
}

function sharePreview() {
  if (!activeShareTrip) return;
  const frame = shareControl("shareTripPreviewFrame");
  if (frame) {
    frame.classList.add("is-dynamic");
  }
  shareControl("shareTripPreview").innerHTML = shareReportHtml(activeShareTrip);
  shareFitReport();
  shareValidatePreviewImages();
  document.fonts?.ready.then(shareFitReport);
  if (!shareTextDirty) shareControl("shareTripTextEditor").value = shareTextReport(activeShareTrip);
}

function shareFitReport() {
  const report = shareControl("shareTripPreview")?.querySelector(".share-report");
  if (!report) return;
  const frame = shareControl("shareTripPreviewFrame");
  const dynamic = report.dataset.dynamic === "true";
  frame?.classList.toggle("is-dynamic", dynamic);
}

function shareValidatePreviewImages() {
  const hero = shareControl("shareTripPreview")?.querySelector(".report-hero img");
  if (hero) {
    const applyNaturalAspectRatio = () => {
      if (!hero.naturalWidth || !hero.naturalHeight) return;
      const figure = hero.closest(".report-hero");
      figure?.style.setProperty("--hero-ratio", `${hero.naturalWidth} / ${hero.naturalHeight}`);
      figure?.classList.toggle("is-portrait", hero.naturalHeight > hero.naturalWidth);
      figure?.classList.toggle("is-landscape", hero.naturalWidth > hero.naturalHeight);
      requestAnimationFrame(shareFitReport);
    };
    const handleFailure = () => {
      if (hero.dataset.fallback && hero.dataset.fallbackTried !== "true") {
        hero.dataset.fallbackTried = "true";
        hero.src = hero.dataset.fallback;
        return;
      }
      hero.closest(".report-hero")?.remove();
      requestAnimationFrame(shareFitReport);
    };
    hero.addEventListener("load", applyNaturalAspectRatio);
    hero.addEventListener("error", handleFailure);
    if (hero.complete && hero.naturalWidth) applyNaturalAspectRatio();
    else if (hero.complete) handleFailure();
  }
}

function setShareMode(mode) {
  activeShareMode = mode;
  document.querySelectorAll("[data-share-mode]").forEach((button) => {
    const selected = button.dataset.shareMode === mode;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll(".share-image-settings, .share-image-action").forEach((element) => {
    element.hidden = mode !== "image";
  });
  document.querySelectorAll(".share-text-settings, .share-text-action").forEach((element) => {
    element.hidden = mode !== "text";
  });
  shareControl("shareTripPreviewFrame").hidden = mode !== "image";
  shareControl("shareTripTextEditor").hidden = mode !== "text";
  shareControl("shareTripCopyImage").hidden = mode !== "image" || !(window.ClipboardItem && navigator.clipboard?.write);
  shareControl("shareTripCopyText").hidden = mode !== "text" || !navigator.clipboard?.writeText;
  shareSetStatus("");
  sharePreview();
}

function openTripShareStudio(trip) {
  activeShareTrip = trip;
  shareTextDirty = false;
  const options = shareFishPhotoOptions(trip);
  shareControl("shareTripPhoto").innerHTML = `<option value="">No photo</option>${options.map((item, index) => `<option value="${index}">${shareEscape(item.label)}</option>`).join("")}`;
  shareControl("shareTripPhoto").value = String(defaultSharePhotoIndex(trip));
  shareRenderAppearanceOptions();
  shareControl("shareTripTheme").value = "deep-water";
  shareControl("shareTripHeadline").value = `${shareLaunch(trip)} fishing report`;
  shareControl("shareTripSubtitle").value = "";
  shareApplyAppearance("deep-water");
  shareControl("shareTripAppearanceName").value = "";
  shareBestLurePhotoFlipped = false;
  [
    ["shareStatLanded", true],
    ["shareStatMissed", true],
    ["shareStatBiggest", true],
    ["shareStatRate", true],
    ["shareStatHours", true],
    ["shareStatFow", true],
    ["shareShowNotes", true],
    ["shareShowConditions", true],
    ["shareShowHighlights", true],
    ["shareShowTimeline", true],
    ["shareIncludeMisses", true],
    ["shareShowBestLure", true],
    ["shareShowBestFlasher", true],
    ["shareTextShowNotes", true],
    ["shareTextShowConditions", true],
    ["shareTextShowHighlights", true],
    ["shareTextShowTimeline", true],
    ["shareTextIncludeMisses", true],
    ["shareTextTimelineNumber", true],
    ["shareTextTimelineTime", true],
    ["shareTextTimelineResult", true],
    ["shareTextTimelineSpecies", true],
    ["shareTextTimelineSize", true],
    ["shareTextTimelineWaterDepth", true],
    ["shareTextTimelineMethod", true],
    ["shareTextTimelineDepth", true],
    ["shareTextTimelineSpeed", true],
    ["shareTextTimelineLure", true],
    ["shareTextTimelineFlasher", true],
    ["shareTextTimelineNotes", true]
  ].forEach(([id, checked]) => {
    shareControl(id).checked = checked;
  });
  setShareMode("image");
  els.shareTripDialog.showModal();
}

function shareSetStatus(message, type = "") {
  const status = shareControl("shareTripStatus");
  if (!status) return;
  status.textContent = message;
  status.dataset.type = type;
}

async function shareWithStatus(button, action, successMessage) {
  const original = button.textContent;
  button.disabled = true;
  button.classList.add("is-loading");
  shareSetStatus("Preparing report…");
  try {
    await action();
    shareSetStatus(successMessage, "success");
  } catch (error) {
    console.error("Share Trip export failed", error);
    shareSetStatus(error?.message || "Export failed. Please try again.", "error");
  } finally {
    button.disabled = false;
    button.classList.remove("is-loading");
    button.textContent = original;
  }
}

async function shareReportCanvas() {
  const report = shareControl("shareTripPreview")?.querySelector(".share-report");
  if (!report) throw new Error("The report preview is unavailable.");
  if (!window.html2canvas) throw new Error("The image exporter is still loading.");
  await document.fonts?.ready;
  await Promise.all([...report.querySelectorAll("img")].map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }));
  shareFitReport();
  const scale = SHARE_REPORT_WIDTH / report.getBoundingClientRect().width;
  const targetHeight = Math.ceil(report.getBoundingClientRect().height * scale);
  const canvas = await window.html2canvas(report, {
    backgroundColor: null,
    scale,
    useCORS: true,
    allowTaint: false,
    logging: false,
    width: report.getBoundingClientRect().width,
    height: report.getBoundingClientRect().height
  });
  if (canvas.width === SHARE_REPORT_WIDTH && canvas.height === targetHeight) return canvas;
  const exact = document.createElement("canvas");
  exact.width = SHARE_REPORT_WIDTH;
  exact.height = targetHeight;
  exact.getContext("2d").drawImage(canvas, 0, 0, SHARE_REPORT_WIDTH, targetHeight);
  return exact;
}

function shareDownloadBlob(blob, extension) {
  const link = document.createElement("a");
  link.download = `trip-report-${activeShareTrip?.date || "share"}.${extension}`;
  link.href = URL.createObjectURL(blob);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function shareDownloadImage(format) {
  const canvas = await shareReportCanvas();
  const mime = format === "jpg" ? "image/jpeg" : "image/png";
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, format === "jpg" ? 0.93 : 1));
  if (!blob) throw new Error("The report image could not be created.");
  shareDownloadBlob(blob, format);
}

async function shareCopyImage() {
  if (!(window.ClipboardItem && navigator.clipboard?.write)) throw new Error("Copy Image is not supported in this browser.");
  const canvas = await shareReportCanvas();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

async function shareCopyText() {
  if (!navigator.clipboard?.writeText) throw new Error("Copy Text is not supported in this browser.");
  const editor = shareControl("shareTripTextEditor");
  await navigator.clipboard.writeText(editor.value);
}

function shareDownloadText() {
  const blob = new Blob([shareControl("shareTripTextEditor").value], { type: "text/plain;charset=utf-8" });
  shareDownloadBlob(blob, "txt");
}

async function saveShareAppearancePreset() {
  const name = shareControl("shareTripAppearanceName")?.value.trim();
  if (!name) {
    shareSetStatus("Name the appearance before saving.", "error");
    return;
  }
  const existing = shareAppearancePresets();
  const match = existing.find((preset) => preset.name.toLowerCase() === name.toLowerCase());
  const id = match?.id || `appearance-${Date.now()}`;
  const preset = {
    id,
    name,
    theme: shareAppearanceTheme() === "clean-light" ? "clean-light" : "deep-water",
    accent: shareColor(shareControl("shareTripAccent")?.value, "#42c98a"),
    background: shareColor(shareControl("shareTripBackground")?.value, "#131b24"),
    textColor: shareColor(shareControl("shareTripTextColor")?.value, "#edf3f8"),
    cardBackground: shareColor(shareControl("shareTripCardBackground")?.value, "#141f29")
  };
  state.settings = {
    ...(state.settings || {}),
    shareAppearancePresets: [...existing.filter((item) => item.id !== id), preset]
  };
  try {
    await saveState();
    shareRenderAppearanceOptions(`preset:${id}`);
    shareControl("shareTripAppearanceName").value = "";
    shareSetStatus("Appearance saved.", "success");
    sharePreview();
  } catch (error) {
    shareSetStatus("Appearance could not be saved.", "error");
  }
}

shareControl("shareTripForm")?.addEventListener("input", () => {
  shareTextDirty = false;
  sharePreview();
});
shareControl("shareTripForm")?.addEventListener("change", () => {
  shareTextDirty = false;
  sharePreview();
});
shareControl("shareTripTheme")?.addEventListener("change", (event) => {
  shareApplyAppearance(event.currentTarget.value);
});
shareControl("shareTripTextEditor")?.addEventListener("input", () => {
  shareTextDirty = true;
});
document.querySelectorAll("[data-share-mode]").forEach((button) => button.addEventListener("click", () => setShareMode(button.dataset.shareMode)));
shareControl("shareTripDownloadPng")?.addEventListener("click", (event) => shareWithStatus(event.currentTarget, () => shareDownloadImage("png"), "PNG downloaded"));
shareControl("shareTripDownloadJpg")?.addEventListener("click", (event) => shareWithStatus(event.currentTarget, () => shareDownloadImage("jpg"), "JPG downloaded"));
shareControl("shareTripCopyImage")?.addEventListener("click", (event) => shareWithStatus(event.currentTarget, shareCopyImage, "Image copied"));
shareControl("shareTripCopyText")?.addEventListener("click", (event) => shareWithStatus(event.currentTarget, shareCopyText, "Text copied"));
shareControl("shareTripDownloadText")?.addEventListener("click", (event) => shareWithStatus(event.currentTarget, async () => shareDownloadText(), "Text downloaded"));
shareControl("shareSaveAppearance")?.addEventListener("click", saveShareAppearancePreset);
shareControl("shareFlipBestLurePhoto")?.addEventListener("click", () => {
  shareBestLurePhotoFlipped = !shareBestLurePhotoFlipped;
  sharePreview();
});

if (window.ResizeObserver && shareControl("shareTripPreviewFrame")) {
  const sharePreviewResizeObserver = new ResizeObserver(([entry]) => {
    const width = Math.round(entry?.contentRect.width || 0);
    const height = Math.round(entry?.contentRect.height || 0);
    const sizeKey = `${width}x${height}`;
    if (!width || !height || sizeKey === shareLastPreviewFrameSize) return;
    shareLastPreviewFrameSize = sizeKey;
    if (activeShareTrip && activeShareMode === "image") window.requestAnimationFrame(sharePreview);
  });
  sharePreviewResizeObserver.observe(shareControl("shareTripPreviewFrame"));
}
