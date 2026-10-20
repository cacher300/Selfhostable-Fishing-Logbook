const { expect, test } = require("@playwright/test");
const { freshLogbook, resetLogbook, seededLocation, stubExternalApis } = require("./helpers");

async function expectNoVisibleEscapedMarkup(page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("<div");
  expect(text).not.toContain("&lt;");
}

test("spread diagrams and GPS photo choices do not render escaped markup", async ({ page }) => {
  const consoleMessages = [];
  page.on("console", (message) => {
    if (message.text().includes("html: markup-like string was escaped")) consoleMessages.push(message.text());
  });
  const document = await freshLogbook(page, {
    locations: [seededLocation()],
    rods: [{ id: "rod-1", name: "Rigger Rod", media: [] }],
    reels: [{ id: "reel-1", name: "Rigger Reel", media: [] }],
    rodReelCombos: [{ id: "combo-1", rodId: "rod-1", reelId: "reel-1", shortName: "Rigger Combo" }],
    lures: [
      { id: "lure-main", name: "Green Spoon", type: "Spoon", media: [] },
      { id: "lure-cheater", name: "Orange Spoon", type: "Spoon", media: [] }
    ],
    flashers: [{ id: "flasher-1", name: "White Paddle", media: [] }],
    settings: {
      trollingSpreads: [{
        id: "spread-1",
        name: "Markup Spread",
        spread: [
          { comboId: "combo-1", side: "Port", presentation: "Downrigger" },
          { comboId: "combo-1", side: "Starboard", presentation: "High Diver", dipseyDiverColor: "Clear" },
          { comboId: "combo-1", side: "Port", presentation: "Outside Board" }
        ]
      }],
      defaultTrollingSpreadId: "spread-1"
    },
    trips: [{
      id: "trip-markup",
      title: "Markup troll",
      date: "2026-09-20",
      location: "Lake Erie",
      locationId: "loc-lake-erie",
      launchTime: "06:00",
      linesPulledTime: "10:00",
      hours: 4,
      targetSpecies: "Walleye",
      method: "Trolling",
      people: [],
      gearUsed: [
        { id: "line-1", startTime: "06:00", endTime: "10:00", side: "Port", presentation: "Downrigger", comboId: "combo-1", lureId: "lure-main", flasherId: "flasher-1", hasCheater: true, cheaterLureId: "lure-cheater" },
        { id: "line-2", startTime: "06:00", endTime: "10:00", side: "Starboard", presentation: "High Diver", comboId: "combo-1", lureId: "lure-main", dipseyDiverColor: "Clear" },
        { id: "line-3", startTime: "06:00", endTime: "10:00", side: "Port", presentation: "Outside Board", comboId: "combo-1", lureId: "lure-main" }
      ],
      catches: [{
        id: "catch-1",
        species: "Walleye",
        time: "07:00",
        setupLineId: "line-1",
        photos: [
          { id: "photo-1", category: "catch-photos", filename: "gps-one.jpg", coordinates: { latitude: 41.61, longitude: -82.91 }, captureTime: "07:00" },
          { id: "photo-2", category: "catch-photos", filename: "gps-two.jpg", coordinates: { latitude: 41.62, longitude: -82.92 }, captureTime: "07:01" }
        ]
      }],
      lostFish: []
    }]
  });
  await resetLogbook(page, document);
  await stubExternalApis(page);

  await page.goto("/trips", { waitUntil: "domcontentloaded" });
  await page.locator('.table-row[data-view-trip="trip-markup"]').click();
  await expect(page.locator("#tripSummaryDialog")).toBeVisible();
  await expectNoVisibleEscapedMarkup(page);
  await page.getByRole("button", { name: "Edit Trip", exact: true }).click();
  await expectNoVisibleEscapedMarkup(page);
  await page.locator("#tripDialog [data-close-dialog]").first().click();
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Trolling Spread", exact: true }).click();
  await expectNoVisibleEscapedMarkup(page);
  expect(consoleMessages).toEqual([]);
});
