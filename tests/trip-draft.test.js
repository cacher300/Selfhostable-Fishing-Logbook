import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();

const { createTripDraft, tripFromDraft } = await import("../static/js/trip-draft.js");
const { setState } = await import("../static/js/app-state.js");

const appState = {
  settings: { units: {} },
  locations: [{ id: "loc-1", name: "Lake Ontario", launches: [{ id: "launch-1", name: "Port Bay" }] }],
  rodReelCombos: [{ id: "combo-1", rodId: "rod-1", reelId: "reel-1" }],
  lures: [{ id: "lure-1", type: "Spoon" }, { id: "lure-soft", type: "Soft Plastic" }]
};
setState(appState);

const additiveTrip = {
  id: "trip-1",
  title: "  Evening troll  ",
  date: "2026-09-12",
  locationId: "loc-1",
  launchId: "launch-1",
  launchTime: "08:00",
  linesPulledTime: "12:30",
  idleHours: "0.5",
  method: "Trolling",
  intent: "experimental",
  tripRating: "4",
  targetSpecies: "Salmon",
  waterTemp: "50",
  waterClarity: "Clear",
  weather: "Cloudy",
  waveHeight: "2",
  structure: "120 FOW",
  notes: "  note  ",
  coordinates: { latitude: 43.2, longitude: -79.5 },
  liveStatus: "paused",
  pausedAt: "2026-09-12T10:00:00.000Z",
  liveEvents: [{ id: "event-1", kind: "fish", time: "09:00" }],
  mobileOnly: { ok: true },
  gearUsed: [{ id: "line-1", personId: "person-1", comboId: "combo-1", startTime: "08:00", endTime: "12:00", side: "port", presentation: "Downrigger", lureId: "lure-1", hasCheater: true, cheaterLureId: "lure-soft" }],
  catches: [{ id: "catch-1", quantity: 3, species: "Salmon", setupLineValue: "line-1::cheater", presentation: "Cheater", lureId: "lure-soft", time: "09:10", kept: false, cheaterDepth: "22" }],
  lostFish: [{ id: "lost-1", possibleSpecies: "Trout", setupLineValue: "line-1", presentation: "Downrigger", lureId: "lure-1", time: "09:30", notes: "hit" }]
};

const trollingTrip = tripFromDraft(additiveTrip, { state: appState });
assert.equal(trollingTrip.location, "Lake Ontario");
assert.equal(trollingTrip.launch, "Port Bay");
assert.equal(trollingTrip.hours, 4);
assert.equal(trollingTrip.liveStatus, "paused");
assert.deepEqual(trollingTrip.liveEvents, additiveTrip.liveEvents);
assert.deepEqual(trollingTrip.mobileOnly, { ok: true });
assert.equal(trollingTrip.gearUsed[0].personId, "person-1");
assert.equal(trollingTrip.gearUsed[0].rodId, "rod-1");
assert.equal(trollingTrip.gearUsed[0].reelId, "reel-1");
assert.equal(trollingTrip.catches.length, 1);
assert.equal(trollingTrip.catches[0].quantity, 3);
assert.equal(trollingTrip.catches[0].setupLineId, "line-1");
assert.equal(trollingTrip.catches[0].setupLineTarget, "cheater");
assert.equal(trollingTrip.catches[0].cheaterDepth, "22");
assert.equal(trollingTrip.lostFish.length, 1);
assert.equal(trollingTrip.lostFish[0].possibleSpecies, "Trout");
assert.equal(trollingTrip.lostFish[0].species, "");

