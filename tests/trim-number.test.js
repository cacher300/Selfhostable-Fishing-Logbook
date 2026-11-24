import assert from "node:assert/strict";
import test from "node:test";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv(`<!doctype html><html><body></body></html>`);
globalThis.Option = function Option(label, value) {
  return { label, value };
};
const { trimNumber } = await import("../static/js/form-utils.js");

test("trimNumber matches Number#toLocaleString with at most two decimals", () => {
  for (const value of [0, 1, 2.5, 1.005, 1234.5678, -3.14159, "7.10", 1e6, "abc", NaN]) {
    assert.equal(trimNumber(value), Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }));
  }
});

test("trimNumber reuses one formatter instead of building one per call", () => {
  const RealFormat = Intl.NumberFormat;
  let created = 0;
  Intl.NumberFormat = function CountingFormat(...args) {
    created += 1;
    return new RealFormat(...args);
  };
  try {
    for (let index = 0; index < 100; index += 1) trimNumber(index / 3);
  } finally {
    Intl.NumberFormat = RealFormat;
  }
  assert.ok(created <= 1, `expected at most one NumberFormat, saw ${created}`);
});
