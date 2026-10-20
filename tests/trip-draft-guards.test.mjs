import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const forbiddenDomRead = /\b(document|querySelector\w*|getElement\w*|getAttribute)\b|\.(value|checked|dataset)\b|\["(value|checked|dataset)"\]|\['(value|checked|dataset)'\]/;

for (const file of ["trip-save.js", "trip-draft.js"]) {
  const source = readFileSync(new URL(`../static/js/${file}`, import.meta.url), "utf8");
  assert.equal(forbiddenDomRead.test(source), false, `${file} must not read trip editor controls`);
}

const gearDraftSource = readFileSync(new URL("../static/js/gear-draft.js", import.meta.url), "utf8");
assert.equal(forbiddenDomRead.test(gearDraftSource), false, "gear-draft.js must not read gear editor controls");

function exportedFunctionBody(source, name) {
  const start = source.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open, index + 1);
  }
  assert.fail(`${name} body could not be parsed`);
}

const gearDialogsSource = readFileSync(new URL("../static/js/gear-dialogs.js", import.meta.url), "utf8");
for (const name of ["saveLure", "saveFlasher", "saveReel", "saveRod", "saveCombo"]) {
  assert.equal(forbiddenDomRead.test(exportedFunctionBody(gearDialogsSource, name)), false, `${name} must save from ui.gearDraft, not controls`);
}

const draftBindingSource = readFileSync(new URL("../static/js/draft-binding.js", import.meta.url), "utf8");
assert.match(
  draftBindingSource,
  /only trip-draft path that reads live\s+\/\/ control values/,
  "draft-binding.js must document that DOM value reads belong only to the delegated event handler"
);
