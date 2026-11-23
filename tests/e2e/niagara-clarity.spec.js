const { expect, test } = require("@playwright/test");
const { fillDate, freshLogbook, readLogbook, resetLogbook, stubExternalApis } = require("./helpers");

test("Niagara clarity and temperature autofill together and preserve manual values", async ({ page }) => {
  const document = await freshLogbook(page, { locations: [
    { id: "niagara", name: "Niagara River", launches: [{ id: "queenston", name: "Queenston" }] },
    { id: "erie", name: "Lake Erie", launches: [] }
  ] });
  document.settings.units.waterTemperature = "F";
  await resetLogbook(page, document);
  await stubExternalApis(page);
  let requests = 0;
  await page.route("**/api/v1/clarity/niagara?*", route => {
    requests++;
    expect(new URL(route.request().url()).searchParams.get("time")).toBeTruthy();
    return route.fulfill({ json: { available: true, reading: { category: "Green" }, waterTemperatureReading: { temperatureC: 10 } } });
  });
  await page.goto("/trips");
  await page.getByRole("button", { name: "New Trip", exact: true }).click();
  await fillDate(page, "#tripDate", "11/13/2026");
  await page.locator("#tripLocation").selectOption("niagara");
  await expect(page.locator("#waterClarity")).toHaveValue("Green");
  await expect(page.locator("#waterTemp")).toHaveValue("50");
  await page.locator("#tripLaunch").selectOption("queenston");
  await expect(page.locator("#waterTemp")).toHaveValue("50");
  expect(requests).toBe(1);
  await page.locator("#tripLocation").selectOption("erie");
  await expect(page.locator("#waterClarity")).toHaveValue("");
  await expect(page.locator("#waterTemp")).toHaveValue("");
  await page.locator("#tripLocation").selectOption("niagara");
  await expect(page.locator("#waterClarity")).toHaveValue("Green");
  await expect(page.locator("#waterTemp")).toHaveValue("50");
  await page.locator("#waterClarity").selectOption("Muddy");
  await page.locator("#waterTemp").fill("62.5");
  await page.locator("#tripLocation").selectOption("erie");
  await page.locator("#tripLocation").selectOption("niagara");
  await expect(page.locator("#waterClarity")).toHaveValue("Muddy");
  await expect(page.locator("#waterTemp")).toHaveValue("62.5");
  expect(requests).toBe(2);
});

test("Niagara temperature can be saved in Celsius without an available clarity reading", async ({ page }) => {
  const document = await freshLogbook(page, { locations: [{ id: "niagara", name: "Lower Niagara River", launches: [] }] });
  document.settings.units.waterTemperature = "C";
  await resetLogbook(page, document);
  await stubExternalApis(page);
  await page.route("**/api/v1/clarity/niagara?*", route => route.fulfill({
    json: { available: false, reading: null, waterTemperatureReading: { temperatureC: 0 } }
  }));
  await page.goto("/trips");
  await page.getByRole("button", { name: "New Trip", exact: true }).click();
  await fillDate(page, "#tripDate", "11/13/2026");
  await page.locator("#tripLocation").selectOption("niagara");
  await expect(page.locator("#waterTemp")).toHaveValue("0");
  await expect(page.locator("#waterClarity")).toHaveValue("");
  await page.locator("#method").selectOption("Drifting");
  await page.locator("#targetSpecies").selectOption("Rainbow Trout");
  page.on("dialog", dialog => dialog.accept());
  await page.locator("#tripDialog [data-trip-save]").first().click();
  await expect(page.locator("#tripDialog")).toBeHidden();
  expect((await readLogbook(page)).trips[0]).toMatchObject({ waterTemp: "0", waterClarity: "" });
});
