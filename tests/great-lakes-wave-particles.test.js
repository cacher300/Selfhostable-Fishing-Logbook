import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { waveParticleFields, waveParticleSpeed } = await import("../static/js/great-lakes-conditions.js");
const { currentPixelsPerFrame } = await import("../static/js/particle-speed.js");

// Wave particles follow wave height: still at flat water, creeping when calm, racing at 8 ft.
const wavePixels = (height) => currentPixelsPerFrame(waveParticleSpeed(height));
assert.equal(waveParticleSpeed(0), 0);
assert.equal(waveParticleSpeed(undefined), 0);
assert.ok(wavePixels(0.05) > 0 && wavePixels(0.05) < 0.05, "a ripple only creeps");
assert.ok(wavePixels(0.3) < wavePixels(0.6) && wavePixels(0.6) < wavePixels(1.2) && wavePixels(1.2) < wavePixels(2.4384));
assert.ok(wavePixels(0.6096) * 10 < wavePixels(2.4384), "8 ft waves move far faster than 2 ft waves");
assert.ok(Math.abs(wavePixels(2.4384) - 2.6) < 1e-6);
assert.equal(waveParticleSpeed(9), waveParticleSpeed(20), "storm waves are capped");
const [flat] = waveParticleFields([{ latitude: 43, longitude: -79.9, heightMeters: 0, periodSeconds: 4, directionDegrees: 270 }]).map((field) => field.points[0]);
assert.equal(Math.hypot(flat.u, flat.v), 0);
