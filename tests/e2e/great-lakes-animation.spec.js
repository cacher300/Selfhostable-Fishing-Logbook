const { expect, test } = require("@playwright/test");
const os = require("node:os");
const path = require("node:path");

test("currents animate temperature backgrounds and temporarily hide stations", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const frames = [0, 3].map((forecastHour) => ({
    forecastHour, validTime: `2026-10-05T${forecastHour === 0 ? "12" : "15"}:00:00Z`
  }));
  await page.route("**/api/great-lakes/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    let payload = { rasters: [], data: [], fields: [], metadata: { models: [] } };
    if (pathname.endsWith("/status")) payload = { version: "animation-qa", models: {} };
    else if (pathname.endsWith("/observations")) payload = { stations: [{
      id: "qa-buoy", name: "Test buoy", type: "Buoy", latitude: 43.7, longitude: -77.9,
      waterTemperature: { temperatureC: 17, observedAt: "2026-10-05T12:00:00Z" }
    }] };
    else if (pathname.includes("/animation/")) {
      const layer = pathname.split("/").at(-1);
      const ordered = layer === "temperature" ? [...frames].reverse() : frames;
      payload = { ready: true, frames: ordered.map((frame) => ({
        ...frame, url: `/api/great-lakes/qa-frame?layer=${layer}&hour=${frame.forecastHour}`
      })) };
    } else if (pathname.endsWith("/qa-frame")) {
      const hour = Number(url.searchParams.get("hour"));
      payload = { ...payload, metadata: { minC: 10, maxC: 20, models: [], forecastHour: hour } };
      if (url.searchParams.get("layer") === "temperature") payload.rasters = [{
        imageUrl: `/api/great-lakes/qa-image-${hour}`, bounds: [[43.2, -79.8], [44.3, -76.4]]
      }];
    } else if (pathname.includes("/qa-image-")) {
      await route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${pathname.endsWith("-0") ? "#28c888" : "#2488ee"}"/></svg>` });
      return;
    }
    await route.fulfill({ json: payload });
  });

  await page.goto("/map");
  await expect(page).toHaveTitle("Fishing Logbook");
  await page.locator(".map-layers-menu > summary").click();
  await page.locator("[data-gl-layer]").selectOption("currents");
  await page.locator("[data-gl-current-background]").selectOption("temperature");
  await page.locator("[data-gl-stations]").check();
  await expect(page.locator(".great-lakes-station-marker")).toHaveCount(1);
  await page.locator("[data-gl-play]").click();
  await expect(page.locator(".great-lakes-station-marker")).toHaveCount(0);
  const slider = page.locator("[data-gl-frame]");
  await expect(slider).toBeEnabled();
  await page.locator("[data-gl-play]").click();
  const scrub = async (value) => {
    await slider.evaluate((element, index) => {
      element.value = String(index);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  };
  await scrub(0);
  const images = page.locator(".great-lakes-animation-frame");
  await expect(images).toHaveCount(2);
  await expect(images.nth(0)).toHaveAttribute("src", "/api/great-lakes/qa-image-0");
  await expect(images.nth(1)).toHaveAttribute("src", "/api/great-lakes/qa-image-3");
  await page.locator("[data-gl-play]").click();
  const isBlending = (image) => image.evaluate(element => {
    const opacity = Number(getComputedStyle(element).opacity);
    return opacity > 0.05 && opacity < 0.95;
  });
  // The next image must blend during the interval, rather than hold then
  // jump. The loop back to Now must start blending without another pause.
  await expect.poll(() => isBlending(images.nth(1))).toBe(true);
  await expect(slider).toHaveValue("1");
  await expect.poll(() => isBlending(images.nth(0))).toBe(true);
  await page.locator("[data-gl-play]").click();
  await scrub(1);
  await expect(images.nth(1)).toHaveCSS("opacity", "1");
  await expect(images.nth(0)).toHaveCSS("opacity", "0");
  await expect(page.locator(".great-lakes-station-marker")).toHaveCount(0);
  await page.screenshot({ path: path.join(os.tmpdir(), "desktop-current-temperature-animation.png") });
  await page.locator("[data-gl-play]").click();
  await expect(slider).toHaveAttribute("aria-valuetext", /^Now /);
  await page.locator("[data-gl-play]").click();
  await page.locator("[data-gl-animation-stop]").click();
  await expect(page.locator(".great-lakes-station-marker")).toHaveCount(1);
  await expect(page.locator("[data-gl-stations]")).toBeChecked();
  expect(errors).toEqual([]);
});

test("thermocline clears outgoing colours smoothly during playback and scrubbing", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("glc.AnimationSpeed", "slow"));
  await page.route("**/api/great-lakes/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.includes("/qa-thermocline-image-")) {
      const x = pathname.endsWith("-0") ? 20 : 100;
      await route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect x="${x}" width="80" height="100" fill="#28c888"/></svg>` });
      return;
    }
    let payload = { rasters: [], metadata: { models: [] } };
    if (pathname.endsWith("/status")) payload = { version: "thermocline-qa", models: {} };
    else if (pathname.includes("/animation/")) payload = {
      ready: true, frames: [0, 1].map(i => ({ forecastHour: i * 3, validTime: `2026-10-05T${i ? "15" : "12"}:00:00Z`, url: `/api/great-lakes/qa-thermocline-frame-${i}` }))
    };
    else if (pathname.includes("/qa-thermocline-frame-")) payload.rasters = [{
      imageUrl: `/api/great-lakes/qa-thermocline-image-${pathname.at(-1)}`, bounds: [[43.2, -79.8], [44.3, -76.4]]
    }];
    await route.fulfill({ json: payload });
  });
  await page.goto("/map");
  await expect(page).toHaveTitle("Fishing Logbook");
  await page.locator(".map-layers-menu > summary").click();
  await page.locator("[data-gl-layer]").selectOption("thermocline");
  await page.locator("[data-gl-play]").click();
  const images = page.locator(".great-lakes-animation-frame");
  await expect(images).toHaveCount(2);
  const blending = () => images.evaluateAll(xs => xs.every(x => +x.style.opacity > 0.2 && +x.style.opacity < 0.8));
  await expect.poll(blending).toBe(true);
  const opacities = await images.evaluateAll(xs => xs.map(x => +x.style.opacity));
  expect(Math.abs(opacities[0] + opacities[1] - 1)).toBeLessThan(0.05);
  await page.locator("[data-gl-play]").click();
  await page.locator("[data-gl-frame]").evaluate(x => { x.value = "1"; x.dispatchEvent(new Event("input", { bubbles: true })); });
  await expect.poll(blending).toBe(true);
  await expect(images.nth(0)).toHaveCSS("opacity", "0");
  await expect(images.nth(1)).toHaveCSS("opacity", "1");
  expect(errors).toEqual([]);
});
