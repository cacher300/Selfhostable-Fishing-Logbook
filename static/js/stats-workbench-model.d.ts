import type { StatsDateWindow } from "./stats-calendar.js";
export interface StatsScope { date?: string; from?:string; to?:string; method?: string; targetSpecies?: string; species?: string; location?: string; launch?: string; person?: string; lure?: string; flasher?: string; waterClarity?: string; weather?: string; month?: string; rating?: string; }
export type FilterKey = Exclude<keyof StatsScope, "date" | "from" | "to">;
export interface ReportOptions { report?: string; split?: string; metric?: string; a?: string; b?: string; matched?: boolean; minTrips?: number; minHours?: number; threshold?: number; }
export interface ReportChoice { id: string; label: string; group: string; kind: string; chart: "table" | "bar" | "line"; }
export interface StatsRow { key: string; name: string; secondary: string; values: Record<string, number | null>; small: boolean; tripIds: string[]; }
interface SourceTrip { id: string; date: string; title?: string; }
export interface StatsModel<T extends SourceTrip = SourceTrip> {
  dateWindow:StatsDateWindow;
  trips: T[]; evidence: T[]; fishByTrip: Map<string, number>; totals: Record<string, number | null>; bestTripId: string; bestFish: number | null;
  reports: ReportChoice[]; splits: ReportChoice[]; active: ReportChoice; split: string; chart: ReportChoice["chart"]; units: Record<string,string>;
  rows: StatsRow[]; columns: { id: string; label: string }[]; metric: string; names: string[]; pairEnabled: boolean; overlappingGroups:boolean; note: string; highlight: string;
}
export const filterLabels: Record<FilterKey, string>;
export function catchQuantity(record:{quantity?:unknown}):number;
export function reportForMethod(method?: string): string;
export function buildStats<T extends SourceTrip>(book: {trips: T[]}, scope?: StatsScope, options?: ReportOptions, today?: Date): StatsModel<T>;
export function statsFilterOptions(book: {trips: SourceTrip[]}): Record<FilterKey,string[]>;
export function usedStatsMethods(trips:SourceTrip[]):string[];
export function statsDateOptions(trips:SourceTrip[]):{id:string;label:string}[];
export function formatStat(value: number | null | undefined, label?: string): string;
export interface PieSlice {key:string;name:string;value:number;share:string;color:string;path:string;tripIds:string[]}
export interface PiePlot {slices:PieSlice[];caption:string;message?:string;suggestion?:{id:string;label:string}}
export function piePlot(model:StatsModel):PiePlot;
export function comparisonRows(model:StatsModel, hideEmpty?:boolean):StatsRow[];
export interface ComparisonGrid {heading:string; columns:string[]; available:number; rows:{label:string; cells:({key:string; value:number|null; text:string; detail:string} | null)[]}[];}
export function comparisonGrid(model: StatsModel, a?:string, b?:string, hideEmpty?:boolean): ComparisonGrid | null;
export interface TableSort {key:string; direction:"ascending"|"descending";}
export interface ComparisonTable {
  matrix:boolean; columns:{id:string; label:string}[]; sort:TableSort|null; available:number; total:number;
  rows:{key:string; label:string; cells:({text:string; key?:string; detail?:string} | null)[]}[];
}
export function nextTableSort(current:TableSort|null, key:string):TableSort;
export function comparisonTable(model:StatsModel, a?:string, b?:string, requested?:TableSort|null, limit?:number, hideEmpty?:boolean):ComparisonTable;
export function comparisonCount(model:StatsModel, visible:StatsRow[], table:ComparisonTable|null):string;
interface Point { name: string; key: string; x: number; y: number; value: number; }
export function trendPlot(rows: StatsRow[], metric: string, reportId: string, hideEmpty?:boolean): {points: Point[]; segments: Point[][]; lo: number; hi: number; first: string; last: string} | null;
export function overviewStats(model: StatsModel, hideEmpty?:boolean): {label: string; value: string; detail: string}[];
