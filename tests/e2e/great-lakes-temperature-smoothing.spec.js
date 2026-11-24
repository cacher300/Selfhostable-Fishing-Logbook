const { expect, test } = require("@playwright/test");
const os = require("node:os");
const path = require("node:path");

test("Great Lakes water temperature uses the smoothed value raster", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const valueUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 48;
    const context = canvas.getContext("2d");
    const pixels = context.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const value = Math.round(96 + x / 20);
        pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = value;
        pixels.data[offset + 3] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  });

  await page.route("**/api/v1/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let payload = { rasters: [], data: [], fields: [], metadata: { models: [] } };
    if (pathname.endsWith("/status")) payload = { version: "smooth-qa", wavesVersion: "smooth-qa", airTemperatureVersion: "smooth-qa" };
    else if (pathname.endsWith("/manifest")) payload = { version: "smooth-qa", generatedAt: "2026-11-24T12:00:00Z", layers: [] };
    else if (pathname.endsWith("/layers/temperature")) payload = {
      rasters: [{ imageUrl: valueUrl, valueUrl, valueRange: [0, 255], bounds: [[43.2, -79.8], [44.3, -76.4]] }],
      metadata: { minC: 0, maxC: 30, forecastHour: 0, validTime: "2026-11-24T12:00:00Z", models: [{ model: "LOOFS", available: true }] }
    };
    await route.fulfill({ json: payload });
  });

  await page.goto("/map");
  await expect(page).toHaveTitle("Fishing Logbook");
  await expect(page.locator("#mapPanel .leaflet-container")).toBeVisible();
  await page.locator(".map-layers-menu > summary").click();
  await page.locator("[data-gl-layer]").selectOption("temperature");
  const raster = page.locator("canvas.great-lakes-temperature-raster");
  await expect(raster).toHaveCount(1);
  const rendered = await raster.evaluate((canvas) => {
    const filterId = canvas.style.filter.match(/#([^)]*)/)?.[1]?.replace(/["']/g, "");
    const filter = filterId ? document.getElementById(filterId) : null;
    return {
      width: canvas.width,
      height: canvas.height,
      hasPaletteBlur: Boolean(filter?.querySelector("feGaussianBlur")),
      hasShorelineClip: Boolean(filter?.querySelector('feComposite[operator="in"]'))
    };
  });
  expect(rendered).toEqual({ width: 120, height: 24, hasPaletteBlur: true, hasShorelineClip: true });
  await page.locator(".map-layers-menu > summary").click();
  await page.screenshot({ path: path.join(os.tmpdir(), "desktop-great-lakes-temperature-smoothing.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#mapPanel .leaflet-container")).toBeVisible();
  await expect(raster).toBeVisible();
  await page.screenshot({ path: path.join(os.tmpdir(), "mobile-great-lakes-temperature-smoothing.png") });
  expect(errors).toEqual([]);
});
