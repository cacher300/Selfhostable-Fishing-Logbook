const { expect, test } = require("@playwright/test");
const os = require("node:os");
const path = require("node:path");

for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
  test(`target-temperature and wind controls work at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/v1/manifest", route => route.fulfill({ json: { version: "test", generatedAt: "2026-10-10T16:00:00Z", layers: [] } }));
    const targetRequests = [];
    const targetRaster = { imageUrl: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#22d088"/></svg>'), bounds: [[43, -79], [44, -78]] };
    await page.route("**/api/v1/layers/target-temperature?**", route => {
      targetRequests.push(new URL(route.request().url()));
      return route.fulfill({ json: { rasters: [targetRaster], metadata: { targetC: 10, minDepthMeters: 5, maxDepthMeters: 15, minSurfaceTemperatureC: 0, maxSurfaceTemperatureC: 20, models: [{ model: "LOOFS", available: true, matchingCells: 4 }] } } });
    });
    const windPoints = [43, 43.25].flatMap(latitude => [-78, -77.75].map(longitude => ({ latitude, longitude, u: 5, v: 2, speedMetersPerSecond: 5.4, gustMetersPerSecond: 8, directionDegrees: 248, travelDegrees: 68 })));
    await page.route("**/api/v1/layers/wind?**", route => route.fulfill({ json: { points: windPoints, metadata: { available: true, validTime: "2026-10-10T16:00:00Z" } } }));
    await page.route("**/api/v1/animation/wind", route => route.fulfill({ json: { ready: true, layer: "wind", scale: { min: 0, max: 1 }, frames: [0, 3].map(hour => ({ forecastHour: hour, validTime: `2026-10-10T${hour === 0 ? "16" : "19"}:00:00Z`, url: `/api/v1/layers/wind?forecastHour=${hour}&animation=1` })) } }));
    await page.goto("/map");
    await expect(page).toHaveTitle("Fishing Logbook");
    await page.locator(".map-layers-menu > summary").click();
    await page.locator("[data-gl-layer]").selectOption("target-temperature");
    await expect(page.locator(".gl-target-controls")).toBeVisible();
    await expect(page.locator(".great-lakes-timeline")).toBeHidden();
    await expect(page.locator("[data-gl-status]")).toContainText("matching depths");
    await expect.poll(() => page.locator(".leaflet-overlay-pane .leaflet-image-layer").evaluateAll((images, url) => images.filter(image => image.getAttribute("src") === url).length, targetRaster.imageUrl)).toBe(1);
    await page.locator("[data-gl-target-temperature]").fill("50");
    await page.locator("[data-gl-target-temperature]").dispatchEvent("change");
    await page.locator("[data-gl-target-selection]").selectOption("deepest");
    await expect.poll(() => targetRequests.at(-1)?.searchParams.get("selection")).toBe("deepest");
    const unit = await page.locator("[data-gl-target-unit]").textContent();
    expect(Number(targetRequests.at(-1).searchParams.get("targetC"))).toBeCloseTo(unit === "°F" ? 10 : 50);
    await expect(page.locator('[data-gl-forecast] option[value="history"]')).toHaveJSProperty("disabled", true);
    await page.screenshot({ path: path.join(os.tmpdir(), `fish-target-${viewport.width}.png`) });
    await page.locator("[data-gl-layer]").selectOption("wind");
    await expect(page.locator(".great-lakes-wind-options")).toBeVisible();
    await expect(page.locator("[data-gl-status]")).toContainText("wind at 10 m");
    await page.locator("[data-gl-wind-color]").selectOption("#ec4899");
    expect(await page.evaluate(() => localStorage.getItem("glc.WindParticleColor"))).toBe("#ec4899");
    await page.locator("[data-gl-play]").click();
    await expect(page.locator("[data-gl-frame]")).toBeEnabled();
    await page.locator("[data-gl-animation-stop]").click();
    await expect(page.locator("[data-gl-status]")).toContainText("wind at 10 m");
    await page.screenshot({ path: path.join(os.tmpdir(), `fish-wind-${viewport.width}.png`) });
    expect(errors).toEqual([]);
  });
}
