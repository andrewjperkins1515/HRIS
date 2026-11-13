import clsx from 'clsx';
import { CalendarOff, CheckCheck, ClipboardCheck, History, Inbox, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { DEPARTMENTS, DEPT_BY_ID } from '../domain/catalog';
import { canApprove, PUNCH_LABEL } from '../domain/timecards';
import { addDays, fmtDate, fmtDateTime, weekStartOf } from '../domain/time';
import type { DepartmentId, TimecardStatus } from '../domain/types';
import { TimecardStatusBadge } from '../components/status';
import { ActualRange, hoursText, ScheduledRange, varianceText } from '../components/time/format';
import { TimecardDrawer } from '../components/time/TimecardDrawer';
import { Badge, Button, Callout, Card, Checkbox, ConfirmDialog, EmptyState, Field, Input, PageHeader, SearchInput, Select, Stat, TableWrap, Tabs, Textarea } from '../components/ui';
import { employeeName, roleName, useCan, useEmployeesById, useFacilitiesById, useScopedFacilities, useTimecardRows, useToday, useUser, type TimecardRow } from '../store/hooks';
import { usePoise } from '../store/store';
import { useRun } from '../store/useRun';

type View = 'all' | 'pending' | 'exceptions' | 'corrections' | 'unscheduled' | 'breaks' | 'time_off' | 'audit';

export default function TimePage() {
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || 'all';
  const tcParam = params.get('tc');
  const today = useToday();
  const user = useUser();
  const facilities = useScopedFacilities();
  const facs = useFacilitiesById();
  const canApproveP = useCan('time.approve');
  const { corrections, timeOff, approveTimecards } = usePoise(useShallow((s) => ({ corrections: s.corrections, timeOff: s.timeOff, approveTimecards: s.approveTimecards })));

  const [from, setFrom] = useState(addDays(weekStartOf(today), -7));
  const [to, setTo] = useState(today);
  const [dept, setDept] = useState<'all' | DepartmentId>('all');
  const [status, setStatus] = useState<'all' | TimecardStatus>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [limit, setLimit] = useState(150);

  const rows = useTimecardRows();
  const inRange = useMemo(() => rows.filter((r) => r.tc.workDate >= from && r.tc.workDate <= to), [rows, from, to]);
  const isMissing = (r: TimecardRow) => r.calc.exceptions.some((e) => e.code === 'missing_out' || e.code === 'missing_in' || e.code === 'open_break');
  const isBreak = (r: TimecardRow) => !r.tc.breakReviewed && r.calc.exceptions.some((e) => e.code === 'no_break' || e.code === 'short_break');
  const isUnsched = (r: TimecardRow) => r.calc.exceptions.some((e) => e.code === 'unscheduled');
  const hasException = (r: TimecardRow) => r.calc.exceptions.length > 0 && !(r.calc.exceptions.length === 1 && r.calc.exceptions[0].code === 'unscheduled' && r.tc.status === 'approved');

  const scopedTcIds = useMemo(() => new Set(rows.map((r) => r.tc.id)), [rows]);
  const pendingCorr = corrections.filter((c) => c.status === 'pending' && scopedTcIds.has(c.timecardId));
  const emps = useEmployeesById();
  const scopedEmpIds = new Set(Object.values(emps).filter((e) => facilities.some((f) => f.id === e.primaryFacilityId || e.additionalFacilityIds.includes(f.id)) && (!user.departmentIds || user.departmentIds.includes(e.departmentId))).map((e) => e.id));
  const pendingTO = timeOff.filter((t) => t.status === 'pending' && scopedEmpIds.has(t.employeeId));

  const counts = {
    all: inRange.length,
    pending: inRange.filter((r) => r.tc.status === 'pending_approval').length,
    exceptions: rows.filter((r) => r.tc.status !== 'approved' && hasException(r)).length,
    corrections: pendingCorr.length,
    unscheduled: inRange.filter((r) => isUnsched(r) && r.tc.status !== 'approved').length,
    breaks: inRange.filter((r) => isBreak(r)).length,
    time_off: pendingTO.length,
  };

  const listRows = useMemo(() => {
    let base: TimecardRow[];
    switch (view) {
      case 'pending':
        base = inRange.filter((r) => r.tc.status === 'pending_approval');
        break;
      case 'exceptions':
        base = rows.filter((r) => r.tc.status !== 'approved' && hasException(r));
        break;
      case 'unscheduled':
        base = inRange.filter((r) => isUnsched(r) && r.tc.status !== 'approved');
        break;
      case 'breaks':
        base = inRange.filter(isBreak);
        break;
      default:
        base = inRange;
    }
    const needle = q.trim().toLowerCase();
    return base
      .filter((r) => (dept === 'all' || r.tc.departmentId === dept) && (status === 'all' || r.tc.status === status) && (!needle || employeeName(r.employee).toLowerCase().includes(needle)))
      .sort((a, b) => {
        const am = isMissing(a) ? 0 : 1;
        const bm = isMissing(b) ? 0 : 1;
        return am - bm || b.tc.workDate.localeCompare(a.tc.workDate) || employeeName(a.employee).localeCompare(employeeName(b.employee));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, rows, inRange, dept, status, q]);

  const approvable = listRows.filter((r) => canApprove(r.tc, r.calc).ok);
  const selectedRows = listRows.filter((r) => selected.has(r.tc.id));
  const bulkTargets = selectedRows.length ? selectedRows : approvable;

  const setView = (v: View) => {
    const next = new URLSearchParams(params);
    next.set('view', v);
    next.delete('tc');
    setParams(next);
    setSelected(new Set());
  };
  const openTc = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('tc', id);
    else next.delete('tc');
    setParams(next);
  };

  const workedTotal = listRows.reduce((s, r) => s + r.calc.workedMinutes, 0);
  const multiFacility = facilities.length > 1;

  return (
    <div>
      <PageHeader
        title="Time & Attendance"
        description="Review punches, resolve exceptions and approve timecards. Original punches are preserved; every correction records a reason, reviewer and before/after values."
        actions={
          <Link to="/time/clock">
            <Button icon={Timer}>Open timeclock kiosk</Button>
          </Link>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Missing punches" value={rows.filter((r) => isMissing(r)).length} tone={rows.some(isMissing) ? 'danger' : 'success'} sub="Block approval" />
        <Stat label="Pending approval" value={rows.filter((r) => r.tc.status === 'pending_approval').length} tone="info" sub="All dates in scope" />
        <Stat label="Correction requests" value={pendingCorr.length} tone={pendingCorr.length ? 'warning' : 'neutral'} sub="Awaiting review" />
        <Stat label="On the clock now" value={rows.filter((r) => r.calc.onClock).length} sub={facilities.map((f) => f.shortName).join(', ')} />
      </div>

      <Callout tone="info" className="mb-4">
        <strong>Scheduled hours never become worked or PBJ hours automatically.</strong> Worked time comes from punches only. Approving a timecard makes it eligible for PBJ preparation; reopening removes eligibility. Paid leave is tracked separately as nonworked time.
      </Callout>

      <Tabs<View>
        value={view}
        onChange={setView}
        tabs={[
          { value: 'all', label: 'Timecards', count: counts.all },
          { value: 'pending', label: 'Pending approval', count: counts.pending },
          { value: 'exceptions', label: 'Exceptions', count: counts.exceptions },
          { value: 'corrections', label: 'Correction requests', count: counts.corrections },
          { value: 'unscheduled', label: 'Unscheduled work', count: counts.unscheduled },
          { value: 'breaks', label: 'Break review', count: counts.breaks },
          { value: 'time_off', label: 'Time off', count: counts.time_off },
          { value: 'audit', label: 'Audit history' },
        ]}
      />

      <div className="mt-4">
        {view === 'corrections' ? (
          <CorrectionsQueue scopedTcIds={scopedTcIds} onOpen={openTc} />
        ) : view === 'time_off' ? (
          <TimeOffQueue scopedEmpIds={scopedEmpIds} />
        ) : view === 'audit' ? (
          <AuditView facilityIds={facilities.map((f) => f.id)} />
        ) : (
          <Card>
            <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
              <SearchInput value={q} onChange={setQ} placeholder="Search employee" className="w-full sm:w-56" />
              <Field label="From" htmlFor="tc-from">
                <Input id="tc-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              </Field>
              <Field label="To" htmlFor="tc-to">
                <Input id="tc-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
              </Field>
              <Field label="Department" htmlFor="tc-dept">
                <Select id="tc-dept" value={dept} onChange={(e) => setDept(e.target.value as DepartmentId | 'all')} className="w-48">
                  <option value="all">All departments</option>
                  {DEPARTMENTS.filter((d) => !user.departmentIds || user.departmentIds.includes(d.id)).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status" htmlFor="tc-status">
                <Select id="tc-status" value={status} onChange={(e) => setStatus(e.target.value as TimecardStatus | 'all')} className="w-44">
                  <option value="all">All statuses</option>
                  <option value="open">Open</option>
                  <option value="pending_approval">Pending approval</option>
                  <option value="approved">Approved</option>
                </Select>
              </Field>
              {canApproveP && (
                <Button variant="primary" icon={CheckCheck} className="ml-auto" disabled={bulkTargets.length === 0} onClick={() => setConfirmBulk(true)}>
                  {selectedRows.length ? `Approve selected (${selectedRows.length})` : `Approve clean timecards (${approvable.length})`}
                </Button>
              )}
            </div>
            {view === 'exceptions' && <p className="border-b border-line px-4 py-2 text-xs text-muted">Shows all unapproved timecards with exceptions, regardless of date range.</p>}
            {listRows.length === 0 ? (
              <EmptyState icon={Inbox} title="No timecards match" body="Adjust the date range, department or status filters." />
            ) : (
              <>
                <TableWrap maxHeight="62vh">
                  <thead>
                    <tr>
                      {canApproveP && (
                        <th className="th w-8">
                          <span className="sr-only">Select</span>
                        </th>
                      )}
                      <th className="th">Employee</th>
                      <th className="th">Date</th>
                      <th className="th">Role</th>
                      <th className="th">Scheduled</th>
                      <th className="th">Actual (facility time)</th>
                      <th className="th text-right">Worked</th>
                      <th className="th text-right">Break</th>
                      <th className="th text-right">Variance</th>
                      <th className="th">Exceptions</th>
                      <th className="th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listRows.slice(0, limit).map((r) => {
                      const v = varianceText(r.calc.varianceMinutes);
                      const ok = canApprove(r.tc, r.calc).ok;
                      return (
                        <tr key={r.tc.id} className={clsx('cursor-pointer hover:bg-canvas', tcParam === r.tc.id && 'bg-brand-50/60')} onClick={() => openTc(r.tc.id)}>
                          {canApproveP && (
                            <td className="td" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selected.has(r.tc.id)}
                                disabled={!ok}
                                onChange={(c) => {
                                  const n = new Set(selected);
                                  if (c) n.add(r.tc.id);
                                  else n.delete(r.tc.id);
                                  setSelected(n);
                                }}
                                label={<span className="sr-only">Select {employeeName(r.employee)}</span>}
                              />
                            </td>
                          )}
                          <td className="td">
                            <button className="text-left font-medium text-ink hover:text-brand-700" onClick={(e) => { e.stopPropagation(); openTc(r.tc.id); }}>
                              {employeeName(r.employee)}
                            </button>
                            {r.employee && r.employee.workerType !== 'employee' && <Badge tone="mint" className="ml-1.5">{r.employee.workerType}</Badge>}
                            {multiFacility && <span className="block text-xs text-muted">{facs[r.tc.facilityId].shortName}</span>}
                          </td>
                          <td className="td whitespace-nowrap">{fmtDate(r.tc.workDate, { weekday: true })}</td>
                          <td className="td">
                            <span className="block">{roleName(r.tc.roleId)}</span>
                            <span className="text-xs text-muted">{DEPT_BY_ID[r.tc.departmentId].shortName}</span>
                          </td>
                          <td className="td whitespace-nowrap">
                            <ScheduledRange shift={r.shift} />
                          </td>
                          <td className="td whitespace-nowrap">
                            <ActualRange calc={r.calc} tc={r.tc} tz={r.facility.timeZone} />
                          </td>
                          <td className="td text-right font-medium tabular">{hoursText(r.calc.workedMinutes)}</td>
                          <td className="td text-right text-muted tabular">{r.calc.breakMinutes ? `${r.calc.breakMinutes}m` : '—'}</td>
                          <td className={clsx('td text-right tabular', v.tone)}>{v.text}</td>
                          <td className="td">
                            <div className="flex flex-wrap gap-1">
                              {r.calc.exceptions.map((e) => (
                                <Badge key={e.code} tone={e.severity === 'blocking' ? 'danger' : e.code === 'unscheduled' ? 'info' : 'warning'}>
                                  {e.label}
                                </Badge>
                              ))}
                              {r.calc.onClock && <Badge tone="success">On clock</Badge>}
                            </div>
                          </td>
                          <td className="td">
                            <TimecardStatusBadge status={r.tc.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableWrap>
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs text-muted">
                  <span>
                    {listRows.length} timecards · {hoursText(workedTotal)} worked hours
                  </span>
                  {listRows.length > limit && (
                    <Button size="xs" onClick={() => setLimit(listRows.length)}>
                      Show all {listRows.length}
                    </Button>
                  )}
                </div>
              </>
            )}
          </Card>
        )}
      </div>

      <TimecardDrawer id={tcParam} onClose={() => openTc(null)} />
      <ConfirmDialog
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        title={`Approve ${bulkTargets.length} timecard${bulkTargets.length === 1 ? '' : 's'}?`}
        body="Approved timecards become eligible for PBJ preparation. Timecards with blocking exceptions or still on the clock are skipped."
        confirmLabel="Approve"
        onConfirm={() => {
          const r = approveTimecards(bulkTargets.map((x) => x.tc.id));
          const v = r.value;
          usePoise.getState().toast({
            tone: v && v.approved ? 'success' : 'warning',
            title: `${v?.approved ?? 0} timecard${v?.approved === 1 ? '' : 's'} approved`,
            body: v?.skipped.length ? `${v.skipped.length} skipped: ${v.skipped[0].reason}` : 'Now eligible for PBJ preparation.',
          });
          setSelected(new Set());
          setConfirmBulk(false);
        }}
      />
    </div>
  );
}

function CorrectionsQueue({ scopedTcIds, onOpen }: { scopedTcIds: Set<string>; onOpen: (id: string) => void }) {
  const { corrections, timecards, reviewCorrection } = usePoise(useShallow((s) => ({ corrections: s.corrections, timecards: s.timecards, reviewCorrection: s.reviewCorrection })));
  const emps = useEmployeesById();
  const facs = useFacilitiesById();
  const canCorrect = useCan('time.correct');
  const run = useRun();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const list = corrections.filter((c) => scopedTcIds.has(c.timecardId));
  const pending = list.filter((c) => c.status === 'pending');
  const history = list.filter((c) => c.status !== 'pending');

  const render = (c: (typeof list)[number]) => {
    const tc = timecards.find((t) => t.id === c.timecardId)!;
    const tz = facs[tc.facilityId].timeZone;
    return (
      <Card key={c.id} className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">
              {employeeName(emps[c.employeeId])} · {fmtDate(tc.workDate, { weekday: true })}
            </p>
            <p className="text-xs text-muted">
              Requested by {c.requestedBy} · {fmtDateTime(c.requestedAt, tz)} · {facs[tc.facilityId].shortName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={c.status === 'approved' ? 'success' : c.status === 'rejected' ? 'danger' : 'warning'}>{c.status}</Badge>
            <Button size="xs" onClick={() => onOpen(tc.id)}>
              Open timecard
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[13px]">“{c.reason}”</p>
        <table className="mt-2 w-full max-w-lg text-[13px]">
          <thead>
            <tr>
              <th className="th">Punch</th>
              <th className="th">Original</th>
              <th className="th">Corrected</th>
            </tr>
          </thead>
          <tbody>
            {c.changes.map((ch, i) => (
              <tr key={i}>
                <td className="td">{PUNCH_LABEL[ch.punchType]}</td>
                <td className="td tabular text-muted">{ch.originalAt ? fmtDateTime(ch.originalAt, tz) : 'Missing'}</td>
                <td className="td font-medium tabular">{fmtDateTime(ch.correctedAt, tz)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {c.status === 'pending' && canCorrect ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Reviewer note" className="flex-1" htmlFor={`note-${c.id}`} hint="Required to reject.">
              <Textarea id={`note-${c.id}`} className="min-h-[40px]" value={notes[c.id] ?? ''} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => run(() => reviewCorrection(c.id, 'rejected', notes[c.id] ?? ''), { success: 'Correction rejected' })}>
                Reject
              </Button>
              <Button variant="primary" onClick={() => run(() => reviewCorrection(c.id, 'approved', notes[c.id] ?? ''), { success: 'Correction approved', successBody: 'Original punch preserved and superseded. Approve the timecard when ready.' })}>
                Approve
              </Button>
            </div>
          </div>
        ) : c.reviewer ? (
          <p className="mt-2 text-xs text-muted">
            {c.status === 'approved' ? 'Approved' : 'Rejected'} by {c.reviewer} · {fmtDateTime(c.reviewedAt!, tz)}
            {c.reviewerNote ? ` — ${c.reviewerNote}` : ''}
          </p>
        ) : null}
      </Card>
    );
  };

  return (
    <div className="space-y-3">
      {pending.length === 0 ? <Card><EmptyState icon={ClipboardCheck} title="No pending correction requests" body="Employee-submitted punch corrections appear here." /></Card> : pending.map(render)}
      {history.length > 0 && (
        <>
          <h3 className="pt-2 text-[13.5px] font-semibold text-muted">Reviewed</h3>
          {history.map(render)}
        </>
      )}
    </div>
  );
}

function TimeOffQueue({ scopedEmpIds }: { scopedEmpIds: Set<string> }) {
  const { timeOff, decideTimeOff } = usePoise(useShallow((s) => ({ timeOff: s.timeOff, decideTimeOff: s.decideTimeOff })));
  const emps = useEmployeesById();
  const canDecide = useCan('time_off.approve');
  const run = useRun();
  const list = timeOff.filter((t) => scopedEmpIds.has(t.employeeId)).sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || b.startDate.localeCompare(a.startDate));
  return (
    <div className="space-y-3">
      <Callout tone="neutral">Approved paid leave is recorded as nonworked time. It is never counted as worked hours or PBJ hours. Check the schedule for shifts on approved dates.</Callout>
      <Card>
        {list.length === 0 ? (
          <EmptyState icon={CalendarOff} title="No time-off requests" />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th className="th">Employee</th>
                <th className="th">Dates</th>
                <th className="th">Category</th>
                <th className="th text-right">Hours/day</th>
                <th className="th">Note</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td className="td font-medium">{employeeName(emps[t.employeeId])}</td>
                  <td className="td whitespace-nowrap">
                    {fmtDate(t.startDate, { weekday: true })}
                    {t.endDate !== t.startDate && ` – ${fmtDate(t.endDate, { weekday: true })}`}
                  </td>
                  <td className="td">{t.category}</td>
                  <td className="td text-right tabular">{t.hoursPerDay.toFixed(2)}</td>
                  <td className="td text-muted">{t.note ?? '—'}</td>
                  <td className="td">
                    <Badge tone={t.status === 'approved' ? 'success' : t.status === 'denied' ? 'danger' : 'warning'}>{t.status}</Badge>
                    {t.decidedBy && <span className="block text-xs text-muted">{t.decidedBy}</span>}
                  </td>
                  <td className="td text-right whitespace-nowrap">
                    {t.status === 'pending' && canDecide && (
                      <div className="flex justify-end gap-1.5">
                        <Button size="xs" onClick={() => run(() => decideTimeOff(t.id, 'denied'), { success: 'Request denied' })}>
                          Deny
                        </Button>
                        <Button size="xs" variant="primary" onClick={() => run(() => decideTimeOff(t.id, 'approved'), { success: 'Time off approved', successBody: 'Recorded as nonworked time — not worked or PBJ hours.' })}>
                          Approve
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

function AuditView({ facilityIds }: { facilityIds: string[] }) {
  const audit = usePoise((s) => s.audit);
  const facs = useFacilitiesById();
  const events = audit.filter((a) => ['timecard', 'punch', 'correction', 'time_off'].includes(a.entityType) && (a.facilityId === null || facilityIds.includes(a.facilityId))).slice(0, 200);
  return (
    <Card>
      {events.length === 0 ? (
        <EmptyState icon={History} title="No time-related audit events yet" />
      ) : (
        <TableWrap maxHeight="65vh">
          <thead>
            <tr>
              <th className="th">When</th>
              <th className="th">Actor</th>
              <th className="th">Action</th>
              <th className="th">Detail</th>
              <th className="th">Before → After</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const tz = facs[e.facilityId ?? '']?.timeZone ?? 'America/New_York';
              return (
                <tr key={e.id}>
                  <td className="td whitespace-nowrap tabular">{fmtDateTime(e.at, tz)}</td>
                  <td className="td">
                    {e.actor}
                    <span className="block text-xs text-muted">{e.actorRole.replace('_', ' ')}</span>
                  </td>
                  <td className="td font-medium">{e.action}</td>
                  <td className="td text-muted">{e.detail}</td>
                  <td className="td text-xs text-muted tabular">
                    {e.before || e.after ? (
                      <>
                        {e.before ? e.before.split(', ').map((x) => (x.includes('T') ? fmtDateTime(x, tz) : x)).join(', ') : '—'} → {e.after ? e.after.split(', ').map((x) => (x.includes('T') ? fmtDateTime(x, tz) : x)).join(', ') : '—'}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </Card>
  );
}
