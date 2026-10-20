import { html, joinHtml, setHtml } from "./html.js";
import { activeStatsChartMetric, activeStatsTableSort } from "./app-state.js";
import { statsNumericValue } from "./stats.js";


export function renderStatsTable(container, headers, rows) {
  const displayRows = sortedStatsRows(container, headers, rows);
  const metricIndexes = statsChartMetricIndexes(headers, displayRows);
  const chartMarkup = statsChartMarkup(container, headers, displayRows, metricIndexes);
  ensureStatsCardControls(container, chartMarkup, headers, metricIndexes);
  if (!displayRows.length) {
    setHtml(container, html`<div class="empty-state"><p>No data yet</p></div>`);
    return;
  }

  setHtml(container, html`
    <table>
      <thead><tr>${joinHtml(headers.map((header, index) => statsHeaderMarkup(container, header, index)))}</tr></thead>
      <tbody>
        ${joinHtml(displayRows.map((row) => html`<tr>${joinHtml(row.map((cell, index) => html`<td>${statsCellMarkup(cell, headers[index])}</td>`), "")}</tr>`), "")}
      </tbody>
    </table>
    ${chartMarkup}
  `);
}

export function sortedStatsRows(container, headers, rows) {
  const sort = activeStatsTableSort[container.id];
  if (!sort || !Number.isInteger(sort.index)) return rows;
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = statsSortValue(a[sort.index]);
    const right = statsSortValue(b[sort.index]);
    if (typeof left === "number" && typeof right === "number") {
      return ((left - right) * direction) || String(a[0]).localeCompare(String(b[0]));
    }
    return String(left).localeCompare(String(right)) * direction;
  });
}

export function statsSortValue(value) {
  if (value && typeof value === "object") return statsSortValue(value.text ?? value.value ?? "");
  const numeric = statsNumericValue(value);
  if (numeric !== null) return numeric;
  return String(value || "").toLowerCase();
}

export function statsHeaderMarkup(container, header, index) {
  const sort = activeStatsTableSort[container.id];
  const active = sort?.index === index;
  const direction = active && sort.direction === "asc" ? "low to high" : "high to low";
  const title = statsHeaderTitle(header);
  const marker = active
    ? html`<svg class="stats-sort-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3m0 0L4.5 6.5M8 3l3.5 3.5"${sort.direction === "asc" ? "" : html` transform="rotate(180 8 8)"`}></path></svg>`
    : "";
  return html`
    <th title="${title}">
      <button class="stats-sort-heading" type="button" data-stats-sort="${index}" title="${title}" aria-label="Sort ${header} ${direction}">
        <span>${header}</span>
        ${marker}
      </button>
    </th>
  `;
}

export function statsHeaderTitle(header) {
  const titles = {
    Fish: "Landed fish counted in the current stats scope.",
    Hours: "Logged fishing time, lure time, flasher time, or setup time when available.",
    "Fish / hr": "Fish divided by hours. Higher means better catch efficiency.",
    Trips: "Trips where this item or category appears in the current stats scope.",
    "Fish / trip": "Fish divided by trips used.",
    "Time %": "Percent of the selected fishing time spent with this item or category.",
    "Fish %": "Percent of the selected landed fish produced by this item or category.",
    Efficiency: "Fish percentage divided by time percentage. Above 1 means it produced more fish than its share of time.",
    Over: "Fish percentage minus time percentage. Positive means it overperformed its use.",
    Skunk: "Percent of trips in this category with zero landed fish.",
    Lost: "Lost fish count. This is secondary context and does not inflate landed fish.",
    "Producing Trips": "Trips where this lure caught at least one landed fish.",
    "Quiet While Others Hit": "Trips where this lure was used, caught nothing, and another lure caught fish.",
    "Quiet %": "Percent of this lure's used trips where other lures produced but this lure did not.",
    "Only Producer Trips": "Trips where this lure caught fish and no other lure caught fish.",
    Share: "Percent share within this table.",
    "Fish Share": "Percent of selected landed fish in this range or bucket.",
    Rate: "Percent or rate for this row, depending on the table.",
    "Release %": "Percent of landed fish released.",
    "Avg Speed": "Average recorded speed inside this range.",
    "Avg Length": "Average fish length for catches in this range.",
    "Avg Delta": "Average ball speed minus GPS speed.",
    Coverage: "Percent of eligible records with a usable value.",
    Complete: "Records with a usable value for this field.",
    Meaning: "What is being measured for coverage.",
    "Avg Temp": "Average probe temperature at this depth.",
    "Min Temp": "Lowest probe temperature at this depth.",
    "Max Temp": "Highest probe temperature at this depth.",
    Landed: "Landed fish counted in the current stats scope.",
    Sample: "How much data backs this row. Thin: under 2 trips or 3 strikes. Strong: 5+ trips, 10+ strikes, and 10+ hours.",
    "Vs Avg": "How the best option's fish per hour compares with the average across everything in that comparison.",
    Best: "Highest fish per hour among options with at least 2 trips and 2 strikes when available.",
    Trailing: "Lowest fish per hour among the same qualifying options.",
    Delta: "Fish % minus Time %. Positive means it produced more than its share of time.",
    "Landing %": "Landed fish divided by landed plus lost fish.",
    "Strikes / hr": "Landed plus lost fish per hour.",
    Overall: "All results for this row, regardless of the split."
  };
  return titles[header] || `Sort by ${header}`;
}

