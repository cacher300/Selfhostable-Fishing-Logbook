// Colours that follow what is on screen.
//
// Each lake image comes with a value image (render.py: _encode_values): its
// grey level is the value's position in the layer's colour range. The value
// images are shown through an SVG colour filter that maps each grey level to
// the palette, stretched over the range of values currently on screen, so
// recolouring after a pan or zoom is one filter update (done by the browser on
// the graphics card) rather than a redraw. Small copies of the value images
// are kept to work out that range.
import { L } from "./vendor.js";

const SVG_NS = "http://www.w3.org/2000/svg";
// The server's palettes (render.py), so the map reads the same as before.
const TEMPERATURE_STOPS = [
  [0, [58, 40, 168]], [0.13, [36, 92, 226]], [0.27, [14, 152, 242]], [0.4, [12, 204, 222]], [0.53, [34, 208, 136]],
  [0.66, [150, 222, 48]], [0.78, [252, 218, 36]], [0.89, [252, 140, 28]], [1, [228, 40, 52]]
];
// Wave heights for small boats: blues only for calm water under 2 ft, then green → red up to
// the scale's top, which is 8 ft unless bigger waves are on screen (then red is the highest).
// Wind uses the same palette: calm under 5 kn, red at 25 kn or the strongest wind on screen.
// Mirrors calm_rough_color_stops in the Great Lakes Trolling server's render.py.
export const WAVE_CALM_MAX_METERS = 0.6096;
export const WAVE_DEFAULT_MAX_METERS = 2.4384;
export const WIND_CALM_MAX_METERS_PER_SECOND = 5 * 0.514444;
export const WIND_DEFAULT_MAX_METERS_PER_SECOND = 25 * 0.514444;
const CALM_COLORS = [[0, [30, 64, 150]], [0.5, [26, 120, 210]], [1, [20, 190, 214]]];
const ROUGH_COLORS = [[0.3, [118, 222, 122]], [0.55, [250, 224, 60]], [0.78, [250, 138, 40]], [1, [222, 40, 92]]];
export function calmRoughStops(calm, maximum) {
  const top = Math.max(Number(maximum) || calm * 4, calm * 1.5);
  return [
    ...CALM_COLORS.map(([fraction, color]) => [calm * fraction / top, color]),
    ...ROUGH_COLORS.map(([fraction, color]) => [(calm + (top - calm) * fraction) / top, color])
  ];
}
export function waveStops(maximum = WAVE_DEFAULT_MAX_METERS) {
  return calmRoughStops(WAVE_CALM_MAX_METERS, maximum || WAVE_DEFAULT_MAX_METERS);
}
export function windStops(maximum = WIND_DEFAULT_MAX_METERS_PER_SECOND) {
  return calmRoughStops(WIND_CALM_MAX_METERS_PER_SECOND, maximum || WIND_DEFAULT_MAX_METERS_PER_SECOND);
}
// Layers whose palette is reshaped for each range, with the top they start at.
const CALM_ROUGH_LAYERS = Object.freeze({
  waves: { stops: waveStops, defaultMaximum: WAVE_DEFAULT_MAX_METERS },
  wind: { stops: windStops, defaultMaximum: WIND_DEFAULT_MAX_METERS_PER_SECOND }
});
export function paletteGradient(stops) {
  return `linear-gradient(90deg, ${stops.map(([stop, color]) => `rgb(${color.join(", ")}) ${(stop * 100).toFixed(1)}%`).join(", ")})`;
}
export const PALETTE_STOPS = Object.freeze({
  temperature: TEMPERATURE_STOPS,
  thermocline: TEMPERATURE_STOPS,
  currents: [[0, [22, 58, 128]], [0.22, [40, 92, 178]], [0.45, [98, 70, 186]], [0.68, [172, 60, 170]], [0.86, [232, 86, 118]], [1, [252, 158, 72]]],
  waves: waveStops(),
  wind: windStops(),
  radar: [[0, [24, 48, 128]], [0.18, [36, 132, 224]], [0.36, [34, 190, 124]], [0.54, [238, 226, 52]], [0.7, [244, 132, 32]], [0.84, [224, 48, 42]], [1, [190, 48, 190]]],
  upwelling: [[0, [20, 54, 160]], [0.22, [38, 112, 222]], [0.38, [126, 196, 250]], [0.5, [236, 240, 245]], [0.62, [252, 178, 122]], [0.78, [232, 92, 54]], [1, [168, 24, 36]]]
});
export const SMOOTH_PALETTE_LAYERS = Object.freeze(["temperature", "air-temperature", "waves", "wind", "radar"]);
export const TEMPERATURE_COLOR_RANGE_C = Object.freeze([0, 30]);
export const AIR_TEMPERATURE_COLOR_RANGE_C = Object.freeze([-40, 50]);
export const TEMPERATURE_COLOR_MODE_STORAGE_KEY = "glc.TemperatureColorMode";
export const DEFAULT_TEMPERATURE_COLOR_MODE = "dynamic";
// How the range is trimmed and how narrow it may get, as the server does for the whole map:
// a few outlying pixels do not stretch the colours, and model noise in uniform water is not
// blown up into dramatic colour changes. Current speed, wave height, and wind start at zero.
export const PALETTE_FIT = Object.freeze({
  temperature: { fixed: TEMPERATURE_COLOR_RANGE_C },
  "air-temperature": { fixed: AIR_TEMPERATURE_COLOR_RANGE_C },
  temperatureDynamic: { low: 0.005, high: 0.995, minimumSpan: 3 },
  thermocline: { low: 0.02, high: 0.98, minimumSpan: 2, floor: 0 },
  currents: { low: 0, high: 0.98, zeroBased: true, minimumMaximum: 0.08 },
  // Red at 8 ft, or at the highest waves on screen when they are bigger.
  waves: { low: 0, high: 1, zeroBased: true, minimumMaximum: WAVE_DEFAULT_MAX_METERS },
  // Red at 25 kn, or at the strongest wind on screen when it is stronger.
  wind: { low: 0, high: 1, zeroBased: true, minimumMaximum: WIND_DEFAULT_MAX_METERS_PER_SECOND },
  radar: { fixed: [5, 70] },
  // Upwelling strength (°F, negative upwelling) keeps one scale, so a colour always means the same strength.
  upwelling: { fixed: [-8, 8] }
});
// Width of the kept copies of the value images; plenty to find a range.
const SAMPLE_WIDTH = 320;
// A pixel counts once it is mostly water (shorelines blend into the map).
const SAMPLE_MIN_ALPHA = 200;
const HISTOGRAM_BINS = 512;
const REFIT_DELAY_MS = 120;
// Smooth display rasters without washing out actual model fronts. The values
// are rebuilt at half resolution and then enlarged by Leaflet in the browser.
const DEBAND_RADII = [2, 4, 8, 16];
const DEBAND_KEEP_LEVELS = 0.5;
const DEBAND_LIMIT_LEVELS = 1.25;
const DEBAND_CACHE_ENTRIES = 6;
const debandCache = new Map();
let filterCount = 0;

