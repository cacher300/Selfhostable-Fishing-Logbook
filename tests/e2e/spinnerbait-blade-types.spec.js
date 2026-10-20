const { expect, test } = require("@playwright/test");

test("saves a spinnerbait with a blade type", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/gear");
  await page.getByRole("button", { name: "New Lure", exact: true }).click();
  await expect(page.locator("#lureBladeTypeField")).toBeHidden();
  await page.locator("#lureType").selectOption("Spinnerbait");
  await expect(page.locator("#lureBladeTypeField")).toBeVisible();
  await page.locator("#lureName").fill("Test spinnerbait");
  await page.locator("#lureBladeType").selectOption("Willow Leaf");
  await page.locator('#lureForm button[type="submit"]').click();
  await expect(page.locator("#lureDialog")).toBeHidden();

  const saved = await page.evaluate(async () => (await fetch("/api/logbook")).json());
  expect(saved.lureTypes).toContain("Spinnerbait");
  const savedLure = saved.lures.find((lure) => lure.name === "Test spinnerbait");
  expect(savedLure?.type).toBe("Spinnerbait");
  expect(savedLure?.bladeType).toBe("Willow Leaf");

  await page.locator(`#baitInventoryTable [data-edit-lure="${savedLure.id}"]`).click();
  await expect(page.locator("#lureBladeType")).toHaveValue("Willow Leaf");
  expect(pageErrors).toEqual([]);
});
