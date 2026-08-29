function setupLineCounts(trip, gearItem) {
  const fish = (trip.catches || [])
    .filter((catchItem) => catchItem.setupLineId === gearItem.id && catchItem.setupLineTarget !== "cheater")
    .reduce((sum, catchItem) => sum + fishCount(catchItem), 0);
  const lost = (trip.lostFish || [])
    .filter((fishItem) => fishItem.setupLineId === gearItem.id && fishItem.setupLineTarget !== "cheater")
    .length;
  return { fish, lost };
}

function setupLineCheaterFishCount(trip, gearItem) {
  return (trip.catches || [])
    .filter((catchItem) => catchItem.setupLineId === gearItem.id && catchItem.setupLineTarget === "cheater")
    .reduce((sum, catchItem) => sum + fishCount(catchItem), 0);
}

function timelineTimeValue(time) {
  if (!time) return 9999;
  const [hours = "0", minutes = "0"] = String(time).split(":");
  return Number(hours) * 60 + Number(minutes);
}

function formatTimelineDisplayTime(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function timelineTimeLabel(item) {
  if (item.startTime && item.endTime) {
    const start = formatTimelineDisplayTime(item.startTime);
    const end = formatTimelineDisplayTime(item.endTime);
    const startMatch = start.match(/^(.+)\s(AM|PM)$/);
    const endMatch = end.match(/^(.+)\s(AM|PM)$/);
    if (startMatch && endMatch && startMatch[2] === endMatch[2]) {
      return `${startMatch[1]}-${endMatch[1]} ${endMatch[2]}`;
    }
    return [start, end].filter(Boolean).join("-");
  }
  return formatTimelineDisplayTime(item.time || item.startTime || item.endTime) || "No time";
}

function uniqueTimelineValues(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function timelineMetaChips(chips = []) {
  const values = uniqueTimelineValues(chips);
  if (!values.length) return "";
  return `
    <div class="meta-chips">
      ${values.map((value) => `<span class="meta-chip">${escapeHtml(value)}</span>`).join("")}
    </div>
  `;
}

function timelineEventPhoto(photos = [], options = {}) {
  if (!photos.length) return "";
  const photo = options.heroPhotoId
    ? photos.find((item) => item.id === options.heroPhotoId) || photos[0]
    : photos[0];
  const extraCount = Math.max(0, photos.length - 1);
  return `
    <figure class="timeline-photo-frame">
      ${mediaMarkup(photo, "event-photo")}
      ${extraCount && !options.hideCount ? `<figcaption>${escapeHtml(`+${extraCount} more photo${extraCount === 1 ? "" : "s"}`)}</figcaption>` : ""}
    </figure>
  `;
}

function timelineEventHeader(item) {
  const timeLabel = item.time ? formatTimelineDisplayTime(item.time) : timelineTimeLabel(item);
  const typeLabel = item.type === "Lost" ? "Lost Fish" : item.type;
  return `
    <div class="event-header">
      <p class="event-kicker">${escapeHtml([typeLabel.toUpperCase(), timeLabel].filter(Boolean).join(" \u00b7 "))}</p>
      <h4 class="event-title">${escapeHtml(item.title || item.type)}</h4>
      ${item.summary ? `<p class="event-summary">${escapeHtml(item.summary)}</p>` : ""}
    </div>
  `;
}

function isTripEndTime(trip, time) {
  return Boolean(time && trip.endTime && String(time).slice(0, 5) === String(trip.endTime).slice(0, 5));
}

function setupTimelineItems(trip) {
  const events = new Map();
  const ensure = (time) => {
    const key = String(time || "").slice(0, 5);
    if (!events.has(key)) events.set(key, { time: key, deployed: [], pulled: [], notes: [] });
    return events.get(key);
  };

  (trip.gearUsed || []).forEach((gearItem, index) => {
    if (gearItem.startTime) {
      const event = ensure(gearItem.startTime);
      event.deployed.push(setupTimelineRecord(trip, gearItem, index));
      if (gearItem.changeNote) event.notes.push(gearItem.changeNote);
    }
    if (gearItem.endTime && !isTripEndTime(trip, gearItem.endTime)) {
      ensure(gearItem.endTime).pulled.push(setupTimelineRecord(trip, gearItem, index));
    }
  });

  return [...events.values()].map((event) => {
    const title = event.pulled.length && event.deployed.length
      ? "Setup change"
      : event.deployed.length
        ? `${event.deployed.length} ${event.deployed.length === 1 ? "rod" : "rods"} deployed`
        : `${event.pulled.length} ${event.pulled.length === 1 ? "rod" : "rods"} pulled`;
    return {
      type: "Setup",
      title,
      summary: "",
      setupRows: [
        ...event.pulled.map((row) => ({ ...row, action: "Pulled" })),
        ...event.deployed.map((row) => ({ ...row, action: "Deployed" }))
      ],
      note: displaySentenceText([...new Set(event.notes)].join(" / ")),
      time: event.time,
      sortTime: timelineTimeValue(event.time)
    };
  });
}

function timelineSortOrder(type) {
  return { Setup: 0, Catch: 1, Lost: 2, Photo: 3 }[type] ?? 9;
}

function tripTimelineItems(trip) {
  const items = [...setupTimelineItems(trip)];

  (trip.catches || []).forEach((catchItem, index) => {
    const record = resolveTripLineRecord({ ...catchItem, trip });
    const setupLabel = compactSetupDisplayLabel(record);
    const waterDepth = record.waterDepth || record.fowCaught;
    const lure = displayTitleText([lureName(record.lureId), flasherName(record.flasherId)].filter(Boolean).join(" + "));
    const gpsSpeed = displaySpeedValue(record.gpsSpeed || record.speed);
    const ballSpeed = displaySpeedValue(record.ballSpeed);
    const summary = [
      catchItem.released ? "Released" : "Kept",
      setupLabel,
      record.depthDown ? `${record.depthDown} down` : "",
      waterDepth ? `${waterDepth} water` : ""
    ].filter(Boolean).join(" \u00b7 ");
    const chips = [
      spotName(catchItem.spotId),
      lure,
      gpsSpeed ? `GPS ${gpsSpeed}` : "",
      ballSpeed ? `Ball ${ballSpeed}` : "",
      waterDepth ? `${waterDepth} water` : "",
      record.depthDown ? `${record.depthDown} down` : "",
      setupLabel
    ];
    items.push({
      type: "Catch",
      title: displayTitleText(catchItem.species || `Catch ${index + 1}`),
      summary,
      chips,
      catchIndex: index,
      note: displaySentenceText(catchItem.notes || ""),
      time: catchItem.time,
      photos: catchItem.photos || [],
      heroPhotoId: catchItem.heroPhotoId || "",
      sortTime: timelineTimeValue(catchItem.time)
    });
  });

  (trip.lostFish || []).forEach((fish, index) => {
    const record = resolveTripLineRecord({ ...fish, trip });
    const setupLabel = compactSetupDisplayLabel(record);
    const waterDepth = record.waterDepth || record.fowCaught;
    const lure = displayTitleText([lureName(record.lureId), flasherName(record.flasherId)].filter(Boolean).join(" + "));
    const gpsSpeed = displaySpeedValue(record.gpsSpeed || record.speed);
    const ballSpeed = displaySpeedValue(record.ballSpeed);
    items.push({
      type: "Lost",
      title: displayTitleText(fish.possibleSpecies || fish.species || `Lost Fish ${index + 1}`),
      summary: "",
      chips: [
        setupLabel,
        record.depthDown ? `${record.depthDown} down` : "",
        waterDepth ? `${waterDepth} water` : "",
        lure,
        gpsSpeed ? `GPS ${gpsSpeed}` : "",
        ballSpeed ? `Ball ${ballSpeed}` : ""
      ],
      note: displaySentenceText(fish.notes || ""),
      time: fish.time,
      sortTime: timelineTimeValue(fish.time)
    });
  });

  (trip.notePhotos || []).forEach((photo) => {
    items.push({
      type: "Photo",
      title: timelinePhotoTitle(photo),
      summary: "",
      chips: [],
      time: photo.captureTime || "",
      photos: [photo],
      sortTime: photo.captureTime ? timelineTimeValue(photo.captureTime) : 10000
    });
  });

  return items.sort((a, b) => a.sortTime - b.sortTime || timelineSortOrder(a.type) - timelineSortOrder(b.type) || a.type.localeCompare(b.type));
}

function timelineFilterMatches(item, filter = activeTripTimelineFilter) {
  if (filter === "catches") return item.type === "Catch" || item.type === "Lost";
  if (filter === "setup") return item.type === "Setup";
  if (filter === "photos") return item.type === "Photo";
  return true;
}

function renderTripTimelineFilters() {
  const filters = [
    ["all", "All events"],
    ["setup", "Setup"],
    ["catches", "Fish catch"],
    ["photos", "Trip photos"]
  ];
  return `
    <div class="timeline-filter" role="group" aria-label="Timeline filter">
      ${filters.map(([value, label]) => `
        <button class="timeline-filter-button ${activeTripTimelineFilter === value ? "is-active" : ""}" type="button" data-timeline-filter="${value}">
          ${escapeHtml(label)}
        </button>
      `).join("")}
    </div>
  `;
}

function timelineSetupRows(rows = []) {
  if (!rows.length) return "";
  return `
    <div class="setup-list">
      ${rows.map((row) => `
        <article class="setup-row">
          <div class="setup-row-topline">
            <p class="setup-row-title">${escapeHtml(row.position || row.rod || row.rodReel || "Not logged")}</p>
            <span class="setup-action">${escapeHtml(row.action)}</span>
          </div>
          <p class="setup-row-meta">${escapeHtml([row.presentation || "Setup", [row.startTime, row.endTime].filter(Boolean).join(" to ") || "Time not logged"].filter(Boolean).join(" \u00b7 "))}</p>
          <p class="setup-row-note">${escapeHtml(row.lure || "No lure logged")}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderTimelineEventCard(item) {
  const interactiveAttributes = item.type === "Catch"
    ? `data-summary-catch-index="${item.catchIndex}" role="button" tabindex="0"`
    : "";
  const classes = ["event-card", item.type.toLowerCase(), item.type === "Catch" ? "timeline-catch-card" : ""].filter(Boolean).join(" ");
  return `
    <div class="${classes}" ${interactiveAttributes}>
      ${timelineEventHeader(item)}
      ${item.setupRows?.length ? timelineSetupRows(item.setupRows) : ""}
      ${item.type === "Catch" ? timelineEventPhoto(item.photos, { hideCount: false, heroPhotoId: item.heroPhotoId }) : ""}
      ${item.type === "Photo" ? timelineEventPhoto(item.photos, { hideCount: true }) : ""}
      ${item.note ? `<p class="event-note">${escapeHtml(item.note)}</p>` : ""}
      ${timelineMetaChips(item.chips)}
      ${item.type === "Catch" ? `<button class="button secondary timeline-catch-open" type="button" data-summary-catch-index="${item.catchIndex}">View details</button>` : ""}
    </div>
  `;
}

function renderTripTimeline(trip) {
  const items = tripTimelineItems(trip).filter((item) => timelineFilterMatches(item));
  if (!items.length) return `<div class="empty-state compact-empty"><p>No timeline events logged.</p></div>`;
  return `
    <div class="trip-timeline">
      ${items.map((item) => `
        <article class="timeline-item timeline-${item.type.toLowerCase()}">
          <div class="timeline-time">${escapeHtml(timelineTimeLabel(item))}</div>
          <div class="timeline-dot" aria-hidden="true"></div>
          ${renderTimelineEventCard(item)}
        </article>
      `).join("")}
    </div>
  `;
}

function refreshTripTimelinePanel() {
  const trip = state.trips.find((item) => item.id === activeSummaryTripId);
  const panel = document.querySelector("#tripTimelinePanel");
  if (!trip || !panel) return;
  panel.innerHTML = renderTripTimeline(trip);
  document.querySelectorAll("[data-timeline-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.timelineFilter === activeTripTimelineFilter);
  });
}

function refreshCatchMediaGallery(gallery, selectedIndex = 0) {
  const trip = state.trips.find((item) => item.id === activeSummaryTripId);
  const catchIndex = Number(gallery?.dataset?.catchIndex);
  const catchItem = trip?.catches?.[catchIndex];
  if (!trip || !catchItem || Number.isNaN(catchIndex)) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderCatchMediaGallery(catchItem.photos || [], catchItem.species || `Catch ${catchIndex + 1}`, {
    catchIndex,
    selectedIndex,
    heroPhotoId: catchItem.heroPhotoId,
    context: gallery.dataset.galleryContext || "summary",
    showAllThumbnails: gallery.dataset.showAllThumbnails === "true"
  }).trim();
  const nextGallery = wrapper.firstElementChild;
  if (nextGallery) gallery.replaceWith(nextGallery);
}

function openSummaryCatchDetail(catchIndex, selectedIndex) {
  const trip = state.trips.find((item) => item.id === activeSummaryTripId);
  const catchItem = trip?.catches?.[catchIndex];
  const host = document.querySelector("#catchDetailHost");
  if (!trip || !catchItem || !host) return;
  host.innerHTML = renderCatchDetailPopout(trip, catchItem, catchIndex, selectedIndex);
  document.querySelector("#tripSummaryDialog")?.classList.add("catch-detail-open");
  host.querySelector(".catch-detail-close")?.focus();
}

function closeSummaryCatchDetail() {
  const host = document.querySelector("#catchDetailHost");
  if (host) host.innerHTML = "";
  document.querySelector("#tripSummaryDialog")?.classList.remove("catch-detail-open");
}

function openTripSummary(trip) {
  activeSummaryTripId = trip.id;
  activeTripTimelineFilter = "all";
  activeReportTimelineFilter = "all";
  activeReportTimelineSort = { key: "time", direction: "asc" };
  els.tripSummaryTitle.textContent = displayTitleText(trip.title || trip.location || "Trip Summary");
  els.tripSummaryBody.innerHTML = renderTripReport(trip);
  els.tripSummaryDialog.showModal();
  if (catchMapRecordsForTrip(trip).length) renderTripSummaryMap(trip);
}

function formatReportStatTime(value) {
  const formatted = formatDisplayTime(value);
  return timeFormatPreference() === "12" ? formatted.replace(/\s(?:AM|PM)$/, "") : formatted;
}
