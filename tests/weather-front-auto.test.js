import assert from "node:assert/strict";
import test from "node:test";
import { classifyWeatherFront, automaticWeatherFrontPatch, resetAutomaticWeatherFront, weatherFrontDateRange } from "../static/js/generated/weather-front-rules.js";

function context(passage = true) {
  const hourly = { time: [], temperature_2m: [], pressure_msl: [], wind_direction_10m: [], wind_speed_10m: [] };
  for (let hour = 0; hour < 72; hour++) {
    hourly.time.push(new Date(Date.UTC(2026, 9, 31, hour)).toISOString().slice(0, 16));
    const after = passage && hour >= 36;
    hourly.temperature_2m.push(after ? 10 : 18);
    hourly.pressure_msl.push(passage && hour === 36 ? 1013 : after ? 1019 : 1016);
    hourly.wind_direction_10m.push(after ? 300 : 200);
    hourly.wind_speed_10m.push(15);
  }
  return { hourly, hourly_units: { wind_speed_10m: "km/h" } };
}

test("surrounding weather distinguishes pre, during, post, and no front", () => {
  for (const [start, end, expected] of [["04:00", "06:00", "pre-front"], ["11:00", "13:00", "during-front"], ["16:00", "18:00", "post-front"]]) {
    const trip = { date: "2026-11-01", launchTime: start, linesPulledTime: end };
    assert.equal(classifyWeatherFront(trip, context()).value, expected);
    assert.equal(classifyWeatherFront(trip, context(false)).value, "no-front");
  }
});

test("missing, calm, malformed, and short weather never masquerade as a detected front", () => {
  const trip = { date: "2026-11-01", launchTime: "11:00", linesPulledTime: "13:00" };
  assert.equal(classifyWeatherFront(trip, {}).value, "");
  const nulls = context();
  nulls.hourly.pressure_msl.fill(null);
  assert.equal(classifyWeatherFront(trip, nulls).value, "");
  const short = context();
  for (const key of Object.keys(short.hourly)) short.hourly[key] = short.hourly[key].slice(34, 40);
  assert.equal(classifyWeatherFront(trip, short).value, "");
  const gaps = context(false);
  gaps.hourly.pressure_msl.fill(null, 30, 36);
  assert.equal(classifyWeatherFront(trip, gaps).value, "");
  const calm = context();
  calm.hourly.wind_speed_10m.fill(0);
  assert.equal(classifyWeatherFront(trip, calm).value, "no-front");
  assert.equal(weatherFrontDateRange({ date: "bad" }), null);
});

test("automatic estimates preserve explicit manual and old unmarked selections", () => {
  const estimate = { value: "post-front" };
  assert.deepEqual(automaticWeatherFrontPatch({}, estimate), { weatherFront: "post-front", weatherFrontSource: "automatic" });
  assert.deepEqual(automaticWeatherFrontPatch({ weatherFront: "pre-front" }, estimate), {});
  assert.deepEqual(automaticWeatherFrontPatch({ weatherFront: "", weatherFrontSource: "manual" }, estimate), {});
  assert.deepEqual(automaticWeatherFrontPatch({ weatherFront: "pre-front", weatherFrontSource: "automatic" }, estimate), { weatherFront: "post-front", weatherFrontSource: "automatic" });
  assert.deepEqual(automaticWeatherFrontPatch({}, { value: "" }), {});
  assert.deepEqual(automaticWeatherFrontPatch({}, { value: "cold" }), {});
  assert.deepEqual(automaticWeatherFrontPatch({ weatherFront: "pre-front", weatherFrontSource: "automatic" }, { value: "" }), { weatherFront: "", weatherFrontSource: "automatic" });
  assert.deepEqual(weatherFrontDateRange({ date: "2026-11-01", launchTime: "23:00", linesPulledTime: "02:00" }), { startDate: "2026-10-31", endDate: "2026-11-03" });
});

test("changing trip context invalidates an estimate while preserving manual choices and other weather", () => {
  const trip = { weatherFront: "pre-front", weatherFrontSource: "automatic", custom: true, weatherData: { frontAssessment: { value: "pre-front" }, frontTag: "Stable" } };
  const reset = resetAutomaticWeatherFront(trip);
  assert.equal(reset.weatherFront, "");
  assert.equal(reset.weatherData.frontAssessment, undefined);
  assert.equal(reset.weatherData.frontTag, "Stable");
  assert.equal(reset.custom, true);
  assert.equal(trip.weatherFront, "pre-front");
  const manual = { ...trip, weatherFrontSource: "manual" };
  assert.equal(resetAutomaticWeatherFront(manual), manual);
});
