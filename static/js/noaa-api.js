// Great Lakes Trolling public API client. Keep endpoint paths aligned with the
// mobile client's src/services/great-lakes/api.ts.

const DEFAULT_API_BASE = "https://greatlakestrolling.com";

function apiBase() {
  const configured = document.documentElement.dataset.greatLakesApi?.trim();
  return (configured || DEFAULT_API_BASE).replace(/\/+$/, "");
}

function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const base = apiBase();
  return path.startsWith("/api/") ? `${base}${path}` : `${base}/api/v1${path.startsWith("/") ? path : `/${path}`}`;
}

function queryString(values) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values || {})) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  return query.toString();
}

function withQuery(path, values) {
  const query = queryString(values);
  return query ? `${path}?${query}` : path;
}

async function get(path, signal) {
  const response = await fetch(apiUrl(path), {
    signal,
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Great Lakes API request failed (${response.status})`);
  return response.json();
}

function absoluteApiUrl(value) {
  if (!value || /^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  return apiUrl(value);
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  return {
    ...payload,
    rasters: Array.isArray(payload.rasters) ? payload.rasters.map((raster) => ({
      ...raster,
      imageUrl: absoluteApiUrl(raster.imageUrl),
      valueUrl: absoluteApiUrl(raster.valueUrl),
      mixedUrl: absoluteApiUrl(raster.mixedUrl)
    })) : payload.rasters
  };
}

function forecastPointParams(options = {}) {
  return {
    latitude: options.latitude,
    longitude: options.longitude,
    forecastHour: options.forecastHour,
    depth: options.depth ?? 0
  };
}

function profileParams(options = {}) {
  return {
    latitude: options.latitude,
    longitude: options.longitude,
    forecastHour: options.forecastHour
  };
}

async function pointReading(options = {}, time = options.time) {
  const params = forecastPointParams(options);
  if (time) {
    delete params.forecastHour;
    params.time = time;
  }
  return get(withQuery(time ? "/history/point" : "/point", params), options.signal);
}

export function setup() {
  window.noaaGreatLakesApi = {
    async conditions({ layer, forecastHour, depth, targetC, selection, time, signal }) {
      const path = time
        ? withQuery(`/history/layers/${encodeURIComponent(layer)}`, { time })
        : withQuery(`/layers/${encodeURIComponent(layer)}`, {
          forecastHour,
          ...(["temperature", "currents"].includes(layer) ? { depth: depth ?? 0 } : {}),
          ...(layer === "target-temperature" ? { targetC, selection } : {})
        });
      return normalizePayload(await get(path, signal));
    },

    async animation({ layer, depth, signal }) {
      const path = withQuery(`/animation/${encodeURIComponent(layer)}`, ["temperature", "currents"].includes(layer) ? { depth: depth ?? 0 } : {});
      const index = await get(path, signal);
      return {
        ...index,
        frames: Array.isArray(index.frames) ? index.frames.map((frame) => ({ ...frame, url: absoluteApiUrl(frame.url) })) : index.frames
      };
    },

    async animationFrame({ url, signal }) {
      return normalizePayload(await get(url, signal));
    },

    async temperatureValue(options = {}) {
      const reading = await pointReading(options);
      return reading.temperature || { available: false };
    },

    async profile(options = {}) {
      if (options.time) {
        const reading = await pointReading(options);
        return reading.profile || { available: false, values: [] };
      }
      return get(withQuery("/point/temperature-profile", profileParams(options)), options.signal);
    },

    async fishingConditions(options = {}) {
      return get(withQuery("/history/point/fishing-conditions", {
        time: options.time,
        latitude: options.latitude,
        longitude: options.longitude
      }), options.signal);
    },

    async currentProfile(options = {}) {
      const reading = await pointReading(options);
      return reading.currentProfile || { available: false, values: [] };
    },

    async upwellingValue(options = {}) {
      const reading = await pointReading(options);
      return reading.upwelling || { available: false };
    },

    async waveValue(options = {}) {
      const reading = await pointReading(options);
      return reading.waves || { available: false };
    },

    async targetTemperatureValue(options = {}) {
      return get(withQuery("/point/target-temperature", {
        latitude: options.latitude,
        longitude: options.longitude,
        forecastHour: options.forecastHour,
        targetC: options.targetC
      }), options.signal);
    },

    async windValue(options = {}) {
      return get(withQuery("/point/wind", {
        latitude: options.latitude,
        longitude: options.longitude,
        forecastHour: options.forecastHour
      }), options.signal);
    },

    async status({ signal } = {}) {
      const manifest = await get("/manifest", signal);
      const waves = (manifest.layers || []).filter((layer) => layer.layer === "waves");
      const wavesVersion = waves.map((layer) => layer.hash || layer.validTime || layer.url).join("|") || manifest.version || "";
      const runTime = waves.find((layer) => layer.validTime)?.validTime || manifest.generatedAt;
      return {
        version: manifest.version || manifest.generatedAt || "",
        wavesVersion,
        models: { api: { runTime: manifest.generatedAt } },
        waves: { runTime }
      };
    },

    async observations({ time, signal } = {}) {
      return time
        ? get(withQuery("/history/stations", { time }), signal)
        : get("/stations", signal);
    },

    history({ signal } = {}) {
      return get("/history", signal);
    },

    stationHistory({ id, signal }) {
      return get(`/history/stations/${encodeURIComponent(id)}`, signal);
    },

    modelPoints({ kind, south, west, north, east, signal }) {
      return get(withQuery("/model-points", { kind, south, west, north, east }), signal);
    }
  };
}
