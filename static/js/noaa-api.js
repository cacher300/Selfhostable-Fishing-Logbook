// NOAA Great Lakes API client. Endpoint details stay separate from Leaflet UI.

// Saved past hours ("Past 30 days") come from the Great Lakes Trolling site,
// which records them; the desktop server passes these requests on.
async function historyJson(path, params, signal) {
  const response = await fetch(`/api/great-lakes/history${path}?${new URLSearchParams(params)}`, { signal });
  if (!response.ok) throw new Error(`Saved Great Lakes conditions request failed (${response.status})`);
  return response.json();
}

export function setup() {
  window.noaaGreatLakesApi = {
    async conditions({ layer, forecastHour, depth, resolution, models, dataVersion = "", time, signal }) {
      if (time) return historyJson(`/layers/${encodeURIComponent(layer)}`, { time }, signal);
      // dataVersion changes when NOAA publishes a run or "Now" advances an
      // hour, so the browser's HTTP cache never serves an older frame.
      const query = new URLSearchParams({ forecastHour, depth, resolution, models, data: dataVersion });
      const endpoint = layer === "temperature" ? `/api/great-lakes/temperature-raster?${query}` : layer === "thermocline" ? `/api/great-lakes/thermocline-raster?${query}` : layer === "waves" ? `/api/great-lakes/waves-raster?${query}` : layer === "upwelling" ? `/api/great-lakes/upwelling-raster?${query}` : `/api/great-lakes/currents?${query}`;
      const response = await fetch(endpoint, { signal });
      if (!response.ok) throw new Error("NOAA model request failed");
      return response.json();
    },
    // A layer's forecast animation: frame URLs and their shared colour scale,
    // or { ready: false, progress } while the server is still drawing them.
    async animation({ layer, depth, signal }) {
      const query = new URLSearchParams(layer === "temperature" || layer === "currents" ? { depth } : {});
      const response = await fetch(`/api/great-lakes/animation/${encodeURIComponent(layer)}?${query}`, { signal });
      if (!response.ok) throw new Error("NOAA forecast animation is unavailable");
      return response.json();
    },
    async animationFrame({ url, signal }) {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error("NOAA forecast animation frame request failed");
      return response.json();
    },
    async temperatureValue(options) {
      if (options.time) return historyJson("/point/temperature", { time: options.time, depth: options.depth, latitude: options.latitude, longitude: options.longitude });
      const response = await fetch(`/api/great-lakes/temperature-value?${new URLSearchParams(options)}`);
      if (!response.ok) throw new Error("NOAA temperature lookup failed");
      return response.json();
    },
    async profile(options) {
      if (options.time) return historyJson("/point/temperature-profile", { time: options.time, latitude: options.latitude, longitude: options.longitude });
      const response = await fetch(`/api/great-lakes/profile?${new URLSearchParams(options)}`);
      if (!response.ok) throw new Error("NOAA profile lookup failed");
      return response.json();
    },
    async currentProfile(options) {
      if (options.time) return historyJson("/point/current-profile", { time: options.time, latitude: options.latitude, longitude: options.longitude });
      const response = await fetch(`/api/great-lakes/current-profile?${new URLSearchParams(options)}`);
      if (!response.ok) throw new Error("NOAA current profile lookup failed");
      return response.json();
    },
    async upwellingValue(options) {
      if (options.time) return historyJson("/point/upwelling", { time: options.time, latitude: options.latitude, longitude: options.longitude });
      const query = { forecastHour: options.forecastHour, latitude: options.latitude, longitude: options.longitude, models: options.models || "" };
      const response = await fetch(`/api/great-lakes/upwelling-value?${new URLSearchParams(query)}`);
      if (!response.ok) throw new Error("NOAA upwelling lookup failed");
      return response.json();
    },
    async waveValue(options) {
      if (options.time) return historyJson("/point/waves", { time: options.time, latitude: options.latitude, longitude: options.longitude });
      const response = await fetch(`/api/great-lakes/wave-value?${new URLSearchParams(options)}`);
      if (!response.ok) throw new Error("NOAA wave lookup failed");
      return response.json();
    },
    async status({ models, signal } = {}) {
      const response = await fetch(`/api/great-lakes/status?${new URLSearchParams({ models: models || "" })}`, { signal });
      if (!response.ok) throw new Error("NOAA data status is unavailable");
      return response.json();
    },
    async observations({ time, signal } = {}) {
      if (time) return historyJson("/stations", { time }, signal);
      const response = await fetch("/api/great-lakes/observations", { signal });
      if (!response.ok) throw new Error("NOAA buoy observations are unavailable");
      return response.json();
    },
    // Which past hours are saved, and one station's saved readings.
    history({ signal } = {}) {
      return historyJson("", {}, signal);
    },
    stationHistory({ id, signal }) {
      return historyJson(`/stations/${encodeURIComponent(id)}`, {}, signal);
    },
    async modelPoints({ kind, south, west, north, east, models, signal }) {
      const query = new URLSearchParams({ kind, south, west, north, east, models });
      const response = await fetch(`/api/great-lakes/model-points?${query}`, { signal });
      if (!response.ok) throw new Error("NOAA model points are unavailable");
      return response.json();
    }
  };
}
