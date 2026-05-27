const weatherRequestCache = new Map();
const marineRequestCache = new Map();
const astronomyRequestCache = new Map();

function tripDraftForWeather() {
  const location = state.locations.find((item) => item.id === els.tripLocation.value);
  const launch = findLaunchByIdOrName(location, els.tripLaunch.value, "");
  return {
    id: els.tripId.value || "",
    date: getValue("tripDate"),
    startTime: getValue("startTime"),
    endTime: getValue("endTime"),
    location: location?.name || "",
    locationId: location?.id || "",
    launch: launch?.name || "",
    launchId: launch?.id || "",
    waveHeight: getValue("waveHeight"),
    catches: []
  };
}

function marineSnapshot(weatherData) {
  const marine = weatherData?.marine;
  if (!marine || marine.status === "unavailable") return null;
  if (marine.marineDataAvailable === false) return null;
  if (marine.marineDataAvailable === true) return marine;
  if (marine.waveHeightM !== null && marine.waveHeightM !== undefined && Number.isFinite(Number(marine.waveHeightM))) {
    return { ...marine, marineDataAvailable: true };
  }
  return null;
}

function formatMarineWaveHeightM(waveHeightM) {
  if (waveHeightM === null || waveHeightM === undefined) return "";
  const text = formatUnitValue(waveHeightM, "waveHeight", "m", { decimals: 1 });
  return text === "Not logged" ? "" : text;
}

function marineWaveHeightPlaceholderText(weatherData) {
  const marine = marineSnapshot(weatherData);
  if (marine?.marineDataAvailable && marine.waveHeightM !== null && marine.waveHeightM !== undefined) {
    return formatMarineWaveHeightM(marine.waveHeightM);
  }
  return "Wave height not available for this location";
}

function updateMarineWaveHeightPlaceholder(weatherData) {
  if (!els.waveHeight) return;
  els.waveHeight.placeholder = marineWaveHeightPlaceholderText(weatherData);
}

function updateAutoWaveChopDisplay(weatherData = activeTripWeatherData) {
  if (!els.waveChopDisplay) return;
  const typedHeight = String(els.waveHeight?.value || "").trim();
  const marine = marineSnapshot(weatherData);
  const sourceHeight = typedHeight
    || (marine?.marineDataAvailable && marine.waveHeightM !== null && marine.waveHeightM !== undefined ? formatMarineWaveHeightM(marine.waveHeightM) : "");
  const chop = chopLabelForWaveHeight(sourceHeight);
  els.waveChopDisplay.value = chop || "";
  els.waveChopDisplay.placeholder = sourceHeight ? "Auto from wave height" : "Auto unavailable (no wave height)";
}

function tripWaveHeightDisplay(trip, weatherData) {
  const saved = String(trip?.waveHeight || "").trim();
  if (saved) return saved;
  const marine = marineSnapshot(weatherData);
  if (marine?.marineDataAvailable && marine.waveHeightM !== null && marine.waveHeightM !== undefined) {
    return formatMarineWaveHeightM(marine.waveHeightM);
  }
  return "No marine data";
}

function tripWaveChopDisplay(trip, weatherData) {
  const waveHeight = tripWaveHeightDisplay(trip, weatherData);
  return chopLabelForWaveHeight(waveHeight);
}

function formatWaveHeightChopLine(trip, weatherData) {
  const heightText = tripWaveHeightDisplay(trip, weatherData);
  const chopText = tripWaveChopDisplay(trip, weatherData);
  return [heightText, chopText].filter(Boolean).join(" / ") || "Not logged";
}

