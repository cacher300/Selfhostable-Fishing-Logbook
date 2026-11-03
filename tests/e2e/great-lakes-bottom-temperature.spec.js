const { expect, test } = require("@playwright/test");

for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
  test(`bottom temperatures retain forecast animation without depth or history at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const layerRequests = [];
    const raster = {
      imageUrl: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#22d088"/></svg>'),
      bounds: [[43, -79], [44, -78]]
    };
    const metadata = { minC: 0, maxC: 30, depthSelection: "bottom", models: [{ model: "LOOFS", available: true }] };
    await page.route("**/api/v1/**", async route => {
      const url = new URL(route.request().url());
      let payload = { rasters: [], metadata: { models: [] } };
      if (url.pathname.endsWith("/manifest")) payload = { version: "bottom-test", layers: [] };
      else if (url.pathname.endsWith("/layers/bottom-temperature")) {
        layerRequests.push(url);
        payload = { rasters: [raster], metadata };
      } else if (url.pathname.endsWith("/animation/bottom-temperature")) payload = {
        ready: true, frames: [0, 6].map(hour => ({
          forecastHour: hour, validTime: new Date(Date.now() + hour * 3600000).toISOString(),
          url: `/api/v1/bottom-test-frame?hour=${hour}&frame=bottom-${hour}&inputs=bottom-inputs`
        }))
      };
      else if (url.pathname.endsWith("/bottom-test-frame")) payload = { rasters: [raster], metadata };
      else if (url.pathname.endsWith("/stations")) payload = { stations: [] };
      else if (url.pathname.endsWith("/history")) payload = { hours: [] };
      await route.fulfill({ json: payload });
    });
    await page.goto("/map");
    await expect(page).toHaveTitle("Fishing Logbook");
    await page.locator(".map-layers-menu > summary").click();
    await page.locator("[data-gl-layer]").selectOption("bottom-temperature");
    await expect(page.locator("img.great-lakes-temperature-raster")).toHaveCount(1);
    await expect(page.locator(".great-lakes-depth-control")).toBeHidden();
    await expect(page.locator(".great-lakes-legend")).toBeVisible();
    await expect(page.locator(".great-lakes-timeline")).toBeVisible();
    await expect(page.locator('[data-gl-forecast] option[value="history"]')).toHaveJSProperty("disabled", true);
    await page.locator("[data-gl-forecast]").selectOption("6", { force: true });
    await expect.poll(() => layerRequests.at(-1)?.searchParams.get("forecastHour")).toBe("6");
    expect(layerRequests.every(url => !url.searchParams.has("depth"))).toBe(true);
    await page.locator("[data-gl-play]").click();
    await expect(page.locator("img.great-lakes-animation-frame")).toHaveCount(2);
    await expect(page.locator("[data-gl-frame]")).toBeEnabled();
    await page.locator("[data-gl-play]").click();
    await page.locator("[data-gl-animation-stop]").click();
    await expect(page.locator("img.great-lakes-temperature-raster")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
