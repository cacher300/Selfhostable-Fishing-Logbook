import { html, joinHtml } from "./html.js";
import { activityDayDescription, buildActivityCalendar, monthDayDescription } from "./stats-calendar.js";
import { catchQuantity } from "./stats-workbench-model.js";

const defaultFishForTrip = trip => (trip.catches || []).reduce((sum,r) => sum + catchQuantity(r), 0);

function build(trips = [], options = {}) {
  return buildActivityCalendar(trips,options.fishForTrip || defaultFishForTrip,options);
}

function weekdayGrid(m) {
  if (!m.weeks.length) return "";
  const columns = m.weeks.length, minCell = m.mode === "trips" ? 20 : 10;
  const dayCell = d => d.outside ? html`<span aria-hidden="true"></span>` : html`
    <span class="activity-heatmap-day activity-heatmap-level-${d.level}${d.isToday ? " is-today" : ""}${d.isFuture ? " is-future" : ""}" role="img"
      ${d.isToday ? html`aria-current="date"` : ""} ${d.trips ? html`tabindex="0"` : ""} aria-label="${activityDayDescription(d)}" title="${activityDayDescription(d)}">${m.mode === "trips" && d.trips ? d.trips : ""}</span>`;
  return html`<div class="activity-heatmap-scroll"><div class="activity-heatmap" style="--weeks:${columns};min-width:${35+columns*(minCell+3)-3}px;max-width:${35+columns*29}px">
    <div class="activity-heatmap-months" aria-hidden="true">${m.months.map(month => html`<span class="activity-heatmap-month" style="grid-column:${month.column}">${month.label}</span>`)}</div>
    <div class="activity-heatmap-content"><div class="activity-heatmap-weekdays" aria-hidden="true">${["","Mon","","Wed","","Fri",""].map(v => html`<span class="activity-heatmap-weekday">${v}</span>`)}</div>
      <div class="activity-heatmap-calendar" role="group" aria-label="${m.description}">${joinHtml(m.weeks.flat().map(dayCell))}</div>
    </div></div></div>`;
}

function monthDayGrid(m) {
  const cell = d => {
    const label = monthDayDescription(d), color = `activity-heatmap-day activity-heatmap-level-${d.level}`;
    return html`<td>${d.trips ? html`<button type="button" class="${color}" data-work-day="${d.key}" aria-label="${label}" title="${label}">${d.value}</button>`
      : html`<span class="${color}" role="img" aria-label="${label}" title="${label}"></span>`}</td>`;
  };
  return html`${m.hint ? html`<p class="month-day-hint">${m.hint}</p>` : ""}<div class="activity-heatmap-scroll">
    <table class="month-day-grid" aria-label="${m.description}"><thead><tr><th scope="col">Month</th>${Array.from({length:m.dayCount},(_,i) => html`<th scope="col">${i+1}</th>`)}</tr></thead>
    <tbody>${m.rows.map(r => html`<tr><th scope="row">${r.label}</th>${r.cells.map(cell)}</tr>`)}</tbody></table></div>
    <p class="month-day-detail" id="workDayDetail" aria-live="polite"></p>`;
}

function render(m) {
  return html`${m.layout === "month-day" ? monthDayGrid(m) : weekdayGrid(m)}
    <div class="activity-heatmap-footer"><span class="activity-heatmap-legend" role="group" aria-label="Fishing activity legend: ${m.legend.join(" to ")}"><span>${m.legend[0]}</span>
      ${m.legend.length > 1 ? html`${(m.maxValue <= 1 ? [0,5] : [0,1,2,3,4,5]).map(n => html`<i class="activity-heatmap-level-${n}" aria-hidden="true"></i>`)}<span>${m.legend[1]}</span>` : ""}</span></div>`;
}
export const StatsActivityHeatmap = {build,render};
