const { expect, test } = require("@playwright/test");
const { freshLogbook, resetLogbook, stubExternalApis } = require("./helpers");

test("stats count released and shaker quantities and display metric speed", async ({ page }, testInfo) => {
  await stubExternalApis(page);
  const document = await freshLogbook(page);
  const original = structuredClone(document);
  document.settings.units.speed = "kph";
  document.trips = [{
    id: "quantity-trip", title: "Quantity regression", date: "2026-10-05", method: "Trolling", location: "Audit lake",
    launchTime: "06:00", linesPulledTime: "08:00", hours: 2, people: [], gearUsed: [], lostFish: [],
    catches: [{ id: "released", species: "Walleye", quantity: 5, released: true, shaker: true, gpsSpeed: "4.8", direction: "North" },
      { id: "kept", species: "Walleye", quantity: 1, released: false, shaker: false }]
  }];
  await resetLogbook(page, document);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/stats");
    await expect(page).toHaveTitle("Fishing Logbook");
    await expect(page.locator("#advancedMetricGrid")).toContainText("5 released · 1 kept");
    await page.getByRole("button",{name:"At the bite",exact:true}).click();
    const result = page.locator("#comparisonBuilderTable");
    await page.locator("#statsCompareBySelect").selectOption("shaker");
    await expect(result).toContainText("83.33%");
    await page.locator("#statsCompareBySelect").selectOption("directionSpeed");
    await expect(result).toContainText("4.8 kph");
    await page.locator("#statsCompareBySelect").selectOption("gpsSpeed");
    await expect(result).toContainText("kph");
    await expect(result).not.toContainText("mph");
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("stats-quantity-units.png") });
  } finally {
    await resetLogbook(page, original);
  }
});
