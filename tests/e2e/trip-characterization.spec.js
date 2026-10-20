const { expect, test } = require("@playwright/test");
const {
  fillDate,
  freshLogbook,
  readLogbook,
  resetLogbook,
  seededLocation,
  stubExternalApis
} = require("./helpers");

async function resetWithLocations(page, overrides = {}) {
  const document = await freshLogbook(page, {
    locations: [seededLocation()],
    ...overrides
  });

  await resetLogbook(page, document);
  await stubExternalApis(page);
}

async function fillRequiredTripBasics(page, {
  title,
  date = "05/10/2026",
  target = "Walleye",
  method = "Casting",
  start = "06:15",
  end = "10:45",
  notes = ""
}) {
  await page.locator("#tripTitle").fill(title);
  await fillDate(page, "#tripDate", date);
  await page.locator("#tripLocation").selectOption({ label: "Lake Erie" });
  await page.locator("#tripLaunch").selectOption({ label: "Port Clinton Launch" });
  await page.locator("#targetSpecies").selectOption({ label: target });
  await page.locator("#method").selectOption({ label: method });
  await page.locator("#launchTime").fill(start);
  await page.locator("#linesPulledTime").fill(end);
  if (notes) await page.locator("#tripNotes").fill(notes);
}

async function saveTrip(page) {
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#tripDialog [data-trip-save]").first().click();
  await expect(page.locator("#tripDialog")).toBeHidden();
}

