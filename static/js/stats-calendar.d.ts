export type DateBounds = [string,string];
export type ActivityMode = "days" | "trips" | "fish";
export interface StatsDateWindow {bounds: DateBounds | null; error:string; label:string}
export interface CalendarDay {date:Date; key:string; fish:number; trips:number; outside:boolean; value:number; level:number; isToday:boolean; isFuture:boolean}
export interface ActivityOptions {bounds?:DateBounds | null; month?:string; mode?:ActivityMode; today?:Date}
export const statsMonthNames:readonly string[];
export function monthName(date:unknown):string;
export interface MonthDayCell {key:string; label:string; days:number; trips:number; fish:number; value:number; level:number}
export interface MonthDayRow {label:string; cells:MonthDayCell[]}
export function monthDayDescription(cell:MonthDayCell):string;
export const activityModes: {id:ActivityMode; label:string}[];
export const datePresets: {id:string; label:string}[];
export function statsDateWindow(scope:{date?:string;from?:string;to?:string}, today?:Date): StatsDateWindow;
export type ActivityCalendar = {
  fishedDays:number; tripCount:number; fishCount:number;
  maxFish:number; maxValue:number; mode:ActivityMode; legend:string[]; summary:string; period:string; description:string;
} & ({layout:"weekday";weeks:CalendarDay[][]; months:{key:string;label:string;column:number}[]}
   | {layout:"month-day";rows:MonthDayRow[]; dayCount:number; hint:string});
export function buildActivityCalendar<T extends {date:string}>(trips:T[], fishForTrip:(trip:T)=>number, options?:ActivityOptions): ActivityCalendar;
export function activityDayDescription(day:CalendarDay):string;
export function calendarDate(value:unknown):Date|null;
export function dateKey(date:Date):string;
export function inDateRange(day:string,bounds:DateBounds|null):boolean;
