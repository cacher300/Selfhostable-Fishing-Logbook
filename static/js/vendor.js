// Third-party libraries, bundled from npm instead of loaded from CDNs.
import * as Leaflet from "leaflet";
import * as esri from "esri-leaflet";
import html2canvas from "html2canvas";

// esri-leaflet's UMD build used to attach itself to the global L.
export const L = { ...Leaflet, esri };
export { html2canvas };
