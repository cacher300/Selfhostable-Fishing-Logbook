const { expect, test } = require("@playwright/test");
const { fillDate, freshLogbook, readLogbook, resetLogbook, stubExternalApis } = require("./helpers");

test("the trip lure picker ranks five common choices and searches the full library", async ({ page }, testInfo) => {
  const lures = [
    { id: "recent", name: "Casting Spoon", color: "Silver", type: "Spoon" },
    { id: "second", name: "Blue Crankbait", type: "Crankbait" },
    ...Array.from({ length: 5 }, (_, index) => ({ id: `spoon-${index}`, name: `Spoon ${index}`, type: "Spoon" })),
    { id: "unused", name: "River Minnow", brand: "Tackle Co", color: "Chartreuse", type: "Crankbait" },
    { id: "fly", name: "Lake Fly", type: "Fly" },
  ];
  const trips = lures.slice(0, 7).map(({ id }, index) => ({
    id: `past-${index}`, title: `Practice trip ${index}`, date: `2025-10-${String(13 - index).padStart(2, "0")}`,
    locationId: "lake", location: "Test Lake", method: "Casting", targetSpecies: "Walleye",
    gearUsed: [{ id: `line-${index}`, lureId: id }], catches: [], lostFish: [], people: []
  }));
  const fixture = await freshLogbook(page, { lures, trips, locations: [{ id: "lake", name: "Test Lake", launches: [] }] });
  fixture.settings.theme = "dark";
  await resetLogbook(page, fixture);
  await stubExternalApis(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 840 });
  await page.goto("/trips");
  await page.getByRole("button", { name: "New Trip", exact: true }).click();
  await fillDate(page, "#tripDate", "10/20/2025");
  await page.locator("#tripLocation").selectOption("lake");
  await page.locator("#method").selectOption("Casting");
  await page.locator("#targetSpecies").selectOption("Walleye");
  await page.locator("#addTripGearButton").click();
  const trigger = page.locator(".gear-lure-field .gear-picker-trigger");
  await trigger.click();
  const picker = page.getByRole("dialog", { name: "Select lure" });
  const search = picker.getByRole("searchbox", { name: "Search lures" });
  const common = picker.locator("[data-common-lures]");
  const library = picker.locator("[data-lure-library]");
  await expect(search).toBeFocused();
  await expect(common.getByRole("button")).toHaveCount(5);
  await expect(common.getByRole("button").first()).toHaveText(/Casting Spoon/);
  await expect(library.getByRole("button")).toHaveCount(8);
  await expect(library.getByRole("button", { name: /Lake Fly/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("desktop-lure-picker.png") });

  await picker.getByLabel("Lure type").selectOption("Crankbait");
  await expect(library.getByRole("button")).toHaveCount(2);
  await search.fill("co chartreuse");
  await expect(common).toBeHidden();
  await expect(library.getByRole("button")).toHaveCount(1);
  await library.getByRole("button", { name: /River Minnow/ }).click();
  await expect(picker).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveText(/River Minnow/);
  await expect(page.locator(".trip-gear-lure")).toHaveValue("unused");

  await page.setViewportSize({ width: 390, height: 780 });
  await trigger.click();
  const bounds = await picker.boundingBox();
  expect(bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("narrow-lure-picker.png") });
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(page.locator("#tripDialog")).toBeVisible();
  await expect(page.locator(".trip-gear-lure")).toHaveValue("unused");
  await trigger.click();
  await picker.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.locator(".trip-gear-lure")).toHaveValue("");

  await page.setViewportSize({ width: 1280, height: 840 });
  await trigger.click();
  await common.getByRole("button", { name: /Casting Spoon/ }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#tripDialog [data-trip-save]").first().click();
  await expect(page.locator("#tripDialog")).toBeHidden();
  const saved = (await readLogbook(page)).trips.find((trip) => trip.date === "2025-10-20");
  expect(saved.gearUsed[0].lureId).toBe("recent");
  expect(errors).toEqual([]);
});

test("submitting a new catch lure twice creates one gear-library entry", async ({ page }) => {
  const fixture = await freshLogbook(page, {
    locations: [{ id: "test-lake", name: "Test Lake", launches: [] }]
  });
  await resetLogbook(page, fixture);
  await stubExternalApis(page);
  await page.goto("/trips");
  await page.getByRole("button", { name: "New Trip", exact: true }).click();
  await fillDate(page, "#tripDate", "10/20/2025");
  await page.locator("#tripLocation").selectOption("test-lake");
  await page.locator("#method").selectOption("Casting");
  await page.locator("#addCatchButton").click();

  const catchRow = page.locator("#catchRows .catch-row").first();
  await catchRow.getByRole("button", { name: "New Lure", exact: true }).click();
  const lureDialog = page.locator("#lureDialog");
  await expect(lureDialog).toBeVisible();
  await page.locator("#lureName").fill("Inline Catch Lure");

  await page.locator("#lureForm").evaluate((form) => {
    const submitter = form.querySelector('button[type="submit"]');
    const submit = () => form.dispatchEvent(new SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
      submitter
    }));
    submit();
    submit();
  });

  await expect(lureDialog).toBeHidden();
  const saved = await readLogbook(page);
  expect(saved.lures.filter((lure) => lure.name === "Inline Catch Lure")).toHaveLength(1);
  await expect(catchRow.locator(".catch-lure")).toHaveValue(saved.lures[0].id);

  await page.goto("/gear");
  await expect(page.locator("#baitInventoryTable tbody tr")).toHaveCount(1);
});
