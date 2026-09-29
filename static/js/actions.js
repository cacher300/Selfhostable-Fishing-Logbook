import { commit } from "./store.js";
import { ExpeditionAnalytics } from "./expedition-analytics.js";

function ensureArray(document, collection) {
  if (!Array.isArray(document[collection])) document[collection] = [];
  return document[collection];
}

export function upsertListValueInDraft(draft, key, value) {
  if (!value) return;
  const list = ensureArray(draft, key);
  if (!list.includes(value)) list.push(value);
}

export function addListValue(key, value) {
  return commit((draft) => {
    upsertListValueInDraft(draft, key, value);
  });
}

export function saveRecord(collection, record) {
  return commit((draft) => {
    const records = ensureArray(draft, collection);
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) records[index] = record;
    else records.push(record);
  });
}

export function deleteRecord(collection, id) {
  return commit((draft) => {
    draft[collection] = ensureArray(draft, collection).filter((item) => item.id !== id);
  });
}

export function updateSettings(mutator) {
  return commit((draft) => {
    draft.settings = { ...(draft.settings || {}) };
    return mutator(draft.settings, draft);
  });
}

export function updateLogbook(mutator) {
  return commit(mutator);
}

export function replacePredefinedFields(fields) {
  return commit((draft) => {
    Object.assign(draft, fields);
  });
}

export function replaceChecklists(checklists) {
  return updateSettings((settings) => {
    settings.checklists = checklists;
  });
}

export function saveExpeditionRecord(expedition) {
  return saveRecord("expeditions", expedition);
}

export function deleteExpeditionRecord(expeditionId) {
  return commit((draft) => {
    draft.expeditions = ensureArray(draft, "expeditions").filter((item) => item.id !== expeditionId);
    draft.trips = ExpeditionAnalytics.unassignTrips(ensureArray(draft, "trips"), expeditionId);
  });
}

export function reorderLocations(orderedIds) {
  return commit((draft) => {
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    draft.locations = ensureArray(draft, "locations").slice().sort((a, b) => {
      const aOrder = order.has(a.id) ? order.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bOrder = order.has(b.id) ? order.get(b.id) : Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });
  });
}

export function saveLocation(location, { launch, mode = "location" } = {}) {
  return commit((draft) => {
    const locations = ensureArray(draft, "locations");
    if (mode === "launch") {
      const existingLocation = locations.find((item) => item.id === location.id);
      if (!existingLocation) return;
      const launches = Array.isArray(existingLocation.launches) ? existingLocation.launches : [];
      existingLocation.launches = launch.existingId
        ? launches.map((item) => item.id === launch.existingId ? launch.record : item)
        : [...launches, launch.record];
      draft.trips = ensureArray(draft, "trips").map((trip) => (
        trip.locationId === existingLocation.id && trip.launchId === launch.record.id
          ? { ...trip, launch: launch.record.name }
          : trip
      ));
      return;
    }
    const existing = locations.find((item) => item.id === location.id);
    draft.locations = existing
      ? locations.map((item) => item.id === existing.id ? location : item)
      : [...locations, location].sort((a, b) => a.name.localeCompare(b.name));
    draft.trips = ensureArray(draft, "trips").map((trip) => (
      trip.locationId === location.id ? { ...trip, location: location.name } : trip
    ));
  });
}

export function deleteLocation(locationId) {
  return deleteRecord("locations", locationId);
}

export function replaceFishingSpots(spots) {
  return commit((draft) => {
    draft.spots = spots;
  });
}

export function deleteLaunch(locationId, launchId) {
  return commit((draft) => {
    const location = ensureArray(draft, "locations").find((item) => item.id === locationId);
    if (!location) return;
    location.launches = (location.launches || []).filter((item) => item.id !== launchId);
  });
}

export function saveTripRecord(trip, updateDraft = () => {}) {
  return commit((draft) => {
    updateDraft(draft);
    const trips = ensureArray(draft, "trips");
    const index = trips.findIndex((item) => item.id === trip.id);
    if (index >= 0) trips[index] = trip;
    else trips.push(trip);
  });
}

export function deleteTrip(id) {
  return deleteRecord("trips", id);
}

export function deleteReel(id, modelGroupId = "", nextGroupQuantity = "") {
  return commit((draft) => {
    draft.reels = ensureArray(draft, "reels").filter((item) => item.id !== id);
    if (modelGroupId) {
      draft.reels.forEach((item) => {
        const groupId = String(item?.modelGroupId || item?.id || "");
        if (item.id === modelGroupId || groupId === modelGroupId) {
          item.modelGroupId = modelGroupId;
          item.quantityAvailable = String(nextGroupQuantity ?? "");
        }
      });
    }
    ensureArray(draft, "rodReelCombos").forEach((combo) => {
      if (combo.reelId === id) combo.reelId = "";
    });
    ensureArray(draft, "trips").forEach((trip) => (trip.gearUsed || []).forEach((gearItem) => {
      if (gearItem.reelId === id) gearItem.reelId = "";
    }));
  });
}

export function deleteRod(id) {
  return commit((draft) => {
    draft.rods = ensureArray(draft, "rods").filter((item) => item.id !== id);
    ensureArray(draft, "rodReelCombos").forEach((combo) => {
      if (combo.rodId === id) combo.rodId = "";
    });
    ensureArray(draft, "trips").forEach((trip) => (trip.gearUsed || []).forEach((gearItem) => {
      if (gearItem.rodId === id) gearItem.rodId = "";
    }));
  });
}

export function deleteCombo(id) {
  return commit((draft) => {
    draft.rodReelCombos = ensureArray(draft, "rodReelCombos").filter((item) => item.id !== id);
    ensureArray(draft, "trips").forEach((trip) => (trip.gearUsed || []).forEach((gearItem) => {
      if (gearItem.comboId === id) gearItem.comboId = "";
    }));
  });
}

export function deleteLure(id) {
  return commit((draft) => {
    draft.lures = ensureArray(draft, "lures").filter((item) => item.id !== id);
    ensureArray(draft, "trips").forEach((trip) => {
      (trip.gearUsed || []).forEach((gearItem) => {
        if (gearItem.lureId === id) gearItem.lureId = "";
        if (gearItem.cheaterLureId === id) gearItem.cheaterLureId = "";
      });
      (trip.catches || []).forEach((catchItem) => { if (catchItem.lureId === id) catchItem.lureId = ""; });
      (trip.lostFish || []).forEach((fish) => { if (fish.lureId === id) fish.lureId = ""; });
    });
  });
}

export function deleteFlasher(id) {
  return commit((draft) => {
    draft.flashers = ensureArray(draft, "flashers").filter((item) => item.id !== id);
    ensureArray(draft, "trips").forEach((trip) => {
      (trip.gearUsed || []).forEach((gearItem) => { if (gearItem.flasherId === id) gearItem.flasherId = ""; });
      (trip.catches || []).forEach((catchItem) => { if (catchItem.flasherId === id) catchItem.flasherId = ""; });
      (trip.lostFish || []).forEach((fish) => { if (fish.flasherId === id) fish.flasherId = ""; });
    });
  });
}
