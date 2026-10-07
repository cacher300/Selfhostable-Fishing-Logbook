import { html, setHtml } from "./html.js";
import { L } from "./vendor.js";
import {
  announceGreatLakesLayer,
  clearGreatLakesVisuals,
  createParticleLayer,
  createWaveArrowLayer,
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
  showPaletteRange,
  tooShallowNote,
  waveParticleFields
} from "./great-lakes-conditions.js";
import { createPaletteFilter, fitPaletteToView, paletteOverlays } from "./great-lakes-palette.js";

// Forecast animation: the chosen layer stepped through the next 48 hours,
// every 3 hours, with one colour scale for every frame (the server picks it),
// so colours only change where the water does. Every frame is downloaded
// first, then each frame fades in over the one before it (which stays drawn
// underneath, so colours blend straight into each other and never dip to the
// map) for the full frame interval. Currents
// keep their particles flowing and only swap the field under them.
// Time per frame and the share of it spent fading into the next, per speed.
export const ANIMATION_SPEEDS = Object.freeze({
  slow: { label: "0.5×", frameMs: 2800 },
  normal: { label: "1×", frameMs: 1400 },
  fast: { label: "2×", frameMs: 700 }
});
const ANIMATION_SPEED_CYCLE = ["normal", "fast", "slow"];
export const ANIMATION_FADE_SHARE = 1;
export const ANIMATION_SPEED_STORAGE_KEY = "glc.AnimationSpeed";
export const ANIMATION_POLL_MS = 1500;
export const ANIMATION_FETCH_CONCURRENCY = 4;
export const ANIMATION_IDLE_LABEL = "Play the next 48 hours";
// Frames sit in their own pane, just under the overlay pane so current
// particles stay on top. The pane carries the layer's opacity, so each image
// can be fully opaque and a frame fading in over another never lets the map
// show through.
const ANIMATION_PANE = "greatLakesAnimation";
const RASTER_STYLES = {
  temperature: { className: "great-lakes-temperature-raster", opacity: 0.9 },
  thermocline: { className: "great-lakes-thermocline-raster", opacity: 0.88 },
  currents: { className: "great-lakes-current-raster", opacity: 0.8 },
  waves: { className: "great-lakes-wave-raster", opacity: 0.86 },
  upwelling: { className: "great-lakes-upwelling-raster", opacity: 0.88 }
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
  sliderFrame: null,
  fadeTimer: null,
  // Every frame's colours fit what is on screen across all frames (great-lakes-palette.js).
  paletteFit: null,
  stack: 0,
  particles: null,
  arrows: null,
  previousArrows: null,
  waveArrows: null,
  previousWaveArrows: null,
  waveArrowTimer: null,
  map: null
};
const payloadCache = new Map();
const PAYLOAD_CACHE_LIMIT = 80;

export function savedAnimationSpeed() {
  try {
    const saved = localStorage.getItem(ANIMATION_SPEED_STORAGE_KEY);
    return Object.hasOwn(ANIMATION_SPEEDS, saved) ? saved : "normal";
  } catch { return "normal"; }
}

function speedTiming() {
  const choice = document.querySelector("[data-gl-animation-speed-choice]");
  const speed = ANIMATION_SPEEDS[choice?.value] || ANIMATION_SPEEDS[savedAnimationSpeed()];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return { frameMs: speed.frameMs, fadeMs: reduced ? 0 : Math.round(speed.frameMs * ANIMATION_FADE_SHARE) };
}

export function greatLakesAnimationActive() {
  return state.active;
}

export function pauseGreatLakesAnimation() {
  if (!state.playing) return;
  state.playing = false;
  clearTimeout(state.timer);
  cancelAnimationFrame(state.sliderFrame);
  state.sliderFrame = null;
  clearTimeout(state.fadeTimer);
  clearTimeout(state.waveArrowTimer);
  state.waveArrowTimer = null;
  state.previousWaveArrows?.remove();
  state.previousWaveArrows = null;
  state.waveArrows?.setOpacity?.(1);
  state.previousArrows?.remove();
  state.previousArrows = null;
  setMarkerGroupOpacity(state.arrows, 1);
  state.map?.getPane(ANIMATION_PANE)?.classList.add("is-instant");
  showFrame(state.index, { fade: false });
  syncTimelineControls();
}

