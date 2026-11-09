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
  const checkboxLeftEdges = await page
    .locator(".map-layers-menu-panel :is(.map-chart-toggle, .great-lakes-points-options) input[type=checkbox]")
    .evaluateAll((checkboxes) => checkboxes.map((checkbox) => checkbox.getBoundingClientRect().left));
  expect(checkboxLeftEdges).toHaveLength(6);
  expect(new Set(checkboxLeftEdges).size).toBe(1);
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

test("depth shading version 2 switches styles and uses versioned Great Lakes tiles", async ({ page }) => {
  await stubExternalApis(page);
  const manifestPath = "**/api/v1/bathymetry/tiles/manifest";
  const tilePath = "**/api/v1/bathymetry/tiles/test-revision/v2/**/*.png";
  const manifest = Promise.withResolvers();
  await page.route(manifestPath, async (route) => {
    await manifest.promise;
    await route.fulfill({ json: {
      bounds: [[40.9, -92.3], [49.6, -76]],
      tileUrl: "/api/v1/bathymetry/tiles/test-revision/{style}/{z}/{x}/{y}.png"
    } });
  });
  await page.route(tilePath, (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=", "base64")
  }));
  await page.goto("/map");
  const layersMenu = page.locator(".map-layers-menu > summary");
  await layersMenu.click();
  const original = page.getByRole("checkbox", { name: "Show depth shading", exact: true });
  const v2 = page.getByRole("checkbox", { name: "Depth shading version 2" });
  const originalImages = page.locator(".noaa-bathymetry-overlay");
  const v2Images = page.locator('.leaflet-bathymetry-pane .leaflet-tile-loaded[src*="/test-revision/v2/"]');
  await original.check();
  await expect(originalImages.first()).toBeAttached();
  const manifestRequest = page.waitForRequest((request) => request.url().endsWith("/api/v1/bathymetry/tiles/manifest"));
  try {
    await v2.check();
    await manifestRequest;
    await expect(original).not.toBeChecked();
    await expect(originalImages).toHaveCount(0);
    await original.check();
  } finally {
    manifest.resolve();
  }
  await expect(v2).not.toBeChecked();
  await expect(originalImages.first()).toBeAttached();
  await expect(v2Images).toHaveCount(0);

  await v2.check();
  await expect(v2Images.first()).toBeAttached();
  await expect(originalImages).toHaveCount(0);
  await page.getByRole("combobox", { name: "Units", exact: true }).selectOption("metric");
  await expect(page.getByRole("img", { name: "Depth scale from 0 m to 400 m" })).toBeVisible();
  await page.reload();
  await layersMenu.click();
  await expect(v2).toBeChecked();
  await expect(v2Images.first()).toBeAttached();
  await v2.uncheck();
  await expect(v2Images).toHaveCount(0);
});