test.describe("trip editor characterization", () => {
  test.afterEach(async ({ page }) => {
    await resetLogbook(page, await freshLogbook(page));
  });

  test("creates a casting trip with landed and missed fish JSON separated", async ({ page }) => {
    await resetWithLocations(page);
    await page.goto("/trips", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "New Trip", exact: true }).click();
    await fillRequiredTripBasics(page, {
      title: "Evening casting bite",
      notes: "Wind shifted after sunset."
    });
    await page.locator("#personRows .person-name").fill("Avery");

    await page.getByRole("button", { name: "Add Catch", exact: true }).click();
    const catchRow = page.locator("#catchRows .catch-row").first();
    await catchRow.locator(".catch-person").selectOption({ label: "Avery" });
    await catchRow.locator(".catch-species").selectOption({ label: "Walleye" });
    await catchRow.locator(".catch-length").fill("22 in");
    await catchRow.locator(".catch-weight").fill("4 lb");
    await catchRow.locator(".catch-time").fill("08:05");

    await page.getByRole("button", { name: "Add Missed Fish", exact: true }).click();
    const lostRow = page.locator("#lostFishRows .catch-row").first();
    await lostRow.locator("[data-toggle-row]").click();
    await lostRow.locator(".catch-person").selectOption({ label: "Avery" });
    await lostRow.locator(".catch-possible-species").selectOption({ label: "Walleye" });
    await lostRow.locator(".catch-time").fill("09:15");

    await saveTrip(page);

    const saved = await readLogbook(page);
    expect(saved.trips).toHaveLength(1);
    const trip = saved.trips[0];
    expect(trip).toMatchObject({
      title: "Evening casting bite",
      date: "2026-05-10",
      launchTime: "06:15",
      linesPulledTime: "10:45",
      method: "Casting",
      targetSpecies: "Walleye",
      locationId: "loc-lake-erie",
      launchId: "launch-port-clinton",
      notes: "Wind shifted after sunset."
    });
    expect(trip.people).toHaveLength(1);
    expect(trip.people[0].name).toBe("Avery");
    expect(trip.catches).toHaveLength(1);
    expect(trip.catches[0]).toMatchObject({
      species: "Walleye",
      length: "22 in",
      weight: "4 lb",
      time: "08:05",
      personId: trip.people[0].id
    });
    expect(trip.lostFish).toHaveLength(1);
    expect(trip.lostFish[0]).toMatchObject({
      possibleSpecies: "Walleye",
      species: "",
      time: "09:15",
      personId: trip.people[0].id
    });
  });

  test("creates a trolling trip with setup lines and catch setupLineId", async ({ page }) => {
    await resetWithLocations(page, {
      lures: [
        { id: "lure-spoon", name: "Green Spoon", type: "Spoon", color: "Green", media: [] },
        { id: "lure-plug", name: "Chrome Plug", type: "Plug", color: "Chrome", media: [] }
      ]
    });
    await page.goto("/trips", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "New Trip", exact: true }).click();
    await fillRequiredTripBasics(page, {
      title: "Two rod troll",
      method: "Trolling",
      start: "05:30",
      end: "09:30"
    });
    await page.locator("#personRows .person-name").fill("Morgan");

    for (const [index, line] of [
      { side: "Port", presentation: "Outside Board", lureId: "lure-spoon" },
      { side: "Starboard", presentation: "Downrigger", lureId: "lure-plug" }
    ].entries()) {
      await page.getByRole("button", { name: "Add Rod", exact: true }).click();
      const rowId = await page.locator("#tripGearRows .gear-used-row").last().getAttribute("data-row-id");
      const row = page.locator(`#tripGearRows .gear-used-row[data-row-id="${rowId}"]`);
      await row.locator(".trip-gear-start-time").fill("05:35");
      await row.locator(".trip-gear-end-time").fill("09:10");
      await row.locator(".trip-gear-side").selectOption({ label: line.side });
      await row.locator(".catch-presentation").selectOption({ label: line.presentation });
      await row.locator(".trip-gear-lure").selectOption(line.lureId);
    }

    await page.getByRole("button", { name: "Add Catch", exact: true }).click();
    const catchRow = page.locator("#catchRows .catch-row").first();
    await catchRow.locator(".catch-person").selectOption({ label: "Morgan" });
    await catchRow.locator(".catch-species").selectOption({ label: "Walleye" });
    await catchRow.locator(".catch-time").fill("07:20");
    await catchRow.locator(".catch-setup-line").selectOption({ index: 1 });

    await saveTrip(page);

    const trip = (await readLogbook(page)).trips[0];
    expect(trip.gearUsed).toHaveLength(2);
    const setupSummary = trip.gearUsed.map((line) => ({
      id: line.id,
      side: line.side,
      presentation: line.presentation,
      lureId: line.lureId,
      startTime: line.startTime
    }));
    expect(setupSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.any(String), side: "Port", presentation: "Outside Board", lureId: "lure-spoon", startTime: "05:35" }),
      expect.objectContaining({ id: expect.any(String), side: "Starboard", presentation: "Downrigger", lureId: "lure-plug", startTime: "05:35" })
    ]));
    expect(trip.catches).toHaveLength(1);
    expect(trip.gearUsed.map((line) => line.id)).toContain(trip.catches[0].setupLineId);
  });

  test("editing a seeded trip title preserves additive trip, catch, and setup fields", async ({ page }) => {
    const additive = { nested: ["keep", "exactly"], value: 42 };
    await resetWithLocations(page, {
      people: [{ id: "person-lee", name: "Lee" }],
      lures: [{ id: "lure-jig", name: "Hair Jig", type: "Jig", color: "Black", media: [] }],
      trips: [{
        id: "trip-preserve",
        title: "Original title",
        date: "2026-06-01",
        location: "Lake Erie",
        locationId: "loc-lake-erie",
        launch: "Port Clinton Launch",
        launchId: "launch-port-clinton",
        launchTime: "06:00",
        linesPulledTime: "09:00",
        hours: 3,
        targetSpecies: "Walleye",
        method: "Casting",
        customAdditive: additive,
        people: [{ id: "person-lee", name: "Lee" }],
        gearUsed: [{
          id: "gear-1",
          startTime: "06:00",
          endTime: "09:00",
          lureId: "lure-jig",
          personId: "person-lee"
        }],
        catches: [{
          id: "catch-1",
          personId: "person-lee",
          species: "Walleye",
          length: "21 in",
          weight: "3 lb",
          time: "07:00",
          quantity: 3,
          photos: []
        }],
        lostFish: []
      }]
    });
    await page.goto("/trips", { waitUntil: "domcontentloaded" });

    await page.locator('.table-row[data-view-trip="trip-preserve"]').click();
    await expect(page.locator("#tripSummaryDialog")).toBeVisible();
    await page.getByRole("button", { name: "Edit Trip", exact: true }).click();
    await page.locator("#tripTitle").fill("Retitled only");
    await saveTrip(page);

    const trip = (await readLogbook(page)).trips.find((item) => item.id === "trip-preserve");
    expect(trip.title).toBe("Retitled only");
    expect(trip.customAdditive).toEqual(additive);
    expect(trip.catches[0].quantity).toBe(3);
    expect(trip.gearUsed[0].personId).toBe("person-lee");
  });

  test("deletes a trip from the editor", async ({ page }) => {
    await resetWithLocations(page, {
      trips: [{
        id: "trip-delete",
        title: "Delete Me",
        date: "2026-06-02",
        location: "Lake Erie",
        locationId: "loc-lake-erie",
        launchTime: "06:00",
        linesPulledTime: "07:00",
        hours: 1,
        targetSpecies: "Walleye",
        method: "Casting",
        people: [],
        gearUsed: [],
        catches: [],
        lostFish: []
      }]
    });
    page.on("dialog", async (dialog) => {
      if (dialog.type() === "prompt") await dialog.accept("Delete Me");
      else await dialog.accept();
    });
    await page.goto("/trips", { waitUntil: "domcontentloaded" });

    await page.locator('.table-row[data-view-trip="trip-delete"]').click();
    await page.getByRole("button", { name: "Edit Trip", exact: true }).click();
    await page.locator("#deleteTripButton").click();
    await expect(page.locator("#tripDialog")).toBeHidden();
    await expect(page.locator('.table-row[data-view-trip="trip-delete"]')).toHaveCount(0);

    expect((await readLogbook(page)).trips.find((trip) => trip.id === "trip-delete")).toBeUndefined();
  });

  test("uses a seeded location and launch from the trip editor", async ({ page }) => {
    await resetWithLocations(page);
    await page.goto("/trips", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "New Trip", exact: true }).click();
    await fillRequiredTripBasics(page, {
      title: "Launch selection trip",
      target: "Perch",
      method: "Jigging",
      start: "07:00",
      end: "08:30"
    });
    await page.locator("#personRows .person-name").fill("Sam");
    await saveTrip(page);

    const trip = (await readLogbook(page)).trips[0];
    expect(trip.location).toBe("Lake Erie");
    expect(trip.locationId).toBe("loc-lake-erie");
    expect(trip.launch).toBe("Port Clinton Launch");
    expect(trip.launchId).toBe("launch-port-clinton");
  });
});

