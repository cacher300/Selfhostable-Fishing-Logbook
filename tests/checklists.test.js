import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { els } = await import("../static/js/app-elements.js");
const appState = await import("../static/js/app-state.js");
const { checklistsFromDraftState, savedChecklists } = await import("../static/js/checklists.js");
const { settingsUi } = await import("../static/js/settings-core.js");

const original = [{
  id: "launch",
  name: "Launch Day",
  syncTag: "mobile",
  items: [{ id: "battery", label: "Charge batteries", done: true, icon: "battery" }],
}];
const card = {
  dataset: { checklistId: "launch" },
  querySelector(selector) {
    if (selector === ".checklist-name") return { value: "Launch Day" };
    return null;
  },
  querySelectorAll(selector) {
    if (selector !== ".checklist-item") return [];
    return [{
      dataset: { checklistItemId: "battery" },
      querySelector(field) {
        if (field === ".checklist-item-label") return { value: "Charge batteries" };
        if (field === ".checklist-item-done") return { checked: true };
        return null;
      },
    }, {
      dataset: { checklistItemId: "draft" },
      querySelector(field) {
        if (field === ".checklist-item-label") return { value: "   " };
        if (field === ".checklist-item-done") return { checked: false };
        return null;
      },
    }];
  },
};
appState.setState({ settings: { checklists: original } });
els.checklistList = { querySelectorAll: (selector) => (selector === ".checklist-card" ? [card] : []) };
settingsUi.checklistsDraft = structuredClone(original);

assert.strictEqual(savedChecklists(), original, "reading checklists must not replace or reshape state");
const collected = structuredClone(checklistsFromDraftState());
assert.equal(collected[0].syncTag, "mobile");
assert.equal(collected[0].items[0].icon, "battery");
assert.equal(collected[0].items.length, 1, "blank checklist drafts must not be persisted");
assert.deepEqual(appState.state.settings.checklists, [{
  id: "launch", name: "Launch Day", syncTag: "mobile",
  items: [{ id: "battery", label: "Charge batteries", done: true, icon: "battery" }],
}], "collecting an unchanged form must not mutate the source records");
