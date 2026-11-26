import { convertUnitValue } from "./measurement-conversion.js";

const depthUnits = { ft: "ft", feet: "ft", foot: "ft", m: "m", meter: "m", meters: "m", metre: "m", metres: "m", cm: "cm", in: "in" };

function depthFeet(value, unit, water = false) {
  const text = String(value ?? "").trim();
  const match = (water ? text.replace(/\s*FOW$/i, "").trim() : text).match(/^(\d+(?:\.\d+)?|\.\d+)\s*([a-z]*)$/i);
  if (!match) return null;
  const suffix = (match[2] || unit).toLowerCase();
  if (!Object.hasOwn(depthUnits, suffix)) return null;
  const feet = convertUnitValue(match[1], depthUnits[suffix], "ft");
  return Number.isFinite(feet) ? feet : null;
}

// Bathymetry is the bottom, not the bite. Provider depths may be signed and
// have their own units regardless of the angler's display preference.
function bottomFeet(record, unit) {
  const logged = depthFeet(record.fowCaught, unit, true) ?? depthFeet(record.waterDepth, unit, true);
  if (logged !== null) return logged;
  for (const [raw, source] of [[record.depth_ft, "ft"], [record.depth_m, "m"]]) {
    const text = String(raw ?? "").trim();
    if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text) && Number(text) !== 0) return depthFeet(Math.abs(Number(text)), source);
  }
  return null;
}

function biteFeet(record, unit) {
  const cheater = record.setupLineTarget === "cheater" || String(record.presentation || "").trim().toLowerCase() === "cheater"
    || [record.setupLineId, record.setupLineValue].some(id => String(id || "").endsWith("::cheater"));
  const ball = depthFeet(record.ballDepth, unit);
  const explicit = depthFeet(record.depthDown, unit);
  const lure = depthFeet(record.estimatedLureDepth, unit) ?? depthFeet(record.estimatedDepth, unit);
  return cheater
    ? depthFeet(record.cheaterDepth, unit) ?? explicit ?? lure ?? (ball === null ? null : ball / 2)
    : explicit ?? ball ?? lure;
}

export function probeCatchMarkers(catches = [], unit = "ft") {
  const groups = new Map();
  const markers = [];
  for (const [catchIndex, record] of catches.entries()) {
    if (!record || record.detailsUnknown) continue;
    const bite = biteFeet(record, unit);
    const depth = bite ?? bottomFeet(record, unit);
    if (depth === null) continue;
    const kind = bite === null ? "water" : "catch";
    const marker = { catchIndex, depthFeet: depth, kind, species: String(record.species || "").trim() || "Unknown species" };
    const key = `${kind}:${depth.toFixed(3)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(marker);
    markers.push(marker);
  }
  for (const group of groups.values()) group.forEach((marker, index) => {
    marker.slot = index;
    marker.peers = group.length;
  });
  return markers.sort((a, b) => a.depthFeet - b.depthFeet);
}

export function probeMarkerX(marker, center, min, max) {
  const step = Math.min(20, (max - min) / Math.max(1, marker.peers - 1));
  const span = (marker.peers - 1) * step;
  return Math.max(min, Math.min(max - span, center - span / 2)) + marker.slot * step;
}

export function missingProbeDepthNote(count) {
  return count > 0 ? `${count} ${count === 1 ? "catch" : "catches"} not plotted: no depth recorded.` : "";
}
