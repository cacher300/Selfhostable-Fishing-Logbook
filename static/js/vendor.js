// Third-party libraries, bundled from npm instead of loaded from CDNs.
import * as Leaflet from "leaflet";
import * as esri from "esri-leaflet";
import html2canvas from "html2canvas";

if (typeof document !== "undefined") {
  const stylesheet = document.querySelector('link[rel="stylesheet"][href*="app-styles.css"]');
  if (stylesheet) Leaflet.Icon.Default.imagePath = new URL("./", stylesheet.href).href;
}

// esri-leaflet's UMD build used to attach itself to the global L.
export const L = { ...Leaflet, esri };
if (typeof window !== "undefined") window.L ??= L;
export { html2canvas };
