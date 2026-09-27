const { expect, test } = require("@playwright/test");

async function openCastingCatch(page) {
  await page.goto("/trips");
  await page.getByRole("button", { name: "New Trip", exact: true }).click();
  await page.locator("#method").selectOption({ label: "Casting" });
  await page.getByRole("button", { name: "Add Catch", exact: true }).click();
  return page.locator("#catchRows .catch-row").last();
}

test("keeps casting catch equipment controls grouped", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const row = await openCastingCatch(page);
  const equipment = row.locator(".catch-equipment-grid");
  const boxes = await row.locator(".catch-rod-field, .catch-lure-field, .add-lure-inline, .catch-retrieve-field").evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, width: box.width };
  }));

  expect(boxes).toHaveLength(4);
  expect(boxes[1].left - boxes[0].right).toBeLessThanOrEqual(16);
  expect(boxes[2].left - boxes[1].right).toBeLessThanOrEqual(24);
  expect(boxes[3].left - boxes[2].right).toBeLessThanOrEqual(16);
  expect(pageErrors).toEqual([]);
});

test("stacks casting catch equipment controls on a narrow screen", async ({ page }) => {
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
});
