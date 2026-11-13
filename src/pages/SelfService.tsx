import clsx from 'clsx';
import { CalendarDays, ChevronDown, ChevronRight, ClipboardList, Inbox, PencilLine } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { shiftIv } from '../domain/scheduling';
import { calcTimecard, PUNCH_LABEL } from '../domain/timecards';
import { addDays, fmtDate, fmtDateTime, fmtLocalTime, localDateOf, weekStartOf } from '../domain/time';
import type { NonWorkedCategory, Timecard } from '../domain/types';
import { TaskStatusBadge, TimecardStatusBadge } from '../components/status';
import { ClockPanel } from '../components/time/ClockPanel';
import { CorrectionForm } from '../components/time/CorrectionForm';
import { ActualRange, hoursText } from '../components/time/format';
import { Badge, Button, Callout, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Textarea } from '../components/ui';
import { roleName, useFacilitiesById, useUser } from '../store/hooks';
import { usePoise } from '../store/store';
import { useRun } from '../store/useRun';

type Tab = 'home' | 'schedule' | 'time' | 'requests';

function useMe() {
  const user = useUser();
  const emp = usePoise((s) => s.employees.find((e) => e.id === user.employeeId));
  return { user, emp };
}

export default function SelfServicePage({ tab }: { tab: Tab }) {
  const { emp } = useMe();
  if (!emp) return <EmptyState title="No employee record linked to this demo user" />;
  return (
    <div className="space-y-4">
      {tab === 'home' && <Home employeeId={emp.id} />}
      {tab === 'schedule' && <Schedule employeeId={emp.id} />}
      {tab === 'time' && <Timecards employeeId={emp.id} />}
      {tab === 'requests' && <Requests employeeId={emp.id} />}
    </div>
  );
}

function useUpcoming(employeeId: string, days: number) {
  const { shifts, scheduleWeeks, nowIso } = usePoise(useShallow((s) => ({ shifts: s.shifts, scheduleWeeks: s.scheduleWeeks, nowIso: s.demoNowIso })));
  const facs = useFacilitiesById();
  return useMemo(() => {
    const nowMs = Date.parse(nowIso);
    const mine = shifts.filter((s) => s.employeeId === employeeId);
    const tz = facs[mine[0]?.facilityId ?? Object.keys(facs)[0]].timeZone;
    const today = localDateOf(nowMs, tz);
    const end = addDays(today, days);
    const published = (facilityId: string, date: string) => scheduleWeeks.find((w) => w.id === `${facilityId}:${weekStartOf(date)}`)?.status === 'published';
    const window = mine.filter((s) => s.date >= today && s.date <= end && shiftIv(s, facs).end > nowMs).sort((a, b) => shiftIv(a, facs).start - shiftIv(b, facs).start);
    return { visible: window.filter((s) => published(s.facilityId, s.date)), hiddenDraft: window.filter((s) => !published(s.facilityId, s.date)).length, today };
  }, [shifts, scheduleWeeks, nowIso, employeeId, facs, days]);
}

