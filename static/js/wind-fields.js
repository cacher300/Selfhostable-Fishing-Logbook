import { dramaticParticleSpeed } from "./particle-speed.js";

// Wind particles reach full speed at 25 kn (small-craft territory) and
// barely creep in light air; see particle-speed.js.
export const WIND_FULL_SPEED_METERS_PER_SECOND = 25 * 0.514444;

function windVector(u, v) {
  const speed = Math.hypot(u, v);
  const scale = speed ? dramaticParticleSpeed(speed, WIND_FULL_SPEED_METERS_PER_SECOND) / speed : 0;
  return { u: u * scale, v: v * scale };
}

export function windParticleFields(points) {
  const vectors = points.flatMap((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Number.isFinite(point.u) && Number.isFinite(point.v)
    ? [{ latitude: point.latitude, longitude: point.longitude, ...windVector(point.u, point.v) }]
    : []);
  if (!vectors.length) return [];

  // GFS samples a regular 0.25° grid. Rebuild that grid so the particle
  // sampler interpolates between adjacent vectors instead of leaving holes.
  const latitudeAxis = [...new Set(vectors.map((point) => point.latitude))].sort((a, b) => a - b);
  const longitudeAxis = [...new Set(vectors.map((point) => point.longitude))].sort((a, b) => a - b);
  if (latitudeAxis.length < 2 || longitudeAxis.length < 2) return [{ points: vectors }];

  const latitudeIndex = new Map(latitudeAxis.map((value, index) => [value.toFixed(6), index]));
  const longitudeIndex = new Map(longitudeAxis.map((value, index) => [value.toFixed(6), index]));
  const columns = longitudeAxis.length;
  const u = new Float32Array(latitudeAxis.length * columns);
  const v = new Float32Array(u.length);
  const mask = new Uint8Array(u.length);
  for (const point of vectors) {
    const row = latitudeIndex.get(point.latitude.toFixed(6));
    const column = longitudeIndex.get(point.longitude.toFixed(6));
    const index = row * columns + column;
    u[index] = point.u;
    v[index] = point.v;
    mask[index] = 1;
  }
  return [{ latitudeAxis, longitudeAxis, rows: latitudeAxis.length, columns, u, v, mask }];
}
