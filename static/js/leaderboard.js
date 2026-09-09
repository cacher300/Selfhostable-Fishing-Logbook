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

function gearPerformanceStats(type, id, trips = state.trips) {
  const fieldByType = {
    lure: "lureId",
    flasher: "flasherId",
    rod: "rodId",
    reel: "reelId",
    combo: "comboId"
  };
  const field = fieldByType[type] || "";
  let landed = 0;
  let lost = 0;
  let allAttributedLanded = 0;
  let lastUsed = "";
  const usedTrips = new Set();

  const recordValue = (record, trip) => {
    const resolved = resolveTripLineRecord({ ...record, trip });
    const directValue = String(resolved[field] || "");
    if (directValue) return directValue;

    // Older non-trolling catches did not store their setup-line id. Recover
    // combo/reel attribution when the saved rod/lure combination identifies
    // exactly one setup line, while avoiding guesses when lines are ambiguous.
    if (!record.setupLineId && ["combo", "reel"].includes(type)) {
      const candidates = (trip.gearUsed || []).filter((line) => (
        (!record.rodId || String(line.rodId || "") === String(record.rodId))
        && (!record.lureId || String(line.lureId || "") === String(record.lureId))
        && (!record.flasherId || String(line.flasherId || "") === String(record.flasherId))
      ));
      if (candidates.length === 1) return String(candidates[0][field] || "");
    }
    return "";
  };

  trips.forEach((trip, tripIndex) => {
    const tripId = String(trip.id || `trip-${tripIndex}`);
    (trip.gearUsed || []).forEach((line) => {
      const value = String(line[field] || "");
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
  bindLeaderboardPreviews();
}
