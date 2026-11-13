/**
 * Time utilities with explicit facility time zones.
 *
 * Rules used throughout Poise:
 *  - Punches and other instants are stored as UTC ISO strings.
 *  - Schedules are stored as facility-local date + wall-clock times, and converted to instants
 *    with the facility's IANA time zone. This keeps daylight-saving transitions explicit
 *    (e.g. a 23:00–07:00 shift on the night DST ends is 9 hours, not 8).
 *  - No third-party date library is used, so behaviour is easy to test in isolation.
 */
import type { ISODate, ISOInstant, LocalTime } from './types';

const MS_MIN = 60_000;
const MS_DAY = 86_400_000;

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(ms: number, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset of the zone from UTC at the given instant, in minutes (e.g. -300 for EST). */
export function tzOffsetMinutes(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MS_MIN);
}

export function parseDate(date: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

export function parseTime(time: LocalTime): { h: number; mi: number } {
  const [h, mi] = time.split(':').map(Number);
  return { h, mi };
}

/**
 * Convert a facility-local wall-clock date/time to a UTC instant (ms).
 * Ambiguous times (fall back) resolve to the first occurrence; nonexistent
 * times (spring forward) resolve to the instant after the gap.
 */
export function zonedToUtcMs(date: ISODate, time: LocalTime, timeZone: string): number {
  const { y, m, d } = parseDate(date);
  const { h, mi } = parseTime(time);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off1 = tzOffsetMinutes(guess, timeZone);
  let t = guess - off1 * MS_MIN;
  const off2 = tzOffsetMinutes(t, timeZone);
  if (off2 !== off1) {
    const t2 = guess - off2 * MS_MIN;
    // If t2 maps back to the requested wall time use it, otherwise we are in a gap.
    const p = zonedParts(t2, timeZone);
    if (p.hour === h && p.minute === mi) t = t2;
    else t = Math.max(t, t2);
  }
  return t;
}

export function zonedToUtc(date: ISODate, time: LocalTime, timeZone: string): ISOInstant {
  return new Date(zonedToUtcMs(date, time, timeZone)).toISOString();
}

export function localDateOf(instant: ISOInstant | number, timeZone: string): ISODate {
  const ms = typeof instant === 'number' ? instant : Date.parse(instant);
  const p = zonedParts(ms, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function localTimeOf(instant: ISOInstant | number, timeZone: string): LocalTime {
  const ms = typeof instant === 'number' ? instant : Date.parse(instant);
  const p = zonedParts(ms, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/* ------------------------------ calendar-date math ------------------------------ */

export function addDays(date: ISODate, n: number): ISODate {
  const { y, m, d } = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d) + n * MS_DAY);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday */
export function dayOfWeek(date: ISODate): number {
  const { y, m, d } = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekStartOf(date: ISODate): ISODate {
  return addDays(date, -dayOfWeek(date));
}

export function daysBetween(a: ISODate, b: ISODate): number {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / MS_DAY);
}

export function dateRange(start: ISODate, endInclusive: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= endInclusive; d = addDays(d, 1)) out.push(d);
  return out;
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/* ------------------------------ intervals ------------------------------ */

export interface Interval {
  start: number; // ms
  end: number; // ms
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function overlapMinutes(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start)) / MS_MIN;
}

export function minutesBetween(startMs: number, endMs: number): number {
  return Math.round((endMs - startMs) / MS_MIN);
}

/** Interval of a scheduled shift in the facility's time zone. End <= start means next day. */
export function shiftInterval(
  shift: { date: ISODate; start: LocalTime; end: LocalTime },
  timeZone: string,
): Interval {
  const start = zonedToUtcMs(shift.date, shift.start, timeZone);
  const endDate = shift.end <= shift.start ? addDays(shift.date, 1) : shift.date;
  const end = zonedToUtcMs(endDate, shift.end, timeZone);
  return { start, end };
}

/**
 * Split an interval at facility-local midnights. Used for PBJ (hours are reported by
 * calendar day, with midnight as the cutoff) and for daily totals.
 */
export function splitByLocalDay(
  interval: Interval,
  timeZone: string,
): { date: ISODate; minutes: number }[] {
  const out: { date: ISODate; minutes: number }[] = [];
  let cursor = interval.start;
  let guard = 0;
  while (cursor < interval.end && guard++ < 60) {
    const date = localDateOf(cursor, timeZone);
    const nextMidnight = zonedToUtcMs(addDays(date, 1), '00:00', timeZone);
    const segEnd = Math.min(nextMidnight, interval.end);
    out.push({ date, minutes: Math.round((segEnd - cursor) / MS_MIN) });
    cursor = segEnd;
  }
  return out;
}

/* ------------------------------ formatting ------------------------------ */

export function fmtTime(instant: ISOInstant | number, timeZone: string): string {
  const ms = typeof instant === 'number' ? instant : Date.parse(instant);
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(ms);
}

export function fmtDateTime(instant: ISOInstant | number, timeZone: string): string {
  const ms = typeof instant === 'number' ? instant : Date.parse(instant);
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(ms);
}

export function tzAbbrev(instant: ISOInstant | number, timeZone: string): string {
  const ms = typeof instant === 'number' ? instant : Date.parse(instant);
  const p = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(ms);
  return p.find((x) => x.type === 'timeZoneName')?.value ?? '';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function fmtDate(date: ISODate, opts: { weekday?: boolean; year?: boolean } = {}): string {
  if (!date) return '—';
  const { y, m, d } = parseDate(date);
  const base = `${MONTHS[m - 1]} ${d}`;
  const wd = opts.weekday ? `${DOW[dayOfWeek(date)]}, ` : '';
  return `${wd}${base}${opts.year ? `, ${y}` : ''}`;
}

export function fmtDow(date: ISODate): string {
  return DOW[dayOfWeek(date)];
}

export function fmtLocalTime(time: LocalTime): string {
  const { h, mi } = parseTime(time);
  const suffix = h >= 12 ? 'p' : 'a';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return mi === 0 ? `${hr}${suffix}` : `${hr}:${pad(mi)}${suffix}`;
}

export function fmtHours(minutesOrHours: number, unit: 'minutes' | 'hours' = 'minutes'): string {
  const h = unit === 'minutes' ? minutesOrHours / 60 : minutesOrHours;
  return h.toFixed(2);
}

export function fmtDuration(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const m = Math.abs(Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${sign}${r}m`;
  return r === 0 ? `${sign}${h}h` : `${sign}${h}h ${r}m`;
}

/* ------------------------------ fiscal quarters (CMS PBJ) ------------------------------ */

export interface FiscalQuarter {
  id: string; // FY2027-Q1
  fiscalYear: number;
  quarter: 1 | 2 | 3 | 4;
  start: ISODate;
  end: ISODate;
  /** End of the 45th calendar day after quarter end (per PBJ Policy Manual v2.8 §1.2). */
  deadline: ISODate;
  label: string;
}

/** Federal fiscal quarters: Q1 Oct–Dec, Q2 Jan–Mar, Q3 Apr–Jun, Q4 Jul–Sep. */
export function fiscalQuarterOf(date: ISODate): FiscalQuarter {
  const { y, m } = parseDate(date);
  const fy = m >= 10 ? y + 1 : y;
  const q = (m >= 10 ? 1 : m <= 3 ? 2 : m <= 6 ? 3 : 4) as 1 | 2 | 3 | 4;
  return fiscalQuarter(fy, q);
}

export function fiscalQuarter(fy: number, q: 1 | 2 | 3 | 4): FiscalQuarter {
  const startMonth = [10, 1, 4, 7][q - 1];
  const startYear = q === 1 ? fy - 1 : fy;
  const start = `${startYear}-${pad(startMonth)}-01`;
  const endMonthStart = addMonths(start, 3);
  const end = addDays(endMonthStart, -1);
  const deadline = addDays(end, 45);
  const months = q === 1 ? 'Oct–Dec' : q === 2 ? 'Jan–Mar' : q === 3 ? 'Apr–Jun' : 'Jul–Sep';
  return {
    id: `FY${fy}-Q${q}`,
    fiscalYear: fy,
    quarter: q,
    start,
    end,
    deadline,
    label: `FY${fy} Q${q} (${months} ${q === 1 ? startYear : fy})`,
  };
}

export function quarterFromId(id: string): FiscalQuarter {
  const m = /^FY(\d{4})-Q([1-4])$/.exec(id);
  if (!m) throw new Error(`Invalid quarter id ${id}`);
  return fiscalQuarter(Number(m[1]), Number(m[2]) as 1 | 2 | 3 | 4);
}

export function previousQuarter(q: FiscalQuarter): FiscalQuarter {
  return q.quarter === 1 ? fiscalQuarter(q.fiscalYear - 1, 4) : fiscalQuarter(q.fiscalYear, (q.quarter - 1) as 1 | 2 | 3);
}

function addMonths(date: ISODate, n: number): ISODate {
  const { y, m } = parseDate(date);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`;
}