export function statsCellMarkup(cell, header) {
  if (cell && typeof cell === "object" && cell.html) return cell.html;
  const text = String(cell ?? "");
  const title = statsHeaderTitle(header);
  if (["Over", "Vs Avg"].includes(header) && text.startsWith("+")) return html`<span class="stats-positive" title="${title}">${text}</span>`;
  if (["Over", "Vs Avg"].includes(header) && text.startsWith("-")) return html`<span class="stats-negative" title="${title}">${text}</span>`;
  if (header === "Sample") return html`<span class="stats-sample stats-sample-${text.toLowerCase()}" title="${title}">${text}</span>`;
  return html`<span title="${title}">${cell}</span>`;
}

export function renderStatsMessage(container, message) {
  ensureStatsCardControls(container, "", [], []);
  setHtml(container, html`<div class="empty-state"><p>${message}</p></div>`);
}

export function ensureStatsCardControls(container, chartMarkup, headers, metricIndexes) {
  const card = container.closest(".analytics-card");
  if (!card) return;
  const heading = card.querySelector(":scope > h3, :scope > .analytics-card-header h3");
  if (!heading) return;
  let header = card.querySelector(":scope > .analytics-card-header");
  if (!header) {
    header = document.createElement("div");
    header.className = "analytics-card-header";
    heading.replaceWith(header);
    header.appendChild(heading);
  }
  let toggle = header.querySelector(".stats-view-toggle");
  if (!toggle) {
    toggle = document.createElement("div");
    toggle.className = "stats-view-toggle";
    setHtml(toggle, html`
      <button class="is-active" type="button" data-stats-view="table">Table</button>
      <button type="button" data-stats-view="chart">Chart</button>
    `);
    header.appendChild(toggle);
  }
  const canChart = Boolean(chartMarkup);
  toggle.hidden = !canChart;
  let metricControl = header.querySelector(".stats-chart-metric");
  const canSelectMetric = !statsChartConfig(container.id, headers)?.lockMetric;
  if (canChart && canSelectMetric && metricIndexes.length > 1) {
    if (!metricControl) {
      metricControl = document.createElement("label");
      metricControl.className = "stats-chart-metric";
      header.insertBefore(metricControl, toggle);
    }
    const config = statsChartConfig(container.id, headers);
    const defaultIndex = config?.valueIndex ?? config?.valueIndexes?.[0] ?? metricIndexes[0];
    const selectedIndex = metricIndexes.includes(activeStatsChartMetric[container.id])
      ? activeStatsChartMetric[container.id]
      : defaultIndex;
    setHtml(metricControl, html`
      <span>Chart by</span>
      <select data-stats-chart-metric="${container.id}" aria-label="Chart ${heading.textContent.trim()} by metric">
        ${joinHtml(metricIndexes.map((index) => html`<option value="${index}" ${index === selectedIndex ? "selected" : ""}>${headers[index]}</option>`), "")}
      </select>
    `);
    metricControl.hidden = false;
  } else if (metricControl) {
    metricControl.hidden = true;
  }
  if (!canChart) card.classList.remove("show-chart");
  if (canChart && card.dataset.defaultView === "chart" && !card.dataset.statsViewInitialized) {
    card.classList.add("show-chart");
    toggle.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.statsView === "chart");
    });
    card.dataset.statsViewInitialized = "true";
  }
}

