let activeShareTrip = null;
let activeShareMode = "image";
let shareTextDirty = false;
let shareLastPreviewFrameSize = "";

const shareLayoutPresets = {
  complete: { width: 1200, minHeight: 1800, dynamic: true },
  timeline: { width: 1200, minHeight: 1200, dynamic: true }
};

function shareLayoutPreset(layout = shareControl("shareTripLayout")?.value || "complete") {
  return shareLayoutPresets[layout] || shareLayoutPresets.complete;
}

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

function shareEventRecords(trip) {
  const landed = (trip.catches || []).map((item, index) => ({
    ...item,
    eventType: item.released ? "Released" : "Landed",
    landed: true,
    number: index + 1
  }));
  const misses = shareChecked("shareIncludeMisses")
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

function shareLureText(fish) {
  if (!shareChecked("shareShowLures")) return "";
  const lure = lureName(fish.lureId);
  const flasher = flasherName(fish.flasherId);
  const cheater = lureName(fish.cheaterLureId);
  return [lure, flasher, cheater ? `cheater ${cheater}` : ""].filter(Boolean).join(" + ");
}

function shareBestLures(trip) {
  return shareRankedValues(trip, shareLureText).map((item) => item.value);
}

function shareBestMethods(trip) {
  return shareRankedValues(trip, (fish) => fish.presentation || "").map((item) => item.value);
}

function shareLocationText(trip) {
  const pieces = [shareLaunch(trip)];
  if (shareChecked("shareShowLocation") && trip.location) pieces.push(displayTitleText(trip.location));
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
  const weight = fish?.weight ? `${trimNumber(fish.weight)} lb` : "";
  const length = fish?.length ? `${trimNumber(fish.length)} in` : "";
  return [weight, length].filter(Boolean).join(" · ");
}

function shareDepthText(fish) {
  const depth = fish.depthDown || fish.estimatedDepth;
  if (depth) return `${depth} down`;
  if (fish.lineOut) return `${fish.lineOut} back`;
  if (fish.leadcoreColors) return `${fish.leadcoreColors} colors`;
  return "";
}

function shareTextUnitTarget(key) {
  const mode = shareControl("shareTextUnits")?.value || "app";
  if (mode === "app") return unitPreference(key);
  if (key === "fishWeight") return mode === "metric" ? "kg" : "lb";
  if (key === "fishLength") return mode === "metric" ? "cm" : "in";
  if (key === "depth") return mode === "metric" ? "m" : "ft";
  return unitPreference(key);
}

function shareTextMeasurement(value, key) {
  if (value === null || value === undefined || value === "") return "";
  const fromUnit = unitPreference(key);
  const toUnit = shareTextUnitTarget(key);
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

function shareOverviewItems(trip) {
  const linesSet = (trip.gearUsed || []).map((item) => item.startTime).filter(Boolean).sort()[0];
  const directions = [...new Set((trip.catches || []).map((fish) => fish.direction).filter(Boolean))].join(", ");
  const fows = (trip.catches || []).map((fish) => shareNumber(fish.fowCaught || fish.waterDepth)).filter((value) => value != null);
  const items = [
    ["Launch", trip.startTime ? formatTimelineDisplayTime(trip.startTime) : ""],
    ["Lines set", linesSet ? formatTimelineDisplayTime(linesSet) : ""],
    ["Off water", trip.endTime ? formatTimelineDisplayTime(trip.endTime) : ""],
    ["Direction", directions],
    ["FOW range", fows.length ? `${Math.round(Math.min(...fows))}–${Math.round(Math.max(...fows))}` : ""]
  ];
  return items.filter(([, value]) => value || shareChecked("shareShowEmpty"));
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
    hours,
    species: shareSpecies(trip).length,
    score: `${landed}/${encounters}`,
    rate: hours > 0 ? landed / hours : null
  };
}

function shareStatusLabel(type) {
  if (type === "Landed") return "Landed";
  if (type === "Released") return "Released";
  if (type === "Lost") return "Lost";
  return "Missed";
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
  return items.filter(([, value]) => value || shareChecked("shareShowEmpty"));
}

function shareTimelineHtml(trip, layout) {
  if (!shareChecked("shareShowTimeline") || !["complete", "timeline"].includes(layout)) return "";
  const events = shareEventRecords(trip);
  const rows = events.map((fish, index) => {
    const lure = shareLureText(fish);
    return `<tr class="status-${fish.eventType.toLowerCase()}">
      <td>${index + 1}</td>
      <td>${shareEscape(fish.time ? formatTimelineDisplayTime(fish.time) : "—")}</td>
      <td class="report-timeline-result">${shareEscape(shareStatusLabel(fish.eventType))}</td>
      <td>${shareEscape(fish.species || fish.possibleSpecies || "Fish")}</td>
      <td>${shareEscape(shareFormatSize(fish) || "—")}</td>
      <td>${shareEscape(shareFow(fish.fowCaught || fish.waterDepth) || "—")}</td>
      <td>${shareEscape(fish.presentation || "—")}</td>
      <td>${shareEscape(shareDepthText(fish) || "—")}</td>
      <td>${shareEscape(fish.speed ? displayStoredMeasurement(fish.speed, "speed") : "—")}</td>
      <td>${shareEscape(lure || "—")}</td>
    </tr>`;
  }).join("");
  return `<section class="report-timeline report-timeline-grid"><div class="report-section-heading"><h4>Trip Timeline</h4></div><table><colgroup><col class="timeline-number" /><col class="timeline-time" /><col class="timeline-result" /><col class="timeline-species" /><col class="timeline-size" /><col class="timeline-fow" /><col class="timeline-method" /><col class="timeline-depth" /><col class="timeline-speed" /><col class="timeline-lure" /></colgroup><thead><tr><th>#</th><th>Time</th><th>Result</th><th>Species</th><th>Size</th><th>FOW</th><th>Method</th><th>Depth</th><th>Speed</th><th>Lure</th></tr></thead><tbody>${rows || '<tr><td colspan="10" class="report-timeline-empty">No events recorded</td></tr>'}</tbody></table></section>`;
}

function shareReportHtml(trip) {
  const layout = shareControl("shareTripLayout")?.value || "complete";
  const theme = shareControl("shareTripTheme")?.value || "deep-water";
  const headline = shareControl("shareTripHeadline")?.value.trim() || `${shareLaunch(trip)} fishing report`;
  const subtitle = shareControl("shareTripSubtitle")?.value.trim() || "";
  const metrics = shareMetricData(trip);
  const biggest = shareBiggestFish(trip);
  const bestLures = shareBestLures(trip);
  const bestMethods = shareBestMethods(trip);
  const selectedPhoto = shareSelectedPhoto();
  const heroUrl = sharePhotoUrl(selectedPhoto);
  const heroFallback = selectedPhoto ? previewImage(selectedPhoto) : "";
  const hero = heroUrl
    ? `<figure class="report-hero"><img src="${shareEscape(heroUrl)}" data-fallback="${shareEscape(heroFallback)}" alt="Selected trip photo" /></figure>`
    : "";
  const overview = shareOverviewItems(trip);
  const conditionItems = shareChecked("shareShowConditions") ? shareConditionItems(trip) : [];
  const species = shareSpecies(trip);
  const speciesValue = species.length > 2
    ? `${species.slice(0, 2).map(([name]) => name).join(" / ")} +${species.length - 2}`
    : species.map(([name]) => name).join(" / ") || "None";
  const biggestSize = biggest ? shareFormatSize(biggest) || (biggest.shaker ? "Shaker" : "Size not logged") : "";
  const biggestLabel = biggest ? [biggestSize, biggest.species || "Fish"].filter(Boolean).join(" ") : "No landed fish";
  const highlightItems = [
    ["Biggest fish", biggestLabel],
    ["Best presentation", bestMethods.join(" / ")],
    ["Best lure", bestLures.join(" / ")]
  ].filter(([, value]) => value || shareChecked("shareShowEmpty"));
  const notesText = shareChecked("shareShowNotes") ? displaySentenceText(trip.notes || "") : "";
  const notes = notesText || overview.length
    ? `<section class="report-notes"><h4>${notesText ? "Trip Notes" : "Trip Summary"}</h4>${notesText ? `<p>${shareEscape(notesText)}</p>` : ""}${overview.length ? `<dl class="report-overview-list">${overview.map(([label, value]) => `<div><dt>${shareEscape(label)}</dt><dd>${shareEscape(value || "Not logged")}</dd></div>`).join("")}</dl>` : ""}</section>`
    : "";
  const deckText = notesText || [bestMethods[0], bestLures[0]].filter(Boolean).join(" · ");
  const branding = shareControl("shareTripBranding")?.value === "on" ? `<footer>Fishing Logbook</footer>` : "";
  const preset = shareLayoutPreset(layout);

  return `<article class="share-report layout-${layout} theme-${theme}" data-dynamic="${preset.dynamic}" style="--report-accent:${shareEscape(shareControl("shareTripAccent")?.value || "#18b9d6")};--report-min-height:${((preset.minHeight || preset.height) / preset.width) * 100}cqw">
    <header class="report-header">
      <div class="report-title"><p class="report-meta">${shareEscape(formatDate(trip.date))} · ${shareEscape(shareLocationText(trip))}</p><h3>${shareEscape(headline)}</h3>${subtitle ? `<p class="report-subtitle">${shareEscape(subtitle)}</p>` : ""}</div>
      ${hero}
    </header>
    <section class="report-metrics">
      <div><strong>${metrics.landed}</strong><span>Landed</span></div>
      <div><strong>${metrics.misses}</strong><span>Missed / lost</span></div>
      <div><strong>${metrics.score}</strong><span>Final score</span></div>
      <div><strong>${trimNumber(metrics.hours)}<small> hr</small></strong><span>On water</span></div>
      <div class="report-species-metric"><strong>${shareEscape(speciesValue)}</strong><span>Species</span></div>
    </section>
    <section class="report-highlights">
      <section class="report-highlight-group"><h4>Trip Highlights</h4><dl>${highlightItems.map(([label, value]) => `<div><dt>${shareEscape(label)}</dt><dd>${shareEscape(value || "Not logged")}</dd></div>`).join("") || "<div><dd>No highlights logged</dd></div>"}</dl></section>
      ${conditionItems.length ? `<section class="report-highlight-group report-conditions"><h4>Conditions</h4><dl>${conditionItems.map(([label, value]) => `<div><dt>${shareEscape(label)}</dt><dd>${shareEscape(value || "Not logged")}</dd></div>`).join("")}</dl></section>` : ""}
    </section>
    ${deckText ? `<p class="report-deck">${shareEscape(deckText)}</p>` : ""}
    <div class="report-body">${notes}</div>
    ${shareTimelineHtml(trip, layout)}
    ${branding}
  </article>`;
}

function shareFormatEventSentence(fish, index) {
  const details = [];
  if (fish.time) details.push(formatTimelineDisplayTime(fish.time));
  if (fish.fowCaught || fish.waterDepth) details.push(`${shareTextMeasurement(shareFow(fish.fowCaught || fish.waterDepth), "depth")} FOW`);
  if (fish.presentation) details.push(displayTitleText(fish.presentation));
  const depth = shareTextDepth(fish);
  if (depth) details.push(depth);
  const lure = shareLureText(fish);
  if (lure) details.push(lure);
  const result = fish.landed
    ? [fish.shaker ? "Shaker" : displayTitleText(fish.species || "Fish"), shareTextFishSize(fish), fish.released ? "released" : "landed"].filter(Boolean).join(", ")
    : [fish.eventType, fish.possibleSpecies ? `possible ${displayTitleText(fish.possibleSpecies)}` : ""].filter(Boolean).join(", ");
  const notes = fish.notes ? ` ${displaySentenceText(fish.notes)}` : "";
  const lead = details.length ? `Fish ${index + 1} - ${details.join(", ")}.` : `Fish ${index + 1} -`;
  return `${lead} ${result}.${notes}`.replace(/\.\./g, ".");
}

function shareGroupedEventParagraphs(trip) {
  const events = shareEventRecords(trip);
  const groups = [];
  events.forEach((event) => {
    const previous = groups[groups.length - 1];
    if (previous && event.time && previous.time === event.time) previous.events.push(event);
    else groups.push({ time: event.time || "", events: [event] });
  });
  let number = 0;
  return groups.map((group) => {
    if (group.events.length === 1) {
      const sentence = shareFormatEventSentence(group.events[0], number);
      number += 1;
      return sentence;
    }
    const start = number + 1;
    number += group.events.length;
    const lines = group.events.map((event) => {
      const method = [event.presentation, shareTextDepth(event), shareLureText(event)].filter(Boolean).join(", ");
      const result = event.landed ? [event.species || "Fish", shareTextFishSize(event)].filter(Boolean).join(" ") : event.eventType;
      return `${result}${method ? ` on ${method}` : ""}`;
    });
    return `Fish ${start} and ${number} - ${group.time ? formatTimelineDisplayTime(group.time) : "Time not logged"}, double. ${lines.join("; ")}.`;
  });
}

function shareTextReport(trip) {
  const style = shareControl("shareTextStyle")?.value || "detailed";
  const headline = shareControl("shareTripHeadline")?.value.trim() || `${shareLaunch(trip)} fishing report`;
  const subtitle = shareControl("shareTripSubtitle")?.value.trim();
  const metrics = shareMetricData(trip);
  const linesSet = (trip.gearUsed || []).map((item) => item.startTime).filter(Boolean).sort()[0];
  const location = shareLocationText(trip);
  const intro = [`${headline} - ${formatDate(trip.date)}.`, subtitle].filter(Boolean).join("\n");
  const timing = [
    `Out of ${location}${trip.startTime ? ` at ${formatTimelineDisplayTime(trip.startTime)}` : ""}`,
    linesSet ? `lines set by ${formatTimelineDisplayTime(linesSet)}` : "",
    trip.endTime ? `off the water at ${formatTimelineDisplayTime(trip.endTime)}` : ""
  ].filter(Boolean).join(", ");
  const score = `Finished ${metrics.landed} for ${metrics.encounters}${metrics.hours ? ` over ${trimNumber(metrics.hours)} hours` : ""}.`;
  const conditions = shareChecked("shareShowConditions") ? shareWeatherParts(trip).join(" · ") : "";
  const notes = shareChecked("shareShowNotes") ? displaySentenceText(trip.notes || "") : "";
  const highlights = [
    shareBestLures(trip).length ? `Best lure: ${shareBestLures(trip).join(" / ")}.` : "",
    shareBestMethods(trip).length ? `Best method: ${shareBestMethods(trip).join(" / ")}.` : ""
  ].filter(Boolean).join(" ");
  const eventParagraphs = shareGroupedEventParagraphs(trip);

  if (style === "concise") {
    return [
      intro,
      `${location}. ${score}`,
      notes,
      highlights,
      eventParagraphs.length ? eventParagraphs.slice(0, 4).join("\n") : ""
    ].filter(Boolean).join("\n\n");
  }
  if (style === "fish-log") {
    return [intro, score, ...eventParagraphs].filter(Boolean).join("\n\n");
  }
  return [
    intro,
    timing ? `${timing.charAt(0).toUpperCase()}${timing.slice(1)}.` : "",
    score,
    notes,
    conditions ? `Conditions: ${conditions}.` : "",
    highlights,
    ...eventParagraphs
  ].filter(Boolean).join("\n\n");
}

function sharePreview() {
  if (!activeShareTrip) return;
  const layout = shareControl("shareTripLayout")?.value || "complete";
  const preset = shareLayoutPreset(layout);
  const frame = shareControl("shareTripPreviewFrame");
  if (frame) {
    const previewHeight = preset.height || preset.minHeight;
    frame.style.aspectRatio = preset.dynamic ? "auto" : `${preset.width} / ${previewHeight}`;
    frame.style.setProperty("--share-aspect", String(preset.width / previewHeight));
    frame.classList.toggle("is-dynamic", preset.dynamic);
    frame.dataset.layout = layout;
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
  shareSetStatus("");
  sharePreview();
}

function openTripShareStudio(trip) {
  activeShareTrip = trip;
  shareTextDirty = false;
  const options = shareFishPhotoOptions(trip);
  shareControl("shareTripPhoto").innerHTML = `<option value="">No photo</option>${options.map((item, index) => `<option value="${index}">${shareEscape(item.label)}</option>`).join("")}`;
  shareControl("shareTripPhoto").value = String(defaultSharePhotoIndex(trip));
  shareControl("shareTripLayout").value = "complete";
  shareControl("shareTripTheme").value = "deep-water";
  shareControl("shareTripHeadline").value = `${shareLaunch(trip)} fishing report`;
  shareControl("shareTripSubtitle").value = "";
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

async function shareReportCanvas(format = "png") {
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
  const layout = shareControl("shareTripLayout")?.value || "complete";
  const preset = shareLayoutPreset(layout);
  const scale = preset.width / report.getBoundingClientRect().width;
  const targetHeight = preset.dynamic
    ? Math.ceil(report.getBoundingClientRect().height * scale)
    : preset.height;
  const canvas = await window.html2canvas(report, {
    backgroundColor: null,
    scale,
    useCORS: true,
    allowTaint: false,
    logging: false,
    width: report.getBoundingClientRect().width,
    height: report.getBoundingClientRect().height
  });
  if (canvas.width === preset.width && canvas.height === targetHeight) return canvas;
  const exact = document.createElement("canvas");
  exact.width = preset.width;
  exact.height = targetHeight;
  exact.getContext("2d").drawImage(canvas, 0, 0, preset.width, targetHeight);
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
  const canvas = await shareReportCanvas(format);
  const mime = format === "jpg" ? "image/jpeg" : "image/png";
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, format === "jpg" ? 0.93 : 1));
  if (!blob) throw new Error("The report image could not be created.");
  shareDownloadBlob(blob, format);
}

async function shareCopyImage() {
  if (!(window.ClipboardItem && navigator.clipboard?.write)) throw new Error("Copy Image is not supported in this browser.");
  const canvas = await shareReportCanvas("png");
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

async function shareCopyText() {
  const editor = shareControl("shareTripTextEditor");
  await navigator.clipboard.writeText(editor.value);
}

function shareDownloadText() {
  const blob = new Blob([shareControl("shareTripTextEditor").value], { type: "text/plain;charset=utf-8" });
  shareDownloadBlob(blob, "txt");
}

shareControl("shareTripForm")?.addEventListener("input", () => {
  shareTextDirty = false;
  sharePreview();
});
shareControl("shareTripForm")?.addEventListener("change", () => {
  shareTextDirty = false;
  sharePreview();
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
