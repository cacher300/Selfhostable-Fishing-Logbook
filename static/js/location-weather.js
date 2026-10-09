import { state, ui } from "./app-state.js";
import { findLaunchByIdOrName, tripWeatherCoordinates } from "./app-normalization.js";
import { displayStoredMeasurement, formatDisplayTime, formatUnitValue, unitPreference } from "./app-units.js";
import { els } from "./app-elements.js";
import { isUsableCoordinates } from "./app-media.js";
import { chopLabelForWaveHeight } from "./settings-core.js";
import { getValue, setValue } from "./trip-editor.js";
import { updateTripField } from "./draft-binding.js";
import { tripWaterTemperatureLocationAvailable, tripWaterTemperatureLookup, tripWaterTemperatureText } from "./trip-water-temperature.js";

export const weatherRequestCache = new Map();
export const marineRequestCache = new Map();
export const astronomyRequestCache = new Map();

let tripWaterTemperatureAutoValue = "";
let tripWaterTemperatureKey = "";
let tripWaterTemperatureRequestId = 0;

export function tripDraftForWeather() {
  const draft = ui.tripDraft || {};
  const locationId = draft.locationId || els.tripLocation.value;
  const launchId = draft.launchId || els.tripLaunch.value;
  const location = state.locations.find((item) => item.id === locationId);
  const launch = findLaunchByIdOrName(location, launchId, "");
  return {
    id: draft.id || els.tripId.value || "",
    date: draft.date || getValue("tripDate"),
    launchTime: draft.launchTime || draft.linesSetTime || getValue("launchTime"),
    linesPulledTime: draft.linesPulledTime || getValue("linesPulledTime"),
    location: location?.name || "",
    locationId: location?.id || "",
    launch: launch?.name || "",
    launchId: launch?.id || "",
    waveHeight: draft.waveHeight || getValue("waveHeight"),
    catches: []
  };
}

export function marineSnapshot(weatherData) {
  const marine = weatherData?.marine;
  if (!marine || marine.status === "unavailable") return null;
  if (marine.marineDataAvailable === false) return null;
  if (marine.marineDataAvailable === true) return marine;
  if (marine.waveHeightM !== null && marine.waveHeightM !== undefined && Number.isFinite(Number(marine.waveHeightM))) {
    return { ...marine, marineDataAvailable: true };
  }
  return null;
}

export function formatMarineWaveHeightM(waveHeightM) {
  if (waveHeightM === null || waveHeightM === undefined) return "";
  const text = formatUnitValue(waveHeightM, "waveHeight", "m", { decimals: 1 });
  return text === "Not logged" ? "" : text;
}

export function marineWaveHeightPlaceholderText(weatherData) {
  const marine = marineSnapshot(weatherData);
  if (marine?.marineDataAvailable && marine.waveHeightM !== null && marine.waveHeightM !== undefined) {
    return formatMarineWaveHeightM(marine.waveHeightM);
  }
  return "Wave height not available for this location";
}

export function updateMarineWaveHeightPlaceholder(weatherData) {
  if (!els.waveHeight) return;
  els.waveHeight.placeholder = marineWaveHeightPlaceholderText(weatherData);
}

export function tripWaveHeightDisplay(trip, weatherData) {
  const saved = String(trip?.waveHeight || "").trim();
  if (saved) return displayStoredMeasurement(saved, "waveHeight");
  const marine = marineSnapshot(weatherData);
  if (marine?.marineDataAvailable && marine.waveHeightM !== null && marine.waveHeightM !== undefined) {
    return formatMarineWaveHeightM(marine.waveHeightM);
  }
  return "No marine data";
}

export function tripWaveChopDisplay(trip, weatherData) {
  const waveHeight = tripWaveHeightDisplay(trip, weatherData);
  return chopLabelForWaveHeight(waveHeight);
}

export function formatWaveHeightChopLine(trip, weatherData) {
  const heightText = tripWaveHeightDisplay(trip, weatherData);
  const chopText = tripWaveChopDisplay(trip, weatherData);
  return [heightText, chopText].filter(Boolean).join(" / ") || "Not logged";
}

export function resolveTripWaveSnapshot(trip) {
  const marine = marineSnapshot(trip.weatherData);
  const userWave = String(trip.waveHeight || "").trim();
  if (userWave) {
    trip.waveHeight = userWave;
  } else if (marine?.marineDataAvailable && marine.waveHeightM !== null && marine.waveHeightM !== undefined) {
    trip.waveHeight = formatMarineWaveHeightM(marine.waveHeightM);
  } else {
    trip.waveHeight = "";
  }
  trip.waveChop = chopLabelForWaveHeight(trip.waveHeight) || "";
  return trip;
}

