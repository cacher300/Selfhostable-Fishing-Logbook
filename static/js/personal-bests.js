const personalBestMonths = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" }
];

function tripDateParts(trip) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trip?.date || "")) return null;
  const [year, month, day] = trip.date.split("-").map(Number);
  return { year, month, day };
}

function catchMeasurementValue(catchItem, key) {
  const value = parseFirstNumber(catchItem?.[key]);
  return value > 0 ? value : null;
}

function catchMeasurementText(catchItem, key) {
  const value = String(catchItem?.[key] || "").trim();
  if (value) return value;
  const numberValue = catchMeasurementValue(catchItem, key);
  if (!numberValue) return "";
  return `${trimNumber(numberValue)} ${unitSymbol(key === "weight" ? "fishWeight" : "fishLength")}`;
}

function personalBestScore(catchItem) {
  return {
    weight: catchMeasurementValue(catchItem, "weight"),
    length: catchMeasurementValue(catchItem, "length")
  };
}

function personalBestDateValue(record) {
  const parts = record?.dateParts;
  if (!parts) return Number.MAX_SAFE_INTEGER;
  return (parts.year * 10000) + (parts.month * 100) + parts.day;
}

function comparePersonalBestCatches(a, b) {
  const aScore = personalBestScore(a);
  const bScore = personalBestScore(b);
  const aWeight = aScore.weight ?? -1;
  const bWeight = bScore.weight ?? -1;
  if (aWeight !== bWeight) return aWeight - bWeight;
  return (aScore.length ?? -1) - (bScore.length ?? -1);
}

function personalBestBasis(catchItem) {
  const score = personalBestScore(catchItem);
  if (score.weight && score.length) return "Ranked by weight, length as tie-breaker";
  if (score.weight) return "Ranked by weight";
  if (score.length) return "Ranked by length";
  return "No measurement";
}

function measuredCatchRecords() {
  return state.trips.flatMap((trip) => {
    const dateParts = tripDateParts(trip);
    return (trip.catches || []).map((catchItem, catchIndex) => ({
      ...resolveTripLineRecord({ ...catchItem, trip }),
      trip,
      dateParts,
      catchIndex
    }));
  }).filter((record) => {
    const hasSpecies = String(record.species || "").trim();
    const score = personalBestScore(record);
    return hasSpecies && (score.weight || score.length);
  });
}

function filteredPersonalBestRecords() {
  return measuredCatchRecords().filter((record) => {
    const parts = record.dateParts;
    const matchesYear = activePersonalBestsFilters.year === "All years"
      || (parts && String(parts.year) === activePersonalBestsFilters.year);
    const matchesMonth = activePersonalBestsFilters.month === "All months"
      || (parts && String(parts.month) === activePersonalBestsFilters.month);
    return matchesYear && matchesMonth;
  });
}

function renderPersonalBestFilters() {
  const yearOptions = ["All years", ...new Set(measuredCatchRecords()
    .map((record) => record.dateParts?.year)
    .filter(Boolean))]
    .sort((a, b) => {
      if (a === "All years") return -1;
      if (b === "All years") return 1;
      return b - a;
    })
    .map(String);
  if (!yearOptions.includes(activePersonalBestsFilters.year)) activePersonalBestsFilters.year = "All years";
  els.bestsYearFilter.innerHTML = yearOptions.map((year) => (
    `<option value="${escapeHtml(year)}" ${year === activePersonalBestsFilters.year ? "selected" : ""}>${escapeHtml(year)}</option>`
  )).join("");

  const availableMonths = new Set(measuredCatchRecords()
    .filter((record) => activePersonalBestsFilters.year === "All years" || String(record.dateParts?.year) === activePersonalBestsFilters.year)
    .map((record) => record.dateParts?.month)
    .filter(Boolean)
    .map(String));
  const monthOptions = [
    { value: "All months", label: "All months" },
    ...personalBestMonths.filter((month) => availableMonths.has(month.value))
  ];
  if (!monthOptions.some((month) => month.value === activePersonalBestsFilters.month)) {
    activePersonalBestsFilters.month = "All months";
  }
  els.bestsMonthFilter.innerHTML = monthOptions.map((month) => (
    `<option value="${escapeHtml(month.value)}" ${month.value === activePersonalBestsFilters.month ? "selected" : ""}>${escapeHtml(month.label)}</option>`
  )).join("");
}

