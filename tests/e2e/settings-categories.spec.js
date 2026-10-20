const { expect, test } = require("@playwright/test");

test("searches categories by name and saved option", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Categories", exact: true }).click();

  const search = page.getByRole("searchbox", { name: "Search categories" });
  const species = page.locator('[data-predefined-key="species"]');
  const meatRigTypes = page.locator('[data-predefined-key="meatRigTypes"]');

  await expect(species).toBeVisible();
  await search.fill("Sucker Belly Strip");
  await expect(meatRigTypes).toBeVisible();
  await expect(species).toBeHidden();
  await expect(page.locator("#categorySearchEmpty")).toBeHidden();

  await search.fill("no matching category");
  await expect(page.locator("#categorySearchEmpty")).toBeVisible();
  await search.clear();
  await expect(species).toBeVisible();
  await expect(page.locator("#categorySearchEmpty")).toBeHidden();
});
