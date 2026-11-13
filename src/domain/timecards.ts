/**
 * Timecard calculations. Pure functions — no store access.
 *
 * Worked time = time between an in punch and its out punch, minus recorded breaks.
 * Scheduled time never becomes worked time; a timecard only has worked minutes when it
 * has punches.
 */
import type { CorrectionRequest, Punch, Shift, Timecard } from './types';
import { shiftInterval, splitByLocalDay, type Interval } from './time';

export const MISSING_PUNCH_AFTER_MINUTES = 16 * 60;
export const VARIANCE_TOLERANCE_MINUTES = 7;
export const BREAK_REQUIRED_AFTER_MINUTES = 6 * 60;
export const MIN_MEAL_BREAK_MINUTES = 30;

export type TimecardExceptionCode =
  | 'missing_out'
  | 'missing_in'
  | 'open_break'
  | 'unscheduled'
  | 'early_in'
  | 'late_in'
  | 'early_out'
  | 'late_out'
  | 'short_break'
  | 'no_break'
  | 'long_shift'
  | 'pending_correction';

export interface TimecardException {
  code: TimecardExceptionCode;
  label: string;
  severity: 'blocking' | 'review';
  detail?: string;
}

export interface TimecardCalc {
  punches: Punch[]; // effective punches, sorted
  firstIn: number | null;
  lastOut: number | null;
  workedMinutes: number;
  breakMinutes: number;
  workedIntervals: Interval[];
  onClock: boolean;
  onBreak: boolean;
  scheduledMinutes: number;
  varianceMinutes: number | null; // worked - scheduled paid minutes
  startVarianceMinutes: number | null;
  endVarianceMinutes: number | null;
  exceptions: TimecardException[];
}

