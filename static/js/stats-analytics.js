(function exposeStatsAnalytics(global) {
  "use strict";

  const safeDivide = (numerator, denominator) => (
    Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
      ? numerator / denominator
      : null
  );

  /** Confidence uses both independent trips and comparable active exposure. */
  function confidence(hours, trips, thresholds = {}) {
    const config = { mediumTrips: 3, highTrips: 6, mediumHours: 5, highHours: 15, ...thresholds };
    if (trips >= config.highTrips && hours >= config.highHours) return "High";
    if (trips >= config.mediumTrips && hours >= config.mediumHours) return "Medium";
    return "Low";
  }

  /** Null values mean a denominator is unavailable; zero is reserved for a real zero result. */
  function performanceMetrics({ landed = 0, lost = 0, missed = 0, hours = null, trips = 0, totalHours = null, totalLanded = 0 }) {
    const strikes = landed + lost + missed;
    const timeShare = safeDivide(hours, totalHours);
    const fishShare = safeDivide(landed, totalLanded);
    return {
      landed,
      lost,
      missed,
      strikes,
      hours: Number.isFinite(hours) && hours > 0 ? hours : null,
      landedRate: safeDivide(landed, hours),
      strikeRate: safeDivide(strikes, hours),
      hookupSuccess: safeDivide(landed + lost, strikes),
      landingSuccess: safeDivide(landed, landed + lost),
      timeShare,
      fishShare,
      efficiencyIndex: timeShare && fishShare !== null ? fishShare / timeShare : null,
      performanceDelta: timeShare !== null && fishShare !== null ? fishShare - timeShare : null,
      confidence: confidence(Number.isFinite(hours) ? hours : 0, trips)
    };
  }

  global.StatsAnalytics = { safeDivide, confidence, performanceMetrics };
})(typeof window === "undefined" ? globalThis : window);
