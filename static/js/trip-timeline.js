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

function openSummaryCatchLocationMap(catchIndex) {
  const trip = state.trips.find((item) => item.id === activeSummaryTripId);
  const catchItem = trip?.catches?.[catchIndex];
  const host = document.querySelector("#catchDetailLocationHost");
  if (!trip || !catchItem || !host) return;
  host.innerHTML = renderCatchDetailLocationPopout(trip, catchItem, catchIndex);
  renderCatchDetailLocationMap(trip, catchItem, catchIndex, "trip");
  host.querySelector("[data-close-catch-map]")?.focus();
}

function setSummaryCatchLocationScope(scope) {
  const popout = document.querySelector("#catchDetailLocationPopout");
  const trip = state.trips.find((item) => item.id === activeSummaryTripId);
  const catchIndex = Number(popout?.dataset.catchIndex);
  const catchItem = trip?.catches?.[catchIndex];
  if (!popout || !trip || !catchItem || Number.isNaN(catchIndex)) return;
  const nextScope = scope === "all" ? "all" : "trip";
  popout.dataset.catchLocationScope = nextScope;
  popout.querySelectorAll("[data-catch-location-scope]").forEach((button) => {
    const isActive = button.dataset.catchLocationScope === nextScope;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  renderCatchDetailLocationMap(trip, catchItem, catchIndex, nextScope);
}

function closeSummaryCatchLocationMap() {
  destroyCatchDetailLocationMap();
  const host = document.querySelector("#catchDetailLocationHost");
  if (host) host.innerHTML = "";
}

function toggleSummaryCatchLocationMap(catchIndex) {
  if (document.querySelector("#catchDetailLocationPopout")) closeSummaryCatchLocationMap();
  else openSummaryCatchLocationMap(catchIndex);
}

function closeSummaryCatchDetail() {
  closeSummaryCatchLocationMap();
  const host = document.querySelector("#catchDetailHost");
  if (host) host.innerHTML = "";
  document.querySelector("#tripSummaryDialog")?.classList.remove("catch-detail-open");
}

function openTripSummary(trip) {
  activeSummaryTripId = trip.id;
  activeReportTimelineFilter = "all";
  activeReportTimelineSort = { key: "time", direction: "asc" };
  els.tripSummaryTitle.textContent = displayTitleText(trip.title || trip.location || "Trip Summary");
  els.tripSummaryBody.innerHTML = renderTripReport(trip);
  els.tripSummaryDialog.showModal();
  if (catchMapRecordsForTrip(trip).length) renderTripSummaryMap(trip);
}
