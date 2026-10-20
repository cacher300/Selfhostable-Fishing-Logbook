// Morph forecast depth fields before colouring them. One canvas per lake stays
// at full opacity; moving contours never crossfade two translucent map layers.
import { L } from "./vendor.js";
import { paletteRgb, PALETTE_STOPS } from "./great-lakes-palette.js";

const MAX_DIMENSION = 320;
const FLOW_STEP = 8;
const MIXED = [104, 116, 132];

const CanvasOverlay = L.ImageOverlay.extend({
  _initImage() {
    this._image = this._url;
    L.DomUtil.addClass(this._image, "leaflet-image-layer");
    if (this._zoomAnimated) L.DomUtil.addClass(this._image, "leaflet-zoom-animated");
    L.DomUtil.addClass(this._image, this.options.className);
  }
});

function sample(data, width, height, x, y, channel = 0) {
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));
  const left = Math.floor(x), top = Math.floor(y);
  const right = Math.min(left + 1, width - 1), bottom = Math.min(top + 1, height - 1);
  const dx = x - left, dy = y - top;
  const at = (px, py) => data[(py * width + px) * 4 + channel];
  return (at(left, top) * (1 - dx) + at(right, top) * dx) * (1 - dy)
    + (at(left, bottom) * (1 - dx) + at(right, bottom) * dx) * dy;
}

// Local optical flow estimates how depth contours moved between forecasts.
// This is visual interpolation, not a measured water-current vector field.
export function depthFlow(from, to, width, height) {
  const columns = Math.ceil(width / FLOW_STEP), rows = Math.ceil(height / FLOW_STEP);
  const vectors = new Float32Array(columns * rows * 2);
  const at = (data, x, y) => data[(y * width + x) * 4];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let xx = 0, xy = 0, yy = 0, xt = 0, yt = 0;
      const cx = column * FLOW_STEP, cy = row * FLOW_STEP;
      for (let y = Math.max(1, cy - 4); y <= Math.min(height - 2, cy + 4); y += 1) {
        for (let x = Math.max(1, cx - 4); x <= Math.min(width - 2, cx + 4); x += 1) {
          // Missing depth / mixed water must not pull valid contours ashore.
          if (![from, to].every((data) => [[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].every(([px, py]) => data[(py * width + px) * 4 + 3] > 240))) continue;
          const gx = (at(from, x + 1, y) - at(from, x - 1, y) + at(to, x + 1, y) - at(to, x - 1, y)) / 4;
          const gy = (at(from, x, y + 1) - at(from, x, y - 1) + at(to, x, y + 1) - at(to, x, y - 1)) / 4;
          const dt = at(to, x, y) - at(from, x, y);
          xx += gx * gx; xy += gx * gy; yy += gy * gy;
          xt += gx * dt; yt += gy * dt;
        }
      }
      // Regularization also gives a stable normal velocity for a straight front.
      xx += 4; yy += 4;
      const determinant = xx * yy - xy * xy;
      const offset = (row * columns + column) * 2;
      vectors[offset] = Math.max(-6, Math.min(6, (xy * yt - yy * xt) / determinant));
      vectors[offset + 1] = Math.max(-6, Math.min(6, (xy * xt - xx * yt) / determinant));
    }
  }
  return { vectors, columns, rows };
}

function velocity(flow, x, y, channel) {
  const gx = Math.min(flow.columns - 1, x / FLOW_STEP), gy = Math.min(flow.rows - 1, y / FLOW_STEP);
  const left = Math.floor(gx), top = Math.floor(gy);
  const right = Math.min(left + 1, flow.columns - 1), bottom = Math.min(top + 1, flow.rows - 1);
  const dx = gx - left, dy = gy - top;
  const at = (px, py) => flow.vectors[(py * flow.columns + px) * 2 + channel];
  return (at(left, top) * (1 - dx) + at(right, top) * dx) * (1 - dy)
    + (at(left, bottom) * (1 - dx) + at(right, bottom) * dx) * dy;
}

export function morphDepth(from, to, output, width, height, progress, flow, colors) {
  progress = Math.max(0, Math.min(1, progress));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const vx = flow ? velocity(flow, x, y, 0) : 0, vy = flow ? velocity(flow, x, y, 1) : 0;
      const ax = x - vx * progress, ay = y - vy * progress;
      const bx = x + vx * (1 - progress), by = y + vy * (1 - progress);
      const a = sample(from.values, width, height, ax, ay, 3) / 255;
      const b = sample(to.values, width, height, bx, by, 3) / 255;
      const weight = a * (1 - progress) + b * progress;
      const level = weight ? (sample(from.values, width, height, ax, ay) * a * (1 - progress)
        + sample(to.values, width, height, bx, by) * b * progress) / weight : 0;
      const color = colors[Math.max(0, Math.min(255, Math.round(level)))];
      // Keep the geographic water mask fixed while the depth field moves.
      const water = from.water[offset + 3] * (1 - progress) + to.water[offset + 3] * progress;
      const coverage = from.mixed || to.mixed ? (water ? Math.min(1, weight * 255 / water) : 0) : 1;
      for (let channel = 0; channel < 3; channel += 1) {
        output[offset + channel] = color[channel] * coverage + MIXED[channel] * (1 - coverage);
      }
      output[offset + 3] = water;
    }
  }
}

