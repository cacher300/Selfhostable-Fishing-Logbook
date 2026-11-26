const { expect, test } = require("@playwright/test");
const { freshLogbook, readLogbook, resetLogbook, seededLocation, stubExternalApis } = require("./helpers");

test("compares experimental deployments and links back to the source trip", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const location = seededLocation();
  await resetLogbook(page, await freshLogbook(page, {
    experiments: [],
    locations: [location],
    trips: [{
      id: "experiment-trip", title: "Blade test trip", date: "2026-10-20", method: "Trolling",
      targetSpecies: "Walleye", location: location.name, locationId: location.id, launch: location.launches[0].name,
      launchId: location.launches[0].id, launchTime: "08:00", linesPulledTime: "10:00",
      gearUsed: [{ id: "test-rod", startTime: "08:00", endTime: "10:00", presentation: "downrigger" }],
      catches: [{ id: "landed", species: "Walleye", quantity: 2, setupLineId: "test-rod", time: "09:00" }],
      lostFish: [{ id: "missed", possibleSpecies: "Walleye", setupLineId: "test-rod", time: "09:15" }]
    }]
  }));
  await stubExternalApis(page);
  await page.goto("/experiments");
  await page.getByRole("button", { name: "New experiment" }).click();
  const experimentEditor = page.locator("#experimentEditor");
  await experimentEditor.getByLabel("Experiment name").fill("Blade finish");
  await experimentEditor.getByLabel("Variant 1").fill("Silver");
  await experimentEditor.getByLabel("Variant 2").fill("Gold");
  await experimentEditor.getByRole("button", { name: "Add variant" }).click();
  await experimentEditor.getByLabel("Variant 3").fill("Copper");
  await expect(experimentEditor.getByRole("button", { name: /Add .* field/i })).toHaveCount(0);
  const editorWidth = await experimentEditor.evaluate(element => element.clientWidth);
  const variantWidth = await experimentEditor.getByLabel("Variant 1").evaluate(element => element.getBoundingClientRect().width);
  const buttonWidth = await experimentEditor.getByRole("button", { name: "Add variant" }).evaluate(element => element.getBoundingClientRect().width);
  expect(variantWidth).toBeLessThan(editorWidth / 2);
  expect(buttonWidth).toBeLessThan(editorWidth / 2);
  await page.getByRole("button", { name: "Save experiment" }).click();
  await expect(page.getByRole("heading", { name: "Blade finish" })).toBeVisible();
  const [experiment] = (await readLogbook(page)).experiments;

  await page.getByRole("button", { name: "Trips", exact: true }).click();
  await page.getByText("Blade test trip", { exact: true }).click();
  await page.locator("#tripSummaryDialog").getByRole("button", { name: "Edit trip", exact: true }).click();
  await page.locator("#addExperimentFromTripButton").click();
  const quickCreate = page.locator("#experimentQuickCreateDialog");
  await quickCreate.getByLabel("Experiment name").fill("Trolling speed");
  await quickCreate.getByLabel("Variant 1").fill("Slow");
  await quickCreate.getByLabel("Variant 2").fill("Fast");
  await quickCreate.getByRole("button", { name: "Add variant" }).click();
  await quickCreate.getByLabel("Variant 3").fill("Medium");
  await quickCreate.getByRole("button", { name: "Create experiment" }).click();
  await expect(quickCreate).toBeHidden();
  const tripCreatedExperiment = (await readLogbook(page)).experiments.find(item => item.name === "Trolling speed");
  expect(tripCreatedExperiment.variants).toHaveLength(3);
  const picker = page.locator("#tripExperiment");
  await picker.locator("summary").click();
  await expect(picker.getByRole("checkbox", { name: "Trolling speed" })).toBeChecked();
  expect(await picker.getByRole("checkbox", { name: "Trolling speed" }).evaluate(input => input.offsetWidth)).toBeLessThan(30);
  await picker.getByRole("checkbox", { name: "Blade finish" }).check();
  await picker.getByRole("checkbox", { name: "Trolling speed" }).uncheck();
  await picker.getByRole("checkbox", { name: "Trolling speed" }).check();
  await picker.locator("summary").click();
  const rod = page.locator("#tripDialog .gear-used-row").first();
  const expand = rod.locator("[data-toggle-row]");
  if (await expand.getAttribute("aria-expanded") === "false") await expand.click();
  const bladeSetup = rod.locator(".experiment-assignment-list fieldset").filter({ hasText: "Blade finish" });
  const speedSetup = rod.locator(".experiment-assignment-list fieldset").filter({ hasText: "Trolling speed" });
  await bladeSetup.getByLabel("Variant").selectOption({ label: "Gold" });
  await speedSetup.getByLabel("Variant").selectOption({ label: "Slow" });
  page.on("dialog", dialog => dialog.accept());
  await page.locator("#tripDialog [data-trip-save]").first().click();
  await expect(page.locator("#tripDialog")).toBeHidden();
  const savedTrip = (await readLogbook(page)).trips[0];
  expect(savedTrip.experimentIds).toEqual([experiment.id, tripCreatedExperiment.id]);
  expect(savedTrip.gearUsed[0].experimentAssignments).toEqual([
    { experimentId: experiment.id, variantId: experiment.variants[1].id },
    { experimentId: tripCreatedExperiment.id, variantId: tripCreatedExperiment.variants[0].id }
  ]);
  await page.locator("#tripSummaryDialog").getByLabel("Close", { exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Experiments", exact: true }).click();
  const variant = page.getByRole("region", { name: "Gold", exact: true });
  await expect(variant.locator(".experiment-metrics dd")).toHaveText(["2", "2", "1", "1", "1.5", "66.67%"]);
  await variant.getByText("Deployments").click();
  await expect(page.getByRole("region", { name: "Slow", exact: true }).locator(".experiment-metrics dd")).toHaveText(["2", "2", "1", "1", "1.5", "66.67%"]);
  await expect(variant.getByText(/Missed · 1 × Walleye/)).toBeVisible();
  await variant.getByRole("button", { name: /Blade test trip/i }).click();
  await expect(page.locator("#tripSummaryDialog")).toBeVisible();
  expect(errors).toEqual([]);
});
