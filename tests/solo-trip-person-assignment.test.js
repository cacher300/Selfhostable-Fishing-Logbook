const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const source = fs.readFileSync("static/js/trip-editor.js", "utf8");
const match = source.match(/function populatePersonSelect\(select, selectedId = ""\) \{[\s\S]*?\n\}/);
assert(match, "populatePersonSelect should be defined");

const context = {
  syncPersonRowIds: () => {},
  mergePeople: (people) => people,
  collectPeople: () => context.people,
  escapeHtml: (value) => value
};
vm.createContext(context);
vm.runInContext(match[0], context);

function selectStub() {
  return { innerHTML: "", value: "" };
}

context.people = [{ id: "alex", name: "Alex" }];
const soloSelect = selectStub();
context.populatePersonSelect(soloSelect);
assert.equal(soloSelect.value, "alex", "a solo trip person is assigned automatically");

context.people = [{ id: "alex", name: "Alex" }, { id: "sam", name: "Sam" }];
const groupSelect = selectStub();
context.populatePersonSelect(groupSelect);
assert.equal(groupSelect.value, "", "a multi-person trip leaves a new catch unassigned");

const assignedSelect = selectStub();
context.populatePersonSelect(assignedSelect, "sam");
assert.equal(assignedSelect.value, "sam", "an explicit catch assignment is preserved");
