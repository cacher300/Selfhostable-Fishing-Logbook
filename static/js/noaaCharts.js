const NOAA_MARITIME_CHART_SERVICE_URL = "https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/NOAAChartDisplay/MapServer/exts/MaritimeChartService/MapServer";
const NOAA_MARITIME_VISIBLE_LAYER_IDS = [0, 1, 2, 3, 4, 5, 6, 7];

function warnNOAAChartLayerFailure(message, error) {
  console.warn(`[NOAA charts] ${message}`, error || "");
}

function normalizeNOAAExportBbox(layer) {
  const calculateBbox = layer._calculateBbox?.bind(layer);
  if (!calculateBbox) return;

  layer._calculateBbox = () => {
    const values = calculateBbox().split(",").map(Number);
    if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
      return calculateBbox();
    }

    const [x1, y1, x2, y2] = values;
    return [
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.max(x1, x2),
      Math.max(y1, y2)
    ].join(",");
  };
}

function createNOAAChartLayer() {
  if (!window.L?.esri?.dynamicMapLayer) {
    warnNOAAChartLayerFailure("Esri Leaflet is unavailable; keeping the OpenStreetMap basemap visible.");
    return null;
  }

  try {
    // NOAA's official Maritime Chart Service is an ArcGIS Dynamic Map Service,
    // not an XYZ tile endpoint, so Leaflet's {z}/{x}/{y}.png tileLayer cannot
    // request it correctly. Esri Leaflet translates the map view into dynamic
    // map image requests for this service.
    const layer = L.esri.dynamicMapLayer({
      // Official NOAA Maritime Chart Service endpoint:
      // https://nauticalcharts.noaa.gov/data/gis-data-and-services.html
      url: NOAA_MARITIME_CHART_SERVICE_URL,
      opacity: 0.9,
      position: "front",
      format: "png32",
      transparent: true,
      // The Maritime Chart Service export endpoint returns the image directly,
      // so ask Esri Leaflet for an image response instead of its JSON default.
      f: "image",
      // Change the displayed NOAA sublayers by editing this ID list.
      // See the service's ArcGIS REST layer list for available IDs.
      layers: NOAA_MARITIME_VISIBLE_LAYER_IDS
    });
    // The Maritime Chart Service expects a conventional ArcGIS bbox order
    // (xmin,ymin,xmax,ymax). Normalizing here keeps the workaround limited to
    // this NOAA overlay while still using Esri Leaflet's DynamicMapLayer.
    normalizeNOAAExportBbox(layer);

    let loggedFailure = false;
    const warnOnce = (event) => {
      if (loggedFailure) return;
      setTimeout(() => {
        if (loggedFailure || layer._currentImage?._image?.complete) return;
        loggedFailure = true;
        warnNOAAChartLayerFailure("Unable to load the NOAA Maritime Chart Service overlay; OpenStreetMap remains available.", event);
      }, 1200);
    };

    layer.on("error", warnOnce);
    layer.on("requesterror", warnOnce);

    return layer;
  } catch (error) {
    warnNOAAChartLayerFailure("Could not create the NOAA Maritime Chart Service overlay; OpenStreetMap remains available.", error);
    return null;
  }
}

window.createNOAAChartLayer = createNOAAChartLayer;
