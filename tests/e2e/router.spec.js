const { expect, test } = require("@playwright/test");
const { failOnHtmlEscapedMarkup, freshLogbook, resetLogbook, seededLocation, stubExternalApis } = require("./helpers");

async function routerSeed(page) {
  const document = await freshLogbook(page, {
    locations: [seededLocation()],
    lures: [{ id: "lure-blue", name: "Tom's \"Blue\" & Silver", type: "Spoon", color: "Blue & Silver", media: [] }],
    people: [{ id: "person-tom", name: "Tom & Avery" }],
    trips: [{
      id: "trip-amp",
      title: "Tom's & Avery's \"Morning\"",
      date: "2026-09-01",
      location: "Lake Erie & Bay",
      locationId: "loc-lake-erie",
      launch: "Port Clinton Launch",
      launchId: "launch-port-clinton",
      launchTime: "06:00",
      linesPulledTime: "09:00",
      hours: 3,
      targetSpecies: "Walleye",
      method: "Trolling",
      people: [{ id: "person-tom", name: "Tom & Avery" }],
      gearUsed: [{
        id: "gear-blue",
        startTime: "06:00",
        endTime: "09:00",
        side: "Port",
        presentation: "Downrigger",
        lureId: "lure-blue"
      }],
      catches: [{
        id: "catch-blue",
        personId: "person-tom",
        species: "Walleye & Perch",
        time: "07:30",
        setupLineId: "gear-blue",
        lureId: "lure-blue",
        coordinates: { latitude: 41.651, longitude: -82.822 },
        photos: []
      }],
      lostFish: []
    }]
  });
  await resetLogbook(page, document);
  await stubExternalApis(page);
}

