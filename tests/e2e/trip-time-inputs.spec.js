const { expect, test } = require("@playwright/test");

test("keeps trip start and end times on the full minute range", async ({ page }) => {
  await page.goto("/trips");
  await page.getByRole("button", { name: "New Trip", exact: true }).click();

  for (const selector of ["#launchTime", "#linesPulledTime"]) {
    const input = page.locator(selector);
    await expect(input).toHaveAttribute("min", "00:00");
    await expect(input).toHaveAttribute("max", "23:59");
    await expect(input).toHaveAttribute("step", "60");
    await input.fill("23:59");
    await expect(input).toHaveValue("23:59");
  }
});
