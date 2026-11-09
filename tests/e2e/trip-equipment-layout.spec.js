const { expect, test } = require("@playwright/test");
const { fillDate, freshLogbook, resetLogbook, seededLocation, stubExternalApis } = require("./helpers");

async function openCastingCatch(page, overrides = {}) {
  await resetLogbook(page, await freshLogbook(page, { locations: [seededLocation()], ...overrides }));
  await stubExternalApis(page);
  await page.goto("/trips");
  await page.getByRole("button", { name: "New Trip", exact: true }).click();
  await fillDate(page, "#tripDate", "10/05/2026");
  await page.locator("#tripLocation").selectOption("loc-lake-erie");
  await page.locator("#method").selectOption({ label: "Casting" });
  await page.getByRole("button", { name: "Add Catch", exact: true }).click();
  return page.locator("#catchRows .catch-row").last();
}

test("groups the catch editor panels and keeps equipment usable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1365, height: 960 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const row = await openCastingCatch(page);
  const panels = await row.locator(".catch-basic-panel, .catch-photos-panel, .catch-location-section, .catch-equipment-panel, .catch-details-panel, .catch-notes-panel").evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, width: box.width };
  }));

  expect(panels).toHaveLength(6);
  expect(panels[0].top).toBe(panels[1].top);
  expect(panels[1].left).toBeGreaterThan(panels[0].right);
  expect(panels[2].top).toBeGreaterThan(panels[0].top);
  expect(panels[3].top).toBe(panels[4].top);
  expect(panels[5].top).toBeGreaterThan(panels[3].top);
  await expect(row.locator(".catch-rod-field")).toBeVisible();
  await expect(row.locator(".catch-lure-field")).toBeVisible();
  await expect(row.locator(".catch-retrieve-field")).toBeVisible();
  const equipment = row.locator(".catch-equipment-grid");
  expect(await equipment.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
  await row.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath("trip-catch-equipment-desktop.png") });

  await row.locator(".catch-details-unknown").check();
  await expect(row.locator(".catch-equipment-panel")).toBeHidden();
  await expect(row.locator(".catch-notes-panel")).toBeHidden();
  await row.locator(".catch-details-unknown").uncheck();
  await expect(row.locator(".catch-equipment-panel")).toBeVisible();
  await expect(row.locator(".catch-notes-panel")).toBeVisible();
});

test("stacks casting catch equipment controls on a narrow screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const row = await openCastingCatch(page);
  const equipment = row.locator(".catch-equipment-grid");
  await expect(equipment).toBeVisible();
  await equipment.scrollIntoViewIfNeeded();

  const controls = row.locator(".catch-rod-field, .catch-lure-field, .add-lure-inline, .catch-retrieve-field");
  await expect.poll(async () => {
    const mobileBoxes = await controls.evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { top: box.top, right: box.right };
    }));
    return mobileBoxes.length === 4 && mobileBoxes.every((box) => box.right <= 390);
  }).toBe(true);

  const mobileBoxes = await controls.evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { top: box.top, right: box.right };
  }));

  expect(mobileBoxes.map((box) => box.top)).toEqual([...mobileBoxes].sort((a, b) => a - b).map((box) => box.top));
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath("trip-catch-equipment-mobile.png") });
});

test("the selected lure thumbnail opens the lure card separately from the picker", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const imagePath = "/uploads/lures/_previews/paddletail.jpg";
  await page.route(`**${imagePath}`, (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="white"/></svg>'
  }));
  const row = await openCastingCatch(page, {
    lures: [{
      id: "paddletail", name: "Paddletail", type: "Soft Plastic", color: "White",
      media: [{ id: "paddletail-photo", category: "lures", filename: "paddletail-original.jpg", previewFilename: "paddletail.jpg" }]
    }]
  });
  const field = row.locator(".catch-lure-field");
  const trigger = field.locator(".gear-picker-trigger");
  await trigger.click();
  await field.getByRole("option", { name: /Soft Plastic/ }).click();
  await field.getByRole("option", { name: /Paddletail/ }).click();
  const lureControls = row.locator(".catch-lure-field .gear-picker-trigger, .add-lure-inline, .catch-rigging, .catch-rigging-details");
  const controlBoxes = () => lureControls.evaluateAll((nodes) => nodes.map((node) => {
    const { left, right, top, height } = node.getBoundingClientRect();
    return { left, right, top, height };
  }));
  const narrow = await controlBoxes();
  expect(narrow[2].top).toBeGreaterThan(narrow[0].top);
  expect(narrow[3].top).toBeGreaterThan(narrow[2].top);

  await page.setViewportSize({ width: 1365, height: 960 });
  await expect.poll(async () => {
    const wide = await controlBoxes();
    return wide.length === 4 && wide.every((control, index) => (
      Math.abs(control.top - wide[0].top) < 1
      && Math.abs(control.height - wide[0].height) < 1
      && (index === 0 || control.left >= wide[index - 1].right)
    ));
  }).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });

  const thumbnail = field.getByRole("button", { name: "Open lure card for Paddletail - White" });
  const thumbnailWidth = (await thumbnail.boundingBox()).width;
  await thumbnail.locator("img").click();

  const card = page.getByRole("dialog", { name: "Paddletail" });
  const image = card.locator("img");
  await expect(image).toHaveAttribute("src", imagePath);
  await expect(image).toHaveJSProperty("naturalWidth", 240);
  expect((await image.boundingBox()).width).toBeGreaterThan(thumbnailWidth);
  await expect(card.getByText("Soft Plastic", { exact: true })).toBeVisible();
  await expect(card.getByText("White", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(thumbnail).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await thumbnail.press("Enter");
  await card.getByRole("button", { name: "Edit Lure", exact: true }).click();
  const editor = page.locator("#lureDialog");
  await expect(editor.locator("#lureName")).toHaveValue("Paddletail");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(thumbnail).toBeVisible();
  await trigger.click();
  await field.getByRole("option", { name: "Clear selection" }).click();
  await expect(thumbnail).toBeHidden();
});