export function savedTemperatureColorMode() {
  try {
    const saved = localStorage.getItem(TEMPERATURE_COLOR_MODE_STORAGE_KEY);
    return saved === "fixed" || saved === "dynamic" ? saved : DEFAULT_TEMPERATURE_COLOR_MODE;
  } catch { return DEFAULT_TEMPERATURE_COLOR_MODE; }
}

export function setTemperatureColorMode(mode) {
  const selected = mode === "fixed" || mode === "dynamic" ? mode : DEFAULT_TEMPERATURE_COLOR_MODE;
  try { localStorage.setItem(TEMPERATURE_COLOR_MODE_STORAGE_KEY, selected); } catch { /* storage unavailable */ }
  document.dispatchEvent(new CustomEvent("glc-temperature-color-mode-changed", { detail: { mode: selected } }));
}

export function paletteRgb(position, stops) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(position) ? position : 0));
  const upper = stops.findIndex(([stop]) => clamped <= stop);
  const [highStop, highColor] = stops[Math.max(0, upper)];
  const [lowStop, lowColor] = stops[Math.max(0, upper - 1)];
  const fraction = highStop === lowStop ? 0 : (clamped - lowStop) / (highStop - lowStop);
  return lowColor.map((channel, index) => Math.round(channel + (highColor[index] - channel) * fraction));
}