test.describe("pushState router", () => {
  test.describe.configure({ timeout: 90_000 });

  test.afterEach(async ({ page }) => {
    await resetLogbook(page, await freshLogbook(page));
  });

  test("primary navigation updates URL and browser history restores panels", async ({ page }) => {
    await routerSeed(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "Gear", exact: true }).click();
    await expect(page).toHaveURL(/\/gear$/);
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "gear");
    await expect(page.locator(".topbar h2")).toHaveText("Gear");

    await page.getByRole("button", { name: "Stats", exact: true }).click();
    await expect(page).toHaveURL(/\/stats$/);
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "stats");
    await expect(page.locator(".topbar h2")).toHaveText("Stats");

    await page.goBack();
    await expect(page).toHaveURL(/\/gear$/);
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "gear");
    await expect(page.locator(".topbar h2")).toHaveText("Gear");

    await page.goForward();
    await expect(page).toHaveURL(/\/stats$/);
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "stats");
    await expect(page.locator(".topbar h2")).toHaveText("Stats");
  });

  test("reload on a pushed route keeps the same view", async ({ page }) => {
    await routerSeed(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Gallery", exact: true }).click();
    await expect(page).toHaveURL(/\/gallery$/);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "gallery");
    await expect(page.locator(".topbar h2")).toHaveText("Gallery");
  });

  test("stats query string survives same-view navigation", async ({ page }) => {
    await routerSeed(page);
    await page.goto("/stats?method=Trolling&range=season", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#statsMethodFilter")).toHaveValue("Trolling");
    await page.getByRole("button", { name: "Stats", exact: true }).click();
    await expect(page).toHaveURL(/\/stats\?method=Trolling&range=season$/);
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "stats");
  });

  test("rendered ampersands and apostrophes are not double escaped", async ({ page }) => {
    failOnHtmlEscapedMarkup(page);
    await routerSeed(page);
    const lureName = "Tom's \"Blue\" & Silver";
    const tripTitle = "Tom's & Avery's \"Morning\"";

    await page.goto("/gear", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#baitInventoryTable")).toContainText(lureName);
    await expect(page.locator("#baitInventoryTable")).not.toContainText("&amp;");

    await page.getByRole("button", { name: "Trips", exact: true }).click();
    await expect(page.locator("#tripTable")).toContainText(tripTitle);
    await expect(page.locator("#tripTable")).not.toContainText("&amp;");

    await page.getByRole("button", { name: "New Trip", exact: true }).click();
    await page.locator("#method").selectOption({ label: "Trolling" });
    await page.getByRole("button", { name: "Add Rod", exact: true }).click();
    await expect(page.locator("#tripGearRows .gear-used-row").last().locator(".trip-gear-lure")).toContainText(lureName);
    await page.locator("#tripDialog").evaluate((dialog) => dialog.close());

    await page.locator('.table-row[data-view-trip="trip-amp"]').click();
    await expect(page.locator("#tripSummaryDialog")).toContainText(tripTitle);
    await expect(page.locator("#tripSummaryDialog")).toContainText(lureName);
    await expect(page.locator("#tripSummaryDialog")).not.toContainText("&amp;");
    await page.locator("#tripSummaryDialog").evaluate((dialog) => dialog.close());

    await page.getByRole("button", { name: "Map", exact: true }).click();
    const marker = page.locator(".leaflet-marker-icon, .leaflet-interactive").first();
    await expect(marker).toBeVisible();
    await marker.click({ force: true });
    await expect(page.locator(".leaflet-popup-content")).toContainText("Walleye & Perch at Lake Erie & Bay");
    await expect(page.locator(".leaflet-popup-content")).not.toContainText("&amp;");
  });

  test("main surfaces do not render escaped markup strings", async ({ page }) => {
    failOnHtmlEscapedMarkup(page);
    await routerSeed(page);
    const assertCleanBodyText = async () => {
      const text = await page.locator("body").evaluate((body) => body.innerText);
      expect(text).not.toMatch(/&lt;|&amp;amp;|&#039;|<div/);
    };

    await page.goto("/trips", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "New Trip", exact: true }).click();
    await page.getByRole("button", { name: "Add Rod", exact: true }).click();
    await page.getByRole("button", { name: "Add Catch", exact: true }).click();
    await assertCleanBodyText();
    await page.locator("#tripDialog").evaluate((dialog) => dialog.close());

    await page.locator('.table-row[data-view-trip="trip-amp"]').click();
    await expect(page.locator("#tripSummaryDialog")).toBeVisible();
    await assertCleanBodyText();
    await page.getByRole("button", { name: "Share Trip", exact: true }).click();
    await expect(page.locator("#shareTripDialog")).toBeVisible();
    await assertCleanBodyText();
    await page.locator("#shareTripDialog").evaluate((dialog) => dialog.close());
    await page.locator("#tripSummaryDialog").evaluate((dialog) => dialog.close());

    for (const [route, panel] of [
      ["/stats", "#advancedStatsPanel"],
      ["/leaderboard", "#leaderboardPanel"],
      ["/bests", "#personalBestsPanel"],
      ["/expeditions", "#expeditionsPanel"],
      ["/checklists", "#checklistsPanel"],
      ["/gallery", "#galleryPanel"],
      ["/map", "#mapPanel"],
      ["/gear", "#gearPanel"],
      ["/settings", "#settingsPanel"]
    ]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator(panel)).toBeVisible();
      await assertCleanBodyText();
    }

    await page.goto("/gear", { waitUntil: "domcontentloaded" });
    await page.locator("#lureDialog").evaluate((dialog) => dialog.showModal());
    await expect(page.locator("#lureDialog")).toBeVisible();
    await assertCleanBodyText();
    await page.locator("#lureDialog").evaluate((dialog) => dialog.close());
    await page.locator("#flasherDialog").evaluate((dialog) => dialog.showModal());
    await expect(page.locator("#flasherDialog")).toBeVisible();
    await assertCleanBodyText();
    await page.locator("#flasherDialog").evaluate((dialog) => dialog.close());

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    for (const tab of await page.locator("[data-settings-tab]").evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute("data-settings-tab")))) {
      await page.locator(`[data-settings-tab="${tab}"]`).click();
      await assertCleanBodyText();
    }

    await page.getByRole("button", { name: "Wiki", exact: true }).click();
    await expect(page.locator("#wikiPanel")).toBeVisible();
    await assertCleanBodyText();

    await page.getByRole("button", { name: "Map", exact: true }).click();
    const marker = page.locator(".leaflet-marker-icon, .leaflet-interactive").first();
    await expect(marker).toBeVisible();
    await marker.click({ force: true });
    await expect(page.locator(".leaflet-popup-content")).toBeVisible();
    await assertCleanBodyText();
  });
});
