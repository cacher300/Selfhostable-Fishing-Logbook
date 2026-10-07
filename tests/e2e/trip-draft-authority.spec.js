const { expect, test } = require("@playwright/test");
const {
  fillDate,
  freshLogbook,
  readLogbook,
  resetLogbook,
  seededLocation,
  stubExternalApis
} = require("./helpers");

async function resetWith(page, overrides = {}) {
  const base = await freshLogbook(page, { locations: [seededLocation()] });
  const document = {
    ...base,
    ...overrides,
    settings: {
      ...base.settings,
      ...(overrides.settings || {}),
      units: {
        ...base.settings.units,
        ...(overrides.settings?.units || {})
      }
    }
  };
  await resetLogbook(page, document);
  await stubExternalApis(page);
}

async function fillBasics(page, {
  title = "Draft authority trip",
  date = "09/15/2026",
  target = "Walleye",
  method = "Casting",
  start = "06:00",
  end = "10:00"
} = {}) {
  await page.locator("#tripTitle").fill(title);
  await fillDate(page, "#tripDate", date);
  await page.locator("#tripLocation").selectOption({ label: "Lake Erie" });
  await page.locator("#tripLaunch").selectOption({ label: "Port Clinton Launch" });
  await page.locator("#targetSpecies").selectOption({ label: target });
  await page.locator("#method").selectOption({ label: method });
  await page.locator("#launchTime").fill(start);
  await page.locator("#linesPulledTime").fill(end);
}

async function saveTrip(page) {
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#tripDialog [data-trip-save]").first().click();
  await expect(page.locator("#tripDialog")).toBeHidden();
}

async function openSeededTrip(page, tripId) {
  await page.locator(`.table-row[data-view-trip="${tripId}"]`).click();
  await expect(page.locator("#tripSummaryDialog")).toBeVisible();
  await page.getByRole("button", { name: "Edit Trip", exact: true }).click();
  await expect(page.locator("#tripDialog")).toBeVisible();
}