// Grey level k (0-255) of a value image over valueRange, coloured for the range [low, high].
export function paletteTables(valueRange, low, high, stops) {
  const [valueMin, valueMax] = valueRange;
  const tables = [[], [], []];
  for (let level = 0; level < 256; level += 1) {
    const value = valueMin + level / 255 * (valueMax - valueMin);
    const color = paletteRgb((value - low) / Math.max(high - low, 1e-9), stops);
    color.forEach((channel, index) => tables[index].push((channel / 255).toFixed(4)));
  }
  return tables.map((table) => table.join(" "));
}

// The range to colour: trimmed percentiles of what is on screen, widened to the minimum span.
export function fitRange(histogram, binWidth, origin, kind, mode = "dynamic") {
  const rule = ["temperature", "air-temperature"].includes(kind) && mode === "dynamic"
    ? PALETTE_FIT.temperatureDynamic
    : PALETTE_FIT[kind] || PALETTE_FIT.temperature;
  if (rule.fixed) return [...rule.fixed];
  const total = histogram.reduce((sum, count) => sum + count, 0);
  if (!total) return null;
  const quantile = (fraction) => {
    const target = fraction * (total - 1);
    let seen = 0;
    for (let bin = 0; bin < histogram.length; bin += 1) {
      seen += histogram[bin];
      if (seen > target) return origin + (bin + 0.5) * binWidth;
    }
    return origin + histogram.length * binWidth;
  };
  let low = rule.zeroBased ? 0 : quantile(rule.low);
  let high = quantile(rule.high);
  if (rule.zeroBased) high = Math.max(high, rule.minimumMaximum || 0);
  else if (high - low < rule.minimumSpan) {
    const middle = (low + high) / 2;
    low = middle - rule.minimumSpan / 2;
    high = middle + rule.minimumSpan / 2;
  }
  if (rule.floor !== undefined && low < rule.floor) {
    high += rule.floor - low;
    low = rule.floor;
  }
  return [low, high];
}

function mercatorY(latitude) {
  const radians = latitude * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

// A small copy of a value image: its grey levels and which pixels are water.
async function loadSample(raster) {
  const image = new Image();
  image.decoding = "async";
  // These rasters come from the Great Lakes API, which may be on another origin.
  // Request CORS access so canvas sampling can read the pixels instead of tainting the canvas.
  image.crossOrigin = "anonymous";
  image.src = raster.valueUrl;
  await image.decode();
  const width = Math.min(SAMPLE_WIDTH, image.naturalWidth);
  const height = Math.max(1, Math.round(image.naturalHeight * width / image.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const levels = new Uint8Array(width * height);
  for (let pixel = 0, offset = 0; pixel < levels.length; pixel += 1, offset += 4) {
    levels[pixel] = data[offset + 3] >= SAMPLE_MIN_ALPHA ? data[offset] + 1 : 0;  // 0 = not water
  }
  const [[south, west], [north, east]] = raster.bounds;
  return { width, height, levels, south, west, north, east, valueRange: raster.valueRange };
}

// Count the water pixels of each sample inside the map view, as values.
export function visibleHistogram(samples, view, origin, binWidth) {
  const histogram = new Array(HISTOGRAM_BINS).fill(0);
  for (const sample of samples) {
    const west = Math.max(view.west, sample.west), east = Math.min(view.east, sample.east);
    const south = Math.max(view.south, sample.south), north = Math.min(view.north, sample.north);
    if (west >= east || south >= north) continue;
    const top = mercatorY(sample.north), span = top - mercatorY(sample.south);
    const x0 = Math.max(0, Math.floor((west - sample.west) / (sample.east - sample.west) * sample.width));
    const x1 = Math.min(sample.width, Math.ceil((east - sample.west) / (sample.east - sample.west) * sample.width));
    const y0 = Math.max(0, Math.floor((top - mercatorY(north)) / span * sample.height));
    const y1 = Math.min(sample.height, Math.ceil((top - mercatorY(south)) / span * sample.height));
    const [valueMin, valueMax] = sample.valueRange;
    const step = (valueMax - valueMin) / 255;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0, index = y * sample.width + x0; x < x1; x += 1, index += 1) {
        const level = sample.levels[index];
        if (!level) continue;
        const bin = Math.floor((valueMin + (level - 1) * step - origin) / binWidth);
        histogram[Math.max(0, Math.min(HISTOGRAM_BINS - 1, bin))] += 1;
      }
    }
  }
  return histogram;
}

// Three zero-padded box passes along each axis approximate a Gaussian blur.
function* boxBlur(source, width, height, radius) {
  const scale = 1 / (2 * radius + 1);
  const rows = new Float32Array(source.length), result = new Float32Array(source.length);
  const sums = new Float64Array(width);
  let input = source;
  for (let pass = 0; pass < 3; pass += 1) {
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      let sum = 0;
      for (let x = 0; x < Math.min(radius, width); x += 1) sum += input[row + x];
      for (let x = 0; x < width; x += 1) {
        if (x + radius < width) sum += input[row + x + radius];
        rows[row + x] = sum * scale;
        if (x - radius >= 0) sum -= input[row + x - radius];
      }
    }
    sums.fill(0);
    for (let y = 0; y < Math.min(radius, height); y += 1) {
      for (let x = 0, row = y * width; x < width; x += 1) sums[x] += rows[row + x];
    }
    for (let y = 0; y < height; y += 1) {
      const added = y + radius < height ? (y + radius) * width : -1;
      const removed = y - radius >= 0 ? (y - radius) * width : -1;
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        if (added >= 0) sums[x] += rows[added + x];
        result[row + x] = sums[x] * scale;
        if (removed >= 0) sums[x] -= rows[removed + x];
      }
    }
    input = result;
    yield;
  }
  return result;
}

