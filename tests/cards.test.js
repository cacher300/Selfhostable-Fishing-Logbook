import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { cardRows, positionLabel, profileActionHtml, readingHtml, valueParts } = await import("../static/js/cards.js");

// Numbers are shown large with a smaller unit.
assert.deepEqual(valueParts("64.1 °F"), ["64.1", "°F"]);
assert.deepEqual(valueParts("44 ft"), ["44", "ft"]);
assert.deepEqual(valueParts("None"), ["None", ""]);

const reading = String(readingHtml({ label: "Surface temperature", value: "64.1 °F", rows: [["Thermocline", "44 ft"], null, ["Empty", ""]], action: profileActionHtml(43.7, -77.9) }));
assert.match(reading, /<span class="gl-reading-label">Surface temperature<\/span>/);
assert.match(reading, /<strong>64\.1<\/strong><span>°F<\/span>/);
assert.match(reading, /<dt>Thermocline<\/dt><dd>44 ft<\/dd>/);
assert.doesNotMatch(reading, /Empty/); // rows without a value are left out
assert.match(reading, /data-gl-profile-lat="43\.7" data-gl-profile-lon="-77\.9"><span>Water column<\/span>/);
assert.equal(cardRows([null, ["A", ""]]), "");

assert.equal(positionLabel(43.6989, -77.8997), "43.6989° N, 77.8997° W");

// Values from NOAA are escaped.
assert.doesNotMatch(String(readingHtml({ label: "<b>x</b>", value: "<img src=x>" })), /<img|<b>/);
