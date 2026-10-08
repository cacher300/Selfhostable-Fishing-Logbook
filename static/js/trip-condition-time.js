export function tripConditionsTime(trip = {}, catchItem = null) {
  const dateMatch = String(trip?.date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) throw new Error("A valid trip date is required for historical NOAA conditions.");

  const parseClock = (value) => {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]), minutes = Number(match[2]);
    return hours <= 23 && minutes <= 59 ? { hours, minutes, minutesAfterMidnight: hours * 60 + minutes } : null;
  };
  const launch = parseClock(trip.launchTime);
  const catchClock = catchItem && !catchItem.timeUnknown ? parseClock(catchItem.time) : null;
  const clock = catchClock || launch || { hours: 12, minutes: 0, minutesAfterMidnight: 720 };
  const date = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), clock.hours, clock.minutes);

  if (catchClock && launch && catchClock.minutesAfterMidnight < launch.minutesAfterMidnight) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString();
}