test.describe("trip draft editor flows", () => {
    test.afterEach(async ({ page }) => {
      await resetLogbook(page, await freshLogbook(page));
    });

    test("edits an existing trolling setup line and keeps catches resolved through setupLineId", async ({ page }) => {
      await resetWithLocations(page, {
        lures: [{ id: "lure-spoon", name: "Green Spoon", type: "Spoon", media: [] }],
        trips: [{
          id: "trip-troll-edit",
          title: "Seed troll",
          date: "2026-07-01",
          location: "Lake Erie",
          locationId: "loc-lake-erie",
          launchTime: "06:00",
          linesPulledTime: "09:00",
          hours: 3,
          targetSpecies: "Walleye",
          method: "Trolling",
          people: [{ id: "person-1", name: "Avery" }],
          gearUsed: [{ id: "line-1", startTime: "06:00", endTime: "09:00", side: "Port", presentation: "Outside Board", lureId: "lure-spoon" }],
          catches: [{ id: "catch-1", personId: "person-1", species: "Walleye", time: "07:00", setupLineId: "line-1", lureId: "lure-spoon", photos: [] }],
          lostFish: []
        }]
      });
      await page.goto("/trips", { waitUntil: "domcontentloaded" });

      await page.locator('.table-row[data-view-trip="trip-troll-edit"]').click();
      await page.getByRole("button", { name: "Edit Trip", exact: true }).click();
      const setupRow = page.locator('#tripGearRows .gear-used-row[data-gear-id="line-1"]');
      await setupRow.locator("[data-toggle-row]").click();
      await setupRow.locator(".trip-gear-side").selectOption({ label: "Starboard" });
      await setupRow.locator(".trip-gear-line-label").fill("Starboard board");
      const catchRow = page.locator('#catchRows .catch-row[data-catch-id="catch-1"]');
      await catchRow.locator("[data-toggle-row]").click();
      await catchRow.locator(".catch-setup-line").selectOption("line-1");
      await saveTrip(page);

      const trip = (await readLogbook(page)).trips[0];
      expect(trip.gearUsed[0]).toMatchObject({ id: "line-1", side: "Starboard", lineLabel: "Starboard board" });
      expect(trip.catches[0]).toMatchObject({ id: "catch-1", setupLineId: "line-1", setupLineTarget: "" });
    });

    test("duplicates and removes catch rows from the draft before saving", async ({ page }) => {
      await resetWithLocations(page);
      await page.goto("/trips", { waitUntil: "domcontentloaded" });

      await page.getByRole("button", { name: "New Trip", exact: true }).click();
      await fillRequiredTripBasics(page, { title: "Duplicate catches" });
      await page.locator("#personRows .person-name").fill("Avery");
      await page.getByRole("button", { name: "Add Catch", exact: true }).click();
      const first = page.locator("#catchRows .catch-row").first();
      await first.locator(".catch-person").selectOption({ label: "Avery" });
      await first.locator(".catch-species").selectOption({ label: "Walleye" });
      await first.locator(".catch-time").fill("08:00");
      await first.locator(".duplicate-catch").click();
      await expect(page.locator("#catchRows .catch-row")).toHaveCount(2);
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator("#catchRows .catch-row").first().locator(".remove-catch").click();
      await saveTrip(page);

      const trip = (await readLogbook(page)).trips[0];
      expect(trip.catches).toHaveLength(1);
      expect(trip.catches[0]).toMatchObject({ species: "Walleye", time: "" });
    });

    test("switching Trolling to Casting and back preserves old blanking semantics", async ({ page }) => {
      await resetWithLocations(page, {
        lures: [{ id: "lure-spoon", name: "Green Spoon", type: "Spoon", media: [] }]
      });
      await page.goto("/trips", { waitUntil: "domcontentloaded" });

      await page.getByRole("button", { name: "New Trip", exact: true }).click();
      await fillRequiredTripBasics(page, { title: "Method switch", method: "Trolling" });
      await page.getByRole("button", { name: "Add Rod", exact: true }).click();
      const row = page.locator("#tripGearRows .gear-used-row").first();
      await row.locator(".trip-gear-side").selectOption({ label: "Port" });
      await row.locator(".catch-presentation").selectOption({ label: "Outside Board" });
      await row.locator(".trip-gear-lure").selectOption("lure-spoon");
      await page.locator("#method").selectOption({ label: "Casting" });
      await page.locator("#method").selectOption({ label: "Trolling" });
      await saveTrip(page);

      const trip = (await readLogbook(page)).trips[0];
      expect(trip.method).toBe("Trolling");
      expect(trip.gearUsed[0].side).toBe("");
      expect(trip.gearUsed[0].presentation).toBe("Outside Board");
      expect(trip.gearUsed[0].lureId).toBe("lure-spoon");
    });

    test("prompts before closing an edited trip with unsaved draft changes", async ({ page }) => {
      await resetWithLocations(page);
      await page.goto("/trips", { waitUntil: "domcontentloaded" });

      await page.getByRole("button", { name: "New Trip", exact: true }).click();
      await page.locator("#tripTitle").fill("Unsaved title");
      page.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain("Discard unsaved trip changes");
        await dialog.dismiss();
      });
      await page.locator("#tripDialog [data-close-dialog]").first().click();
      await expect(page.locator("#tripDialog")).toBeVisible();

      page.once("dialog", (dialog) => dialog.accept());
      await page.locator("#tripDialog [data-close-dialog]").first().click();
      await expect(page.locator("#tripDialog")).toBeHidden();
    });
  });
