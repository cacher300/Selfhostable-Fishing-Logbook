import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const {
  FLOW_COLOR_BY_SPEED, FLOW_COLOR_OPTIONS, createCurrentFieldSampler, createParticleLayer, currentColor, currentPixelsPerFrame, decodeGreatLakesWaterMask,
  flowColorOptionsHtml, flowColorParts, normalizedFlowColor, paletteColor, speedBinColors, speedColorBin
} = await import("../static/js/great-lakes-conditions.js");

const packBits = (cells) => {
  const bytes = new Uint8Array(Math.ceil(cells.length / 8));
  cells.forEach((wet, index) => { if (wet) bytes[index >> 3] |= 1 << (index & 7); });
  return Buffer.from(bytes).toString("base64");
};

// 2 × 4 fine mask over 43.00–43.01 N, 80.00–79.97 W; only the eastern half is water.
const waterMask = {
  rows: 2, columns: 4, latitudeStart: 43, latitudeEnd: 43.01, longitudeStart: -80, longitudeEnd: -79.97,
  bits: packBits([0, 0, 1, 1, 0, 0, 1, 1])
};
const isWater = decodeGreatLakesWaterMask(waterMask);
assert.equal(isWater(43.005, -79.975), true);
assert.equal(isWater(43.005, -79.995), false);
assert.equal(isWater(44, -79.975), false);
assert.equal(decodeGreatLakesWaterMask({}), null);

// The coarse grid marks every cell as land, as it does along a shoreline;
// the fine mask must still allow flow on its water cells.
const field = {
  rows: 2, columns: 2, latitudeAxis: [43, 43.01], longitudeAxis: [-80, -79.97],
  mask: [0, 0, 0, 0], u: [0.2, 0.2, 0.2, 0.2], v: [0, 0, 0, 0], waterMask
};
const sample = createCurrentFieldSampler([field]);
assert.deepEqual(sample(43.005, -79.975), { u: 0.2, v: 0 });
assert.equal(sample(43.005, -79.995), null);
assert.equal(sample(45, -79.975), null);

// Without a fine mask only coarse wet corners contribute.
const legacy = createCurrentFieldSampler([{ ...field, waterMask: undefined, mask: [1, 0, 0, 0], u: [0.4, 9, 9, 9] }]);
assert.deepEqual(legacy(43.005, -79.985), { u: 0.4, v: 0 });

assert.equal(currentPixelsPerFrame(0), 0);
assert.ok(currentPixelsPerFrame(0.01) > 0.09 && currentPixelsPerFrame(0.01) < 0.11);
assert.equal(currentPixelsPerFrame(0.1), 0.5);
assert.equal(currentPixelsPerFrame(0.001), 0);
assert.equal(currentPixelsPerFrame(10), 2.6);
assert.ok(currentPixelsPerFrame(0.1) > currentPixelsPerFrame(0.01));
assert.ok(currentPixelsPerFrame(0.5) < 5);

assert.equal(currentColor(0), "rgb(22, 58, 128)");
assert.equal(currentColor(5), "rgb(252, 158, 72)");
assert.match(currentColor(0.2), /^rgb\(\d+, \d+, \d+\)$/);

// Flow colour: only the listed colours (or "by speed") are accepted, and the
// outline contrasts with the colour.
assert.equal(normalizedFlowColor("#FACC15"), "#facc15");
assert.equal(normalizedFlowColor("#ffcc00"), "#ffffff"); // an old free-picker colour
assert.equal(normalizedFlowColor("red"), "#ffffff");
assert.equal(normalizedFlowColor(null), "#ffffff");
assert.equal(normalizedFlowColor(FLOW_COLOR_BY_SPEED), "speed");
assert.ok(FLOW_COLOR_OPTIONS.length >= 6);
assert.deepEqual(flowColorParts("#facc15"), { rgb: "250, 204, 21", halo: "6, 16, 34", bySpeed: false });
assert.deepEqual(flowColorParts("#111827"), { rgb: "17, 24, 39", halo: "255, 255, 255", bySpeed: false });
assert.equal(flowColorParts("speed").bySpeed, true);
const options = String(flowColorOptionsHtml("#ef4444"));
assert.match(options, /<option value="#ef4444" selected>Red<\/option>/);
assert.match(options, /<option value="speed">By current speed<\/option>/);

