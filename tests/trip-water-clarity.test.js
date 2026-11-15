import test from "node:test";
import assert from "node:assert/strict";
import { isNiagaraRiver, clarityLookupTime } from "../static/js/trip-water-clarity.js";

test("Niagara waterbody matching excludes unrelated places", () => {
  for (const name of ["Niagara River", " niagara river ", "Upper Niagara River", "Lower Niagara", "Niagara River (Lower)"]) assert.equal(isNiagaraRiver(name), true);
  for (const name of ["Lake Ontario", "Niagara Falls Pond", "Niagara River tributary", ""]) assert.equal(isNiagaraRiver(name), false);
});
test("clarity uses the selected trip time rather than today's conditions", () => {
  const trip = { location: "Niagara River", date: "2026-11-13", launchTime: "08:30" };
  assert.equal(clarityLookupTime(trip), new Date(2026, 10, 13, 8, 30).toISOString());
  assert.equal(clarityLookupTime({ ...trip, location: "Lake Erie" }), null);
  assert.equal(clarityLookupTime({ ...trip, date: "" }), null);
});