async function readImage(url, width, height) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = width || Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = height || Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function emptyPixels(width, height) {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

function rasterKey(raster) {
  return JSON.stringify(raster.bounds);
}

// Interpolate the scalar value rasters before the palette filter colours them.
// This moves fronts and gradients through intermediate values instead of
// fading one completed forecast image over another.
export async function createScalarRasterTransition(fromRasters, toRasters, options, filter) {
  const rasters = new Map();
  (fromRasters || []).forEach((raster) => rasters.set(rasterKey(raster), { from: raster }));
  (toRasters || []).forEach((raster) => {
    const pair = rasters.get(rasterKey(raster)) || {};
    pair.to = raster;
    rasters.set(rasterKey(raster), pair);
  });
  const pairs = [...rasters.values()].filter(({ from, to }) => (from?.valueUrl || to?.valueUrl) && (from?.valueRange || to?.valueRange));
  if (!pairs.length) return null;

  const lakes = await Promise.all(pairs.map(async ({ from, to }) => {
    const first = from?.valueUrl ? from : to;
    const reference = await readImage(first.valueUrl);
    const { width, height } = reference;
    const readRaster = async (imageUrl) => imageUrl
      ? readImage(imageUrl, width, height)
      : emptyPixels(width, height);
    const [fromValues, toValues, fromMixed, toMixed] = await Promise.all([
      readRaster(from?.valueUrl),
      readRaster(to?.valueUrl),
      readRaster(from?.mixedUrl),
      readRaster(to?.mixedUrl)
    ]);
    const range = from?.valueRange || to?.valueRange;
    const fromRange = from?.valueRange || range;
    const toRange = to?.valueRange || range;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    const output = context.createImageData(width, height);
    const valueOverlay = new CanvasOverlay(canvas, first.bounds, { ...options, opacity: 1 });
    valueOverlay.on("add", () => {
      if (filter?.css) valueOverlay.getElement().style.filter = filter.css;
    });

    let mixedOverlay = null, mixedCanvas = null, mixedContext = null, mixedOutput = null;
    if (from?.mixedUrl || to?.mixedUrl) {
      mixedCanvas = document.createElement("canvas");
      mixedCanvas.width = width;
      mixedCanvas.height = height;
      mixedContext = mixedCanvas.getContext("2d");
      mixedOutput = mixedContext.createImageData(width, height);
      mixedOverlay = new CanvasOverlay(mixedCanvas, first.bounds, {
        ...options,
        opacity: 1,
        className: `${options.className || ""} great-lakes-mixed-raster`
      });
    }

    return {
      fromValues: fromValues.data,
      toValues: toValues.data,
      fromMixed: fromMixed.data,
      toMixed: toMixed.data,
      fromRange,
      toRange,
      range,
      width,
      height,
      context,
      output,
      valueOverlay,
      mixedContext,
      mixedOutput,
      mixedOverlay
    };
  }));

  let animationFrame = null, progress = 0;
  function draw(nextProgress) {
    progress = Math.max(0, Math.min(1, nextProgress));
    lakes.forEach((lake) => {
      const { fromValues, toValues, fromRange, toRange, range, output, width, height } = lake;
      const fromSpan = Math.max(fromRange[1] - fromRange[0], 1e-9);
      const toSpan = Math.max(toRange[1] - toRange[0], 1e-9);
      const outputSpan = Math.max(range[1] - range[0], 1e-9);
      for (let offset = 0; offset < width * height * 4; offset += 4) {
        const fromAlpha = fromValues[offset + 3];
        const toAlpha = toValues[offset + 3];
        const fromValue = fromRange[0] + fromValues[offset] / 255 * fromSpan;
        const toValue = toRange[0] + toValues[offset] / 255 * toSpan;
        const value = fromAlpha && toAlpha
          ? fromValue + (toValue - fromValue) * progress
          : fromAlpha ? fromValue : toValue;
        const gray = Math.max(0, Math.min(255, Math.round((value - range[0]) / outputSpan * 255)));
        output.data[offset] = gray;
        output.data[offset + 1] = gray;
        output.data[offset + 2] = gray;
        output.data[offset + 3] = Math.round(fromAlpha + (toAlpha - fromAlpha) * progress);
      }
      lake.context.putImageData(output, 0, 0);

      if (lake.mixedOutput) {
        const { fromMixed, toMixed, mixedOutput, mixedContext } = lake;
        for (let offset = 0; offset < width * height * 4; offset += 4) {
          const fromWeight = fromMixed[offset + 3] * (1 - progress);
          const toWeight = toMixed[offset + 3] * progress;
          const weight = fromWeight + toWeight;
          for (let channel = 0; channel < 3; channel += 1) {
            mixedOutput.data[offset + channel] = weight
              ? (fromMixed[offset + channel] * fromWeight + toMixed[offset + channel] * toWeight) / weight
              : MIXED[channel];
          }
          mixedOutput.data[offset + 3] = Math.min(255, Math.round(weight));
        }
        mixedContext.putImageData(mixedOutput, 0, 0);
      }
    });
  }

  draw(0);
  const overlays = lakes.flatMap(({ mixedOverlay, valueOverlay }) => [mixedOverlay, valueOverlay].filter(Boolean));
  return {
    progress: 0,
    addTo(group) { overlays.forEach((overlay) => overlay.addTo(group)); },
    setZIndex(zIndex) { overlays.forEach((overlay) => overlay.setZIndex(zIndex)); },
    show(value) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
      draw(value);
      this.progress = progress;
    },
    transition(duration) {
      cancelAnimationFrame(animationFrame);
      const started = performance.now();
      const update = (now) => {
        if (document.hidden) { animationFrame = null; return; }
        const value = Math.max(0, Math.min(1, (now - started) / duration));
        draw(value);
        this.progress = progress;
        animationFrame = value < 1 ? requestAnimationFrame(update) : null;
      };
      if (duration <= 0) this.show(1);
      else animationFrame = requestAnimationFrame(update);
    },
    remove() {
      cancelAnimationFrame(animationFrame);
      overlays.forEach((overlay) => overlay.remove());
    }
  };
}

