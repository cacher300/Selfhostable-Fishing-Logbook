function catchMapRecordForTrip(trip, catchItem, catchIndex) {
  const mediaWithCoordinates = (catchItem.photos || []).find((photo) => isUsableCoordinates(photo.coordinates));
  const coordinates = isUsableCoordinates(catchItem.coordinates) ? catchItem.coordinates : mediaWithCoordinates?.coordinates;
  if (!isUsableCoordinates(coordinates)) return null;
  return {
    id: catchItem.id || `${trip.id}-${catchIndex}`,
    type: "catch",
    filterValue: catchItem.species || "Unknown species",
    trip,
    catchItem,
    media: mediaWithCoordinates,
    coordinates
  };
}

function tripMediaMapRecordsForTrip(trip) {
  return (trip.notePhotos || []).map((media, index) => {
    if (!isUsableCoordinates(media.coordinates)) return null;
    const video = isVideoMedia(media);
    return {
      id: media.id || `${trip.id}-media-${index}`,
      type: video ? "trip-video" : "trip-photo",
      filterValue: video ? "Trip Videos" : "Trip Photos",
      trip,
      media,
      coordinates: media.coordinates
    };
  }).filter(Boolean);
}

function mapRecordsForTrip(trip) {
  return [
    ...(trip.catches || []).map((catchItem, catchIndex) => catchMapRecordForTrip(trip, catchItem, catchIndex)).filter(Boolean),
    ...tripMediaMapRecordsForTrip(trip)
  ];
}

