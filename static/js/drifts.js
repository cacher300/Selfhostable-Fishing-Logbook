import { state } from "./app-state.js";
import { isUsableCoordinates } from "./app-media.js";

const EPSILON = 1e-10;

export function polygonArea(polygon = []) {
  if (polygon.length < 3) return 0;
  const latitude = polygon.reduce((total, point) => total + point.latitude, 0) / polygon.length;
  const scale = Math.cos(latitude * Math.PI / 180);
  return Math.abs(polygon.reduce((total, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return total + point.longitude * scale * next.latitude - next.longitude * scale * point.latitude;
  }, 0)) / 2;
}

export function pointInPolygon(point, polygon = []) {
  if (!isUsableCoordinates(point) || polygon.length < 3) return false;
  const x = Number(point.longitude), y = Number(point.latitude);
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[previous], b = polygon[index];
    const cross = (x - a.longitude) * (b.latitude - a.latitude) - (y - a.latitude) * (b.longitude - a.longitude);
    if (Math.abs(cross) < EPSILON && x >= Math.min(a.longitude, b.longitude) - EPSILON && x <= Math.max(a.longitude, b.longitude) + EPSILON && y >= Math.min(a.latitude, b.latitude) - EPSILON && y <= Math.max(a.latitude, b.latitude) + EPSILON) return true;
    if ((a.latitude > y) !== (b.latitude > y) && x < (b.longitude - a.longitude) * (y - a.latitude) / (b.latitude - a.latitude) + a.longitude) inside = !inside;
  }
  return inside;
}

export function automaticDriftId(fish, drifts = state.drifts || []) {
  const point = isUsableCoordinates(fish?.manualCoordinates) ? fish.manualCoordinates : fish?.coordinates;
  if (!isUsableCoordinates(point)) return "";
  return drifts.filter((drift) => pointInPolygon(point, drift.polygon))
    .sort((a, b) => polygonArea(a.polygon) - polygonArea(b.polygon) || a.id.localeCompare(b.id))[0]?.id || "";
}

export function assignedDriftId(fish, drifts = state.drifts || []) {
  if (fish?.driftAssignmentMode === "manual") return drifts.some((drift) => drift.id === fish.driftId) ? fish.driftId : "";
  return automaticDriftId(fish, drifts);
}

export function driftName(id, drifts = state.drifts || []) {
  return drifts.find((drift) => drift.id === id)?.name || "";
}
