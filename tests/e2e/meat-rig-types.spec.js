const { expect, test } = require("@playwright/test");

test("edits meat rig choices in Settings and saves the selected lure type", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/settings");
  await page.getByRole("button", { name: "Categories", exact: true }).click();
  const group = page.locator('[data-predefined-key="meatRigTypes"]');
  await group.locator("summary").click();
  await expect(group.locator(".predefined-option-label").first()).toHaveValue("Herring Strip");
  await group.locator(".add-predefined-option").click();
  await group.locator(".predefined-option-label").last().fill("Custom bait strip");
  await expect(page.locator("#settingsSaveStatus")).toHaveText("Saved");

  await page.goto("/gear");
  await page.getByRole("button", { name: "New Lure", exact: true }).click();
  await page.locator("#lureType").selectOption("Meat Rig");
  await expect(page.locator("#lureMeatRigTypeField")).toBeVisible();
  await expect(page.locator("#lureMeatRigType")).toContainText("Custom bait strip");
  await page.locator("#lureName").fill("Test meat rig");
  await page.locator("#lureMeatRigType").selectOption("Custom bait strip");
  await page.locator('#lureForm button[type="submit"]').click();
  await expect(page.locator("#lureDialog")).toBeHidden();

  const saved = await page.evaluate(async () => (await fetch("/api/logbook")).json());
  expect(saved.meatRigTypes).toContain("Custom bait strip");
  const savedLure = saved.lures.find((lure) => lure.name === "Test meat rig");
  expect(savedLure?.meatRigType).toBe("Custom bait strip");

  await page.locator(`#baitInventoryTable [data-edit-lure="${savedLure.id}"]`).click();
  await expect(page.locator("#lureMeatRigType")).toHaveValue("Custom bait strip");
  expect(pageErrors).toEqual([]);
});
