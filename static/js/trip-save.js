import { state, ui } from "./app-state.js";
import { generatedTripTitle } from "./app-normalization.js";
import { automaticWeatherFrontPatch, resetAutomaticWeatherFront } from "./weather-front.js";
import { saveTripRecord, upsertListValueInDraft } from "./actions.js";
import { cleanupDeletedMedia, markMediaEditSessionSaved, mediaReferenceKeys } from "./app-media.js";
import { enrichTripWithWeather, resolveTripWaveSnapshot, weatherWindText } from "./location-weather.js";
import { renderAll } from "./dashboard.js";
import { refreshOpenTripSummary } from "./trip-timeline.js";
import { closeTripDialog, confirmTripSaveWarnings, deleteTripById, mergePeople, setTripSaveFailed, setTripSaveLoading, setValue, showTripFormMessage, validateTripForm } from "./trip-editor.js";
import { sourceTripForDraft, tripDraftIsPristine, tripFromDraft } from "./trip-draft.js";

function weatherRefreshInputsChanged(source, trip) {
  if (!source) return true;
  return ["date", "locationId", "launchId", "launchTime", "linesPulledTime", "waveHeight"]
    .some((field) => String(source[field] ?? "") !== String(trip[field] ?? ""));
}

async function maybeRefreshTripWeather(trip, source) {
  if (source && !weatherRefreshInputsChanged(source, trip) && trip.weatherData?.frontAssessment) return trip;
  const contextChanged = source && ["date", "locationId", "launchId", "launchTime", "linesPulledTime"].some(field => String(source[field] ?? "") !== String(trip[field] ?? ""));
  if (contextChanged) trip = resetAutomaticWeatherFront(trip);
  const refreshed = await enrichTripWithWeather(trip);
  const status = refreshed.weatherData?.status || "";
  if (status === "error" || status === "missing-date" || status === "missing-coordinates") {
    const fallback = {
      ...trip,
      weatherData: source?.weatherData ?? trip.weatherData ?? null,
      wind: source?.wind ?? trip.wind ?? "",
      weather: source?.weather ?? trip.weather ?? ""
    };
    return contextChanged ? resetAutomaticWeatherFront(fallback) : fallback;
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
    // Drafts must persist independently of weather providers. A draft may be
    // incomplete, and waiting on enrichment here can leave the user's work
    // unsaved if the external request is slow or unavailable.
    if (!draft && !pristineDraft && (!unchangedEditor || !sourceTrip?.weatherData?.frontAssessment)) trip = await maybeRefreshTripWeather(trip, sourceTrip);
    trip = { ...trip, ...automaticWeatherFrontPatch(trip) };
    ui.activeTripWeatherData = trip.weatherData || null;
    if (ui.tripDraft) ui.tripDraft.weatherData = trip.weatherData || null;

    const peopleForLibrary = trip.people || [];
    trip = {
      ...trip,
      people: peopleForLibrary.map((person) => {
        const reference = { ...person };
        delete reference.photo;
        return reference;
      })
    };

    const index = state.trips.findIndex((item) => item.id === trip.id);
    const tripPersonIds = new Set((trip.people || []).map((person) => String(person.id || "")));
    const previousPeopleMedia = mediaReferenceKeys(state.people.filter((person) => tripPersonIds.has(String(person.id || ""))));
    const previousMedia = [
      ...(index >= 0 ? mediaReferenceKeys(state.trips[index]) : []),
      ...previousPeopleMedia
    ];

    await saveTripRecord(trip, (draftState) => {
      draftState.people = mergePeople(draftState.people, peopleForLibrary);
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
    const currentMedia = mediaReferenceKeys(state);
    const removedMedia = previousMedia.filter((key) => !currentMedia.has(key));
    if (draft) {
      closeTripDialog({ force: true });
      void cleanupDeletedMedia(removedMedia).catch((error) => {
        console.warn("Could not clean up deleted media after saving the trip draft.", error);
      });
    } else {
      await cleanupDeletedMedia(removedMedia);
      closeTripDialog({ force: true });
    }
    renderAll();
    refreshOpenTripSummary(trip.id);
  } catch (error) {
    console.error("Could not save trip.", error);
    setTripSaveLoading(false);
    setTripSaveFailed(true);
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
