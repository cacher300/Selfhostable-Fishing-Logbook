const { expect, test } = require("@playwright/test");
const path = require("node:path");
const os = require("node:os");
const { fillDate, freshLogbook, readLogbook, resetLogbook, seededLocation, stubExternalApis } = require("./helpers");

for (const [value, label, method] of [
  ["pre-front", "Pre-front", "Casting"],
  ["during-front", "During front", "Trolling"],
  ["post-front", "Post-front", "Casting"],
  ["no-front", "No front", "Trolling"]
]) {
  test(`${label} saves, reopens, and filters on ${method} trips`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => dialog.accept());
    await resetLogbook(page, await freshLogbook(page, { locations: [seededLocation()] }));
    await stubExternalApis(page);
    await page.goto("/trips");
    await expect(page).toHaveTitle(/Fishing Logbook/);
    await page.getByRole("button", { name: "New Trip", exact: true }).click();
    await expect(page.locator("#tripDialog").getByRole("combobox", { name: "Weather front", exact: true })).toBeVisible();
    await expect(page.locator("#weatherFront")).toHaveValue("automatic");
    await page.locator("#tripTitle").fill(`${label} test`);
    await fillDate(page, "#tripDate", "11/01/2026");
    await page.locator("#tripLocation").selectOption("loc-lake-erie");
    await page.locator("#targetSpecies").selectOption({ label: "Walleye" });
    await page.locator("#method").selectOption({ label: method });
    await page.locator("#weatherFront").selectOption(value);
    await page.locator("#tripDialog [data-trip-save]").first().click();
    await expect(page.locator("#tripDialog")).toBeHidden();
    const saved = (await readLogbook(page)).trips[0];
    expect(saved.weatherFront).toBe(value);
    await page.reload();
    await page.locator("#weatherFrontFilter").selectOption(value);
    await expect(page.locator(".table-row[data-view-trip]")).toHaveCount(1);
    await page.locator("#weatherFrontFilter").selectOption("unclassified");
    await expect(page.locator(".table-row[data-view-trip]")).toHaveCount(0);
    await page.locator("#weatherFrontFilter").selectOption(value);
    await page.locator(`.table-row[data-view-trip="${saved.id}"]`).click();
    await expect(page.locator("#tripSummaryBody")).toContainText(label);
    await page.getByRole("button", { name: "Edit Trip", exact: true }).click();
    await expect(page.locator("#weatherFront")).toHaveValue(value);
    await page.locator("#resyncWeatherButton").click();
    await expect(page.locator("#weatherFront")).toHaveValue(value);
    if (value === "pre-front") {
      await page.screenshot({ path: path.join(os.tmpdir(), "fishing-weather-front-desktop.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator("#weatherFront").scrollIntoViewIfNeeded();
      await expect(page.locator("#weatherFront")).toBeVisible();
      const box = await page.locator("#weatherFront").boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      await page.screenshot({ path: path.join(os.tmpdir(), "fishing-weather-front-mobile.png") });
    }
    expect(errors).toEqual([]);
  });
}

test("older trips can be classified and cleared while retaining unknown fields", async ({ page }) => {
  page.on("dialog", dialog => dialog.accept());
  const trip = { id: "older", title: "Older trip", date: "2026-11-01", locationId: "loc-lake-erie", location: "Lake Erie", method: "Casting", targetSpecies: "Walleye", people: [], gearUsed: [], catches: [], lostFish: [], custom: { preserve: true }, weatherData: { frontTag: "Stable" } };
  await resetLogbook(page, await freshLogbook(page, { locations: [seededLocation()], trips: [trip] }));
  await stubExternalApis(page);
  await page.goto("/trips");
  for (const front of ["during-front", ""]) {
    await page.locator('.table-row[data-view-trip="older"]').click();
    await page.getByRole("button", { name: "Edit Trip", exact: true }).click();
    await page.locator("#weatherFront").selectOption(front);
    await page.locator("#tripDialog [data-trip-save]").first().click();
    await expect(page.locator("#tripDialog")).toBeHidden();
    const saved = (await readLogbook(page)).trips[0];
    expect(saved.weatherFront).toBe(front);
    expect(saved.custom).toEqual(trip.custom);
    expect(saved.weatherData.frontTag).toBe("Stable");
  }
});

test("front stats count skunk trips and keep unclassified separate from no front", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const fronts = ["pre-front", "pre-front", "during-front", "post-front", "no-front", undefined];
  const trips = fronts.map((front, index) => ({
    id: `front-${index}`, title: `Front ${index}`, date: "2026-11-01", method: "Casting", targetSpecies: "Walleye", location: "Lake Erie", locationId: "loc-lake-erie", hours: 2, launchTime: "06:00", linesPulledTime: "08:00", people: [], gearUsed: [],
    ...(front ? { weatherFront: front, weatherFrontSource: "automatic" } : {}),
    catches: index === 0 ? [{ id: "landed", species: "Walleye", quantity: 3 }] : [],
    lostFish: [{ id: `lost-${index}`, possibleSpecies: "Walleye" }],
    weatherData: { frontTag: "Stable" }
  }));
  await resetLogbook(page, await freshLogbook(page, { locations: [seededLocation()], trips }));
  await stubExternalApis(page);
  await page.goto("/stats");
  await page.getByRole("button",{name:"Conditions",exact:true}).click();
  await page.locator("#statsCompareBySelect").selectOption("weatherFront");
  await page.locator("#statsCompareMetricSelect").selectOption("skunk");
  await page.getByRole("button",{name:"Table",exact:true}).click();
  const table = page.locator("#comparisonBuilderTable table");
  await expect(table.locator("tbody tr")).toHaveCount(5);
  const pre = table.locator("tbody tr").filter({hasText:"Pre-front"});
  await expect(pre.locator("td").first()).toHaveText("50%");
  await expect(pre.locator("td").nth(1)).toHaveText("0.75");
  for (const label of ["During front", "Post-front", "No front", "Unclassified"]) {
    await expect(table.locator("tbody tr").filter({ hasText: label }).locator("td").first()).toHaveText("100%");
  }
  await page.locator("#statsCompareBySelect").selectOption("frontTag");
  await expect(page.locator("#comparisonBuilderTable")).toContainText("Stable");
  expect(errors).toEqual([]);
});