// Speed-coloured flow: speeds map onto the legend range in a few colour bins.
assert.equal(speedColorBin(0, 0.5, 10), 0);
assert.equal(speedColorBin(0.26, 0.5, 10), 5);
assert.equal(speedColorBin(2, 0.5, 10), 9);
const binColors = speedBinColors(4);
assert.equal(binColors.length, 4);
assert.notEqual(binColors[0], binColors[3]);
assert.equal(paletteColor(0, [[0, [1, 2, 3]], [1, [4, 5, 6]]]), "rgb(1, 2, 3)");

// Exercise the renderer at two refresh rates: equal wall time must produce
// equal travel and tail fading. Also verify the phone backing-store cap and
// lifecycle cleanup, without relying on a browser's real animation clock.
const originalRandom = Math.random;
const originalContext = HTMLCanvasElement.prototype.getContext;
const originalRaf = globalThis.requestAnimationFrame;
const originalCancel = globalThis.cancelAnimationFrame;
const originalPath = globalThis.Path2D;
const originalDpr = window.devicePixelRatio;
try {
  Math.random = () => 0.5;
  window.devicePixelRatio = 3;
  globalThis.Path2D = class {
    lines = [];
    moveTo(x, y) { this.start = [x, y]; }
    lineTo(x, y) { this.lines.push([...this.start, x, y]); }
  };
  function simulate(hz, dry = false) {
    let pending = null, strokes = [], retention = 1;
    const context = {
      setTransform() {}, clearRect() {},
      fillRect() { retention *= Number(this.fillStyle.match(/, ([\d.e-]+)\)$/)[1]); },
      stroke(path) { strokes.push(path.lines); }
    };
    HTMLCanvasElement.prototype.getContext = () => context;
    globalThis.requestAnimationFrame = (callback) => { pending = callback; return 1; };
    globalThis.cancelAnimationFrame = () => { pending = null; };
    const pane = document.createElement("div"), listeners = new Map();
    const map = {
      getSize: () => ({ x: 96, y: 96 }), getZoom: () => 8,
      containerPointToLayerPoint: () => ({ x: 0, y: 0 }),
      layerPointToLatLng: ([x, y]) => ({ lat: 43 + y / 1000, lng: -80 + x / 1000 }),
      getPane: () => pane,
      on: (events, callback) => listeners.set(events, callback),
      off: (events) => listeners.delete(events)
    };
    const uniform = {
      rows: 2, columns: 2, latitudeAxis: [43, 44], longitudeAxis: [-80, -79],
      mask: dry ? [0, 0, 0, 0] : [1, 1, 1, 1], u: [0.1, 0.1, 0.1, 0.1], v: [0, 0, 0, 0]
    };
    const layer = createParticleLayer(map, [uniform]).addTo(map);
    assert.equal(pane.firstChild.width, 192, "DPR 3 phone uses a 2× backing store");
    pending(100);
    const start = strokes[0]?.[0]?.[0];
    retention = 1;
    for (let frame = 1; frame <= hz; frame += 1) {
      strokes = [];
      pending(100 + frame * 1000 / hz);
    }
    const end = strokes[0]?.[0]?.[2];
    layer.remove();
    assert.equal(pane.childElementCount, 0);
    assert.equal(listeners.size, 0);
    assert.equal(pending, null);
    return { distance: end - start - 0.5, retention, strokes: strokes.length };
  }
  const sixty = simulate(60), oneTwenty = simulate(120);
  assert.ok(Math.abs(sixty.distance - 30) < 1e-8);
  assert.ok(Math.abs(sixty.distance - oneTwenty.distance) < 1e-8);
  assert.ok(Math.abs(sixty.retention - oneTwenty.retention) < 1e-8);
  assert.equal(simulate(60, true).strokes, 0, "a land-only view paints no flow");
} finally {
  Math.random = originalRandom;
  HTMLCanvasElement.prototype.getContext = originalContext;
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancel;
  globalThis.Path2D = originalPath;
  window.devicePixelRatio = originalDpr;
}
