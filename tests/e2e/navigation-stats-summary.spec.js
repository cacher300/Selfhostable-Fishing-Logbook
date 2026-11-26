const { expect, test } = require("@playwright/test");
const {
  freshLogbook,
  resetLogbook,
  seededLocation,
  stubExternalApis
} = require("./helpers");

async function statsSeed(page, summaryFields = {}, { lureName = "Gold Spoon" } = {}) {
  const document = await freshLogbook(page, {
    locations: [seededLocation()],
    lures: [{ id: "lure-gold", name: lureName, type: "Spoon", color: "Gold", media: [] }],
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
        }],
        ...summaryFields
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
      ["Stats", "stats", "Stats", "#basicStatsPanel"],
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
      ["/stats", "Stats", "#basicStatsPanel"],
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

    const metric = label => page.locator("#statsMetricGrid .metric-card").filter({has:page.getByText(label,{exact:true})}).locator("strong");
    await expect(metric("Trips")).toHaveText("2");
    await expect(metric("Landed fish")).toHaveText("3");
    await expect(metric("Fish / hour")).toHaveText("0.5");

    await page.getByRole("button", { name: "Personal Bests", exact: true }).click();
    await expect(page.locator("#personalBestsGrid")).toContainText("Walleye");
    await expect(page.locator("#personalBestsGrid")).toContainText("7 lb");
    await expect(page.locator("#personalBestsGrid")).toContainText("27 in");
  });

  test("one Stats page keeps the overview above independently collapsible sections", async ({ page }) => {
    await statsSeed(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/stats");
    const basic = page.locator("#basicStatsPanel");
    const advanced = page.locator("#advancedStatsPanel");
    const basicHeading = basic.locator(":scope > summary");
    const advancedHeading = advanced.locator(":scope > summary");
    const heatmap = page.locator(".stats-activity-card");
    await expect(page.locator(".work-scope + #statsMetricGrid + .stats-activity-card + #basicStatsPanel + #advancedStatsPanel")).toHaveCount(1);
    await expect(basic).not.toHaveAttribute("open", "");
    await expect(advanced).not.toHaveAttribute("open", "");
    await page.locator("#statsMethodFilter").selectOption("Trolling");
    const landed = page.locator("#statsMetricGrid .metric-card")
      .filter({ has: page.getByText("Landed fish", { exact: true }) }).locator("strong");
    await expect(landed).toHaveText("2");
    await basicHeading.press("Enter");
    await expect(basic).toHaveAttribute("open", "");
    const species = basic.getByRole("table", { name: "Top species" });
    await expect(species.getByRole("rowheader")).toHaveText(["Perch", "Walleye"]);
    const productive = basic.getByRole("table", { name: "Most productive trips" });
    await expect(productive.getByRole("rowheader")).toContainText("Summary Charter");
    const luresByRate = basic.getByRole("table", { name: "Top 5 lures by rate" });
    await expect(luresByRate.getByRole("cell")).toHaveText(["0.5", "2", "4"]);
    const size = label => basic.locator(".metric-card").filter({has:page.getByText(label,{exact:true})}).locator("strong");
    await expect(size("Longest fish")).toHaveText("27 in");
    await expect(size("Shortest fish")).toHaveText("10 in");
    await expect(basic.locator("[data-view-trip], a[href]")).toHaveCount(0);
    await advancedHeading.click();
    await expect(advanced).toHaveAttribute("open", "");
    await expect(basic).toHaveAttribute("open", "");
    await expect(page).toHaveURL(/advanced=1/);
    await page.getByText("More filters", { exact: true }).click();
    await page.locator("#statsSpeciesFilter").selectOption("Walleye");
    await expect(landed).toHaveText("1");
    await basicHeading.click();
    await expect(species).toBeHidden();
    await expect(advanced).toHaveAttribute("open", "");
    await expect(heatmap).toBeVisible();
    await advancedHeading.click();
    await expect(advanced).not.toHaveAttribute("open", "");
    await expect(page).toHaveURL(/advanced=0/);
    await page.reload();
    await expect(advanced).not.toHaveAttribute("open", "");
    await expect(landed).toHaveText("1");
    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(page).toHaveURL(/\/stats$/);
    await expect(landed).toHaveText("3");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("personal bests feature the top catch, keep timeline rows compact, and fit narrow screens", async ({ page }) => {
    await statsSeed(page);
    await page.goto("/bests", { waitUntil: "domcontentloaded" });

    const cards = page.locator("#personalBestsGrid .personal-best-card");
    await expect(cards).toHaveCount(2);
    const [gridBox, topBox, otherBox] = await Promise.all([
      page.locator("#personalBestsGrid").boundingBox(),
      cards.first().boundingBox(),
      cards.nth(1).boundingBox()
    ]);
    expect(topBox.width).toBeGreaterThan(gridBox.width - 2);
    expect(otherBox.width).toBeLessThan(topBox.width);

    const entry = page.locator(".personal-best-timeline li").first();
    const [metaBox, actionBox] = await Promise.all([
      entry.locator(".personal-best-timeline-meta").boundingBox(),
      entry.getByRole("button", { name: "View Trip" }).boundingBox()
    ]);
    expect(actionBox.y).toBeLessThan(metaBox.y + metaBox.height);

    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 840 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
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

  test("wrapped timeline gear links underline every line instead of drawing one box border", async ({ page }) => {
    await statsSeed(page, {}, { lureName: "Whitr 3/4 Ounce Paddle Tail" });
    await page.goto("/trips");
    await page.locator('.table-row[data-view-trip="trip-summary"]').click();
    const link = page.locator("#tripSummaryBody .report-gear-link[data-report-lure-id]").first();
    await expect(link).toHaveText("Whitr 3/4 Ounce Paddle Tail");
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      const style = await link.evaluate(element => {
        const computed = getComputedStyle(element);
        return {
          lines: Math.round(element.getBoundingClientRect().height / parseFloat(computed.lineHeight)),
          borderBottom: computed.borderBottomStyle,
          decoration: computed.textDecorationLine
        };
      });
      expect(style, `${theme} theme`).toEqual({ lines: 2, borderBottom: "none", decoration: "underline" });
    }
  });

  test("the selected catch thumbnail has a visible green ring on all four sides", async ({ page }) => {
    const photos = Array.from({ length: 7 }, (_, i) => ({ id: `photo-${i}`, category: "catch-photos", filename: `ring-${i}.png` }));
    await statsSeed(page, { catches: [{ id: "with-photos", species: "Walleye", photos }], lostFish: [] });
    await page.route("**/uploads/catch-photos/ring-*.png", route => route.fulfill({
      contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#777"/></svg>'
    }));
    await page.goto("/trips");
    await page.locator('.table-row[data-view-trip="trip-summary"]').click();
    await page.getByRole("button", { name: "Open details for Walleye", exact: true }).click();
    const gallery = page.locator("#catchDetailPopout .catch-media-gallery");
    for (const [width, theme, index] of [[1307, "dark", 0], [900, "light", 6], [390, "dark", 0], [320, "light", 6]]) {
      await page.setViewportSize({ width, height: 912 });
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      const thumb = gallery.locator(".thumbnail-button").nth(index);
      if (await thumb.getAttribute("aria-pressed") !== "true") await thumb.click();
      await expect(thumb).toHaveAttribute("aria-pressed", "true");
      await expect(thumb).toBeInViewport({ ratio: 0.99 });
      await expect(gallery.locator(".featured-image")).toHaveAttribute("src", `/uploads/catch-photos/ring-${index}.png`);
      const png = await thumb.screenshot();
      const sides = await page.evaluate(async encoded => {
        const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
        const image = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const { width: w, height: h } = image;
        const ctx = new OffscreenCanvas(w, h).getContext("2d");
        ctx.drawImage(image, 0, 0);
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--green");
        ctx.fillRect(0, 0, 1, 1);
        const pixel = (x, y) => ctx.getImageData(x, y, 1, 1).data.join(",");
        const green = pixel(0, 0);
        return [[1, h / 2], [w - 2, h / 2], [w / 2, 1], [w / 2, h - 2]].map(([x, y]) => pixel(x, y) === green);
      }, png.toString("base64"));
      expect(sides, `${width}px ${theme} theme: left, right, top, bottom`).toEqual([true, true, true, true]);
    }
  });

  test("catch timeline and catch detail show larger fish photos in a compact responsive layout", async ({ page }, testInfo) => {
    const photo = { id: "photo-preview", category: "catch-photos", filename: "test-fish.png" };
    await statsSeed(page, { catches: [
      { id: "with-photo", species: "Walleye", length: "27 in", weight: "7 lb", photos: [photo] },
      { id: "no-photo", species: "Perch", photos: [] }
    ] });
    await page.route("**/uploads/catch-photos/test-fish.png", route => route.fulfill({
      contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"/>'
    }));
    await page.goto("/trips");
    await page.locator('.table-row[data-view-trip="trip-summary"]').click();
    const timeline = page.locator(".report-timeline-section");
    const preview = timeline.locator(".report-row-photo");
    const plainRow = timeline.getByRole("button", { name: "Open details for Perch" });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 840 });
      await expect(preview).toBeVisible();
      const box = await preview.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(80);
      expect(box.height).toBeGreaterThanOrEqual(60);
      expect((await plainRow.boundingBox()).height).toBeLessThan(box.height);
    }
    await preview.click();
    const detail = page.locator("#catchDetailPopout");
    const panel = detail.locator(".catch-detail-panel");
    await expect(detail.getByRole("heading", { name: "Walleye", exact: true })).toBeVisible();
    await expect(detail.locator(".catch-detail-header .report-result")).toHaveText("Kept");
    await expect(detail.locator(".catch-detail-group-overview")).toContainText("Length");
    await expect(detail.locator(".catch-detail-group-overview")).toContainText("27 in");
    const overviewGroup = detail.locator(".catch-detail-group-overview");
    const detailFields = await detail.locator(".catch-detail-fields-wrap").boundingBox();
    expect((await overviewGroup.boundingBox()).width).toBeGreaterThan(detailFields.width * 0.8);
    await expect.poll(() => detail.locator(".featured-image").evaluate(image => image.getBoundingClientRect().width))
      .toBeGreaterThan(240);

    await page.setViewportSize({ width: 1280, height: 840 });
    const desktopPhoto = await detail.locator(".featured-image-wrap").boundingBox();
    const desktopFacts = await detail.locator(".catch-detail-fields-wrap").boundingBox();
    expect(desktopFacts.x).toBeGreaterThan(desktopPhoto.x + desktopPhoto.width / 2);
    await testInfo.attach("catch-detail-desktop", { body: await panel.screenshot(), contentType: "image/png" });

    await page.setViewportSize({ width: 390, height: 844 });
    const mobilePhoto = await detail.locator(".featured-image-wrap").boundingBox();
    const mobileFacts = await detail.locator(".catch-detail-fields-wrap").boundingBox();
    expect(mobileFacts.y).toBeGreaterThan(mobilePhoto.y);
    expect((await panel.boundingBox()).x).toBeGreaterThanOrEqual(0);
  });

  test("probe profile distinguishes fishing depth from water depth and opens the original catch", async ({ page }) => {
    await statsSeed(page, {
      probeTemperatureProfile: [{ depthFeet: 0, temperature: "68" }, { depthFeet: 100, temperature: "42" }],
      catches: [
        { id: "bottom", species: "Walleye", waterDepth: "83", depth_ft: 80, notes: "Water only" },
        { id: "unknown", species: "Perch", lineOut: "150" },
        { id: "lure", species: "Perch", estimatedLureDepth: "45 ft", fowCaught: "100" },
        { id: "diver", species: "Walleye", estimatedDepth: "45" }
      ],
      lostFish: [{ id: "lost", possibleSpecies: "Perch", depthDown: "10" }]
    });
    await page.goto("/trips");
    await page.locator('.table-row[data-view-trip="trip-summary"]').click();
    const chart = page.locator(".report-probe-section");
    const markers = chart.locator(".probe-catch-depth-marker");
    await expect(markers).toHaveCount(3);
    const bottom = chart.locator('.probe-catch-depth-marker[data-summary-catch-index="0"]');
    await expect(bottom).toHaveAttribute("data-chart-depth", "83");
    await expect(bottom).not.toHaveAttribute("data-chart-temperature", /.*/);
    await expect(bottom).toHaveAccessibleName(/Walleye.*water depth.*83 ft.*fish depth unknown/i);
    const position = await bottom.evaluate(dot => {
      const plot = dot.ownerSVGElement.dataset;
      return {
        waterColumn: Number(dot.getAttribute("cx")) > Number(plot.chartPlotLeft) + Number(plot.chartPlotWidth),
        depth: (Number(dot.getAttribute("cy")) - Number(plot.chartPlotTop)) / Number(plot.chartPlotHeight) * Number(plot.chartDepthMax)
      };
    });
    expect(position.waterColumn).toBe(true);
    expect(position.depth).toBeCloseTo(83, 1);
    await expect(chart).toContainText(/1 catch not plotted: no depth recorded/i);
    const pair = chart.locator('.probe-catch-depth-marker[data-chart-depth="45"]');
    await expect(pair).toHaveCount(2);
    const [first, second] = await pair.evaluateAll(nodes => nodes.map(n => Number(n.getAttribute("cx"))));
    expect(Math.abs(second - first)).toBeGreaterThanOrEqual(12);
    await bottom.click();
    await expect(page.locator("#catchDetailPopout")).toContainText("Water only");
    await page.locator(".catch-detail-close").click();
    await page.getByRole("button", { name: "Edit Trip", exact: true }).click();
    await expect(page.locator('#probeTemperatureChart .probe-catch-depth-marker[data-chart-depth="83"]')).toHaveCount(1);
  });

  test("trip overview keeps on-water conditions visible and expands secondary weather on demand", async ({ page }, testInfo) => {
    await statsSeed(page, {
      intent: "Serious", tripRating: 3, weather: "Overcast", waterTemp: "70 °F",
      waterClarity: "Clear", structure: "80 ft", wind: "NE 29 kph, gust 33 kph", waveHeight: "0.1 ft",
      weatherData: { tripWindow: { temperatureC: 14, humidityPercent: 63, precipitationIn: 0 } }
    });
    await page.goto("/trips");
    await page.locator('.table-row[data-view-trip="trip-summary"]').click();
    const overview = page.locator(".report-overview-grid");
    const tripDetails = overview.locator("section").filter({ has: page.getByRole("heading", { name: "Trip details", exact: true }) });
    await expect(tripDetails.locator("dt", { hasText: "Target species" }).locator("+ dd")).toHaveText("Walleye");
    await expect(tripDetails.locator("dt", { hasText: "Method" }).locator("+ dd")).toHaveText("Trolling");
    await expect(tripDetails.locator(".rating-pill.good")).toHaveText("Good");
    const toggle = overview.getByText("Weather details", { exact: true });
    const humidity = overview.getByText("63%", { exact: true });
    await expect(page.locator(".report-date")).toContainText("6:00 AM – 10:00 AM");
    await expect(overview.getByText("Overcast")).toBeVisible();
    await expect(overview.getByText("70 °F")).toBeVisible();
    await expect(overview.getByText("NE 29 kph, gust 33 kph")).toBeVisible();
    await expect(humidity).toBeHidden();
    expect((await overview.boundingBox()).height).toBeLessThan(220);
    await testInfo.attach("compact-trip-overview", { body: await overview.screenshot(), contentType: "image/png" });

    await page.setViewportSize({ width: 390, height: 844 });
    await toggle.focus();
    await toggle.press("Enter");
    await expect(humidity).toBeVisible();
    await expect(overview.getByText(/^0 (mm|in)$/)).toBeVisible();
    const bounds = await overview.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await toggle.press("Space");
    await expect(humidity).toBeHidden();

    await page.locator("#tripSummaryDialog [data-close-dialog]").first().click();
    await page.locator('.table-row[data-view-trip="trip-second"]').click();
    await expect(tripDetails.locator(".rating-pill")).toHaveCount(0);
    await expect(toggle).toHaveCount(0);
    await expect(overview.getByText("Conditions", { exact: true })).toHaveCount(0);
  });
});
