function leaderboardRate(landed, lost) {
  const opportunities = landed + lost;
  return opportunities ? (landed / opportunities) * 100 : 0;
}

function finalizeLeaderboardRows(rows) {
  const attributedCatches = rows.reduce((total, row) => total + row.landed, 0);
  return rows
    .map((row) => ({
      ...row,
      trips: row.tripIds.size,
      landingRate: leaderboardRate(row.landed, row.lost),
      catchShare: attributedCatches ? (row.landed / attributedCatches) * 100 : 0,
      catchesPerTrip: row.tripIds.size ? row.landed / row.tripIds.size : 0
    }))
    .map(({ tripIds, ...row }) => row)
    .sort((first, second) => (
      second.landed - first.landed
      || second.landingRate - first.landingRate
      || second.catchesPerTrip - first.catchesPerTrip
      || second.trips - first.trips
      || first.name.localeCompare(second.name)
    ));
}

function equipmentLeaderboardRows(trips = [], layout = {}, { recordFilter = () => true } = {}) {
  const equipmentById = new Map((layout.equipment || []).map((item) => [String(item.id), item]));
  const rowsById = new Map();

  (layout.items || []).forEach((item) => {
    const equipment = equipmentById.get(String(item.equipmentId));
    if (!equipment) return;
    rowsById.set(String(item.id), {
      id: String(item.id),
      name: String(equipment.name || "Boat equipment"),
      type: String(equipment.type || "custom"),
      slot: Number(item.slot),
      equipment,
      landed: 0,
      lost: 0,
      tripIds: new Set()
    });
  });

  trips.forEach((trip, tripIndex) => {
    const tripId = String(trip.id || `trip-${tripIndex}`);
    const setupLines = new Map((trip.gearUsed || []).map((line) => [String(line.id), line]));
    (trip.gearUsed || []).forEach((line) => {
      const row = rowsById.get(String(line.boatItemId || ""));
      if (row) row.tripIds.add(tripId);
    });

    const countRecords = (records, field) => {
      records.forEach((record) => {
        const line = setupLines.get(String(record.setupLineId || ""));
        if (!recordFilter(record, trip, line)) return;
        const row = rowsById.get(String(line?.boatItemId || ""));
        if (!row) return;
        row[field] += field === "landed" && typeof fishCount === "function" ? fishCount(record) : 1;
        row.tripIds.add(tripId);
      });
    };
    countRecords(trip.catches || [], "landed");
    countRecords(trip.lostFish || [], "lost");
  });

  return finalizeLeaderboardRows([...rowsById.values()]);
}

function anglerLeaderboardRows(trips = [], people = [], { recordFilter = () => true } = {}) {
  const rowsById = new Map();
  const ensurePerson = (person) => {
    const id = String(person?.id || "");
    const name = String(person?.name || "").trim();
    if (!id || !name) return null;
    if (!rowsById.has(id)) {
      rowsById.set(id, { id, name, landed: 0, lost: 0, tripIds: new Set() });
    }
    return rowsById.get(id);
  };

  people.forEach(ensurePerson);
  trips.forEach((trip, tripIndex) => {
    const tripId = String(trip.id || `trip-${tripIndex}`);
    const tripPeople = new Map((trip.people || []).map((person) => [String(person.id), person]));
    (trip.people || []).forEach((person) => {
      const row = ensurePerson(person);
      if (row) row.tripIds.add(tripId);
    });

    const countRecords = (records, field) => {
      records.forEach((record) => {
        if (!recordFilter(record, trip)) return;
        const person = people.find((item) => String(item.id) === String(record.personId))
          || tripPeople.get(String(record.personId));
        const row = ensurePerson(person);
        if (!row) return;
        row[field] += field === "landed" && typeof fishCount === "function" ? fishCount(record) : 1;
        row.tripIds.add(tripId);
      });
    };
    countRecords(trip.catches || [], "landed");
    countRecords(trip.lostFish || [], "lost");
  });

  return finalizeLeaderboardRows([...rowsById.values()]);
}

function leaderboardPercent(value) {
  return `${Math.round(value)}%`;
}

function leaderboardDecimal(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function leaderboardInitials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "?";
}

function leaderboardBoatPosition(slot) {
  return Number.isInteger(slot) && slot >= 0
    ? boatLayoutPosition(slot)
    : "Boat deck";
}

function leaderboardEquipmentAvatar(row) {
  const source = typeof previewImage === "function"
    ? previewImage(row.equipment)
    : (row.equipment.previewImage || row.equipment.image || "");
  if (source) {
    return `<span class="leaderboard-avatar leaderboard-equipment-avatar"><img src="${escapeHtml(source)}" alt=""></span>`;
  }
  return `<span class="leaderboard-avatar leaderboard-equipment-avatar">${escapeHtml(leaderboardInitials(row.name))}</span>`;
}

