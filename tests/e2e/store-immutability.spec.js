const { expect, test } = require("@playwright/test");

async function readLogbookWithRevision(page) {
  const response = await page.request.get("/api/logbook");
  await expect(response, "GET /api/logbook").toBeOK();
  return {
    document: await response.json(),
    etag: response.headers()["etag"] || ""
  };
}

async function readLogbook(page) {
  return (await readLogbookWithRevision(page)).document;
}

async function resetLogbook(page, document) {
  const { etag } = await readLogbookWithRevision(page);
  const csrfResponse = await page.request.get("/api/csrf-token");
  await expect(csrfResponse, "GET /api/csrf-token").toBeOK();
  const csrf = await csrfResponse.json();
  const response = await page.request.put("/api/logbook", {
    headers: {
      "Content-Type": "application/json",
      "If-Match": etag,
      "X-CSRF-Token": csrf.csrfToken || csrf.csrf_token || csrf.token || ""
    },
    data: document
  });
  await expect(response, "PUT /api/logbook").toBeOK();
}

async function freshLogbook(page, overrides = {}) {
  const base = structuredClone(await readLogbook(page));
  return {
    ...base,
    lures: [],
    flashers: [],
    reels: [],
    rods: [],
    rodReelCombos: [],
    people: [],
    locations: [],
    spots: [],
    expeditions: [],
    trips: [],
    settings: {
      ...base.settings,
      theme: "light",
      defaultPeople: [],
      checklists: [],
      trollingSpreads: [],
      defaultTrollingSpreadId: "",
      units: { ...base.settings.units, depth: "ft" }
    },
    ...overrides
  };
}

async function stubExternalApis(page) {
  await page.route("**/api/weather/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: false, message: "Weather unavailable in e2e" })
  }));
  await page.route("**/api/astronomy**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: false, message: "Astronomy unavailable in e2e" })
  }));
  await page.route("**/api/marine**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: false, message: "Marine unavailable in e2e" })
  }));
  await page.route("**/api/great-lakes/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: false, values: [], message: "Great Lakes data unavailable in e2e" })
  }));
}

function seededLocation() {
  return {
    id: "loc-lake-erie",
    name: "Lake Erie",
    coordinates: { latitude: 41.651, longitude: -82.822 },
    launches: [
      {
        id: "launch-port-clinton",
        name: "Port Clinton Launch",
        coordinates: { latitude: 41.512, longitude: -82.938 }
      }
    ]
  };
}