// Rebuild the smooth scalar field represented by the 8-bit value image. Broad
// bands get a gentle ramp, while large temperature fronts keep their shape.
export function debandLevels(data, width, height) {
  const steps = debandSteps(data, width, height);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

// Do the same image work in short slices so a large lake does not freeze the map.
async function debandLevelsGradually(data, width, height) {
  const steps = debandSteps(data, width, height);
  let step = steps.next();
  while (!step.done) {
    await new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
      channel.port2.postMessage(null);
    });
    step = steps.next();
  }
  return step.value;
}

function* debandSteps(data, width, height) {
  const halfWidth = Math.ceil(width / 2), halfHeight = Math.ceil(height / 2);
  const weightedValues = new Float32Array(halfWidth * halfHeight);
  const weights = new Float32Array(halfWidth * halfHeight);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4, cell = (y >> 1) * halfWidth + (x >> 1);
      const alpha = data[offset + 3] / 255;
      weightedValues[cell] += data[offset] * alpha;
      weights[cell] += alpha;
    }
  }
  yield;
  const blurred = function* (radius) {
    const values = yield* boxBlur(weightedValues, halfWidth, halfHeight, radius);
    const total = yield* boxBlur(weights, halfWidth, halfHeight, radius);
    for (let index = 0; index < values.length; index += 1) values[index] = total[index] > 1e-6 ? values[index] / total[index] : NaN;
    return values;
  };
  const reference = yield* blurred(1);
  const field = Float32Array.from(reference);
  const keep = new Float32Array(field.length).fill(1);
  yield;
  for (const radius of DEBAND_RADII) {
    const wider = yield* blurred(radius);
    for (let index = 0; index < field.length; index += 1) {
      if (Number.isNaN(wider[index])) continue;
      if (Number.isNaN(field[index])) { field[index] = wider[index]; continue; }
      const t = Math.max(0, Math.min(1, (Math.abs(wider[index] - reference[index]) - DEBAND_KEEP_LEVELS) / (DEBAND_LIMIT_LEVELS - DEBAND_KEEP_LEVELS)));
      keep[index] *= 1 - t * t * (3 - 2 * t);
      field[index] += (wider[index] - field[index]) * keep[index];
    }
    yield;
  }
  const levels = new Uint16Array(field.length), alpha = new Uint8ClampedArray(field.length);
  for (let y = 0; y < halfHeight; y += 1) {
    if (y && y % 256 === 0) yield;
    for (let x = 0; x < halfWidth; x += 1) {
      const index = y * halfWidth + x;
      const sourcePixels = Math.min(2, width - x * 2) * Math.min(2, height - y * 2);
      levels[index] = Number.isNaN(field[index]) ? 0 : Math.max(0, Math.min(65535, Math.round(field[index] * 256)));
      alpha[index] = Math.round(weights[index] / sourcePixels * 255);
    }
  }
  return { width: halfWidth, height: halfHeight, levels, alpha };
}

