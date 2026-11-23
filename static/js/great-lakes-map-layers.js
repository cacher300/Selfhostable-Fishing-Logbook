import { html, safeUrl } from "./html.js";
import { L } from "./vendor.js";

const STORAGE = Object.freeze({
  webcams: "logbook.mapWebcams",
  satellite: "logbook.mapSatellitePhoto",
  pass: "logbook.mapSatellitePhotoPass",
  opacity: "logbook.mapSatellitePhotoOpacity"
});
const SATELLITE_REFRESH_MS = 5 * 60 * 1000;
const CAMERAS_URL = "/static/data/great-lakes-webcams.json";
let map = null;
let webcamGroup = null;
let webcamRecordsPromise = null;
let satelliteManifest = null;
let satelliteManifestAt = 0;
let satelliteManifestPromise = null;
let satelliteLayer = null;
let satelliteSequence = 0;

function storageValue(key, fallback = "") {
  try { return localStorage.getItem(key) ?? fallback; }
  catch { return fallback; }
}

function saveValue(key, value) {
  try { localStorage.setItem(key, String(value)); }
  catch { /* Browser storage can be disabled. */ }
}

function enabled(key) {
  return storageValue(key) === "true";
}

function control(id) {
  return document.getElementById(id);
}

function setStatus(message, isError = false) {
  const node = control("mapSatellitePhotoStatus");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("is-error", isError);
}