const castingTrip = tripFromDraft({
  ...additiveTrip,
  method: "Casting",
  flyHatch: "Mayflies",
  waterLevel: "Low",
  gearUsed: [{ ...additiveTrip.gearUsed[0], presentation: "Downrigger", side: "port", flasherId: "flasher-1", hasCheater: true }],
  catches: [{ ...additiveTrip.catches[0], retrieve: "pause", setupLineId: "line-1", rodId: "rod-1", setupLineValue: "" }],
  lostFish: []
}, { state: appState });
assert.equal(castingTrip.flyHatch, "");
assert.equal(castingTrip.waterLevel, "");
assert.equal(castingTrip.gearUsed[0].side, "");
assert.equal(castingTrip.gearUsed[0].presentation, "");
assert.equal(castingTrip.gearUsed[0].flasherId, "");
assert.equal(castingTrip.gearUsed[0].hasCheater, false);
assert.equal(castingTrip.catches[0].presentation, "");
assert.equal(castingTrip.catches[0].retrieve, "pause");
assert.equal(castingTrip.catches[0].setupLineTarget, "");

const noOpFixture = {
  id: "trip-no-op",
  title: "No-op real shapes",
  date: "2026-09-29",
  location: "Lake Ontario",
  locationId: "loc-1",
  launch: "Port Bay",
  launchId: "launch-1",
  launchTime: "06:00",
  linesPulledTime: "10:00",
  hours: 4,
  targetSpecies: "Salmon",
  method: "Trolling",
  weather: "",
  wind: "S 21 mph, gust 27 mph",
  weatherData: { tripWindow: { windSpeedMph: 21, windGustMph: 27, windDirectionDegrees: 180 } },
  people: [],
  gearUsed: [{
    id: "line-no-op",
    startTime: "06:00",
    endTime: "10:00",
    comboId: "combo-1",
    rodId: "rod-1",
    reelId: "reel-1",
    lureId: "lure-1",
    flasherId: "flasher-1",
    lureMinutes: 240,
    flasherMinutes: 240,
    presentation: "Downrigger",
    side: "Port"
  }],
  catches: [{
    id: "catch-spot",
    personId: "person-real",
    species: "Salmon",
    released: false,
    spotAssignmentMode: "manual",
    spotId: "spot-1",
    presentation: "Cheater",
    setupLineId: "line-no-op",
    setupLineTarget: "cheater",
    rigging: "Meat rig",
    ballDepth: "60",
    estimatedLureDepth: "",
    time: "07:30",
    photos: []
  }],
  lostFish: [{
    id: "lost-spot",
    possibleSpecies: "Salmon",
    spotAssignmentMode: "manual",
    spotId: "spot-2",
    setupLineId: "line-no-op",
    time: "08:00",
    photos: []
  }]
};
assert.deepEqual(
  tripFromDraft(createTripDraft(noOpFixture), {
    state: {
      ...appState,
      settings: { units: { windSpeed: "kph" } },
      spots: [{ id: "spot-1", name: "A" }, { id: "spot-2", name: "B" }],
      flashers: [{ id: "flasher-1", name: "White Paddle" }]
    }
  }),
  noOpFixture,
  "opening and saving a trip draft without edits must preserve real-data optional/missing fields exactly"
);

const releasedFixture = {
  ...noOpFixture,
  title: "Release flags",
  catches: [
    { id: "kept", species: "Salmon", released: false, time: "07:00", photos: [] },
    { id: "released", species: "Salmon", released: true, time: "07:05", photos: [] }
  ]
};
const releasedDraft = createTripDraft(releasedFixture);
releasedDraft.title = "Release flags edited";
const releasedTrip = tripFromDraft(releasedDraft, { state: appState });
assert.equal(releasedTrip.catches[0].released, false, "kept fish must stay kept when only the trip title changes");
assert.equal(releasedTrip.catches[1].released, true, "released fish must stay released when only the trip title changes");
assert.deepEqual(
  releasedTrip.catches.map(({ id, released }) => ({ id, released })),
  releasedFixture.catches.map(({ id, released }) => ({ id, released }))
);

// trip-draft.js holds the pure draft -> trip normalization; it must never touch the DOM.
const tripDraftSource = readFileSync(new URL("../static/js/trip-draft.js", import.meta.url), "utf8");
assert.equal(/\b(document|querySelector\w*|getElement\w*|getAttribute)\b|\.(value|checked|dataset)\b|\["(value|checked|dataset)"\]/.test(tripDraftSource), false, "trip-draft.js must stay free of DOM access");
