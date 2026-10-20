const { expect, test } = require("@playwright/test");
const {
  freshLogbook,
  resetLogbook,
  seededLocation,
  stubExternalApis
} = require("./helpers");

async function statsSeed(page) {
  const document = await freshLogbook(page, {
    locations: [seededLocation()],
    lures: [{ id: "lure-gold", name: "Gold Spoon", type: "Spoon", color: "Gold", media: [] }],
    people: [{ id: "person-avery", name: "Avery" }],
    trips: [
      {
        id: "trip-summary",
        title: "Summary Charter",
        date: "2026-08-05",
        location: "Lake Erie",
        locationId: "loc-lake-erie",
        launch: "Port Clinton Launch",
        launchId: "launch-port-clinton",
        launchTime: "06:00",
        linesPulledTime: "10:00",
        hours: 4,
        targetSpecies: "Walleye",
        method: "Trolling",
        people: [{ id: "person-avery", name: "Avery" }],
        gearUsed: [{
          id: "gear-summary",
          startTime: "06:00",
          endTime: "10:00",
          side: "Port",
          presentation: "Downrigger",
          lureId: "lure-gold",
          lureMinutes: 240
        }],
        catches: [
          {
            id: "catch-big",
            personId: "person-avery",
            species: "Walleye",
            length: "27 in",
            weight: "7 lb",
            time: "07:15",
            setupLineId: "gear-summary",
            lureId: "lure-gold",
            photos: []
          },
          {
            id: "catch-perch",
            personId: "person-avery",
            species: "Perch",
            length: "10 in",
            weight: "1 lb",
            time: "08:15",
            setupLineId: "gear-summary",
            lureId: "lure-gold",
            photos: []
          }
        ],
        lostFish: [{
          id: "lost-summary",
          personId: "person-avery",
          possibleSpecies: "Walleye",
          time: "09:00",
          setupLineId: "gear-summary",
          photos: []
        }]
      },
      {
        id: "trip-second",
        title: "Short evening",
        date: "2026-08-06",
        location: "Lake Erie",
        locationId: "loc-lake-erie",
        launchTime: "18:00",
        linesPulledTime: "20:00",
        hours: 2,
        targetSpecies: "Walleye",
        method: "Casting",
        people: [{ id: "person-avery", name: "Avery" }],
        gearUsed: [],
        catches: [{
          id: "catch-small",
          personId: "person-avery",
          species: "Walleye",
          length: "20 in",
          weight: "3 lb",
          time: "19:00",
          photos: []
        }],
        lostFish: []
      }
    ]
  });
  await resetLogbook(page, document);
  await stubExternalApis(page);
}

test.describe("navigation, stats, and summary characterization", () => {
  test.describe.configure({ timeout: 90_000 });
  test.afterEach(async ({ page }) => {
    await resetLogbook(page, await freshLogbook(page));
  });

  test("primary nav buttons and direct routes show matching panels and titles", async ({ page }) => {
    await statsSeed(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const navButtons = [
      ["Trips", "trips", "Trips", "#tripListPanel"],
      ["Expeditions", "expeditions", "Expeditions", "#expeditionsPanel"],
      ["Stats", "stats", "Stats", "#advancedStatsPanel"],
      ["Map", "map", "Map", "#mapPanel"],
      ["Gear", "gear", "Gear", "#gearPanel"],
      ["Gallery", "gallery", "Gallery", "#galleryPanel"],
      ["Checklists", "checklists", "Checklists", "#checklistsPanel"],
      ["Settings", "settings", "Settings", "#settingsPanel"]
    ];

    for (const [button, view, title, panel] of navButtons) {
      await page.getByRole("button", { name: button, exact: true }).click();
      await expect(page.locator("body")).toHaveAttribute("data-active-view", view);
      await expect(page.locator(".topbar h2")).toHaveText(title);
      await expect(page.locator(panel)).toBeVisible();
    }

    await page.getByRole("button", { name: "Stats", exact: true }).click();
    await page.getByRole("button", { name: "Personal Bests", exact: true }).click();
    await expect(page.locator(".topbar h2")).toHaveText("Personal Bests");
    await expect(page.locator("#personalBestsPanel")).toBeVisible();
    await page.getByRole("button", { name: "Stats", exact: true }).click();
    await page.getByRole("button", { name: "Leaderboard", exact: true }).click();
    await expect(page.locator(".topbar h2")).toHaveText("Leaderboard");
    await expect(page.locator("#leaderboardPanel")).toBeVisible();

    const routes = [
      ["/trips", "Trips", "#tripListPanel"],
      ["/stats", "Stats", "#advancedStatsPanel"],
      ["/map", "Map", "#mapPanel"],
      ["/gear", "Gear", "#gearPanel"],
      ["/settings", "Settings", "#settingsPanel"],
      ["/bests", "Personal Bests", "#personalBestsPanel"],
      ["/expeditions", "Expeditions", "#expeditionsPanel"],
      ["/leaderboard", "Leaderboard", "#leaderboardPanel"],
      ["/gallery", "Gallery", "#galleryPanel"],
      ["/checklists", "Checklists", "#checklistsPanel"]
    ];

    for (const [route, title, panel] of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".topbar h2")).toHaveText(title);
      await expect(page.locator(panel)).toBeVisible();
    }
  });

  test("stats and personal bests render seeded calculations", async ({ page }) => {
    await statsSeed(page);
    await page.goto("/stats", { waitUntil: "domcontentloaded" });

    const metric = (label) => page.locator("#advancedMetricGrid .metric-card").filter({ hasText: label }).locator("strong");
    await expect(metric("Trips")).toHaveText("2");
    await expect(metric("Landed fish")).toHaveText("3");
    await expect(metric("Fish / hour")).toHaveText("0.5");

    await page.getByRole("button", { name: "Personal Bests", exact: true }).click();
    await expect(page.locator("#personalBestsGrid")).toContainText("Walleye");
    await expect(page.locator("#personalBestsGrid")).toContainText("7 lb");
    await expect(page.locator("#personalBestsGrid")).toContainText("27 in");
  });

  test("trip summary report renders title, catch counts, and species rows", async ({ page }) => {
    await statsSeed(page);
    await page.goto("/trips", { waitUntil: "domcontentloaded" });

    await page.locator('.table-row[data-view-trip="trip-summary"]').click();
    await expect(page.locator("#tripSummaryDialog")).toBeVisible();
    await expect(page.locator("#tripSummaryTitle")).toHaveText("Summary Charter");
    await expect(page.locator("#tripSummaryBody")).toContainText("Landed");
    await expect(page.locator("#tripSummaryBody")).toContainText("2");
    await expect(page.locator("#tripSummaryBody")).toContainText("Missed / lost");
    await expect(page.locator("#tripSummaryBody")).toContainText("1");
    await expect(page.locator("#tripSummaryBody")).toContainText("Walleye");
    await expect(page.locator("#tripSummaryBody")).toContainText("Perch");
  });
});
