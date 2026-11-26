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

  test("keeps page titles and actions clear of the primary navigation when resizing", async ({ page }) => {
    const header = page.locator(".topbar");
    for (const [route, title] of [["/checklists", "Checklists"], ["/expeditions", "Expeditions"], ["/bests", "Personal Bests"]]) {
      await page.goto(route);
      await expect(header.getByRole("heading")).toHaveText(title);
      for (const width of [1307, 1181, 1180, 768, 320, 1440, 1920]) {
        await page.setViewportSize({ width, height: 840 });
        const clear = await header.evaluate(el => {
          const nav = el.querySelector("nav").getBoundingClientRect();
          // A shrinking grid cell can look clear while the title's text paints over a button.
          const titleText = document.createRange();
          titleText.selectNodeContents(el.querySelector("h2"));
          const sides = [...titleText.getClientRects(), ...Array.from(el.querySelectorAll(".utility-actions button")).flatMap(b => [...b.getClientRects()])];
          const fits = r => r.left >= -1 && r.right <= document.documentElement.clientWidth + 1;
          return fits(nav) && sides.every(r => fits(r) && (r.right < nav.left || nav.right < r.left || r.bottom < nav.top || nav.bottom < r.top));
        });
        expect(clear, `${title} at ${width}px`).toBe(true);
      }
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
      await page.locator(".work-scope summary").click();
      const panel = await page.locator(".work-scope details > div").boundingBox();
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

  test("keeps the trip editor open while Save Draft is in flight", async ({ page }) => {
    let releaseSave;
    let notifySaveStarted;
    const saveGate = new Promise((resolve) => { releaseSave = resolve; });
    const saveStarted = new Promise((resolve) => { notifySaveStarted = resolve; });
    await page.route("**/api/logbook", async (route) => {
      if (route.request().method() === "PUT") {
        notifySaveStarted();
        await saveGate;
      }
      await route.continue();
    });

    await page.goto("/trips");
    await page.getByRole("button", { name: "New Trip", exact: true }).click();
    await page.locator("#tripTitle").fill("Pending draft");
    await page.locator('#tripDialog [data-trip-draft-save]').first().click();
    await saveStarted;

    const closeButton = page.locator("#tripDialog [data-close-dialog]").first();
    await expect(closeButton).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.locator("#tripDialog")).toBeVisible();

    releaseSave();
    await expect(page.locator("#tripDialog")).toBeHidden();
    const saved = await (await page.request.get("/api/logbook")).json();
    expect(saved.trips).toHaveLength(1);
    expect(saved.trips[0]).toMatchObject({ title: "Pending draft", isDraft: true });
  });

  test("explains a rejected draft save before allowing the user to discard it", async ({ page }) => {
    await page.route("**/api/logbook", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 412,
          contentType: "application/json",
          headers: { ETag: '"1"' },
          body: JSON.stringify({ error: "The logbook was changed in another tab." })
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/trips");
    await page.getByRole("button", { name: "New Trip", exact: true }).click();
    await page.locator("#tripTitle").fill("Unsaved after conflict");
    await page.locator('#tripDialog [data-trip-draft-save]').first().click();
    await expect(page.locator("#tripFormMessage")).toContainText("changed in another tab");

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("last save failed");
      await dialog.dismiss();
    });
    await page.locator("#tripDialog [data-close-dialog]").first().click();
    await expect(page.locator("#tripDialog")).toBeVisible();
    await expect(page.locator("#tripTitle")).toHaveValue("Unsaved after conflict");
  });
});