function apiUrl(path) {
  if (!path || /^https?:\/\//i.test(path)) return path;
  const configured = document.documentElement.dataset.greatLakesApi?.trim().replace(/\/+$/, "");
  const base = configured || "https://greatlakestrolling.com";
  return path.startsWith("/api/") ? new URL(path, base).href : new URL("/api/v1/" + path.replace(/^\/+/, ""), base).href;
}

function passLabel(pass) {
  const date = new Date(pass.time);
  const time = Number.isFinite(date.getTime())
    ? date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : pass.time || "Recent pass";
  return (pass.satellite || "NOAA VIIRS") + " · " + time;
}

async function loadSatelliteManifest(force = false) {
  if (!force && satelliteManifest && Date.now() - satelliteManifestAt < SATELLITE_REFRESH_MS) return satelliteManifest;
  if (!force && satelliteManifestPromise) return satelliteManifestPromise;
  if (!window.noaaGreatLakesApi?.satellite) throw new Error("NOAA satellite photos are unavailable.");
  satelliteManifestPromise = window.noaaGreatLakesApi.satellite().then((manifest) => {
    satelliteManifest = manifest;
    satelliteManifestAt = Date.now();
    return manifest;
  }).finally(() => { satelliteManifestPromise = null; });
  return satelliteManifestPromise;
}

function fillPassOptions(passes, selectedId = "") {
  const select = control("mapSatellitePhotoPass");
  if (!select) return;
  const options = (passes || []).map((pass) => {
    const option = document.createElement("option");
    option.value = pass.id;
    option.textContent = passLabel(pass);
    return option;
  });
  select.replaceChildren(...options);
  const selected = passes?.find((pass) => pass.id === selectedId) || passes?.[0];
  select.value = selected?.id || "";
  select.disabled = !selected;
  if (selected && selected.id !== selectedId) saveValue(STORAGE.pass, selected.id);
}

function removeSatelliteLayer() {
  if (satelliteLayer && map?.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
  satelliteLayer = null;
}

async function syncSatellitePhoto() {
  const toggle = control("mapSatellitePhotoToggle");
  const options = control("mapSatellitePhotoOptions");
  const slider = control("mapSatellitePhotoOpacity");
  const opacityLabel = control("mapSatellitePhotoOpacityLabel");
  if (!toggle || !options) return;
  toggle.checked = enabled(STORAGE.satellite);
  options.hidden = !toggle.checked;
  const savedOpacity = Math.max(20, Math.min(100, Number(storageValue(STORAGE.opacity, "70")) || 70));
  if (slider) slider.value = String(savedOpacity);
  if (opacityLabel) opacityLabel.textContent = savedOpacity + "%";
  if (!toggle.checked || !map) {
    satelliteSequence += 1;
    removeSatelliteLayer();
    if (!toggle.checked) setStatus("");
    return;
  }

  const sequence = ++satelliteSequence;
  setStatus("Loading NOAA satellite passes…");
  try {
    const manifest = await loadSatelliteManifest();
    if (sequence !== satelliteSequence || !enabled(STORAGE.satellite)) return;
    const passes = Array.isArray(manifest?.passes) ? manifest.passes : [];
    const selectedId = storageValue(STORAGE.pass);
    fillPassOptions(passes, selectedId);
    const select = control("mapSatellitePhotoPass");
    const pass = passes.find((item) => item.id === select?.value) || passes[0];
    removeSatelliteLayer();
    if (!manifest.available || !pass) {
      setStatus("NOAA satellite photos are not available right now.", true);
      return;
    }
    if (!map.getPane("greatLakesSatellitePhotoPane")) {
      const pane = map.createPane("greatLakesSatellitePhotoPane");
      pane.style.zIndex = "385";
      pane.style.pointerEvents = "none";
    }
    const url = apiUrl(pass.tileUrlTemplate.replace("{pass}", encodeURIComponent(pass.id)));
    const opacity = Math.max(0.2, Math.min(1, (Number(slider?.value) || savedOpacity) / 100));
    const layer = L.tileLayer(url, {
      pane: "greatLakesSatellitePhotoPane",
      bounds: L.latLngBounds(pass.bounds[0], pass.bounds[1]),
      minZoom: Number(manifest.minZoom) || 4,
      maxNativeZoom: Number(manifest.maxNativeZoom) || 9,
      maxZoom: 19,
      opacity,
      attribution: manifest.attribution || "NOAA VIIRS"
    });
    satelliteLayer = layer;
    let tileError = false;
    layer.on("tileerror", () => {
      if (satelliteLayer !== layer) return;
      tileError = true;
      setStatus("Some satellite tiles could not be loaded.", true);
    });
    layer.once("load", () => {
      if (satelliteLayer === layer && !tileError) setStatus(passLabel(pass));
    });
    layer.addTo(map);
    setStatus(passLabel(pass));
  } catch {
    if (sequence === satelliteSequence) {
      removeSatelliteLayer();
      setStatus("NOAA satellite photos are unavailable. Try again shortly.", true);
    }
  }
}

function loadWebcams() {
  if (!webcamRecordsPromise) {
    webcamRecordsPromise = fetch(CAMERAS_URL, { headers: { Accept: "application/json" } })
      .then((response) => { if (!response.ok) throw new Error("Webcam locations unavailable"); return response.json(); })
      .then((value) => Array.isArray(value) ? value : [])
      .catch((error) => { webcamRecordsPromise = null; throw error; });
  }
  return webcamRecordsPromise;
}

function renderWebcams(records) {
  if (!map || !webcamGroup) return;
  webcamGroup.clearLayers();
  const toggle = control("mapWebcamsToggle");
  if (!toggle?.checked) return;
  const visible = map.getBounds().pad(0.12);
  const icon = L.divIcon({
    className: "great-lakes-webcam-icon",
    html: html`<span aria-hidden="true"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
  (records || []).filter((camera) => camera.active !== false
    && Number.isFinite(camera.latitude) && Number.isFinite(camera.longitude)
    && visible.contains([camera.latitude, camera.longitude])).forEach((camera) => {
    const url = safeUrl(camera.url);
    if (!/^https?:\/\//i.test(url)) return;
    const marker = L.marker([camera.latitude, camera.longitude], {
      pane: "greatLakesWebcamPane",
      icon,
      title: camera.name || "Great Lakes webcam",
      keyboard: true,
      zIndexOffset: 900
    });
    marker.bindPopup(html`<div class="great-lakes-webcam-popup"><strong>${camera.name || "Great Lakes webcam"}</strong><span>${camera.location || camera.provider || ""}</span><a href="${url}" target="_blank" rel="noopener noreferrer">Open live camera ↗</a></div>`);
    webcamGroup.addLayer(marker);
  });
}

async function syncWebcams() {
  const toggle = control("mapWebcamsToggle");
  if (!map || !webcamGroup || !toggle) return;
  toggle.checked = enabled(STORAGE.webcams);
  if (!toggle.checked) { webcamGroup.clearLayers(); return; }
  try { renderWebcams(await loadWebcams()); }
  catch { webcamGroup.clearLayers(); }
}

export function attachGreatLakesMapLayers(targetMap) {
  if (!targetMap) return;
  map = targetMap;
  if (!map._greatLakesPhotoWebcamPanes) {
    const satellitePane = map.createPane("greatLakesSatellitePhotoPane");
    satellitePane.style.zIndex = "385";
    satellitePane.style.pointerEvents = "none";
    const webcamPane = map.createPane("greatLakesWebcamPane");
    webcamPane.style.zIndex = "640";
    webcamPane.style.pointerEvents = "auto";
    webcamGroup = L.layerGroup();
    map._greatLakesPhotoWebcamPanes = true;
    map.on("moveend zoomend", () => {
      if (enabled(STORAGE.webcams)) void syncWebcams();
    });
  } else {
    webcamGroup = webcamGroup || L.layerGroup();
  }
  void syncSatellitePhoto();
  void syncWebcams();
}

export function setup() {
  const satelliteToggle = control("mapSatellitePhotoToggle");
  const webcamToggle = control("mapWebcamsToggle");
  const pass = control("mapSatellitePhotoPass");
  const opacity = control("mapSatellitePhotoOpacity");
  if (satelliteToggle) {
    satelliteToggle.checked = enabled(STORAGE.satellite);
    satelliteToggle.addEventListener("change", () => {
      saveValue(STORAGE.satellite, satelliteToggle.checked);
      void syncSatellitePhoto();
    });
  }
  if (webcamToggle) {
    webcamToggle.checked = enabled(STORAGE.webcams);
    webcamToggle.addEventListener("change", () => {
      saveValue(STORAGE.webcams, webcamToggle.checked);
      void syncWebcams();
    });
  }
  pass?.addEventListener("change", () => {
    saveValue(STORAGE.pass, pass.value);
    void syncSatellitePhoto();
  });
  opacity?.addEventListener("input", () => {
    saveValue(STORAGE.opacity, opacity.value);
    const value = control("mapSatellitePhotoOpacityLabel");
    if (value) value.textContent = opacity.value + "%";
    satelliteLayer?.setOpacity(Number(opacity.value) / 100);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && enabled(STORAGE.satellite)) void syncSatellitePhoto();
  });
  window.setInterval(() => {
    if (!document.hidden && enabled(STORAGE.satellite)) {
      void loadSatelliteManifest(true).then(() => syncSatellitePhoto()).catch(() => undefined);
    }
  }, SATELLITE_REFRESH_MS);
}
