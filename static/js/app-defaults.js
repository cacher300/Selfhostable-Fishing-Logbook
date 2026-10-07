// Defaults come from the shared schema (schema/default-logbook.json and
// schema/constants.json) so the browser, server, and mobile app agree.
import { constants, defaultLogbook } from "./generated/logbook-schema-rules.js";
import { state } from "./app-state.js";

export const defaultTimeValue = "12:00";
export const defaultChopRanges = defaultLogbook.settings.chopRanges;
export const defaultSpeciesMapColors = constants.defaultSpeciesMapColors;
export const fallbackSpeciesMapColors = constants.fallbackSpeciesMapColors;
export const defaultUnits = constants.defaultUnits;

/** A fresh copy of the canonical empty v2 logbook. */
export const defaults = defaultLogbook;

export function isValidSpeciesMapColor(value) {
  return /^#[\da-f]{6}$/i.test(String(value || ""));
}

export function fallbackSpeciesColor(species = "Fish") {
  const value = String(species || "Fish");
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return fallbackSpeciesMapColors[hash % fallbackSpeciesMapColors.length];
}

export function speciesColor(species = "Fish") {
  const value = String(species || "Fish").trim() || "Fish";
  const normalized = value.toLowerCase();
  const configuredColors = state?.settings?.speciesMapColors
    && typeof state.settings.speciesMapColors === "object"
    && !Array.isArray(state.settings.speciesMapColors)
    ? state.settings.speciesMapColors
    : {};
  const configured = Object.entries(configuredColors).find(([name, color]) => (
    String(name).trim().toLowerCase() === normalized && isValidSpeciesMapColor(color)
  ));
  if (configured) return configured[1];
  const defaultColor = Object.entries(defaultSpeciesMapColors).find(([name]) => name.toLowerCase() === normalized)?.[1];
  return defaultColor || fallbackSpeciesColor(value);
}

export const unitOptions = {
  depth: [
    { value: "m", label: "Meters (m)" },
    { value: "ft", label: "Feet (ft)" }
  ],
  distance: [
    { value: "km", label: "Kilometers (km)" },
    { value: "mi", label: "Miles (mi)" }
  ],
  speed: [
    { value: "kph", label: "Kilometers/hour (kph)" },
    { value: "mph", label: "Miles/hour (mph)" },
    { value: "kn", label: "Knots (kn)" }
  ],
  windSpeed: [
    { value: "kph", label: "Kilometers/hour (kph)" },
    { value: "mph", label: "Miles/hour (mph)" },
    { value: "kn", label: "Knots (kn)" }
  ],
  pressure: [
    { value: "hPa", label: "Hectopascals (hPa)" },
    { value: "kPa", label: "Kilopascals (kPa)" },
    { value: "inHg", label: "Inches mercury (inHg)" },
    { value: "mmHg", label: "Millimeters mercury (mmHg)" }
  ],
  airTemperature: [
    { value: "C", label: "Celsius (C)" },
    { value: "F", label: "Fahrenheit (F)" }
  ],
  waterTemperature: [
    { value: "F", label: "Fahrenheit (F)" },
    { value: "C", label: "Celsius (C)" }
  ],
  precipitation: [
    { value: "mm", label: "Millimeters (mm)" },
    { value: "in", label: "Inches (in)" }
  ],
  waveHeight: [
    { value: "m", label: "Meters (m)" },
    { value: "ft", label: "Feet (ft)" }
  ],
  fishLength: [
    { value: "in", label: "Inches (in)" },
    { value: "cm", label: "Centimeters (cm)" }
  ],
  fishWeight: [
    { value: "lb", label: "Pounds (lb)" },
    { value: "kg", label: "Kilograms (kg)" }
  ]
};

export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const fallbackId = "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) => {
    const randomValue = globalThis.crypto?.getRandomValues
      ? globalThis.crypto.getRandomValues(new Uint8Array(1))[0]
      : Math.floor(Math.random() * 256);
    return (Number(char) ^ (randomValue & (15 >> (Number(char) / 4)))).toString(16);
  });

  return fallbackId;
}