function leaderboardEmpty(message, detail) {
  return `
    <div class="leaderboard-empty">
      <strong>${escapeHtml(message)}</strong>
      <span>${escapeHtml(detail)}</span>
    </div>
  `;
}

function leaderboardRowMarkup(row, rank, kind) {
  const subtitle = kind === "equipment"
    ? leaderboardBoatPosition(row.slot)
    : `${row.trips} trip${row.trips === 1 ? "" : "s"}`;
  const avatar = kind === "equipment"
    ? leaderboardEquipmentAvatar(row)
    : `<span class="leaderboard-avatar">${escapeHtml(leaderboardInitials(row.name))}</span>`;

  return `
    <article class="leaderboard-row" style="--leaderboard-delay: ${Math.min(rank, 8) * 35}ms">
      <span class="leaderboard-rank" aria-label="Rank ${rank}">${String(rank).padStart(2, "0")}</span>
      <div class="leaderboard-identity">
        ${avatar}
        <div>
          <strong>${escapeHtml(row.name)}</strong>
          <span>${escapeHtml(subtitle)}</span>
        </div>
      </div>
      <div class="leaderboard-performance">
        <div class="leaderboard-metrics">
          <div><strong>${row.landed}</strong><span>Landed</span></div>
          <div><strong>${row.lost}</strong><span>Lost</span></div>
          <div><strong>${leaderboardPercent(row.landingRate)}</strong><span>Landing rate</span></div>
          <div><strong>${leaderboardPercent(row.catchShare)}</strong><span>Catch share</span></div>
          <div><strong>${leaderboardDecimal(row.catchesPerTrip)}</strong><span>Catches / trip</span></div>
        </div>
        <div class="leaderboard-rate-track" aria-label="${leaderboardPercent(row.landingRate)} landing rate">
          <span style="width: ${Math.max(0, Math.min(100, row.landingRate))}%"></span>
        </div>
      </div>
    </article>
  `;
}

function leaderboardSummaryMarkup(equipmentRows, anglerRows, trips) {
  const landed = trips.reduce((total, trip) => total + (trip.catches || []).length, 0);
  const lost = trips.reduce((total, trip) => total + (trip.lostFish || []).length, 0);
  const linkedCatches = equipmentRows.reduce((total, row) => total + row.landed, 0);
  const topEquipment = equipmentRows.find((row) => row.landed > 0);
  const topAngler = anglerRows.find((row) => row.landed > 0);
  const cards = [
    {
      label: "Landing rate",
      value: leaderboardPercent(leaderboardRate(landed, lost)),
      detail: `${landed} landed · ${lost} lost`
    },
    {
      label: "Equipment linked",
      value: landed ? leaderboardPercent((linkedCatches / landed) * 100) : "0%",
      detail: `${linkedCatches} of ${landed} catches`
    },
    {
      label: "Top equipment",
      value: topEquipment?.name || "No leader yet",
      detail: topEquipment ? `${topEquipment.landed} catches · ${leaderboardPercent(topEquipment.landingRate)} landed` : "Link setup lines to start"
    },
    {
      label: "Top angler",
      value: topAngler?.name || "No leader yet",
      detail: topAngler ? `${topAngler.landed} catches · ${leaderboardPercent(topAngler.landingRate)} landed` : "Assign catches to start"
    }
  ];
  return cards.map((card) => `
    <article class="leaderboard-summary-card">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.detail)}</small>
    </article>
  `).join("");
}

function gearStatsTargetAttributes(type, id, { focusable = true } = {}) {
  return [
    `data-gear-stats-type="${escapeHtml(type)}"`,
    `data-gear-stats-id="${escapeHtml(id)}"`,
    focusable ? 'tabindex="0"' : ""
  ].filter(Boolean).join(" ");
}