test("Open-Meteo estimates automatically, allows overrides, and can resume automatic mode", async ({ page }) => {
  page.on("dialog", dialog => dialog.accept());
  await resetLogbook(page, await freshLogbook(page, { locations: [seededLocation()] }));
  await stubExternalApis(page);
  const hourly = { time: [], temperature_2m: [], pressure_msl: [], surface_pressure: [], wind_direction_10m: [], wind_speed_10m: [] };
  for (let i = 0; i < 72; i++) {
    hourly.time.push(new Date(Date.UTC(2026, 9, 31, i)).toISOString().slice(0, 16));
    hourly.temperature_2m.push(i >= 36 ? 10 : 18);
    const pressure = i === 36 ? 1013 : i > 36 ? 1019 : 1016;
    hourly.pressure_msl.push(pressure);
    hourly.surface_pressure.push(pressure);
    hourly.wind_direction_10m.push(i >= 36 ? 300 : 200);
    hourly.wind_speed_10m.push(15);
  }
  const requests = [];
  await page.route("**/api/weather/**", route => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ hourly, hourly_units: { wind_speed_10m: "mph" }, timezone: "America/Toronto" }) });
  });
  await page.goto("/trips");
  await page.getByRole("button", { name: "New Trip", exact: true }).click();
  await page.locator("#tripTitle").fill("Automatic front");
  await fillDate(page, "#tripDate", "11/01/2026");
  await page.locator("#tripLocation").selectOption("loc-lake-erie");
  await page.locator("#targetSpecies").selectOption({ label: "Walleye" });
  await page.locator("#method").selectOption({ label: "Casting" });
  await page.locator("#launchTime").fill("04:00");
  await page.locator("#linesPulledTime").fill("06:00");
  await page.locator("#linesPulledTime").blur();
  await expect(page.locator("#weatherFrontHint")).toContainText("Estimated: Pre-front");
  expect(requests.some(url => url.searchParams.get("start_date") === "2026-10-31" && url.searchParams.get("end_date") === "2026-11-02")).toBe(true);
  await page.locator("#weatherFront").selectOption("no-front");
  await page.locator("#resyncWeatherButton").click();
  await expect(page.locator("#weatherFrontHint")).toContainText("Manual classification");
  await page.locator("#tripDialog [data-trip-save]").first().click();
  await expect(page.locator("#tripDialog")).toBeHidden();
  let trip = (await readLogbook(page)).trips[0];
  expect(trip.weatherFront).toBe("no-front");
  expect(trip.weatherFrontSource).toBe("manual");
  expect(trip.weatherData.frontAssessment.value).toBe("pre-front");
  await page.locator(`.table-row[data-view-trip="${trip.id}"]`).click();
  await page.getByRole("button", { name: "Edit Trip", exact: true }).click();
  await page.locator("#weatherFront").selectOption("automatic");
  await expect(page.locator("#weatherFrontHint")).toContainText("Estimated: Pre-front");
  await page.locator("#tripDialog [data-trip-save]").first().click();
  await expect(page.locator("#tripDialog")).toBeHidden();
  trip = (await readLogbook(page)).trips[0];
  expect(trip.weatherFront).toBe("pre-front");
  expect(trip.weatherFrontSource).toBe("automatic");
});
