import { state, ui } from "./app-state.js";
import { generatedTripTitle } from "./app-normalization.js";
import { saveTripRecord, upsertListValueInDraft } from "./actions.js";
import { cleanupDeletedMedia, markMediaEditSessionSaved, mediaReferenceKeys } from "./app-media.js";
import { enrichTripWithWeather, resolveTripWaveSnapshot, weatherWindText } from "./location-weather.js";
import { renderAll } from "./dashboard.js";
import { closeTripDialog, confirmTripSaveWarnings, deleteTripById, mergePeople, setTripSaveLoading, setValue, showTripFormMessage, validateTripForm } from "./trip-editor.js";
import { sourceTripForDraft, tripDraftIsPristine, tripFromDraft } from "./trip-draft.js";

function weatherRefreshInputsChanged(source, trip) {
  if (!source) return true;
  return ["date", "locationId", "launchId", "launchTime", "linesPulledTime", "waveHeight"]
    .some((field) => String(source[field] ?? "") !== String(trip[field] ?? ""));
}

async function maybeRefreshTripWeather(trip, source) {
  if (source && !weatherRefreshInputsChanged(source, trip)) return trip;
  const refreshed = await enrichTripWithWeather(trip);
  const status = refreshed.weatherData?.status || "";
  if (status === "error" || status === "missing-date" || status === "missing-coordinates") {
    return {
      ...trip,
      weatherData: source?.weatherData ?? trip.weatherData ?? null,
      wind: source?.wind ?? trip.wind ?? "",
      weather: source?.weather ?? trip.weather ?? ""
    };
  }
  const withWave = resolveTripWaveSnapshot(refreshed);
  return {
    ...withWave,
    wind: weatherWindText(withWave.weatherData)
  };
}

export async function saveTrip(event) {
  return persistTrip(event, { draft: false });
}

export async function saveTripAsDraft(event) {
  return persistTrip(event, { draft: true });
}

export async function persistTrip(event, { draft = false } = {}) {
  event.preventDefault();
  if (!draft && !validateTripForm()) return;
  if (!draft && !confirmTripSaveWarnings()) return;
  setTripSaveLoading(true, draft ? "draft" : "save");

  try {
    const sourceTrip = sourceTripForDraft(ui.tripDraft);
    const pristineDraft = tripDraftIsPristine(ui.tripDraft);
    const unchangedEditor = Boolean(sourceTrip && ui.tripFormInitialSnapshot === JSON.stringify(ui.tripDraft || {}));
    let trip = unchangedEditor ? structuredClone(sourceTrip) : tripFromDraft(ui.tripDraft, { state });
    // Keep a stable id in the form so a retry after a failed request updates
    // the same in-memory trip instead of creating a duplicate.
    setValue("tripId", trip.id);
    if (ui.tripDraft) ui.tripDraft.id = trip.id;
    if (draft || (!unchangedEditor && Object.hasOwn(sourceTrip || {}, "isDraft"))) trip.isDraft = draft;
    if (!pristineDraft && !unchangedEditor) trip.title = trip.title || generatedTripTitle(trip, state.trips);
    if (!pristineDraft && !unchangedEditor) trip = await maybeRefreshTripWeather(trip, sourceTrip);
    ui.activeTripWeatherData = trip.weatherData || null;
    if (ui.tripDraft) ui.tripDraft.weatherData = trip.weatherData || null;

    const index = state.trips.findIndex((item) => item.id === trip.id);
    const previousMedia = index >= 0 ? [...mediaReferenceKeys(state.trips[index])] : [];

    await saveTripRecord(trip, (draftState) => {
      draftState.people = mergePeople(draftState.people, trip.people);
      upsertListValueInDraft(draftState, "species", trip.targetSpecies);
      upsertListValueInDraft(draftState, "methods", trip.method);
      upsertListValueInDraft(draftState, "waterClarities", trip.waterClarity);
      upsertListValueInDraft(draftState, "waterLevels", trip.waterLevel);
      trip.catches.forEach((catchItem) => upsertListValueInDraft(draftState, "flyPresentations", catchItem.flyPresentation));
      upsertListValueInDraft(draftState, "weatherTypes", trip.weather);
      trip.catches.forEach((catchItem) => upsertListValueInDraft(draftState, "species", catchItem.species));
      trip.lostFish.forEach((fish) => upsertListValueInDraft(draftState, "species", fish.possibleSpecies));
    });
    markMediaEditSessionSaved("trip");
    const currentMedia = mediaReferenceKeys(trip);
    await cleanupDeletedMedia(previousMedia.filter((key) => !currentMedia.has(key)));
    closeTripDialog({ force: true });
    renderAll();
  } catch (error) {
    console.error("Could not save trip.", error);
    setTripSaveLoading(false);
    showTripFormMessage(error.message || "The trip could not be saved. Check that required fields are filled and try again.");
  }
}

export async function deleteActiveTrip() {
  if (!ui.activeTripId) return;
  try {
    await deleteTripById(ui.activeTripId, { closeEditor: true });
  } catch (error) {
    console.error("Could not delete trip.", error);
    showTripFormMessage(error.message || "The trip could not be deleted.");
  }
}
