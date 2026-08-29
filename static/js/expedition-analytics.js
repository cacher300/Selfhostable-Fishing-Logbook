(function initExpeditionAnalytics(global) {
  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function fishCount(catchItem) {
    return Math.max(1, number(catchItem?.quantity) || 1);
  }

  function inclusiveDays(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const end = Date.parse(`${endDate}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
    return Math.floor((end - start) / 86400000) + 1;
  }

  function tripOutsideRange(trip, expedition) {
    if (!trip?.date || !expedition?.startDate || !expedition?.endDate) return false;
    return trip.date < expedition.startDate || trip.date > expedition.endDate;
  }

  function sortedExpeditions(expeditions = [], sort = "start-desc") {
    return [...expeditions].sort((a, b) => {
      if (sort === "name-asc") return String(a.name || "").localeCompare(String(b.name || ""));
      const direction = sort === "start-asc" ? 1 : -1;
      return String(a.startDate || "").localeCompare(String(b.startDate || "")) * direction
        || String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  function summarize(expedition, trips = [], tripHours = (trip) => number(trip.hours)) {
    const memberTrips = trips
      .filter((trip) => trip.expeditionId === expedition?.id)
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))
        || String(a.title || "").localeCompare(String(b.title || "")));
    let hours = 0;
    let fish = 0;
    const species = new Set();
    memberTrips.forEach((trip) => {
      hours += number(tripHours(trip));
      (trip.catches || []).forEach((catchItem) => {
        fish += fishCount(catchItem);
        if (catchItem.species) species.add(catchItem.species);
      });
    });
    return {
      trips: memberTrips,
      tripCount: memberTrips.length,
      days: inclusiveDays(expedition?.startDate, expedition?.endDate),
      hours,
      fish,
      catchRate: hours > 0 ? fish / hours : 0,
      species: species.size
    };
  }

  function unassignTrips(trips = [], expeditionId = "") {
    return trips.map((trip) => trip.expeditionId === expeditionId ? { ...trip, expeditionId: "" } : trip);
  }

  global.ExpeditionAnalytics = {
    inclusiveDays,
    sortedExpeditions,
    summarize,
    tripOutsideRange,
    unassignTrips
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
