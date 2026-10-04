import { html, setHtml } from "./html.js";
import { L } from "./vendor.js";
import {
  announceGreatLakesLayer,
  clearGreatLakesVisuals,
  createParticleLayer,
  createWaveArrowLayer,
  friendlyTime,
  greatLakesConditionsLayer,
  greatLakesControlValue,
  modelDepthNote,
  modelDepthShown,
  renderGreatLakesCurrents,
  setCurrentLegendRange,
  setCurrentSpeedMax,
  setGreatLakesStatus,
  setTemperatureLegendRange,
  setThermoclineLegendRange,
  setWaveLegendRange,
  tooShallowNote
} from "./great-lakes-conditions.js";

// Forecast animation: the chosen layer stepped through the next 48 hours,
// every 3 hours, with one colour scale for every frame (the server picks it),
// so colours only change where the water does. Every frame is downloaded
// first, then frames cross-fade; currents keep their particles flowing and
// only swap the field under them.
export const ANIMATION_FRAME_MS = 900;
// The last frame is held a little longer before the loop starts again.
export const ANIMATION_LAST_FRAME_MS = 1800;
export const ANIMATION_POLL_MS = 1500;
export const ANIMATION_FETCH_CONCURRENCY = 4;
export const ANIMATION_IDLE_LABEL = "Play the next 48 hours";
const RASTER_STYLES = {
  temperature: { className: "great-lakes-temperature-raster", opacity: 0.9 },
  thermocline: { className: "great-lakes-thermocline-raster", opacity: 0.88 },
  currents: { className: "great-lakes-current-raster", opacity: 0.8 },
  waves: { className: "great-lakes-wave-raster", opacity: 0.86 }
};

const state = {
  active: false,
  playing: false,
  layer: "",
  depth: 0,
  frames: [],
  payloads: [],
  backgroundPayloads: null,
  overlays: [],
  index: 0,
  timer: null,
  particles: null,
  arrows: null,
  waveArrows: null,
  map: null
};
const payloadCache = new Map();
const PAYLOAD_CACHE_LIMIT = 80;

export function greatLakesAnimationActive() {
  return state.active;
}

// The hour the map is showing, for readings at a clicked point.
export function greatLakesAnimationForecastHour() {
  return state.active && state.frames[state.index] ? String(state.frames[state.index].forecastHour) : null;
}

export function greatLakesTimelineHtml() {
  return html`<div class="great-lakes-timeline" data-gl-timeline>
    <button type="button" class="great-lakes-play" data-gl-play aria-label="Play the forecast" aria-pressed="false" title="Play the forecast">${playIconHtml(false)}</button>
    <div class="great-lakes-timeline-track">
      <input type="range" data-gl-frame min="0" max="16" step="1" value="0" disabled aria-label="Forecast time" />
      <span class="great-lakes-timeline-label" data-gl-frame-label aria-live="off">${ANIMATION_IDLE_LABEL}</span>
    </div>
    <button type="button" class="great-lakes-timeline-stop" data-gl-animation-stop aria-label="Stop the animation" title="Back to the forecast choice" hidden>×</button>
  </div>`;
}

function playIconHtml(playing) {
  return playing
    ? html`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`
    : html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>`;
}

// "Now · 7 PM", "Sat 3 AM": short enough to sit under the slider.
export function animationFrameLabel(validTime, index = 0) {
  const date = new Date(validTime);
  if (Number.isNaN(date.getTime())) return index === 0 ? "Now" : "";
  const time = date.toLocaleTimeString([], date.getMinutes() ? { hour: "numeric", minute: "2-digit" } : { hour: "numeric" });
  if (index === 0) return `Now · ${time}`;
  return `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

// The frame nearest a valid time, so a reload (new layer, depth, or data) keeps the time on screen.
export function nearestFrameIndex(frames, validTime) {
  const target = Date.parse(validTime);
  if (!Number.isFinite(target) || !frames.length) return 0;
  let best = 0;
  frames.forEach((frame, index) => {
    if (Math.abs(Date.parse(frame.validTime) - target) < Math.abs(Date.parse(frames[best].validTime) - target)) best = index;
  });
  return best;
}

export function setupGreatLakesTimeline(host, reload) {
  const play = host.querySelector("[data-gl-play]");
  const slider = host.querySelector("[data-gl-frame]");
  const stop = host.querySelector("[data-gl-animation-stop]");
  if (!play || !slider || !stop) return;
  play.addEventListener("click", () => {
    if (!state.active) {
      state.active = true;
      state.playing = true;
      syncTimelineControls();
      reload();
      return;
    }
    state.playing = !state.playing;
    syncTimelineControls();
    if (state.playing) scheduleNextFrame();
    else clearTimeout(state.timer);
  });
  slider.addEventListener("input", () => {
    if (!state.frames.length) return;
    state.playing = false;
    clearTimeout(state.timer);
    showFrame(Number(slider.value));
    syncTimelineControls();
  });
  stop.addEventListener("click", () => {
    stopGreatLakesAnimation();
    reload();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.playing) scheduleNextFrame(); });
}