test.describe("trip draft is the editor authority", () => {
  test.setTimeout(60_000);
  test.afterEach(async ({ page }) => {
    await resetLogbook(page, await freshLogbook(page));
  });

  test("silent DOM value writes are ignored but normal edits persist", async ({ page }) => {
    await resetWith(page, {
      trips: [{
        id: "trip-authority",
        title: "Original title",
        date: "2026-09-10",
        location: "Lake Erie",
        locationId: "loc-lake-erie",
        launch: "Port Clinton Launch",
        launchId: "launch-port-clinton",
        launchTime: "06:00",
        linesPulledTime: "09:00",
        hours: 3,
        targetSpecies: "Walleye",
        method: "Casting",
        people: [],
        gearUsed: [],
        catches: [{ id: "catch-1", species: "Walleye", time: "07:00", photos: [] }],
        lostFish: []
      }]
    });
    await page.goto("/trips", { waitUntil: "domcontentloaded" });

    await openSeededTrip(page, "trip-authority");
    await page.locator("#tripTitle").evaluate((element) => { element.value = "Silent title"; });
    await page.locator('#catchRows .catch-row[data-catch-id="catch-1"] .catch-species').evaluate((element) => { element.value = "Perch"; });
    await saveTrip(page);

    let trip = (await readLogbook(page)).trips.find((item) => item.id === "trip-authority");
    expect(trip.title).toBe("Original title");
    expect(trip.catches[0].species).toBe("Walleye");

    await openSeededTrip(page, "trip-authority");
    await page.locator("#tripTitle").fill("Normal title");
    await page.locator('#catchRows .catch-row[data-catch-id="catch-1"] [data-toggle-row]').click();
    await page.locator('#catchRows .catch-row[data-catch-id="catch-1"] .catch-species').selectOption({ label: "Perch" });
    await saveTrip(page);

    trip = (await readLogbook(page)).trips.find((item) => item.id === "trip-authority");
    expect(trip.title).toBe("Normal title");
    expect(trip.catches[0].species).toBe("Perch");
  });

  test("duplicating a catch then editing the copy persists both rows", async ({ page }) => {
    await resetWith(page);
    await page.goto("/trips", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "New Trip", exact: true }).click();
    await fillBasics(page);
    await page.locator("#personRows .person-name").fill("Avery");
    await page.getByRole("button", { name: "Add Catch", exact: true }).click();
    const first = page.locator("#catchRows .catch-row").first();
    await first.locator(".catch-species").selectOption({ label: "Walleye" });
    await first.locator(".catch-length").fill("20 in");
    await first.locator(".catch-time").fill("07:10");
    await first.locator(".duplicate-catch").click();
    const copy = page.locator("#catchRows .catch-row").nth(1);
    await copy.locator("[data-toggle-row]").click();
    await copy.locator(".catch-species").selectOption({ label: "Perch" });
    await copy.locator(".catch-length").fill("12 in");
    await copy.locator(".catch-time").fill("08:20");
    await saveTrip(page);

    const catches = (await readLogbook(page)).trips[0].catches;
    expect(catches).toHaveLength(2);
    expect(catches.map((item) => item.species)).toEqual(["Walleye", "Perch"]);
    expect(catches.map((item) => item.length)).toEqual(["20 in", "12 in"]);
  });

  test("saved setups and trolling spreads persist applied gear rows", async ({ page }) => {
    const gear = {
      rods: [
        { id: "rod-cast", name: "Casting Rod", media: [] },
        { id: "rod-troll", name: "Trolling Rod", media: [] }
      ],
      reels: [
        { id: "reel-cast", name: "Casting Reel", media: [] },
        { id: "reel-troll", name: "Trolling Reel", media: [] }
      ],
      rodReelCombos: [
        { id: "combo-cast", rodId: "rod-cast", reelId: "reel-cast", shortName: "Cast Combo" },
        { id: "combo-troll", rodId: "rod-troll", reelId: "reel-troll", shortName: "Troll Combo" }
      ],
      settings: {
        savedSetups: [{ id: "setup-cast", name: "Casting Setup", method: "Casting", rows: [{ comboId: "combo-cast" }] }],
        defaultSavedSetupIds: { Casting: "setup-cast" },
        trollingSpreads: [{ id: "spread-troll", name: "Port Rigger", spread: [{ comboId: "combo-troll", side: "Port", presentation: "Downrigger" }] }],
        defaultTrollingSpreadId: "spread-troll"
      }
    };
    await resetWith(page, gear);
    await page.goto("/trips", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "New Trip", exact: true }).click();
    await fillBasics(page, { title: "Saved setup trip", method: "Casting" });
    await page.getByRole("button", { name: "Pick Setup", exact: true }).click();
    await page.locator('[data-pick-saved-setup="setup-cast"]').click();
    await page.locator("#savedSetupPickerDialog").evaluate((dialog) => dialog.close());
    await saveTrip(page);

    await page.getByRole("button", { name: "New Trip", exact: true }).click();
    await fillBasics(page, { title: "Spread trip", method: "Trolling" });
    await page.getByRole("button", { name: "Pick Spread", exact: true }).click();
    await page.locator('[data-pick-trolling-spread="spread-troll"]').click();
    await expect(page.locator("#trollingSpreadPickerDialog")).toBeHidden();
    await saveTrip(page);

    const trips = (await readLogbook(page)).trips;
    expect(trips.find((trip) => trip.title === "Saved setup trip").gearUsed[0]).toMatchObject({ comboId: "combo-cast", rodId: "rod-cast", reelId: "reel-cast" });
    expect(trips.find((trip) => trip.title === "Spread trip").gearUsed[0]).toMatchObject({ comboId: "combo-troll", side: "Port", presentation: "Downrigger" });
  });

  test("manual catch coordinates persist", async ({ page }) => {
    await resetWith(page);
    await page.goto("/trips", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "New Trip", exact: true }).click();
    await fillBasics(page);
    await page.getByRole("button", { name: "Add Catch", exact: true }).click();
    const row = page.locator("#catchRows .catch-row").first();
    await row.locator(".catch-species").selectOption({ label: "Walleye" });
    await row.evaluate((element) => {
      const latitude = element.querySelector(".catch-latitude");
      const longitude = element.querySelector(".catch-longitude");
      latitude.value = "41.6001";
      longitude.value = "-82.9002";
      latitude.dispatchEvent(new Event("input", { bubbles: true }));
      longitude.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await saveTrip(page);

    expect((await readLogbook(page)).trips[0].catches[0].manualCoordinates).toMatchObject({
      latitude: 41.6001,
      longitude: -82.9002,
      manual: true
    });
  });

  test("photo queue autofill persists photo reference and capture time", async ({ page }) => {
    await resetWith(page);
    await page.route("**/api/photo-queue", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ photos: [{
        filename: "queued.jpg",
        capturedAt: "2026-09-15T07:45:00",
        captureDate: "2026-09-15",
        captureTime: "07:45",
        coordinates: { latitude: 41.61, longitude: -82.91 }
      }] })
    }));
    await page.route("**/api/photo-queue/copy", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        category: "catch-photos",
        filename: "queued-copy.jpg",
        capturedAt: "2026-09-15T07:45:00",
        captureDate: "2026-09-15",
        captureTime: "07:45",
        coordinates: { latitude: 41.61, longitude: -82.91 }
      })
    }));
    await page.route("**/api/bathymetry/**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ fowCaught: "32 ft", depth_ft: 32, depth_source: "stub" })
    }));
    await page.goto("/trips", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "New Trip", exact: true }).click();
    await fillBasics(page, { date: "09/15/2026" });
    await page.getByRole("button", { name: "Autofill from Queue", exact: true }).click();
    await expect(page.locator("#catchRows .catch-row")).toHaveCount(1);
    await saveTrip(page);

    const catchItem = (await readLogbook(page)).trips[0].catches[0];
    expect(catchItem.time).toBe("07:45");
    expect(catchItem.photos[0]).toMatchObject({ category: "catch-photos", filename: "queued-copy.jpg" });
  });

  test("unit-aware depth strings persist unchanged", async ({ page }) => {
    await resetWith(page, {
      settings: { units: { depth: "m" } }
    });
    await page.goto("/trips", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "New Trip", exact: true }).click();
    await fillBasics(page);
    await page.getByRole("button", { name: "Add Catch", exact: true }).click();
    const row = page.locator("#catchRows .catch-row").first();
    await row.locator(".catch-species").selectOption({ label: "Walleye" });
    await row.locator(".catch-water-depth").fill("12 m");
    await saveTrip(page);

    expect((await readLogbook(page)).trips[0].catches[0].waterDepth).toBe("12 m");
  });
});
