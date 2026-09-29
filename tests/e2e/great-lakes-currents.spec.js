const { expect, test } = require("@playwright/test");
const os = require("node:os");
const path = require("node:path");

test("map depth popup opens the current profile on request", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/bathymetry/depth?**", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ depth_ft: 306 })
  }));
  await page.route("**/api/great-lakes/currents?**", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      data: [], fields: [],
      metadata: { models: [{ model: "LOOFS", available: true, validTime: "2026-09-28T12:00:00Z" }] }
    })
  }));
  await page.route("**/api/great-lakes/current-profile?**", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      available: true, model: "LOOFS", validTime: "2026-09-28T12:00:00Z",
      sampleDistanceKm: 2.3, depthApproximate: true,
      values: [
        { depthMeters: 0, speedMetersPerSecond: 0.1, directionDegrees: 0 },
        { depthMeters: 5, speedMetersPerSecond: 0.28, directionDegrees: 45 },
        { depthMeters: 10, speedMetersPerSecond: 0.4, directionDegrees: 90 }
      ]
    })
  }));

  await page.goto("/map");
  await expect(page).toHaveTitle("Fishing Logbook");
  await page.locator(".map-layers-menu > summary").click();
  await page.locator("[data-gl-lake]").selectOption("Ontario");
  await page.locator("[data-gl-layer]").selectOption("currents");
  await expect(page.locator("[data-gl-status]")).toContainText("Showing NOAA model forecast");
  await page.locator(".map-layers-menu > summary").click();
  await page.locator("#fishMap").click({ position: { x: 220, y: 210 } });

  const dialog = page.locator(".great-lakes-current-dialog");
  const popup = page.locator(".map-depth-popup");
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("FOW");
  await expect(popup.locator("small")).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  await page.screenshot({ path: path.join(os.tmpdir(), "fishing-current-depth-popup.png") });
  await popup.getByRole("button", { name: "View current profile" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Underwater current by depth" })).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(3);
  await expect(dialog).toContainText("Toward N · 0°");
  await expect(dialog).toContainText("Toward NE · 45°");
  await expect(dialog).toContainText("Toward E · 90°");
  await expect(dialog).not.toContainText("Each bar shows current speed");
  await expect(dialog).not.toContainText("Depths are approximate");
  await expect(dialog.locator(".map-current-compass")).toHaveCount(0);
  await page.screenshot({ path: path.join(os.tmpdir(), "fishing-current-depth-desktop.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: path.join(os.tmpdir(), "fishing-current-depth-mobile.png") });
  await dialog.getByRole("button", { name: "Close current profile" }).click();
  await expect(dialog).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
