import { activeStatsFilters, defaultStatsFilters, state, ui } from "./app-state.js";
import { els } from "./app-elements.js";
import { html, joinHtml, setHtml } from "./html.js";
import { StatsActivityHeatmap } from "./stats-heatmap.js";
import { buildStats, comparisonCount, comparisonRows, comparisonTable, formatStat, nextTableSort, overviewStats, piePlot, statsDateOptions, statsFilterOptions, trendPlot } from "./stats-workbench-model.js";
import { activityModes, dateKey, statsDateWindow } from "./stats-calendar.js";
import { syncStatsUrl } from "./app-control-events.js";
import { renderStatsLeaderboard } from "./leaderboard.js";
import { scopedTrips, recordMatchesStatsFilters } from "./stats-scope.js";
import { resolveTripLineRecord } from "./trolling-spread.js";

const byId = id => document.getElementById(id);
let a = "", b = "", matched = false, view = "", sourceKey = "", limit = 12, lastScope = "", threshold = 0;
let heatMode = "days", heatContext;
let currentReport, currentPie, currentTable, tableSort = null;
const menu = (id, entries, selected, first) => {
  const el = byId(id);
  setHtml(el, html`${first ? html`<option value="">${first}</option>` : ""}${entries.map(v => {
    const [value, label] = typeof v === "string" ? [v,v] : [v.id,v.label];
    return html`<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
  })}`);
  if (!selected && first) el.value = "";
};
const tab = (text, value, selected, key) => html`<button type="button" class="work-tab" data-work-action="${key}" data-value="${value}" aria-pressed="${String(selected)}">${text}</button>`;
const lineMetric = (m, id) => m.columns.find(c => c.id === id)?.label || "";
const title = r => r.secondary ? `${r.name} · ${r.secondary}` : r.name;
function tableBody(t) {
  return joinHtml(t.rows.map(r => html`<tr><th scope="row">${t.matrix ? r.label : html`<button type="button" class="work-link" data-work-source="${r.key}">${r.label}</button>`}</th>
    ${r.cells.map(c => html`<td>${c?.key ? html`<button type="button" class="work-link" data-work-source="${c.key}">${c.text}</button>${c.detail ? html`<small>${c.detail}</small>` : ""}` : c?.text ?? "—"}</td>`)}</tr>`));
}
function table(t) {
  return html`<div class="work-table" tabindex="0" role="region" aria-label="${t.matrix ? "Side-by-side comparison" : "Comparison data, horizontally scrollable"}"><table><thead><tr>
    ${t.columns.map(c => html`<th scope="col" ${t.sort?.key === c.id ? html`aria-sort="${t.sort.direction}"` : ""}><button type="button" class="work-sort" data-work-sort="${c.id}" title="Sort by ${c.label}">${c.label}<span aria-hidden="true"></span></button></th>`)}
    </tr></thead><tbody>${tableBody(t)}</tbody></table></div>`;
}
function bars(m, rows) {
  const max = Math.max(0,...m.rows.map(r => r.values[m.metric] ?? 0)), label = lineMetric(m,m.metric);
  return html`<div class="work-bars" aria-label="${label}">${rows.map(r => html`
    <button type="button" class="work-bar" data-work-source="${r.key}">
      <span class="work-bar-name">${title(r)}<small>${r.values.trips} ${r.values.trips === 1 ? "trip" : "trips"}${r.values.hours !== null ? ` · ${formatStat(r.values.hours)} h` : ""}</small></span>
      <span class="work-track" aria-hidden="true"><i style="width:${max ? (r.values[m.metric] || 0) / max * 100 : 0}%"></i></span><strong>${formatStat(r.values[m.metric],label)}</strong>
    </button>`)}</div>`;
}
function line(m, hideEmpty) {
  const plot = trendPlot(m.rows,m.metric,m.active.id,hideEmpty), label = lineMetric(m,m.metric);
  if (!plot) return html`<p>No measured points in this scope. Use the table for logged counts.</p>`;
  const x = p => 6 + 488*p.x, y = p => 6 + 118*p.y;
  return html`<figure class="work-line"><figcaption>${label} · ${formatStat(plot.lo,label)} to ${formatStat(plot.hi,label)}</figcaption>
    <svg viewBox="0 0 500 130" preserveAspectRatio="none" role="img" aria-label="${label} from ${plot.first} to ${plot.last}">
      ${[6,65,124].map(v => html`<line x1="6" x2="494" y1="${v}" y2="${v}" class="work-gridline"></line>`)}
      ${plot.segments.map(s => html`<polyline points="${s.map(p => `${x(p)},${y(p)}`).join(" ")}"></polyline>`)}
      ${plot.points.map(p => html`<circle cx="${x(p)}" cy="${y(p)}" r="2.5"><title>${p.name}: ${formatStat(p.value,label)}</title></circle>`)}
    </svg><div><span>${plot.first}</span><span>${plot.last}</span></div></figure>`;
}
function pie(plot) {
  if (!plot.slices.length) return html`<div class="work-pie-notice"><p>${plot.message}</p>
    ${plot.suggestion ? html`<button class="button secondary" type="button" data-work-action="pie-measure" data-value="${plot.suggestion.id}">Use ${plot.suggestion.label}</button>` : ""}</div>`;
  return html`<figure class="work-pie"><figcaption>${plot.caption}</figcaption>
    <svg viewBox="0 0 100 100" role="img" aria-label="Pie chart. ${plot.caption}">${plot.slices.map(s => html`
      <path d="${s.path}" fill="${s.color}" data-work-source="${s.key}"><title>${s.name}: ${formatStat(s.value)} (${s.share})</title></path>`)}</svg>
    <div class="work-pie-legend">${plot.slices.map(s => html`<button type="button" data-work-source="${s.key}">
      <i aria-hidden="true" style="background:${s.color}"></i><span>${s.name}</span><strong>${formatStat(s.value)} · ${s.share}</strong></button>`)}</div>
  </figure>`;
}
function clearPair(keepPie = false) { a = ""; b = ""; matched = false; sourceKey = ""; view = keepPie && view === "pie" ? "pie" : ""; limit = 12; tableSort = null; }
function setHideEmpty(value) {
  ui.activeStatsHideEmpty = value; sourceKey = ""; syncStatsUrl(); renderAdvancedStats();
}
function resetScope() {
  Object.assign(activeStatsFilters, defaultStatsFilters);
  ui.activeStatsDateRange = "all"; ui.activeStatsMethod = "All methods"; ui.activeStatsMinTrips = 0; ui.activeStatsMinHours = 0;
  ui.statsDateFrom = ""; ui.statsDateTo = ""; heatContext = undefined;
  ui.activeStatsSort = "fishPerHour"; ui.activeStatsIncludeLost = false; ui.activeStatsHideEmpty = false; threshold = 0; byId("workSize").value = "";
  ui.activeStatsCompareBy = "lureColor"; ui.activeStatsCompareSplit = ""; ui.activeStatsCompareMetric = "";
  clearPair(); syncStatsUrl();
}

function renderLeaderboardFilters() {
  const filters = statsFilterOptions(state);
  const dates = statsDateOptions(state.trips);
  const methods = ["All methods", ...filters.method];
  if (!dates.some((option) => option.id === ui.activeStatsDateRange)) ui.activeStatsDateRange = "all";
  if (!methods.includes(ui.activeStatsMethod)) ui.activeStatsMethod = "All methods";
  menu("leaderboardDateFilter", dates, ui.activeStatsDateRange);
  menu("leaderboardMethodFilter", methods, ui.activeStatsMethod);
  menu("leaderboardLocationFilter", ["All locations", ...filters.location], activeStatsFilters.location);
  menu("leaderboardSpeciesFilter", ["All species", ...filters.species], activeStatsFilters.species);
  menu("leaderboardPersonFilter", ["All people", ...filters.person], activeStatsFilters.person);

  const customDates = ui.activeStatsDateRange === "custom";
  byId("leaderboardCustomDates").hidden = !customDates;
  byId("leaderboardDateFrom").value = ui.statsDateFrom;
  byId("leaderboardDateTo").value = ui.statsDateTo;
  byId("leaderboardDateHint").textContent = statsDateWindow({
    date: ui.activeStatsDateRange,
    from: ui.statsDateFrom,
    to: ui.statsDateTo
  }).error || "Includes both dates.";
}

function bind(root) {
  if (root.dataset.workBound) return;
  root.dataset.workBound = "true";
  root.addEventListener("click", e => {
    const source = e.target.closest("[data-work-source]");
    if (source) {
      sourceKey = sourceKey === source.dataset.workSource ? "" : source.dataset.workSource;
      renderSources(currentReport);
      if (sourceKey) byId("workSources").scrollIntoView({block:"nearest",inline:"nearest"});
      return;
    }
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.workSort !== undefined) {
      tableSort = nextTableSort(currentTable.sort,btn.dataset.workSort);
      currentTable = comparisonTable(currentReport,a,b,tableSort,limit,ui.activeStatsHideEmpty);
      const el = btn.closest("table");
      el.querySelector("th[aria-sort]")?.removeAttribute("aria-sort");
      btn.closest("th").setAttribute("aria-sort",tableSort.direction);
      setHtml(el.tBodies[0],tableBody(currentTable));
      return;
    }
    if (btn.id === "workReset") resetScope();
    else if (btn.dataset.workAction === "show-empty") {
      setHideEmpty(false);
      byId("workViews").querySelector('[aria-pressed="true"]').focus({preventScroll:true});
      return;
    }
    else if (btn.dataset.workAction === "heat-mode") {
      if (btn.dataset.value !== heatMode) { heatMode = btn.dataset.value; drawHeatmap(true); }
      return;
    }
    else if (btn.dataset.workDay !== undefined) {
      byId("workDayDetail").textContent = btn.getAttribute("aria-label");
      return;
    }
    else if (btn.dataset.workAction === "topic") {
      ui.activeStatsCompareBy = btn.dataset.value; ui.activeStatsCompareSplit = ""; ui.activeStatsCompareMetric = ""; clearPair(true); syncStatsUrl();
    } else if (btn.dataset.workAction === "view") { view = btn.dataset.value; sourceKey = ""; }
    else if (btn.dataset.workAction === "more") limit += 30;
    else if (btn.dataset.workAction === "pie-measure") {
      ui.activeStatsCompareMetric = btn.dataset.value; sourceKey = ""; syncStatsUrl(); renderAdvancedStats();
      byId("workViews").querySelector('[data-value="pie"]').focus({preventScroll:true});
      return;
    }
    else return;
    renderAdvancedStats();
    const replacement = [...root.querySelectorAll("button")].find(node => node.id ? node.id === btn.id : node.dataset.workAction === btn.dataset.workAction && node.dataset.value === btn.dataset.value && node.dataset.workSource === btn.dataset.workSource);
    if (replacement && !btn.isConnected) replacement.focus({ preventScroll:true });
  });
  root.addEventListener("change", e => {
    const el = e.target;
    if (el.id === "workHideEmpty") { setHideEmpty(el.checked); return; }
    if (el.id === "workA") { a = el.value; view = ""; limit = 12; tableSort = null; }
    else if (el.id === "workB") { b = el.value; view = ""; limit = 12; tableSort = null; }
    else if (el.id === "workMatched") matched = el.checked;
    else if (el.id === "workSize") threshold = Math.max(0,Number(el.value) || 0);
    else if (el.id === "workDateFrom" || el.id === "workDateTo") {
      ui[el.id === "workDateFrom" ? "statsDateFrom" : "statsDateTo"] = el.value;
      syncStatsUrl();
    }
    else if (el.id === "workTarget") { activeStatsFilters.targetSpecies = el.value; syncStatsUrl(); }
    else return;
    if (!a || !b) matched = false;
    sourceKey = ""; renderAdvancedStats();
  });
}

function drawHeatmap(keepPosition = false) {
  const {trips,fishByTrip,bounds,month,today} = heatContext;
  const heat = StatsActivityHeatmap.build(trips,{fishForTrip:t => fishByTrip.get(t.id) || 0, bounds, month, mode:heatMode, today});
  const modes = byId("workHeatModes");
  if (!modes.childElementCount) setHtml(modes,joinHtml(activityModes.map(o => tab(o.label,o.id,false,"heat-mode"))));
  for (const btn of modes.children) btn.setAttribute("aria-pressed", String(btn.dataset.value === heatMode));
  const previous = els.statsActivityHeatmap.querySelector(".activity-heatmap-scroll");
  const fraction = keepPosition && previous && previous.scrollWidth > previous.clientWidth
    ? previous.scrollLeft / (previous.scrollWidth - previous.clientWidth) : 0;
  setHtml(els.statsActivityHeatmap,StatsActivityHeatmap.render(heat));
  if (fraction) {
    const rail = els.statsActivityHeatmap.querySelector(".activity-heatmap-scroll");
    rail.scrollLeft = fraction * (rail.scrollWidth - rail.clientWidth);
  }
  els.statsActivitySummary.textContent = heat.summary;
}

function syncHeatmap(m, scopeKey, month) {
  const today = new Date(), day = dateKey(today);
  if (heatContext?.book === state && heatContext.scopeKey === scopeKey && heatContext.day === day) return;
  heatContext = {book:state, scopeKey, day, today, trips:m.trips, fishByTrip:m.fishByTrip, bounds:m.dateWindow.bounds, month};
  drawHeatmap();
}

export function renderAdvancedStats() {
  const root = els.advancedStatsPanel || byId("advancedStatsPanel");
  if (ui.activeView === "leaderboard" || document.body.dataset.activeView === "leaderboard") {
    renderLeaderboardFilters();
    renderStatsLeaderboard(scopedTrips(), (record,trip) => {
      const r = resolveTripLineRecord({ ...record,trip });
      return recordMatchesStatsFilters({ ...r, personId:r.personId || r.setupLine?.personId || "" });
    });
    return;
  }
  if (!root || !byId("workTopics")) return;
  bind(root);
  const scope = { ...activeStatsFilters, method:ui.activeStatsMethod, date:ui.activeStatsDateRange, from:ui.statsDateFrom, to:ui.statsDateTo };
  const scopeKey = JSON.stringify(scope);
  const signature = JSON.stringify([scopeKey,ui.activeStatsCompareBy,ui.activeStatsCompareSplit]);
  if (signature !== lastScope) { clearPair(true); lastScope = signature; }
  const m = buildStats(state,scope,{ report:ui.activeStatsCompareBy, split:ui.activeStatsCompareSplit, metric:ui.activeStatsCompareMetric,
    a,b,matched,threshold,minTrips:ui.activeStatsMinTrips,minHours:ui.activeStatsMinHours });
  const compare = ui.activeStatsCompareBy && m.compareOptions.some(report => report.id === ui.activeStatsCompareBy)
    ? ui.activeStatsCompareBy : ui.activeStatsCompareBy && m.compareOptions.some(report => report.id === m.active.id) ? m.active.id : "";
  const split = m.split;
  const metric = ui.activeStatsCompareMetric && m.columns.some(column => column.id === ui.activeStatsCompareMetric) ? ui.activeStatsCompareMetric : "";
  if (compare !== ui.activeStatsCompareBy || split !== ui.activeStatsCompareSplit || metric !== ui.activeStatsCompareMetric) {
    ui.activeStatsCompareBy = compare;
    ui.activeStatsCompareSplit = split;
    ui.activeStatsCompareMetric = metric;
    syncStatsUrl();
  }
  if (currentReport?.metric !== m.metric) tableSort = null;
  currentReport = m;
  const filterOptions = statsFilterOptions(state);
  for (const [key, id, empty] of [
    ["method","statsMethodFilter","All methods"],["location","statsLocationFilter","All locations"],["launch","statsLaunchFilter","All launches"],
    ["person","statsPersonFilter","All people"],["species","statsSpeciesFilter","All species"],["lure","statsLureFilter","All lures"],
    ["flasher","statsFlasherFilter","All flashers"],["weather","statsWeatherFilter","All weather"],["waterClarity","statsWaterClarityFilter","All clarity"],
    ["rating","statsRatingFilter","All ratings"],["month","statsMonthFilter","All months"]
  ]) menu(id,[empty,...filterOptions[key]],scope[key] || empty);
  menu("workTarget",filterOptions.targetSpecies,scope.targetSpecies,"Any target");
  const hideEmpty = ui.activeStatsHideEmpty;
  byId("workHideEmpty").checked = hideEmpty;
  menu("statsDateFilter",statsDateOptions(state.trips),scope.date);
  byId("workCustomDates").hidden = scope.date !== "custom";
  byId("workDateFrom").value = scope.from;
  byId("workDateTo").value = scope.to;
  byId("workDateHint").textContent = m.dateWindow.error || "Includes both dates.";
  for (const [id,value] of [["statsMinHoursInput",ui.activeStatsMinHours],["statsMinTripsInput",ui.activeStatsMinTrips]]) {
    if (document.activeElement !== byId(id)) byId(id).value = value;
  }
  byId("statsActiveScope").textContent = [m.dateWindow.label,scope.method,...Object.values(activeStatsFilters).filter(v => v && !/^All /.test(v))].join(" · ");
  for (const section of [els.advancedMetricGrid,els.statsActivityHeatmap.closest("section"),root.querySelector(".work-comparison")]) section.hidden = !!m.dateWindow.error;
  if (m.dateWindow.error) return;
  const metrics = overviewStats(m,hideEmpty);
  els.advancedMetricGrid.hidden = !metrics.length;
  setHtml(els.advancedMetricGrid,joinHtml(metrics.map(s => html`<article class="metric-card"><span>${s.label}</span><strong>${s.value}</strong><small>${s.detail}</small></article>`)));
  syncHeatmap(m,scopeKey,scope.month);
  const groups = [...new Set(m.compareOptions.map(d => d.group))];
  setHtml(byId("workTopics"),groups.length ? joinHtml(groups.map(g => tab(g,m.compareOptions.find(d => d.group === g).id,g === m.active.group,"topic")))
    : html`<span class="work-no-options" role="status">No categories have enough data to compare.</span>`);
  const compareOptions = m.compareOptions.filter(report => report.group === m.active.group);
  menu("statsCompareBySelect",compareOptions,m.active.id,compareOptions.length ? undefined : "No comparable categories");
  byId("statsCompareBySelect").disabled = !compareOptions.length;
  menu("statsCompareSplitSelect",m.splits,m.split,m.splits.length ? "No split" : "No useful split");
  byId("workSplitField").hidden = !m.splits.length;
  menu("statsCompareMetricSelect",m.columns,m.metric,m.columns.length ? undefined : "No compatible measures");
  byId("statsCompareMetricSelect").disabled = !m.columns.length;
  menu("workA",m.names.filter(n => n !== b),a,"All groups"); menu("workB",m.names.filter(n => n !== a),b,"All groups");
  byId("workMatched").checked = matched; byId("workMatched").disabled = !(a && b);
  byId("workMatchField").hidden = !m.pairEnabled || !m.compareOptions.length; byId("workSizeField").hidden = m.active.id !== "sizes" || !m.compareOptions.length; byId("workSizeUnit").textContent = `(${m.units.fishLength})`;
  byId("workMinHoursField").hidden = !m.columns.some(c => c.id === "hours");
  const chart = m.active.chart === "line" && !m.split ? "line" : "bar", pieData = piePlot(m);
  if ((!m.compareOptions.length || !pieData.suitable) && view === "pie") view = "";
  const selectedView = view || (a && b ? "table" : m.chart);
  currentPie = selectedView === "pie" && m.compareOptions.length ? pieData : null;
  const formats = {table:"Table",bar:"Bar chart",line:"Trend line",pie:"Pie chart"};
  const views = m.compareOptions.length ? ["table",chart,...(pieData.suitable ? ["pie"] : [])] : [];
  setHtml(byId("workViews"),joinHtml(views.map(v => tab(formats[v],v,selectedView === v,"view"))));
  byId("workReportTitle").textContent = m.active.label;
  byId("statsCompareNote").textContent = m.note;
  byId("statsCompareNote").hidden = !m.note;
  const rows = comparisonRows(m,hideEmpty);
  currentTable = selectedView === "table" && m.compareOptions.length ? comparisonTable(m,a,b,tableSort,limit,hideEmpty) : null;
  byId("workReportCount").textContent = m.compareOptions.length ? `${comparisonCount(m,rows,currentTable)} · ${lineMetric(m,m.metric)}` : "No comparable groups";
  const total = currentTable?.total ?? rows.length;
  const output = !m.compareOptions.length ? html`<p class="work-empty"><strong>No comparable groups</strong><br>Choose filters that leave at least two groups with recorded data.</p>`
    : !m.rows.length ? html`<p class="work-empty"><strong>No comparable records</strong><br>Try another report or widen your filters. A missing measurement is not zero.</p>`
    : currentPie ? pie(currentPie) : hideEmpty && !total ? html`<p class="work-empty"><strong>All results are hidden</strong><br>No recorded nonzero values in this comparison.</p><button class="button secondary" type="button" data-work-action="show-empty">Show all results</button>`
    : currentTable ? table(currentTable) : selectedView === "line" ? line(m,hideEmpty) : bars(m,rows.slice(0,limit));
  setHtml(byId("comparisonBuilderTable"),html`${output}${m.rows.length > 0 && total > limit && (selectedView === "table" || selectedView === "bar") ? html`<button class="button secondary" type="button" data-work-action="more">Show more (${total - limit} remaining)</button>` : ""}`);
  renderSources(m);
}

function renderSources(m) {
  const row = (currentPie ? currentPie.slices : m.rows).find(r => r.key === sourceKey);
  setHtml(byId("workSources"),row ? html`<aside><h5>Trips behind ${title(row)}</h5>${m.evidence.filter(t => row.tripIds.includes(t.id)).map(t => html`<button class="work-link" type="button" data-view-trip="${t.id}">${t.date} · ${t.title || t.location || "View trip"}</button>`)}</aside>` : "");
}
