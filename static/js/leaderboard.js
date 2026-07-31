function leaderboardRate(landed, lost) {
  const opportunities = landed + lost;
  return opportunities ? (landed / opportunities) * 100 : 0;
}

function finalizeLeaderboardRows(rows, { shareGroup = () => "all" } = {}) {
  const attributedCatches = new Map();
  rows.forEach((row) => {
    const group = shareGroup(row);
    attributedCatches.set(group, (attributedCatches.get(group) || 0) + row.landed);
  });
  return rows
    .map((row) => {
      const catchesInGroup = attributedCatches.get(shareGroup(row)) || 0;
      return {
        ...row,
        trips: row.tripIds.size,
        landingRate: leaderboardRate(row.landed, row.lost),
        catchShare: catchesInGroup ? (row.landed / catchesInGroup) * 100 : 0,
        catchesPerTrip: row.tripIds.size ? row.landed / row.tripIds.size : 0
      };
    })
    .map(({ tripIds, ...row }) => row)
    .sort((first, second) => (
      second.landed - first.landed
      || second.landingRate - first.landingRate
      || second.catchesPerTrip - first.catchesPerTrip
      || second.trips - first.trips
      || first.name.localeCompare(second.name)
    ));
}

function leaderboardGearName(item, type, collections) {
  const fallbackByType = {
    lure: "Unnamed lure",
    flasher: "Unnamed flasher",
    rod: "Unnamed rod",
    reel: "Unnamed reel",
    combo: "Rod and reel combo"
  };
  if (type === "combo") {
    if (item.shortName) return String(item.shortName);
    const rod = (collections.rods || []).find((candidate) => String(candidate.id) === String(item.rodId));
    const reel = (collections.reels || []).find((candidate) => String(candidate.id) === String(item.reelId));
    const parts = [
      rod ? leaderboardGearName(rod, "rod", collections) : "",
      reel ? leaderboardGearName(reel, "reel", collections) : ""
    ].filter(Boolean);
    if (parts.length) return parts.join(" + ");
  }
  return [item.brand, item.name]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    || String(item.shortName || fallbackByType[type] || "Fishing gear");
}

