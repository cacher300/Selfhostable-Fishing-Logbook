const { expect, test } = require("@playwright/test");

test("home launch designation is shared with the saved waterbody and protected from deletion", async ({ page }) => {
  const current = await page.request.get("/api/logbook");
  const document = await current.json();
  document.locations = [{ id: "lake", name: "Lake Ontario", launches: [
    { id: "home", name: "Offshore home", coordinates: { latitude: 43.7, longitude: -77.6 } },
    { id: "inland", name: "Inland point", coordinates: { latitude: 40, longitude: -75 } },
  ] }];
  document.trips = [];
  delete document.settings.homePort;
  const csrf = await (await page.request.get("/api/csrf-token")).json();
  const saved = await page.request.put("/api/logbook", { headers: { "Content-Type": "application/json", "If-Match": current.headers().etag, "X-CSRF-Token": csrf.csrfToken || csrf.csrf_token || csrf.token }, data: document });
  expect(saved.ok()).toBeTruthy();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Waterbodies", exact: true }).click();
  page.once("dialog", async dialog => { expect(dialog.message()).toContain("at least 1 km offshore"); await dialog.accept(); });
  await page.locator('[data-home-launch="inland"]').click();
  await page.locator('[data-home-launch="home"]').click();
  await expect.poll(async () => (await (await page.request.get("/api/logbook")).json()).settings.homePort).toEqual({ locationId: "lake", launchId: "home" });
  await page.locator('[data-edit-managed-launch="home"]').click();
  page.once("dialog", async dialog => { expect(dialog.message()).toContain("home port"); await dialog.accept(); });
  await page.locator("#deleteLocationDialogButton").click();
  await page.locator('#locationDialog [aria-label="Close"]').click();
  await page.locator('[data-home-launch="home"]').click();
  await expect.poll(async () => (await (await page.request.get("/api/logbook")).json()).settings.homePort).toBeUndefined();
});