export async function createThermoclineFlow(payloads, options) {
  // Legacy colour-only responses retain instant forecast switching.
  if (!payloads.some((payload) => payload.rasters?.length)) return null;
  if (payloads.some((payload) => (payload.rasters || []).some((raster) => !raster.valueUrl || !raster.valueRange))) return null;
  const keys = [...new Set(payloads.flatMap((payload) => (payload.rasters || []).map((raster) => JSON.stringify(raster.bounds))))];
  const lakes = await Promise.all(keys.map(async (key) => {
    const rasters = payloads.map((payload) => payload.rasters?.find((raster) => JSON.stringify(raster.bounds) === key));
    const first = rasters.find(Boolean);
    const reference = await readImage(first.valueUrl);
    const { width, height } = reference;
    const frames = await Promise.all(rasters.map(async (raster) => {
      if (!raster) return { values: new Uint8ClampedArray(width * height * 4), water: new Uint8ClampedArray(width * height * 4) };
      const values = await readImage(raster.valueUrl, width, height);
      // Value and mixed images partition the same water mask. Recombine their
      // alpha for the morph without requiring a second coloured frame image.
      const water = new Uint8ClampedArray(values.data);
      if (raster.mixedUrl) {
        const mixed = await readImage(raster.mixedUrl, width, height);
        for (let offset = 3; offset < water.length; offset += 4) {
          water[offset] = Math.min(255, water[offset] + mixed.data[offset]);
        }
      }
      return { values: values.data, water, mixed: Boolean(raster.mixedUrl) };
    }));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    const output = context.createImageData(width, height);
    const overlay = new CanvasOverlay(canvas, first.bounds, { ...options, opacity: 1 });
    return { frames, width, height, context, output, overlay, range: first.valueRange, flows: new Map() };
  }));
  let frame = null, colors = [];
  function setRange(low, high) {
    colors = lakes.map(({ range }) => Array.from({ length: 256 }, (_, level) => paletteRgb(
      (range[0] + level / 255 * (range[1] - range[0]) - low) / Math.max(high - low, 1e-9), PALETTE_STOPS.thermocline)));
  }
  setRange(...lakes[0].range);
  function draw(from, to = from, progress = 0) {
    lakes.forEach((lake, index) => {
      const key = `${from}:${to}`;
      if (from !== to && !lake.flows.has(key)) lake.flows.set(key, depthFlow(lake.frames[from].values, lake.frames[to].values, lake.width, lake.height));
      morphDepth(lake.frames[from], lake.frames[to], lake.output.data, lake.width, lake.height, progress, lake.flows.get(key), colors[index]);
      lake.context.putImageData(lake.output, 0, 0);
    });
  }
  return {
    addTo(group) { lakes.forEach(({ overlay }) => overlay.addTo(group)); },
    setRange,
    show(index) { cancelAnimationFrame(frame); frame = null; draw(index); },
    transition(from, to, duration) {
      cancelAnimationFrame(frame);
      const started = performance.now();
      const update = (now) => {
        if (document.hidden) { frame = null; return; }
        const progress = Math.max(0, Math.min(1, (now - started) / duration));
        draw(from, to, progress);
        frame = progress < 1 ? requestAnimationFrame(update) : null;
      };
      frame = requestAnimationFrame(update);
    },
    remove() { cancelAnimationFrame(frame); lakes.forEach(({ overlay }) => overlay.remove()); }
  };
}