function gearPerformanceStats(type, id, trips = state.trips) {
  const fieldByType = {
    lure: "lureId",
    flasher: "flasherId",
    rod: "rodId",
    reel: "reelId",
    combo: "comboId"
  };
  const field = fieldByType[type] || "";
  const layout = normalizeBoatLayout(state.settings?.boatLayout);
  const boatItemEquipment = new Map(layout.items.map((item) => [String(item.id), String(item.equipmentId)]));
  let landed = 0;
  let lost = 0;
  let allAttributedLanded = 0;
  let lastUsed = "";
  const usedTrips = new Set();

  const recordValue = (record, trip) => {
    const resolved = resolveTripLineRecord({ ...record, trip });
    if (type === "boat-equipment") {
      return boatItemEquipment.get(String(resolved.boatItemId || resolved.setupLine?.boatItemId || "")) || "";
    }
    return String(resolved[field] || "");
  };

  trips.forEach((trip, tripIndex) => {
    const tripId = String(trip.id || `trip-${tripIndex}`);
    (trip.gearUsed || []).forEach((line) => {
      const value = type === "boat-equipment"
        ? boatItemEquipment.get(String(line.boatItemId || "")) || ""
        : String(line[field] || "");
      if (value !== String(id)) return;
      usedTrips.add(tripId);
      if (trip.date && (!lastUsed || trip.date > lastUsed)) lastUsed = trip.date;
    });
    (trip.catches || []).forEach((record) => {
      const value = recordValue(record, trip);
      if (value) allAttributedLanded += fishCount(record);
      if (value !== String(id)) return;
      landed += fishCount(record);
      usedTrips.add(tripId);
      if (trip.date && (!lastUsed || trip.date > lastUsed)) lastUsed = trip.date;
    });
    (trip.lostFish || []).forEach((record) => {
      if (recordValue(record, trip) !== String(id)) return;
      lost += 1;
      usedTrips.add(tripId);
      if (trip.date && (!lastUsed || trip.date > lastUsed)) lastUsed = trip.date;
    });
  });

  return {
    landed,
    lost,
    trips: usedTrips.size,
    landingRate: leaderboardRate(landed, lost),
    catchShare: allAttributedLanded ? (landed / allAttributedLanded) * 100 : 0,
    catchesPerTrip: usedTrips.size ? landed / usedTrips.size : 0,
    lastUsed
  };
}

function gearStatsItemName(type, id) {
  const itemId = String(id || "");
  const collections = {
    lure: state.lures,
    flasher: state.flashers,
    rod: state.rods,
    reel: state.reels,
    combo: state.rodReelCombos
  };
  const item = (collections[type] || []).find((entry) => String(entry.id) === itemId);
  if (type === "combo" && item) {
    return typeof comboName === "function"
      ? comboName(item.id)
      : String(item.shortName || "Rod and reel combo");
  }
  if (item) {
    return String(item.name || item.shortName || item.model || item.brand || "").trim();
  }
  if (type === "boat-equipment") {
    const layout = normalizeBoatLayout(state.settings?.boatLayout);
    return String(layout.equipment.find((entry) => String(entry.id) === itemId)?.name || "").trim();
  }
  return "";
}

function gearStatsTooltipMarkup(type, id) {
  const stats = gearPerformanceStats(type, id);
  const itemName = gearStatsItemName(type, id);
  const typeLabel = {
    lure: "Lure performance",
    flasher: "Flasher performance",
    rod: "Rod performance",
    reel: "Reel performance",
    combo: "Combo performance",
    "boat-equipment": "Boat equipment performance"
  }[type] || "Equipment performance";
  return `
    ${itemName ? `<strong class="equipment-stats-tooltip-name">${escapeHtml(itemName)}</strong>` : ""}
    <span class="equipment-stats-tooltip-kicker">${escapeHtml(typeLabel)}</span>
    <div class="equipment-stats-tooltip-grid">
      <div><strong>${stats.landed}</strong><span>Landed</span></div>
      <div><strong>${stats.lost}</strong><span>Lost</span></div>
      <div><strong>${leaderboardPercent(stats.landingRate)}</strong><span>Landing rate</span></div>
      <div><strong>${leaderboardPercent(stats.catchShare)}</strong><span>Catch share</span></div>
      <div><strong>${leaderboardDecimal(stats.catchesPerTrip)}</strong><span>Catches / trip</span></div>
      <div><strong>${stats.trips}</strong><span>Trips</span></div>
    </div>
    <span class="equipment-stats-tooltip-foot">${stats.lastUsed ? `Last used ${escapeHtml(formatDate(stats.lastUsed))}` : "No recorded use yet"}</span>
  `;
}

function equipmentStatsTooltip() {
  let tooltip = document.querySelector("#equipmentStatsTooltip");
  if (tooltip) return tooltip;
  document.body.insertAdjacentHTML("beforeend", '<div class="equipment-stats-tooltip" id="equipmentStatsTooltip" role="tooltip" hidden></div>');
  return document.querySelector("#equipmentStatsTooltip");
}