function catchMapRecords() {
  return state.trips.flatMap(mapRecordsForTrip);
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

function mapRecordColor(record) {
  if (record.type === "trip-photo") return "#2763a7";
  if (record.type === "trip-video") return "#9a5b00";
  return speciesColor(record.catchItem?.species);
}

function addMapMarker(layerGroup, record) {
  const color = mapRecordColor(record);
  return L.circleMarker([record.coordinates.latitude, record.coordinates.longitude], {
    radius: record.type === "catch" ? 8 : 7,
    color,
    fillColor: color,
    fillOpacity: 0.86,
    weight: 2,
    pane: record.type === "catch" ? "fishMarkers" : "tripMediaMarkers"
  }).bindPopup(mapPopupHtml(record)).addTo(layerGroup);
}

function ensureMapMarkerPanes(map) {
  if (!map.getPane("tripMediaMarkers")) {
    map.createPane("tripMediaMarkers");
    map.getPane("tripMediaMarkers").style.zIndex = 610;
  }
  if (!map.getPane("fishMarkers")) {
    map.createPane("fishMarkers");
    map.getPane("fishMarkers").style.zIndex = 620;
  }
}

function seamlessMapOptions() {
  return {
    zoomSnap: 1,
    zoomDelta: 1
  };
}

function snapMapTilePane(map) {
  const tilePane = map?.getPane?.("tilePane");
  if (!tilePane) return;
  tilePane.style.marginLeft = "0px";
  tilePane.style.marginTop = "0px";
  const tile = tilePane.querySelector(".leaflet-tile-loaded, .leaflet-tile");
  const rect = (tile || tilePane).getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const snappedLeft = Math.round(rect.left * pixelRatio) / pixelRatio;
  const snappedTop = Math.round(rect.top * pixelRatio) / pixelRatio;
  tilePane.style.marginLeft = `${snappedLeft - rect.left}px`;
  tilePane.style.marginTop = `${snappedTop - rect.top}px`;
}

function bindMapTilePaneSnapping(map) {
  if (!map || map._logbookTilePaneSnapping) return;
  map._logbookTilePaneSnapping = true;
  map.on("moveend zoomend resize", () => requestAnimationFrame(() => snapMapTilePane(map)));
}

function addSeamlessTileLayer(map) {
  const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  tileLayer.on("load tileload", () => requestAnimationFrame(() => snapMapTilePane(map)));
  bindMapTilePaneSnapping(map);
  return tileLayer;
}

function settleMapLayout(map) {
  setTimeout(() => {
    map.invalidateSize();
    snapMapTilePane(map);
  }, 0);
}

function mapRecordTitle(record) {
  if (record.type === "trip-photo") return record.media.caption || "Trip photo";
  if (record.type === "trip-video") return record.media.caption || "Trip video";
  return record.catchItem?.species || "Fish";
}

function mapRecordFilterOptions(records) {
  const species = records
    .filter((record) => record.type === "catch")
    .map((record) => record.catchItem.species || "Unknown species");
  const mediaTypes = records
    .filter((record) => record.type !== "catch")
    .map((record) => record.filterValue);
  return ["All map items", ...new Set([...species, ...mediaTypes])];
}

function renderMapSpeciesFilter(records) {
  const options = mapRecordFilterOptions(records);
  if (!options.includes(activeMapSpecies)) activeMapSpecies = "All map items";
  els.mapSpeciesFilter.innerHTML = options.map((option) => (
    `<option value="${escapeHtml(option)}" ${option === activeMapSpecies ? "selected" : ""}>${escapeHtml(option)}</option>`
  )).join("");
}

function filteredMapRecords(records, filterValue = activeMapSpecies) {
  if (filterValue === "All map items") return records;
  return records.filter((record) => record.filterValue === filterValue);
}

function renderMapLegend(records) {
  const options = mapRecordFilterOptions(records).slice(1);
  if (!options.length) return "";
  return `
    <div class="map-legend">
      ${options.map((name) => `
        <span><i style="--pin-color:${name === "Trip Photos" ? "#2763a7" : name === "Trip Videos" ? "#9a5b00" : speciesColor(name)}"></i>${escapeHtml(name)}</span>
      `).join("")}
    </div>
  `;
}

function mapPopupHtml(record) {
  const { trip, media, coordinates } = record;
  const title = [mapRecordTitle(record), trip.location].filter(Boolean).join(" at ");
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`;
  return `
    <div class="map-popup">
      ${media?.image ? mediaMarkup(media) : ""}
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(formatDate(trip.date))}</span>
      <span>${escapeHtml(formatCoordinates(coordinates))}</span>
      <a href="${mapsUrl}" target="_blank" rel="noreferrer">Open in Maps</a>
    </div>
  `;
}

function renderMapList(records) {
  if (!records.length) {
    els.mapCatchList.innerHTML = `<div class="empty-state"><p>No geotagged map items match this filter.</p></div>`;
    return;
  }

  els.mapCatchList.innerHTML = records.map((record) => {
    const { trip, media, coordinates } = record;
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`;
    return `
      <article class="map-catch-card">
        ${media?.image ? mediaMarkup(media) : ""}
        <div>
          <strong>${escapeHtml(mapRecordTitle(record))}</strong>
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
  els.mapSummary.textContent = records.length === 1 ? "1 geotagged item" : `${records.length} geotagged items`;
  renderMapList(records);
  els.mapCatchList.insertAdjacentHTML("afterbegin", renderMapLegend(allRecords));

  if (!window.L) {
    els.fishMap.innerHTML = `<div class="empty-state"><p>Map tiles are unavailable, but saved GPS coordinates are listed below.</p></div>`;
    return;
  }

  if (!fishMap) {
    fishMap = L.map(els.fishMap, seamlessMapOptions());
    addSeamlessTileLayer(fishMap);
    ensureMapMarkerPanes(fishMap);
    fishMapMarkers = L.layerGroup().addTo(fishMap);
  }
  ensureMapMarkerPanes(fishMap);

  fishMapMarkers.clearLayers();
  if (!records.length) {
    fishMap.setView([43.8, -79.5], 6);
    settleMapLayout(fishMap);
    return;
  }

  const bounds = [];
  records.forEach((record) => {
    const point = [record.coordinates.latitude, record.coordinates.longitude];
    bounds.push(point);
    addMapMarker(fishMapMarkers, record);
  });

  if (bounds.length === 1) fishMap.setView(bounds[0], 13);
  else fishMap.fitBounds(bounds, { padding: [28, 28] });
  settleMapLayout(fishMap);
}

function catchMapRecordsForTrip(trip) {
  return mapRecordsForTrip(trip);
}

function renderTripSummaryMapFilter(records) {
  const filter = document.querySelector("#tripSummaryMapFilter");
  if (!filter) return;
  const options = mapRecordFilterOptions(records);
  if (!options.includes(activeTripSummaryMapFilter)) activeTripSummaryMapFilter = "All map items";
  filter.innerHTML = options.map((option) => (
    `<option value="${escapeHtml(option)}" ${option === activeTripSummaryMapFilter ? "selected" : ""}>${escapeHtml(option)}</option>`
  )).join("");
}

function renderTripSummaryMap(trip) {
  const mapNode = document.querySelector("#tripSummaryMap");
  if (!mapNode) return;
  const allRecords = catchMapRecordsForTrip(trip);
  renderTripSummaryMapFilter(allRecords);
  const records = filteredMapRecords(allRecords, activeTripSummaryMapFilter);

  if (!window.L) {
    mapNode.innerHTML = `<div class="empty-state"><p>Map tiles are unavailable.</p></div>`;
    return;
  }

  if (!tripSummaryMap) {
    tripSummaryMap = L.map(mapNode, seamlessMapOptions());
    addSeamlessTileLayer(tripSummaryMap);
    ensureMapMarkerPanes(tripSummaryMap);
    tripSummaryMapMarkers = L.layerGroup().addTo(tripSummaryMap);
  } else if (tripSummaryMap.getContainer() !== mapNode) {
    tripSummaryMap.remove();
    tripSummaryMap = L.map(mapNode, seamlessMapOptions());
    addSeamlessTileLayer(tripSummaryMap);
    ensureMapMarkerPanes(tripSummaryMap);
    tripSummaryMapMarkers = L.layerGroup().addTo(tripSummaryMap);
  }
  ensureMapMarkerPanes(tripSummaryMap);

  tripSummaryMapMarkers.clearLayers();
  if (!records.length) {
    tripSummaryMap.setView([43.8, -79.5], 6);
    settleMapLayout(tripSummaryMap);
    return;
  }

  const bounds = [];
  records.forEach((record) => {
    const point = [record.coordinates.latitude, record.coordinates.longitude];
    bounds.push(point);
    addMapMarker(tripSummaryMapMarkers, record);
  });

  if (bounds.length === 1) tripSummaryMap.setView(bounds[0], 13);
  else tripSummaryMap.fitBounds(bounds, { padding: [24, 24] });
  settleMapLayout(tripSummaryMap);
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

function compactCatchDetails(trip, catchItem, options = {}) {
  const record = resolveTripLineRecord({ ...catchItem, trip });
  const gear = record.setupLine
    ? setupLineDisplayLabel(trip, record.setupLine)
    : [lureName(record.lureId), flasherName(record.flasherId)].filter(Boolean).join(" + ");
  const fishingDetails = [
    options.showOutcome ? (record.released ? "Released" : "Kept") : (record.released ? "Released" : ""),
    record.length,
    record.weight,
    record.time,
    record.fowCaught,
    record.depthDown ? `${record.depthDown} down` : "",
    record.waterDepth ? `${record.waterDepth} water` : "",
    record.speed,
    gear
  ].filter(Boolean).join(" / ");
  const weatherDetails = [
    catchWeatherSummary(catchItem.weatherData),
    catchWeatherComparison(catchItem.weatherData, trip.weatherData),
    moonWindowForTime(catchItem.time, trip.weatherData?.sunMoon)
  ].filter(Boolean).join(" / ");
  const location = record.coordinates ? formatCoordinates(record.coordinates) : "";
  return [fishingDetails, weatherDetails, location].filter(Boolean).join(" | ");
}

function renderTripSummaryCatches(trip) {
  const catches = trip.catches || [];
  if (!catches.length) return `<div class="empty-state compact-empty"><p>No catches logged.</p></div>`;
  return catches.map((catchItem, index) => {
    const details = compactCatchDetails(trip, catchItem);
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
        const timeRange = formatDisplayTimeRange(gearItem.startTime, gearItem.endTime);
        const rodReel = comboName(gearItem.comboId) || [rodName(gearItem.rodId), reelName(gearItem.reelId)].filter(Boolean).join(" + ");
        const gear = [rodReel, lureName(gearItem.lureId), flasherName(gearItem.flasherId)].filter(Boolean).join(" + ");
        const details = [
          timeRange,
          setupLineSideLabel(gearItem.side),
          presentationLabel(gearItem.presentation),
          gearItem.deepestRigger ? "Deepest rigger" : ""
        ].filter(Boolean).join(" / ");
        return `
          <article>
            <strong>${escapeHtml(setupLineDisplayLabel(trip, gearItem) || `Rod ${index + 1}`)}${gear && gearItem.lineLabel ? `: ${escapeHtml(gear)}` : ""}</strong>
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

function spreadPresentationDistance(gearItem) {
  const presentation = gearItem.presentation || "";
  if (presentation === "flatline-leadcore") return "wide";
  if (presentation === "dipsey-diver") return "mid";
  return "straight";
}

function spreadPresentationRank(gearItem) {
  const distance = spreadPresentationDistance(gearItem);
  if (distance === "wide") return 0;
  if (distance === "mid") return 1;
  if (gearItem.presentation === "downrigger") return 2;
  if (gearItem.presentation === "cheater") return 3;
  return 4;
}

function normalizeSpreadSide(gearItem) {
  if (["port", "center", "starboard"].includes(gearItem.side)) return gearItem.side;
  if (["downrigger", "cheater"].includes(gearItem.presentation)) return "center";
  return "starboard";
}

function spreadLineKind(gearItem) {
  if (gearItem.presentation === "downrigger") return "downrigger";
  if (gearItem.presentation === "cheater") return "cheater";
  return "branch";
}

function spreadSternSide(gearItem) {
  const side = normalizeSpreadSide(gearItem);
  return side === "port" || side === "starboard" ? side : "center";
}

function spreadBranchSide(gearItem) {
  return normalizeSpreadSide(gearItem) === "port" ? "port" : "starboard";
}

function spreadSternStart(side) {
  if (side === "port") return { x: 494, y: 209 };
  if (side === "starboard") return { x: 494, y: 271 };
  return { x: 536, y: 240 };
}

function spreadBranchAnchor(side) {
  if (side === "port") return { x: 350, y: 176 };
  return { x: 350, y: 304 };
}

function spreadBranchPoint(side, laneY) {
  const anchor = spreadBranchAnchor(side);
  return { x: anchor.x + Math.abs(anchor.y - laneY), y: laneY };
}

function spreadSternLaneYs(side, count) {
  if (!count) return [];
  if (side === "center") {
    const middle = 240;
    const step = 34;
    const offset = ((count - 1) * step) / 2;
    return Array.from({ length: count }, (_, index) => middle - offset + step * index);
  }
  const zones = {
    port: { start: 206, step: -26 },
    starboard: { start: 274, step: 26 }
  };
  const zone = zones[side] || { start: 240, step: 34 };
  return Array.from({ length: count }, (_, index) => zone.start + zone.step * index);
}

function spreadBranchLaneYs(side, count) {
  if (!count) return [];
  const zones = {
    port: { start: 66, step: 46 },
    starboard: { start: 474, step: -46 }
  };
  const zone = zones[side];
  return Array.from({ length: count }, (_, index) => zone.start + zone.step * index);
}

function buildSpreadLayouts(trip, lines) {
  const branchGroups = { port: [], starboard: [] };
  const downriggerGroups = { port: [], center: [], starboard: [] };
  const cheaterGroups = { port: [], center: [], starboard: [] };
  lines.forEach((gearItem, originalIndex) => {
    const kind = spreadLineKind(gearItem);
    if (kind === "branch") {
      const side = spreadBranchSide(gearItem);
      branchGroups[side].push({ gearItem, originalIndex, side, kind });
      return;
    }
    const side = spreadSternSide(gearItem);
    const group = kind === "cheater" ? cheaterGroups : downriggerGroups;
    group[side].push({ gearItem, originalIndex, side, kind });
  });

  [...Object.values(branchGroups), ...Object.values(downriggerGroups), ...Object.values(cheaterGroups)].forEach((group) => {
    group.sort((a, b) => (
      spreadPresentationRank(a.gearItem) - spreadPresentationRank(b.gearItem) ||
      a.originalIndex - b.originalIndex
    ));
  });

  const layouts = [];
  const spreaders = [];
  const labelX = 790;
  const lineEndX = labelX - 24;
  const downriggerBySide = {};

  ["port", "starboard"].forEach((side) => {
    const laneYs = spreadBranchLaneYs(side, branchGroups[side].length);
    if (branchGroups[side].length) {
      const anchor = spreadBranchAnchor(side);
      const end = spreadBranchPoint(side, laneYs[0]);
      spreaders.push({ side, path: `M ${anchor.x} ${anchor.y} L ${end.x} ${end.y}` });
    }
    branchGroups[side].forEach((item, index) => {
      const laneY = laneYs[index];
      const branch = spreadBranchPoint(side, laneY);
      layouts.push({
        ...item,
        laneY,
        labelY: laneY,
        path: `M ${branch.x} ${branch.y} L ${lineEndX} ${laneY}`,
        marker: branch,
        labelX,
        lineEndX,
        counts: setupLineCounts(trip, item.gearItem)
      });
    });
  });

  ["port", "center", "starboard"].forEach((side) => {
    const laneYs = spreadSternLaneYs(side, downriggerGroups[side].length);
    downriggerGroups[side].forEach((item, index) => {
      const start = spreadSternStart(side);
      const laneY = laneYs[index];
      const layout = {
        ...item,
        start,
        laneY,
        labelY: laneY,
        path: `M ${start.x} ${start.y} L ${lineEndX} ${laneY}`,
        marker: { x: lineEndX, y: laneY },
        labelX,
        lineEndX,
        counts: setupLineCounts(trip, item.gearItem)
      };
      downriggerBySide[side] = downriggerBySide[side] || layout;
      layouts.push(layout);
    });
  });

  ["port", "center", "starboard"].forEach((side) => {
    const laneYs = spreadSternLaneYs(side, cheaterGroups[side].length);
    cheaterGroups[side].forEach((item, index) => {
      const parent = downriggerBySide[side];
      const start = parent?.start || spreadSternStart(side);
      const laneY = parent?.laneY || laneYs[index] || start.y;
      const endX = parent?.lineEndX || lineEndX;
      const marker = { x: start.x + (endX - start.x) * 0.5, y: start.y + (laneY - start.y) * 0.5 };
      layouts.push({
        ...item,
        start,
        laneY,
        labelY: marker.y - 12,
        path: `M ${marker.x - 18} ${marker.y} L ${marker.x + 18} ${marker.y}`,
        marker,
        labelX: marker.x + 14,
        lineEndX: endX,
        counts: setupLineCounts(trip, item.gearItem)
      });
    });
  });

  return { layouts, spreaders };
}

function spreadLineTitle(gearItem) {
  return [setupLineSideLabel(normalizeSpreadSide(gearItem)), presentationLabel(gearItem.presentation) || "Setup"].filter(Boolean).join(" ");
}

function spreadCountText(counts) {
  return `${counts.fish} fish${counts.lost ? ` / ${counts.lost} lost` : ""}`;
}

function truncateSpreadText(value, maxLength = 34) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function renderTrollingSpread(trip) {
  if (!isTrollingTripRecord(trip)) return "";
  const lines = (trip.gearUsed || []).filter((gearItem) => gearItem.lureId || gearItem.flasherId || gearItem.presentation);
  if (!lines.length) return `<div class="empty-state compact-empty"><p>No trolling setup lines logged.</p></div>`;

  const spreadPlan = buildSpreadLayouts(trip, lines);
  const layouts = spreadPlan.layouts;
  const renderedSpreaders = spreadPlan.spreaders.map((spreader) => (
    `<path class="spread-side-spreader spread-${escapeHtml(spreader.side)}" d="${spreader.path}" />`
  )).join("");
  const renderedLines = layouts.map((layout) => {
    const gear = gearComboName(layout.gearItem.lureId, layout.gearItem.flasherId) || "No gear logged";
    const label = truncateSpreadText(spreadLineTitle(layout.gearItem), 32);
    const detail = truncateSpreadText(`${gear} / ${spreadCountText(layout.counts)}`, 42);
    return `
      <g class="spread-line spread-${escapeHtml(layout.side)} spread-${escapeHtml(layout.kind)}">
        <path d="${layout.path}" />
        <circle cx="${layout.marker.x}" cy="${layout.marker.y}" r="5" />
        <text x="${layout.labelX}" y="${layout.labelY - 8}" text-anchor="start" class="spread-line-label">${escapeHtml(label)}</text>
        <text x="${layout.labelX}" y="${layout.labelY + 12}" text-anchor="start" class="spread-line-detail">${escapeHtml(detail)}</text>
      </g>
    `;
  }).join("");
  const detailList = layouts.map((layout) => {
    const gear = gearComboName(layout.gearItem.lureId, layout.gearItem.flasherId) || "No gear logged";
    return `
      <article class="spread-detail-card">
        <strong>${escapeHtml(setupLineDisplayLabel(trip, layout.gearItem))}</strong>
        <span>${escapeHtml([gear, spreadCountText(layout.counts)].filter(Boolean).join(" / "))}</span>
      </article>
    `;
  }).join("");

  return `
    <div class="spread-diagram-wrap">
      <svg class="spread-diagram" viewBox="0 0 1200 520" role="img" aria-label="Trolling spread diagram">
        <defs>
          <linearGradient id="boatHull" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stop-color="#f8fbfd" />
            <stop offset="0.55" stop-color="#ffffff" />
            <stop offset="1" stop-color="#dbe7ef" />
          </linearGradient>
        </defs>
        <path class="spread-water" d="M40 330 C154 310 238 340 356 316 C492 288 814 318 1160 292 L1160 502 L40 502 Z" />
        <g class="spread-boat">
          <path class="spread-hull" d="M92 240 C134 184 204 152 292 150 L440 150 C475 150 498 174 498 209 L498 271 C498 306 475 330 440 330 L292 330 C204 328 134 296 92 240 Z" />
          <path class="spread-rub-rail" d="M128 240 C168 198 224 176 294 176 L430 176 C448 176 462 190 462 209 L462 271 C462 290 448 304 430 304 L294 304 C224 304 168 282 128 240 Z" />
          <path class="spread-bow-deck" d="M152 240 C188 210 230 196 284 196 L284 284 C230 284 188 270 152 240 Z" />
          <rect class="spread-cockpit" x="302" y="184" width="94" height="112" rx="14" />
          <rect class="spread-console" x="338" y="206" width="36" height="68" rx="9" />
          <path class="spread-transom" d="M462 194 L494 209 L494 271 L462 286 Z" />
          <rect class="spread-motor" x="504" y="212" width="42" height="56" rx="10" />
          <circle class="spread-bow-eye" cx="124" cy="240" r="10" />
          <line x1="284" y1="176" x2="284" y2="304" class="spread-seat-line" />
          <line x1="408" y1="176" x2="408" y2="304" class="spread-seat-line" />
        </g>
        ${renderedSpreaders}
        ${renderedLines}
      </svg>
    </div>
    <div class="spread-detail-list">
      ${detailList}
    </div>
  `;
}

function timelineTimeValue(time) {
  if (!time) return 9999;
  const [hours = "0", minutes = "0"] = String(time).split(":");
  return Number(hours) * 60 + Number(minutes);
}

function timelineTimeLabel(item) {
  if (item.startTime && item.endTime) {
    const start = formatDisplayTime(item.startTime);
    const end = formatDisplayTime(item.endTime);
    if (timeFormatPreference() === "12") {
      const startMatch = start.match(/^(.+)\s(AM|PM)$/);
      const endMatch = end.match(/^(.+)\s(AM|PM)$/);
      if (startMatch && endMatch && startMatch[2] === endMatch[2]) {
        return `${startMatch[1]}-${endMatch[1]} ${endMatch[2]}`;
      }
    }
    return [start, end].filter(Boolean).join("-");
  }
  return formatDisplayTime(item.time || item.startTime || item.endTime) || "No time";
}

function isTripEndTime(trip, time) {
  return Boolean(time && trip.endTime && String(time).slice(0, 5) === String(trip.endTime).slice(0, 5));
}

function setupTimelineDetail(trip, gearItem, index) {
  const label = setupLineDisplayLabel(trip, gearItem) || `Rod ${index + 1}`;
  const rodReel = comboName(gearItem.comboId) || [rodName(gearItem.rodId), reelName(gearItem.reelId)].filter(Boolean).join(" + ");
  const gear = [lureName(gearItem.lureId), flasherName(gearItem.flasherId)].filter(Boolean).join(" + ");
  const details = [
    gear,
    rodReel && !label.includes(rodReel) ? rodReel : "",
    presentationLabel(gearItem.presentation),
    gearItem.deepestRigger ? "Deepest rigger" : ""
  ].filter(Boolean).join(" / ");
  return details ? `${label}: ${details}` : label;
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
      event.deployed.push(setupTimelineDetail(trip, gearItem, index));
      if (gearItem.changeNote) event.notes.push(gearItem.changeNote);
    }
    if (gearItem.endTime && !isTripEndTime(trip, gearItem.endTime)) {
      ensure(gearItem.endTime).pulled.push(setupLineDisplayLabel(trip, gearItem) || `Rod ${index + 1}`);
    }
  });

  return [...events.values()].map((event) => {
    const parts = [
      event.pulled.length ? `Pulled: ${event.pulled.join(", ")}` : "",
      event.deployed.length ? `Deployed: ${event.deployed.join("; ")}` : ""
    ].filter(Boolean);
    const title = event.pulled.length && event.deployed.length
      ? "Setup change"
      : event.deployed.length
        ? `${event.deployed.length} ${event.deployed.length === 1 ? "rod" : "rods"} deployed`
        : `${event.pulled.length} ${event.pulled.length === 1 ? "rod" : "rods"} pulled`;
    return {
      type: "Setup",
      title,
      details: parts.join(" / "),
      note: [...new Set(event.notes)].join(" / "),
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
    const details = compactCatchDetails(trip, catchItem, { showOutcome: true });
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

  return items.sort((a, b) => a.sortTime - b.sortTime || timelineSortOrder(a.type) - timelineSortOrder(b.type) || a.type.localeCompare(b.type));
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
            <span class="timeline-type">${escapeHtml(item.type)}</span>
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
      ${summaryMetric("Geotagged Items", mapRecords.length)}
    </div>
    <section class="summary-section">
      <div class="summary-section-heading">
        <h3>Fish Map</h3>
        <div class="summary-map-tools">
          <label>
            <span>Species</span>
            <select id="tripSummaryMapFilter"></select>
          </label>
          <span>${escapeHtml(mapRecords.length ? `${mapRecords.length} plotted` : "No geotagged items")}</span>
        </div>
      </div>
      <div id="tripSummaryMap" class="fish-map trip-summary-map"></div>
    </section>
    <section class="summary-section">
      <h3>Trip Notes</h3>
      <p>${escapeHtml(trip.notes || "No notes logged.")}</p>
      <div class="summary-detail-grid">
        <span><strong>Weather</strong>${escapeHtml(trip.weather || "Not logged")}</span>
        <span><strong>Water Temp</strong>${escapeHtml(trip.waterTemp || "Not logged")}</span>
        <span><strong>Structure</strong>${escapeHtml(trip.structure || "Not logged")}</span>
        ${renderWeatherDetails(trip.weatherData, trip)}
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
