const { expect, test } = require("@playwright/test");
const { freshLogbook, readLogbook, resetLogbook, stubExternalApis } = require("./helpers");

test("spots and drifts open a focused map editor and save once", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const spotCenter = { latitude: 43.7, longitude: -77.9 };
  const seed = await freshLogbook(page, {
    locations: [{ id: "lake-ontario", name: "Lake Ontario", coordinates: spotCenter, launches: [] }],
    drifts: [{
      id: "known-drift",
      name: "Known drift",
      waterbody: "Niagara River",
      polygon: [
        { latitude: 43.15, longitude: -79.14 }, { latitude: 43.27, longitude: -79.14 },
        { latitude: 43.27, longitude: -78.96 }, { latitude: 43.15, longitude: -78.96 }
      ]
    }]
  });
  await resetLogbook(page, seed);
  await stubExternalApis(page);
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await page.locator('[data-settings-tab="waterbodies"]').click();

  await page.locator('[data-add-fishing-area="spot"]').click();
  await expect(page.locator("#fishingAreaDialog")).toBeVisible();
  const mapHint = page.locator("#fishingAreaMapHint");
  const waterbody = page.locator("#fishingAreaWaterbody");
  const areaMap = page.locator("#fishingAreaMap");
  await expect(mapHint).toBeVisible();
  await page.locator("#fishingAreaName").fill("North seam");
  await expect(page.locator("#fishingAreaFields input[type=number]")).toHaveCount(0);
  await expect(areaMap.locator(".leaflet-marker-icon")).toBeVisible();
  await areaMap.click({ position: { x: 180, y: 100 } });
  await expect(waterbody).toHaveValue("Lake Ontario");
  await page.locator("[data-save-fishing-area]").click();
  await expect(page.locator("#fishingAreaDialog")).toBeHidden();
  await expect(page.locator("#areaSpotList .fishing-area-row")).toHaveCount(1);
  await page.locator("#areaSpotList .fishing-area-row").click();
  await expect(page.locator("#fishingAreaName")).toHaveValue("North seam");
  await waterbody.fill("My waterbody");
  await areaMap.click({ position: { x: 310, y: 100 } });
  await expect(waterbody).toHaveValue("My waterbody");
  await page.locator("[data-close-fishing-area]").first().click();

  await page.locator('[data-add-fishing-area="drift"]').click();
  await expect(mapHint).toBeHidden();
  await page.locator("#fishingAreaName").fill("Test drift");
  const points = page.locator("#fishingAreaVertices");
  await expect(page.getByRole("button", { name: "Add point at map center" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo last point" })).toBeVisible();
  await expect(areaMap).toHaveClass(/leaflet-container/);
  await areaMap.click({ position: { x: 180, y: 100 } });
  await areaMap.click({ position: { x: 310, y: 100 } });
  await expect(waterbody).toHaveValue("");
  await page.locator("[data-save-fishing-area]").click();
  await expect(page.locator("#fishingAreaMessage")).toContainText("at least three distinct points");
  await areaMap.click({ position: { x: 310, y: 220 } });
  await expect(waterbody).toHaveValue("Niagara River");
  await areaMap.click({ position: { x: 180, y: 220 } });
  await expect(points.locator("input")).toHaveCount(0);
  await expect(points.getByRole("button")).toHaveCount(4);
  await points.getByRole("button", { name: "Remove point 4" }).click();
  await expect(points.getByRole("button")).toHaveCount(3);
  await expect(areaMap.getByTitle("Point 4")).toHaveCount(0);

  const firstPin = areaMap.getByTitle("Point 1", { exact: true });
  await expect(firstPin).toBeVisible();
  const pin = await firstPin.boundingBox();
  const pinX = pin.x + pin.width / 2;
  const pinY = pin.y + pin.height / 2;
  await page.mouse.move(pinX, pinY);
  await page.mouse.down();
  await page.mouse.move(pinX - 30, pinY + 20, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await firstPin.boundingBox())?.x).toBeLessThan(pin.x - 20);

  await page.locator("[data-save-fishing-area]").click();
  await expect(page.locator("#fishingAreaDialog")).toBeHidden();
  const driftRow = page.locator("#areaDriftList .fishing-area-row").filter({ hasText: "Test drift" });
  await expect(driftRow).toContainText("Niagara River");
  const saved = await readLogbook(page);
  expect(saved.spots[0].name).toBe("North seam");
  expect(saved.spots[0].lake).toBe("Lake Ontario");
  expect(saved.spots[0].coordinates).not.toEqual(spotCenter);
  expect(saved.drifts.find(drift => drift.name === "Test drift")?.polygon).toHaveLength(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await driftRow.click();
  await expect(areaMap).toBeVisible();
  await expect(points.getByRole("button", { name: "Remove point 3" })).toBeVisible();
  await expect(points.locator("input")).toHaveCount(0);
  const dialogBounds = await page.locator("#fishingAreaDialog").boundingBox();
  expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
  expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(390);
  await page.locator("[data-close-fishing-area]").first().click();
  expect(errors).toEqual([]);
  await resetLogbook(page, seed);
});

test("home locations use the shared area cards and save privacy settings from the map editor", async ({ page }) => {
  const seed = await freshLogbook(page, { drifts: [] });
  const home = {
    id: "home-test", name: "Original home", radiusMeters: 250,
    coordinates: { latitude: 43.7, longitude: -79.4 }, extraLabel: "preserve me"
  };
  seed.settings.privatePhotoLocations = [home];
  await resetLogbook(page, seed);
  await stubExternalApis(page);
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await page.locator('[data-settings-tab="waterbodies"]').click();

  const homes = page.locator("#privatePhotoLocationList");
  const card = homes.locator(".fishing-area-row");
  await expect(card).toContainText("Original home");
  await expect(card).toContainText("radius");
  const search = page.getByRole("searchbox", { name: "Find a home location" });
  await search.fill("missing");
  await expect(card).toHaveCount(0);
  await search.clear();
  await card.click();

  let dialog = page.getByRole("dialog", { name: "Edit Home Location" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Waterbody" })).toHaveCount(0);
  await dialog.getByLabel("Name", { exact: true }).fill("Renamed home");
  await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
  const areaMap = dialog.locator("#fishingAreaMap");
  const homePin = areaMap.locator(".leaflet-marker-icon");
  await expect(homePin).toBeVisible();
  await areaMap.focus();
  const initialPin = await homePin.boundingBox();
  await areaMap.press("ArrowUp");
  await expect.poll(async () => (await homePin.boundingBox())?.y).toBeGreaterThan(initialPin.y);
  await areaMap.press("Enter");
  await dialog.getByRole("slider", { name: /privacy radius/i }).press("ArrowRight");
  await dialog.getByRole("button", { name: "Save area" }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Renamed home");

  let saved = await readLogbook(page);
  expect(saved.settings.privatePhotoLocations[0]).toMatchObject({
    id: home.id, name: "Renamed home", extraLabel: "preserve me"
  });
  expect(saved.settings.privatePhotoLocations[0].coordinates.latitude).toBeGreaterThan(home.coordinates.latitude);
  expect(saved.settings.privatePhotoLocations[0].radiusMeters).toBeGreaterThan(home.radiusMeters);
  expect(saved.spots).toEqual([]);
  expect(saved.drifts).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Add Home Location" }).click();
  dialog = page.getByRole("dialog", { name: "Add Home Location" });
  await expect(dialog.locator("#fishingAreaMap")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(card).toHaveCount(1);
  await card.click();
  page.once("dialog", confirmation => confirmation.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(homes).toContainText("No home locations saved.");
  saved = await readLogbook(page);
  expect(saved.settings.privatePhotoLocations).toEqual([]);
  await resetLogbook(page, seed);
});