function positionEquipmentStatsTooltip(tooltip, target, event) {
  const targetRect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const preferredX = event?.clientX || targetRect.left + targetRect.width / 2;
  const preferredY = event?.clientY || targetRect.bottom;
  const left = Math.max(10, Math.min(window.innerWidth - tooltipRect.width - 10, preferredX + 14));
  const below = preferredY + 14;
  const top = below + tooltipRect.height <= window.innerHeight - 10
    ? below
    : Math.max(10, preferredY - tooltipRect.height - 14);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showEquipmentStatsTooltip(target, event) {
  const tooltip = equipmentStatsTooltip();
  tooltip.innerHTML = gearStatsTooltipMarkup(target.dataset.gearStatsType, target.dataset.gearStatsId);
  tooltip.hidden = false;
  target.setAttribute("aria-describedby", tooltip.id);
  positionEquipmentStatsTooltip(tooltip, target, event);
}

function hideEquipmentStatsTooltip(target) {
  const tooltip = document.querySelector("#equipmentStatsTooltip");
  if (tooltip) tooltip.hidden = true;
  target?.removeAttribute("aria-describedby");
}

function bindEquipmentStatsTooltip() {
  document.addEventListener("pointerover", (event) => {
    const target = event.target.closest("[data-gear-stats-type]");
    if (!target || target.contains(event.relatedTarget)) return;
    showEquipmentStatsTooltip(target, event);
  });
  document.addEventListener("pointerout", (event) => {
    const target = event.target.closest("[data-gear-stats-type]");
    if (!target || target.contains(event.relatedTarget)) return;
    hideEquipmentStatsTooltip(target);
  });
  document.addEventListener("focusin", (event) => {
    const target = event.target.closest("[data-gear-stats-type]");
    if (target) showEquipmentStatsTooltip(target);
  });
  document.addEventListener("focusout", (event) => {
    const target = event.target.closest("[data-gear-stats-type]");
    if (target && !target.contains(event.relatedTarget)) hideEquipmentStatsTooltip(target);
  });
  window.addEventListener("scroll", () => hideEquipmentStatsTooltip(), true);
  window.addEventListener("resize", () => hideEquipmentStatsTooltip());
}

function renderStatsLeaderboard(trips = state.trips, recordFilter = () => true) {
  const equipmentContainer = document.querySelector("#statsEquipmentLeaderboard");
  const anglerContainer = document.querySelector("#statsAnglerLeaderboard");
  if (!equipmentContainer || !anglerContainer) return;
  const layout = normalizeBoatLayout(state.settings?.boatLayout);
  const equipmentRows = equipmentLeaderboardRows(trips, layout, { recordFilter }).slice(0, 5);
  const anglerRows = anglerLeaderboardRows(trips, state.people, { recordFilter }).slice(0, 5);
  equipmentContainer.innerHTML = equipmentRows.length
    ? equipmentRows.map((row, index) => leaderboardRowMarkup(row, index + 1, "equipment")).join("")
    : leaderboardEmpty("No linked equipment in this scope", "Link boat items to setup lines to rank them here.");
  anglerContainer.innerHTML = anglerRows.length
    ? anglerRows.map((row, index) => leaderboardRowMarkup(row, index + 1, "angler")).join("")
    : leaderboardEmpty("No attributed anglers in this scope", "Choose an angler on catches and missed fish.");
}

function renderLeaderboard() {
  const equipmentContainer = document.querySelector("#equipmentLeaderboard");
  const anglerContainer = document.querySelector("#anglerLeaderboard");
  if (!equipmentContainer || !anglerContainer) return;

  const layout = normalizeBoatLayout(state.settings?.boatLayout);
  const equipmentRows = equipmentLeaderboardRows(state.trips, layout);
  const anglerRows = anglerLeaderboardRows(state.trips, state.people);

  document.querySelector("#leaderboardSummary").innerHTML = leaderboardSummaryMarkup(equipmentRows, anglerRows, state.trips);
  document.querySelector("#equipmentLeaderboardCount").textContent = `${equipmentRows.length} item${equipmentRows.length === 1 ? "" : "s"}`;
  document.querySelector("#anglerLeaderboardCount").textContent = `${anglerRows.length} angler${anglerRows.length === 1 ? "" : "s"}`;

  equipmentContainer.innerHTML = equipmentRows.length
    ? equipmentRows.map((row, index) => leaderboardRowMarkup(row, index + 1, "equipment")).join("")
    : leaderboardEmpty("No deck equipment yet", "Place equipment on the Boat page, then link it to a trip setup line.");
  anglerContainer.innerHTML = anglerRows.length
    ? anglerRows.map((row, index) => leaderboardRowMarkup(row, index + 1, "angler")).join("")
    : leaderboardEmpty("No anglers yet", "Add people to a trip and select who landed or lost each fish.");
}

if (typeof document !== "undefined") bindEquipmentStatsTooltip();