async function fillDate(page, selector, displayValue) {
  await page.locator(selector).fill(displayValue);
  await page.locator(selector).blur();
}

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("store-backed actions stay immutable", () => {
  test.afterEach(async ({ page }) => {
    await resetLogbook(page, await freshLogbook(page));
  });

  test("creates and deletes expeditions through committed actions", async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await resetLogbook(page, await freshLogbook(page));
    await stubExternalApis(page);

    await page.goto("/expeditions", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "New Expedition", exact: true }).click();
    await page.locator("#expeditionName").fill("Store Action Week");
    await fillDate(page, "#expeditionStartDate", "08/01/2026");
    await fillDate(page, "#expeditionEndDate", "08/03/2026");
    await page.locator("#expeditionDestination").fill("Eastern Basin");
    await page.locator("#expeditionNotes").fill("Created by the immutability spec.");
    await page.getByRole("button", { name: "Save Expedition", exact: true }).click();
    await expect(page.locator("#expeditionDialog")).toBeHidden();

    let saved = await readLogbook(page);
    expect(saved.expeditions).toHaveLength(1);
    expect(saved.expeditions[0]).toMatchObject({
      name: "Store Action Week",
      startDate: "2026-08-01",
      endDate: "2026-08-03",
      destination: "Eastern Basin"
    });

    await page.locator(`[data-edit-expedition="${saved.expeditions[0].id}"]`).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#deleteExpeditionButton").click();
    await expect(page.locator("#expeditionDialog")).toBeHidden();

    saved = await readLogbook(page);
    expect(saved.expeditions).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("reorders waterbodies and preserves the in-use delete guard", async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    const erie = seededLocation();
    const ontario = {
      id: "loc-lake-ontario",
      name: "Lake Ontario",
      coordinates: { latitude: 43.7, longitude: -77.9 },
      launches: []
    };
    await resetLogbook(page, await freshLogbook(page, {
      locations: [erie, ontario],
      trips: [{
        id: "trip-uses-erie",
        title: "Guarded location trip",
        date: "2026-07-04",
        location: erie.name,
        locationId: erie.id,
        launch: erie.launches[0].name,
        launchId: erie.launches[0].id,
        launchTime: "06:00",
        linesPulledTime: "08:00",
        hours: 2,
        targetSpecies: "Walleye",
        method: "Casting",
        people: [],
        gearUsed: [],
        catches: [],
        lostFish: []
      }]
    }));
    await stubExternalApis(page);

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Waterbodies", exact: true }).click();
    const ontarioCard = page.locator('[data-managed-location-id="loc-lake-ontario"] .location-manager-heading');
    const erieCard = page.locator('[data-managed-location-id="loc-lake-erie"] .location-manager-heading');
    const erieBox = await erieCard.boundingBox();
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await ontarioCard.dispatchEvent("dragstart", { dataTransfer });
    await erieCard.dispatchEvent("dragover", { dataTransfer, clientY: erieBox.y });
    await page.locator("#locationManagerList").dispatchEvent("drop", { dataTransfer });
    await dataTransfer.dispose();
    await expect.poll(async () => (await readLogbook(page)).locations.map((location) => location.id).join(",")).toBe("loc-lake-ontario,loc-lake-erie");

    await page.locator('[data-edit-managed-location="loc-lake-erie"]').click();
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("used by 1 saved trip");
      await dialog.accept();
    });
    await page.locator("#deleteLocationDialogButton").click();

    const saved = await readLogbook(page);
    expect(saved.locations.map((location) => location.id)).toEqual(["loc-lake-ontario", "loc-lake-erie"]);
    expect(saved.trips[0].locationId).toBe("loc-lake-erie");
    expect(pageErrors).toEqual([]);
  });

  test("duplicates, resets, and deletes checklists without mutating live state", async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await resetLogbook(page, await freshLogbook(page));
    await stubExternalApis(page);

    await page.goto("/checklists", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "New Checklist", exact: true }).click();
    const firstCard = page.locator(".checklist-card").first();
    await firstCard.locator(".checklist-name").fill("Launch Prep");
    await firstCard.getByRole("button", { name: "Add Item", exact: true }).click();
    await firstCard.locator(".checklist-item-label").fill("Pack release tools");
    await firstCard.locator(".checklist-item-done").check();
    await expect.poll(async () => (await readLogbook(page)).settings.checklists?.[0]?.items?.[0]?.done).toBe(true);

    await firstCard.getByRole("button", { name: "Duplicate", exact: true }).click();
    await expect(page.locator(".checklist-card")).toHaveCount(2);
    let saved = await readLogbook(page);
    expect(saved.settings.checklists).toHaveLength(2);
    expect(saved.settings.checklists[1].name).toBe("Copy of Launch Prep");
    expect(saved.settings.checklists[1].items[0].done).toBe(false);

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator(".checklist-card").first().getByRole("button", { name: "Reset Checklist", exact: true }).click();
    await expect.poll(async () => (await readLogbook(page)).settings.checklists?.[0]?.items?.[0]?.done).toBe(false);

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator(".checklist-card").nth(1).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator(".checklist-card")).toHaveCount(1);
    saved = await readLogbook(page);
    expect(saved.settings.checklists).toHaveLength(1);
    expect(saved.settings.checklists[0].name).toBe("Launch Prep");
    expect(pageErrors).toEqual([]);
  });
});