async function debandRaster(raster) {
  const cached = debandCache.get(raster.valueUrl);
  if (cached) {
    debandCache.delete(raster.valueUrl);
    debandCache.set(raster.valueUrl, cached);
    return cached;
  }
  const loading = (async () => {
    const response = await fetch(raster.valueUrl);
    if (!response.ok) throw new Error(`value image ${response.status}`);
    const image = await createImageBitmap(await response.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const { width, height } = image;
    const source = document.createElement("canvas");
    source.width = width;
    source.height = height;
    const context = source.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    image.close();
    const pixels = context.getImageData(0, 0, width, height);
    source.width = 0;
    source.height = 0;
    return { ...await debandLevelsGradually(pixels.data, width, height), valueRange: raster.valueRange };
  })();
  debandCache.set(raster.valueUrl, loading);
  if (debandCache.size > DEBAND_CACHE_ENTRIES) debandCache.delete(debandCache.keys().next().value);
  loading.catch(() => { if (debandCache.get(raster.valueUrl) === loading) debandCache.delete(raster.valueUrl); });
  return loading;
}

// Re-encode fractional scalar values across the current palette range.
export function encodeDebanded(levels, pixels, valueRange, low, high) {
  const [valueMin, valueMax] = valueRange;
  const span = Math.max(high - low, 1e-9);
  const scale = (valueMax - valueMin) / (255 * 256) / span * 255;
  const offset = (valueMin - low) / span * 255;
  const table = new Uint8ClampedArray(65536);
  for (let level = 0; level < 65536; level += 1) table[level] = Math.round(level * scale + offset);
  const { data } = pixels;
  for (let index = 0, at = 0; index < levels.length; index += 1, at += 4) {
    data[at] = data[at + 1] = data[at + 2] = table[levels[index]];
  }
  return pixels;
}

function paletteFilterElement(id, smooth) {
  const filter = document.createElementNS(SVG_NS, "filter");
  filter.id = id;
  filter.setAttribute("color-interpolation-filters", "sRGB");
  const transfer = document.createElementNS(SVG_NS, "feComponentTransfer");
  const functions = ["R", "G", "B"].map((channel) => {
    const node = document.createElementNS(SVG_NS, `feFunc${channel}`);
    node.setAttribute("type", "table");
    transfer.append(node);
    return node;
  });
  filter.append(transfer);
  if (smooth) {
    filter.setAttribute("primitiveUnits", "objectBoundingBox");
    const blur = document.createElementNS(SVG_NS, "feGaussianBlur");
    blur.setAttribute("stdDeviation", "0.00075");
    filter.append(blur);
    const opaque = document.createElementNS(SVG_NS, "feColorMatrix");
    opaque.setAttribute("type", "matrix");
    opaque.setAttribute("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1");
    filter.append(opaque);
    const clip = document.createElementNS(SVG_NS, "feComposite");
    clip.setAttribute("operator", "in");
    clip.setAttribute("in2", "SourceAlpha");
    filter.append(clip);
  }
  return { filter, functions };
}

export function createPaletteFilter({ smooth = false, deband = false } = {}) {
  filterCount += 1;
  const id = `gl-palette-${filterCount}`;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  const { filter, functions } = paletteFilterElement(id, smooth);
  svg.append(filter);
  const fine = deband ? paletteFilterElement(`${id}-fine`, smooth) : null;
  if (fine) svg.append(fine.filter);
  document.body.append(svg);
  let colorRange = [0, 1];
  const surfaces = new Set();
  const draw = (surface) => {
    const pixels = surface.context.createImageData(surface.width, surface.height);
    for (let index = 0, at = 3; index < surface.alpha.length; index += 1, at += 4) pixels.data[at] = surface.alpha[index];
    surface.context.putImageData(encodeDebanded(surface.levels, pixels, surface.valueRange, ...colorRange), 0, 0);
  };
  return {
    css: `url(#${id})`,
    fineCss: fine ? `url(#${id}-fine)` : null,
    deband,
    set(valueRange, low, high, stops) {
      colorRange = [low, high];
      paletteTables(valueRange, low, high, stops).forEach((table, index) => functions[index].setAttribute("tableValues", table));
      if (fine) {
        paletteTables([low, high], low, high, stops).forEach((table, index) => fine.functions[index].setAttribute("tableValues", table));
        surfaces.forEach(draw);
      }
    },
    track(surface) { surfaces.add(surface); draw(surface); },
    untrack(surface) { surfaces.delete(surface); },
    remove() { surfaces.clear(); svg.remove(); }
  };
}

const DebandedOverlay = L.ImageOverlay.extend({
  initialize(url, bounds, options, filter, raster) {
    L.ImageOverlay.prototype.initialize.call(this, url, bounds, options);
    this._paletteFilter = filter;
    this._raster = raster;
  },
  onAdd(map) {
    L.ImageOverlay.prototype.onAdd.call(this, map);
    if (this._surface) {
      this._image.style.filter = this._paletteFilter.fineCss;
      this._paletteFilter.track(this._surface);
      return;
    }
    this._image.style.filter = this._paletteFilter.css;
    this._debanding ||= debandRaster(this._raster).then((surface) => this._swapIn(surface)).catch(() => {});
  },
  onRemove(map) {
    if (this._surface) this._paletteFilter.untrack(this._surface);
    L.ImageOverlay.prototype.onRemove.call(this, map);
  },
  _swapIn({ width, height, levels, alpha, valueRange }) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    this._surface = { context: canvas.getContext("2d"), width, height, levels, alpha, valueRange };
    const previous = this._image;
    canvas.className = previous.className;
    canvas.style.cssText = previous.style.cssText;
    canvas.style.filter = this._paletteFilter.fineCss;
    this._image = canvas;
    if (!this._map) return;
    this._paletteFilter.track(this._surface);
    previous.replaceWith(canvas);
    this._reset();
  }
});

