/* Generated from schema/weather-front-rules.js. Do not edit by hand. */
// Point-weather estimates, not analysed surface-front observations.
// Use the same rules for desktop, mobile, and the explicit one-time backfill.
const HOUR = 3600000;
const METHOD = "open-meteo-pattern-v1";
const finite = value => typeof value === "number" && Number.isFinite(value);
const time = value => typeof value === "string" ? Date.parse(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`) : NaN;
const day = value => new Date(value).toISOString().slice(0, 10);

function tripWindow(trip) {
  const date = trip?.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return null;
  const startClock = trip.launchTime || trip.linesSetTime || "00:00";
  const endClock = trip.linesPulledTime || "23:59";
  if (![startClock, endClock].every(clock => /^([01]\d|2[0-3]):[0-5]\d$/.test(clock))) return null;
  const start = time(`${date}T${startClock}`);
  if (!Number.isFinite(start) || day(start) !== date) return null;
  let end = time(`${date}T${endClock}`);
  if (end < start) end += 24 * HOUR;
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
}

export function weatherFrontDateRange(trip) {
  const window = tripWindow(trip);
  return window ? { startDate: day(window.start - 24 * HOUR), endDate: day(window.end + 24 * HOUR) } : null;
}

export function classifyWeatherFront(trip, bundle) {
  const result = (value, reason, extra = {}) => ({ value, reason, method: METHOD, ...extra });
  const window = tripWindow(trip);
  if (!window) return result("", "A valid trip date and times are required.");
  const h = bundle?.hourly;
  if (!Array.isArray(h?.time)) return result("", "Surrounding hourly weather is unavailable.");
  const rows = h.time.map((stamp, i) => ({
    time: time(stamp), stamp,
    temperature: h.temperature_2m?.[i],
    pressure: (h.pressure_msl || h.surface_pressure)?.[i],
    direction: h.wind_direction_10m?.[i],
    speed: h.wind_speed_10m?.[i]
  })).filter(row => Number.isFinite(row.time) && row.time >= window.start - 27 * HOUR && row.time <= window.end + 27 * HOUR);
  const valid = rows.filter(row => [row.temperature, row.pressure, row.direction, row.speed].every(finite) && row.pressure >= 800 && row.pressure <= 1100 && row.direction >= 0 && row.direction <= 360 && row.speed >= 0);
  const byTime = new Map(valid.map(row => [row.time, row]));
  // Calm winds have an unstable direction; require at least 5 km/h on both sides.
  const speedScale = bundle.hourly_units?.wind_speed_10m === "mph" ? 1.609344 : bundle.hourly_units?.wind_speed_10m === "kn" ? 1.852 : 1;
  const events = [];
  for (const center of valid) {
    const before = byTime.get(center.time - 3 * HOUR);
    const after = byTime.get(center.time + 3 * HOUR);
    if (!before || !after || before.speed * speedScale < 5 || after.speed * speedScale < 5) continue;
    const temperatureChange = after.temperature - before.temperature;
    const windShift = Math.abs(((after.direction - before.direction + 540) % 360) - 180);
    const pressureChange = after.pressure - before.pressure;
    const trough = before.pressure - center.pressure >= 1 && after.pressure - center.pressure >= 1;
    const pressureSignal = trough || (temperatureChange <= -3 && pressureChange >= 2) || (temperatureChange >= 3 && pressureChange <= -2);
    if (Math.abs(temperatureChange) < 3 || windShift < 45 || !pressureSignal) continue;
    events.push({ time: center.time, frontTime: center.stamp, temperatureChangeC: Math.round(temperatureChange * 10) / 10, windShiftDegrees: Math.round(windShift), pressureChangeHpa: Math.round(pressureChange * 10) / 10,
      score: Math.abs(temperatureChange) + windShift / 45 + (trough ? 2 : 0) });
  }
  // Collapse neighboring detections into one passage, keeping the strongest signal.
  const passages = [];
  for (const event of events.sort((a, b) => b.score - a.score)) {
    if (!passages.some(other => Math.abs(other.time - event.time) <= 6 * HOUR)) passages.push(event);
  }
  const during = passages.filter(event => event.time >= window.start - 2 * HOUR && event.time <= window.end + 2 * HOUR).sort((a, b) => b.score - a.score)[0];
  const near = passages.filter(event => event.time >= window.start - 24 * HOUR && event.time <= window.end + 24 * HOUR).sort((a, b) => Math.abs(a.time - (window.start + window.end) / 2) - Math.abs(b.time - (window.start + window.end) / 2))[0];
  const event = during || near;
  if (event) {
    const value = during ? "during-front" : event.time > window.end ? "pre-front" : "post-front";
    const { time: ignoredTime, score: ignoredScore, ...evidence } = event;
    return result(value, "Estimated passage from a 6-hour temperature change, wind shift, and pressure signal. Pre/post covers 24 hours; during allows 2 hours of timing uncertainty.", evidence);
  }
  const coverageStart = Math.floor((window.start - 24 * HOUR) / HOUR) * HOUR;
  const coverageEnd = Math.floor((window.end + 24 * HOUR) / HOUR) * HOUR;
  const expected = (coverageEnd - coverageStart) / HOUR + 1;
  const coverage = valid.filter(row => row.time >= coverageStart && row.time <= coverageEnd).length;
  const complete = coverage >= expected * 0.9 && byTime.has(coverageStart) && byTime.has(coverageEnd);
  return complete ? result("no-front", "No frontal pattern detected within 24 hours before or after the trip; this is an estimate.") : result("", "Not enough valid surrounding weather to classify this trip.");
}

export function automaticWeatherFrontPatch(trip, assessment = trip?.weatherData?.frontAssessment) {
  const manual = trip?.weatherFrontSource === "manual" || (trip?.weatherFront && trip.weatherFrontSource !== "automatic");
  if (manual) return {};
  if (assessment?.value === "" && trip?.weatherFrontSource === "automatic") return { weatherFront: "", weatherFrontSource: "automatic" };
  if (!["pre-front", "during-front", "post-front", "no-front"].includes(assessment?.value)) return {};
  return { weatherFront: assessment.value, weatherFrontSource: "automatic" };
}

export function resetAutomaticWeatherFront(trip) {
  if (trip?.weatherFrontSource !== "automatic") return trip;
  const next = { ...trip, weatherFront: "" };
  if (trip.weatherData) {
    next.weatherData = { ...trip.weatherData };
    delete next.weatherData.frontAssessment;
  }
  return next;
}
