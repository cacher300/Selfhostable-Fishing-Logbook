const { expect, test } = require("@playwright/test");
const { freshLogbook, readLogbook, resetLogbook, seededLocation, stubExternalApis } = require("./helpers");

test("edits a three-bead rig, preserves catch snapshots, and reopens it on a narrow screen", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await stubExternalApis(page);
  await page.goto("/trips");
  await resetLogbook(page, await freshLogbook(page, {
    locations: [seededLocation()],
    lures: [1, 2, 3].map(id => ({ id: `bead-${id}`, name: `Bead ${id}`, type: "Bead", beadSize: "10mm" })),
    rods: [{ id: "rod", name: "Float rod" }], reels: [{ id: "reel", name: "Centerpin" }],
    rodReelCombos: [{ id: "combo", shortName: "Float combo", rodId: "rod", reelId: "reel" }],
    trips: [{ id: "bead-trip", title: "Bead rig test", date: "2026-10-01", locationId: "loc-lake-erie", location: "Lake Erie", launchId: "launch-port-clinton", launch: "Port Clinton Launch", method: "Drifting", targetSpecies: "Rainbow Trout", launchTime: "08:00", linesPulledTime: "10:00", people: [], gearUsed: [{ id: "line", comboId: "combo", rodId: "rod", lureId: "bead-1", startTime: "08:00", endTime: "10:00" }], catches: [{ id: "fish", species: "Rainbow Trout", time: "09:00", lureId: "bead-1", setupLineId: "line", beadCount: 2, secondBeadLureId: "bead-2", beadSpacing: "8 in", quantity: 2 }], lostFish: [{ id: "lost", possibleSpecies: "Rainbow Trout", time: "09:10", lureId: "bead-1", beadCount: 3, secondBeadLureId: "bead-2", thirdBeadLureId: "bead-3" }] }]
  }));
  await page.reload();
  await expect(page).toHaveTitle(/Fishing/i);
  await page.locator('[data-view-trip="bead-trip"]').first().click();
  await page.getByRole("button", { name: "Edit Trip", exact: true }).click();
  const row = page.locator("#tripGearRows .gear-used-row").first();
  if (await row.evaluate(el => el.classList.contains("collapsed"))) await row.locator("[data-toggle-row]").click();
  const rig = row.locator(".bead-rig-editor");
  await expect(rig).toBeVisible();
  await rig.locator('[data-bind="beadCount"]').selectOption("3");
  await rig.locator('[data-bind="secondBeadLureId"]').selectOption("bead-2");
  await rig.locator('[data-bind="thirdBeadLureId"]').selectOption("bead-3");
  await rig.locator('[data-bind="beadAttachment"]').fill("Pegged");
  await rig.locator('[data-bind="beadToHookDistance"]').fill("2 in");
  await rig.locator('[data-bind="beadSpacing"]').fill("10 in");
  await rig.locator('[data-bind="thirdBeadSpacing"]').fill("12 in");
  const fishRow = page.locator("#catchRows .catch-row").first();
  if (await fishRow.evaluate(el => el.classList.contains("collapsed"))) await fishRow.locator("[data-toggle-row]").click();
  await fishRow.locator(".catch-rod").selectOption("line");
  await expect(fishRow.locator('[data-bind="beadCount"]')).toHaveValue("3");
  await expect(fishRow.locator('[data-bind="thirdBeadLureId"]')).toHaveValue("bead-3");
  // This catch used two beads; later setup edits must preserve that snapshot.
  await fishRow.locator('[data-bind="beadCount"]').selectOption("2");
  await fishRow.locator('[data-bind="beadSpacing"]').fill("8 in");
  const lostRow = page.locator("#lostFishRows .catch-row").first();
  if (await lostRow.evaluate(el => el.classList.contains("collapsed"))) await lostRow.locator("[data-toggle-row]").click();
  await lostRow.locator('[data-bind="beadAttachment"]').fill("Banded");
  await rig.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("three-beads-desktop.png") });
  page.on("dialog", dialog => dialog.accept());
  await page.locator("#tripDialog [data-trip-save]").first().click();
  await expect(page.locator("#tripDialog")).toBeHidden();
  const saved = (await readLogbook(page)).trips.find(trip => trip.id === "bead-trip");
  expect(saved.gearUsed[0]).toMatchObject({ beadCount: 3, secondBeadLureId: "bead-2", thirdBeadLureId: "bead-3", beadAttachment: "Pegged", beadToHookDistance: "2 in", beadSpacing: "10 in", thirdBeadSpacing: "12 in" });
  expect(saved.catches[0]).toMatchObject({ beadCount: 2, secondBeadLureId: "bead-2", beadSpacing: "8 in", quantity: 2 });
  expect(saved.lostFish[0]).toMatchObject({ beadCount: 3, thirdBeadLureId: "bead-3", beadAttachment: "Banded", possibleSpecies: "Rainbow Trout" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('[data-view-trip="bead-trip"]').first().click();
  await page.getByRole("button", { name: "Edit Trip", exact: true }).click();
  if (await row.evaluate(el => el.classList.contains("collapsed"))) await row.locator("[data-toggle-row]").click();
  await expect(rig.locator('[data-bind="thirdBeadLureId"]')).toHaveValue("bead-3");
  await rig.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("three-beads-mobile.png") });
  await rig.locator('[data-bind="beadCount"]').selectOption("1");
  await expect(rig.locator('[data-bind="thirdBeadLureId"]')).toBeHidden();
  await page.locator("#tripDialog [data-trip-save]").first().click();
  await expect(page.locator("#tripDialog")).toBeHidden();
  expect((await readLogbook(page)).trips.find(trip => trip.id === "bead-trip").gearUsed[0]).toMatchObject({ beadCount: 1, secondBeadLureId: "", thirdBeadLureId: "", beadSpacing: "", thirdBeadSpacing: "" });
  expect(errors).toEqual([]);
});
