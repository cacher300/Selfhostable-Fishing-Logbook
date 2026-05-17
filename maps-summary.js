function catchMapRecords() {
  return state.trips.flatMap((trip) => (trip.catches || []).map((catchItem, catchIndex) => {
    const photoWithCoordinates = (catchItem.photos || []).find((photo) => isUsableCoordinates(photo.coordinates));
    const coordinates = isUsableCoordinates(catchItem.coordinates) ? catchItem.coordinates : photoWithCoordinates?.coordinates;
    if (!isUsableCoordinates(coordinates)) return null;
    return {
      id: catchItem.id || `${trip.id}-${catchIndex}`,
      trip,
      catchItem,
      photo: photoWithCoordinates,
      coordinates
    };
  })).filter(Boolean);
}

const speciesMarkerColors = [
  "#0b6e43",
  "#2763a7",
  "#bc2f2f",
  "#9a5b00",
  "#6f42c1",
  "#087990",
  "#b4236b",
  "#4d7c0f",
  "#795548",
  "#344054"
];

function speciesColor(species = "Fish") {
  const value = species || "Fish";
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return speciesMarkerColors[hash % speciesMarkerColors.length];
}

function addSpeciesMarker(layerGroup, record) {
  const color = speciesColor(record.catchItem.species);
  return L.circleMarker([record.coordinates.latitude, record.coordinates.longitude], {
    radius: 8,
    color,
    fillColor: color,
    fillOpacity: 0.86,
    weight: 2
  }).bindPopup(mapPopupHtml(record)).addTo(layerGroup);
}

function mapSpeciesOptions(records) {
  return ["All species", ...new Set(records.map((record) => record.catchItem.species || "Unknown species"))];
}

function renderMapSpeciesFilter(records) {
  const options = mapSpeciesOptions(records);
  if (!options.includes(activeMapSpecies)) activeMapSpecies = "All species";
  els.mapSpeciesFilter.innerHTML = options.map((option) => (
    `<option value="${escapeHtml(option)}" ${option === activeMapSpecies ? "selected" : ""}>${escapeHtml(option)}</option>`
  )).join("");
}

function filteredMapRecords(records) {
  if (activeMapSpecies === "All species") return records;
  return records.filter((record) => (record.catchItem.species || "Unknown species") === activeMapSpecies);
}

function renderMapLegend(records) {
  const species = mapSpeciesOptions(records).slice(1);
  if (!species.length) return "";
  return `
    <div class="map-legend">
      ${species.map((name) => `
        <span><i style="--pin-color:${speciesColor(name)}"></i>${escapeHtml(name)}</span>
      `).join("")}
    </div>
  `;
}

function mapPopupHtml(record) {
  const { catchItem, trip, photo, coordinates } = record;
  const title = [catchItem.species || "Fish", trip.location].filter(Boolean).join(" at ");
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`;
  return `
    <div class="map-popup">
      ${photo?.image ? mediaMarkup(photo) : ""}
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(formatDate(trip.date))}</span>
      <span>${escapeHtml(formatCoordinates(coordinates))}</span>
      <a href="${mapsUrl}" target="_blank" rel="noreferrer">Open in Maps</a>
    </div>
  `;
}

function renderMapList(records) {
  if (!records.length) {
    els.mapCatchList.innerHTML = `<div class="empty-state"><p>No geotagged fish match this filter.</p></div>`;
    return;
  }

  els.mapCatchList.innerHTML = records.map((record) => {
    const { catchItem, trip, photo, coordinates } = record;
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`;
    return `
      <article class="map-catch-card">
        ${photo?.image ? mediaMarkup(photo) : ""}
        <div>
          <strong>${escapeHtml(catchItem.species || "Fish")}</strong>
          <span>${escapeHtml([formatDate(trip.date), trip.location].filter(Boolean).join(" / "))}</span>
          <span>${escapeHtml(formatCoordinates(coordinates))}</span>
          <a href="${mapsUrl}" target="_blank" rel="noreferrer">Open in Maps</a>
        </div>
      </article>
    `;
  }).join("");
}

