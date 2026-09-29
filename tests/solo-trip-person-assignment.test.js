import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { els } = await import("../static/js/app-elements.js");
const { setState } = await import("../static/js/app-state.js");
const { populatePersonSelect } = await import("../static/js/trip-editor.js");

function setPeople(people) {
  setState({ people });
  els.personRows = {
    querySelectorAll: () => people.map((person) => ({
      dataset: { personId: person.id },
      querySelector(selector) {
        if (selector === ".person-select") return { value: person.id, selectedOptions: [{ textContent: person.name }] };
        if (selector === ".person-name") return { value: person.name };
        return null;
      },
    })),
  };
}

function selectStub() {
  return { innerHTML: "", value: "" };
}

setPeople([{ id: "alex", name: "Alex" }]);
const soloSelect = selectStub();
populatePersonSelect(soloSelect);
assert.equal(soloSelect.value, "alex", "a solo trip person is assigned automatically");

setPeople([{ id: "alex", name: "Alex" }, { id: "sam", name: "Sam" }]);
const groupSelect = selectStub();
populatePersonSelect(groupSelect);
assert.equal(groupSelect.value, "", "a multi-person trip leaves a new catch unassigned");

const assignedSelect = selectStub();
populatePersonSelect(assignedSelect, "sam");
assert.equal(assignedSelect.value, "sam", "an explicit catch assignment is preserved");