function personalBestItems() {
  const bySpecies = new Map();
  filteredPersonalBestRecords().forEach((record) => {
    const species = String(record.species || "").trim();
    const current = bySpecies.get(species);
    if (!current || comparePersonalBestCatches(record, current) > 0) bySpecies.set(species, record);
  });
  return [...bySpecies.values()].sort((a, b) => String(a.species).localeCompare(String(b.species)));
}

function comparePersonalBestTimeline(a, b) {
  const dateDelta = personalBestDateValue(a) - personalBestDateValue(b);
  if (dateDelta) return dateDelta;
  return (a.catchIndex || 0) - (b.catchIndex || 0);
}

function personalBestProgressions(records) {
  const bySpecies = new Map();
  records.forEach((record) => {
    const species = String(record.species || "").trim();
    if (!bySpecies.has(species)) bySpecies.set(species, []);
    bySpecies.get(species).push(record);
  });

  return [...bySpecies.entries()].map(([species, speciesRecords]) => {
    let best = null;
    const milestones = speciesRecords
      .sort(comparePersonalBestTimeline)
      .reduce((items, record) => {
        if (!best || comparePersonalBestCatches(record, best) > 0) {
          items.push({ record, previous: best });
          best = record;
        }
        return items;
      }, []);
    return { species, milestones };
  }).filter((item) => item.milestones.length)
    .sort((a, b) => a.species.localeCompare(b.species));
}

function personalBestMeasurementSummary(record) {
  return [
    catchMeasurementText(record, "weight"),
    catchMeasurementText(record, "length")
  ].filter(Boolean).join(" / ") || "Measured catch";
}

function personalBestImprovementText(record, previous) {
  if (!previous) return "First measured best";
  const current = personalBestScore(record);
  const last = personalBestScore(previous);
  const weightDelta = current.weight !== null && last.weight !== null ? current.weight - last.weight : null;
  const lengthDelta = current.length !== null && last.length !== null ? current.length - last.length : null;

  if (weightDelta > 0) {
    return `+${trimNumber(weightDelta)} ${unitSymbol("fishWeight")}`;
  }
  if (current.weight && !last.weight) return `Added ${catchMeasurementText(record, "weight")}`;
  if (lengthDelta > 0) {
    return `+${trimNumber(lengthDelta)} ${unitSymbol("fishLength")}`;
  }
  if (current.length && !last.length) return `Added ${catchMeasurementText(record, "length")}`;
  return "New best";
}

