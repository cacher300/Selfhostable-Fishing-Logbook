const { expect, test } = require("@playwright/test");
const { fillDate, freshLogbook, resetLogbook, stubExternalApis } = require("./helpers");

test("trip rod choices follow the fishing method and retain the selected combo", async ({ page }) => {
  const rods = [
    { id: "downrigger", name: "Downrigger", type: "Downrigging" },
    { id: "dipsey", name: "Diver", type: "Dipsey" },
    { id: "casting", name: "Baitcaster", type: "Baitcaster" },
    { id: "spinning", name: "Spinning", type: "Spinning" },
    { id: "untyped", name: "Untyped" }
  ];
  await resetLogbook(page, await freshLogbook(page, {
    locations: [{ id: "lake", name: "Test Lake", launches: [] }],
    rods,
    rodReelCombos: rods.map(rod => ({ id: `combo-${rod.id}`, shortName: `${rod.name} combo`, rodId: rod.id }))
  }));
  await stubExternalApis(page);
  await page.goto("/trips");
  await page.getByRole("button", { name: "New Trip", exact: true }).click();
  await fillDate(page, "#tripDate", "11/13/2026");
  await page.locator("#tripLocation").selectOption("lake");
  const method = page.locator("#method");
  await method.selectOption("Casting");
  await page.locator("#addTripGearButton").click();

  const combo = page.locator(".trip-gear-combo");
  const available = combo.locator("option:not(:disabled)");
  await expect(available).toHaveText(["No combo selected", "Baitcaster combo", "Spinning combo", "Untyped combo"]);
  await combo.selectOption("combo-casting");
  await method.selectOption("Trolling");
  await expect(available).toHaveText(["No combo selected", "Downrigger combo", "Diver combo", "Untyped combo"]);
  await expect(combo).toHaveValue("combo-casting");
  await expect(combo.locator('option[value="combo-casting"]')).toHaveJSProperty("disabled", true);

  await method.selectOption("Jigging");
  await expect(available).toHaveText(["No combo selected", "Spinning combo", "Untyped combo"]);
  await method.selectOption("Casting");
  await expect(combo.locator('option[value="combo-casting"]')).toHaveJSProperty("disabled", false);
  await expect(combo).toHaveValue("combo-casting");

  await page.locator("#pickSavedSetupButton").click();
  await page.locator("#createSavedSetupButton").click();
  await expect(page.locator("#newSavedSetupDialog .saved-setup-combo option")).toHaveText([
    "Select rod / reel combo", "Baitcaster combo", "Spinning combo", "Untyped combo"
  ]);
});
