import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { generatedTripTitle } = await import("../static/js/app-normalization.js");

const trips = [
  { id: "one", title: "Salmon Trolling Trip #1", date: "2026-09-01", targetSpecies: "Salmon", method: "Trolling" },
  { id: "two", title: "Custom title", date: "2026-09-02", targetSpecies: "Salmon", method: "Trolling" },
  { id: "three", title: "Salmon Trolling Trip #3", date: "2026-09-03", targetSpecies: "Salmon", method: "Trolling" },
];
assert.equal(generatedTripTitle({ targetSpecies: "Salmon", method: "Trolling" }, trips), "Salmon Trolling Trip #4");
assert.equal(generatedTripTitle({ id: "two", targetSpecies: "Walleye", method: "Trolling" }, trips), "Walleye Trolling Trip #1");
assert.equal(trips[1].title, "Custom title");