// The hour the map is showing, for readings at a clicked point.
export function greatLakesAnimationForecastHour() {
  return state.active && state.frames[state.index] ? String(state.frames[state.index].forecastHour) : null;
}

export function greatLakesTimelineHtml() {
  const speed = savedAnimationSpeed();
  const speedLabel = ANIMATION_SPEEDS[speed].label;
  return html`<div class="great-lakes-timeline" data-gl-timeline>
    <button type="button" class="great-lakes-play" data-gl-play aria-label="Play the forecast" aria-pressed="false" title="Play the forecast">${playIconHtml(false)}</button>
    <button type="button" class="great-lakes-timeline-speed" data-gl-animation-speed-choice value="${speed}" aria-label="Animation speed: ${speedLabel}. Click to change." title="Change animation speed">${speedLabel}</button>
    <div class="great-lakes-timeline-track">
      <input type="range" data-gl-frame min="0" max="16" step="1" value="0" disabled aria-label="Forecast time" />
      <div class="great-lakes-timeline-meta">
        <span class="great-lakes-timeline-label" data-gl-frame-label aria-live="off">${ANIMATION_IDLE_LABEL}</span>
      </div>
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
    if (state.playing) pauseGreatLakesAnimation();
    else {
      state.playing = true;
      syncTimelineControls();
      scheduleNextFrame();
    }
  });
  slider.addEventListener("input", () => {
    if (!state.frames.length) return;
    state.playing = false;
    clearTimeout(state.timer);
    cancelAnimationFrame(state.sliderFrame);
    state.sliderFrame = null;
    showFrame(Math.round(Number(slider.value)));
    syncTimelineControls();
  });
  stop.addEventListener("click", () => {
    stopGreatLakesAnimation();
    reload();
  });
  host.querySelector("[data-gl-animation-speed-choice]")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    const speedIndex = ANIMATION_SPEED_CYCLE.indexOf(button.value);
    const speed = ANIMATION_SPEED_CYCLE[(speedIndex + 1) % ANIMATION_SPEED_CYCLE.length];
    const label = ANIMATION_SPEEDS[speed].label;
    button.value = speed;
    button.textContent = label;
    button.setAttribute("aria-label", `Animation speed: ${label}. Click to change.`);
    button.title = `Animation speed: ${label}`;
    try { localStorage.setItem(ANIMATION_SPEED_STORAGE_KEY, speed); } catch { /* storage unavailable */ }
    applyFadeDuration();
    if (state.playing) scheduleNextFrame();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.playing) scheduleNextFrame(); });
}

function applyFadeDuration() {
  const duration = `${speedTiming().fadeMs}ms`;
  state.map?.getPane(ANIMATION_PANE)?.style.setProperty("--gl-frame-fade", duration);
  state.map?.getContainer()?.style.setProperty("--gl-frame-fade", duration);
}

export function syncTimelineControls() {
  document.dispatchEvent(new CustomEvent("great-lakes-animation-state", { detail: { active: state.active } }));
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
    slider.step = state.playing ? "any" : "1";
    slider.value = String(state.index);
  }
  if (label && !state.active) label.textContent = ANIMATION_IDLE_LABEL;
}

export function stopGreatLakesAnimation() {
  state.active = false;
  state.playing = false;
  clearTimeout(state.timer);
  cancelAnimationFrame(state.sliderFrame);
  state.sliderFrame = null;
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
  clearTimeout(state.fadeTimer);
  clearTimeout(state.waveArrowTimer);
  cancelAnimationFrame(state.sliderFrame);
  state.sliderFrame = null;
  state.particles?.remove();
  state.particles = null;
  state.arrows?.remove();
  state.arrows = null;
  state.previousArrows?.remove();
  state.previousArrows = null;
  state.waveArrows?.remove();
  state.waveArrows = null;
  state.previousWaveArrows?.remove();
  state.previousWaveArrows = null;
  state.paletteFit?.stop();
  state.paletteFit = null;
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
  const urls = (payload?.rasters || []).flatMap((raster) => raster.valueUrl ? [raster.valueUrl, raster.mixedUrl].filter(Boolean) : [raster.imageUrl]);
  return Promise.all(urls.map((url) => new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(resolve, IMAGE_PRELOAD_LIMIT_MS);
    image.onload = image.onerror = () => { clearTimeout(timer); resolve(); };
    image.src = url;
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
    // The two indexes can be prepared/cached independently. Match forecast
    // hours rather than assuming their frame positions describe the same time.
    const temperaturePayloads = new Map((temperatureIndex?.frames || []).map((frame, frameIndex) => [
      Number(frame.forecastHour), payloads[index.frames.length + frameIndex]
    ]));
    state.backgroundPayloads = temperatureIndex
      ? index.frames.map((frame) => temperaturePayloads.get(Number(frame.forecastHour)) || null)
      : null;
    buildFrames(map, background);
    const first = state.payloads[0]?.metadata || {};
    if (layer === "temperature") setTemperatureLegendRange(first);
    else if (layer === "thermocline") setThermoclineLegendRange(first);
    else if (layer === "waves") setWaveLegendRange(first);
    else if (layer === "upwelling") { /* fixed legend */ }
    else {
      setCurrentLegendRange(first);
      setCurrentSpeedMax(first);
      if (state.backgroundPayloads) setTemperatureLegendRange(state.backgroundPayloads[0]?.metadata || {});
    }
    state.index = shownTime ? nearestFrameIndex(state.frames, shownTime) : 0;
    showFrame(state.index, { fade: false });
    const shownMetadata = state.payloads[state.index]?.metadata || {};
    announceGreatLakesLayer(layer, shownMetadata, state.backgroundPayloads?.[state.index]?.metadata || (layer === "temperature" ? shownMetadata : null));
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
  const kind = layer === "currents" && background === "temperature" ? "temperature" : layer;
  const style = RASTER_STYLES[kind];
  const pane = map.getPane(ANIMATION_PANE) || map.createPane(ANIMATION_PANE);
  pane.style.zIndex = "395";
  pane.style.pointerEvents = "none";
  pane.style.opacity = String(style.opacity);
  applyFadeDuration();
  state.stack = 0;
  const filter = createPaletteFilter();
  state.overlays = state.payloads.map((_, index) => paletteOverlays(rasterPayloads?.[index]?.rasters, filter, {
    pane: ANIMATION_PANE, opacity: 0, interactive: false, className: `${style.className} great-lakes-animation-frame`
  }).map((overlay) => overlay.addTo(greatLakesConditionsLayer)));
  const frameRasters = state.payloads.map((_, index) => rasterPayloads?.[index]?.rasters || []);
  state.paletteFit = fitPaletteToView(map, frameRasters, kind, filter, (low, high) => showPaletteRange(kind, low, high));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (layer === "waves") {
    if (greatLakesControlValue("wave-display") === "flow" && !reduced && state.payloads[0]?.arrows?.length) {
      state.particles = createParticleLayer(map, waveParticleFields(state.payloads[0].arrows), { clipToGreatLakesWater: true }).addTo(map);
    }
    return;
  }
  if (layer !== "currents") return;
  const display = greatLakesControlValue("current-display");
  if (display === "flow" && !reduced && (state.payloads[0]?.fields || []).length) {
    state.particles = createParticleLayer(map, state.payloads[0].fields).addTo(map);
  } else if (display !== "off") {
    state.arrows = L.layerGroup().addTo(map);
  }
}

function hideAnimationFramesExcept(index) {
  const pane = state.map?.getPane(ANIMATION_PANE);
  pane?.classList.add("is-instant");
  state.overlays.forEach((overlays, frame) => {
    if (frame !== index) overlays.forEach((overlay) => animateOverlayOpacity(overlay, 0));
  });
  // Commit cleanup without fading old frames out underneath the next fade.
  if (pane) void pane.offsetWidth;
}

function setMarkerGroupOpacity(group, opacity) {
  group?.eachLayer((marker) => marker.setOpacity(opacity));
}

// Animate the image element directly so every forecast layer, including the
// transparent upwelling rasters, follows the same frame clock in every browser.
function animateOverlayOpacity(overlay, target, durationMs = 0) {
  const image = overlay.getElement();
  if (!image) { overlay.setOpacity(target); return; }
  cancelAnimationFrame(overlay._glOpacityFrame);
  overlay._glOpacityFrame = null;
  const current = Number.parseFloat(getComputedStyle(image).opacity);
  const startOpacity = Number.isFinite(current) ? current : 0;
  if (!durationMs || Math.abs(startOpacity - target) < 0.001) {
    overlay.setOpacity(target);
    return;
  }
  const started = performance.now();
  const update = (now) => {
    const progress = Math.min(1, (now - started) / durationMs);
    overlay.setOpacity(startOpacity + (target - startOpacity) * progress);
    overlay._glOpacityFrame = progress < 1 ? requestAnimationFrame(update) : null;
  };
  overlay._glOpacityFrame = requestAnimationFrame(update);
}

// The new frame fades in over the one on screen. During playback, older frames
// are cleared at the next handoff so only the adjacent pair stays on the map.
function crossfadeTo(index, fade) {
  const pane = state.map?.getPane(ANIMATION_PANE);
  // Flush the starting opacity before enabling the transition, including at
  // the loop boundary where this image has already been shown before.
  if (pane) void pane.offsetWidth;
  pane?.classList.toggle("is-instant", !fade);
  const { fadeMs } = speedTiming();
  const duration = fade ? fadeMs : 0;
  state.stack += 1;
  (state.overlays[index] || []).forEach((overlay) => {
    overlay.setZIndex(state.stack);
    animateOverlayOpacity(overlay, 1, duration);
  });
  clearTimeout(state.fadeTimer);
  const hideOthers = () => hideAnimationFramesExcept(state.index);
  if (fade && fadeMs > 0 && state.playing) return;
  if (fade && fadeMs > 0) state.fadeTimer = setTimeout(hideOthers, fadeMs + 60);
  else hideOthers();
}

function showFrame(index, { fade = true, preserveWaveArrows = false, preserveCurrentArrows = false } = {}) {
  if (!state.frames.length) return;
  state.index = Math.max(0, Math.min(state.frames.length - 1, index));
  const payload = state.payloads[state.index] || {};
  crossfadeTo(state.index, fade);
  if (state.layer === "currents") {
    if (state.particles && payload.fields?.length) state.particles.setFields(payload.fields);
    if (state.arrows && !preserveCurrentArrows) {
      state.previousArrows?.remove();
      state.previousArrows = null;
      clearTimeout(state.waveArrowTimer);
      state.arrows.clearLayers();
      renderGreatLakesCurrents(payload.data || [], state.map.getZoom(), state.arrows);
    }
  }
  if (state.layer === "waves") {
    const display = greatLakesControlValue("wave-display");
    if (state.particles && display === "flow") state.particles.setFields(waveParticleFields(payload.arrows || []));
    if (!preserveWaveArrows && display === "arrows") {
      state.previousWaveArrows?.remove();
      state.previousWaveArrows = null;
      state.waveArrows?.remove();
      state.waveArrows = (payload.arrows || []).length ? createWaveArrowLayer(state.map, payload.arrows).addTo(state.map) : null;
    } else if (!preserveWaveArrows) {
      state.previousWaveArrows?.remove();
      state.previousWaveArrows = null;
      state.waveArrows?.remove();
      state.waveArrows = null;
    }
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
  const shownDepth = state.layer === "thermocline" || state.layer === "waves" || state.layer === "upwelling" ? null : modelDepthShown(state.backgroundPayloads?.[state.index]?.metadata || metadata);
  setGreatLakesStatus(`${unavailable ? "Data is missing for one or more lakes in this frame. " : ""}${modelDepthNote(state.depth, shownDepth)}${tooShallowNote(models)}`, unavailable);
  const temperatureMetadata = state.backgroundPayloads?.[state.index]?.metadata || (state.layer === "temperature" ? metadata : null);
  document.dispatchEvent(new CustomEvent("great-lakes-frame-shown", { detail: { layer: state.layer, metadata: { ...metadata, validTime: frame.validTime }, temperatureMetadata, depth: state.depth } }));
}

function scheduleNextFrame(frameAlreadyShown = false) {
  clearTimeout(state.timer);
  cancelAnimationFrame(state.sliderFrame);
  state.sliderFrame = null;
  if (!state.playing || state.frames.length < 2) return;
  if (document.hidden) return;
  const { frameMs, fadeMs } = speedTiming();
  const next = (state.index + 1) % state.frames.length;
  if (!frameAlreadyShown) showFrame(state.index, { fade: false });
  const slider = document.querySelector("[data-gl-frame]");
  if (slider) slider.step = "any";
  if (fadeMs && slider) {
    const from = state.index;
    const started = performance.now();
    const advanceSlider = (now) => {
      if (!state.playing) return;
      const progress = Math.min(1, (now - started) / frameMs);
      const position = next > from ? from + (next - from) * progress : state.frames.length - 1;
      slider.value = String(position);
      state.sliderFrame = progress < 1 ? requestAnimationFrame(advanceSlider) : null;
    };
    state.sliderFrame = requestAnimationFrame(advanceSlider);
  } else if (slider) slider.value = String(state.index);
  // Begin blending immediately; hand off to the next frame when the blend
  // finishes, then start the following blend without a hold between frames.
  if (fadeMs) {
    crossfadeTo(next, true);
    const payload = state.payloads[next] || {};
    if (state.layer === "currents") state.particles?.setFields(payload.fields || [], { durationMs: frameMs });
    if (state.layer === "waves" && payload.arrows) state.particles?.setFields(waveParticleFields(payload.arrows), { durationMs: frameMs });
    if (state.layer === "waves" && greatLakesControlValue("wave-display") === "arrows") {
      const previous = state.waveArrows;
      const incoming = (payload.arrows || []).length ? createWaveArrowLayer(state.map, payload.arrows) : null;
      incoming?.setOpacity(0);
      incoming?.addTo(state.map);
      if (incoming) requestAnimationFrame(() => incoming.setOpacity(1));
      previous?.setOpacity?.(0);
      state.previousWaveArrows?.remove();
      state.previousWaveArrows = previous || null;
      state.waveArrows = incoming;
      state.waveArrowTimer = setTimeout(() => {
        state.previousWaveArrows?.remove();
        state.previousWaveArrows = null;
        state.waveArrowTimer = null;
      }, frameMs);
    }
    if (state.layer === "currents" && state.arrows) {
      const previous = state.arrows;
      const incoming = L.layerGroup().addTo(state.map);
      renderGreatLakesCurrents(payload.data || [], state.map.getZoom(), incoming, 0);
      requestAnimationFrame(() => setMarkerGroupOpacity(incoming, 1));
      setMarkerGroupOpacity(previous, 0);
      state.previousArrows?.remove();
      state.previousArrows = previous;
      state.arrows = incoming;
      clearTimeout(state.waveArrowTimer);
      state.waveArrowTimer = setTimeout(() => {
        state.previousArrows?.remove();
        state.previousArrows = null;
        state.waveArrowTimer = null;
      }, frameMs);
    }
  }
  state.timer = setTimeout(() => {
    if (!state.playing) return;
    if (document.hidden) return;  // Resumed by visibilitychange.
    state.previousWaveArrows?.remove();
    state.previousWaveArrows = null;
    state.previousArrows?.remove();
    state.previousArrows = null;
    clearTimeout(state.waveArrowTimer);
    state.waveArrowTimer = null;
    showFrame(next, {
      fade: false,
      preserveWaveArrows: state.layer === "waves" && greatLakesControlValue("wave-display") === "arrows",
      preserveCurrentArrows: state.layer === "currents" && Boolean(state.arrows)
    });
    scheduleNextFrame(true);
  }, frameMs);
}

// Exposed for tests.
export const animationState = state;
