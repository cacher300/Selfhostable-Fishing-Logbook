const { expect, test } = require("@playwright/test");
const { freshLogbook, resetLogbook, stubExternalApis } = require("./helpers");

function trollingTrip(id, date, clarity, lines, catches, lostFish = []) {
  return {
    id,
    title: id,
    date,
    location: "Lake Erie",
    launchTime: "08:00",
    linesPulledTime: "12:00",
    hours: 4,
    method: "Trolling",
    waterClarity: clarity,
    people: [],
    gearUsed: lines,
    catches: catches.map((item) => ({ species: "Walleye", photos: [], ...item })),
    lostFish: lostFish.map((item) => ({ photos: [], ...item }))
  };
}

async function seedComparisons(page) {
  const document = await freshLogbook(page, {
    lures: [
      { id: "lure-chart", name: "Chart Spoon", type: "Spoon", color: "Chartreuse", spoonSize: "Magnum", glow: true, media: [] },
      { id: "lure-blue", name: "Blue Spoon", type: "Spoon", color: "Blue/Silver", spoonSize: "Standard", media: [] }
    ],
    flashers: [{ id: "flasher-green", name: "Green Paddle", type: "Paddle", color: "Green", media: [] }],
    trips: [
      trollingTrip("trip-a", "2026-07-01", "Clear", [
        { id: "a-chart", startTime: "08:00", endTime: "12:00", presentation: "High Diver", dipseyDiverColor: "Purple", lureId: "lure-chart", flasherId: "flasher-green", lureMinutes: 240, flasherMinutes: 240 },
        { id: "a-blue", startTime: "08:00", endTime: "12:00", presentation: "High Diver", dipseyDiverColor: "Pink", lureId: "lure-blue", lureMinutes: 240 }
      ], [
        { id: "a1", setupLineId: "a-chart", time: "08:30" },
        { id: "a2", setupLineId: "a-chart", time: "11:00" },
        { id: "a3", setupLineId: "a-blue", time: "09:00" }
      ], [{ id: "a-lost", setupLineId: "a-blue", time: "09:30" }]),
      trollingTrip("trip-b", "2026-07-08", "Stained", [
        { id: "b-chart", startTime: "08:00", endTime: "12:00", presentation: "High Diver", dipseyDiverColor: "Purple", lureId: "lure-chart", lureMinutes: 240 }
      ], [
        { id: "b1", setupLineId: "b-chart", time: "09:15" },
        { id: "b2", setupLineId: "b-chart", time: "10:15" }
      ])
    ]
  });
  await resetLogbook(page, document);
  await stubExternalApis(page);
}

test.describe("stats comparisons", () => {
  test.describe.configure({ timeout: 90_000 });
  test.afterEach(async ({ page }) => {
    await resetLogbook(page, await freshLogbook(page));
  });

  test("compares lure color, size, and dipsey color catch rates and builds split comparisons", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await seedComparisons(page);
    await page.goto("/stats", { waitUntil: "domcontentloaded" });

    const highlights = page.locator("#comparisonHighlightsTable");
    const highlightRow = (label) => highlights.locator("tbody tr").filter({ has: page.locator("td:first-child", { hasText: new RegExp(`^${label}$`) }) });
    await expect(highlightRow("Lure color")).toContainText("Chartreuse");
    await expect(highlightRow("Lure color")).toContainText("0.5/hr");
    await expect(highlightRow("Dipsey diver color")).toContainText("Purple");

    const showTable = async (tableId) => {
      const card = page.locator(`#${tableId}`).locator("xpath=ancestor::article[1]");
      await card.locator('[data-stats-view="table"]').click();
      return page.locator(`#${tableId} table`);
    };

    const colorTable = await showTable("lureColorStatsTable");
    const chartreuseRow = colorTable.locator("tbody tr").filter({ hasText: "Chartreuse" });
    await expect(chartreuseRow.locator("td").nth(1)).toHaveText("4");
    await expect(chartreuseRow.locator("td").nth(4)).toHaveText("8");
    await expect(chartreuseRow.locator("td").nth(5)).toHaveText("0.5");

    const sizeTable = await showTable("lureSizeStatsTable");
    await expect(sizeTable).toContainText("Magnum Spoon");
    await expect(sizeTable).toContainText("Standard Spoon");

    const dipseyTable = await showTable("dipseyColorStatsTable");
    const pinkRow = dipseyTable.locator("tbody tr").filter({ hasText: "Pink" });
    await expect(pinkRow.locator("td").nth(2)).toHaveText("1");

    await expect(page.locator("#statsCompareMetricField")).toBeHidden();
    await page.locator("#statsCompareBySelect").selectOption("dipseyColor");
    await page.locator("#statsCompareSplitSelect").selectOption("waterClarity");
    await expect(page).toHaveURL(/compare=dipseyColor/);
    await expect(page).toHaveURL(/split=waterClarity/);
    await expect(page.locator("#statsCompareMetricField")).toBeVisible();
    const matrix = page.locator("#comparisonBuilderTable table");
    await expect(matrix.locator("thead")).toContainText("Clear");
    await expect(matrix.locator("thead")).toContainText("Stained");
    await expect(matrix.locator("tbody tr").filter({ hasText: "Purple" })).toContainText("0.5/hr");

    await page.locator("#statsCompareMetricSelect").selectOption("fish");
    await expect(page).toHaveURL(/show=fish/);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#statsCompareBySelect")).toHaveValue("dipseyColor");
    await expect(page.locator("#statsCompareSplitSelect")).toHaveValue("waterClarity");
    await expect(page.locator("#statsCompareMetricSelect")).toHaveValue("fish");
    expect(pageErrors).toEqual([]);
  });
});