export function weatherCacheKey(coordinates, startDate, endDate) {
  return [
    Number(coordinates.latitude).toFixed(3),
    Number(coordinates.longitude).toFixed(3),
    startDate,
    endDate
  ].join("|");
}

export function tripEndDate(trip) {
  if (!trip.date) return "";
  const startTime = trip.launchTime || "";
  const endTime = trip.linesPulledTime || "";
  if (!startTime || !endTime) return trip.date;
  const start = startTime.split(":").map(Number);
  const end = endTime.split(":").map(Number);
  if (start.length !== 2 || end.length !== 2) return trip.date;
  if ((end[0] * 60 + end[1]) >= (start[0] * 60 + start[1])) return trip.date;
  const date = new Date(`${trip.date}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function fetchWeatherBundle(coordinates, startDate, endDate) {
  const key = weatherCacheKey(coordinates, startDate, endDate);
  if (weatherRequestCache.has(key)) return weatherRequestCache.get(key);
  const today = new Date().toISOString().slice(0, 10);
  const endpoint = startDate >= today ? "/api/weather/forecast" : "/api/weather/archive";
  const hourlyFields = [
    "temperature_2m",
    "apparent_temperature",
    "relative_humidity_2m",
    "dew_point_2m",
    "precipitation",
    "rain",
    "snowfall",
    "weather_code",
    "surface_pressure",
    "pressure_msl",
    "cloud_cover",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m"
  ];
  const params = new URLSearchParams({
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    start_date: startDate,
    end_date: endDate,
    timezone: "auto",
    cell_selection: "nearest",
    temperature_unit: "celsius",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    hourly: hourlyFields.join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "rain_sum",
      "snowfall_sum",
      "sunshine_duration",
      "daylight_duration",
      "sunrise",
      "sunset",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
      "wind_direction_10m_dominant"
    ].join(",")
  });
  const request = fetch(`${endpoint}?${params}`)
    .then((response) => {
      return response.json().then((data) => {
        if (!response.ok) throw new Error(data.error || "Weather API unavailable");
        return data;
      });
    })
    .then((data) => {
      if (data.error) throw new Error(data.reason || "Weather API unavailable");
      return data;
    })
    .catch((error) => {
      weatherRequestCache.delete(key);
      throw new Error(error.message === "Failed to fetch" ? "Weather service unavailable" : error.message);
    });
  weatherRequestCache.set(key, request);
  return request;
}

export async function fetchMarineBundle(coordinates, startDate, endDate) {
  const key = weatherCacheKey(coordinates, startDate, endDate);
  if (marineRequestCache.has(key)) return marineRequestCache.get(key);
  const params = new URLSearchParams({
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    start_date: startDate,
    end_date: endDate,
    timezone: "auto",
    cell_selection: "nearest",
    hourly: "wave_height,wave_direction,wave_period"
  });
  const request = fetch(`/api/weather/marine?${params}`)
    .then((response) => response.json().then((data) => {
      if (!response.ok) throw new Error(data.error || "Marine API unavailable");
      if (data.error) throw new Error(data.reason || data.error || "Marine API unavailable");
      return data;
    }))
    .catch((error) => {
      marineRequestCache.delete(key);
      throw new Error(error.message === "Failed to fetch" ? "Marine service unavailable" : error.message);
    });
  marineRequestCache.set(key, request);
  return request;
}

export async function fetchAstronomyBundle(coordinates, date, timezone = "") {
  const key = [
    Number(coordinates.latitude).toFixed(3),
    Number(coordinates.longitude).toFixed(3),
    date,
    timezone || "auto"
  ].join("|");
  if (astronomyRequestCache.has(key)) return astronomyRequestCache.get(key);
  const params = new URLSearchParams({
    lat: String(coordinates.latitude),
    lng: String(coordinates.longitude),
    date,
    time_format: "24"
  });
  if (timezone) params.set("timezone", timezone);
  const request = fetch(`/api/astronomy?${params}`)
    .then((response) => response.json().then((data) => {
      if (!response.ok) throw new Error(data.error || "Astronomy API unavailable");
      return data;
    }))
    .catch((error) => {
      astronomyRequestCache.delete(key);
      throw new Error(error.message === "Failed to fetch" ? "Astronomy service unavailable" : error.message);
    });
  astronomyRequestCache.set(key, request);
  return request;
}

export function hourlyRecords(bundle) {
  const hourly = bundle.hourly || {};
  return (hourly.time || []).map((time, index) => ({
    time,
    temperatureC: hourly.temperature_2m?.[index] ?? null,
    apparentTemperatureC: hourly.apparent_temperature?.[index] ?? null,
    humidityPercent: hourly.relative_humidity_2m?.[index] ?? null,
    dewPointC: hourly.dew_point_2m?.[index] ?? null,
    precipitationIn: hourly.precipitation?.[index] ?? null,
    rainIn: hourly.rain?.[index] ?? null,
    snowfallIn: hourly.snowfall?.[index] ?? null,
    weatherCode: hourly.weather_code?.[index] ?? null,
    pressureHpa: hourly.pressure_msl?.[index] ?? hourly.surface_pressure?.[index] ?? null,
    pressureMslHpa: hourly.pressure_msl?.[index] ?? null,
    cloudCoverPercent: hourly.cloud_cover?.[index] ?? null,
    windSpeedMph: hourly.wind_speed_10m?.[index] ?? null,
    windDirectionDegrees: hourly.wind_direction_10m?.[index] ?? null,
    windGustMph: hourly.wind_gusts_10m?.[index] ?? null
  }));
}

export function dailyRecord(bundle) {
  const daily = bundle.daily || {};
  return {
    date: daily.time?.[0] || "",
    weatherCode: daily.weather_code?.[0] ?? null,
    temperatureMaxC: daily.temperature_2m_max?.[0] ?? null,
    temperatureMinC: daily.temperature_2m_min?.[0] ?? null,
    precipitationIn: daily.precipitation_sum?.[0] ?? null,
    rainIn: daily.rain_sum?.[0] ?? null,
    snowfallIn: daily.snowfall_sum?.[0] ?? null,
    sunshineDurationSeconds: daily.sunshine_duration?.[0] ?? null,
    daylightDurationSeconds: daily.daylight_duration?.[0] ?? null,
    sunrise: daily.sunrise?.[0] ?? "",
    sunset: daily.sunset?.[0] ?? "",
    windSpeedMaxMph: daily.wind_speed_10m_max?.[0] ?? null,
    windGustMaxMph: daily.wind_gusts_10m_max?.[0] ?? null,
    windDirectionDegrees: daily.wind_direction_10m_dominant?.[0] ?? null
  };
}

export function tripWindowHours(trip, records) {
  const startTime = trip.launchTime || "";
  const endTime = trip.linesPulledTime || "";
  if (!startTime || !endTime) return records.filter((record) => record.time.startsWith(trip.date));
  const start = new Date(`${trip.date}T${startTime}`);
  const end = new Date(`${tripEndDate(trip)}T${endTime}`);
  return records.filter((record) => {
    const time = new Date(record.time);
    return time >= start && time <= end;
  });
}

export function numericRecordValues(records, key) {
  return records
    .map((record) => record?.[key])
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter(Number.isFinite);
}

export function averageNumber(records, key) {
  const values = numericRecordValues(records, key);
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function sumNumber(records, key) {
  const values = numericRecordValues(records, key);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

export function minNumber(records, key) {
  const values = numericRecordValues(records, key);
  if (!values.length) return null;
  return Math.round(Math.min(...values) * 10) / 10;
}

export function maxNumber(records, key) {
  const values = numericRecordValues(records, key);
  if (!values.length) return null;
  return Math.round(Math.max(...values) * 10) / 10;
}

export function mostFrequentValue(records, key) {
  const counts = new Map();
  records.forEach((record) => {
    const value = record?.[key];
    if (value === null || value === undefined || value === "") return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function tripWindowSummary(records) {
  return {
    weatherCode: mostFrequentValue(records, "weatherCode"),
    temperatureC: averageNumber(records, "temperatureC"),
    apparentTemperatureC: averageNumber(records, "apparentTemperatureC"),
    temperatureMaxC: maxNumber(records, "temperatureC"),
    temperatureMinC: minNumber(records, "temperatureC"),
    humidityPercent: averageNumber(records, "humidityPercent"),
    pressureHpa: averageNumber(records, "pressureHpa"),
    pressureMslHpa: averageNumber(records, "pressureMslHpa"),
    cloudCoverPercent: averageNumber(records, "cloudCoverPercent"),
    precipitationIn: sumNumber(records, "precipitationIn"),
    windSpeedMph: averageNumber(records, "windSpeedMph"),
    windGustMph: averageNumber(records, "windGustMph"),
    windDirectionDegrees: averageNumber(records, "windDirectionDegrees")
  };
}

export function recordTimeMs(record) {
  const value = new Date(record?.time || "").getTime();
  return Number.isFinite(value) ? value : null;
}

export function barometricTrendRate(records) {
  const pressureRecords = records
    .filter((record) => Number.isFinite(Number(record.pressureMslHpa ?? record.pressureHpa)) && recordTimeMs(record) !== null)
    .sort((a, b) => recordTimeMs(a) - recordTimeMs(b));
  const current = pressureRecords.at(-1);
  if (!current) return null;
  const currentTime = recordTimeMs(current);
  const targetTime = currentTime - (3 * 60 * 60 * 1000);
  const prior = pressureRecords.reduce((best, record) => {
    const delta = Math.abs(recordTimeMs(record) - targetTime);
    if (!best || delta < best.delta) return { record, delta };
    return best;
  }, null)?.record;
  if (!prior || prior === current) return null;
  return Math.round((Number(current.pressureMslHpa ?? current.pressureHpa) - Number(prior.pressureMslHpa ?? prior.pressureHpa)) * 10) / 10;
}

export function barometricTrendLabel(delta) {
  const value = Number(delta);
  if (!Number.isFinite(value)) return "";
  if (value <= -3) return "falling fast";
  if (value < -0.8) return "falling";
  if (value >= 3) return "rising fast";
  if (value > 0.8) return "rising";
  return "steady";
}

export function marineRecords(bundle) {
  const hourly = bundle?.hourly || {};
  return (hourly.time || []).map((time, index) => ({
    time,
    waveHeightM: hourly.wave_height?.[index] ?? null,
    waveDirectionDegrees: hourly.wave_direction?.[index] ?? null,
    wavePeriodSeconds: hourly.wave_period?.[index] ?? null
  }));
}

export function marineDataAvailable(records) {
  return numericRecordValues(records, "waveHeightM").length > 0;
}

export function nearestMarineRecord(records, trip) {
  const validRecords = records.filter((record) => Number.isFinite(Number(record.waveHeightM)));
  if (!validRecords.length) return null;
  const tripDate = trip.date || validRecords[0].time?.slice(0, 10) || "";
  const startTime = trip.launchTime || "12:00";
  const target = new Date(`${tripDate}T${startTime}`).getTime();
  if (!Number.isFinite(target)) return validRecords[0];
  return validRecords.reduce((best, record) => {
    const delta = Math.abs(new Date(record.time).getTime() - target);
    if (!Number.isFinite(delta)) return best;
    if (!best || delta < best.delta) return { record, delta };
    return best;
  }, null)?.record || validRecords[0];
}

export function marineWindowSummary(records, trip = {}) {
  if (!marineDataAvailable(records)) {
    return {
      marineDataAvailable: false,
      waveHeightM: null,
      waveHeightMaxM: null,
      waveDirectionDegrees: null,
      wavePeriodSeconds: null,
      waveTime: ""
    };
  }
  const nearest = nearestMarineRecord(records, trip);
  return {
    marineDataAvailable: true,
    waveHeightM: nearest?.waveHeightM ?? null,
    waveHeightMaxM: maxNumber(records, "waveHeightM"),
    waveDirectionDegrees: nearest?.waveDirectionDegrees ?? null,
    wavePeriodSeconds: nearest?.wavePeriodSeconds ?? null,
    waveTime: nearest?.time || ""
  };
}

export function numericDelta(records, key) {
  const values = numericRecordValues(records, key);
  if (values.length < 2) return null;
  return Math.round((values.at(-1) - values[0]) * 10) / 10;
}

export function windDirectionShift(records) {
  const values = numericRecordValues(records, "windDirectionDegrees");
  if (values.length < 2) return null;
  const delta = Math.abs((((values.at(-1) - values[0]) % 360) + 540) % 360 - 180);
  return Math.round(delta);
}

export function trendLabel(delta, unit, threshold = 1) {
  if (delta === null || delta === undefined) return "";
  if (Math.abs(delta) < threshold) return `steady ${unit}`;
  return `${delta > 0 ? "rising" : "falling"} ${unit}`;
}

export function tripWeatherTrend(records) {
  const pressureDelta = numericDelta(records, "pressureHpa");
  const temperatureDelta = numericDelta(records, "temperatureC");
  const windSpeedDelta = numericDelta(records, "windSpeedMph");
  const cloudCoverDelta = numericDelta(records, "cloudCoverPercent");
  const windDirectionDelta = windDirectionShift(records);
  return {
    pressureDeltaHpa: pressureDelta,
    temperatureDeltaC: temperatureDelta,
    windSpeedDeltaMph: windSpeedDelta,
    cloudCoverDeltaPercent: cloudCoverDelta,
    windDirectionShiftDegrees: windDirectionDelta,
    pressureTrend: trendLabel(pressureDelta, "pressure", 1.5),
    temperatureTrend: trendLabel(temperatureDelta, "temp", 2),
    windTrend: trendLabel(windSpeedDelta, "wind", 2),
    cloudTrend: trendLabel(cloudCoverDelta, "clouds", 15)
  };
}

export function frontTagFromTrend(trend) {
  const pressure = Number(trend?.pressureDeltaHpa);
  const windShift = Number(trend?.windDirectionShiftDegrees);
  const clouds = Number(trend?.cloudCoverDeltaPercent);
  const wind = Number(trend?.windSpeedDeltaMph);
  if (Number.isFinite(pressure) && pressure <= -2 && ((Number.isFinite(windShift) && windShift >= 45) || (Number.isFinite(clouds) && clouds >= 20) || (Number.isFinite(wind) && wind >= 4))) {
    return "Front moving in";
  }
  if (Number.isFinite(pressure) && pressure >= 2 && ((Number.isFinite(clouds) && clouds <= -15) || (Number.isFinite(wind) && wind <= -3))) {
    return "Post-front clearing";
  }
  if (Number.isFinite(pressure) && Math.abs(pressure) < 1.5 && (!Number.isFinite(windShift) || windShift < 35)) {
    return "Stable";
  }
  return "Unsettled";
}

export function timeText(value) {
  if (!value) return "";
  const text = String(value);
  const match = text.match(/T(\d{2}:\d{2})/) || text.match(/^(\d{1,2}:\d{2})/);
  return match ? match[1].padStart(5, "0") : text;
}

export function astronomyData(payload) {
  const result = payload?.results || {};
  if (!Object.keys(result).length) return null;
  return {
    sunrise: result.sunrise || "",
    sunset: result.sunset || "",
    moonrise: result.moonrise || "",
    moonset: result.moonset || "",
    phase: result.moon_phase || "",
    illuminationPercent: result.moon_illumination ?? null
  };
}

export function nearestHourlyRecord(records, trip, catchTime) {
  if (!catchTime) return null;
  let dateKey = trip.date;
  const startTime = trip.launchTime || "";
  const endTime = trip.linesPulledTime || "";
  if (startTime && endTime && tripEndDate(trip) !== trip.date) {
    const [catchHour, catchMinute] = catchTime.split(":").map(Number);
    const [startHour, startMinute] = startTime.split(":").map(Number);
    if (Number.isFinite(catchHour) && Number.isFinite(catchMinute) && Number.isFinite(startHour) && Number.isFinite(startMinute)) {
      if ((catchHour * 60 + catchMinute) < (startHour * 60 + startMinute)) dateKey = tripEndDate(trip);
    }
  }
  const target = new Date(`${dateKey}T${catchTime}`);
  let best = null;
  let bestDelta = Infinity;
  records.forEach((record) => {
    const delta = Math.abs(new Date(record.time) - target);
    if (delta < bestDelta) {
      best = record;
      bestDelta = delta;
    }
  });
  return best;
}

export function weatherUnits(bundle) {
  return {
    ...(bundle.hourly_units || {}),
    ...(bundle.daily_units || {})
  };
}

export async function buildWeatherDataForTrip(trip, source, includeCatches = true) {
  const endDate = tripEndDate(trip);
  const bundle = await fetchWeatherBundle(source.coordinates, trip.date, endDate || trip.date);
  let astronomy = null;
  try {
    astronomy = astronomyData(await fetchAstronomyBundle(source.coordinates, trip.date, bundle.timezone || ""));
  } catch (error) {
    console.warn("Could not fetch astronomy data.", error);
  }
  const hourly = hourlyRecords(bundle);
  const windowRecords = tripWindowHours(trip, hourly);
  let marine = null;
  try {
    const marineBundle = await fetchMarineBundle(source.coordinates, trip.date, endDate || trip.date);
    const marineHourly = marineRecords(marineBundle);
    const marineWindow = tripWindowHours(trip, marineHourly);
    marine = {
      source,
      timezone: marineBundle.timezone || "",
      units: marineBundle.hourly_units || {},
      hourly: marineWindow,
      ...marineWindowSummary(marineHourly, trip)
    };
  } catch (error) {
    marine = {
      status: "unavailable",
      message: error.message || "Marine data unavailable",
      marineDataAvailable: false,
      waveHeightM: null,
      waveHeightMaxM: null,
      waveDirectionDegrees: null,
      wavePeriodSeconds: null,
      waveTime: ""
    };
  }
  const weatherData = {
    source,
    fetchedAt: new Date().toISOString(),
    timezone: bundle.timezone || "",
    units: weatherUnits(bundle),
    daily: dailyRecord(bundle),
    hourly: windowRecords,
    tripWindow: {
      ...tripWindowSummary(windowRecords),
      pressureTrendRateHpa3h: barometricTrendRate(hourly),
      pressureTrendRateLabel: barometricTrendLabel(barometricTrendRate(hourly))
    },
    trend: tripWeatherTrend(windowRecords),
    marine,
    sunMoon: astronomy
  };
  weatherData.frontTag = frontTagFromTrend(weatherData.trend);
  if (!includeCatches) return { tripWeather: weatherData, catches: trip.catches || [] };

  const catches = await Promise.all((trip.catches || []).map(async (catchItem) => {
    if (!catchItem.time) return catchItem;
    const catchSource = isUsableCoordinates(catchItem.coordinates)
      ? { type: "catch", name: "Catch GPS", coordinates: catchItem.coordinates }
      : source;
    const catchBundle = catchSource === source
      ? bundle
      : await fetchWeatherBundle(catchSource.coordinates, trip.date, endDate || trip.date);
    const catchHourly = hourlyRecords(catchBundle);
    const nearest = nearestHourlyRecord(catchHourly, trip, catchItem.time);
    return nearest ? {
      ...catchItem,
      weatherData: {
        source: catchSource,
        fetchedAt: new Date().toISOString(),
        timezone: catchBundle.timezone || "",
        units: weatherUnits(catchBundle),
        hourly: nearest
      }
    } : catchItem;
  }));
  return { tripWeather: weatherData, catches };
}

export async function enrichTripWithWeather(trip) {
  const source = tripWeatherCoordinates(trip);
  if (!trip.date || !source) {
    return {
      ...trip,
      weatherData: {
        status: source ? "missing-date" : "missing-coordinates",
        updatedAt: new Date().toISOString()
      }
    };
  }
  try {
    const result = await buildWeatherDataForTrip(trip, source, true);
    return { ...trip, weatherData: result.tripWeather, catches: result.catches };
  } catch (error) {
    return {
      ...trip,
      weatherData: {
        ...(trip.weatherData || {}),
        status: "error",
        message: error.message || "Could not fetch weather.",
        updatedAt: new Date().toISOString()
      }
    };
  }
}

export function weatherWindText(weatherData) {
  const wind = weatherData?.tripWindow?.windSpeedMph;
  const gust = weatherData?.tripWindow?.windGustMph;
  const direction = weatherData?.tripWindow?.windDirectionDegrees;
  if (wind === null || wind === undefined) {
    const daily = weatherData?.daily || {};
    if (daily.windSpeedMaxMph === null || daily.windSpeedMaxMph === undefined) return "";
    const dailyDirection = windDirectionLabel(daily.windDirectionDegrees);
    const dailyGust = daily.windGustMaxMph === null || daily.windGustMaxMph === undefined ? "" : `, gust ${formatUnitValue(daily.windGustMaxMph, "windSpeed", "mph")}`;
    return `${dailyDirection ? `${dailyDirection} ` : ""}${formatUnitValue(daily.windSpeedMaxMph, "windSpeed", "mph")}${dailyGust}`;
  }
  const directionText = direction === null || direction === undefined ? "" : `${windDirectionLabel(direction)} `;
  const gustText = gust === null || gust === undefined ? "" : `, gust ${formatUnitValue(gust, "windSpeed", "mph")}`;
  return `${directionText}${formatUnitValue(wind, "windSpeed", "mph")}${gustText}`;
}

export function windDirectionLabel(degrees) {
  const value = Number(degrees);
  if (!Number.isFinite(value)) return "";
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round((((value % 360) + 360) % 360) / 45) % directions.length;
  return directions[index];
}

export function hourlyWindText(hourly) {
  const wind = hourly?.windSpeedMph;
  if (wind === null || wind === undefined) return "";
  const direction = windDirectionLabel(hourly.windDirectionDegrees);
  const gust = hourly.windGustMph === null || hourly.windGustMph === undefined ? "" : `, gust ${formatUnitValue(hourly.windGustMph, "windSpeed", "mph")}`;
  return `${direction ? `${direction} ` : ""}${formatUnitValue(wind, "windSpeed", "mph")}${gust}`;
}

export function celsiusText(value) {
  return formatUnitValue(value, "airTemperature", "C");
}

export function catchWeatherSummary(weatherData) {
  const hourly = weatherData?.hourly;
  if (!hourly) return "";
  return [
    hourly.temperatureC === null || hourly.temperatureC === undefined ? "" : celsiusText(Math.round(hourly.temperatureC)),
    hourly.apparentTemperatureC === null || hourly.apparentTemperatureC === undefined ? "" : `feels ${celsiusText(Math.round(hourly.apparentTemperatureC))}`,
    hourlyWindText(hourly),
    hourly.cloudCoverPercent === null || hourly.cloudCoverPercent === undefined ? "" : `${Math.round(hourly.cloudCoverPercent)}% cloud`
  ].filter(Boolean).join(" · ");
}

export function moonWindowForTime(time, sunMoon) {
  if (!time || !sunMoon) return "";
  const [hour, minute] = String(time).split(":").map(Number);
  if (![hour, minute].every(Number.isFinite)) return "";
  const value = hour * 60 + minute;
  const checks = [
    ["Moonrise", timeText(sunMoon.moonrise)],
    ["Moonset", timeText(sunMoon.moonset)]
  ];
  const match = checks.find(([, clock]) => {
    const [checkHour, checkMinute] = String(clock || "").split(":").map(Number);
    if (![checkHour, checkMinute].every(Number.isFinite)) return false;
    const delta = Math.abs((((value - (checkHour * 60 + checkMinute)) % 1440) + 2160) % 1440 - 720);
    return delta <= 90;
  });
  return match?.[0] || "";
}

export function setWeatherStatus(message) {
  if (els.weatherFetchStatus) els.weatherFetchStatus.textContent = message;
}

export function weatherTagForCode(code) {
  const value = Number(code);
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "Sunny";
  if ([1, 2].includes(value)) return "Partly Cloudy";
  if (value === 3) return "Overcast";
  if ([45, 48].includes(value)) return "Fog";
  if ([51, 53, 55, 56, 57, 61, 66, 80].includes(value)) return "Light Rain";
  if ([63, 65, 67, 81, 82].includes(value)) return "Heavy Rain";
  if ([71, 73, 75, 77, 85, 86].includes(value)) return "Snow";
  if ([95, 96, 99].includes(value)) return "Thunderstorms";
  return "Mixed";
}

export function weatherCardConditionsLabel() {
  const time = formatDisplayTime(document.querySelector("#launchTime")?.value || "");
  return time ? `Conditions at ${time}` : "Trip-window conditions";
}

export function weatherCardLocationLabel(weatherData) {
  const launch = els.tripLaunch?.selectedOptions?.[0]?.textContent?.trim();
  const location = els.tripLocation?.selectedOptions?.[0]?.textContent?.trim();
  return weatherData?.source?.name
    || (!["No launch / area selected", ""].includes(launch) ? launch : "")
    || (!["Select location", ""].includes(location) ? location : "")
    || "Select location";
}

export function weatherCardWindText(summary) {
  if (!Number.isFinite(Number(summary?.windSpeedMph))) return "Not available";
  const direction = windDirectionLabel(summary.windDirectionDegrees);
  const speed = formatUnitValue(summary.windSpeedMph, "windSpeed", "mph");
  return [direction, speed].filter(Boolean).join(" ");
}

export function setWeatherCardValue(element, value) {
  if (element) element.textContent = value || "Not available";
}

export function renderWeatherSummary(weatherData = ui.activeTripWeatherData) {
  const summary = weatherData?.tripWindow;
  const hasSummary = summary && [summary.temperatureC, summary.windSpeedMph, summary.pressureHpa, summary.cloudCoverPercent]
    .some((value) => Number.isFinite(Number(value)));
  els.weatherSummary?.classList.toggle("has-data", Boolean(hasSummary));
  if (els.weatherSummaryLocation) els.weatherSummaryLocation.textContent = weatherCardLocationLabel(weatherData);
  if (!hasSummary) {
    [
      els.weatherSummaryTemperature,
      els.weatherSummaryWind,
      els.weatherSummaryGusts,
      els.weatherSummaryCloudCover,
      els.weatherSummaryPrecipitation,
      els.weatherSummaryPressure
    ].forEach((element) => setWeatherCardValue(element, "-"));
    if (els.weatherSummaryUpdated) els.weatherSummaryUpdated.textContent = "";
    return;
  }

  setWeatherCardValue(els.weatherSummaryTemperature, Number.isFinite(Number(summary.temperatureC)) ? celsiusText(summary.temperatureC) : "Not available");
  setWeatherCardValue(els.weatherSummaryWind, weatherCardWindText(summary));
  setWeatherCardValue(els.weatherSummaryGusts, Number.isFinite(Number(summary.windGustMph)) ? formatUnitValue(summary.windGustMph, "windSpeed", "mph") : "Not available");
  setWeatherCardValue(els.weatherSummaryCloudCover, Number.isFinite(Number(summary.cloudCoverPercent)) ? `${Math.round(summary.cloudCoverPercent)}%` : "Not available");
  setWeatherCardValue(els.weatherSummaryPrecipitation, Number.isFinite(Number(summary.precipitationIn)) ? formatUnitValue(summary.precipitationIn, "precipitation", "in", { decimals: 1 }) : "Not available");
  setWeatherCardValue(els.weatherSummaryPressure, Number.isFinite(Number(summary.pressureHpa)) ? formatUnitValue(summary.pressureHpa, "pressure", "hPa", { decimals: 2 }) : "Not available");
  const autoWeatherTag = weatherTagForCode(summary.weatherCode);
  const weatherSelect = document.querySelector("#weather");
  if (autoWeatherTag && weatherSelect && !weatherSelect.value) {
    weatherSelect.value = autoWeatherTag;
    updateTripField("weather", autoWeatherTag);
  }
  if (els.weatherSummaryUpdated) els.weatherSummaryUpdated.textContent = "";
}

export async function refreshTripWeatherPreview(force = false) {
  const trip = tripDraftForWeather();
  const source = tripWeatherCoordinates(trip);
  const key = JSON.stringify({
    date: trip.date,
    launchTime: trip.launchTime,
    linesPulledTime: trip.linesPulledTime,
    locationId: trip.locationId,
    launchId: trip.launchId,
    waveHeight: trip.waveHeight,
    chopRanges: state.settings?.chopRanges
  });
  if (!force && key === ui.activeTripWeatherKey) return;
  ui.activeTripWeatherKey = key;
  if (!trip.date || !source) {
    ui.activeTripWeatherData = null;
    renderWeatherSummary();
    setWeatherStatus(source ? "Choose a trip date" : "Add a location or launch pin to fetch weather");
    return;
  }
  setWeatherStatus("Fetching weather...");
  renderWeatherSummary(null);
  try {
    const result = await buildWeatherDataForTrip(trip, source, false);
    ui.activeTripWeatherData = result.tripWeather;
    updateMarineWaveHeightPlaceholder(ui.activeTripWeatherData);
    renderWeatherSummary();
    setWeatherStatus(weatherCardConditionsLabel());
  } catch (error) {
    ui.activeTripWeatherData = null;
    renderWeatherSummary();
    setWeatherStatus(error.message || "Weather fetch failed");
  }
}

export function resetTripWaterTemperatureAutofill() {
  tripWaterTemperatureAutoValue = "";
  tripWaterTemperatureKey = "";
  tripWaterTemperatureRequestId += 1;
}

export function markTripWaterTemperatureManual() {
  tripWaterTemperatureAutoValue = "";
  tripWaterTemperatureRequestId += 1;
}

export async function refreshTripWaterTemperature() {
  if (!els.tripDialog?.open) return;
  const trip = tripDraftForWeather();
  const source = tripWeatherCoordinates(trip);
  const coordinates = source?.coordinates;
  const unit = unitPreference("waterTemperature");
  const lookup = coordinates && tripWaterTemperatureLocationAvailable(trip, coordinates) ? tripWaterTemperatureLookup(trip) : null;
  const key = JSON.stringify({
    date: trip.date,
    launchTime: trip.launchTime,
    locationId: trip.locationId,
    launchId: trip.launchId,
    coordinates,
    unit,
    lookup
  });
  if (key === tripWaterTemperatureKey) return;

  const previousAutoValue = tripWaterTemperatureAutoValue;
  const field = document.querySelector("#waterTemp");
  const currentValue = String(field?.value || "").trim();
  const mayReplace = !currentValue || (previousAutoValue && currentValue === previousAutoValue);
  tripWaterTemperatureKey = key;
  tripWaterTemperatureAutoValue = "";
  const requestId = ++tripWaterTemperatureRequestId;

  if (previousAutoValue && currentValue === previousAutoValue) {
    setValue("waterTemp", "");
    updateTripField("waterTemp", "");
  }
  if (!mayReplace || !coordinates || !lookup || !window.noaaGreatLakesApi?.temperatureValue) return;

  try {
    const options = lookup.time
      ? { time: lookup.time, depth: 0, latitude: coordinates.latitude, longitude: coordinates.longitude }
      : { forecastHour: lookup.forecastHour, depth: 0, resolution: 320, latitude: coordinates.latitude, longitude: coordinates.longitude };
    const reading = await window.noaaGreatLakesApi.temperatureValue(options);
    if (requestId !== tripWaterTemperatureRequestId || !reading?.available) return;
    const value = tripWaterTemperatureText(reading.temperatureC, unit);
    if (!value) return;
    const latestValue = String(document.querySelector("#waterTemp")?.value || "").trim();
    if (latestValue && latestValue !== previousAutoValue) return;
    tripWaterTemperatureAutoValue = value;
    setValue("waterTemp", value);
    updateTripField("waterTemp", value);
  } catch {
    // Temperature data is optional; an unavailable lookup should not block saving.
  }
}

export async function resyncTripWeather() {
  weatherRequestCache.clear();
  marineRequestCache.clear();
  astronomyRequestCache.clear();
  ui.activeTripWeatherKey = "";
  if (els.resyncWeatherButton) {
    els.resyncWeatherButton.disabled = true;
    els.resyncWeatherButton.textContent = "Resyncing...";
  }
  try {
    await refreshTripWeatherPreview(true);
  } finally {
    if (els.resyncWeatherButton) {
      els.resyncWeatherButton.disabled = false;
      els.resyncWeatherButton.textContent = "Resync";
    }
  }
}

export function scheduleTripWeatherPreview(force = false) {
  if (!els.tripDialog?.open) return;
  clearTimeout(ui.weatherPreviewTimer);
  ui.weatherPreviewTimer = setTimeout(() => {
    void refreshTripWeatherPreview(force);
    void refreshTripWaterTemperature();
  }, 350);
}

export function weatherValue(value, suffix = "") {
  return value === null || value === undefined || value === "" ? "Not logged" : `${value}${suffix}`;
}

export function weatherValueWithTrend(value, ...trendParts) {
  const trends = trendParts.filter(Boolean);
  return [value || "Not logged", ...trends].join(" / ");
}
