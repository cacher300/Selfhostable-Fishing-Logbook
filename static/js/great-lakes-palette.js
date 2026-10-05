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
export const PALETTE_STOPS = Object.freeze({
  temperature: TEMPERATURE_STOPS,
  thermocline: TEMPERATURE_STOPS,
  currents: [[0, [22, 58, 128]], [0.22, [40, 92, 178]], [0.45, [98, 70, 186]], [0.68, [172, 60, 170]], [0.86, [232, 86, 118]], [1, [252, 158, 72]]],
  waves: [[0, [30, 64, 150]], [0.18, [26, 120, 210]], [0.36, [20, 190, 214]], [0.54, [118, 222, 122]], [0.7, [250, 224, 60]], [0.85, [250, 138, 40]], [1, [222, 40, 92]]],
  upwelling: [[0, [20, 54, 160]], [0.22, [38, 112, 222]], [0.38, [126, 196, 250]], [0.5, [236, 240, 245]], [0.62, [252, 178, 122]], [0.78, [232, 92, 54]], [1, [168, 24, 36]]]
});
// How the range is trimmed and how narrow it may get, as the server does for the whole map:
// a few outlying pixels do not stretch the colours, and model noise in uniform water is not
// blown up into dramatic colour changes. Speed and wave height always start at still water.
export const PALETTE_FIT = Object.freeze({
  temperature: { low: 0.005, high: 0.995, minimumSpan: 3 },
  thermocline: { low: 0.02, high: 0.98, minimumSpan: 2, floor: 0 },
  currents: { low: 0, high: 0.98, zeroBased: true, minimumMaximum: 0.08 },
  waves: { low: 0, high: 0.995, zeroBased: true, minimumMaximum: 1 },
  // Upwelling strength (°F, negative upwelling) keeps one scale, so a colour always means the same strength.
  upwelling: { fixed: [-8, 8] }
});
// Width of the kept copies of the value images; plenty to find a range.
const SAMPLE_WIDTH = 320;
// A pixel counts once it is mostly water (shorelines blend into the map).
const SAMPLE_MIN_ALPHA = 200;
const HISTOGRAM_BINS = 512;
const REFIT_DELAY_MS = 120;
let filterCount = 0;

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
export function fitRange(histogram, binWidth, origin, kind) {
  const rule = PALETTE_FIT[kind] || PALETTE_FIT.temperature;
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

// One filter (a palette over a range) shared by every image of a layer, including animation frames.
export function createPaletteFilter() {
  filterCount += 1;
  const id = `gl-palette-${filterCount}`;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  const filter = document.createElementNS(SVG_NS, "filter");
  filter.id = id;
  // sRGB: the grey levels are palette positions, not light intensities to linearize.
  filter.setAttribute("color-interpolation-filters", "sRGB");
  const transfer = document.createElementNS(SVG_NS, "feComponentTransfer");
  const functions = ["R", "G", "B"].map((channel) => {
    const node = document.createElementNS(SVG_NS, `feFunc${channel}`);
    node.setAttribute("type", "table");
    transfer.append(node);
    return node;
  });
  filter.append(transfer);
  svg.append(filter);
  document.body.append(svg);
  return {
    css: `url(#${id})`,
    set(valueRange, low, high, stops) {
      paletteTables(valueRange, low, high, stops).forEach((table, index) => functions[index].setAttribute("tableValues", table));
    },
    remove() { svg.remove(); }
  };
}

// Overlays for a layer's lake images: value images through the palette filter, with the
// thermocline's mixed water as its own image underneath when a server sends one. Older payloads without
// value images fall back to the coloured images.
export function paletteOverlays(rasters, filter, options) {
  return (rasters || []).flatMap((raster) => {
    const overlays = [];
    if (raster.mixedUrl) overlays.push(L.imageOverlay(raster.mixedUrl, raster.bounds, { ...options, className: `${options.className || ""} great-lakes-mixed-raster` }));
    const usesValues = Boolean(raster.valueUrl && raster.valueRange && filter);
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
  const stops = PALETTE_STOPS[kind] || PALETTE_STOPS.temperature;
  const rasters = rasterSets.flat().filter((raster) => raster?.valueUrl && raster.valueRange);
  let samples = [], timer = null, active = true, shown = null;
  const ranges = rasters.map((raster) => raster.valueRange);
  const origin = Math.min(...ranges.map((range) => range[0]));
  const end = Math.max(...ranges.map((range) => range[1]));
  const binWidth = Math.max(end - origin, 1e-6) / HISTOGRAM_BINS;
  const valueRange = ranges[0];

  function refit() {
    if (!active || !samples.length) return;
    const bounds = map.getBounds();
    const view = { south: bounds.getSouth(), north: bounds.getNorth(), west: bounds.getWest(), east: bounds.getEast() };
    const range = fitRange(visibleHistogram(samples, view, origin, binWidth), binWidth, origin, kind);
    if (!range) return;
    // Small shifts while panning across uniform water are not worth a repaint.
    if (shown && Math.abs(range[0] - shown[0]) + Math.abs(range[1] - shown[1]) < (shown[1] - shown[0]) * 0.01) return;
    shown = range;
    filter.set(valueRange, range[0], range[1], stops);
    onRange?.(range[0], range[1]);
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refit, REFIT_DELAY_MS); };

  if (rasters.length) {
    // Until the samples are in, colour over the whole range as the server would.
    filter.set(valueRange, valueRange[0], valueRange[1], stops);
    Promise.all(rasters.map((raster) => loadSample(raster).catch(() => null))).then((loaded) => {
      samples = loaded.filter(Boolean);
      refit();
    });
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
