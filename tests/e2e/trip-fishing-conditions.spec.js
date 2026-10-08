const { expect, test } = require("@playwright/test");
const { freshLogbook, resetLogbook, seededLocation } = require("./helpers");

test("Great Lakes trolling and jigging trips show saved thermocline and catch current", async ({ page }) => {
  await resetLogbook(page, await freshLogbook(page, { locations: [seededLocation()] }));
  const conditionRequests = [];
  await page.route("**/api/great-lakes/history/point/fishing-conditions**", async (route) => {
    conditionRequests.push(new URL(route.request().url()));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        available: true,
        time: "2026-10-05T11:00:00Z",
        temperatureProfile: {
          available: true,
          historyTime: "2026-10-05T11:00:00Z",
          thermocline: { topDepthMeters: 12 }
        },
        currentProfile: {
          available: true,
          historyTime: "2026-10-05T11:00:00Z",
          values: [{ depthMeters: 0, speedMetersPerSecond: 0.4, directionDegrees: 315 }]
        }
      })
    });
  });

  await page.goto("/trips", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New Trip", exact: true }).click();
  await page.locator("#tripLocation").selectOption("loc-lake-erie");
  await page.locator("#targetSpecies").selectOption({ label: "Walleye" });
  await page.locator("#method").selectOption({ label: "Trolling" });

  const dialog = page.locator("#tripDialog");
  const thermocline = dialog.locator("#tripThermoclineDepth");
  await expect(thermocline).toBeVisible();
  await expect(thermocline).toHaveValue("39.4 ft");
  await page.getByRole("button", { name: "Add Catch", exact: true }).click();

  const catchRow = dialog.locator(".catch-row").first();
  await expect(catchRow.locator(".catch-current-speed")).toBeVisible();
  await expect(catchRow.locator(".catch-current-speed")).toHaveValue("0.9 mph");
  await expect(catchRow.locator(".catch-current-direction")).toHaveValue("Toward NW (315°)");
  await expect(catchRow.locator(".catch-direction")).toBeVisible();
  expect(conditionRequests.length).toBeGreaterThan(0);
  expect(Number(conditionRequests.at(-1).searchParams.get("latitude"))).toBe(41.651);
  expect(Number(conditionRequests.at(-1).searchParams.get("longitude"))).toBe(-82.822);

  await page.locator("#method").selectOption({ label: "Jigging" });
  await expect(catchRow.locator(".catch-current-speed")).toBeVisible();
  await expect(catchRow.locator(".catch-current-direction")).toHaveValue("Toward NW (315°)");
  await expect(catchRow.locator(".catch-direction")).toBeHidden();
  await expect(thermocline).toBeVisible();
});
