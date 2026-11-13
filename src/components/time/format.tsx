import { fmtDuration, fmtLocalTime, fmtTime, localDateOf } from '../../domain/time';
import type { TimecardCalc } from '../../domain/timecards';
import type { Shift, Timecard } from '../../domain/types';

export function NextDay() {
  return <sup className="ml-0.5 text-[10px] font-semibold text-info-600" title="Next calendar day">+1</sup>;
}

export function ScheduledRange({ shift }: { shift: Shift | undefined }) {
  if (!shift) return <span className="text-subtle">Unscheduled</span>;
  return (
    <span className="tabular">
      {fmtLocalTime(shift.start)}–{fmtLocalTime(shift.end)}
      {shift.end <= shift.start && <NextDay />}
    </span>
  );
}

export function ActualRange({ calc, tc, tz }: { calc: TimecardCalc; tc: Timecard; tz: string }) {
  if (calc.firstIn === null && calc.lastOut === null) return <span className="text-subtle">—</span>;
  const nextDay = (ms: number) => localDateOf(ms, tz) > tc.workDate;
  return (
    <span className="tabular">
      {calc.firstIn !== null ? fmtTime(calc.firstIn, tz) : <span className="text-danger-700">no in</span>}
      {calc.firstIn !== null && nextDay(calc.firstIn) && <NextDay />}–
      {calc.onClock ? (
        <span className="text-ok-700">on clock</span>
      ) : calc.lastOut !== null && !calc.exceptions.some((e) => e.code === 'missing_out' || e.code === 'open_break') ? (
        <>
          {fmtTime(calc.lastOut, tz)}
          {nextDay(calc.lastOut) && <NextDay />}
        </>
      ) : (
        <span className="text-danger-700">missing</span>
      )}
    </span>
  );
}

export function hoursText(min: number): string {
  return (min / 60).toFixed(2);
}

export function varianceText(v: number | null): { text: string; tone: string } {
  if (v === null) return { text: '—', tone: 'text-subtle' };
  if (Math.abs(v) <= 7) return { text: v === 0 ? '0m' : `${v > 0 ? '+' : ''}${fmtDuration(v)}`, tone: 'text-muted' };
  return { text: `${v > 0 ? '+' : ''}${fmtDuration(v)}`, tone: v > 0 ? 'text-warn-700' : 'text-info-600' };
}
