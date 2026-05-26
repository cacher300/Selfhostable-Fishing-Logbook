const weatherRequestCache = new Map();
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
    catches: []
  };
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
      "relative_humidity_2m",
      "dew_point_2m",
      "precipitation",
      "rain",
      "snowfall",
      "weather_code",
      "surface_pressure",
      "cloud_cover",
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
  const request = fetch(`/api/weather/archive?${params}`)
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
    humidityPercent: hourly.relative_humidity_2m?.[index] ?? null,
    dewPointC: hourly.dew_point_2m?.[index] ?? null,
    precipitationIn: hourly.precipitation?.[index] ?? null,
    rainIn: hourly.rain?.[index] ?? null,
    snowfallIn: hourly.snowfall?.[index] ?? null,
    weatherCode: hourly.weather_code?.[index] ?? null,
    pressureHpa: hourly.surface_pressure?.[index] ?? null,
    cloudCoverPercent: hourly.cloud_cover?.[index] ?? null,
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

function averageNumber(records, key) {
  const values = records.map((record) => Number(record[key])).filter(Number.isFinite);
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function sumNumber(records, key) {
  const values = records.map((record) => Number(record[key])).filter(Number.isFinite);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

function minNumber(records, key) {
  const values = records.map((record) => Number(record[key])).filter(Number.isFinite);
  if (!values.length) return null;
  return Math.round(Math.min(...values) * 10) / 10;
}

function maxNumber(records, key) {
  const values = records.map((record) => Number(record[key])).filter(Number.isFinite);
  if (!values.length) return null;
  return Math.round(Math.max(...values) * 10) / 10;
}

function tripWindowSummary(records) {
  return {
    temperatureC: averageNumber(records, "temperatureC"),
    temperatureMaxC: maxNumber(records, "temperatureC"),
    temperatureMinC: minNumber(records, "temperatureC"),
    humidityPercent: averageNumber(records, "humidityPercent"),
    pressureHpa: averageNumber(records, "pressureHpa"),
    cloudCoverPercent: averageNumber(records, "cloudCoverPercent"),
    precipitationIn: sumNumber(records, "precipitationIn"),
    windSpeedMph: averageNumber(records, "windSpeedMph"),
    windGustMph: averageNumber(records, "windGustMph"),
    windDirectionDegrees: averageNumber(records, "windDirectionDegrees")
  };
}

function numericDelta(records, key) {
  const values = records.map((record) => Number(record[key])).filter(Number.isFinite);
  if (values.length < 2) return null;
  return Math.round((values.at(-1) - values[0]) * 10) / 10;
}

function windDirectionShift(records) {
  const values = records.map((record) => Number(record.windDirectionDegrees)).filter(Number.isFinite);
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
  const weatherData = {
    source,
    fetchedAt: new Date().toISOString(),
    timezone: bundle.timezone || "",
    units: weatherUnits(bundle),
    daily: dailyRecord(bundle),
    hourly: windowRecords,
    tripWindow: tripWindowSummary(windowRecords),
    trend: tripWeatherTrend(windowRecords),
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
    const dailyGust = daily.windGustMaxMph === null || daily.windGustMaxMph === undefined ? "" : `, gust ${Math.round(daily.windGustMaxMph)} mph`;
    return `${dailyDirection ? `${dailyDirection} ` : ""}${Math.round(daily.windSpeedMaxMph)} mph${dailyGust}`;
  }
  const directionText = direction === null || direction === undefined ? "" : `${windDirectionLabel(direction)} `;
  const gustText = gust === null || gust === undefined ? "" : `, gust ${Math.round(gust)} mph`;
  return `${directionText}${Math.round(wind)} mph${gustText}`;
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
  const gust = hourly.windGustMph === null || hourly.windGustMph === undefined ? "" : `, gust ${Math.round(hourly.windGustMph)} mph`;
  return `${direction ? `${direction} ` : ""}${Math.round(wind)} mph${gust}`;
}

function sunshineDurationText(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return "Not logged";
  const hours = value / 3600;
  return `${Math.round(hours * 10) / 10} hr`;
}

function catchWeatherSummary(weatherData) {
  const hourly = weatherData?.hourly;
  if (!hourly) return "";
  return [
    hourly.temperatureC === null || hourly.temperatureC === undefined ? "" : `${Math.round(hourly.temperatureC)} C`,
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
    signedWeatherDelta(Number(hourly.windSpeedMph) - Number(tripWindow.windSpeedMph), " mph wind"),
    signedWeatherDelta(Number(hourly.temperatureC) - Number(tripWindow.temperatureC), " C"),
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

async function refreshTripWeatherPreview(force = false) {
  const trip = tripDraftForWeather();
  const source = tripWeatherCoordinates(trip);
  const key = JSON.stringify({ date: trip.date, startTime: trip.startTime, endTime: trip.endTime, locationId: trip.locationId, launchId: trip.launchId });
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

function renderWeatherDetails(weatherData) {
  if (!weatherData || weatherData.status === "missing-coordinates") {
    return `<span><strong>API Weather</strong>Add a mapped location pin to fetch weather.</span>`;
  }
  if (weatherData.status === "error") {
    return `<span><strong>API Weather</strong>${escapeHtml(weatherData.message || "Weather fetch failed.")}</span>`;
  }
  const window = weatherData.tripWindow || {};
  const daily = weatherData.daily || {};
  const trend = weatherData.trend || {};
  const windTrend = [
    trend.windTrend,
    trend.windDirectionShiftDegrees ? `${trend.windDirectionShiftDegrees} deg wind shift` : ""
  ].filter(Boolean).join(" / ");
  return `
    <span><strong>Front Tag</strong>${escapeHtml(weatherData.frontTag || "Not logged")}</span>
    <span><strong>Air Temp</strong>${escapeHtml(weatherValueWithTrend(weatherValue(window.temperatureC, " C"), trend.temperatureTrend))}</span>
    <span><strong>Wind</strong>${escapeHtml(weatherValueWithTrend(weatherWindText(weatherData) || weatherValue(daily.windSpeedMaxMph, " mph"), windTrend))}</span>
    <span><strong>Pressure</strong>${escapeHtml(weatherValueWithTrend(weatherValue(window.pressureHpa, " hPa"), trend.pressureTrend))}</span>
    <span><strong>Humidity</strong>${escapeHtml(weatherValue(window.humidityPercent, "%"))}</span>
    <span><strong>Cloud Cover</strong>${escapeHtml(weatherValueWithTrend(weatherValue(window.cloudCoverPercent, "%"), trend.cloudTrend))}</span>
    <span><strong>Sunshine</strong>${escapeHtml(sunshineDurationText(daily.sunshineDurationSeconds))}</span>
    <span><strong>Sunrise / Sunset</strong>${escapeHtml([timeText(weatherData.sunMoon?.sunrise) || daily.sunrise?.slice(11, 16), timeText(weatherData.sunMoon?.sunset) || daily.sunset?.slice(11, 16)].filter(Boolean).join(" / ") || "Not logged")}</span>
    <span><strong>Moon</strong>${escapeHtml(weatherData.sunMoon ? `${weatherData.sunMoon.phase} (${weatherData.sunMoon.illuminationPercent}%)` : "Not logged")}</span>
    <span><strong>Moonrise / Moonset</strong>${escapeHtml(weatherData.sunMoon ? [timeText(weatherData.sunMoon.moonrise), timeText(weatherData.sunMoon.moonset)].filter(Boolean).join(" / ") || "Not logged" : "Not logged")}</span>
    <span><strong>Precipitation</strong>${escapeHtml(weatherValue(window.precipitationIn ?? daily.precipitationIn, " in"))}</span>
    <span><strong>Trip High / Low</strong>${escapeHtml(`${weatherValue(window.temperatureMaxC, " C")} / ${weatherValue(window.temperatureMinC, " C")}`)}</span>
  `;
}
