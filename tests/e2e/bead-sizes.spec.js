const { expect, test } = require("@playwright/test");

test("saves a bead with a bead size", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/gear");
  await page.getByRole("button", { name: "New Lure", exact: true }).click();
  await expect(page.locator("#lureBeadSizeField")).toBeHidden();
  await page.locator("#lureType").selectOption("Bead");
  await expect(page.locator("#lureBeadSizeField")).toBeVisible();
  await expect(page.locator("#lureBladeTypeField")).toBeHidden();
  await page.locator("#lureName").fill("Test bead");
  await page.locator("#lureBeadSize").selectOption("10mm");
  await page.locator('#lureForm button[type="submit"]').click();
  await expect(page.locator("#lureDialog")).toBeHidden();

  const saved = await page.evaluate(async () => (await fetch("/api/logbook")).json());
  const savedLure = saved.lures.find((lure) => lure.name === "Test bead");
  expect(savedLure?.type).toBe("Bead");
  expect(savedLure?.beadSize).toBe("10mm");

  await page.locator(`#baitInventoryTable [data-edit-lure="${savedLure.id}"]`).click();
  await expect(page.locator("#lureBeadSize")).toHaveValue("10mm");
  expect(pageErrors).toEqual([]);
});
