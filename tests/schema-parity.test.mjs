import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { validateLogbook } from "../static/js/generated/logbook-schema-rules.js";

const root = new URL("..", import.meta.url);

function parseSegment(segment) {
  const parts = segment.replaceAll("]", "").split("[");
  return { name: parts[0], indexes: parts.slice(1).map(Number) };
}

function resolveParent(document, dottedPath) {
  let current = document;
  const parts = dottedPath.split(".");
  for (const segment of parts.slice(0, -1)) {
    const { name, indexes } = parseSegment(segment);
    current = current[name];
    for (const index of indexes) current = current[index];
  }
  return { parent: current, last: parts.at(-1) };
}

function setPath(document, dottedPath, value) {
  const { parent, last } = resolveParent(document, dottedPath);
  const { name, indexes } = parseSegment(last);
  if (!indexes.length) parent[name] = structuredClone(value);
  else {
    let target = parent[name];
    for (const index of indexes.slice(0, -1)) target = target[index];
    target[indexes.at(-1)] = structuredClone(value);
  }
}

function removePath(document, dottedPath) {
  const { parent, last } = resolveParent(document, dottedPath);
  const { name, indexes } = parseSegment(last);
  if (!indexes.length) delete parent[name];
  else {
    let target = parent[name];
    for (const index of indexes.slice(0, -1)) target = target[index];
    target.splice(indexes.at(-1), 1);
  }
}

async function loadJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

function caseDocument(defaultLogbook, schemaCase) {
  const document = structuredClone(defaultLogbook);
  for (const path of schemaCase.remove || []) removePath(document, path);
  for (const [path, value] of Object.entries(schemaCase.set || {})) setPath(document, path, value);
  return document;
}

const defaultLogbook = await loadJson("schema/default-logbook.json");
const fixture = await loadJson("tests/fixtures/schema-cases.json");

for (const schemaCase of fixture.cases) {
  test(`schema parity: ${schemaCase.name}`, () => {
    const result = validateLogbook(caseDocument(defaultLogbook, schemaCase));
    assert.equal(result.valid, schemaCase.valid);
    if (schemaCase.valid) assert.equal(result.error, null);
    else assert.equal(result.error.split(":", 1)[0], schemaCase.path);
  });
}
