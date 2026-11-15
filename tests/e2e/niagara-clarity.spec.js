const { expect, test } = require("@playwright/test");
const { fillDate, freshLogbook, resetLogbook, stubExternalApis } = require("./helpers");

test("Niagara clarity autofills, preserves manual selection, and clears on waterbody change", async ({ page }) => {
  const document = await freshLogbook(page, { locations: [
    { id: "niagara", name: "Niagara River", launches: [] },
    { id: "erie", name: "Lake Erie", launches: [] }
  ] });
  await resetLogbook(page, document);
  await stubExternalApis(page);
  let requests = 0;
  await page.route("**/api/v1/clarity/niagara?*", route => {
    requests++;
    expect(new URL(route.request().url()).searchParams.get("time")).toBeTruthy();
    return route.fulfill({ json: { available: true, reading: { category: "Green" } } });
  });
  await page.goto("/trips");
  await page.getByRole("button", { name: "New Trip", exact: true }).click();
  await fillDate(page, "#tripDate", "11/13/2026");
  await page.locator("#tripLocation").selectOption("niagara");
  await expect(page.locator("#waterClarity")).toHaveValue("Green");
  await page.locator("#tripLocation").selectOption("erie");
  await expect(page.locator("#waterClarity")).toHaveValue("");
  await page.locator("#tripLocation").selectOption("niagara");
  await expect(page.locator("#waterClarity")).toHaveValue("Green");
  await page.locator("#waterClarity").selectOption("Muddy");
  await page.locator("#tripLocation").selectOption("erie");
  await page.locator("#tripLocation").selectOption("niagara");
  await expect(page.locator("#waterClarity")).toHaveValue("Muddy");
  expect(requests).toBeGreaterThanOrEqual(2);
});
