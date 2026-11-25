const EARTH_RADIUS_METERS = 6371000;
const EPSILON = 1e-10;

function usableCoordinates(point) {
  return Number.isFinite(point?.latitude) && point.latitude >= -90 && point.latitude <= 90
    && Number.isFinite(point?.longitude) && point.longitude >= -180 && point.longitude <= 180;
}

function distanceMeters(first, second) {
  if (!usableCoordinates(first) || !usableCoordinates(second)) return Number.POSITIVE_INFINITY;
  const radians = (value) => value * Math.PI / 180;
  const deltaLatitude = radians(second.latitude - first.latitude);
  const deltaLongitude = radians(second.longitude - first.longitude);
  const latitudeOne = radians(first.latitude);
  const latitudeTwo = radians(second.latitude);
  const haversine = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(deltaLongitude / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function pointInPolygon(point, polygon = []) {
  if (!usableCoordinates(point) || polygon.length < 3 || !polygon.every(usableCoordinates)) return false;
  const x = point.longitude;
  const y = point.latitude;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const first = polygon[previous];
    const second = polygon[index];
    const cross = (x - first.longitude) * (second.latitude - first.latitude)
      - (y - first.latitude) * (second.longitude - first.longitude);
    if (Math.abs(cross) < EPSILON
      && x >= Math.min(first.longitude, second.longitude) - EPSILON
      && x <= Math.max(first.longitude, second.longitude) + EPSILON
      && y >= Math.min(first.latitude, second.latitude) - EPSILON
      && y <= Math.max(first.latitude, second.latitude) + EPSILON) return true;
    if ((first.latitude > y) !== (second.latitude > y)
      && x < (second.longitude - first.longitude) * (y - first.latitude) / (second.latitude - first.latitude) + first.longitude) {
      inside = !inside;
    }
  }
  return inside;
}

function orientation(first, second, third) {
  return (second.longitude - first.longitude) * (third.latitude - first.latitude)
    - (second.latitude - first.latitude) * (third.longitude - first.longitude);
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

function polygonsOverlap(first = [], second = []) {
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

function distanceToSegmentMeters(origin, start, end) {
  const latitudeScale = EARTH_RADIUS_METERS * Math.PI / 180;
  const longitudeScale = latitudeScale * Math.cos(origin.latitude * Math.PI / 180);
  const a = {
    x: (start.longitude - origin.longitude) * longitudeScale,
    y: (start.latitude - origin.latitude) * latitudeScale
  };
  const b = {
    x: (end.longitude - origin.longitude) * longitudeScale,
    y: (end.latitude - origin.latitude) * latitudeScale
  };
  const deltaX = b.x - a.x;
  const deltaY = b.y - a.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const projection = lengthSquared ? Math.max(0, Math.min(1, -(a.x * deltaX + a.y * deltaY) / lengthSquared)) : 0;
  return Math.hypot(a.x + projection * deltaX, a.y + projection * deltaY);
}

function circleOverlapsPolygon(circle, polygon) {
  const radius = Number(circle.radiusMeters);
  if (!usableCoordinates(circle.coordinates) || !Number.isFinite(radius) || radius < 0 || polygon.length < 3) return false;
  if (pointInPolygon(circle.coordinates, polygon)) return true;
  if (polygon.some((vertex) => distanceMeters(circle.coordinates, vertex) <= radius)) return true;
  return polygon.some((vertex, index) => distanceToSegmentMeters(
    circle.coordinates,
    vertex,
    polygon[(index + 1) % polygon.length]
  ) <= radius);
}

export function isPolygonSpot(spot) {
  return spot?.boundaryType === "polygon";
}

export function spotContainsCoordinates(spot, coordinates) {
  if (isPolygonSpot(spot)) return pointInPolygon(coordinates, Array.isArray(spot.polygon) ? spot.polygon : []);
  return distanceMeters(coordinates, spot?.coordinates) <= Number(spot?.radiusMeters);
}

export function spotAreasOverlap(first, second) {
  const firstIsPolygon = isPolygonSpot(first);
  const secondIsPolygon = isPolygonSpot(second);
  if (firstIsPolygon && secondIsPolygon) {
    return polygonsOverlap(Array.isArray(first.polygon) ? first.polygon : [], Array.isArray(second.polygon) ? second.polygon : []);
  }
  if (!firstIsPolygon && !secondIsPolygon) {
    return distanceMeters(first.coordinates, second.coordinates) <= Number(first.radiusMeters) + Number(second.radiusMeters);
  }
  return firstIsPolygon
    ? circleOverlapsPolygon(second, Array.isArray(first.polygon) ? first.polygon : [])
    : circleOverlapsPolygon(first, Array.isArray(second.polygon) ? second.polygon : []);
}