function resolveTripWaveSnapshot(trip) {
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

function weatherCacheKey(coordinates, startDate, endDate) {
  return [
    Number(coordinates.latitude).toFixed(3),
    Number(coordinates.longitude).toFixed(3),
    startDate,
    endDate
  ].join("|");
}

function tripEndDate(trip) {
  if (!trip.date) return "";
  if (!trip.startTime || !trip.endTime) return trip.date;
  const start = trip.startTime.split(":").map(Number);
  const end = trip.endTime.split(":").map(Number);
  if (start.length !== 2 || end.length !== 2) return trip.date;
  if ((end[0] * 60 + end[1]) >= (start[0] * 60 + start[1])) return trip.date;
  const date = new Date(`${trip.date}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function fetchWeatherBundle(coordinates, startDate, endDate) {
  const key = weatherCacheKey(coordinates, startDate, endDate);
  if (weatherRequestCache.has(key)) return weatherRequestCache.get(key);
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
    hourly: [
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
      "visibility",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m"
    ].join(","),
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
  const today = new Date().toISOString().slice(0, 10);
  const endpoint = startDate >= today ? "/api/weather/forecast" : "/api/weather/archive";
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

async function fetchMarineBundle(coordinates, startDate, endDate) {
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

async function fetchAstronomyBundle(coordinates, date, timezone = "") {
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

function hourlyRecords(bundle) {
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
    visibilityMeters: hourly.visibility?.[index] ?? null,
    windSpeedMph: hourly.wind_speed_10m?.[index] ?? null,
    windDirectionDegrees: hourly.wind_direction_10m?.[index] ?? null,
    windGustMph: hourly.wind_gusts_10m?.[index] ?? null
  }));
}

function dailyRecord(bundle) {
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

function tripWindowHours(trip, records) {
  if (!trip.startTime || !trip.endTime) return records.filter((record) => record.time.startsWith(trip.date));
  const start = new Date(`${trip.date}T${trip.startTime}`);
  const end = new Date(`${tripEndDate(trip)}T${trip.endTime}`);
  return records.filter((record) => {
    const time = new Date(record.time);
    return time >= start && time <= end;
  });
}

function numericRecordValues(records, key) {
  return records
    .map((record) => record?.[key])
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter(Number.isFinite);
}

function averageNumber(records, key) {
  const values = numericRecordValues(records, key);
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function sumNumber(records, key) {
  const values = numericRecordValues(records, key);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

function minNumber(records, key) {
  const values = numericRecordValues(records, key);
  if (!values.length) return null;
  return Math.round(Math.min(...values) * 10) / 10;
}

function maxNumber(records, key) {
  const values = numericRecordValues(records, key);
  if (!values.length) return null;
  return Math.round(Math.max(...values) * 10) / 10;
}

function tripWindowSummary(records) {
  return {
    temperatureC: averageNumber(records, "temperatureC"),
    apparentTemperatureC: averageNumber(records, "apparentTemperatureC"),
    temperatureMaxC: maxNumber(records, "temperatureC"),
    temperatureMinC: minNumber(records, "temperatureC"),
    humidityPercent: averageNumber(records, "humidityPercent"),
    pressureHpa: averageNumber(records, "pressureHpa"),
    pressureMslHpa: averageNumber(records, "pressureMslHpa"),
    cloudCoverPercent: averageNumber(records, "cloudCoverPercent"),
    visibilityMeters: averageNumber(records, "visibilityMeters"),
    precipitationIn: sumNumber(records, "precipitationIn"),
    windSpeedMph: averageNumber(records, "windSpeedMph"),
    windGustMph: averageNumber(records, "windGustMph"),
    windDirectionDegrees: averageNumber(records, "windDirectionDegrees")
  };
}

function recordTimeMs(record) {
  const value = new Date(record?.time || "").getTime();
  return Number.isFinite(value) ? value : null;
}

function barometricTrendRate(records) {
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

function barometricTrendLabel(delta) {
  const value = Number(delta);
  if (!Number.isFinite(value)) return "";
  if (value <= -3) return "falling fast";
  if (value < -0.8) return "falling";
  if (value >= 3) return "rising fast";
  if (value > 0.8) return "rising";
  return "steady";
}

function visibilityLabel(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value)) return "";
  if (value >= 10000) return "clear visibility";
  if (value >= 5000) return "good visibility";
  if (value >= 1000) return "reduced visibility";
  return "poor visibility";
}

function marineRecords(bundle) {
  const hourly = bundle?.hourly || {};
  return (hourly.time || []).map((time, index) => ({
    time,
    waveHeightM: hourly.wave_height?.[index] ?? null,
    waveDirectionDegrees: hourly.wave_direction?.[index] ?? null,
    wavePeriodSeconds: hourly.wave_period?.[index] ?? null
  }));
}

function marineDataAvailable(records) {
  return numericRecordValues(records, "waveHeightM").length > 0;
}

function nearestMarineRecord(records, trip) {
  const validRecords = records.filter((record) => Number.isFinite(Number(record.waveHeightM)));
  if (!validRecords.length) return null;
  const tripDate = trip.date || validRecords[0].time?.slice(0, 10) || "";
  const startTime = trip.startTime || "12:00";
  const target = new Date(`${tripDate}T${startTime}`).getTime();
  if (!Number.isFinite(target)) return validRecords[0];
  return validRecords.reduce((best, record) => {
    const delta = Math.abs(new Date(record.time).getTime() - target);
    if (!Number.isFinite(delta)) return best;
    if (!best || delta < best.delta) return { record, delta };
    return best;
  }, null)?.record || validRecords[0];
}

function marineWindowSummary(records, trip = {}) {
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

function numericDelta(records, key) {
  const values = numericRecordValues(records, key);
  if (values.length < 2) return null;
  return Math.round((values.at(-1) - values[0]) * 10) / 10;
}

function windDirectionShift(records) {
  const values = numericRecordValues(records, "windDirectionDegrees");
  if (values.length < 2) return null;
  const delta = Math.abs((((values.at(-1) - values[0]) % 360) + 540) % 360 - 180);
  return Math.round(delta);
}

function trendLabel(delta, unit, threshold = 1) {
  if (delta === null || delta === undefined) return "";
  if (Math.abs(delta) < threshold) return `steady ${unit}`;
  return `${delta > 0 ? "rising" : "falling"} ${unit}`;
}

function tripWeatherTrend(records) {
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

function frontTagFromTrend(trend) {
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

function timeText(value) {
  if (!value) return "";
  const text = String(value);
  const match = text.match(/T(\d{2}:\d{2})/) || text.match(/^(\d{1,2}:\d{2})/);
  return match ? match[1].padStart(5, "0") : text;
}

function astronomyData(payload) {
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

function nearestHourlyRecord(records, trip, catchTime) {
  if (!catchTime) return null;
  let dateKey = trip.date;
  if (trip.startTime && trip.endTime && tripEndDate(trip) !== trip.date) {
    const [catchHour, catchMinute] = catchTime.split(":").map(Number);
    const [startHour, startMinute] = trip.startTime.split(":").map(Number);
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

function weatherUnits(bundle) {
  return {
    ...(bundle.hourly_units || {}),
    ...(bundle.daily_units || {})
  };
}

async function buildWeatherDataForTrip(trip, source, includeCatches = true) {
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

async function enrichTripWithWeather(trip) {
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

function weatherWindText(weatherData) {
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

function windDirectionLabel(degrees) {
  const value = Number(degrees);
  if (!Number.isFinite(value)) return "";
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round((((value % 360) + 360) % 360) / 45) % directions.length;
  return directions[index];
}

function hourlyWindText(hourly) {
  const wind = hourly?.windSpeedMph;
  if (wind === null || wind === undefined) return "";
  const direction = windDirectionLabel(hourly.windDirectionDegrees);
  const gust = hourly.windGustMph === null || hourly.windGustMph === undefined ? "" : `, gust ${formatUnitValue(hourly.windGustMph, "windSpeed", "mph")}`;
  return `${direction ? `${direction} ` : ""}${formatUnitValue(wind, "windSpeed", "mph")}${gust}`;
}

function sunshineDurationText(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return "Not logged";
  const hours = value / 3600;
  return `${Math.round(hours * 10) / 10} hr`;
}

function celsiusText(value) {
  return formatUnitValue(value, "airTemperature", "C");
}

function catchWeatherSummary(weatherData) {
  const hourly = weatherData?.hourly;
  if (!hourly) return "";
  return [
    hourly.temperatureC === null || hourly.temperatureC === undefined ? "" : celsiusText(Math.round(hourly.temperatureC)),
    hourly.apparentTemperatureC === null || hourly.apparentTemperatureC === undefined ? "" : `feels ${celsiusText(Math.round(hourly.apparentTemperatureC))}`,
    hourlyWindText(hourly),
    hourly.cloudCoverPercent === null || hourly.cloudCoverPercent === undefined ? "" : `${Math.round(hourly.cloudCoverPercent)}% cloud`
  ].filter(Boolean).join(" / ");
}

function signedWeatherDelta(value, suffix) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || Math.abs(numberValue) < 0.5) return "";
  return `${numberValue > 0 ? "+" : ""}${Math.round(numberValue)}${suffix}`;
}

function catchWeatherComparison(catchWeather, tripWeather) {
  const hourly = catchWeather?.hourly;
  const tripWindow = tripWeather?.tripWindow;
  if (!hourly || !tripWindow) return "";
  return [
    signedWeatherDelta(convertUnitValue(Number(hourly.windSpeedMph) - Number(tripWindow.windSpeedMph), "mph", unitPreference("windSpeed")), ` ${unitSymbol("windSpeed")} wind`),
    signedWeatherDelta(convertUnitValue(Number(hourly.temperatureC) - Number(tripWindow.temperatureC), "C", unitPreference("airTemperature")), ` ${unitSymbol("airTemperature")}`),
    signedWeatherDelta(Number(hourly.cloudCoverPercent) - Number(tripWindow.cloudCoverPercent), "% cloud")
  ].filter(Boolean).join(" / ");
}

function weatherTrendText(weatherData) {
  const trend = weatherData?.trend;
  if (!trend) return "";
  return [
    trend.pressureTrend,
    trend.temperatureTrend,
    trend.windTrend,
    trend.cloudTrend,
    trend.windDirectionShiftDegrees ? `${trend.windDirectionShiftDegrees} deg wind shift` : ""
  ].filter(Boolean).join(" / ");
}

function moonWindowForTime(time, sunMoon) {
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

function setWeatherStatus(message) {
  if (els.weatherFetchStatus) els.weatherFetchStatus.textContent = message;
}

function syncMarineWaveHeightToForm(weatherData) {
  updateMarineWaveHeightPlaceholder(weatherData);
  updateAutoWaveChopDisplay(weatherData);
}

async function refreshTripWeatherPreview(force = false) {
  const trip = tripDraftForWeather();
  const source = tripWeatherCoordinates(trip);
  const key = JSON.stringify({
    date: trip.date,
    startTime: trip.startTime,
    endTime: trip.endTime,
    locationId: trip.locationId,
    launchId: trip.launchId,
    waveHeight: trip.waveHeight,
    chopRanges: state.settings?.chopRanges
  });
  if (!force && key === activeTripWeatherKey) return;
  activeTripWeatherKey = key;
  if (!trip.date || !source) {
    activeTripWeatherData = null;
    setWeatherStatus(source ? "Choose a trip date" : "Add a location or launch pin to fetch weather");
    return;
  }
  setWeatherStatus("Fetching weather...");
  try {
    const result = await buildWeatherDataForTrip(trip, source, false);
    activeTripWeatherData = result.tripWeather;
    syncMarineWaveHeightToForm(activeTripWeatherData);
    setWeatherStatus(`Weather ready from ${source.name}`);
  } catch (error) {
    activeTripWeatherData = null;
    setWeatherStatus(error.message || "Weather fetch failed");
  }
}

function scheduleTripWeatherPreview(force = false) {
  if (!els.tripDialog?.open) return;
  clearTimeout(weatherPreviewTimer);
  weatherPreviewTimer = setTimeout(() => refreshTripWeatherPreview(force), 350);
}

function weatherValue(value, suffix = "") {
  return value === null || value === undefined || value === "" ? "Not logged" : `${value}${suffix}`;
}

function weatherValueWithTrend(value, ...trendParts) {
  const trends = trendParts.filter(Boolean);
  return [value || "Not logged", ...trends].join(" / ");
}

function renderWeatherDetails(weatherData, trip = {}) {
  if (!weatherData || weatherData.status === "missing-coordinates") {
    return `<span><strong>API Weather</strong>Add a mapped location pin to fetch weather.</span>`;
  }
  if (weatherData.status === "error") {
    return `<span><strong>API Weather</strong>${escapeHtml(weatherData.message || "Weather fetch failed.")}</span>`;
  }
  const window = weatherData.tripWindow || {};
  const daily = weatherData.daily || {};
  const trend = weatherData.trend || {};
  const waveHeightChopText = formatWaveHeightChopLine(trip, weatherData);
  const visibilityText = Number.isFinite(Number(window.visibilityMeters)) ? `${formatUnitValue(window.visibilityMeters, "distance", "m", { decimals: 1 })} / ${visibilityLabel(window.visibilityMeters)}` : "Not logged";
  const barometricTrend = window.pressureTrendRateHpa3h === null || window.pressureTrendRateHpa3h === undefined
    ? "Not logged"
    : `${window.pressureTrendRateHpa3h > 0 ? "+" : ""}${formatUnitValue(Math.abs(window.pressureTrendRateHpa3h), "pressure", "hPa", { decimals: 1 })} / 3 hr / ${window.pressureTrendRateLabel || barometricTrendLabel(window.pressureTrendRateHpa3h)}`;
  const windTrend = [
    trend.windTrend,
    trend.windDirectionShiftDegrees ? `${trend.windDirectionShiftDegrees} deg wind shift` : ""
  ].filter(Boolean).join(" / ");
  return `
    <span><strong>Front Tag</strong>${escapeHtml(weatherData.frontTag || "Not logged")}</span>
    <span><strong>Air Temp</strong>${escapeHtml(weatherValueWithTrend(formatUnitValue(window.temperatureC, "airTemperature", "C"), trend.temperatureTrend))}</span>
    <span><strong>Feels Like</strong>${escapeHtml(formatUnitValue(window.apparentTemperatureC, "airTemperature", "C"))}</span>
    <span><strong>Wind</strong>${escapeHtml(weatherValueWithTrend(weatherWindText(weatherData) || formatUnitValue(daily.windSpeedMaxMph, "windSpeed", "mph"), windTrend))}</span>
    <span><strong>Pressure</strong>${escapeHtml(weatherValueWithTrend(formatUnitValue(window.pressureHpa, "pressure", "hPa", { decimals: 1 }), trend.pressureTrend))}</span>
    <span><strong>Barometric Trend</strong>${escapeHtml(barometricTrend)}</span>
    <span><strong>Visibility</strong>${escapeHtml(visibilityText)}</span>
    <span><strong>Wave Height / Chop</strong>${escapeHtml(waveHeightChopText)}</span>
    <span><strong>Humidity</strong>${escapeHtml(weatherValue(window.humidityPercent, "%"))}</span>
    <span><strong>Cloud Cover</strong>${escapeHtml(weatherValueWithTrend(weatherValue(window.cloudCoverPercent, "%"), trend.cloudTrend))}</span>
    <span><strong>Sunshine</strong>${escapeHtml(sunshineDurationText(daily.sunshineDurationSeconds))}</span>
    <span><strong>Sunrise / Sunset</strong>${escapeHtml([timeText(weatherData.sunMoon?.sunrise) || daily.sunrise?.slice(11, 16), timeText(weatherData.sunMoon?.sunset) || daily.sunset?.slice(11, 16)].filter(Boolean).join(" / ") || "Not logged")}</span>
    <span><strong>Moon</strong>${escapeHtml(weatherData.sunMoon ? `${weatherData.sunMoon.phase} (${weatherData.sunMoon.illuminationPercent}%)` : "Not logged")}</span>
    <span><strong>Moonrise / Moonset</strong>${escapeHtml(weatherData.sunMoon ? [timeText(weatherData.sunMoon.moonrise), timeText(weatherData.sunMoon.moonset)].filter(Boolean).join(" / ") || "Not logged" : "Not logged")}</span>
    <span><strong>Precipitation</strong>${escapeHtml(formatUnitValue(window.precipitationIn ?? daily.precipitationIn, "precipitation", "in", { decimals: 1 }))}</span>
    <span><strong>Trip High / Low</strong>${escapeHtml(`${formatUnitValue(window.temperatureMaxC, "airTemperature", "C")} / ${formatUnitValue(window.temperatureMinC, "airTemperature", "C")}`)}</span>
  `;
}
