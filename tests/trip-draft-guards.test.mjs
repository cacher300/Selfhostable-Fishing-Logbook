import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const forbiddenDomRead = /\b(document|querySelector\w*|getElement\w*|getAttribute)\b|\.(value|checked|dataset)\b|\["(value|checked|dataset)"\]|\['(value|checked|dataset)'\]/;

for (const file of ["trip-save.js", "trip-draft.js"]) {
  const source = readFileSync(new URL(`../static/js/${file}`, import.meta.url), "utf8");
  assert.equal(forbiddenDomRead.test(source), false, `${file} must not read trip editor controls`);
}

const draftBindingSource = readFileSync(new URL("../static/js/draft-binding.js", import.meta.url), "utf8");
assert.match(
  draftBindingSource,
  /only trip-draft path that reads live\s+\/\/ control values/,
  "draft-binding.js must document that DOM value reads belong only to the delegated event handler"
);
