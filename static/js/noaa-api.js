// NOAA Great Lakes API client. Endpoint details stay separate from Leaflet UI.
window.noaaGreatLakesApi = {
  async conditions({ layer, forecastHour, depth, resolution, models, signal }) {
    const query = new URLSearchParams({ forecastHour, depth, resolution, models });
    const endpoint = layer === "temperature" ? `/api/great-lakes/temperature-raster?${query}` : layer === "thermocline" ? `/api/great-lakes/thermocline-raster?${query}` : `/api/great-lakes/currents?${query}`;
    const response = await fetch(endpoint, { signal });
    if (!response.ok) throw new Error("NOAA model request failed");
    return response.json();
  },
  async temperatureValue(options) {
    const response = await fetch(`/api/great-lakes/temperature-value?${new URLSearchParams(options)}`);
    if (!response.ok) throw new Error("NOAA temperature lookup failed");
    return response.json();
  },
  async profile(options) {
    const response = await fetch(`/api/great-lakes/profile?${new URLSearchParams(options)}`);
    if (!response.ok) throw new Error("NOAA profile lookup failed");
    return response.json();
  }
};
