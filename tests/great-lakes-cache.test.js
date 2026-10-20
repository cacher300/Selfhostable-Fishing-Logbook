import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const {
  GREAT_LAKES_CLIENT_CACHE_LIMIT, GREAT_LAKES_CLIENT_CACHE_MS, cacheGreatLakesPayload,
  cachedGreatLakesPayload, greatLakesPayloadCache
} = await import("../static/js/great-lakes-conditions.js");

const originalNow = Date.now;
let now = originalNow();
Date.now = () => now;
try {
  cacheGreatLakesPayload("frequent", { value: 1 });
  for (let index = 0; index < GREAT_LAKES_CLIENT_CACHE_LIMIT - 1; index += 1) {
    cacheGreatLakesPayload(`depth:${index}`, { index });
  }
  assert.deepEqual(cachedGreatLakesPayload("frequent"), { value: 1 });
  cacheGreatLakesPayload("another-depth", {});
  assert.equal(cachedGreatLakesPayload("depth:0"), null);
  assert.deepEqual(cachedGreatLakesPayload("frequent"), { value: 1 });
  assert.equal(greatLakesPayloadCache.size, GREAT_LAKES_CLIENT_CACHE_LIMIT);

  now += GREAT_LAKES_CLIENT_CACHE_MS;
  assert.equal(cachedGreatLakesPayload("frequent"), null);
  assert.equal(greatLakesPayloadCache.size, 0);
  for (let version = 0; version < 60; version += 1) {
    now += GREAT_LAKES_CLIENT_CACHE_MS + 1;
    cacheGreatLakesPayload(`version:${version}`, { version });
  }
  assert.equal(greatLakesPayloadCache.size, 1);
  assert.deepEqual(cachedGreatLakesPayload("version:59"), { version: 59 });
} finally {
  Date.now = originalNow;
  greatLakesPayloadCache.clear();
}
