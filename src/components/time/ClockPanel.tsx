import clsx from 'clsx';
import { Coffee, FastForward, LogIn, LogOut, MapPin, PlayCircle } from 'lucide-react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DEPT_BY_ID } from '../../domain/catalog';
import { shiftIv } from '../../domain/scheduling';
import { allowedClockActions, calcTimecard, PUNCH_LABEL } from '../../domain/timecards';
import { fmtDate, fmtDuration, fmtLocalTime, fmtTime, localDateOf, tzAbbrev } from '../../domain/time';
import type { PunchType } from '../../domain/types';
import { employeeName, roleName, useFacilitiesById } from '../../store/hooks';
import { usePoise } from '../../store/store';
import { useRun } from '../../store/useRun';
import { Badge, Button, Card, Callout } from '../ui';

const ACTION_META: Record<PunchType, { icon: typeof LogIn; variant: 'primary' | 'secondary' | 'danger' }> = {
  in: { icon: LogIn, variant: 'primary' },
  break_start: { icon: Coffee, variant: 'secondary' },
  break_end: { icon: PlayCircle, variant: 'primary' },
  out: { icon: LogOut, variant: 'secondary' },
};

export function DemoClockControl({ compact }: { compact?: boolean }) {
  const advance = usePoise((s) => s.advanceClock);
  return (
    <div className={clsx('flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-silver-400 bg-canvas px-2.5 py-2', compact && 'py-1.5')}>
      <span className="mr-1 flex items-center gap-1 text-xs font-medium text-muted">
        <FastForward className="size-3.5" aria-hidden /> Demo clock
      </span>
      {[
        [15, '+15m'],
        [60, '+1h'],
        [240, '+4h'],
        [480, '+8h'],
      ].map(([m, l]) => (
        <Button key={l} size="xs" variant="ghost" className="border border-line bg-white" onClick={() => advance(m as number)}>
          {l}
        </Button>
      ))}
      {!compact && <span className="w-full text-[11px] text-subtle">Time is simulated in this prototype. Advancing the clock affects every screen.</span>}
    </div>
  );
}

