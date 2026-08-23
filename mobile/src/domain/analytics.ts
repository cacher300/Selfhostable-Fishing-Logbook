import type { Catch, Logbook, Trip } from "./types";
import { tripHours } from "./services/duration";
import { buildAnalytics, dataQuality as reportDataQuality } from "./services/analytics-reports";
import { gearName } from "./services/setup-resolution";
export type RankedValue = { label: string; count: number };
function rank(values: string[]): RankedValue[] { const counts = new Map<string, number>(); for (const value of values.map(item => String(item || "").trim()).filter(Boolean)) counts.set(value,(counts.get(value) || 0) + 1); return [...counts].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count || a.label.localeCompare(b.label)); }
export function allCatches(logbook: Logbook, includeLost = false): Array<{trip:Trip; catch:Catch; lost:boolean}> { return logbook.trips.flatMap(trip => [...trip.catches.map(catchItem=>({trip,catch:catchItem,lost:false})),...(includeLost ? trip.lostFish.map(catchItem=>({trip,catch:catchItem,lost:true})) : [])]); }
/** Legacy compact dashboard shape. Use buildAnalytics for the full desktop-parity report. */
export function analytics(logbook: Logbook) { const report = buildAnalytics(logbook); return { species:rank(report.catches.map(item=>String(item.species || "Unknown"))), locations:rank(report.catches.map(item=>String(item.trip.location || "Unknown"))), methods:rank(report.catches.map(item=>String(item.trip.method || "Unknown"))), lures:rank(report.catches.map(item=>String(gearName(logbook,"lure",String(item.lureId || "")) || item.lureName || item.lure || "Unknown"))), landed:report.summary.landed,lost:report.summary.lost,hours:report.summary.hours,fishPerHour:report.summary.fishPerHour }; }
export function dataQuality(logbook: Logbook) { return reportDataQuality(logbook); }
export { buildAnalytics, performanceMetrics, confidence, measurementBuckets } from "./services/analytics-reports";
export { durationHours, durationMinutes, fishCount, setupMinutes, tripHours } from "./services/duration";
export { resolveCatch, activeSetupLines, gearName } from "./services/setup-resolution";
export { tripTimeline, setupOutcome } from "./services/timeline";
export { mediaReferences, referencedMediaIds, findOrphanMedia } from "./services/media-refs";
