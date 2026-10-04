// Map pop-up cards: one simple layout for every reading the map shows.
import { html, joinHtml } from "./html.js";

// "64.1 °F" -> ["64.1", "°F"], so the number can be large and the unit small.
export function valueParts(text) {
  const match = /^(-?[\d.,]+)\s*(.*)$/.exec(String(text ?? ""));
  return match ? [match[1], match[2]] : [String(text ?? ""), ""];
}

export function cardRows(rows) {
  const shown = rows.filter((row) => row && row[1] !== "" && row[1] !== null && row[1] !== undefined);
  if (!shown.length) return "";
  return html`<dl class="gl-rows">${joinHtml(shown.map(([label, value]) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`), "")}</dl>`;
}

// The main reading: a small label, a large value, an optional note and detail rows.
export function readingHtml({ label, value, icon = "", note = "", rows = [], action = "" }) {
  const [number, unit] = valueParts(value);
  return html`<section class="gl-reading">
    <span class="gl-reading-label">${label}</span>
    <div class="gl-reading-value">${icon}<strong>${number}</strong>${unit ? html`<span>${unit}</span>` : ""}</div>
    ${note ? html`<span class="gl-reading-note">${note}</span>` : ""}
    ${cardRows(rows)}
    ${action}
  </section>`;
}

const CHEVRON = html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>`;

export function profileActionHtml(latitude, longitude) {
  return html`<button class="gl-card-action" type="button" data-gl-profile-lat="${latitude}" data-gl-profile-lon="${longitude}"><span>Water column</span>${CHEVRON}</button>`;
}

export function currentProfileActionHtml(latitude, longitude) {
  return html`<button class="gl-card-action" type="button" data-gl-current-profile-lat="${latitude}" data-gl-current-profile-lon="${longitude}"><span>Current by depth</span>${CHEVRON}</button>`;
}

// An arrow pointing the way the water (or wave) is heading.
export function directionIconHtml(degrees) {
  return html`<svg class="gl-direction" viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${Math.round(Number(degrees)) % 360}deg)"><path d="M12 3 18.5 20 12 15.8 5.5 20Z"/></svg>`;
}

// "43.6989° N, 77.8997° W"
export function positionLabel(latitude, longitude) {
  return `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? "N" : "S"}, ${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? "E" : "W"}`;
}
