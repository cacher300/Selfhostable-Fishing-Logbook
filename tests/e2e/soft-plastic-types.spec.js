const { expect, test } = require("@playwright/test");

test("edits soft plastic styles in Settings and saves the selected lure style", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/settings");
  await page.getByRole("button", { name: "Categories", exact: true }).click();
  const group = page.locator('[data-predefined-key="softPlasticTypes"]');
  await group.locator("summary").click();
  await expect(group.locator(".predefined-option-label").first()).toHaveValue("Paddle Tail");
  await group.locator(".add-predefined-option").click();
  await group.locator(".predefined-option-label").last().fill("Custom tail");
  await expect(page.locator("#settingsSaveStatus")).toHaveText("Saved");

  await page.goto("/gear");
  await page.getByRole("button", { name: "New Lure", exact: true }).click();
  await expect(page.locator("#lureSoftPlasticTypeField")).toBeHidden();
  await page.locator("#lureType").selectOption("Soft Plastic");
  await expect(page.locator("#lureSoftPlasticTypeField")).toBeVisible();
  await expect(page.locator("#lureSoftPlasticType")).toContainText("Custom tail");
  await page.locator("#lureName").fill("Test soft plastic");
  await page.locator("#lureSoftPlasticType").selectOption("Custom tail");
  await page.locator('#lureForm button[type="submit"]').click();
  await expect(page.locator("#lureDialog")).toBeHidden();

  const saved = await page.evaluate(async () => (await fetch("/api/logbook")).json());
  expect(saved.softPlasticTypes).toContain("Custom tail");
  const savedLure = saved.lures.find((lure) => lure.name === "Test soft plastic");
  expect(savedLure?.softPlasticType).toBe("Custom tail");

  await page.locator(`#baitInventoryTable [data-edit-lure="${savedLure.id}"]`).click();
  await expect(page.locator("#lureSoftPlasticType")).toHaveValue("Custom tail");
  expect(pageErrors).toEqual([]);
});
