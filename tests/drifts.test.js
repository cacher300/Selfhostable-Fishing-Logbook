import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { automaticDriftId, assignedDriftId, pointInPolygon } = await import("../static/js/drifts.js");

const triangle = [
  { latitude: 43, longitude: -79 },
  { latitude: 43.02, longitude: -79 },
  { latitude: 43.02, longitude: -78.98 },
];
const wide = { id: "wide", name: "Wide", polygon: triangle };
const narrow = { id: "narrow", name: "Narrow", polygon: [
  { latitude: 43.01, longitude: -79 },
  { latitude: 43.02, longitude: -79 },
  { latitude: 43.02, longitude: -78.99 },
] };
const point = { latitude: 43.018, longitude: -78.996 };
assert.equal(pointInPolygon(point, triangle), true);
assert.equal(pointInPolygon(triangle[0], triangle), true);
assert.equal(pointInPolygon({ latitude: 43.01, longitude: -78.97 }, triangle), false);
assert.equal(automaticDriftId({ coordinates: point }, [wide, narrow]), "narrow");
assert.equal(automaticDriftId({ manualCoordinates: triangle[0], coordinates: point }, [wide, narrow]), "wide");
assert.equal(assignedDriftId({ driftAssignmentMode: "manual", driftId: "wide", coordinates: point }, [wide, narrow]), "wide");
assert.equal(assignedDriftId({ driftAssignmentMode: "manual", driftId: "", coordinates: point }, [wide, narrow]), "");