export function statsChartMarkup(container, headers, rows, metricIndexes = statsChartMetricIndexes(headers, rows)) {
  if (!rows.length) return "";
  const config = selectedStatsChartConfig(container.id, headers, metricIndexes);
  if (!config) return "";
  const description = statsChartDescription(container.id);
  const chart = config.type === "donut" ? donutChartMarkup(headers, rows, config)
    : config.type === "line" ? lineChartMarkup(headers, rows, config)
      : config.type === "stacked" ? stackedBarChartMarkup(headers, rows, config)
        : config.type === "grouped" ? groupedBarChartMarkup(headers, rows, config)
          : barChartMarkup(headers, rows, config);
  return description ? html`<p class="stats-chart-description">${description}</p>${chart}` : chart;
}

export function statsChartDescription(id) {
  if (id === "lureShareStatsTable") {
    return "Compare time on the water with fish produced. When Fish % is higher than Time %, that lure produced more than its share of the catch.";
  }
  return "";
}

export function statsChartMetricIndexes(headers, rows) {
  const nonMetricHeaders = new Set([
    "Trip", "Launch", "Start", "Lines pulled", "Pattern", "Species", "Outcome", "Lure", "Lure Type", "Lure Color",
    "Flasher", "Combo", "Direction", "Line Side", "Method", "Location", "Water Clarity", "Intent", "Rating", "Person",
    "Wind", "Trend", "Front Tag", "Moon", "Moon Window", "Window", "Relationship", "Catch Class", "Position", "Field",
    "Meaning", "Time", "FOW Range", "GPS Speed", "Ball Speed", "Distance"
  ]);
  return headers
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => index > 0 && !nonMetricHeaders.has(header)
      && rows.some((row) => statsNumericValue(row[index]) !== null))
    .map(({ index }) => index);
}

export function selectedStatsChartConfig(id, headers, metricIndexes) {
  const config = statsChartConfig(id, headers);
  if (!config) return null;
  if (config.lockMetric) return config;
  const selectedIndex = activeStatsChartMetric[id];
  if (!metricIndexes.includes(selectedIndex)) return config;
  return {
    ...config,
    type: "bar",
    valueIndex: selectedIndex,
    valueIndexes: undefined,
    seriesLabels: undefined
  };
}