export function ClockPanel({ employeeId, facilityId: facilityIdProp }: { employeeId: string; facilityId?: string }) {
  const { employees, timecards, shifts, nowIso, clockAction } = usePoise(
    useShallow((s) => ({ employees: s.employees, timecards: s.timecards, shifts: s.shifts, nowIso: s.demoNowIso, clockAction: s.clockAction })),
  );
  const facs = useFacilitiesById();
  const run = useRun();
  const emp = employees.find((e) => e.id === employeeId);
  const facilityId = facilityIdProp ?? emp?.primaryFacilityId ?? Object.keys(facs)[0];
  const f = facs[facilityId];
  const nowMs = Date.parse(nowIso);
  const today = localDateOf(nowMs, f.timeZone);

  const { open, todayCards, todayShift } = useMemo(() => {
    const mine = timecards.filter((t) => t.employeeId === employeeId);
    const withCalc = mine.map((t) => ({ t, c: calcTimecard(t, { timeZone: facs[t.facilityId].timeZone, nowMs }) }));
    const open = withCalc.find(({ t, c }) => t.status === 'open' && c.onClock) ?? null;
    const todayCards = withCalc.filter(({ t }) => t.workDate === today || t.id === open?.t.id).sort((a, b) => a.t.workDate.localeCompare(b.t.workDate));
    const todayShift = shifts
      .filter((s) => s.employeeId === employeeId && s.facilityId === facilityId)
      .map((s) => ({ s, iv: shiftIv(s, facs) }))
      .filter(({ s, iv }) => s.date === today || (iv.start <= nowMs && iv.end >= nowMs))
      .sort((a, b) => a.iv.start - b.iv.start)[0];
    return { open, todayCards, todayShift };
  }, [timecards, shifts, employeeId, facilityId, facs, nowMs, today]);

  if (!emp) return <Callout tone="warning" title="Employee not found" />;
  const actions = allowedClockActions(open?.c ?? null);
  const lastPunch = open?.c.punches.at(-1);
  const status = open ? (open.c.onBreak ? 'On break' : 'On the clock') : 'Off the clock';
  const elapsed = lastPunch ? Math.round((nowMs - Date.parse(lastPunch.at)) / 60000) : 0;
  const canClock = emp.status === 'active' || emp.status === 'offboarding';

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line bg-gradient-to-b from-brand-50/60 to-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] text-muted">{employeeName(emp)} · {roleName(emp.roleId)}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular text-ink">
              {fmtTime(nowMs, f.timeZone)} <span className="text-base font-medium text-muted">{tzAbbrev(nowMs, f.timeZone)}</span>
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              <MapPin className="size-3.5" aria-hidden />
              {f.name} · {DEPT_BY_ID[emp.departmentId].name} · {fmtDate(today, { weekday: true, year: true })} · Time zone {f.timeZone}
            </p>
          </div>
          <div className="text-right">
            <Badge tone={open ? (open.c.onBreak ? 'warning' : 'success') : 'neutral'} dot>
              {status}
            </Badge>
            {open && lastPunch && (
              <p className="mt-1.5 text-xs text-muted tabular">
                {open.c.onBreak ? 'Break started' : 'Since'} {fmtTime(lastPunch.at, f.timeZone)} · {fmtDuration(elapsed)}
              </p>
            )}
            {open && <p className="text-xs text-muted tabular">Worked so far {fmtDuration(open.c.workedMinutes + (open.c.onBreak ? 0 : elapsed))}</p>}
          </div>
        </div>
        {!canClock ? (
          <Callout tone="warning" className="mt-4" title="Clock not available">
            Clock actions are disabled while this worker's status is {emp.status}.
          </Callout>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {actions.map((a) => {
              const m = ACTION_META[a];
              return (
                <Button
                  key={a}
                  variant={m.variant}
                  icon={m.icon}
                  className="h-11 text-[15px] sm:min-w-36"
                  onClick={() => run(() => clockAction(employeeId, a, facilityId), { success: `${PUNCH_LABEL[a]} recorded`, successBody: `${fmtTime(nowMs, f.timeZone)} ${tzAbbrev(nowMs, f.timeZone)} · ${f.shortName}` })}
                >
                  {PUNCH_LABEL[a]}
                </Button>
              );
            })}
          </div>
        )}
      </div>
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Scheduled today</p>
          {todayShift ? (
            <p className="mt-1 text-[13.5px]">
              <span className="font-medium">
                {fmtLocalTime(todayShift.s.start)}–{fmtLocalTime(todayShift.s.end)}
                {todayShift.s.end <= todayShift.s.start && ' (+1 day)'}
              </span>{' '}
              · {roleName(todayShift.s.roleId)}
              <span className="block text-xs text-muted">Scheduled time is a plan only — worked time comes from punches.</span>
            </p>
          ) : (
            <p className="mt-1 text-[13px] text-muted">No shift scheduled. Clocking in records unscheduled work for manager review.</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Today's punches</p>
          {todayCards.flatMap(({ c }) => c.punches).length === 0 ? (
            <p className="mt-1 text-[13px] text-muted">No punches yet today.</p>
          ) : (
            <ul className="mt-1 space-y-0.5 text-[13px]">
              {todayCards.flatMap(({ c }) =>
                c.punches.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 tabular">
                    <span>{PUNCH_LABEL[p.type]}</span>
                    <span className="text-muted">
                      {fmtTime(p.at, f.timeZone)} {p.source !== 'clock' && <Badge className="ml-1">{p.source}</Badge>}
                    </span>
                  </li>
                )),
              )}
            </ul>
          )}
        </div>
        <div className="sm:col-span-2">
          <DemoClockControl />
        </div>
      </div>
    </Card>
  );
}
