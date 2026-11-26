const dateFormat = new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric", year:"numeric" });
const monthFormat = new Intl.DateTimeFormat(undefined, { month:"short" });
const longMonthFormat = new Intl.DateTimeFormat(undefined, { month:"long" });
export const statsMonthNames = Array.from({length:12}, (_,i) => longMonthFormat.format(new Date(2020,i,1)));
export const monthName = date => statsMonthNames[Number(String(date).slice(5,7))-1] || "";
const fullFormat = new Intl.DateTimeFormat(undefined, { weekday:"long", month:"long", day:"numeric", year:"numeric" });
const monthDayFormat = new Intl.DateTimeFormat(undefined, { month:"long", day:"numeric" });
export const datePresets = [
  {id:"all",label:"All time"}, {id:"season",label:"This season"},
  {id:"30",label:"Last 30 days"}, {id:"90",label:"Last 90 days"}, {id:"custom",label:"Custom range"}
];
export const activityModes = [{id:"days",label:"Days fished"},{id:"trips",label:"Trips"},{id:"fish",label:"Fish landed"}];
export const dateKey = d => [String(d.getFullYear()).padStart(4,"0"),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
export function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00`);
  return dateKey(d) === value ? d : null;
}
const addDays = (d,n) => { const copy = new Date(d); copy.setDate(copy.getDate()+n); return copy; };
const rangeLabel = (a,b) => a === b ? dateFormat.format(calendarDate(a)) : `${dateFormat.format(calendarDate(a))} – ${dateFormat.format(calendarDate(b))}`;
export const inDateRange = (day,bounds) => !bounds || (day >= bounds[0] && day <= bounds[1] && !!calendarDate(day));

export function statsDateWindow({date = "all", from = "", to = ""}, today = new Date()) {
  let bounds = null, error = "";
  const label = datePresets.find(p => p.id === date)?.label || date;
  if (date === "custom") {
    if (!from || !to) error = "Choose a start and end date.";
    else if (!calendarDate(from) || !calendarDate(to)) error = "Choose valid calendar dates.";
    else if (to < from) error = "End date must be on or after start date.";
    else bounds = [from,to];
  } else if (/^\d{4}$/.test(date)) bounds = [`${date}-01-01`,`${date}-12-31`];
  else if (date === "season") bounds = [`${today.getFullYear()}-01-01`,dateKey(today)];
  else if (date === "30" || date === "90") bounds = [dateKey(addDays(today,1-Number(date))),dateKey(today)];
  else if (date !== "all") error = "Choose an available date range.";
  return {bounds,error,label:date === "custom" && bounds ? rangeLabel(...bounds) : label};
}

const unitCount = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"}`;
const levelOf = (value,max) => value > 0 ? Math.ceil(5*value/max) : 0;

function includesLeapDay(bounds) {
  if (!bounds) return true;
  for (let year = Number(bounds[0].slice(0,4)); year <= Number(bounds[1].slice(0,4)); year++) {
    if (inDateRange(`${String(year).padStart(4,"0")}-02-29`,bounds)) return true;
  }
  return false;
}

function monthDayGrid(activity,mode,selectedMonth,bounds) {
  const buckets = new Map();
  let maxValue = 0;
  // Each activity entry is already one distinct logbook date, even with multiple trips.
  for (const [date,day] of activity) {
    const key = date.slice(5), cell = buckets.get(key) || {days:0,trips:0,fish:0};
    cell.days++; cell.trips += day.trips; cell.fish += day.fish;
    maxValue = Math.max(maxValue,cell[mode]); buckets.set(key,cell);
  }
  const months = selectedMonth < 0 ? statsMonthNames.map((_,i) => i) : [selectedMonth];
  const rows = months.map(month => {
    // A leap year supplies every possible month/day, without a Feb 30 or Apr 31.
    const first = new Date(2000,month,1,12);
    const length = month === 1 && !includesLeapDay(bounds) ? 28 : new Date(2000,month+1,0,12).getDate();
    return {label:monthFormat.format(first),cells:Array.from({length},(_,i) => {
      const date = addDays(first,i), key = dateKey(date).slice(5);
      const counts = buckets.get(key) || {days:0,trips:0,fish:0};
      return {key,label:monthDayFormat.format(date),...counts,value:counts[mode],level:levelOf(counts[mode],maxValue)};
    })};
  });
  return {rows,maxValue,dayCount:Math.max(...rows.map(row => row.cells.length))};
}

export function monthDayDescription(cell) {
  return `${cell.label}: ${cell.trips ? `${unitCount(cell.days,"day")} fished, ${unitCount(cell.trips,"trip")}, ${cell.fish} fish landed` : "no trip logged"}`;
}

/** null means all history; without a scope, keep the original rolling 53-week calendar. */
export function buildActivityCalendar(trips, fishForTrip, {bounds, month, mode = "fish", today = new Date()} = {}) {
  const now = dateKey(today), rollingStart = dateKey(addDays(today,-today.getDay()-52*7));
  const selectedMonth = statsMonthNames.indexOf(month);
  const matchesMonth = date => selectedMonth < 0 || date.getMonth() === selectedMonth;
  const from = bounds?.[0] ?? rollingStart;
  const to = bounds?.[1] ?? now;
  const activity = new Map();
  let tripCount = 0, fishCount = 0, maxFish = 0, maxTrips = 0;
  for (const t of trips) {
    const key = t.date, date = calendarDate(key);
    if (!date || !matchesMonth(date) || key > now || key > to || (bounds !== null && key < from)) continue;
    const day = activity.get(key) || {trips:0,fish:0}, fish = Math.max(0,Number(fishForTrip(t)) || 0);
    day.trips++; day.fish += fish; tripCount++; fishCount += fish;
    maxFish = Math.max(maxFish,day.fish); maxTrips = Math.max(maxTrips,day.trips);
    activity.set(key,day);
  }
  const days = activity.size;
  const summary = mode === "days" ? `${unitCount(days,"day")} fished` : mode === "trips" ? unitCount(tripCount,"trip") : `${fishCount} fish landed`;
  const totals = {fishedDays:days,tripCount,fishCount,maxFish,mode,summary};
  const start = calendarDate(from), end = calendarDate(to);
  if (bounds === null || (bounds && Math.round((end-start)/86400000) > 365)) {
    const {rows,maxValue,dayCount} = monthDayGrid(activity,mode,selectedMonth,bounds);
    const valueLabel = n => mode === "fish" ? `${n} fish` : unitCount(n,mode === "days" ? "day" : "trip");
    const period = bounds === null ? "All time" : rangeLabel(from,to);
    const legend = maxValue ? [valueLabel(0),valueLabel(maxValue)] : [tripCount ? "No fish landed in this selection" : "No trips in this selection"];
    return {...totals,layout:"month-day",rows,dayCount,maxValue,legend,period,
      description:selectedMonth < 0 ? `${period} by month and day` : `${month} by day (${period})`,
      hint:bounds === null ? "" : "Each cell combines the same month and day within the selected dates."};
  }
  const maxValue = mode === "days" ? 1 : mode === "trips" ? maxTrips : maxFish;
  const weeks = [], months = [];
  let previousMonth = "";
  for (let sunday = addDays(start,-start.getDay()); sunday <= end; sunday = addDays(sunday,7)) {
    const week = Array.from({length:7}, (_,i) => {
      const date = addDays(sunday,i), key = dateKey(date), outside = date < start || date > end || !matchesMonth(date);
      const {fish,trips:count} = activity.get(key) || {fish:0,trips:0};
      const value = mode === "days" ? Number(count > 0) : mode === "trips" ? count : fish;
      return {date,key,fish,trips:count,outside,value,level:levelOf(value,maxValue),isToday:!outside && key === now,isFuture:key > now};
    });
    if (week.every(d => d.outside)) continue;
    const firstOfMonth = week.find(d => !d.outside && d.key.slice(0,7) !== previousMonth);
    if (firstOfMonth) {
      previousMonth = firstOfMonth.key.slice(0,7);
      months.push({key:previousMonth,label:monthFormat.format(firstOfMonth.date),column:weeks.length+1});
    }
    weeks.push(week);
  }
  const legend = !weeks.length ? [`${month} is outside the selected date range.`]
    : mode === "days" ? ["No trip","Fished"] : mode === "trips" ? ["0 trips",`${maxTrips} ${maxTrips === 1 ? "trip" : "trips"}`] : ["0 fish",`${maxFish} fish`];
  const period = rangeLabel(from,to);
  return {...totals,layout:"weekday",weeks,months,maxValue,legend,period,
    description:bounds === undefined ? "Fishing activity over the last 12 months" : `${activityModes.find(m => m.id === mode).label}: ${period}`};
}

export function activityDayDescription(day) {
  return `${fullFormat.format(day.date)}: ${day.isFuture ? "upcoming" : !day.trips ? "no trip logged" : `${day.trips} ${day.trips === 1 ? "trip" : "trips"}, ${day.fish} fish landed`}`;
}