function renderFishMap() {
  const allRecords = catchMapRecords();
  renderMapSpeciesFilter(allRecords);
  const records = filteredMapRecords(allRecords);
  const totalText = allRecords.length === 1 ? "1 geotagged fish" : `${allRecords.length} geotagged fish`;
  const filteredText = records.length === allRecords.length ? totalText : `${records.length} shown of ${totalText}`;
  els.mapSummary.textContent = filteredText;
  renderMapList(records);
  els.mapCatchList.insertAdjacentHTML("afterbegin", renderMapLegend(allRecords));

  if (!window.L) {
    els.fishMap.innerHTML = `<div class="empty-state"><p>Map tiles are unavailable, but saved GPS coordinates are listed below.</p></div>`;
    return;
  }

  if (!fishMap) {
    fishMap = L.map(els.fishMap);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(fishMap);
    fishMapMarkers = L.layerGroup().addTo(fishMap);
  }

  fishMapMarkers.clearLayers();
  if (!records.length) {
    fishMap.setView([43.8, -79.5], 6);
    return;
  }

  const bounds = [];
  records.forEach((record) => {
    const point = [record.coordinates.latitude, record.coordinates.longitude];
    bounds.push(point);
    addSpeciesMarker(fishMapMarkers, record);
  });

  if (bounds.length === 1) fishMap.setView(bounds[0], 13);
  else fishMap.fitBounds(bounds, { padding: [28, 28] });
  setTimeout(() => fishMap.invalidateSize(), 0);
}

function catchMapRecordsForTrip(trip) {
  return (trip.catches || []).map((catchItem, catchIndex) => {
    const photoWithCoordinates = (catchItem.photos || []).find((photo) => isUsableCoordinates(photo.coordinates));
    const coordinates = isUsableCoordinates(catchItem.coordinates) ? catchItem.coordinates : photoWithCoordinates?.coordinates;
    if (!isUsableCoordinates(coordinates)) return null;
    return {
      id: catchItem.id || `${trip.id}-${catchIndex}`,
      trip,
      catchItem,
      photo: photoWithCoordinates,
      coordinates
    };
  }).filter(Boolean);
}

function renderTripSummaryMap(trip) {
  const mapNode = document.querySelector("#tripSummaryMap");
  if (!mapNode) return;
  const records = catchMapRecordsForTrip(trip);

  if (!window.L) {
    mapNode.innerHTML = `<div class="empty-state"><p>Map tiles are unavailable.</p></div>`;
    return;
  }

  if (!tripSummaryMap) {
    tripSummaryMap = L.map(mapNode);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(tripSummaryMap);
    tripSummaryMapMarkers = L.layerGroup().addTo(tripSummaryMap);
  } else if (tripSummaryMap.getContainer() !== mapNode) {
    tripSummaryMap.remove();
    tripSummaryMap = L.map(mapNode);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(tripSummaryMap);
    tripSummaryMapMarkers = L.layerGroup().addTo(tripSummaryMap);
  }

  tripSummaryMapMarkers.clearLayers();
  if (!records.length) {
    tripSummaryMap.setView([43.8, -79.5], 6);
    return;
  }

  const bounds = [];
  records.forEach((record) => {
    const point = [record.coordinates.latitude, record.coordinates.longitude];
    bounds.push(point);
    addSpeciesMarker(tripSummaryMapMarkers, record);
  });

  if (bounds.length === 1) tripSummaryMap.setView(bounds[0], 13);
  else tripSummaryMap.fitBounds(bounds, { padding: [24, 24] });
  setTimeout(() => tripSummaryMap.invalidateSize(), 0);
}