export function statsChartConfig(id, headers) {
  const byHeader = (name) => headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());
  const fishIndex = byHeader("Fish");
  const rateIndex = byHeader("Fish / hr");
  const tripRateIndex = byHeader("Fish / trip");
  const catchShareIndex = byHeader("Fish %");
  const usageShareIndex = byHeader("Time %");

  const configs = {
    outcomeStatsTable: { type: "donut", valueIndex: byHeader("Fish"), excludeLabels: ["Landed"] },
    speciesStatsTable: { type: "bar", valueIndex: fishIndex, limit: 8 },
    lostFishStatsTable: { type: "donut", valueIndex: byHeader("Lost") },
    timeOfDayStatsTable: { type: "bar", valueIndex: fishIndex, limit: 8 },
    releaseStatsTable: { type: "stacked", valueIndexes: [byHeader("Released"), byHeader("Kept")], seriesLabels: ["Released", "Kept"] },
    lureStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    lureShareStatsTable: { type: "grouped", valueIndexes: [usageShareIndex, catchShareIndex], seriesLabels: ["Time %", "Fish %"], limit: 8 },
    lureSpreadStatsTable: { type: "bar", valueIndex: byHeader("Quiet While Others Hit"), limit: 8 },
    lureTypeStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    lureColorStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    lureColorFamilyStatsTable: { type: "bar", valueIndex: rateIndex, limit: 10 },
    lureSizeStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    lureGlowStatsTable: { type: "grouped", valueIndexes: [usageShareIndex, catchShareIndex], seriesLabels: ["Time %", "Fish %"], limit: 4 },
    bladeTypeStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    dipseyColorStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    dipseySettingStatsTable: { type: "bar", valueIndex: byHeader("Landed"), limit: 10 },
    flasherColorStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    lureFlasherColorStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    comparisonBuilderTable: { type: "bar", valueIndex: rateIndex, limit: 12 },
    flasherStatsTable: { type: "grouped", valueIndexes: [usageShareIndex, catchShareIndex], seriesLabels: ["Time %", "Fish %"], limit: 8 },
    comboStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    directionStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    lineSideStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    trollingSetupStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    downriggerStatsTable: { type: "bar", valueIndex: fishIndex, limit: 8 },
    directionSpeedStatsTable: { type: "bar", valueIndex: byHeader("Fish at speed"), limit: 8 },
    fowRangeStatsTable: { type: "donut", valueIndex: byHeader("Fish") },
    fowStatsTable: { type: "bar", valueIndex: fishIndex, limit: 10 },
    depthDownStatsTable: { type: "bar", valueIndex: fishIndex, limit: 10 },
    locationStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    methodStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    waterClarityStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    weatherStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    intentStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    ratingStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    personStatsTable: { type: "bar", valueIndex: fishIndex, limit: 8 },
    monthStatsTable: {
      type: "line",
      valueIndexes: [fishIndex, rateIndex],
      seriesLabels: ["Fish", "Fish / hr"],
      orderLabels: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    },
    windDirectionStatsTable: { type: "bar", valueIndex: fishIndex, limit: 8 },
    windSpeedStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    pressureStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    cloudCoverStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    airTempStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    sunshineStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    frontTagStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    biteWindowStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 10 },
    moonPhaseStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    moonWindowStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    speciesOverviewStatsTable: { type: "bar", valueIndex: fishIndex, limit: 7 },
    gpsSpeedStatsTable: { type: "bar", valueIndex: fishIndex, limit: 10 },
    ballSpeedStatsTable: { type: "bar", valueIndex: fishIndex, limit: 10 },
    distanceBehindStatsTable: { type: "bar", valueIndex: rateIndex, limit: 10 },
    thermoclineStatsTable: { type: "donut", valueIndex: fishIndex, lockMetric: true }
  };

  const config = configs[id];
  if (!config) return null;
  const indexes = config.valueIndexes || [config.valueIndex];
  if (indexes.some((index) => index < 1)) return null;
  return config;
}

export function chartRowsFor(headers, rows, config) {
  const valueIndex = config.valueIndex;
  return rows
    .map((row) => ({
      label: row[0],
      value: statsNumericValue(row[valueIndex]),
      valueLabel: row[valueIndex],
      metric: headers[valueIndex] || ""
    }))
    .filter((row) => row.value !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, config.limit || 10);
}

export function barChartMarkup(headers, rows, config) {
  const chartRows = chartRowsFor(headers, rows, config);
  if (!chartRows.length) return "";
  const max = Math.max(...chartRows.map((row) => row.value), 1);
  return html`
    <div class="stats-chart stats-chart-bars" aria-label="Bar chart view">
      ${joinHtml(chartRows.map((row, index) => html`
        <div class="stats-chart-row">
          <span class="stats-chart-label" title="${row.label}">${row.label}</span>
          <span class="stats-chart-track" aria-hidden="true">
            <span class="stats-chart-bar stats-chart-color-${index % 8}" style="width: ${Math.max(4, (row.value / max) * 100)}%"></span>
          </span>
          <span class="stats-chart-value">${row.valueLabel} ${row.metric}</span>
        </div>
      `), "")}
    </div>
  `;
}

