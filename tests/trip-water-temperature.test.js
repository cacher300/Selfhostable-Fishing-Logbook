import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();

const { tripWaterTemperatureLocationAvailable, tripWaterTemperatureLookup, tripWaterTemperatureText } = await import("../static/js/trip-water-temperature.js");
const { setState } = await import("../static/js/app-state.js");

const trip = { date: "2026-10-05", launchTime: "06:30" };
const tripTime = new Date(2026, 9, 5, 6, 30).toISOString();

assert.deepEqual(tripWaterTemperatureLookup(trip, new Date(2026, 9, 5, 10)), { time: tripTime });
assert.deepEqual(tripWaterTemperatureLookup({ date: "2026-10-05", launchTime: "09:30" }, new Date(2026, 9, 5, 10)), { forecastHour: 0 });
assert.deepEqual(tripWaterTemperatureLookup({ date: "2026-10-05", launchTime: "07:45" }, new Date(2026, 9, 5, 0)), { forecastHour: 9 });
assert.deepEqual(tripWaterTemperatureLookup({ date: "2026-10-07", launchTime: "10:00" }, new Date(2026, 9, 5, 10)), { forecastHour: 48 });
assert.equal(tripWaterTemperatureLookup({ date: "2026-10-09", launchTime: "12:00" }, new Date(2026, 9, 5, 10)), null);
assert.equal(tripWaterTemperatureLookup({}, Date.now()), null);
assert.equal(tripWaterTemperatureText(10, "F"), "50");
assert.equal(tripWaterTemperatureText(10.24, "C"), "10.2");
assert.equal(tripWaterTemperatureText(null, "F"), "");

setState({ locations: [
  { id: "erie", name: "Lake Erie", coordinates: { latitude: 42.2, longitude: -81.2 } },
  { id: "override", name: "Other waterbody", coordinates: { latitude: 45, longitude: -75 }, greatLakesOverride: true },
  { id: "excluded", name: "Inland waterbody", coordinates: { latitude: 45, longitude: -75 }, greatLakesOverride: false }
] });
assert.equal(tripWaterTemperatureLocationAvailable({ locationId: "erie" }, { latitude: 42.2, longitude: -81.2 }), true);
assert.equal(tripWaterTemperatureLocationAvailable({ locationId: "override" }, { latitude: 45, longitude: -75 }), true);
assert.equal(tripWaterTemperatureLocationAvailable({ locationId: "excluded" }, { latitude: 42.2, longitude: -81.2 }), false);
