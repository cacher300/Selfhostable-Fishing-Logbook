const { test, expect } = require("@playwright/test");
const { stubExternalApis } = require("./helpers");

test("depth contours select zoom detail and remove their canvases when hidden", async ({ page }) => {
  const errors = [], details = [];
  page.on("pageerror", error => errors.push(error.message));
  await stubExternalApis(page);
  await page.route("**/api/bathymetry/contours/**", route => {
    details.push(new URL(route.request().url()).searchParams.get("detail"));
    return route.fulfill({ contentType: "application/geo+json", body: JSON.stringify({
      type: "FeatureCollection", features: [{ type: "Feature", properties: { DEPTH: 20 },
        geometry: { type: "LineString", coordinates: [[-78, 43.5], [-77.9, 43.5]] } }]
    }) });
  });
  await page.goto("/map");
  await expect(page).toHaveTitle("Fishing Logbook");
  await page.locator(".map-layers-menu > summary").click();
  const toggle = page.locator("#mapDepthContoursToggle");
  await toggle.check();
  const canvases = page.locator(".leaflet-depthContours-pane canvas");
  await expect.poll(() => canvases.count()).toBeGreaterThan(0);
  await expect(page.locator("#mapDepthContoursStatus")).toHaveText("");
  const count = await canvases.count();
  expect(details.every(detail => ["6", "9", "12", "full"].includes(detail))).toBe(true);
  await toggle.uncheck();
  await expect(canvases).toHaveCount(0);
  await toggle.check();
  await expect(canvases).toHaveCount(count);
  expect(errors).toEqual([]);
});
