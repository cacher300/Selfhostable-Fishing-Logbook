function renderStatsTable(container, headers, rows) {
  const displayRows = sortedStatsRows(container, headers, rows);
  const chartMarkup = statsChartMarkup(container, headers, displayRows);
  ensureStatsCardControls(container, chartMarkup);
  if (!displayRows.length) {
    container.innerHTML = `<div class="empty-state"><p>No data yet</p></div>`;
    return;
  }

  container.innerHTML = `
    <table>
      <thead><tr>${headers.map((header, index) => statsHeaderMarkup(container, header, index)).join("")}</tr></thead>
      <tbody>
        ${displayRows.map((row) => `<tr>${row.map((cell, index) => `<td>${statsCellMarkup(cell, headers[index])}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
    ${chartMarkup}
  `;
}

function sortedStatsRows(container, headers, rows) {
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

function statsSortValue(value) {
  if (value && typeof value === "object") return statsSortValue(value.text ?? value.value ?? "");
  const numeric = statsNumericValue(value);
  if (numeric !== null) return numeric;
  return String(value || "").toLowerCase();
}


function statsHeaderMarkup(container, header, index) {
  const sort = activeStatsTableSort[container.id];
  const active = sort?.index === index;
  const direction = active && sort.direction === "asc" ? "low to high" : "high to low";
  const title = statsHeaderTitle(header);
  const marker = active ? (sort.direction === "asc" ? "^" : "v") : "";
  return `
    <th title="${escapeHtml(title)}">
      <button class="stats-sort-heading" type="button" data-stats-sort="${index}" title="${escapeHtml(title)}" aria-label="Sort ${escapeHtml(header)} ${escapeHtml(direction)}">
        <span>${escapeHtml(header)}</span>
        ${marker ? `<span aria-hidden="true">${marker}</span>` : ""}
      </button>
    </th>
  `;
}

function statsHeaderTitle(header) {
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
    Confidence: "Sample-size confidence based on hours and trips.",
    Label: "Quick interpretation of rate, share, and sample size.",
    Share: "Percent share within this table.",
    "Fish Share": "Percent of selected landed fish in this range or bucket.",
    Rate: "Percent or rate for this row, depending on the table.",
    "Release %": "Percent of landed fish released."
  };
  return titles[header] || `Sort by ${header}`;
}

function statsCellMarkup(cell, header) {
  if (cell && typeof cell === "object" && cell.html) return cell.html;
  const text = String(cell ?? "");
  const title = statsHeaderTitle(header);
  if (header === "Confidence") return `<span class="stats-badge stats-confidence-${text.toLowerCase()}" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`;
  if (header === "Label") return `<span class="stats-badge" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`;
  if (header === "Over" && text.startsWith("+")) return `<span class="stats-positive" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`;
  if (header === "Over" && text.startsWith("-")) return `<span class="stats-negative" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`;
  return `<span title="${escapeHtml(title)}">${escapeHtml(cell)}</span>`;
}

function renderStatsMessage(container, message) {
  ensureStatsCardControls(container, "");
  container.innerHTML = `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
}

function ensureStatsCardControls(container, chartMarkup) {
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
    toggle.innerHTML = `
      <button class="is-active" type="button" data-stats-view="table">Table</button>
      <button type="button" data-stats-view="chart">Chart</button>
    `;
    header.appendChild(toggle);
  }
  const canChart = Boolean(chartMarkup);
  toggle.hidden = !canChart;
  if (!canChart) card.classList.remove("show-chart");
  if (canChart && card.dataset.defaultView === "chart" && !card.dataset.statsViewInitialized) {
    card.classList.add("show-chart");
    toggle.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.statsView === "chart");
    });
    card.dataset.statsViewInitialized = "true";
  }
}

function statsChartMarkup(container, headers, rows) {
  if (!rows.length) return "";
  const config = statsChartConfig(container.id, headers);
  if (!config) return "";
  if (config.type === "donut") return donutChartMarkup(headers, rows, config);
  if (config.type === "line") return lineChartMarkup(headers, rows, config);
  if (config.type === "stacked") return stackedBarChartMarkup(headers, rows, config);
  if (config.type === "grouped") return groupedBarChartMarkup(headers, rows, config);
  return barChartMarkup(headers, rows, config);
}

function statsChartConfig(id, headers) {
  const byHeader = (name) => headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());
  const fishIndex = byHeader("Fish");
  const landedIndex = byHeader("Landed");
  const lostIndex = byHeader("Lost");
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
    bestPatternStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    lureStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    lureShareStatsTable: { type: "grouped", valueIndexes: [usageShareIndex, catchShareIndex], seriesLabels: ["Time %", "Fish %"], limit: 8 },
    lureSpreadStatsTable: { type: "bar", valueIndex: byHeader("Quiet While Others Hit"), limit: 8 },
    lureTypeStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    lureColorStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    flasherStatsTable: { type: "grouped", valueIndexes: [usageShareIndex, catchShareIndex], seriesLabels: ["Time %", "Fish %"], limit: 8 },
    comboStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    directionStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    lineSideStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    trollingSetupStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    downriggerStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
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
    weatherTrendStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    frontTagStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    biteWindowStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 10 },
    moonPhaseStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    moonWindowStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 }
  };

  const config = configs[id];
  if (!config) return null;
  const indexes = config.valueIndexes || [config.valueIndex];
  if (indexes.some((index) => index < 1)) return null;
  return config;
}

function chartRowsFor(headers, rows, config) {
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

function barChartMarkup(headers, rows, config) {
  const chartRows = chartRowsFor(headers, rows, config);
  if (!chartRows.length) return "";
  const max = Math.max(...chartRows.map((row) => row.value), 1);
  return `
    <div class="stats-chart stats-chart-bars" aria-label="Bar chart view">
      ${chartRows.map((row, index) => `
        <div class="stats-chart-row">
          <span class="stats-chart-label" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
          <span class="stats-chart-track" aria-hidden="true">
            <span class="stats-chart-bar stats-chart-color-${index % 8}" style="width: ${Math.max(4, (row.value / max) * 100)}%"></span>
          </span>
          <span class="stats-chart-value">${escapeHtml(row.valueLabel)} ${escapeHtml(row.metric)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function stackedBarChartMarkup(headers, rows, config) {
  const chartRows = rows.map((row) => {
    const values = config.valueIndexes.map((index) => statsNumericValue(row[index]) || 0);
    const valueLabels = config.valueIndexes.map((index) => row[index]);
    const total = values.reduce((sum, value) => sum + value, 0);
    return { label: row[0], values, valueLabels, total };
  }).filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, config.limit || 10);
  if (!chartRows.length) return "";
  return `
    <div class="stats-chart stats-chart-stacked" aria-label="Stacked bar chart view">
      <div class="stats-chart-legend">
        ${config.seriesLabels.map((label, index) => `<span><i class="stats-chart-color-${index}"></i>${escapeHtml(label)}</span>`).join("")}
      </div>
      ${chartRows.map((row) => `
        <div class="stats-chart-row">
          <span class="stats-chart-label" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
          <span class="stats-chart-track" aria-hidden="true">
            ${row.values.map((value, index) => value ? `<span class="stats-chart-bar stats-chart-segment stats-chart-color-${index}" style="width: ${(value / row.total) * 100}%"></span>` : "").join("")}
          </span>
          <span class="stats-chart-value">${escapeHtml(row.valueLabels.join(" / "))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function groupedBarChartMarkup(headers, rows, config) {
  const chartRows = rows.map((row) => {
    const values = config.valueIndexes.map((index) => statsNumericValue(row[index]));
    const valueLabels = config.valueIndexes.map((index) => row[index]);
    return { label: row[0], values, valueLabels };
  }).filter((row) => row.values.some((value) => value !== null && value > 0))
    .sort((a, b) => Math.max(...b.values.map((value) => value || 0)) - Math.max(...a.values.map((value) => value || 0)))
    .slice(0, config.limit || 10);
  if (!chartRows.length) return "";
  const max = Math.max(...chartRows.flatMap((row) => row.values.map((value) => value || 0)), 1);
  return `
    <div class="stats-chart stats-chart-grouped" aria-label="Grouped bar chart view">
      <div class="stats-chart-legend">
        ${config.seriesLabels.map((label, index) => `<span><i class="stats-chart-color-${index}"></i>${escapeHtml(label)}</span>`).join("")}
      </div>
      ${chartRows.map((row) => `
        <div class="stats-chart-row stats-chart-grouped-row">
          <span class="stats-chart-label" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
          <span class="stats-chart-group" aria-hidden="true">
            ${row.values.map((value, index) => `
              <span class="stats-chart-track">
                <span class="stats-chart-bar stats-chart-color-${index}" style="width: ${Math.max(3, ((value || 0) / max) * 100)}%"></span>
              </span>
            `).join("")}
          </span>
          <span class="stats-chart-value">${escapeHtml(row.valueLabels.join(" / "))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function donutChartMarkup(headers, rows, config) {
  const excludedLabels = new Set(config.excludeLabels || []);
  const chartRows = chartRowsFor(headers, rows, config)
    .filter((row) => row.value > 0 && !excludedLabels.has(String(row.label)))
    .slice(0, 6);
  if (!chartRows.length) return "";
  const total = chartRows.reduce((sum, row) => sum + row.value, 0);
  let offset = 25;
  const segments = chartRows.map((row, index) => {
    const length = (row.value / total) * 100;
    const segment = `<circle class="stats-donut-segment stats-chart-stroke-${index % 8}" cx="21" cy="21" r="15.915" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${offset}"></circle>`;
    offset -= length;
    return segment;
  }).join("");
  return `
    <div class="stats-chart stats-donut-chart" aria-label="Donut chart view">
      <svg viewBox="0 0 42 42" role="img" aria-label="${escapeHtml(headers[config.valueIndex])} share">
        <circle class="stats-donut-bg" cx="21" cy="21" r="15.915"></circle>
        ${segments}
        <text x="21" y="20" text-anchor="middle">${escapeHtml(total)}</text>
        <text x="21" y="25" text-anchor="middle">${escapeHtml(headers[config.valueIndex])}</text>
      </svg>
      <div class="stats-chart-legend">
        ${chartRows.map((row, index) => `<span><i class="stats-chart-color-${index % 8}"></i>${escapeHtml(row.label)}: ${escapeHtml(row.valueLabel)}</span>`).join("")}
      </div>
    </div>
  `;
}

function lineChartMarkup(headers, rows, config) {
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
  const height = 150;
  const pad = 20;
  const max = Math.max(...chartRows.flatMap((row) => row.values), 1);
  const xFor = (index) => pad + (index * ((width - pad * 2) / Math.max(1, chartRows.length - 1)));
  const yFor = (value) => height - pad - ((value / max) * (height - pad * 2));
  const polylines = valueIndexes.map((_, seriesIndex) => chartRows.map((row, index) => `${xFor(index)},${yFor(row.values[seriesIndex])}`).join(" "));
  return `
    <div class="stats-chart stats-line-chart" aria-label="Line chart view">
      <svg viewBox="0 0 ${width} ${height}" role="img">
        <line class="stats-line-axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"></line>
        <line class="stats-line-axis" x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}"></line>
        ${polylines.map((points, index) => `<polyline class="stats-line stats-chart-stroke-${index}" points="${points}"></polyline>`).join("")}
        ${chartRows.map((row, rowIndex) => valueIndexes.map((_, seriesIndex) => `<circle class="stats-line-point stats-chart-fill-${seriesIndex}" cx="${xFor(rowIndex)}" cy="${yFor(row.values[seriesIndex])}" r="3"></circle>`).join("")).join("")}
      </svg>
      <div class="stats-chart-legend">
        ${config.seriesLabels.map((label, index) => `<span><i class="stats-chart-color-${index}"></i>${escapeHtml(label)}</span>`).join("")}
      </div>
    </div>
  `;
}

