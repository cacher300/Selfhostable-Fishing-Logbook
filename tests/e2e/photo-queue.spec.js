const { expect, test } = require("@playwright/test");
const { stubExternalApis } = require("./helpers");

test.use({ viewport: { width: 390, height: 844 } });

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=",
  "base64"
);

test("shows a saved photo while the rest of the batch is uploading", async ({ page }) => {
  await stubExternalApis(page);
  const failedUpload = Promise.withResolvers();
  await page.route("**/api/uploads/queue", async (route) => {
    if (!route.request().postDataBuffer().includes('filename="interrupted.png"')) {
      await route.continue();
      return;
    }
    await failedUpload.promise;
    await route.abort("connectionreset");
  });
  let listRequests = 0;
  await page.route("**/api/photo-queue", (route) => {
    listRequests += 1;
    return route.continue();
  });

  await page.goto("/settings");
  await page.getByRole("button", { name: "Photo Queue", exact: true }).click();
  const queue = page.getByRole("dialog", { name: "Photo Queue" });
  const input = queue.locator("#photoQueueInput");
  const cards = queue.locator("[data-queue-photo]");
  await expect(queue.locator("#photoQueueStatus")).toHaveText("0 queued photos");

  await input.setInputFiles([
    { name: "saved.png", mimeType: "image/png", buffer: pixel },
    { name: "interrupted.png", mimeType: "image/png", buffer: pixel }
  ]);
  try {
    await expect(cards).toHaveCount(1);
    await expect(cards.locator("img")).toHaveJSProperty("naturalWidth", 1);
    await expect(input).toBeDisabled();
  } finally {
    failedUpload.resolve();
  }
  await expect(queue.locator("#photoQueueUploadStatus")).toContainText("1 of 2 uploads could not be confirmed");
  await expect(input).toBeEnabled();
  await expect(cards).toHaveCount(1);
  expect(listRequests).toBe(1);

  await queue.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: "Photo Queue", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await cards.getByRole("button", { name: "Remove queued photo" }).click();
  await expect(queue.locator("#photoQueueStatus")).toHaveText("0 queued photos");
});

test("keeps a confirmed upload visible when the queue list fails", async ({ page }) => {
  await stubExternalApis(page);
  const failedList = Promise.withResolvers();
  await page.route("**/api/photo-queue", async (route) => {
    await failedList.promise;
    await route.abort("connectionreset");
  }, { times: 1 });

  await page.goto("/settings");
  const openQueue = page.getByRole("button", { name: "Photo Queue", exact: true });
  await openQueue.click();
  const queue = page.getByRole("dialog", { name: "Photo Queue" });
  const cards = queue.locator("[data-queue-photo]");

  try {
    await expect(queue.locator("#photoQueueStatus")).toHaveText("Loading queue…");
    await queue.locator("#photoQueueInput").setInputFiles({
      name: "saved.png", mimeType: "image/png", buffer: pixel
    });
    await expect(cards).toHaveCount(1);
    await expect(queue.locator("#photoQueueUploadStatus")).toBeEmpty();
  } finally {
    failedList.resolve();
  }
  await expect(queue.locator("#photoQueueStatus")).toContainText("Could not load the queue");
  await expect(cards).toHaveCount(1);

  await queue.getByRole("button", { name: "Close", exact: true }).last().click();
  await openQueue.click();
  await expect(queue.locator("#photoQueueStatus")).toHaveText("1 queued photo");
  await cards.getByRole("button", { name: "Remove queued photo" }).click();
  await expect(queue.locator("#photoQueueStatus")).toHaveText("0 queued photos");
});
