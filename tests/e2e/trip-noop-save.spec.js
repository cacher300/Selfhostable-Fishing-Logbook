const { expect, test } = require("@playwright/test");
const { freshLogbook, readLogbook, resetLogbook, seededLocation } = require("./helpers");

async function resetWithNoopTrip(page, trip) {
  await resetLogbook(page, await freshLogbook(page, {
    locations: [seededLocation()],
    people: [{ id: "person-real", name: "Avery" }],
    spots: [
      { id: "spot-1", name: "Waypoint One", coordinates: { latitude: 41.61, longitude: -82.91 }, radiusMeters: 100 },
      { id: "spot-2", name: "Waypoint Two", coordinates: { latitude: 41.62, longitude: -82.92 }, radiusMeters: 100 }
    ],
    rods: [{ id: "rod-1", name: "Rigger Rod", media: [] }],
    reels: [{ id: "reel-1", name: "Rigger Reel", media: [] }],
    rodReelCombos: [{ id: "combo-1", rodId: "rod-1", reelId: "reel-1", shortName: "Rigger Combo" }],
    lures: [{ id: "lure-1", name: "Green Spoon", type: "Spoon", media: [] }],
    flashers: [{ id: "flasher-1", name: "White Paddle", media: [] }],
    settings: { units: { windSpeed: "kph" } },
    trips: [structuredClone(trip)]
  }));
  await page.route("**/api/weather/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "weather down" }) }));
  await page.route("**/api/marine**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "marine down" }) }));
  await page.route("**/api/astronomy**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "astronomy down" }) }));
}

async function saveOpenTrip(page, tripId) {
  await page.locator(`.table-row[data-view-trip="${tripId}"]`).click();
  await page.getByRole("button", { name: "Edit Trip", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#tripDialog [data-trip-save]").first().click();
  await expect(page.locator("#tripDialog")).toBeHidden();
}

async function openTripEditor(page, tripId) {
  await page.locator(`.table-row[data-view-trip="${tripId}"]`).click();
  await page.getByRole("button", { name: "Edit Trip", exact: true }).click();
  await expect(page.locator("#tripDialog")).toBeVisible();
}

function titleEditedTrip(trip, suffix = " x") {
  return { ...structuredClone(trip), title: `${trip.title}${suffix}` };
}

test("saving an unchanged seeded trip preserves the trip record exactly", async ({ page }) => {
  const trip = {
    id: "trip-noop",
    title: "No-op preservation",
    date: "2026-09-29",
    location: "Lake Erie",
    locationId: "loc-lake-erie",
    launch: "Port Clinton Launch",
    launchId: "launch-port-clinton",
    launchTime: "06:00",
    linesPulledTime: "10:00",
    hours: 4,
    targetSpecies: "Walleye",
    method: "Trolling",
    weather: "",
    wind: "S 21 mph, gust 27 mph",
    weatherData: { tripWindow: { windSpeedMph: 21, windGustMph: 27, windDirectionDegrees: 180 } },
    people: [],
    gearUsed: [{
      id: "line-noop",
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
      id: "catch-noop",
      personId: "person-real",
      species: "Walleye",
      released: false,
      spotAssignmentMode: "manual",
      spotId: "spot-1",
      presentation: "Cheater",
      setupLineId: "line-noop",
      setupLineTarget: "cheater",
      rigging: "Meat rig",
      ballDepth: "60",
      estimatedLureDepth: "",
      time: "07:30",
      photos: []
    }],
    lostFish: [{
      id: "lost-noop",
      possibleSpecies: "Walleye",
      spotAssignmentMode: "manual",
      spotId: "spot-2",
      setupLineId: "line-noop",
      time: "08:00",
      photos: []
    }]
  };
  await resetWithNoopTrip(page, trip);
  await page.goto("/trips", { waitUntil: "domcontentloaded" });
  await saveOpenTrip(page, trip.id);
  expect((await readLogbook(page)).trips[0]).toEqual(trip);
});

test("title-only edits preserve kept and released catch flags", async ({ page }) => {
  const trip = {
    id: "trip-release-flags",
    title: "Release flags",
    date: "2026-09-29",
    location: "Lake Erie",
    locationId: "loc-lake-erie",
    launchTime: "06:00",
    linesPulledTime: "10:00",
    hours: 4,
    targetSpecies: "Walleye",
    method: "Casting",
    people: [],
    gearUsed: [],
    catches: [
      { id: "catch-kept", species: "Walleye", released: false, time: "07:00", photos: [] },
      { id: "catch-released", species: "Walleye", released: true, time: "07:10", photos: [] }
    ],
    lostFish: []
  };
  await resetWithNoopTrip(page, trip);
  await page.goto("/trips", { waitUntil: "domcontentloaded" });
  await openTripEditor(page, trip.id);
  await page.locator("#tripTitle").fill(`${trip.title} x`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#tripDialog [data-trip-save]").first().click();
  await expect(page.locator("#tripDialog")).toBeHidden();
  expect((await readLogbook(page)).trips[0]).toEqual(titleEditedTrip(trip));
});