export function syncTimelineControls() {
  const play = document.querySelector("[data-gl-play]");
  const slider = document.querySelector("[data-gl-frame]");
  const stop = document.querySelector("[data-gl-animation-stop]");
  const label = document.querySelector("[data-gl-frame-label]");
  document.querySelector("[data-gl-timeline]")?.classList.toggle("is-active", state.active);
  if (play) {
    setHtml(play, playIconHtml(state.playing));
    play.setAttribute("aria-pressed", String(state.playing));
    const action = state.playing ? "Pause the forecast" : "Play the forecast";
    play.setAttribute("aria-label", action);
    play.title = action;
  }
  if (stop) stop.hidden = !state.active;
  if (slider) {
    slider.disabled = !state.frames.length;
    slider.max = String(Math.max(0, state.frames.length - 1));
    slider.value = String(state.index);
  }
  if (label && !state.active) label.textContent = ANIMATION_IDLE_LABEL;
}

export function stopGreatLakesAnimation() {
  state.active = false;
  state.playing = false;
  clearTimeout(state.timer);
  clearGreatLakesAnimationVisuals();
  state.frames = [];
  state.payloads = [];
  state.backgroundPayloads = null;
  state.index = 0;
  syncTimelineControls();
}

// Called by clearGreatLakesVisuals: the overlays themselves live in the shared layer group.
export function clearGreatLakesAnimationVisuals() {
  clearTimeout(state.timer);
  state.particles?.remove();
  state.particles = null;
  state.arrows?.remove();
  state.arrows = null;
  state.waveArrows?.remove();
  state.waveArrows = null;
  state.overlays = [];
}

function sleep(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

// Frames the server has not drawn yet (a deeper level) are prepared on request; poll until ready.
async function animationIndex(layer, depth, signal, isCurrent) {
  for (;;) {
    const index = await window.noaaGreatLakesApi.animation({ layer, depth, signal });
    if (index.ready) return index;
    if (index.error) throw new Error(index.error);
    if (!isCurrent()) throw new DOMException("Superseded", "AbortError");
    const { done = 0, total = 0 } = index.progress || {};
    setGreatLakesStatus(`Preparing the forecast animation… ${total ? Math.round((done / total) * 100) : 0}%`);
    await sleep(ANIMATION_POLL_MS, signal);
  }
}

// A slow image must not hold up the whole animation; it finishes loading on screen.
const IMAGE_PRELOAD_LIMIT_MS = 10000;

function preloadImages(payload) {
  return Promise.all((payload?.rasters || []).map((raster) => new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(resolve, IMAGE_PRELOAD_LIMIT_MS);
    image.onload = image.onerror = () => { clearTimeout(timer); resolve(); };
    image.src = raster.imageUrl;
  })));
}

async function framePayload(url, signal) {
  const cached = payloadCache.get(url);
  if (cached) return cached;
  const payload = await window.noaaGreatLakesApi.animationFrame({ url, signal });
  await preloadImages(payload);
  payloadCache.set(url, payload);
  while (payloadCache.size > PAYLOAD_CACHE_LIMIT) payloadCache.delete(payloadCache.keys().next().value);
  return payload;
}

export async function loadGreatLakesAnimation(map, { layer, depth, signal, isCurrent }) {
  state.map = map;
  clearTimeout(state.timer);
  const shownTime = state.frames[state.index]?.validTime;
  const background = layer === "currents" ? greatLakesControlValue("current-background") : "";
  setGreatLakesStatus("Preparing the forecast animation…");
  try {
    const [index, temperatureIndex] = await Promise.all([
      animationIndex(layer, depth, signal, isCurrent),
      background === "temperature" ? animationIndex("temperature", depth, signal, isCurrent) : null
    ]);
    if (!isCurrent()) return false;
    const urls = [...index.frames.map((frame) => frame.url), ...(temperatureIndex?.frames || []).map((frame) => frame.url)];
    let loaded = 0;
    const payloads = await mapLimit(urls, ANIMATION_FETCH_CONCURRENCY, async (url) => {
      const payload = await framePayload(url, signal);
      loaded += 1;
      if (isCurrent()) setGreatLakesStatus(`Loading the forecast animation… ${loaded} of ${urls.length}`);
      return payload;
    });
    if (!isCurrent()) return false;
    clearGreatLakesVisuals();
    state.layer = layer;
    state.depth = Number(depth) || 0;
    state.frames = index.frames;
    state.payloads = payloads.slice(0, index.frames.length);
    state.backgroundPayloads = temperatureIndex ? payloads.slice(index.frames.length) : null;
    buildFrames(map, background);
    const first = state.payloads[0]?.metadata || {};
    if (layer === "temperature") setTemperatureLegendRange(first);
    else if (layer === "thermocline") setThermoclineLegendRange(first);
    else if (layer === "waves") setWaveLegendRange(first);
    else {
      setCurrentLegendRange(first);
      setCurrentSpeedMax(first);
      if (state.backgroundPayloads) setTemperatureLegendRange(state.backgroundPayloads[0]?.metadata || {});
    }
    state.index = shownTime ? nearestFrameIndex(state.frames, shownTime) : 0;
    showFrame(state.index);
    announceGreatLakesLayer(layer, first, state.backgroundPayloads?.[0]?.metadata || (layer === "temperature" ? first : null));
    syncTimelineControls();
    if (state.playing) scheduleNextFrame();
    return true;
  } catch (error) {
    if (error.name !== "AbortError" && isCurrent()) {
      state.playing = false;
      syncTimelineControls();
      setGreatLakesStatus("The forecast animation is unavailable right now. Try again shortly.", true);
    }
    return false;
  }
}