function fishingGearLeaderboardRows(trips = [], collections = {}, { recordFilter = () => true } = {}) {
  const gearTypes = [
    { collection: "lures", type: "lure", field: "lureId", label: "Lure" },
    { collection: "flashers", type: "flasher", field: "flasherId", label: "Flasher" },
    { collection: "rods", type: "rod", field: "rodId", label: "Rod" },
    { collection: "reels", type: "reel", field: "reelId", label: "Reel" },
    { collection: "rodReelCombos", type: "combo", field: "comboId", label: "Rod + reel combo" }
  ];
  const rowsById = new Map();

  gearTypes.forEach(({ collection, type, field, label }) => {
    (collections[collection] || []).forEach((item) => {
      const id = String(item.id || "");
      if (!id) return;
      rowsById.set(`${type}:${id}`, {
        id,
        gearType: type,
        field,
        typeLabel: label,
        name: leaderboardGearName(item, type, collections),
        item,
        landed: 0,
        lost: 0,
        tripIds: new Set()
      });
    });
  });

  trips.forEach((trip, tripIndex) => {
    const tripId = String(trip.id || `trip-${tripIndex}`);
    (trip.gearUsed || []).forEach((line) => {
      gearTypes.forEach(({ type, field }) => {
        const row = rowsById.get(`${type}:${String(line[field] || "")}`);
        if (row) row.tripIds.add(tripId);
      });
    });

    const countRecords = (records, field) => {
      records.forEach((record) => {
        const resolved = typeof resolveTripLineRecord === "function"
          ? resolveTripLineRecord({ ...record, trip })
          : record;
        if (!recordFilter(record, trip, resolved.setupLine)) return;
        gearTypes.forEach(({ type, field: gearField }) => {
          const row = rowsById.get(`${type}:${String(resolved[gearField] || "")}`);
          if (!row) return;
          row[field] += field === "landed" && typeof fishCount === "function" ? fishCount(record) : 1;
          row.tripIds.add(tripId);
        });
      });
    };
    countRecords(trip.catches || [], "landed");
    countRecords(trip.lostFish || [], "lost");
  });

  return finalizeLeaderboardRows(
    [...rowsById.values()],
    { shareGroup: (row) => row.gearType }
  );
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

function leaderboardGearAvatar(row) {
  const source = typeof previewImage === "function"
    ? previewImage(row.item)
    : (row.item.previewImage || row.item.image || "");
  if (source) {
    return `<button class="leaderboard-avatar leaderboard-equipment-avatar leaderboard-preview-button" type="button" data-leaderboard-preview-type="${escapeHtml(row.gearType)}" data-leaderboard-preview-id="${escapeHtml(row.id)}" aria-label="Open details for ${escapeHtml(row.name)}"><img src="${escapeHtml(source)}" alt=""></button>`;
  }
  return "";
}

function leaderboardEmpty(message, detail) {
  return `
    <div class="leaderboard-empty">
      <strong>${escapeHtml(message)}</strong>
      <span>${escapeHtml(detail)}</span>
    </div>
  `;
}

function bindLeaderboardPreviews() {
  document.addEventListener("click", (event) => {
    const previewButton = event.target.closest("[data-leaderboard-preview-type]");
    if (!previewButton) return;
    const { leaderboardPreviewType: type, leaderboardPreviewId: id } = previewButton.dataset;
    if (!type || !id) return;
    if (type === "lure") {
      const lure = state.lures.find((item) => String(item.id) === id);
      if (lure) openLureInfoDialog(lure, "leaderboard");
      return;
    }
    if (type === "flasher") {
      const flasher = state.flashers.find((item) => String(item.id) === id);
      if (flasher) openFlasherInfoDialog(flasher, "leaderboard");
      return;
    }
    if (typeof openInventoryItemInfo === "function") openInventoryItemInfo(type, id);
  });
}

function leaderboardRowMarkup(row, rank, kind) {
  const tripsLabel = `${row.trips} trip${row.trips === 1 ? "" : "s"}`;
  const subtitle = kind === "gear" ? "" : tripsLabel;
  const avatar = kind === "gear" ? leaderboardGearAvatar(row) : "";

  return `
    <article class="leaderboard-row" style="--leaderboard-delay: ${Math.min(rank, 8) * 35}ms">
      <span class="leaderboard-rank" aria-label="Rank ${rank}">${String(rank).padStart(2, "0")}</span>
      <div class="leaderboard-identity${avatar ? "" : " leaderboard-identity--text-only"}">
        ${avatar}
        <div>
          <strong>${escapeHtml(row.name)}</strong>
          ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
        </div>
      </div>
      <div class="leaderboard-performance">
        <div class="leaderboard-metrics">
          <div><strong>${row.landed}</strong><span>Landed</span></div>
          <div><strong>${row.lost}</strong><span>Lost</span></div>
          <div><strong>${leaderboardPercent(row.landingRate)}</strong><span>Landing rate</span></div>
          <div><strong>${row.trips}</strong><span>Trips</span></div>
          <div><strong>${leaderboardPercent(row.catchShare)}</strong><span>Catch share</span></div>
          <div><strong>${leaderboardDecimal(row.catchesPerTrip)}</strong><span>Catches / trip</span></div>
        </div>
      </div>
    </article>
  `;
}

function leaderboardLinkedGearCatches(trips) {
  const gearFields = ["lureId", "flasherId", "rodId", "reelId", "comboId"];
  return trips.reduce((total, trip) => total + (trip.catches || []).reduce((tripTotal, record) => {
    const resolved = typeof resolveTripLineRecord === "function"
      ? resolveTripLineRecord({ ...record, trip })
      : record;
    const hasLinkedGear = gearFields.some((field) => Boolean(resolved[field]));
    return tripTotal + (hasLinkedGear ? (typeof fishCount === "function" ? fishCount(record) : 1) : 0);
  }, 0), 0);
}

function leaderboardSummaryMarkup(gearRows, anglerRows, trips) {
  const landed = trips.reduce(
    (total, trip) => total + (trip.catches || []).reduce(
      (tripTotal, record) => tripTotal + (typeof fishCount === "function" ? fishCount(record) : 1),
      0
    ),
    0
  );
  const lost = trips.reduce((total, trip) => total + (trip.lostFish || []).length, 0);
  const linkedCatches = leaderboardLinkedGearCatches(trips);
  const topGear = gearRows.find((row) => row.landed > 0);
  const topAngler = anglerRows.find((row) => row.landed > 0);
  const cards = [
    {
      label: "Landing rate",
      value: leaderboardPercent(leaderboardRate(landed, lost)),
      detail: `${landed} landed · ${lost} lost`
    },
    {
      label: "Gear attributed",
      value: landed ? leaderboardPercent((linkedCatches / landed) * 100) : "0%",
      detail: `${linkedCatches} of ${landed} catches`
    },
    {
      label: "Top fishing gear",
      value: topGear?.name || "No leader yet",
      detail: topGear ? `${topGear.landed} catches · ${leaderboardPercent(topGear.landingRate)} landed` : "Link fishing gear to setup lines"
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
  const rodContainer = document.querySelector("#statsRodLeaderboard");
  const reelContainer = document.querySelector("#statsReelLeaderboard");
  const comboContainer = document.querySelector("#statsComboLeaderboard");
  const lureContainer = document.querySelector("#statsLureLeaderboard");
  const flasherContainer = document.querySelector("#statsFlasherLeaderboard");
  const anglerContainer = document.querySelector("#statsAnglerLeaderboard");
  if (!rodContainer || !reelContainer || !comboContainer || !lureContainer || !flasherContainer || !anglerContainer) return;
  const allGearRows = fishingGearLeaderboardRows(trips, state, { recordFilter });
  const rodRows = allGearRows.filter((row) => row.gearType === "rod");
  const reelRows = allGearRows.filter((row) => row.gearType === "reel");
  const comboRows = allGearRows.filter((row) => row.gearType === "combo");
  const lureRows = allGearRows.filter((row) => row.gearType === "lure");
  const flasherRows = allGearRows.filter((row) => row.gearType === "flasher");
  const anglerRows = anglerLeaderboardRows(trips, state.people, { recordFilter });
  rodContainer.innerHTML = rodRows.length
    ? rodRows.map((row, index) => leaderboardRowMarkup(row, index + 1, "gear")).join("")
    : leaderboardEmpty("No rods in this scope", "Add rods to your setup lines to rank them here.");
  reelContainer.innerHTML = reelRows.length
    ? reelRows.map((row, index) => leaderboardRowMarkup(row, index + 1, "gear")).join("")
    : leaderboardEmpty("No reels in this scope", "Add reels to your setup lines to rank them here.");
  comboContainer.innerHTML = comboRows.length
    ? comboRows.map((row, index) => leaderboardRowMarkup(row, index + 1, "gear")).join("")
    : leaderboardEmpty("No combos in this scope", "Add rod and reel combos to rank them here.");
  lureContainer.innerHTML = lureRows.length
    ? lureRows.map((row, index) => leaderboardRowMarkup(row, index + 1, "gear")).join("")
    : leaderboardEmpty("No lures in this scope", "Add lures to your setup lines to rank them here.");
  flasherContainer.innerHTML = flasherRows.length
    ? flasherRows.map((row, index) => leaderboardRowMarkup(row, index + 1, "gear")).join("")
    : leaderboardEmpty("No flashers in this scope", "Add flashers to your setup lines to rank them here.");
  anglerContainer.innerHTML = anglerRows.length
    ? anglerRows.map((row, index) => leaderboardRowMarkup(row, index + 1, "angler")).join("")
    : leaderboardEmpty("No attributed anglers in this scope", "Choose an angler on catches and missed fish.");
}

if (typeof document !== "undefined") {
  bindEquipmentStatsTooltip();
  bindLeaderboardPreviews();
}
