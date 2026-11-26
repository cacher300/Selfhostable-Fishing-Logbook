import { html, joinHtml, setHtml } from "./html.js";
import { activeStatsFilters, state } from "./app-state.js";
import { previewImage } from "./app-media.js";
import { fishCount } from "./dashboard.js";
import { setupLineMinutes } from "./stats-performance.js";
import { openFlasherInfoDialog, openLureInfoDialog } from "./gear-dialogs.js";
import { openInventoryItemInfo } from "./gear-inventory.js";
import { resolveTripLineRecord } from "./trolling-spread.js";

const leaderboardSorts = new Map();
const defaultLeaderboardSort = { key: "rank", direction: "asc" };

export function leaderboardRate(landed, lost) {
  const opportunities = landed + lost;
  return opportunities ? (landed / opportunities) * 100 : 0;
}

export function finalizeLeaderboardRows(rows, { shareGroup = () => "all" } = {}) {
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
    .map(({ tripIds, minutes, ...row }) => ({
      ...row,
      ...(row.gearType ? { fishPerHour: minutes > 0 ? (row.landed * 60) / minutes : null } : {})
    }))
    .sort((first, second) => (
      second.landed - first.landed
      || second.landingRate - first.landingRate
      || second.catchesPerTrip - first.catchesPerTrip
      || second.trips - first.trips
      || first.name.localeCompare(second.name)
    ));
}

