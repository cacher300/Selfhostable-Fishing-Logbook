const { expect, test } = require("@playwright/test");
const {
  freshLogbook,
  readLogbook,
  resetLogbook,
  seededLocation,
  stubExternalApis
} = require("./helpers");

async function resetEmpty(page, overrides = {}) {
  const document = await freshLogbook(page, overrides);
  await resetLogbook(page, document);
  await stubExternalApis(page);
}

test.describe("gear and settings characterization", () => {
  test.describe.configure({ timeout: 60_000 });
  test.afterEach(async ({ page }) => {
    await resetLogbook(page, await freshLogbook(page));
  });

  for (const { width, height, theme } of [
    { width: 1440, height: 900, theme: "light" },
    { width: 390, height: 844, theme: "dark" }
  ]) {
    test(`combines soft plastic styles with color filters at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const seed = await freshLogbook(page, {
        lures: [
          { id: "green-tail", name: "Green tail", type: "Soft Plastic", softPlasticType: "Paddle Tail", color: "Green" },
          { id: "blue-tail", name: "Blue tail", type: "Soft Plastic", softPlasticType: "Paddle Tail", color: "Blue" },
          { id: "tube", name: "Green tube", type: "Soft Plastic", softPlasticType: "Custom tube", color: "Green" },
          { id: "unstyled", name: "Unstyled plastic", type: "Soft Plastic", color: "Green" },
          { id: "spoon", name: "Green spoon", type: "Spoon", color: "Green" }
        ]
      });
      seed.settings.theme = theme;
      await resetLogbook(page, seed);
      await stubExternalApis(page);
      await page.goto("/gear", { waitUntil: "domcontentloaded" });
      const type = page.locator("#gearLureTypeFilter");
      const style = page.getByRole("combobox", { name: "Soft plastic style", exact: true });
      const rows = page.locator("#baitInventoryTable tbody tr:visible");
      await expect(style).toBeHidden();
      await type.selectOption("Soft Plastic");
      await expect(style).toBeVisible();
      await expect(style.locator("option")).toHaveText(["All styles", "Custom tube", "Paddle Tail"]);
      await expect(rows).toHaveCount(4);
      await style.selectOption("Paddle Tail");
      await expect(rows).toHaveCount(2);
      await page.locator("#gearFilterField").selectOption("Color");
      await page.locator("#gearFilterQuery").fill("green");
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText("Green tail");
      await style.selectOption("Custom tube");
      await expect(rows).toContainText("Green tube");
      await page.locator('#baitInventoryTable [data-inventory-sort-index="1"]').click();
      await expect(style).toHaveValue("Custom tube");
      await expect(rows).toHaveCount(1);
      await page.screenshot({ path: test.info().outputPath("soft-plastic-style-filter.png") });
      await page.getByRole("button", { name: "Flashers", exact: true }).click();
      await expect(style).toBeHidden();
      await page.getByRole("button", { name: "Baits", exact: true }).click();
      await expect(style).toHaveValue("Custom tube");
      await type.selectOption("Spoon");
      await expect(style).toBeHidden();
      await expect(rows).toContainText("Green spoon");
      await type.selectOption("Soft Plastic");
      await expect(style).toHaveValue("");
      await expect(rows).toHaveCount(3);
      await style.selectOption("Custom tube");
      await page.locator("#clearGearFilterButton").click();
      await expect(style).toBeHidden();
      await expect(type).toHaveValue("");
      await expect(rows).toHaveCount(5);
      await type.selectOption("Soft Plastic");
      await expect(style).toHaveValue("");
      await expect(rows).toHaveCount(4);
      expect((await readLogbook(page)).lures).toEqual(seed.lures);
    });

    test(`combines lure types with color filters at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const seed = await freshLogbook(page, {
        lures: [
          { id: "green-spoon", name: "Green spoon", type: "Spoon", color: "Green" },
          { id: "blue-spoon", name: "Blue spoon", type: "Spoon", color: "Blue" },
          { id: "green-crank", name: "Green crank", type: "Crankbait", color: "Green" },
          { id: "spinner", name: "Custom spinner", type: "Inline Spinner", color: "Gold" },
          { id: "fly", name: "Green fly", type: "Fly", color: "Green" }
        ],
        flashers: [{ id: "green-paddle", name: "Green paddle", type: "Paddle", color: "Green" }]
      });
      seed.settings.theme = theme;
      await resetLogbook(page, seed);
      await stubExternalApis(page);
      await page.goto("/gear", { waitUntil: "domcontentloaded" });
      const lureType = page.getByRole("combobox", { name: "Lure type", exact: true });
      const visibleRows = page.locator("#baitInventoryTable tbody tr:visible");
      await expect(lureType).toBeVisible();
      await expect(lureType.locator("option")).toHaveText([
        "All types", "Crankbait", "Inline Spinner", "Spoon"
      ]);
      await lureType.selectOption("Spoon");
      await expect(visibleRows).toHaveCount(2);
      await page.locator("#gearFilterField").selectOption("Color");
      await page.locator("#gearFilterQuery").fill("green");
      await expect(visibleRows).toHaveCount(1);
      await expect(visibleRows).toContainText("Green spoon");
      await lureType.selectOption("Crankbait");
      await expect(page.locator("#gearFilterQuery")).toHaveValue("green");
      await expect(visibleRows).toContainText("Green crank");
      await lureType.selectOption("Spoon");
      await page.locator('#baitInventoryTable [data-inventory-sort-index="1"]').click();
      await expect(lureType).toHaveValue("Spoon");
      await expect(visibleRows).toHaveCount(1);
      const controlsBox = await page.locator(".gear-inventory-controls").boundingBox();
      const tableBox = await page.locator("#baitInventoryTable").boundingBox();
      expect(Math.abs(controlsBox.x - tableBox.x)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: test.info().outputPath("lure-type-filter.png") });

      await page.getByRole("button", { name: "Flashers", exact: true }).click();
      await expect(lureType).toBeHidden();
      await expect(page.locator("#flasherInventoryTable tbody tr:visible")).toHaveCount(1);
      await page.getByRole("button", { name: "Baits", exact: true }).click();
      await expect(lureType).toHaveValue("Spoon");
      await expect(visibleRows).toHaveCount(1);
      await lureType.selectOption("");
      await expect(visibleRows).toHaveCount(2);
      await page.locator("#clearGearFilterButton").click();
      await expect(lureType).toHaveValue("");
      await expect(page.locator("#gearFilterQuery")).toHaveValue("");
      await expect(visibleRows).toHaveCount(4);
      await lureType.selectOption("Inline Spinner");
      await expect(visibleRows).toHaveCount(1);
      await expect(visibleRows).toContainText("Custom spinner");
      expect((await readLogbook(page)).lures).toEqual(seed.lures);
      expect(errors).toEqual([]);
    });
  }

  test("creates, edits, and deletes gear through inventory dialogs", async ({ page }) => {
    await resetEmpty(page);
    await page.goto("/gear", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "New Lure", exact: true }).click();
    await page.locator("#lureName").fill("Agent Spoon");
    await page.locator("#lureType").selectOption({ label: "Spoon" });
    await page.locator("#lureColor").fill("Blue Chrome");
    await page.getByRole("button", { name: "Save Lure", exact: true }).click();
    await expect(page.locator("#lureDialog")).toBeHidden();

    await page.getByRole("button", { name: "Flashers", exact: true }).click();
    await page.getByRole("button", { name: "New Flasher", exact: true }).click();
    await page.locator("#flasherName").fill("Green Paddle");
    await page.locator("#flasherType").selectOption({ label: "Paddle" });
    await page.locator("#flasherColor").fill("Green Chrome");
    await page.getByRole("button", { name: "Save Flasher", exact: true }).click();
    await expect(page.locator("#flasherDialog")).toBeHidden();

    await page.getByRole("button", { name: "Reels", exact: true }).click();
    await page.getByRole("button", { name: "New Reel", exact: true }).click();
    await page.locator("#reelShortName").fill("LC 30");
    await page.locator("#reelStyle").selectOption({ label: "Linecounter" });
    await page.locator("#reelBrand").fill("Okuma");
    await page.locator("#reelName").fill("Cold Water");
    await page.locator("#reelQuantityAvailable").fill("1");
    await page.locator("#reelForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#reelDialog")).toBeHidden();

    await page.getByRole("button", { name: "Rods", exact: true }).click();
    await page.getByRole("button", { name: "New Rod", exact: true }).click();
    await page.locator("#rodShortName").fill("DR 8ft");
    await page.locator("#rodType").selectOption({ label: "Downrigging" });
    await page.locator("#rodBrand").fill("Daiwa");
    await page.locator("#rodName").fill("Great Lakes");
    await page.locator("#rodQuantityAvailable").fill("1");
    await page.locator("#rodForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#rodDialog")).toBeHidden();

    await page.getByRole("button", { name: "Combos", exact: true }).click();
    await page.getByRole("button", { name: "New Combo", exact: true }).click();
    await page.locator("#comboShortName").fill("Port rigger");
    await page.locator("#comboRod").selectOption({ index: 1 });
    await page.locator("#comboReel").selectOption({ index: 1 });
    await page.locator("#comboNotes").fill("Default port downrigger combo");
    await page.locator("#comboForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#comboDialog")).toBeHidden();

    let saved = await readLogbook(page);
    expect(saved.lures).toHaveLength(1);
    expect(saved.lures[0]).toMatchObject({ name: "Agent Spoon", type: "Spoon", color: "Blue Chrome" });
    expect(saved.flashers[0]).toMatchObject({ name: "Green Paddle", type: "Paddle", color: "Green Chrome" });
    expect(saved.reels[0]).toMatchObject({ shortName: "LC 30", style: "Linecounter", brand: "Okuma", name: "Cold Water" });
    expect(saved.rods[0]).toMatchObject({ shortName: "DR 8ft", type: "Downrigging", brand: "Daiwa", name: "Great Lakes" });
    expect(saved.rodReelCombos[0]).toMatchObject({
      shortName: "Port rigger",
      rodId: saved.rods[0].id,
      reelId: saved.reels[0].id,
      notes: "Default port downrigger combo"
    });

    await page.getByRole("button", { name: "Baits", exact: true }).click();
    await page.locator(`[data-edit-lure="${saved.lures[0].id}"]`).click();
    await page.locator("#lureName").fill("Renamed Agent Spoon");
    await page.getByRole("button", { name: "Save Lure", exact: true }).click();
    await expect(page.locator("#lureDialog")).toBeHidden();

    await page.getByRole("button", { name: "Flashers", exact: true }).click();
    await page.locator(`[data-edit-flasher="${saved.flashers[0].id}"]`).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#deleteFlasherButton").click();
    await expect(page.locator("#flasherDialog")).toBeHidden();

    saved = await readLogbook(page);
    expect(saved.lures[0].name).toBe("Renamed Agent Spoon");
    expect(saved.flashers).toEqual([]);
  });

  test("converts depth units, stores dark theme, and persists checklist edits", async ({ page }) => {
    await resetEmpty(page, {
      locations: [seededLocation()],
      trips: [{
        id: "trip-depth",
        title: "Depth seed",
        date: "2026-07-01",
        location: "Lake Erie",
        locationId: "loc-lake-erie",
        launchTime: "06:00",
        linesPulledTime: "08:00",
        hours: 2,
        targetSpecies: "Walleye",
        method: "Casting",
        structure: "100 ft",
        people: [{ id: "person-depth", name: "Depth Tester" }],
        gearUsed: [],
        catches: [{
          id: "catch-depth",
          personId: "person-depth",
          species: "Walleye",
          time: "07:00",
          waterDepth: "60 ft",
          depthDown: "30 ft",
          photos: []
        }],
        lostFish: []
      }]
    });
    await page.goto("/settings", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "Measurements", exact: true }).click();
    await page.locator('[data-unit-setting="depth"]').selectOption("m");
    await expect(page.locator("#settingsSaveStatus")).toHaveText("Saved");

    let saved = await readLogbook(page);
    expect(saved.settings.units.depth).toBe("m");
    expect(saved.trips[0].structure).toBe("30.48 m");
    expect(saved.trips[0].catches[0].waterDepth).toBe("18.288 m");
    expect(saved.trips[0].catches[0].depthDown).toBe("9.144 m");

    await page.getByRole("button", { name: "General", exact: true }).click();
    await page.locator('input[name="themeChoice"][value="dark"]').check();
    await expect(page.locator("#settingsSaveStatus")).toHaveText("Saved");
    saved = await readLogbook(page);
    expect(saved.settings.theme).toBe("dark");

    await page.goto("/checklists", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "New Checklist", exact: true }).click();
    await page.locator(".checklist-name").fill("Trip Prep");
    await page.getByRole("button", { name: "Add Item", exact: true }).click();
    await page.locator(".checklist-item-label").fill("Bring net");
    await expect.poll(async () => (await readLogbook(page)).settings.checklists?.[0]?.items?.[0]?.label).toBe("Bring net");

    await page.locator(".checklist-name").fill("Tournament Prep");
    await page.locator(".checklist-item-label").fill("Bring landing net");
    await expect.poll(async () => {
      const checklist = (await readLogbook(page)).settings.checklists?.[0];
      return `${checklist?.name}|${checklist?.items?.[0]?.label}`;
    }).toBe("Tournament Prep|Bring landing net");
  });

  test("editing a reel updates the active line while preserving older lineHistory entries", async ({ page }) => {
    await resetEmpty(page, {
      reels: [{
        id: "reel-history",
        shortName: "LC 30",
        style: "Linecounter",
        brand: "Okuma",
        name: "Cold Water",
        lineHistory: [
          { id: "line-old", spooledDate: "2024-01-01", type: "Mono", brand: "Berkley", weight: "20", notes: "older spool" },
          { id: "line-active", spooledDate: "2025-01-01", type: "Braid", brand: "PowerPro", weight: "30" }
        ]
      }]
    });
    await page.goto("/gear", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "Reels", exact: true }).click();
    await page.locator('[data-edit-reel="reel-history"]').click();
    await page.locator("#reelLineRows .line-weight").fill("40");
    await page.locator("#reelLineRows .line-notes").fill("fresh braid");
    await page.locator("#reelForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#reelDialog")).toBeHidden();

    const reel = (await readLogbook(page)).reels.find((item) => item.id === "reel-history");
    expect(reel.lineHistory).toHaveLength(2);
    expect(reel.lineHistory.find((line) => line.id === "line-old")).toMatchObject({ weight: "20", notes: "older spool" });
    expect(reel.lineHistory.find((line) => line.id === "line-active")).toMatchObject({ weight: "40", notes: "fresh braid" });
  });

  test("gear dialogs save from drafts and preserve untouched gear data", async ({ page }) => {
    const seed = {
      lures: [
        {
          id: "lure-authority",
          name: "Original Spoon",
          type: "Spoon",
          color: "Green",
          spoonSize: "Mag",
          media: [{ id: "photo-1", category: "lures", filename: "one.jpg", caption: "front" }],
          additive: { mobile: true }
        },
        { id: "lure-other", name: "Other Spoon", type: "Spoon", color: "Blue", mobileOnly: "keep" }
      ],
      flashers: [{ id: "flasher-other", name: "Other Paddle", type: "Paddle", additive: true }],
      reels: [{
        id: "reel-other",
        shortName: "Other Reel",
        quantityAvailable: "2",
        lineHistory: [
          { id: "old-line", spooledDate: "2024-01-01", type: "Mono", weight: "20" },
          { id: "new-line", spooledDate: "2025-01-01", type: "Braid", weight: "30" }
        ]
      }],
      rods: [{ id: "rod-other", shortName: "Other Rod", quantityAvailable: "3" }],
      rodReelCombos: [{ id: "combo-other", shortName: "Other Combo", rodId: "rod-other", reelId: "reel-other" }]
    };
    await resetEmpty(page, seed);
    await page.goto("/gear", { waitUntil: "domcontentloaded" });

    await page.locator('[data-edit-lure="lure-authority"]').click();
    await page.locator("#lureName").first().evaluate((element) => { element.value = "Silent Spoon"; });
    await page.getByRole("button", { name: "Save Lure", exact: true }).click();
    await expect(page.locator("#lureDialog")).toBeHidden();
    expect((await readLogbook(page)).lures.find((item) => item.id === "lure-authority").name).toBe("Original Spoon");

    await page.locator('[data-edit-lure="lure-authority"]').click();
    await page.locator("#lureName").fill("Typed Spoon");
    await page.getByRole("button", { name: "Save Lure", exact: true }).click();
    await expect(page.locator("#lureDialog")).toBeHidden();
    expect((await readLogbook(page)).lures.find((item) => item.id === "lure-authority").name).toBe("Typed Spoon");

    const before = await readLogbook(page);
    const beforeLure = before.lures.find((item) => item.id === "lure-authority");
    await page.locator('[data-edit-lure="lure-authority"]').click();
    await page.locator("#lureColor").fill("Green Glow");
    await page.getByRole("button", { name: "Save Lure", exact: true }).click();
    await expect(page.locator("#lureDialog")).toBeHidden();

    const after = await readLogbook(page);
    expect(after.lures.find((item) => item.id === "lure-authority")).toEqual({ ...beforeLure, color: "Green Glow" });
    expect(after.lures.find((item) => item.id === "lure-other")).toEqual(before.lures.find((item) => item.id === "lure-other"));
    expect(after.flashers).toEqual(before.flashers);
    expect(after.reels).toEqual(before.reels);
    expect(after.rods).toEqual(before.rods);
    expect(after.rodReelCombos).toEqual(before.rodReelCombos);
  });
});