function renderPersonalBestMetrics(items, records) {
  const heaviest = items.reduce((best, item) => (!best || comparePersonalBestCatches(item, best) > 0 ? item : best), null);
  const measuredSpecies = new Set(records.map((record) => record.species));
  const progressionSteps = personalBestProgressions(records).reduce((total, item) => total + item.milestones.length, 0);
  els.personalBestsMetricGrid.innerHTML = [
    ["Species With Bests", items.length],
    ["Measured Catches", records.length],
    ["Measured Species", measuredSpecies.size],
    ["Progression Steps", progressionSteps],
    ["Top Fish", heaviest ? `${heaviest.species} ${catchMeasurementText(heaviest, "weight") || catchMeasurementText(heaviest, "length")}` : "-"]
  ].map(([label, value]) => `
    <article class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("");
}

function renderPersonalBestCard(record) {
  const photo = (record.photos || []).find((item) => previewImage(item) && !isVideoMedia(item));
  const lengthText = catchMeasurementText(record, "length") || "Not logged";
  const weightText = catchMeasurementText(record, "weight") || "Not logged";
  const tripTitle = record.trip?.title || record.trip?.location || "Saved trip";
  return `
    <article class="personal-best-card">
      <div class="personal-best-media">
        ${photo ? mediaMarkup(photo, "personal-best-photo") : `<div class="personal-best-photo-placeholder">${escapeHtml(record.species.slice(0, 2).toUpperCase())}</div>`}
      </div>
      <div class="personal-best-body">
        <div class="personal-best-title-row">
          <div>
            <span class="pattern-rank">Personal best</span>
            <h4>${escapeHtml(record.species)}</h4>
          </div>
          <span class="stats-badge">${escapeHtml(personalBestBasis(record))}</span>
        </div>
        <dl class="personal-best-details">
          <div><dt>Weight</dt><dd>${escapeHtml(weightText)}</dd></div>
          <div><dt>Length</dt><dd>${escapeHtml(lengthText)}</dd></div>
          <div><dt>Date</dt><dd>${escapeHtml(formatDate(record.trip?.date))}</dd></div>
          <div><dt>Trip</dt><dd>${escapeHtml(tripTitle)}</dd></div>
          <div><dt>Location</dt><dd>${escapeHtml(record.trip?.location || "Not logged")}</dd></div>
          <div><dt>Lure</dt><dd>${escapeHtml(lureName(record.lureId) || "Not logged")}</dd></div>
        </dl>
        <div class="personal-best-actions">
          <button class="button secondary compact-action" type="button" data-view-trip="${escapeHtml(record.trip?.id || "")}">View Trip</button>
        </div>
      </div>
    </article>
  `;
}

function renderPersonalBestProgression(records) {
  if (!els.personalBestProgression) return;
  const progressions = personalBestProgressions(records);
  if (!progressions.length) {
    els.personalBestProgression.innerHTML = "";
    return;
  }

  els.personalBestProgression.innerHTML = `
    <div class="personal-best-progression-header">
      <div>
        <p class="eyebrow">Record history</p>
        <h4>Progression of Personal Bests</h4>
      </div>
      <span>${escapeHtml(progressions.length)} species</span>
    </div>
    <div class="personal-best-progression-grid">
      ${progressions.map(({ species, milestones }) => `
        <article class="personal-best-progression-card">
          <div class="personal-best-progression-card-head">
            <h5>${escapeHtml(species)}</h5>
            <span>${escapeHtml(milestones.length)} ${milestones.length === 1 ? "step" : "steps"}</span>
          </div>
          <ol class="personal-best-timeline">
            ${milestones.map(({ record, previous }) => {
              const tripTitle = record.trip?.title || record.trip?.location || "Saved trip";
              return `
                <li>
                  <div class="personal-best-timeline-point" aria-hidden="true"></div>
                  <div class="personal-best-timeline-body">
                    <div class="personal-best-timeline-topline">
                      <strong>${escapeHtml(personalBestMeasurementSummary(record))}</strong>
                      <span>${escapeHtml(personalBestImprovementText(record, previous))}</span>
                    </div>
                    <div class="personal-best-timeline-meta">
                      ${escapeHtml(formatDate(record.trip?.date) || "Date not logged")} / ${escapeHtml(tripTitle)}
                    </div>
                    <button class="button secondary compact-action" type="button" data-view-trip="${escapeHtml(record.trip?.id || "")}">View Trip</button>
                  </div>
                </li>
              `;
            }).join("")}
          </ol>
        </article>
      `).join("")}
    </div>
  `;
}

function renderPersonalBests() {
  if (!els.personalBestsPanel) return;
  renderPersonalBestFilters();
  const records = filteredPersonalBestRecords();
  const items = personalBestItems();
  renderPersonalBestMetrics(items, records);
  renderPersonalBestProgression(records);
  if (!items.length) {
    els.personalBestsGrid.innerHTML = `
      <div class="empty-state table-card">
        <h3>No measured catches for this period</h3>
        <p>Add length or weight to catches, or adjust the year and month filters.</p>
      </div>
    `;
    return;
  }
  els.personalBestsGrid.innerHTML = items.map(renderPersonalBestCard).join("");
}
