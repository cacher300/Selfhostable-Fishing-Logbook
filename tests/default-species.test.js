import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { defaults } = await import("../static/js/app-defaults.js");

const species = defaults.species;
assert(species.includes("Atlantic Salmon"));
assert.equal(new Set(species).size, species.length);
assert(species.includes("Walleye"));
const named = species.filter((item) => item !== "Anything");
assert.deepEqual(named, [...named].sort((a, b) => a.localeCompare(b)));
assert.equal(species.at(-1), "Anything");