export function effectivePunches(tc: Timecard): Punch[] {
  return tc.punches.filter((p) => !p.supersededBy).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function scheduledPaidMinutes(shift: Shift, timeZone: string): number {
  const iv = shiftInterval(shift, timeZone);
  return Math.round((iv.end - iv.start) / 60000) - shift.unpaidBreakMinutes;
}

/**
 * Walk the effective punches as a state machine and compute worked intervals.
 * `nowMs` is the demo clock and is only used to decide whether an open shift is still
 * in progress (on the clock) or should be treated as a missing punch.
 */
export function calcTimecard(
  tc: Timecard,
  opts: { timeZone: string; nowMs: number; shift?: Shift | null; pendingCorrections?: CorrectionRequest[] },
): TimecardCalc {
  const punches = effectivePunches(tc);
  const exceptions: TimecardException[] = [];
  const worked: Interval[] = [];
  let breakMinutes = 0;
  let inAt: number | null = null;
  let breakAt: number | null = null;
  let firstIn: number | null = null;
  let lastOut: number | null = null;
  let missingIn = false;

  for (const p of punches) {
    const t = Date.parse(p.at);
    switch (p.type) {
      case 'in':
        if (inAt === null) {
          inAt = t;
          if (firstIn === null) firstIn = t;
        }
        break;
      case 'break_start':
        if (inAt !== null && breakAt === null) {
          worked.push({ start: inAt, end: t });
          breakAt = t;
          inAt = null;
        }
        break;
      case 'break_end':
        if (breakAt !== null) {
          breakMinutes += Math.round((t - breakAt) / 60000);
          breakAt = null;
          inAt = t;
        }
        break;
      case 'out':
        if (inAt !== null) {
          worked.push({ start: inAt, end: t });
          inAt = null;
          lastOut = t;
        } else if (breakAt !== null) {
          // Clocked out while on break: break ends at out; time after break start is not worked.
          breakMinutes += Math.round((t - breakAt) / 60000);
          breakAt = null;
          lastOut = t;
        } else {
          missingIn = true;
          lastOut = t;
        }
        break;
    }
  }

  const openStart = inAt ?? breakAt;
  const openSince = firstIn ?? openStart;
  let onClock = false;
  let onBreak = false;
  if (openStart !== null) {
    const elapsed = opts.nowMs - (openSince ?? openStart);
    if (elapsed <= MISSING_PUNCH_AFTER_MINUTES * 60000 && tc.status === 'open') {
      onClock = true;
      onBreak = breakAt !== null;
    } else {
      exceptions.push({
        code: breakAt !== null ? 'open_break' : 'missing_out',
        label: breakAt !== null ? 'Break not ended' : 'Missing clock-out',
        severity: 'blocking',
        detail: 'Hours after the last punch are not counted until a correction is approved.',
      });
    }
  }
  if (missingIn) exceptions.push({ code: 'missing_in', label: 'Missing clock-in', severity: 'blocking' });

  const workedMinutes = worked.reduce((s, iv) => s + Math.round((iv.end - iv.start) / 60000), 0);

  let scheduledMinutes = 0;
  let varianceMinutes: number | null = null;
  let startVar: number | null = null;
  let endVar: number | null = null;
  if (opts.shift) {
    const iv = shiftInterval(opts.shift, opts.timeZone);
    scheduledMinutes = scheduledPaidMinutes(opts.shift, opts.timeZone);
    if (firstIn !== null) {
      startVar = Math.round((firstIn - iv.start) / 60000);
      if (startVar < -VARIANCE_TOLERANCE_MINUTES)
        exceptions.push({ code: 'early_in', label: `Early in (${-startVar}m)`, severity: 'review' });
      if (startVar > VARIANCE_TOLERANCE_MINUTES)
        exceptions.push({ code: 'late_in', label: `Late in (${startVar}m)`, severity: 'review' });
    }
    if (lastOut !== null && !onClock) {
      endVar = Math.round((lastOut - iv.end) / 60000);
      if (endVar < -VARIANCE_TOLERANCE_MINUTES)
        exceptions.push({ code: 'early_out', label: `Early out (${-endVar}m)`, severity: 'review' });
      if (endVar > VARIANCE_TOLERANCE_MINUTES)
        exceptions.push({ code: 'late_out', label: `Late out (${endVar}m)`, severity: 'review' });
    }
    if (!onClock && lastOut !== null) varianceMinutes = workedMinutes - scheduledMinutes;
  } else if (punches.length > 0) {
    exceptions.push({
      code: 'unscheduled',
      label: 'Unscheduled work',
      severity: 'review',
      detail: 'No scheduled shift matched these punches.',
    });
  }

  if (!onClock && workedMinutes > BREAK_REQUIRED_AFTER_MINUTES) {
    if (breakMinutes === 0)
      exceptions.push({ code: 'no_break', label: 'No meal break recorded', severity: 'review' });
    else if (breakMinutes < MIN_MEAL_BREAK_MINUTES)
      exceptions.push({ code: 'short_break', label: `Short break (${breakMinutes}m)`, severity: 'review' });
  }
  if (workedMinutes > 16 * 60) exceptions.push({ code: 'long_shift', label: 'Over 16 worked hours', severity: 'review' });

  const pending = (opts.pendingCorrections ?? []).filter((c) => c.timecardId === tc.id && c.status === 'pending');
  if (pending.length)
    exceptions.push({ code: 'pending_correction', label: 'Correction requested', severity: 'blocking' });

  return {
    punches,
    firstIn,
    lastOut,
    workedMinutes,
    breakMinutes,
    workedIntervals: worked,
    onClock,
    onBreak,
    scheduledMinutes,
    varianceMinutes,
    startVarianceMinutes: startVar,
    endVarianceMinutes: endVar,
    exceptions,
  };
}

/** Worked minutes split by facility-local calendar day (midnight cutoff). */
export function workedMinutesByDay(calc: TimecardCalc, timeZone: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const iv of calc.workedIntervals) {
    for (const seg of splitByLocalDay(iv, timeZone)) out.set(seg.date, (out.get(seg.date) ?? 0) + seg.minutes);
  }
  return out;
}

export function isBlocking(calc: TimecardCalc): boolean {
  return calc.exceptions.some((e) => e.severity === 'blocking');
}

/** A timecard can be approved when it has no blocking exceptions and is not on the clock. */
export function canApprove(tc: Timecard, calc: TimecardCalc): { ok: boolean; reason?: string } {
  if (tc.status === 'approved') return { ok: false, reason: 'Already approved.' };
  if (calc.onClock) return { ok: false, reason: 'Employee is still on the clock.' };
  if (calc.punches.length === 0) return { ok: false, reason: 'No punches recorded.' };
  const blocking = calc.exceptions.filter((e) => e.severity === 'blocking');
  if (blocking.length) return { ok: false, reason: `Resolve first: ${blocking.map((b) => b.label).join(', ')}.` };
  return { ok: true };
}

export const PUNCH_LABEL: Record<Punch['type'], string> = {
  in: 'Clock in',
  out: 'Clock out',
  break_start: 'Break start',
  break_end: 'Break end',
};

/** Next allowed clock actions given the current effective punches. */
export function allowedClockActions(calc: TimecardCalc | null): Punch['type'][] {
  if (!calc || (!calc.onClock && calc.punches.length === 0)) return ['in'];
  if (calc.onBreak) return ['break_end'];
  if (calc.onClock) return ['break_start', 'out'];
  return ['in'];
}
