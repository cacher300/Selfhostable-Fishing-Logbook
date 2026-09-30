const { expect, test } = require("@playwright/test");
const { freshLogbook, readLogbook, resetLogbook } = require("./helpers");
const defaultLogbook = require("../../schema/default-logbook.json");

async function resetWith(page) {
  const base = await freshLogbook(page);
  await resetLogbook(page, {
    ...base,
    species: ["Walleye", "Perch"],
    settings: {
      ...base.settings,
      checklists: [{
        id: "check-1",
        name: "Launch",
        items: [{ id: "item-1", label: "Charge batteries", done: false }]
      }],
      chopRanges: [
        { id: "calm", label: "Calm", maxFeet: 1 },
        { id: "rough", label: "Rough", maxFeet: null }
      ]
    }
  });
}

async function waitForSave() {
  await new Promise((resolve) => setTimeout(resolve, 900));
}

test.describe("settings drafts are save authority", () => {
  test.setTimeout(60_000);
  test.afterEach(async ({ page }) => {
    const clean = await freshLogbook(page);
    await resetLogbook(page, {
      ...clean,
      species: structuredClone(defaultLogbook.species),
      settings: {
        ...clean.settings,
        speciesMapColors: structuredClone(defaultLogbook.settings.speciesMapColors || {}),
        chopRanges: clean.settings.chopRanges
      }
    });
  });

  test("opening settings tabs and checklists does not write the logbook", async ({ page }) => {
    await resetWith(page);
    const before = await readLogbook(page);
    const writes = [];
    page.on("request", (request) => {
      if (["POST", "PUT"].includes(request.method()) && request.url().includes("/api/logbook")) writes.push(`${request.method()} ${request.url()}`);
    });
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    for (const tab of ["general", "map-pins", "trolling-spread", "saved-setups", "measurements", "fow-calibration", "lists", "waterbodies"]) {
      await page.locator(`[data-settings-tab="${tab}"]`).click();
    }
    await page.locator("#checklistsViewButton").click();
    expect(await readLogbook(page)).toEqual(before);
    expect(writes).toEqual([]);
  });

  test("silent DOM writes are ignored for predefined lists, chop ranges, and checklists", async ({ page }) => {
    await resetWith(page);
    await page.goto("/settings", { waitUntil: "domcontentloaded" });

    await page.locator('[data-settings-tab="lists"]').click();
    await page.locator('[data-predefined-key="species"]').evaluate((details) => { details.open = true; });
    await page.evaluate(() => {
      document.querySelector('[data-predefined-key="species"] .predefined-option-label').value = "Silent species";
    });
    await page.locator('[data-predefined-key="species"] .add-predefined-option').click();
    await waitForSave();
    expect((await readLogbook(page)).species[0]).toBe("Walleye");

    await page.locator('[data-predefined-key="species"] .predefined-option-label').first().fill("Normal species");
    await waitForSave();
    await expect(page.locator("#settingsSaveStatus")).toHaveText(/Saved|Autosave on/);
    expect((await readLogbook(page)).species[0]).toBe("Normal species");

    await resetWith(page);
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await page.locator('[data-settings-tab="measurements"]').click();
    await page.locator("#editChopRangesButton").click();
    await page.evaluate(() => {
      document.querySelector(".chop-range-label").value = "Silent chop";
    });
    await page.locator("#editChopRangesButton").click();
    expect((await readLogbook(page)).settings.chopRanges[0].label).toBe("Calm");

    await page.locator("#editChopRangesButton").click();
    await page.locator(".chop-range-label").first().fill("Normal chop");
    await page.locator("#editChopRangesButton").click();
    await waitForSave();
    expect((await readLogbook(page)).settings.chopRanges[0].label).toBe("Normal chop");

    await resetWith(page);
    await page.goto("/checklists", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      document.querySelector(".checklist-item-label").value = "Silent checklist";
    });
    await page.locator("[data-duplicate-checklist]").click();
    await waitForSave();
    expect((await readLogbook(page)).settings.checklists[0].items[0].label).toBe("Charge batteries");

    await page.locator(".checklist-item-label").first().fill("Normal checklist");
    await waitForSave();
    await expect(page.locator(".checklist-save-status").first()).toHaveText("Saved");
    expect((await readLogbook(page)).settings.checklists[0].items[0].label).toBe("Normal checklist");
  });

  test("editing one settings field leaves the rest of the document deep-equal", async ({ page }) => {
    await resetWith(page);
    const before = await readLogbook(page);
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await page.locator('[data-settings-tab="lists"]').click();
    await page.locator('[data-predefined-key="species"]').evaluate((details) => { details.open = true; });
    await page.locator('[data-predefined-key="species"] .predefined-option-label').first().fill("Solo edit");
    await waitForSave();
    const after = await readLogbook(page);
    expect(after.species[0]).toBe("Solo edit");
    const normalizedBefore = { ...before, species: ["Solo edit", ...before.species.slice(1)] };
    expect(after).toEqual(normalizedBefore);
  });
});