export function leaderboardGearName(item, type, collections) {
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

export function fishingGearLeaderboardRows(trips = [], collections = {}, { recordFilter = () => true, lineFilter = () => true } = {}) {
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
        minutes: 0,
        tripIds: new Set()
      });
    });
  });

  trips.forEach((trip, tripIndex) => {
    const tripId = String(trip.id || `trip-${tripIndex}`);
    (trip.gearUsed || []).forEach((line) => {
      if (!lineFilter(line, trip)) return;
      gearTypes.forEach(({ type, field }) => {
        const row = rowsById.get(`${type}:${String(line[field] || "")}`);
        if (row) {
          row.tripIds.add(tripId);
          row.minutes += Math.max(0, setupLineMinutes(line));
        }
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

export function anglerLeaderboardRows(trips = [], people = [], { recordFilter = () => true } = {}) {
  const rowsById = new Map();
  const ensurePerson = (person) => {
    const id = String(person?.id || "");
    const name = String(person?.name || "").trim();
    if (!id || !name) return null;
    if (!rowsById.has(id)) {
      rowsById.set(id, { id, name, photo: person.photo || null, landed: 0, lost: 0, tripIds: new Set() });
    }
    const row = rowsById.get(id);
    if (!row.photo && person.photo) row.photo = person.photo;
    return row;
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
        const resolved = resolveTripLineRecord({ ...record, trip });
        if (!recordFilter(record, trip, resolved.setupLine)) return;
        const personId = String(record.personId || resolved.setupLine?.personId || "");
        const person = people.find((item) => String(item.id) === String(record.personId))
          || tripPeople.get(String(record.personId))
          || people.find((item) => String(item.id) === personId)
          || tripPeople.get(personId);
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

export function leaderboardPercent(value) {
  return `${Math.round(value)}%`;
}

export function leaderboardDecimal(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function leaderboardGearAvatar(row) {
  const source = typeof previewImage === "function"
    ? previewImage(row.item)
    : "";
  if (source) {
    return html`<button class="leaderboard-avatar leaderboard-equipment-avatar leaderboard-preview-button" type="button" data-leaderboard-preview-type="${row.gearType}" data-leaderboard-preview-id="${row.id}" aria-label="Open details for ${row.name}"><img src="${source}" alt=""></button>`;
  }
  return "";
}

export function leaderboardPersonAvatar(row) {
  const source = previewImage(row.photo);
  return source ? html`<span class="leaderboard-avatar"><img src="${source}" alt=""></span>` : "";
}

export function leaderboardEmpty(message, detail) {
  return html`
    <div class="leaderboard-empty">
      <strong>${message}</strong>
      <span>${detail}</span>
    </div>
  `;
}

export function bindLeaderboardPreviews() {
  document.addEventListener("click", (event) => {
    const sortButton = event.target.closest("[data-leaderboard-sort]");
    if (sortButton) {
      const listId = sortButton.dataset.leaderboardList;
      const container = document.getElementById(listId);
      if (!container) return;
      const key = sortButton.dataset.leaderboardSort;
      const current = leaderboardSorts.get(listId) || defaultLeaderboardSort;
      const next = key === "rank"
        ? { key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }
        : {
          key,
          direction: current.key === key ? (current.direction === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc"
        };
      leaderboardSorts.set(listId, next);
      sortLeaderboardList(container, next);
      return;
    }
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

export function leaderboardRowMarkup(row, rank, kind) {
  const tripsLabel = `${row.trips} trip${row.trips === 1 ? "" : "s"}`;
  const subtitle = tripsLabel;
  const avatar = kind === "gear" ? leaderboardGearAvatar(row) : kind === "angler" ? leaderboardPersonAvatar(row) : "";

  return html`
    <article class="leaderboard-row"
      data-sort-name="${row.name}"
      data-sort-landed="${row.landed}"
      data-sort-lost="${row.lost}"
      data-sort-landing-rate="${row.landingRate}"
      data-sort-fish-per-hour="${row.gearType ? row.fishPerHour ?? "" : ""}"
      data-sort-catch-share="${row.catchShare}"
      data-sort-catches-per-trip="${row.catchesPerTrip}"
      data-sort-trips="${row.trips}"
      style="--leaderboard-delay: ${Math.min(rank, 8) * 35}ms">
      <span class="leaderboard-rank" aria-label="Rank ${rank}">${String(rank).padStart(2, "0")}</span>
      <div class="leaderboard-identity${avatar ? "" : " leaderboard-identity--text-only"}">
        ${avatar}
        <div>
          <strong>${row.name}</strong>
          ${subtitle ? html`<span>${subtitle}</span>` : ""}
        </div>
      </div>
      <div class="leaderboard-performance">
        <div class="leaderboard-metrics${row.gearType ? "" : " leaderboard-metrics--angler"}">
          <div><strong>${row.landed}</strong></div>
          <div><strong>${row.lost}</strong></div>
          <div><strong>${leaderboardPercent(row.landingRate)}</strong></div>
          ${row.gearType ? html`<div><strong>${row.fishPerHour === null ? "—" : leaderboardDecimal(row.fishPerHour)}</strong></div>` : ""}
          <div><strong>${leaderboardPercent(row.catchShare)}</strong></div>
          <div><strong>${leaderboardDecimal(row.catchesPerTrip)}</strong></div>
        </div>
      </div>
    </article>
  `;
}

function leaderboardSortButton(listId, key, label, sort) {
  const active = sort.key === key;
  const direction = active ? sort.direction : "";
  const indicator = active ? (direction === "asc" ? "↑" : "↓") : "↕";
  const ariaLabel = active ? `${label}, sorted ${direction === "asc" ? "ascending" : "descending"}` : `Sort by ${label}`;
  return html`
    <button type="button" class="leaderboard-sort" data-leaderboard-list="${listId}" data-leaderboard-sort="${key}"
      aria-label="${ariaLabel}" aria-pressed="${active}">
      <span>${label}</span><span class="leaderboard-sort-indicator" aria-hidden="true">${indicator}</span>
    </button>
  `;
}

function leaderboardColumnsMarkup(listId, itemLabel, gear, sort) {
  const metrics = [
    ["landed", "Landed"],
    ["lost", "Lost"],
    ["landingRate", "Landing rate"]
  ];
  if (gear) metrics.push(["fishPerHour", "Fish / hr"]);
  metrics.push(["catchShare", "Catch share"], ["catchesPerTrip", "Catches / trip"]);

  return html`
    <div class="leaderboard-columns" role="group" aria-label="Sortable ${itemLabel} leaderboard columns">
      ${leaderboardSortButton(listId, "rank", "Rank", sort)}
      ${leaderboardSortButton(listId, "name", itemLabel, sort)}
      <div class="leaderboard-column-metrics${gear ? "" : " leaderboard-column-metrics--angler"}" role="group" aria-label="Sort by statistics">
        ${joinHtml(metrics.map(([key, label]) => leaderboardSortButton(listId, key, label, sort)))}
      </div>
    </div>
  `;
}

function leaderboardSortNumber(row, key) {
  const value = row.dataset[`sort${key[0].toUpperCase()}${key.slice(1)}`];
  if (value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compareLeaderboardRows(first, second, sort) {
  const firstName = first.dataset.sortName || "";
  const secondName = second.dataset.sortName || "";
  if (sort.key === "rank") {
    const comparison = leaderboardSortNumber(second, "landed") - leaderboardSortNumber(first, "landed")
      || leaderboardSortNumber(second, "landingRate") - leaderboardSortNumber(first, "landingRate")
      || leaderboardSortNumber(second, "catchesPerTrip") - leaderboardSortNumber(first, "catchesPerTrip")
      || leaderboardSortNumber(second, "trips") - leaderboardSortNumber(first, "trips")
      || firstName.localeCompare(secondName);
    return sort.direction === "asc" ? comparison : -comparison;
  }
  if (sort.key === "name") {
    const comparison = firstName.localeCompare(secondName);
    return (sort.direction === "asc" ? comparison : -comparison) || firstName.localeCompare(secondName);
  }

  const firstValue = leaderboardSortNumber(first, sort.key);
  const secondValue = leaderboardSortNumber(second, sort.key);
  if (firstValue === null && secondValue !== null) return 1;
  if (secondValue === null && firstValue !== null) return -1;
  if (firstValue === null && secondValue === null) return firstName.localeCompare(secondName);
  const comparison = firstValue - secondValue;
  return (sort.direction === "asc" ? comparison : -comparison) || firstName.localeCompare(secondName);
}

function sortLeaderboardList(container, sort) {
  const rows = [...container.querySelectorAll(":scope > .leaderboard-row")];
  rows.sort((first, second) => compareLeaderboardRows(first, second, sort));
  rows.forEach((row, index) => {
    container.append(row);
    const rank = row.querySelector(".leaderboard-rank");
    if (rank) {
      rank.textContent = String(index + 1).padStart(2, "0");
      rank.setAttribute("aria-label", `Rank ${index + 1}`);
    }
  });
  container.querySelectorAll("[data-leaderboard-sort]").forEach((button) => {
    const active = button.dataset.leaderboardSort === sort.key;
    const label = button.querySelector("span")?.textContent || "leaderboard column";
    const indicator = button.querySelector(".leaderboard-sort-indicator");
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active
      ? `${label}, sorted ${sort.direction === "asc" ? "ascending" : "descending"}`
      : `Sort by ${label}`);
    if (indicator) indicator.textContent = active ? (sort.direction === "asc" ? "↑" : "↓") : "↕";
  });
}

function renderLeaderboardList(container, rows, kind, itemLabel, emptyMessage, emptyDetail) {
  if (!rows.length) {
    setHtml(container, leaderboardEmpty(emptyMessage, emptyDetail));
    return;
  }
  const sort = leaderboardSorts.get(container.id) || defaultLeaderboardSort;
  setHtml(container, html`
    ${leaderboardColumnsMarkup(container.id, itemLabel, kind === "gear", sort)}
    ${joinHtml(rows.map((row, index) => leaderboardRowMarkup(row, index + 1, kind)))}
  `);
  sortLeaderboardList(container, sort);
}

export function gearPerformanceStats(type, id, trips = state.trips) {
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

export function renderStatsLeaderboard(trips = state.trips, recordFilter = () => true) {
  const rodContainer = document.querySelector("#statsRodLeaderboard");
  const reelContainer = document.querySelector("#statsReelLeaderboard");
  const comboContainer = document.querySelector("#statsComboLeaderboard");
  const lureContainer = document.querySelector("#statsLureLeaderboard");
  const flasherContainer = document.querySelector("#statsFlasherLeaderboard");
  const anglerContainer = document.querySelector("#statsAnglerLeaderboard");
  if (!rodContainer || !reelContainer || !comboContainer || !lureContainer || !flasherContainer || !anglerContainer) return;
  const selectedPerson = activeStatsFilters.person;
  const filterGearLineByPerson = (line, trip) => (
    selectedPerson === "All people" || leaderboardPersonName(trip, line.personId) === selectedPerson
  );
  const allGearRows = fishingGearLeaderboardRows(trips, state, { recordFilter, lineFilter: filterGearLineByPerson });
  const visibleGearRows = selectedPerson === "All people" ? allGearRows : allGearRows.filter((row) => row.trips > 0);
  const rodRows = visibleGearRows.filter((row) => row.gearType === "rod");
  const reelRows = visibleGearRows.filter((row) => row.gearType === "reel");
  const comboRows = visibleGearRows.filter((row) => row.gearType === "combo");
  const lureRows = visibleGearRows.filter((row) => row.gearType === "lure");
  const flasherRows = visibleGearRows.filter((row) => row.gearType === "flasher");
  const anglerRows = anglerLeaderboardRows(trips, state.people, { recordFilter })
    .filter((row) => selectedPerson === "All people" || row.name === selectedPerson);
  renderLeaderboardList(rodContainer, rodRows, "gear", "Rod", "No rods in this scope", "Add rods to your setup lines to rank them here.");
  renderLeaderboardList(reelContainer, reelRows, "gear", "Reel", "No reels in this scope", "Add reels to your setup lines to rank them here.");
  renderLeaderboardList(comboContainer, comboRows, "gear", "Rod + reel combo", "No combos in this scope", "Add rod and reel combos to rank them here.");
  renderLeaderboardList(lureContainer, lureRows, "gear", "Lure", "No lures in this scope", "Add lures to your setup lines to rank them here.");
  renderLeaderboardList(flasherContainer, flasherRows, "gear", "Flasher", "No flashers in this scope", "Add flashers to your setup lines to rank them here.");
  renderLeaderboardList(anglerContainer, anglerRows, "angler", "Angler", "No attributed anglers in this scope", "Choose an angler on catches and missed fish.");
}

function leaderboardPersonName(trip, personId) {
  const id = String(personId || "");
  if (!id) return "";
  return state.people.find((person) => String(person.id) === id)?.name
    || (trip.people || []).find((person) => String(person.id) === id)?.name
    || "";
}

export function setup() {
  if (typeof document !== "undefined") {
    bindLeaderboardPreviews();
  }
}