// Overlays for a layer's lake images: value images through the palette filter, with the
// thermocline's mixed water as its own image underneath when a server sends one. Older payloads without
// value images fall back to the coloured images.
export function paletteOverlays(rasters, filter, options) {
  return (rasters || []).flatMap((raster) => {
    const overlays = [];
    if (raster.mixedUrl) overlays.push(L.imageOverlay(raster.mixedUrl, raster.bounds, { ...options, className: `${options.className || ""} great-lakes-mixed-raster` }));
    const usesValues = Boolean(raster.valueUrl && raster.valueRange && filter);
    if (usesValues && filter.deband) {
      overlays.push(new DebandedOverlay(raster.valueUrl, raster.bounds, options, filter, raster));
      return overlays;
    }
    const overlay = L.imageOverlay(usesValues ? raster.valueUrl : raster.imageUrl, raster.bounds, options);
    if (usesValues) overlay.on("add", () => { overlay.getElement().style.filter = filter.css; });
    overlays.push(overlay);
    return overlays;
  });
}

// Keeps a layer's colours fitted to what is on screen: after each pan or zoom (and once the
// samples are in), works out the range across every raster set given (all animation frames
// share one range) and updates the filter. onRange(low, high) updates the legend.
export function fitPaletteToView(map, rasterSets, kind, filter, onRange) {
  const temperatureLayer = ["temperature", "air-temperature"].includes(kind);
  const fixedTemperatureRange = PALETTE_FIT[kind]?.fixed || TEMPERATURE_COLOR_RANGE_C;
  const stops = PALETTE_STOPS[kind] || PALETTE_STOPS.temperature;
  // Calm-to-rough colours change shape with the range: the calm blues keep their absolute height.
  const stopsFor = (high) => CALM_ROUGH_LAYERS[kind]?.stops(high) || stops;
  const rasters = rasterSets.flat().filter((raster) => raster?.valueUrl && raster.valueRange);
  let samples = [], timer = null, active = true, shown = null, samplePromise = null;
  let temperatureMode = savedTemperatureColorMode();
  const ranges = rasters.map((raster) => raster.valueRange);
  const origin = Math.min(...ranges.map((range) => range[0]));
  const end = Math.max(...ranges.map((range) => range[1]));
  const binWidth = Math.max(end - origin, 1e-6) / HISTOGRAM_BINS;
  const valueRange = ranges[0];

  function ensureSamples() {
    if (samplePromise) return samplePromise;
    samplePromise = Promise.all(rasters.map((raster) => loadSample(raster).catch(() => null))).then((loaded) => {
      samples = loaded.filter(Boolean);
      if (active && (!temperatureLayer || temperatureMode === "dynamic")) refit();
    });
    return samplePromise;
  }

  function refit() {
    if (!active || !samples.length) return;
    if (temperatureLayer && temperatureMode !== "dynamic") return;
    const bounds = map.getBounds();
    const view = { south: bounds.getSouth(), north: bounds.getNorth(), west: bounds.getWest(), east: bounds.getEast() };
    const range = fitRange(visibleHistogram(samples, view, origin, binWidth), binWidth, origin, kind, temperatureMode);
    if (!range) return;
    // Small shifts while panning across uniform water are not worth a repaint.
    if (shown && Math.abs(range[0] - shown[0]) + Math.abs(range[1] - shown[1]) < (shown[1] - shown[0]) * 0.01) return;
    shown = range;
    filter.set(valueRange, range[0], range[1], stopsFor(range[1]));
    onRange?.(range[0], range[1]);
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refit, REFIT_DELAY_MS); };

  function applyTemperatureMode(mode) {
    temperatureMode = mode === "fixed" || mode === "dynamic" ? mode : DEFAULT_TEMPERATURE_COLOR_MODE;
    if (temperatureMode === "dynamic") {
      shown = null;
      if (rasters.length) {
        map.on("moveend zoomend resize", schedule);
        if (samples.length) {
          refit();
        } else {
          const [low, high] = fixedTemperatureRange;
          if (valueRange) filter.set(valueRange, low, high, stops);
          onRange?.(low, high);
          void ensureSamples();
        }
      }
      return;
    }
    clearTimeout(timer);
    map.off("moveend zoomend resize", schedule);
    const [low, high] = fixedTemperatureRange;
    shown = [low, high];
    if (valueRange) filter.set(valueRange, low, high, stops);
    onRange?.(low, high);
  }

  const modeChanged = (event) => applyTemperatureMode(event.detail?.mode);
  if (temperatureLayer) {
    document.addEventListener("glc-temperature-color-mode-changed", modeChanged);
    applyTemperatureMode(temperatureMode);
    return {
      refit() { if (temperatureMode === "dynamic") refit(); },
      stop() {
        active = false;
        clearTimeout(timer);
        map.off("moveend zoomend resize", schedule);
        document.removeEventListener("glc-temperature-color-mode-changed", modeChanged);
        filter.remove();
      }
    };
  }

  if (rasters.length) {
    const calmRough = CALM_ROUGH_LAYERS[kind];
    if (calmRough) {
      // Until the samples are in, use the default scale (red at 8 ft waves or 25 kn wind).
      filter.set(valueRange, 0, calmRough.defaultMaximum, stopsFor(calmRough.defaultMaximum));
      onRange?.(0, calmRough.defaultMaximum);
    } else {
      // Until the samples are in, colour over the whole range as the server would.
      filter.set(valueRange, valueRange[0], valueRange[1], stops);
    }
    void ensureSamples();
    map.on("moveend zoomend resize", schedule);
  }
  return {
    refit,
    stop() {
      active = false;
      clearTimeout(timer);
      map.off("moveend zoomend resize", schedule);
      filter.remove();
    }
  };
}
