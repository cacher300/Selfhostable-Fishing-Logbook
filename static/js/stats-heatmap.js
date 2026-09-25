(function () {
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "short" });
  const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
  const HEATMAP_LEVEL_COUNT = 5;

  function atNoon(value) {
    if (value instanceof Date) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      date.setHours(12, 0, 0, 0);
      return date;
    }

    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day, 12, 0, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
    date.setHours(12, 0, 0, 0);
    return date;
  }

  function addDays(date, amount) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + amount);
    return copy;
  }

  function dateKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function monthKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0")].join("-");
  }

  function defaultFishForTrip(trip) {
    return (trip.catches || []).reduce((total, catchItem) => {
      if (catchItem.quantity === undefined || catchItem.quantity === "") return total + 1;
      const quantity = Number(catchItem.quantity);
      return total + (Number.isFinite(quantity) ? Math.max(0, quantity) : 0);
    }, 0);
  }

  function activityLevel(fish, maxFish) {
    if (!maxFish || fish <= 0) return 0;
    return Math.min(HEATMAP_LEVEL_COUNT, Math.max(1, Math.ceil((fish / maxFish) * HEATMAP_LEVEL_COUNT)));
  }

  function formatFishCount(value) {
    const count = Number(value) || 0;
    return Number.isInteger(count) ? String(count) : String(Math.round(count * 10) / 10);
  }

  function build(trips = [], options = {}) {
    const today = atNoon(options.today || new Date()) || atNoon(new Date());
    const currentWeekStart = addDays(today, -today.getDay());
    const start = addDays(currentWeekStart, -52 * 7);
    const fishForTrip = options.fishForTrip || defaultFishForTrip;
    const activityByDate = new Map();

    trips.forEach((trip) => {
      const tripDate = atNoon(trip.date);
      if (!tripDate || tripDate < start || tripDate > today) return;
      const key = dateKey(tripDate);
      const activity = activityByDate.get(key) || { trips: 0, fish: 0 };
      activity.trips += 1;
      activity.fish += Math.max(0, Number(fishForTrip(trip)) || 0);
      activityByDate.set(key, activity);
    });

    const maxFish = [...activityByDate.values()].reduce((maximum, activity) => Math.max(maximum, activity.fish), 0);

    const weeks = Array.from({ length: 53 }, (_, weekIndex) => (
      Array.from({ length: 7 }, (_, dayIndex) => {
        const date = addDays(start, (weekIndex * 7) + dayIndex);
        const activity = activityByDate.get(dateKey(date)) || { trips: 0, fish: 0 };
        return {
          date,
          key: dateKey(date),
          trips: activity.trips,
          fish: activity.fish,
          level: activityLevel(activity.fish, maxFish),
          isToday: dateKey(date) === dateKey(today),
          isFuture: date > today
        };
      })
    ));

    const months = [];
    let previousMonthKey = null;
    weeks.forEach((week, index) => {
      const monthDate = week.find((day) => !day.isFuture && monthKey(day.date) !== previousMonthKey);
      if (monthDate) {
        previousMonthKey = monthKey(monthDate.date);
        months.push({ key: previousMonthKey, label: MONTH_FORMATTER.format(monthDate.date), column: index + 1 });
      }
    });

    const activeDays = [...activityByDate.values()].filter((activity) => activity.trips > 0);
    return {
      weeks,
      months,
      fishedDays: activeDays.length,
      tripCount: activeDays.reduce((total, activity) => total + activity.trips, 0),
      fishCount: activeDays.reduce((total, activity) => total + activity.fish, 0),
      maxFish
    };
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
    }[character]));
  }

  function dayDescription(day) {
    if (day.isFuture) return `${DATE_FORMATTER.format(day.date)}: upcoming`;
    if (!day.trips) return `${DATE_FORMATTER.format(day.date)}: no trip logged`;
    const tripLabel = `${day.trips} ${day.trips === 1 ? "trip" : "trips"}`;
    const fishLabel = `${day.fish} fish landed`;
    return `${DATE_FORMATTER.format(day.date)}: ${tripLabel}, ${fishLabel}`;
  }

  function render(model) {
    const maxFishLabel = formatFishCount(model.maxFish);
    const months = model.months.map((month) => (
      `<span class="activity-heatmap-month" style="grid-column:${month.column}">${escapeHtml(month.label)}</span>`
    )).join("");
    const days = model.weeks.flat().map((day) => (
      `<span class="activity-heatmap-day activity-heatmap-level-${day.level}${day.isToday ? " is-today" : ""}${day.isFuture ? " is-future" : ""}" role="img"${day.isToday ? " aria-current=\"date\"" : ""}${day.trips && !day.isFuture ? " tabindex=\"0\"" : ""} aria-label="${escapeHtml(dayDescription(day))}" title="${escapeHtml(dayDescription(day))}"></span>`
    )).join("");

    return `
      <div class="activity-heatmap-scroll">
        <div class="activity-heatmap">
          <div class="activity-heatmap-months" aria-hidden="true">${months}</div>
          <div class="activity-heatmap-content">
            <div class="activity-heatmap-weekdays" aria-hidden="true">
              ${DAY_NAMES.map((name, index) => `<span class="activity-heatmap-weekday activity-heatmap-weekday-${index}">${index % 2 ? escapeHtml(name.slice(0, 3)) : ""}</span>`).join("")}
            </div>
            <div class="activity-heatmap-calendar" role="group" aria-label="Fishing activity over the last 12 months">${days}</div>
          </div>
        </div>
      </div>
      <div class="activity-heatmap-footer">
        <span class="activity-heatmap-legend" aria-label="Fishing activity legend: 0 to ${escapeHtml(maxFishLabel)} fish per day">
          <span>0 fish</span><i class="activity-heatmap-level-0"></i><i class="activity-heatmap-level-1"></i><i class="activity-heatmap-level-2"></i><i class="activity-heatmap-level-3"></i><i class="activity-heatmap-level-4"></i><i class="activity-heatmap-level-5"></i><span>${escapeHtml(maxFishLabel)} fish</span>
        </span>
      </div>
    `;
  }

  globalThis.StatsActivityHeatmap = { build, render };
}());