export function stackedBarChartMarkup(headers, rows, config) {
  const chartRows = rows.map((row) => {
    const values = config.valueIndexes.map((index) => statsNumericValue(row[index]) || 0);
    const valueLabels = config.valueIndexes.map((index) => row[index]);
    const total = values.reduce((sum, value) => sum + value, 0);
    return { label: row[0], values, valueLabels, total };
  }).filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, config.limit || 10);
  if (!chartRows.length) return "";
  return html`
    <div class="stats-chart stats-chart-stacked" aria-label="Stacked bar chart view">
      <div class="stats-chart-legend">
        ${joinHtml(config.seriesLabels.map((label, index) => html`<span><i class="stats-chart-color-${index}"></i>${label}</span>`), "")}
      </div>
      ${joinHtml(chartRows.map((row) => html`
        <div class="stats-chart-row">
          <span class="stats-chart-label" title="${row.label}">${row.label}</span>
          <span class="stats-chart-track" aria-hidden="true">
            ${joinHtml(row.values.map((value, index) => value ? html`<span class="stats-chart-bar stats-chart-segment stats-chart-color-${index}" style="width: ${(value / row.total) * 100}%"></span>` : ""), "")}
          </span>
          <span class="stats-chart-value">${row.valueLabels.join(" / ")}</span>
        </div>
      `), "")}
    </div>
  `;
}

export function groupedBarChartMarkup(headers, rows, config) {
  const chartRows = rows.map((row) => {
    const values = config.valueIndexes.map((index) => statsNumericValue(row[index]));
    const valueLabels = config.valueIndexes.map((index) => row[index]);
    return { label: row[0], values, valueLabels };
  }).filter((row) => row.values.some((value) => value !== null && value > 0))
    .sort((a, b) => Math.max(...b.values.map((value) => value || 0)) - Math.max(...a.values.map((value) => value || 0)))
    .slice(0, config.limit || 10);
  if (!chartRows.length) return "";
  const max = Math.max(...chartRows.flatMap((row) => row.values.map((value) => value || 0)), 1);
  return html`
    <div class="stats-chart stats-chart-grouped" aria-label="Grouped bar chart view">
      <div class="stats-chart-legend">
        ${joinHtml(config.seriesLabels.map((label, index) => html`<span><i class="stats-chart-color-${index}"></i>${label}</span>`), "")}
      </div>
      ${joinHtml(chartRows.map((row) => html`
        <div class="stats-chart-row stats-chart-grouped-row">
          <span class="stats-chart-label" title="${row.label}">${row.label}</span>
          <span class="stats-chart-group" aria-hidden="true">
            ${joinHtml(row.values.map((value, index) => html`
              <span class="stats-chart-track">
                <span class="stats-chart-bar stats-chart-color-${index}" style="width: ${Math.max(3, ((value || 0) / max) * 100)}%"></span>
              </span>
            `), "")}
          </span>
          <span class="stats-chart-value">${row.valueLabels.join(" / ")}</span>
        </div>
      `), "")}
    </div>
  `;
}

export function donutChartMarkup(headers, rows, config) {
  const excludedLabels = new Set(config.excludeLabels || []);
  const chartRows = chartRowsFor(headers, rows, config)
    .filter((row) => row.value > 0 && !excludedLabels.has(String(row.label)))
    .slice(0, 6);
  if (!chartRows.length) return "";
  const total = chartRows.reduce((sum, row) => sum + row.value, 0);
  let offset = 25;
  const segments = chartRows.map((row, index) => {
    const length = (row.value / total) * 100;
    const segment = html`<circle class="stats-donut-segment stats-chart-stroke-${index % 8}" cx="21" cy="21" r="15.915" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${offset}"></circle>`;
    offset -= length;
    return segment;
  });
  return html`
    <div class="stats-chart stats-donut-chart" aria-label="Donut chart view">
      <svg viewBox="0 0 42 42" role="img" aria-label="${headers[config.valueIndex]} share">
        <circle class="stats-donut-bg" cx="21" cy="21" r="15.915"></circle>
        ${joinHtml(segments)}
        <text x="21" y="20" text-anchor="middle">${total}</text>
        <text x="21" y="25" text-anchor="middle">${headers[config.valueIndex]}</text>
      </svg>
      <div class="stats-chart-legend">
        ${joinHtml(chartRows.map((row, index) => html`<span><i class="stats-chart-color-${index % 8}"></i>${row.label}: ${row.valueLabel}</span>`), "")}
      </div>
    </div>
  `;
}

