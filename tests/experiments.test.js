import assert from "node:assert/strict";
import test from "node:test";
import { experimentResults, experimentValidationError, setExperimentVariant, tripExperimentIds } from "../static/js/experiments-model.js";
import { defaultLogbook, validateLogbook } from "../static/js/generated/logbook-schema-rules.js";

const experiment = {
  id: "blades", name: "Spinner blades",
  variants: [{ id: "control", name: "Control" }, { id: "test", name: "Test" }]
};
const line = (id, variantId, startTime, endTime) => ({
  id, startTime, endTime,
  experimentAssignments: [{ experimentId: "blades", variantId }]
});
const logbook = () => ({
  ...structuredClone(defaultLogbook), experiments: [structuredClone(experiment)], lures: [{ id: "spoon", name: "Blue spoon" }],
  trips: [{
    id: "trip", date: "2026-10-30",
    gearUsed: [line("overnight", "control", "23:30", "01:30"), line("second", "control", "23:30", "00:30"),
      line("no-bites", "test", "23:30", "01:30"), line("open", "control", "01:30", ""), line("invalid", "control", "25:00", "01:30")],
    catches: [{ id: "catch", setupLineId: "overnight", setupLineTarget: "cheater", quantity: 3 },
      { id: "open-catch", setupLineId: "open" }, { id: "unlinked", quantity: 50 }],
    lostFish: [{ id: "missed", setupLineId: "overnight", possibleSpecies: "Salmon" }]
  }]
});

test("combines selected experiments with assignments independently", () => {
  assert.deepEqual(tripExperimentIds({ experimentIds: ["blades", "speed"],
    gearUsed: [{ experimentAssignments: [{ experimentId: "blades" }, { experimentId: "depth" }] }]
  }), ["blades", "speed", "depth"]);
});

test("compares variants using measured rod-hours and keeps incomplete outcomes in total counts", () => {
  const book = logbook();
  assert.equal(validateLogbook(book).valid, true);
  const [control, trial] = experimentResults(book, book.experiments[0]);
  assert.equal(control.hours, 3);
  assert.equal(control.landed, 4);
  assert.equal(control.missed, 1);
  assert.equal(control.landedRate, 1);
  assert.equal(control.strikeRate, 4 / 3);
  assert.equal(control.percentLanded, 80);
  assert.equal(control.untimed, 2);
  assert.equal(trial.hours, 2);
  assert.equal(trial.landedRate, 0);
  assert.equal(trial.percentLanded, null);

  book.trips[0].catches[0].setupLineId = "no-bites";
  assert.equal(experimentResults(book, book.experiments[0])[1].landedRate, 1.5);
});

test("validates multiple experiments, variant references and one assignment per experiment", () => {
  const book = logbook();
  book.experiments.push({ id: "speed", name: "Speed", variants: [{ id: "slow", name: "Slow" }, { id: "fast", name: "Fast" }] });
  const trip = book.trips[0];
  trip.experimentIds = ["blades", "speed"];
  const setup = trip.gearUsed[0];
  const assignments = setExperimentVariant(setup.experimentAssignments, "speed", "slow");
  setup.experimentAssignments = assignments;
  assert.equal(validateLogbook(book).valid, true);
  assert.deepEqual(experimentResults(book, book.experiments[1]).map(row => row.landed), [3, 0]);
  assert.deepEqual(setExperimentVariant(assignments, "speed", ""), [assignments[0]]);
  trip.experimentIds = ["blades", "missing"];
  assert.match(experimentValidationError(book), /experimentIds\[1\]: must reference an experiment/);
  trip.experimentIds = ["blades", "blades"];
  assert.equal(validateLogbook(book).valid, false);
  trip.experimentIds = ["blades", "speed"];
  setup.experimentAssignments = setExperimentVariant(assignments, "speed", "control");
  assert.match(validateLogbook(book).error, /variantId/);
  setup.experimentAssignments = [...assignments, ...assignments];
  assert.match(validateLogbook(book).error, /unique experiment/);
});

test("requires at least two distinct variants", () => {
  const book = logbook();
  book.experiments[0].variants.pop();
  assert.equal(validateLogbook(book).valid, false);
  book.experiments[0].variants.push({ id: "other", name: "control" });
  assert.match(validateLogbook(book).error, /variants.*must be unique/);
});
