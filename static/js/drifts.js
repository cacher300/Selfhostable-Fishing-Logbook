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

function orientation(a, b, c) {
  return (b.longitude - a.longitude) * (c.latitude - a.latitude)
    - (b.latitude - a.latitude) * (c.longitude - a.longitude);
}

function pointOnSegment(point, start, end) {
  return Math.abs(orientation(start, end, point)) < EPSILON
    && point.longitude >= Math.min(start.longitude, end.longitude) - EPSILON
    && point.longitude <= Math.max(start.longitude, end.longitude) + EPSILON
    && point.latitude >= Math.min(start.latitude, end.latitude) - EPSILON
    && point.latitude <= Math.max(start.latitude, end.latitude) + EPSILON;
}

function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  const firstA = orientation(firstStart, firstEnd, secondStart);
  const firstB = orientation(firstStart, firstEnd, secondEnd);
  const secondA = orientation(secondStart, secondEnd, firstStart);
  const secondB = orientation(secondStart, secondEnd, firstEnd);
  if (((firstA > EPSILON && firstB < -EPSILON) || (firstA < -EPSILON && firstB > EPSILON))
    && ((secondA > EPSILON && secondB < -EPSILON) || (secondA < -EPSILON && secondB > EPSILON))) return true;
  return (Math.abs(firstA) < EPSILON && pointOnSegment(secondStart, firstStart, firstEnd))
    || (Math.abs(firstB) < EPSILON && pointOnSegment(secondEnd, firstStart, firstEnd))
    || (Math.abs(secondA) < EPSILON && pointOnSegment(firstStart, secondStart, secondEnd))
    || (Math.abs(secondB) < EPSILON && pointOnSegment(firstEnd, secondStart, secondEnd));
}

export function polygonSelfIntersects(polygon = []) {
  for (let first = 0; first < polygon.length; first += 1) {
    const firstEnd = (first + 1) % polygon.length;
    for (let second = first + 1; second < polygon.length; second += 1) {
      const secondEnd = (second + 1) % polygon.length;
      if (first === second || firstEnd === second || secondEnd === first) continue;
      if (segmentsIntersect(polygon[first], polygon[firstEnd], polygon[second], polygon[secondEnd])) return true;
    }
  }
  return false;
}

export function polygonsOverlap(first = [], second = []) {
  if (first.length < 3 || second.length < 3) return false;
  if (first.some((point) => pointInPolygon(point, second)) || second.some((point) => pointInPolygon(point, first))) return true;
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstNext = (firstIndex + 1) % first.length;
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      const secondNext = (secondIndex + 1) % second.length;
      if (segmentsIntersect(first[firstIndex], first[firstNext], second[secondIndex], second[secondNext])) return true;
    }
  }
  return false;
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
