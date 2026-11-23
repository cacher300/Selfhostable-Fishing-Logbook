import { constants } from "./generated/logbook-schema-rules.js";
export { classifyWeatherFront, automaticWeatherFrontPatch, resetAutomaticWeatherFront, weatherFrontDateRange } from "./generated/weather-front-rules.js";

export const weatherFrontOptions = constants.weatherFronts;

export function weatherFrontLabel(value) {
  return weatherFrontOptions.find((option) => option.value === value)?.label || "Unclassified";
}

export function weatherFrontSelection(trip) {
  return trip.weatherFrontSource === "manual" || (trip.weatherFront && trip.weatherFrontSource !== "automatic") ? trip.weatherFront || "" : "automatic";
}

export function renderWeatherFrontChoice(trip, assessment = trip.weatherData?.frontAssessment) {
  const select = document.querySelector("#weatherFront");
  if (select) select.value = weatherFrontSelection(trip);
  const hint = document.querySelector("#weatherFrontHint");
  if (hint) hint.textContent = weatherFrontSelection(trip) === "automatic"
    ? (trip.weatherFront ? `Estimated: ${weatherFrontLabel(trip.weatherFront)}. You can choose a manual classification.` : assessment?.reason || "Automatic estimate when surrounding weather is available.")
    : "Manual classification. Weather refresh will keep your choice.";
}
