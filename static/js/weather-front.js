import { constants } from "./generated/logbook-schema-rules.js";
export { classifyWeatherFront, automaticWeatherFrontPatch, resetAutomaticWeatherFront, weatherFrontDateRange } from "./generated/weather-front-rules.js";

export const weatherFrontOptions = constants.weatherFronts;

export function weatherFrontLabel(value) {
  return weatherFrontOptions.find((option) => option.value === value)?.label || "Unclassified";
}

export function weatherFrontValue(trip, assessment = trip?.weatherData?.frontAssessment) {
  const value = assessment && Object.hasOwn(assessment, "value")
    ? assessment.value
    : trip?.weatherFrontSource === "automatic" ? trip.weatherFront : "";
  return weatherFrontOptions.some((option) => option.value === value) ? value : "";
}

export function renderWeatherFrontChoice(trip, assessment = trip.weatherData?.frontAssessment) {
  const output = document.querySelector("#weatherFront");
  if (output) output.textContent = weatherFrontLabel(weatherFrontValue(trip, assessment));
}