export function lineChartMarkup(headers, rows, config) {
  const valueIndexes = config.valueIndexes;
  let chartRows = rows.map((row) => ({
    label: row[0],
    values: valueIndexes.map((index) => statsNumericValue(row[index]) || 0)
  })).filter((row) => row.values.some((value) => value > 0));
  if (config.orderLabels) {
    const order = new Map(config.orderLabels.map((label, index) => [label, index]));
    chartRows = chartRows.sort((a, b) => (order.get(a.label) ?? 999) - (order.get(b.label) ?? 999));
  }
  if (chartRows.length < 2) return barChartMarkup(headers, rows, { ...config, valueIndex: valueIndexes[0] });
  const width = 320;
  const height = 180;
  const plot = { left: 34, right: 12, top: 18, bottom: 42 };
  const max = Math.max(...chartRows.flatMap((row) => row.values), 1);
  const xFor = (index) => plot.left + (index * ((width - plot.left - plot.right) / Math.max(1, chartRows.length - 1)));
  const yFor = (value) => height - plot.bottom - ((value / max) * (height - plot.top - plot.bottom));
  const polylines = valueIndexes.map((_, seriesIndex) => chartRows.map((row, index) => `${xFor(index)},${yFor(row.values[seriesIndex])}`).join(" "));
  const xLabelInterval = Math.max(1, Math.ceil(chartRows.length / 5));
  const shortLabel = (label) => String(label).replace(/,\s*\d{4}$/, "");
  return html`
    <div class="stats-chart stats-line-chart" aria-label="Line chart view">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${`${headers[0]} by ${config.seriesLabels.join(" and ")}`}">
        <line class="stats-line-axis" x1="${plot.left}" y1="${height - plot.bottom}" x2="${width - plot.right}" y2="${height - plot.bottom}"></line>
        <line class="stats-line-axis" x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${height - plot.bottom}"></line>
        <text class="stats-line-axis-label stats-line-axis-label-y" x="${plot.left - 6}" y="${plot.top + 4}" text-anchor="end">${String(max)}</text>
        <text class="stats-line-axis-label stats-line-axis-label-y" x="${plot.left - 6}" y="${height - plot.bottom + 4}" text-anchor="end">0</text>
        <text class="stats-line-axis-title" x="${plot.left}" y="11">Fish</text>
        ${joinHtml(polylines.map((points, index) => html`<polyline class="stats-line stats-chart-stroke-${index}" points="${points}"></polyline>`), "")}
        ${joinHtml(chartRows.map((row, rowIndex) => joinHtml(valueIndexes.map((_, seriesIndex) => html`<circle class="stats-line-point stats-chart-fill-${seriesIndex}" cx="${xFor(rowIndex)}" cy="${yFor(row.values[seriesIndex])}" r="3"><title>${`${row.label}: ${config.seriesLabels[seriesIndex]} ${row.values[seriesIndex]}`}</title></circle>`))))}
        ${joinHtml(chartRows.map((row, index) => (index % xLabelInterval === 0 || index === chartRows.length - 1)
          ? html`<text class="stats-line-axis-label stats-line-axis-label-x" x="${xFor(index)}" y="${height - 18}" text-anchor="middle">${shortLabel(row.label)}</text>`
          : ""), "")}
        <text class="stats-line-axis-title stats-line-axis-title-x" x="${(plot.left + width - plot.right) / 2}" y="${height - 3}" text-anchor="middle">${headers[0]}</text>
      </svg>
      <div class="stats-chart-legend">
        ${joinHtml(config.seriesLabels.map((label, index) => html`<span><i class="stats-chart-color-${index}"></i>${label}</span>`), "")}
      </div>
    </div>
  `;
}
