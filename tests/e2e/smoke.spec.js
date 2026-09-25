const { expect, test } = require("@playwright/test");

test.describe("application smoke", () => {
  test("loads the Trips screen and switches to Settings", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/");
    await expect(page).toHaveTitle("Fishing Logbook");
    await expect(page.locator(".topbar h2")).toHaveText("Trips");
    await expect(page.locator("#emptyState")).toBeVisible();

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.locator(".topbar h2")).toHaveText("Settings");
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "settings");

    expect(pageErrors).toEqual([]);
  });

  test("renders the routed entry points", async ({ page }) => {
    for (const route of ["/trips", "/stats", "/settings", "/wiki"]) {
      await page.goto(route);
      await expect(page).toHaveTitle("Fishing Logbook");
      await expect(page.locator(".topbar h2")).not.toHaveText("");
    }
  });

  test("keeps the stats more filters panel inside the viewport", async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 1024, height: 900 },
      { width: 390, height: 844 }
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/stats");
      await page.locator("#advancedStatsPanel .stats-more-filters > summary").click();
      const panel = await page.locator("#advancedStatsPanel .stats-more-filters > div").boundingBox();
      expect(panel).not.toBeNull();
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width);
    }
  });

  test("customizes species map pin colors from Settings", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/settings");
    await page.getByRole("button", { name: "Map Pins", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Map pin colors", exact: true })).toBeVisible();

    const colorInput = page.locator('[data-species-map-color="Largemouth Bass"]');
    await expect(colorInput).toHaveValue("#8dbb55");
    await colorInput.evaluate((input) => {
      input.value = "#123456";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(page.locator("#settingsSaveStatus")).toHaveText("Saved");
    await expect(colorInput).toHaveValue("#123456");
    await expect(page.getByRole("button", { name: "Restore default colors", exact: true })).toHaveCount(0);
    await expect(page.locator(".map-pin-settings-value")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("discards an empty checklist item draft before the next save", async ({ page }) => {
    const dialogs = [];
    const pageErrors = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/checklists");
    await page.getByRole("button", { name: "New Checklist", exact: true }).click();
    await expect(page.locator(".checklist-card")).toHaveCount(1);
    await page.locator(".checklist-name").fill("Launch Day");
    await expect(page.locator(".checklist-save-status")).toHaveText("Saved");
    await page.getByRole("button", { name: "Add Item", exact: true }).click();
    await expect(page.locator(".checklist-item-label")).toBeFocused();

    await page.getByRole("button", { name: "New Checklist", exact: true }).click();
    await expect(page.locator(".checklist-card")).toHaveCount(2);
    expect(dialogs).toEqual([]);
    expect(pageErrors).toEqual([]);
    await expect(page.locator(".checklist-card").first().locator(".checklist-item")).toHaveCount(0);
  });

  test("keeps trip deletion in the editor", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/trips");
    await expect(page.locator("#summaryDeleteTripButton")).toHaveCount(0);

    await page.getByRole("button", { name: "New Trip", exact: true }).click();
    await expect(page.locator("#tripDialog")).toBeVisible();
    await expect(page.locator("#deleteTripButton")).toBeHidden();

    await page.locator('#tripDialog [data-trip-draft-save]').first().click();
    await expect(page.locator("#tripDialog")).toBeHidden();
    await page.locator("#tripTable [data-view-trip]").click();
    await expect(page.locator("#tripSummaryDialog")).toBeVisible();
    await expect(page.locator("#summaryDeleteTripButton")).toHaveCount(0);

    await page.getByRole("button", { name: "Edit Trip", exact: true }).click();
    await expect(page.locator("#tripDialog")).toBeVisible();
    await expect(page.locator("#deleteTripButton")).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
