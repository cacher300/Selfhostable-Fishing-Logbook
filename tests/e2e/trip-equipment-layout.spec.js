const { expect, test } = require("@playwright/test");

async function openCastingCatch(page) {
  await page.goto("/trips");
  await page.getByRole("button", { name: "New Trip", exact: true }).click();
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