function buildFrames(map, background) {
  const layer = state.layer;
  const rasterPayloads = layer === "currents"
    ? (background === "temperature" ? state.backgroundPayloads : background === "none" ? null : state.payloads)
    : state.payloads;
  const style = RASTER_STYLES[layer === "currents" && background === "temperature" ? "temperature" : layer];
  state.overlays = state.payloads.map((_, index) => (rasterPayloads?.[index]?.rasters || []).map((raster) => {
    const overlay = L.imageOverlay(raster.imageUrl, raster.bounds, {
      opacity: 0, interactive: false, className: `${style.className} great-lakes-animation-frame`
    });
    overlay.targetOpacity = style.opacity;
    return overlay.addTo(greatLakesConditionsLayer);
  }));
  if (layer !== "currents") return;
  const display = greatLakesControlValue("current-display");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (display === "flow" && !reduced && (state.payloads[0]?.fields || []).length) {
    state.particles = createParticleLayer(map, state.payloads[0].fields).addTo(map);
  } else if (display !== "off") {
    state.arrows = L.layerGroup().addTo(map);
  }
}

function showFrame(index) {
  if (!state.frames.length) return;
  state.index = Math.max(0, Math.min(state.frames.length - 1, index));
  const payload = state.payloads[state.index] || {};
  // Only opacities change, so frames cross-fade (see .great-lakes-animation-frame).
  state.overlays.forEach((overlays, frame) => overlays.forEach((overlay) => overlay.setOpacity(frame === state.index ? overlay.targetOpacity : 0)));
  if (state.layer === "currents") {
    if (state.particles && payload.fields?.length) state.particles.setFields(payload.fields);
    if (state.arrows) {
      state.arrows.clearLayers();
      renderGreatLakesCurrents(payload.data || [], state.map.getZoom(), state.arrows);
    }
  }
  if (state.layer === "waves") {
    state.waveArrows?.remove();
    state.waveArrows = greatLakesControlValue("wave-display") !== "off" && (payload.arrows || []).length
      ? createWaveArrowLayer(state.map, payload.arrows).addTo(state.map)
      : null;
  }
  const frame = state.frames[state.index];
  const label = animationFrameLabel(frame.validTime, state.index);
  const slider = document.querySelector("[data-gl-frame]");
  if (slider) {
    slider.value = String(state.index);
    slider.setAttribute("aria-valuetext", label);
  }
  const labelNode = document.querySelector("[data-gl-frame-label]");
  if (labelNode) labelNode.textContent = label;
  const metadata = payload.metadata || {};
  const models = [...(metadata.models || []), ...(state.backgroundPayloads?.[state.index]?.metadata?.models || [])];
  const unavailable = models.some((model) => !model.available);
  const shownDepth = state.layer === "thermocline" || state.layer === "waves" ? null : modelDepthShown(state.backgroundPayloads?.[state.index]?.metadata || metadata);
  const time = frame.validTime ? friendlyTime(frame.validTime) : "";
  setGreatLakesStatus(`${unavailable ? "Data is missing for one or more lakes in this frame. " : ""}${time ? `Showing the forecast for ${time}.` : "Showing the forecast."} Every 3 hours over the next 48, on one colour scale.${modelDepthNote(state.depth, shownDepth)}${tooShallowNote(models)}`, unavailable);
  document.dispatchEvent(new CustomEvent("great-lakes-frame-shown", { detail: { layer: state.layer, metadata: { ...metadata, validTime: frame.validTime }, depth: state.depth } }));
}

function scheduleNextFrame() {
  clearTimeout(state.timer);
  if (!state.playing || state.frames.length < 2) return;
  const wait = state.index === state.frames.length - 1 ? ANIMATION_LAST_FRAME_MS : ANIMATION_FRAME_MS;
  state.timer = setTimeout(() => {
    if (!state.playing) return;
    if (document.hidden) return;  // Resumed by visibilitychange.
    showFrame((state.index + 1) % state.frames.length);
    scheduleNextFrame();
  }, wait);
}

// Exposed for tests.
export const animationState = state;
