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
      ]),
      { ...trollingTrip("trip-c", "2025-06-01", "Clear", [], []), method:"Casting" }
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
    await page.goto("/stats?tab=advanced", { waitUntil: "domcontentloaded" });

    const result = page.locator("#comparisonBuilderTable");
    await page.getByRole("button",{name:"Table",exact:true}).click();
    const chartreuseRow = result.getByRole("row").filter({ hasText:"Chartreuse" });
    await expect(chartreuseRow.locator("td").nth(0)).toHaveText("0.5");
    await expect(chartreuseRow.locator("td").nth(1)).toHaveText("4");
    await expect(chartreuseRow.locator("td").nth(4)).toHaveText("8");
    await chartreuseRow.getByRole("button",{name:"Chartreuse"}).click();
    await expect(page.locator("#workSources [data-view-trip]")).toHaveCount(2);

    await page.locator("#statsCompareBySelect").selectOption("lureSize");
    await expect(result).toContainText("Magnum Spoon");
    await expect(result).toContainText("Standard Spoon");
    await page.getByRole("button",{name:"Trolling spread", exact:true}).click();
    await page.locator("#statsCompareBySelect").selectOption("dipseyColor");
    await page.locator("#statsCompareMetricSelect").selectOption("lost");
    await expect(result.locator(".work-bar").filter({hasText:"Pink"}).locator("strong")).toHaveText("1");
    await page.locator("#statsCompareMetricSelect").selectOption("fishPerHour");
    await page.locator("#statsCompareSplitSelect").selectOption("waterClarity");
    await expect(page).toHaveURL(/compare=dipseyColor/);
    await expect(page).toHaveURL(/split=waterClarity/);
    await expect(result.locator("thead")).toContainText("Clear");
    await expect(result.locator("thead")).toContainText("Stained");
    const purple = result.locator("tbody tr").filter({hasText:"Purple"});
    await expect(purple.locator("td").nth(1).getByRole("button")).toHaveText("0.5");

    await page.locator("#statsCompareMetricSelect").selectOption("fish");
    await expect(page).toHaveURL(/show=fish/);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#statsCompareBySelect")).toHaveValue("dipseyColor");
    await expect(page.locator("#statsCompareSplitSelect")).toHaveValue("waterClarity");
    await expect(page.locator("#statsCompareMetricSelect")).toHaveValue("fish");
    await page.locator("#statsMethodFilter").selectOption("Casting");
    await expect(page.getByRole("button",{name:"Trolling spread",exact:true})).toHaveCount(0);
    await expect(page.locator("#workReportTitle")).toHaveText("Retrieve at the bite");
    expect(pageErrors).toEqual([]);
  });

  test("recorded methods and calendar ranges scope both the results and heatmap", async ({page}) => {
    await seedComparisons(page);
    await page.goto("/stats");
    await expect(page.locator("#statsMethodFilter option")).toHaveText(["All methods","Casting","Trolling"]);
    const date = page.getByRole("combobox",{name:"Date range",exact:true}), heat = page.locator("#statsActivitySummary");
    const custom = page.locator("#workCustomDates");
    const from = custom.getByLabel("Start date",{exact:true}), to = custom.getByLabel("End date",{exact:true});
    await date.selectOption("2025");
    await expect(heat).toHaveText("1 day fished");
    await page.locator("#workHeatModes").getByRole("button",{name:"Trips",exact:true}).click();
    await expect(heat).toHaveText("1 trip");
    await date.selectOption("custom");
    await expect(page.locator("#workDateHint")).toHaveText("Choose a start and end date.");
    await from.fill("2026-07-01");
    await to.fill("2026-07-08");
    await expect(heat).toHaveText("2 trips");
    await expect(page.locator(".activity-heatmap-calendar [role=img]")).toHaveCount(8);
    await expect(page.locator(".activity-heatmap-calendar [tabindex]")).toHaveText(["1","1"]);
    await page.getByRole("button",{name:"Personal Bests",exact:true}).click();
    await page.getByRole("button",{name:"Stats",exact:true}).click();
    await expect(page).toHaveURL(/range=custom&from=2026-07-01&to=2026-07-08/);
    await page.reload();
    await expect(from).toHaveValue("2026-07-01");
    await expect(heat).toHaveText("2 days fished");
    await to.fill("2026-06-30");
    await expect(page.locator("#workDateHint")).toHaveText("End date must be on or after start date.");
    await expect(heat).toBeHidden();
    await page.getByRole("button",{name:"Reset filters"}).click();
    await expect(date).toHaveValue("all");
    await expect(from).toBeHidden();
    await expect(page).toHaveURL(/\/stats$/);
  });

  test("wide comparisons scroll within the result and keep the format controls reachable", async ({page}) => {
    await seedComparisons(page);
    await page.goto("/stats?tab=advanced");
    await page.getByRole("button",{name:"Table",exact:true}).click();
    const rail = page.getByRole("region",{name:"Comparison data, horizontally scrollable"});
    for (const width of [1440,768,390]) {
      await page.setViewportSize({width,height:840});
      const geometry = await rail.evaluate(el => {
        el.scrollLeft = el.scrollWidth;
        const right = el.getBoundingClientRect().right;
        const last = el.querySelector("thead th:last-child").getBoundingClientRect();
        const controls = document.querySelector("#workViews").getBoundingClientRect();
        const name = document.createRange();
        name.selectNodeContents(el.querySelector("tbody th button"));
        return {pageFits:document.documentElement.scrollWidth <= document.documentElement.clientWidth, nameFits:name.getClientRects().length === 1,
          paged:el.scrollLeft > 0, lastVisible:last.right <= right+1 && last.left >= el.getBoundingClientRect().left,
          controlsVisible:controls.right <= innerWidth && controls.left >= 0};
      });
      expect(geometry,`result at ${width}px`).toEqual({pageFits:true,nameFits:true,paged:true,lastVisible:true,controlsVisible:true});
    }
    const offset = await rail.evaluate(el => el.scrollLeft);
    await rail.locator("tbody th button").first().click();
    await expect(page.locator("#workSources [data-view-trip]").first()).toBeVisible();
    expect(await rail.evaluate(el => el.scrollLeft)).toBe(offset);
    await page.getByRole("button",{name:"Bar chart",exact:true}).click();
    await expect(page.locator(".work-bar").first()).toBeVisible();
  });

  test("pressing a table heading reverses row order without moving the scroller, changing the measure or losing trip links", async ({page}) => {
    await seedComparisons(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto("/stats?month=July");
    await page.getByRole("button",{name:"Table",exact:true}).click();
    const result = page.locator("#comparisonBuilderTable"), rail = result.locator(".work-table");
    const head = name => rail.getByRole("columnheader",{name,exact:true});
    const labels = rail.getByRole("rowheader");
    await expect(head("Fish / line-hour")).toHaveAttribute("aria-sort","descending");
    expect(await rail.locator("thead button").count()).toBe(await rail.locator("thead th").count());
    const sample = head("Sample").getByRole("button");
    await sample.click();
    const offset = await rail.evaluate(el => el.scrollLeft);
    expect(offset).toBeGreaterThan(0);
    await expect(labels).toHaveText(["Chartreuse","Blue/Silver"]);
    await sample.press("Enter");
    await expect(head("Sample")).toHaveAttribute("aria-sort","ascending");
    await expect(labels).toHaveText(["Blue/Silver","Chartreuse"]);
    await expect(sample).toBeFocused();
    expect(await rail.evaluate(el => el.scrollLeft)).toBe(offset);
    await expect(page.locator("#statsCompareMetricSelect")).toHaveValue("fishPerHour");
    await expect(page).toHaveURL(/month=July/);
    await labels.first().getByRole("button").click();
    await expect(page.locator("#workSources [data-view-trip]")).toHaveCount(1);
    await head("Group").getByRole("button").click();
    await head("Group").getByRole("button").click();
    await expect(labels).toHaveText(["Chartreuse","Blue/Silver"]);
    await page.locator("#statsCompareSplitSelect").selectOption("waterClarity");
    const clear = head("Clear").getByRole("button");
    await clear.click();
    await expect(labels).toHaveText(["Chartreuse","Blue/Silver"]);
    await clear.click();
    await expect(labels).toHaveText(["Blue/Silver","Chartreuse"]);
    await rail.locator("tbody tr").first().getByRole("button",{name:"0.25",exact:true}).click();
    await expect(page.locator("#workSources")).toContainText("Trips behind Blue/Silver · Clear");
  });

  test("zero and empty results can be hidden and restored without changing totals, trips or the calendar", async ({page}) => {
    await seedComparisons(page);
    await page.setViewportSize({width:320,height:780});
    await page.goto("/stats?month=July&show=lost");
    const hide = page.getByRole("checkbox",{name:"Hide zero & empty results"}), result = page.locator("#comparisonBuilderTable");
    const table = page.locator("#workViews").getByRole("button",{name:"Table",exact:true});
    const cards = page.locator("#statsMetricGrid .metric-card"), landed = cards.filter({has:page.getByText("Landed fish",{exact:true})}).locator("strong");
    const heat = page.locator("#statsActivitySummary"), count = page.locator("#workReportCount");
    await expect(hide).not.toBeChecked();
    await expect(heat).toHaveText("2 days fished");
    await expect(landed).toHaveText("5");
    await expect(result.locator(".work-bar")).toHaveCount(2);
    await hide.check();
    await expect(result.locator(".work-bar")).toHaveCount(1);
    await expect(count).toContainText("1 of 2 groups");
    await table.click();
    await expect(result.getByRole("rowheader")).toHaveText(["Blue/Silver"]);
    await expect(result.getByRole("columnheader",{name:"Quiet while others hit"})).toHaveCount(0);
    await result.getByRole("button",{name:"Trips",exact:true}).click();
    await expect(result.getByRole("rowheader")).toHaveCount(1);
    await result.getByRole("button",{name:"Blue/Silver",exact:true}).click();
    await expect(page.locator("#workSources [data-view-trip]")).toHaveCount(1);
    await expect(cards.filter({hasText:"Skunk rate"})).toHaveCount(0);
    await expect(landed).toHaveText("5");
    await expect(heat).toHaveText("2 days fished");
    await page.reload();
    await expect(hide).toBeChecked();
    await table.click();
    await page.locator("#statsCompareMetricSelect").selectOption("quiet");
    await expect(result).toContainText("All results are hidden");
    await result.getByRole("button",{name:"Show all results"}).click();
    await expect(hide).not.toBeChecked();
    await expect(result.getByRole("rowheader")).toHaveCount(2);
    await expect(page.locator("#statsCompareMetricSelect")).toHaveValue("quiet");
    await expect(page.locator("#statsMonthFilter")).toHaveValue("July");
    await expect(cards.filter({hasText:"Skunk rate"}).locator("strong")).toHaveText("0%");
    await hide.check();
    await page.getByRole("button",{name:"Reset filters"}).click();
    await expect(hide).not.toBeChecked();
    await expect(page).toHaveURL(/\/stats\?advanced=1$/);
  });

  test("All time combines month and day; the top date filter alone switches to a weekday calendar", async ({page}) => {
    await seedComparisons(page);
    await page.setViewportSize({width:1920,height:1080});
    await page.clock.setFixedTime(new Date("2026-11-25T12:00:00"));
    await page.goto("/stats?tab=advanced");
    const card = page.locator(".stats-activity-card"), grid = card.getByRole("table",{name:"All time by month and day"});
    await expect(grid).toBeVisible();
    const unusedWidth = await grid.evaluate(table => {
      const scroller = table.parentElement;
      const {paddingLeft, paddingRight} = getComputedStyle(scroller);
      return scroller.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight) - table.getBoundingClientRect().width;
    });
    expect(Math.abs(unusedWidth)).toBeLessThanOrEqual(1);

    await page.setViewportSize({width:390,height:844});
    await page.locator("#workHeatModes").getByRole("button",{name:"Trips",exact:true}).click();
    await expect(card.getByRole("button",{name:/^(previous|next) year$/i,includeHidden:true})).toHaveCount(0);
    await expect(grid.getByRole("columnheader")).toHaveText(["Month",...Array.from({length:31},(_,i)=>String(i+1))]);
    await expect(grid.getByRole("rowheader")).toHaveCount(12);
    await expect(grid.getByRole("button",{name:/June 1: 1 day fished, 1 trip, 0 fish landed/})).toBeVisible();
    const cell = grid.getByRole("button",{name:/July 1: 1 day fished, 1 trip, 3 fish landed/});
    await cell.focus(); await page.keyboard.press("Enter");
    await expect(card.locator("#workDayDetail")).toContainText("3 fish landed");
    const calendar = card.locator(".activity-heatmap-scroll");
    const offset = await calendar.evaluate(el => { el.scrollLeft = 200; return el.scrollLeft; });
    expect(offset).toBeGreaterThan(0);
    await page.getByRole("button",{name:"Timing",exact:true}).click();
    await expect(grid).toBeVisible();
    expect(await calendar.evaluate(el => el.scrollLeft)).toBe(offset);
    const date = page.getByRole("combobox",{name:"Date range",exact:true});
    await date.selectOption("2025");
    await expect(grid).toHaveCount(0);
    await expect(card.locator(".activity-heatmap-weekdays")).toContainText("Mon");
    await expect(card.locator(".activity-heatmap-calendar [tabindex]")).toHaveCount(1);
    await expect(card.locator("#statsActivitySummary")).toHaveText("1 trip");
    await date.selectOption("all");
    await expect(grid).toBeVisible();
    await expect(card.locator("#statsActivitySummary")).toHaveText("3 trips");
  });

  test("Month removes other months' heatmap boxes in All time and in the weekday calendar", async ({page}) => {
    await seedComparisons(page);
    await page.goto("/stats?month=July");
    const card = page.locator(".stats-activity-card"), grid = card.getByRole("table");
    const month = page.locator("#statsMonthFilter"), date = page.locator("#statsDateFilter");
    await expect(grid.getByRole("rowheader")).toHaveText(["Jul"]);
    await expect(grid.getByRole("cell")).toHaveCount(31);
    await expect(card.locator("#statsActivitySummary")).toHaveText("2 days fished");
    await date.selectOption("2026");
    const boxes = card.locator(".activity-heatmap-calendar [role=img]");
    await expect(boxes).toHaveCount(31);
    await expect(boxes.first()).toHaveAttribute("aria-label",/July 1, 2026/);
    await expect(boxes.last()).toHaveAttribute("aria-label",/July 31, 2026/);
    await page.getByText("More filters",{exact:true}).click();
    await month.selectOption("February");
    await page.reload();
    await expect(month).toHaveValue("February"); // No February trips in this logbook.
    await expect(boxes).toHaveCount(28);
    await date.selectOption("all");
    await expect(grid.getByRole("rowheader")).toHaveText(["Feb"]);
    await expect(grid.getByRole("columnheader").last()).toHaveText("29");
    await page.getByRole("button",{name:"Reset filters"}).click();
    await expect(grid.getByRole("rowheader")).toHaveCount(12);
  });

  test("pie chart shows filtered catch shares, keeps rates separate, and opens supporting trips", async ({page}) => {
    await seedComparisons(page);
    await page.setViewportSize({width:320,height:800});
    await page.goto("/stats?month=July");
    const pie = page.getByRole("button",{name:"Pie chart",exact:true}), result = page.locator("#comparisonBuilderTable");
    await expect(pie).toHaveCount(0);
    await page.locator("#statsCompareMetricSelect").selectOption("fish");
    await expect(pie).toBeVisible();
    await pie.click();
    await expect(result.getByRole("img",{name:"Pie chart. Landed: 5 total in these groups"})).toBeVisible();
    await expect(result.locator("path")).toHaveCount(2);
    const top = result.getByRole("button",{name:/Chartreuse.*4 · 80%/});
    await top.focus(); await page.keyboard.press("Enter");
    await expect(page.locator("#workSources [data-view-trip]")).toHaveCount(2);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button",{name:"Fish & size",exact:true}).click();
    await expect(pie).toHaveCount(0);
    const species = result.getByRole("row").filter({hasText:"Walleye"});
    await expect(species.locator("td").first()).toHaveText("5");
    await page.locator("#statsCompareMetricSelect").selectOption("lost");
    await expect(species.locator("td").first()).toHaveText("0");
    await species.getByRole("button",{name:"Walleye",exact:true}).click();
    await expect(page.locator("#workSources [data-view-trip]")).toHaveCount(2);
  });

  test("Personal Bests filters and Leaderboard metrics fit beside and below the sidebar", async ({page}) => {
    await seedComparisons(page);
    await page.setViewportSize({width:768,height:840});
    await page.goto("/bests");
    await expect(page.locator("#bestsRankFilter")).toBeVisible();
    expect(await page.locator(".personal-bests-tools").evaluate(el => el.getBoundingClientRect().right <= innerWidth)).toBe(true);
    await page.goto("/leaderboard");
    const metrics = page.locator("#statsLureLeaderboard .leaderboard-metrics").first();
    await expect(metrics).toBeVisible();
    for (const width of [1024,768,390,320]) {
      await page.setViewportSize({width,height:840});
      expect(await metrics.evaluate(el => {
        const box = el.closest("details").getBoundingClientRect();
        return [...el.querySelectorAll("span")].every(label => {
          const r = label.getBoundingClientRect();
          return r.left >= box.left && r.right <= box.right && label.scrollWidth <= label.clientWidth+1;
        });
      }),`all ranking measures at ${width}px`).toBe(true);
    }
  });
});