function summaryMetric(label, value) {
  return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "0")}</strong></article>`;
}

function summaryPhotoGrid(photos = [], emptyText = "No photos", options = {}) {
  if (!photos.length) return `<div class="empty-state compact-empty"><p>${escapeHtml(emptyText)}</p></div>`;
  const className = ["summary-photo-grid", options.compact ? "compact-photo-grid" : ""].filter(Boolean).join(" ");
  return `
    <div class="${className}">
      ${photos.map((photo) => `
        <figure class="summary-photo-card">
          ${mediaMarkup(photo)}
          ${photo.caption && !options.hideCaptions ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : ""}
        </figure>
      `).join("")}
    </div>
  `;
}

function renderTripSummaryCatches(trip) {
  const catches = trip.catches || [];
  if (!catches.length) return `<div class="empty-state compact-empty"><p>No catches logged.</p></div>`;
  return catches.map((catchItem, index) => {
    const record = resolveTripLineRecord({ ...catchItem, trip });
    const details = [
      record.released ? "Released" : "",
      record.length,
      record.weight,
      record.time,
      record.depthDown ? `${record.depthDown} down` : "",
      record.waterDepth ? `${record.waterDepth} water` : "",
      record.setupLine ? setupLineDisplayLabel(trip, record.setupLine) : "",
      lureName(record.lureId),
      flasherName(record.flasherId),
      record.coordinates ? formatCoordinates(record.coordinates) : ""
    ].filter(Boolean).join(" / ");
    return `
      <article class="summary-catch-card">
        <div>
          <strong>${escapeHtml(catchItem.species || `Catch ${index + 1}`)}</strong>
          <span>${escapeHtml(details || "No extra details")}</span>
          ${catchItem.notes ? `<p>${escapeHtml(catchItem.notes)}</p>` : ""}
        </div>
        ${summaryPhotoGrid(catchItem.photos || [], "No catch photos")}
      </article>
    `;
  }).join("");
}

function renderTripSummaryGear(trip) {
  const gearUsed = trip.gearUsed || [];
  if (!gearUsed.length) return `<div class="empty-state compact-empty"><p>No setup timeline entries.</p></div>`;
  return `
    <div class="summary-list">
      ${gearUsed.map((gearItem, index) => {
        const timeRange = [gearItem.startTime, gearItem.endTime].filter(Boolean).join("-");
        const gear = [lureName(gearItem.lureId), flasherName(gearItem.flasherId)].filter(Boolean).join(" + ");
        const details = [timeRange, setupLineSideLabel(gearItem.side), personName(trip, gearItem.personId), presentationLabel(gearItem.presentation), gearItem.speed].filter(Boolean).join(" / ");
        return `
          <article>
            <strong>${escapeHtml(setupLineDisplayLabel(trip, gearItem) || `Setup ${index + 1}`)}${gear && gearItem.lineLabel ? `: ${escapeHtml(gear)}` : ""}</strong>
            <span>${escapeHtml(details || "No setup details")}</span>
            ${gearItem.changeNote ? `<p>${escapeHtml(gearItem.changeNote)}</p>` : ""}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function setupLineCounts(trip, gearItem) {
  const fish = (trip.catches || [])
    .filter((catchItem) => catchItem.setupLineId === gearItem.id)
    .reduce((sum, catchItem) => sum + fishCount(catchItem), 0);
  const lost = (trip.lostFish || []).filter((fishItem) => fishItem.setupLineId === gearItem.id).length;
  return { fish, lost };
}

function spreadLineEnd(gearItem, index) {
  const side = gearItem.side || "center";
  const presentation = gearItem.presentation || "";
  const spread = presentation === "flatline-leadcore" ? 170 : presentation === "dipsey-diver" ? 116 : 38;
  const sideSign = side === "port" ? -1 : side === "starboard" ? 1 : 0;
  const stagger = side === "center" ? 0 : index * 10;
  return {
    x: presentation === "flatline-leadcore" ? 940 : presentation === "dipsey-diver" ? 900 : 860,
    y: 215 + sideSign * (spread + stagger)
  };
}

function spreadLineStart(gearItem) {
  if (gearItem.side === "port") return { x: 532, y: 188 };
  if (gearItem.side === "starboard") return { x: 532, y: 242 };
  return { x: 538, y: 215 };
}

function spreadBendPoint(start, end, gearItem) {
  const presentation = gearItem.presentation || "";
  const side = gearItem.side || "center";
  if (side === "center" || ["downrigger", "cheater"].includes(presentation)) return null;
  const sideSign = side === "port" ? -1 : 1;
  const outDistance = presentation === "flatline-leadcore" ? 145 : 105;
  return {
    x: start.x + outDistance,
    y: start.y + sideSign * outDistance
  };
}

function spreadLinePath(start, end, gearItem) {
  const bend = spreadBendPoint(start, end, gearItem);
  if (bend) return `M ${start.x} ${start.y} L ${bend.x} ${bend.y} L ${end.x} ${bend.y}`;
  if (Math.abs(start.y - end.y) < 4) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
}

function renderTrollingSpread(trip) {
  if (!isTrollingTripRecord(trip)) return "";
  const lines = (trip.gearUsed || []).filter((gearItem) => gearItem.lureId || gearItem.flasherId || gearItem.presentation);
  if (!lines.length) return `<div class="empty-state compact-empty"><p>No trolling setup lines logged.</p></div>`;

  const renderedLines = lines.map((gearItem, index) => {
    const counts = setupLineCounts(trip, gearItem);
    const end = spreadLineEnd(gearItem, index);
    const start = spreadLineStart(gearItem);
    const bend = spreadBendPoint(start, end, gearItem);
    const marker = bend || end;
    const labelX = bend ? bend.x + 14 : 560;
    const labelAnchor = "start";
    const label = setupLineDisplayLabel(trip, gearItem);
    const detail = [gearComboName(gearItem.lureId, gearItem.flasherId), `${counts.fish} fish`, counts.lost ? `${counts.lost} lost` : ""].filter(Boolean).join(" / ");
    return `
      <g class="spread-line spread-${escapeHtml(gearItem.side || "center")}">
        <path d="${spreadLinePath(start, end, gearItem)}" />
        <circle cx="${marker.x}" cy="${marker.y}" r="5" />
        <text x="${labelX}" y="${marker.y - 8}" text-anchor="${labelAnchor}" class="spread-line-label">${escapeHtml(label)}</text>
        <text x="${labelX}" y="${marker.y + 12}" text-anchor="${labelAnchor}" class="spread-line-detail">${escapeHtml(detail)}</text>
      </g>
    `;
  }).join("");

  return `
    <div class="spread-diagram-wrap">
      <svg class="spread-diagram" viewBox="0 0 980 430" role="img" aria-label="Trolling spread diagram">
        <defs>
          <linearGradient id="boatHull" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stop-color="#f8fbfd" />
            <stop offset="0.55" stop-color="#ffffff" />
            <stop offset="1" stop-color="#dbe7ef" />
          </linearGradient>
        </defs>
        <path class="spread-water" d="M40 292 C150 274 236 306 344 282 C470 254 650 284 940 258 L940 410 L40 410 Z" />
        <g class="spread-boat">
          <path class="spread-hull" d="M112 215 C155 160 217 128 304 126 L438 126 C470 126 490 149 490 181 L490 249 C490 281 470 304 438 304 L304 304 C217 302 155 270 112 215 Z" />
          <path class="spread-rub-rail" d="M146 215 C184 173 234 151 306 151 L430 151 C447 151 459 164 459 181 L459 249 C459 266 447 279 430 279 L306 279 C234 279 184 257 146 215 Z" />
          <path class="spread-bow-deck" d="M168 215 C202 185 239 172 292 171 L292 259 C239 258 202 245 168 215 Z" />
          <rect class="spread-cockpit" x="306" y="159" width="88" height="112" rx="14" />
          <rect class="spread-console" x="338" y="181" width="34" height="68" rx="9" />
          <path class="spread-transom" d="M458 170 L486 181 L486 249 L458 260 Z" />
          <rect class="spread-motor" x="494" y="187" width="38" height="56" rx="10" />
          <circle class="spread-bow-eye" cx="142" cy="215" r="10" />
          <line x1="292" y1="151" x2="292" y2="279" class="spread-seat-line" />
          <line x1="404" y1="151" x2="404" y2="279" class="spread-seat-line" />
        </g>
        ${renderedLines}
      </svg>
    </div>
  `;
}

function timelineTimeValue(time) {
  if (!time) return 9999;
  const [hours = "0", minutes = "0"] = String(time).split(":");
  return Number(hours) * 60 + Number(minutes);
}

function timelineTimeLabel(item) {
  if (item.startTime && item.endTime) return `${item.startTime}-${item.endTime}`;
  return item.time || item.startTime || item.endTime || "No time";
}

function tripTimelineItems(trip) {
  const items = [];
  (trip.gearUsed || []).forEach((gearItem, index) => {
    const gear = [lureName(gearItem.lureId), flasherName(gearItem.flasherId)].filter(Boolean).join(" + ");
    const details = [
      gear,
      personName(trip, gearItem.personId),
      presentationLabel(gearItem.presentation),
      gearItem.speed ? `${gearItem.speed}` : "",
      gearItem.ballDepth ? `${gearItem.ballDepth} ball` : "",
      gearItem.estimatedLureDepth ? `${gearItem.estimatedLureDepth} lure` : "",
      gearItem.estimatedDepth ? `${gearItem.estimatedDepth} estimated` : ""
    ].filter(Boolean).join(" / ");
    items.push({
      type: "Setup",
      title: setupLineDisplayLabel(trip, gearItem) || gear || `Setup ${index + 1}`,
      details,
      note: gearItem.changeNote,
      startTime: gearItem.startTime,
      endTime: gearItem.endTime,
      sortTime: timelineTimeValue(gearItem.startTime || gearItem.endTime)
    });
  });

  (trip.catches || []).forEach((catchItem, index) => {
    const record = resolveTripLineRecord({ ...catchItem, trip });
    const details = [
      record.released ? "Released" : "Kept",
      record.length,
      record.weight,
      record.fowCaught,
      record.depthDown ? `${record.depthDown} down` : "",
      record.waterDepth ? `${record.waterDepth} water` : "",
      record.setupLine ? setupLineDisplayLabel(trip, record.setupLine) : "",
      lureName(record.lureId),
      flasherName(record.flasherId),
      record.speed
    ].filter(Boolean).join(" / ");
    items.push({
      type: "Catch",
      title: catchItem.species || `Catch ${index + 1}`,
      details,
      note: catchItem.notes,
      time: catchItem.time,
      photos: catchItem.photos || [],
      sortTime: timelineTimeValue(catchItem.time)
    });
  });

  (trip.lostFish || []).forEach((fish, index) => {
    const record = resolveTripLineRecord({ ...fish, trip });
    const details = [
      record.possibleSpecies || record.species,
      record.fowCaught,
      record.depthDown ? `${record.depthDown} down` : "",
      record.waterDepth ? `${record.waterDepth} water` : "",
      record.setupLine ? setupLineDisplayLabel(trip, record.setupLine) : "",
      lureName(record.lureId),
      flasherName(record.flasherId),
      record.speed
    ].filter(Boolean).join(" / ");
    items.push({
      type: "Lost",
      title: fish.possibleSpecies || fish.species || `Lost Fish ${index + 1}`,
      details,
      note: fish.notes,
      time: fish.time,
      sortTime: timelineTimeValue(fish.time)
    });
  });

  (trip.notePhotos || []).forEach((photo) => {
    items.push({
      type: "Photo",
      title: photo.caption || photo.name || "Trip photo",
      details: "",
      time: photo.captureTime || "",
      photos: [photo],
      sortTime: photo.captureTime ? timelineTimeValue(photo.captureTime) : 10000
    });
  });

  return items.sort((a, b) => a.sortTime - b.sortTime || a.type.localeCompare(b.type));
}

function renderTripTimeline(trip) {
  const items = tripTimelineItems(trip);
  if (!items.length) return `<div class="empty-state compact-empty"><p>No timeline events logged.</p></div>`;
  return `
    <div class="trip-timeline">
      ${items.map((item) => `
        <article class="timeline-item timeline-${item.type.toLowerCase()}">
          <div class="timeline-time">${escapeHtml(timelineTimeLabel(item))}</div>
          <div class="timeline-dot" aria-hidden="true"></div>
          <div class="timeline-content">
            <span>${escapeHtml(item.type)}</span>
            <strong>${escapeHtml(item.title)}</strong>
            ${item.details ? `<p>${escapeHtml(item.details)}</p>` : ""}
            ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
            ${item.photos?.length ? summaryPhotoGrid(item.photos, "No photos", { compact: item.type === "Photo", hideCaptions: item.type === "Photo" }) : ""}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function openTripSummary(trip) {
  activeSummaryTripId = trip.id;
  els.tripSummaryTitle.textContent = trip.title || trip.location || "Trip Summary";
  const mapRecords = catchMapRecordsForTrip(trip);
  els.tripSummaryBody.innerHTML = `
    <section class="summary-hero">
      <div>
        <p class="eyebrow">${escapeHtml(formatDate(trip.date))}</p>
        <h3>${escapeHtml(trip.location || "Unknown location")}</h3>
        <p>${escapeHtml([trip.targetSpecies, trip.method, intentLabel(tripIntent(trip)), tripRatingLabel(tripRatingValue(trip))].filter(Boolean).join(" / "))}</p>
      </div>
    </section>
    <div class="metric-grid summary-metrics">
      ${summaryMetric("Hours", trimNumber(tripHours(trip)))}
      ${summaryMetric("Caught", totalCaught(trip))}
      ${summaryMetric("Catch Rate", trimNumber(catchRate(trip)))}
      ${summaryMetric("Geotagged Fish", mapRecords.length)}
    </div>
    <section class="summary-section">
      <div class="summary-section-heading">
        <h3>Fish Map</h3>
        <span>${escapeHtml(mapRecords.length ? `${mapRecords.length} plotted` : "No geotagged catches")}</span>
      </div>
      <div id="tripSummaryMap" class="fish-map trip-summary-map"></div>
    </section>
    <section class="summary-section">
      <h3>Trip Notes</h3>
      <p>${escapeHtml(trip.notes || "No notes logged.")}</p>
      <div class="summary-detail-grid">
        <span><strong>Weather</strong>${escapeHtml(trip.weather || "Not logged")}</span>
        <span><strong>Wind</strong>${escapeHtml(trip.wind || "Not logged")}</span>
        <span><strong>Water Temp</strong>${escapeHtml(trip.waterTemp || "Not logged")}</span>
        <span><strong>Structure</strong>${escapeHtml(trip.structure || "Not logged")}</span>
      </div>
    </section>
    <section class="summary-section">
      <h3>Trip Timeline</h3>
      ${renderTripTimeline(trip)}
    </section>
    ${isTrollingTripRecord(trip) ? `
      <section class="summary-section">
        <h3>Trolling Spread</h3>
        ${renderTrollingSpread(trip)}
      </section>
    ` : ""}
    <section class="summary-section">
      <h3>Catches</h3>
      <div class="summary-catch-grid">${renderTripSummaryCatches(trip)}</div>
    </section>
    <section class="summary-section">
      <h3>Setup Timeline</h3>
      ${renderTripSummaryGear(trip)}
    </section>
    <section class="summary-section">
      <h3>Trip Photos</h3>
      ${summaryPhotoGrid(trip.notePhotos || [], "No trip photos")}
    </section>
  `;
  els.tripSummaryDialog.showModal();
  renderTripSummaryMap(trip);
}