function Home({ employeeId }: { employeeId: string }) {
  const { emp, user } = useMe();
  const { corrections, timeOff, workflows } = usePoise(useShallow((s) => ({ corrections: s.corrections, timeOff: s.timeOff, workflows: s.workflows })));
  const facs = useFacilitiesById();
  const { visible } = useUpcoming(employeeId, 21);
  const next = visible[0];
  const pendingCorr = corrections.filter((c) => c.employeeId === employeeId && c.status === 'pending').length;
  const pendingTO = timeOff.filter((t) => t.employeeId === employeeId && t.status === 'pending').length;
  const wf = workflows.find((w) => w.employeeId === employeeId && w.status === 'in_progress' && w.kind === 'onboarding');
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Hi, {user.name.split(' ')[0]}</h1>
        <p className="text-[13px] text-muted">Your clock, schedule and requests. Managers see your actions in their queues.</p>
      </div>
      <ClockPanel employeeId={employeeId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Next shift</p>
          {next ? (
            <>
              <p className="mt-1 text-lg font-semibold">{fmtDate(next.date, { weekday: true })}</p>
              <p className="text-[13px] text-muted">
                {fmtLocalTime(next.start)}–{fmtLocalTime(next.end)}
                {next.end <= next.start && ' (+1 day)'} · {roleName(next.roleId)} · {facs[next.facilityId].shortName}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[13px] text-muted">No upcoming published shifts.</p>
          )}
          <Link to="/me/schedule" className="link mt-2 inline-block text-[13px]">
            View schedule
          </Link>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Your requests</p>
          <ul className="mt-1.5 space-y-1 text-[13px]">
            <li className="flex justify-between">
              Correction requests pending <Badge tone={pendingCorr ? 'warning' : 'neutral'}>{pendingCorr}</Badge>
            </li>
            <li className="flex justify-between">
              Time-off requests pending <Badge tone={pendingTO ? 'warning' : 'neutral'}>{pendingTO}</Badge>
            </li>
          </ul>
          <Link to="/me/requests" className="link mt-2 inline-block text-[13px]">
            Manage requests
          </Link>
        </Card>
      </div>
      {wf && emp && (
        <Card>
          <CardHeader title="Your onboarding checklist" subtitle={`First shift ${fmtDate(wf.effectiveDate, { weekday: true })}. HR and your manager complete most items.`} />
          <ul className="divide-y divide-line">
            {wf.tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
                <span>
                  {t.title}
                  <span className="block text-xs text-muted">Owner: {t.ownerName} · due {fmtDate(t.dueDate)}</span>
                </span>
                <TaskStatusBadge status={t.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Schedule({ employeeId }: { employeeId: string }) {
  const { visible, hiddenDraft } = useUpcoming(employeeId, 21);
  const facs = useFacilitiesById();
  const byWeek = new Map<string, typeof visible>();
  for (const s of visible) byWeek.set(weekStartOf(s.date), [...(byWeek.get(weekStartOf(s.date)) ?? []), s]);
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">My schedule</h1>
        <p className="text-[13px] text-muted">Published shifts for the next 3 weeks.</p>
      </div>
      {hiddenDraft > 0 && <Callout tone="neutral">{hiddenDraft} shift(s) are in a draft schedule and will appear once your manager publishes it.</Callout>}
      {visible.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarDays} title="No upcoming published shifts" />
        </Card>
      ) : (
        [...byWeek.entries()].map(([week, list]) => (
          <Card key={week}>
            <CardHeader title={`Week of ${fmtDate(week, { year: true })}`} subtitle={`${list.length} shift${list.length === 1 ? '' : 's'} · ${hoursText(list.reduce((s, x) => s + (shiftIv(x, facs).end - shiftIv(x, facs).start) / 60000 - x.unpaidBreakMinutes, 0))} scheduled hours (not worked time)`} />
            <ul className="divide-y divide-line">
              {list.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div>
                    <p className="text-[13.5px] font-medium">{fmtDate(s.date, { weekday: true })}</p>
                    <p className="text-xs text-muted">
                      {roleName(s.roleId)} · {facs[s.facilityId].shortName}
                      {s.notes ? ` · ${s.notes}` : ''}
                    </p>
                  </div>
                  <span className="text-[13px] tabular">
                    {fmtLocalTime(s.start)}–{fmtLocalTime(s.end)}
                    {s.end <= s.start && <span className="text-xs text-info-600"> +1</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </>
  );
}

function Timecards({ employeeId }: { employeeId: string }) {
  const { timecards, shifts, corrections, nonWorked, nowIso } = usePoise(useShallow((s) => ({ timecards: s.timecards, shifts: s.shifts, corrections: s.corrections, nonWorked: s.nonWorked, nowIso: s.demoNowIso })));
  const facs = useFacilitiesById();
  const [open, setOpen] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<Timecard | null>(null);
  const rows = useMemo(() => {
    const nowMs = Date.parse(nowIso);
    const tz = facs[timecards.find((t) => t.employeeId === employeeId)?.facilityId ?? Object.keys(facs)[0]].timeZone;
    const since = addDays(localDateOf(nowMs, tz), -21);
    return timecards
      .filter((t) => t.employeeId === employeeId && t.workDate >= since)
      .sort((a, b) => b.workDate.localeCompare(a.workDate))
      .map((tc) => ({ tc, calc: calcTimecard(tc, { timeZone: facs[tc.facilityId].timeZone, nowMs, shift: shifts.find((s) => s.id === tc.shiftId), pendingCorrections: corrections }) }));
  }, [timecards, shifts, corrections, nowIso, employeeId, facs]);
  const leave = nonWorked.filter((n) => n.employeeId === employeeId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const total = rows.reduce((s, r) => s + r.calc.workedMinutes, 0);
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">My timecards</h1>
        <p className="text-[13px] text-muted">Last 3 weeks · {hoursText(total)} worked hours. Tap a day to see punches or request a correction.</p>
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Inbox} title="No timecards yet" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ tc, calc }) => {
              const tz = facs[tc.facilityId].timeZone;
              const pending = corrections.some((c) => c.timecardId === tc.id && c.status === 'pending');
              const isOpen = open === tc.id;
              return (
                <li key={tc.id}>
                  <button onClick={() => setOpen(isOpen ? null : tc.id)} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-canvas">
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium">{fmtDate(tc.workDate, { weekday: true })}</span>
                      <span className="block text-xs text-muted">
                        <ActualRange calc={calc} tc={tc} tz={tz} /> · {roleName(tc.roleId)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-right">
                        <span className="block font-semibold tabular">{hoursText(calc.workedMinutes)}h</span>
                        {calc.exceptions.some((e) => e.severity === 'blocking') ? <Badge tone="danger">{calc.exceptions.find((e) => e.severity === 'blocking')!.label}</Badge> : <TimecardStatusBadge status={tc.status} />}
                      </span>
                      {isOpen ? <ChevronDown className="size-4 text-muted" /> : <ChevronRight className="size-4 text-muted" />}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="bg-canvas/60 px-4 pb-3">
                      <ul className="space-y-0.5 py-2 text-[13px]">
                        {[...tc.punches]
                          .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
                          .map((p) => (
                            <li key={p.id} className={clsx('flex justify-between tabular', p.supersededBy && 'text-subtle line-through')}>
                              <span>
                                {PUNCH_LABEL[p.type]} {p.correctionId && <Badge tone="brand">corrected</Badge>}
                              </span>
                              <span>{fmtDateTime(p.at, tz)}</span>
                            </li>
                          ))}
                      </ul>
                      <p className="text-xs text-muted">Breaks: {calc.breakMinutes ? `${calc.breakMinutes}m` : 'none recorded'}</p>
                      {pending ? (
                        <Badge tone="warning" className="mt-2">Correction request pending</Badge>
                      ) : tc.status === 'approved' ? (
                        <p className="mt-2 text-xs text-muted">Approved by {tc.approvedBy}. Ask your manager to reopen it if something is wrong.</p>
                      ) : (
                        !calc.onClock && (
                          <Button size="sm" icon={PencilLine} className="mt-2" onClick={() => setCorrecting(tc)}>
                            Request correction
                          </Button>
                        )
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {leave.length > 0 && (
        <Card>
          <CardHeader title="Paid leave" subtitle="Nonworked time is tracked separately from worked hours." />
          <ul className="divide-y divide-line">
            {leave.map((n) => (
              <li key={n.id} className="flex justify-between px-4 py-2 text-[13px]">
                <span>{fmtDate(n.date, { weekday: true })} · {n.category}</span>
                <span className="tabular">{n.hours.toFixed(2)}h</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Modal open={!!correcting} onClose={() => setCorrecting(null)} title="Request a correction" description={correcting ? fmtDate(correcting.workDate, { weekday: true, year: true }) : undefined} size="lg">
        {correcting && <CorrectionForm timecard={correcting} mode="request" onCancel={() => setCorrecting(null)} onDone={() => setCorrecting(null)} />}
      </Modal>
    </>
  );
}

function Requests({ employeeId }: { employeeId: string }) {
  const { timeOff, corrections, timecards, requestTimeOff, nowIso } = usePoise(useShallow((s) => ({ timeOff: s.timeOff, corrections: s.corrections, timecards: s.timecards, requestTimeOff: s.requestTimeOff, nowIso: s.demoNowIso })));
  const facs = useFacilitiesById();
  const emp = usePoise((s) => s.employees.find((e) => e.id === employeeId))!;
  const tz = facs[emp.primaryFacilityId].timeZone;
  const today = localDateOf(nowIso, tz);
  const run = useRun();
  const [form, setForm] = useState({ startDate: addDays(today, 14), endDate: addDays(today, 14), category: 'PTO' as NonWorkedCategory, hoursPerDay: 7.5, note: '' });
  const myTO = timeOff.filter((t) => t.employeeId === employeeId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const myCorr = corrections.filter((c) => c.employeeId === employeeId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const tone = (s: string) => (s === 'approved' ? 'success' : s === 'pending' ? 'warning' : 'danger') as 'success' | 'warning' | 'danger';
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Requests</h1>
        <p className="text-[13px] text-muted">Time off and timecard corrections. Requests go to your manager's queue in Time &amp; Attendance.</p>
      </div>
      <Card>
        <CardHeader title="Request time off" />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="to-start">
            <Input id="to-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })} />
          </Field>
          <Field label="End date" htmlFor="to-end">
            <Input id="to-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
          <Field label="Type" htmlFor="to-cat">
            <Select id="to-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as NonWorkedCategory })}>
              {(['PTO', 'Sick', 'Bereavement', 'Unpaid'] as NonWorkedCategory[]).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Hours per day" htmlFor="to-hours">
            <Input id="to-hours" type="number" step="0.25" min="0" max="12" value={form.hoursPerDay} onChange={(e) => setForm({ ...form, hoursPerDay: Number(e.target.value) })} />
          </Field>
          <Field label="Note (optional)" className="sm:col-span-2" htmlFor="to-note">
            <Textarea id="to-note" className="min-h-[56px]" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <p className="text-xs text-muted">Paid leave is not worked time and is never reported as PBJ hours.</p>
            <Button
              variant="primary"
              onClick={() => {
                const r = run(() => requestTimeOff({ employeeId, ...form, note: form.note || undefined }), { success: 'Time-off request submitted', successBody: 'Your manager will see it in their queue.' });
                if (r.ok) setForm({ ...form, note: '' });
              }}
            >
              Submit request
            </Button>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="My time-off requests" />
        {myTO.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No time-off requests" />
        ) : (
          <ul className="divide-y divide-line">
            {myTO.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                <span>
                  <span className="font-medium">
                    {fmtDate(t.startDate, { weekday: true })}
                    {t.endDate !== t.startDate && ` – ${fmtDate(t.endDate, { weekday: true })}`}
                  </span>
                  <span className="block text-xs text-muted">
                    {t.category} · {t.hoursPerDay}h/day{t.note ? ` · ${t.note}` : ''}
                  </span>
                </span>
                <Badge tone={tone(t.status)}>{t.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="My correction requests" subtitle="Submit new requests from Timecards." />
        {myCorr.length === 0 ? (
          <EmptyState icon={PencilLine} title="No correction requests" />
        ) : (
          <ul className="divide-y divide-line">
            {myCorr.map((c) => {
              const tc = timecards.find((t) => t.id === c.timecardId);
              return (
                <li key={c.id} className="px-4 py-2.5 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{tc ? fmtDate(tc.workDate, { weekday: true }) : c.timecardId}</span>
                    <Badge tone={tone(c.status)}>{c.status}</Badge>
                  </div>
                  <ul className="mt-0.5 text-xs text-muted tabular">
                    {c.changes.map((ch, i) => (
                      <li key={i}>
                        {PUNCH_LABEL[ch.punchType]}: {ch.originalAt ? fmtDateTime(ch.originalAt, tz) : 'missing'} → {fmtDateTime(ch.correctedAt, tz)}
                      </li>
                    ))}
                  </ul>
                  {c.reviewerNote && <p className="mt-0.5 text-xs text-muted">Reviewer: {c.reviewerNote}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
