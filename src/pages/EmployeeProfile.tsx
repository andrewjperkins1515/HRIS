import clsx from 'clsx';
import { ArrowLeft, BadgeCheck, CalendarDays, FileCheck2, History, Pencil, ShieldCheck, Timer, UserMinus, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DEPT_BY_ID, PBJ_PAY_TYPE_CODE, PBJ_TITLE_BY_CODE, ROLE_BY_ID, SHIFT_TYPE_LABEL } from '../domain/catalog';
import { effectiveMapping } from '../domain/pbj/engine';
import { addDays, daysBetween, fmtDate, fmtDuration, fmtLocalTime, fmtTime, weekStartOf } from '../domain/time';
import type { Credential, Employee } from '../domain/types';
import { EmployeeStatusBadge, TimecardStatusBadge, WorkerTypeBadge } from '../components/status';
import { LifecycleTab, StartOffboardingModal } from '../components/people/LifecycleTab';
import { Avatar, Badge, Button, Callout, Card, CardHeader, Checkbox, EmptyState, Field, Input, KeyValue, Modal, Select, TableWrap, Tabs } from '../components/ui';
import { employeeName, roleName, useCan, useEmployeesById, useFacilitiesById, useTimecardRows, useToday, useUser } from '../store/hooks';
import { usePoise } from '../store/store';
import { useRun } from '../store/useRun';
import { canManageEmployee } from '../domain/permissions';

type Tab = 'overview' | 'lifecycle' | 'credentials' | 'schedule' | 'time' | 'pbj' | 'activity';

export default function EmployeeProfilePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overview';
  const employee = usePoise((s) => s.employees.find((e) => e.id === id));
  const user = useUser();
  const facs = useFacilitiesById();
  const emps = useEmployeesById();
  const workflows = usePoise((s) => s.workflows);
  const canManage = useCan('lifecycle.manage');
  const canEdit = useCan('people.edit');
  const [offOpen, setOffOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  if (!employee)
    return (
      <EmptyState
        icon={UserX}
        title="Employee not found"
        body="The record may not exist in this demo dataset."
        action={
          <Link to="/people" className="link">
            Back to People
          </Link>
        }
      />
    );
  if (!canManageEmployee({ ...user, departmentIds: null }, employee))
    return <EmptyState icon={UserX} title="Outside your facility scope" body="This demo role cannot view employees at other facilities." />;

  const activeWf = workflows.filter((w) => w.employeeId === employee.id && w.status === 'in_progress');
  const role = ROLE_BY_ID[employee.roleId];
  const setTab = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t });

  return (
    <div>
      <Link to="/people" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> People
      </Link>
      <Card className="mb-4">
        <div className="flex flex-wrap items-start gap-4 p-4">
          <Avatar name={`${employee.firstName} ${employee.lastName}`} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{employeeName(employee)}</h1>
              {employee.preferredName && <span className="text-sm text-muted">({employee.firstName})</span>}
              <EmployeeStatusBadge status={employee.status} />
              <WorkerTypeBadge type={employee.workerType} agency={employee.agencyName} />
            </div>
            <p className="mt-0.5 text-[13.5px] text-muted">
              {role?.name} · {DEPT_BY_ID[employee.departmentId].name} · {facs[employee.primaryFacilityId]?.name}
              {employee.additionalFacilityIds.length > 0 && ` (+ ${employee.additionalFacilityIds.map((f) => facs[f]?.shortName).join(', ')})`}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <span>
                Internal ID <span className="font-mono text-ink">{employee.id}</span>
              </span>
              <span>
                PBJ worker ID <span className="font-mono text-ink">{employee.pbjEmployeeId || '—'}</span>
              </span>
              <span>Hired {fmtDate(employee.hireDate, { year: true })}</span>
              {employee.separationDate && <span className="font-medium text-warn-700">Separation {fmtDate(employee.separationDate, { year: true })}</span>}
              {employee.archivedAt && <span>Archived {fmtDate(employee.archivedAt.slice(0, 10), { year: true })}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && employee.status !== 'archived' && (
              <Button icon={Pencil} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            )}
            {canManage && (employee.status === 'active' || employee.status === 'leave') && (
              <Button icon={UserMinus} onClick={() => setOffOpen(true)}>
                Start offboarding
              </Button>
            )}
          </div>
        </div>
        {activeWf.length > 0 && (
          <div className="border-t border-line px-4 py-2 text-[13px]">
            {activeWf.map((w) => (
              <span key={w.id} className="mr-4">
                {w.kind === 'onboarding' ? 'Onboarding' : 'Offboarding'} in progress ·{' '}
                <button className="link" onClick={() => setTab('lifecycle')}>
                  {w.tasks.filter((t) => t.status === 'done' || t.status === 'waived').length}/{w.tasks.length} tasks
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="px-4">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'lifecycle', label: 'Lifecycle', count: activeWf.length },
              { value: 'credentials', label: 'Credentials' },
              { value: 'schedule', label: 'Schedule' },
              { value: 'time', label: 'Time' },
              { value: 'pbj', label: 'PBJ' },
              { value: 'activity', label: 'Activity' },
            ]}
          />
        </div>
      </Card>

      {tab === 'overview' && <OverviewTab employee={employee} managerName={employee.managerId ? employeeName(emps[employee.managerId]) : undefined} />}
      {tab === 'lifecycle' && <LifecycleTab employee={employee} />}
      {tab === 'credentials' && <CredentialsTab employee={employee} />}
      {tab === 'schedule' && <ScheduleTab employee={employee} />}
      {tab === 'time' && <TimeTab employee={employee} />}
      {tab === 'pbj' && <PbjTab employee={employee} />}
      {tab === 'activity' && <ActivityTab employee={employee} />}

      <StartOffboardingModal employee={employee} open={offOpen} onClose={() => setOffOpen(false)} onStarted={() => setTab('lifecycle')} />
      {editOpen && <EditModal employee={employee} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

function OverviewTab({ employee, managerName }: { employee: Employee; managerName?: string }) {
  const facs = useFacilitiesById();
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const role = ROLE_BY_ID[employee.roleId];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Employment" />
        <div className="p-4">
          <KeyValue
            items={[
              { k: 'Job role', v: `${role?.name} (${role?.sourceJobCode})` },
              { k: 'Department', v: DEPT_BY_ID[employee.departmentId].name },
              { k: 'Primary facility', v: facs[employee.primaryFacilityId]?.name },
              { k: 'Additional facilities', v: employee.additionalFacilityIds.map((f) => facs[f]?.name).join(', ') || 'None' },
              { k: 'Manager', v: managerName ?? '—' },
              { k: 'Worker type', v: employee.workerType === 'employee' ? 'Employee' : `${employee.workerType === 'agency' ? 'Agency' : 'Contract'} — ${employee.agencyName ?? 'agency not recorded'}` },
              { k: 'Employment type', v: { full_time: 'Full time', part_time: 'Part time', prn: 'PRN / per diem' }[employee.employmentType] },
              { k: 'FLSA / pay type', v: employee.payType ? { exempt: 'Exempt', nonexempt: 'Non-exempt', contract: 'Contract' }[employee.payType] : 'Not set' },
              { k: 'Hire date', v: fmtDate(employee.hireDate, { year: true }) },
              { k: 'First shift', v: employee.firstShiftDate ? fmtDate(employee.firstShiftDate, { year: true }) : '—' },
              { k: 'Separation date', v: employee.separationDate ? fmtDate(employee.separationDate, { year: true }) : '—' },
              { k: 'Record source', v: employee.createdBySource === 'import' ? `Created by agency import (${employee.externalRef})` : employee.createdBySource === 'manual' ? 'Created in Poise' : 'Demo seed' },
            ]}
          />
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Contact" subtitle="Fictional" />
          <div className="p-4">
            <KeyValue cols={1} items={[{ k: 'Email', v: employee.email || '—' }, { k: 'Phone', v: employee.phone || '—' }]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Weekly availability" />
          <div className="grid grid-cols-7 gap-1 p-4 text-center text-[11px]">
            {employee.availability.map((a, i) => (
              <div key={i} className={clsx('rounded py-1.5', a === 'unavailable' ? 'bg-danger-50 text-danger-700' : a === 'preferred' ? 'bg-brand-50 text-brand-800' : 'bg-canvas text-muted')}>
                <div className="font-semibold">{DOW[i]}</div>
                <div>{a === 'unavailable' ? 'No' : a === 'preferred' ? 'Pref' : 'Avail'}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function credState(c: Credential, today: string) {
  const days = c.expiresOn ? daysBetween(today, c.expiresOn) : null;
  if (c.verification !== 'verified') return { label: c.verification === 'pending' ? 'Verification pending' : 'Not verified', tone: 'info' as const };
  if (days !== null && days < 0) return { label: 'Expired', tone: 'danger' as const };
  if (days !== null && days <= 30) return { label: `Expires in ${days} days`, tone: 'warning' as const };
  return { label: 'Current', tone: 'success' as const };
}

function CredentialsTab({ employee }: { employee: Employee }) {
  const today = useToday(employee.primaryFacilityId);
  const canVerify = useCan('lifecycle.complete_tasks');
  const verify = usePoise((s) => s.verifyCredential);
  const run = useRun();
  const [editing, setEditing] = useState<Credential | null>(null);
  const [number, setNumber] = useState('');
  const [expires, setExpires] = useState('');
  const required = ROLE_BY_ID[employee.roleId]?.requiredCredentials ?? [];
  const missing = required.filter((r) => !employee.credentials.some((c) => c.type === r));
  return (
    <Card>
      <CardHeader title="Credentials" subtitle={`Required for ${roleName(employee.roleId)}: ${required.join(', ') || 'none'}`} />
      <div className="p-4 pb-0">
        <Callout tone="neutral" icon={ShieldCheck}>
          Prototype placeholder: marking a credential verified records the action in Poise only. No license registry, background or primary-source verification is performed. Expired or unverified required credentials block shift assignment.
        </Callout>
        {missing.length > 0 && (
          <Callout tone="danger" className="mt-2" title="Missing required credentials">
            {missing.join(', ')}
          </Callout>
        )}
      </div>
      {employee.credentials.length === 0 ? (
        <EmptyState icon={BadgeCheck} title="No credentials on file" />
      ) : (
        <TableWrap className="mt-3">
          <thead>
            <tr>
              <th className="th">Credential</th>
              <th className="th">Number</th>
              <th className="th">Issued</th>
              <th className="th">Expires</th>
              <th className="th">Status</th>
              <th className="th">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {employee.credentials.map((c) => {
              const st = credState(c, today);
              return (
                <tr key={c.id}>
                  <td className="td font-medium">
                    {c.type}
                    {required.includes(c.type) && <span className="ml-1.5 text-[11px] font-normal text-muted">Required</span>}
                    {c.note && <div className="text-xs font-normal text-muted">{c.note}</div>}
                  </td>
                  <td className="td font-mono text-xs text-muted">{c.number ?? '—'}</td>
                  <td className="td tabular">{c.issuedOn ? fmtDate(c.issuedOn, { year: true }) : '—'}</td>
                  <td className="td tabular">{c.expiresOn ? fmtDate(c.expiresOn, { year: true }) : '—'}</td>
                  <td className="td">
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </td>
                  <td className="td text-right">
                    {canVerify && employee.status !== 'archived' && (
                      <Button
                        size="xs"
                        variant={c.verification === 'verified' ? 'ghost' : 'subtle'}
                        onClick={() => {
                          setEditing(c);
                          setNumber(c.number ?? '');
                          setExpires(c.expiresOn ?? '');
                        }}
                      >
                        {c.verification === 'verified' ? 'Update' : 'Verify'}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`${editing?.verification === 'verified' ? 'Update' : 'Verify'} ${editing?.type ?? ''}`}
        description="Records verification in the prototype only."
        size="sm"
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!expires}
              onClick={() => {
                const r = run(() => verify(employee.id, editing!.id, { number: number || undefined, expiresOn: expires, issuedOn: editing!.issuedOn ?? today }), {
                  success: 'Credential marked verified',
                  successBody: `${editing!.type} — placeholder only, no external check performed.`,
                });
                if (r.ok) setEditing(null);
              }}
            >
              Mark verified
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Credential number" htmlFor="cn">
            <Input id="cn" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Optional for screenings" />
          </Field>
          <Field label="Expiration date" required htmlFor="ce" error={expires && expires < today ? 'This date is in the past — the credential will show as expired.' : undefined}>
            <Input id="ce" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

function ScheduleTab({ employee }: { employee: Employee }) {
  const today = useToday(employee.primaryFacilityId);
  const shifts = usePoise((s) => s.shifts);
  const weeks = usePoise((s) => s.scheduleWeeks);
  const facs = useFacilitiesById();
  const mine = shifts.filter((s) => s.employeeId === employee.id);
  const upcoming = mine.filter((s) => s.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const recent = mine
    .filter((s) => s.date < today && s.date >= addDays(today, -14))
    .sort((a, b) => b.date.localeCompare(a.date));
  const table = (list: typeof mine, emptyMsg: string) =>
    list.length === 0 ? (
      <p className="px-4 py-6 text-center text-[13px] text-muted">{emptyMsg}</p>
    ) : (
      <TableWrap>
        <thead>
          <tr>
            <th className="th">Date</th>
            <th className="th">Time</th>
            <th className="th">Shift</th>
            <th className="th">Role</th>
            <th className="th">Facility</th>
            <th className="th">Schedule</th>
          </tr>
        </thead>
        <tbody>
          {list.map((s) => {
            const wk = weeks.find((w) => w.id === `${s.facilityId}:${weekStartOf(s.date)}`);
            const afterSep = employee.separationDate && s.date > employee.separationDate;
            return (
              <tr key={s.id} className={clsx(afterSep && 'bg-warn-50/50')}>
                <td className="td whitespace-nowrap">
                  <Link to={`/scheduling?week=${s.date}&shift=${s.id}`} className="link">
                    {fmtDate(s.date, { weekday: true })}
                  </Link>
                  {afterSep && <div className="text-xs text-warn-700">After separation date</div>}
                </td>
                <td className="td whitespace-nowrap tabular">
                  {fmtLocalTime(s.start)}–{fmtLocalTime(s.end)}
                </td>
                <td className="td">{SHIFT_TYPE_LABEL[s.shiftType]}</td>
                <td className="td whitespace-nowrap">{roleName(s.roleId)}</td>
                <td className="td whitespace-nowrap">{facs[s.facilityId]?.shortName}</td>
                <td className="td">{wk?.status === 'published' ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>}</td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
    );
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Upcoming shifts" subtitle={`${upcoming.length} scheduled`} actions={<CalendarDays className="size-4 text-muted" aria-hidden />} />
        {table(upcoming, 'No upcoming shifts.')}
      </Card>
      <Card>
        <CardHeader title="Recent shifts" subtitle="Last 14 days (scheduled — see Time for actual worked hours)" />
        {table(recent, 'No shifts in the last 14 days.')}
      </Card>
    </div>
  );
}

function TimeTab({ employee }: { employee: Employee }) {
  const rows = useTimecardRows((tc) => tc.employeeId === employee.id);
  const nonWorked = usePoise((s) => s.nonWorked.filter((n) => n.employeeId === employee.id));
  const timeOff = usePoise((s) => s.timeOff.filter((t) => t.employeeId === employee.id));
  const today = useToday(employee.primaryFacilityId);
  const sorted = [...rows].sort((a, b) => b.tc.workDate.localeCompare(a.tc.workDate));
  const twoWeeks = addDays(today, -13);
  const worked14 = rows.filter((r) => r.tc.workDate >= twoWeeks).reduce((s, r) => s + r.calc.workedMinutes, 0);
  const paid14 = nonWorked.filter((n) => n.date >= twoWeeks && n.paid).reduce((s, n) => s + n.hours, 0);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sorted : sorted.slice(0, 20);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-line bg-white p-3">
          <div className="text-xs text-muted">Worked hours · last 14 days</div>
          <div className="mt-1 text-xl font-semibold tabular">{(worked14 / 60).toFixed(2)}</div>
        </div>
        <div className="rounded-lg border border-line bg-white p-3">
          <div className="text-xs text-muted">Paid leave · last 14 days</div>
          <div className="mt-1 text-xl font-semibold tabular">{paid14.toFixed(2)}</div>
          <div className="text-[11px] text-muted">Nonworked — not PBJ hours</div>
        </div>
        <div className="rounded-lg border border-line bg-white p-3">
          <div className="text-xs text-muted">Timecards pending / open</div>
          <div className="mt-1 text-xl font-semibold tabular">{rows.filter((r) => r.tc.status !== 'approved').length}</div>
        </div>
        <div className="rounded-lg border border-line bg-white p-3">
          <div className="text-xs text-muted">Exceptions</div>
          <div className="mt-1 text-xl font-semibold tabular">{rows.filter((r) => r.calc.exceptions.length > 0 && r.tc.status !== 'approved').length}</div>
        </div>
      </div>
      <Card>
        <CardHeader
          title="Timecards"
          subtitle="Worked time is calculated from punches only; scheduled time is shown for comparison."
          actions={
            <Link to="/time" className="link text-[13px]">
              Time & Attendance
            </Link>
          }
        />
        {sorted.length === 0 ? (
          <EmptyState icon={Timer} title="No timecards in scope" />
        ) : (
          <>
            <TableWrap maxHeight="60vh">
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Facility</th>
                  <th className="th">Job</th>
                  <th className="th">In</th>
                  <th className="th">Out</th>
                  <th className="th">Break</th>
                  <th className="th text-right">Worked</th>
                  <th className="th text-right">Scheduled</th>
                  <th className="th">Status</th>
                  <th className="th">Exceptions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ tc, calc, facility }) => (
                  <tr key={tc.id}>
                    <td className="td whitespace-nowrap">
                      <Link to={`/time?tc=${tc.id}`} className="link">
                        {fmtDate(tc.workDate, { weekday: true })}
                      </Link>
                      {tc.source === 'import' && <div className="text-[11px] text-muted">Imported{tc.sourcePayCode ? ` · ${tc.sourcePayCode}` : ''}</div>}
                    </td>
                    <td className="td whitespace-nowrap">{facility.shortName}</td>
                    <td className="td whitespace-nowrap">{roleName(tc.roleId)}</td>
                    <td className="td whitespace-nowrap tabular">{calc.firstIn ? fmtTime(calc.firstIn, facility.timeZone) : '—'}</td>
                    <td className="td whitespace-nowrap tabular">{calc.lastOut ? fmtTime(calc.lastOut, facility.timeZone) : calc.onClock ? 'On clock' : '—'}</td>
                    <td className="td tabular">{calc.breakMinutes ? fmtDuration(calc.breakMinutes) : '—'}</td>
                    <td className="td text-right font-medium tabular">{(calc.workedMinutes / 60).toFixed(2)}</td>
                    <td className="td text-right text-muted tabular">{calc.scheduledMinutes ? (calc.scheduledMinutes / 60).toFixed(2) : '—'}</td>
                    <td className="td">
                      <TimecardStatusBadge status={tc.status} />
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {calc.exceptions.slice(0, 2).map((x) => (
                          <Badge key={x.code} tone={x.severity === 'blocking' ? 'danger' : 'neutral'}>
                            {x.label}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            {sorted.length > 20 && (
              <div className="border-t border-line px-4 py-2 text-center">
                <Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'Show recent only' : `Show all ${sorted.length} timecards`}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Paid leave & nonworked time" subtitle="Kept separate from worked hours and never included in PBJ eligible hours." />
          {nonWorked.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted">No nonworked entries.</p>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Category</th>
                  <th className="th text-right">Hours</th>
                  <th className="th">Paid</th>
                  <th className="th">Source</th>
                </tr>
              </thead>
              <tbody>
                {[...nonWorked]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((n) => (
                    <tr key={n.id}>
                      <td className="td tabular">{fmtDate(n.date, { weekday: true, year: true })}</td>
                      <td className="td">{n.category}</td>
                      <td className="td text-right tabular">{n.hours.toFixed(2)}</td>
                      <td className="td">{n.paid ? 'Paid' : 'Unpaid'}</td>
                      <td className="td text-xs text-muted">{n.source.replace(/_/g, ' ')}</td>
                    </tr>
                  ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
        <Card>
          <CardHeader title="Time-off requests" />
          {timeOff.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted">No requests.</p>
          ) : (
            <ul className="divide-y divide-line">
              {timeOff.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
                  <span>
                    <span className="font-medium">
                      {t.category} · {fmtDate(t.startDate)}
                      {t.endDate !== t.startDate && `–${fmtDate(t.endDate)}`}
                    </span>
                    {t.note && <span className="block text-xs text-muted">{t.note}</span>}
                  </span>
                  <Badge tone={t.status === 'approved' ? 'success' : t.status === 'denied' ? 'danger' : 'warning'}>{t.status === 'pending' ? 'Pending' : t.status === 'approved' ? 'Approved' : 'Denied'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function PbjTab({ employee }: { employee: Employee }) {
  const mappings = usePoise((s) => s.mappings);
  const today = useToday(employee.primaryFacilityId);
  const canPbj = useCan('pbj.view');
  const role = ROLE_BY_ID[employee.roleId];
  const code = role?.sourceJobCode ?? '';
  const facilities = [employee.primaryFacilityId, ...employee.additionalFacilityIds];
  const facs = useFacilitiesById();
  const history = mappings.filter((m) => m.sourceJobCode === code && (m.facilityId === null || facilities.includes(m.facilityId))).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const current = effectiveMapping(mappings, employee.primaryFacilityId, code, today);
  const payCode = employee.payType ? PBJ_PAY_TYPE_CODE[employee.payType] : null;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader title="PBJ worker record" />
        <div className="p-4">
          <KeyValue
            cols={1}
            items={[
              { k: 'PBJ worker ID (stable, no PII)', v: <span className="font-mono">{employee.pbjEmployeeId || 'Missing'}</span> },
              { k: 'Pay type', v: employee.payType ? `${{ exempt: 'Exempt', nonexempt: 'Non-exempt', contract: 'Contract' }[employee.payType]} (code ${payCode})` : 'Missing — PBJ blocking error' },
              { k: 'Worker type', v: employee.workerType === 'employee' ? 'Direct employee' : `${employee.workerType} — ${employee.agencyName ?? 'agency not recorded'}` },
              { k: 'Source job code', v: <span className="font-mono">{code}</span> },
              {
                k: 'Mapping in effect today',
                v: current ? (
                  current.reportability === 'not_reported' ? (
                    'Not PBJ-reportable'
                  ) : (
                    <>
                      {current.pbjJobTitleCode} — {PBJ_TITLE_BY_CODE[current.pbjJobTitleCode!]?.title}
                      {current.reportability === 'optional' && <span className="text-muted"> (optional category)</span>}
                    </>
                  )
                ) : (
                  <span className="font-medium text-danger-700">Unmapped</span>
                ),
              },
            ]}
          />
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader
          title="Effective-dated job mapping history"
          subtitle={`Mappings for source job ${code}. Hours are mapped by work date.`}
          actions={
            canPbj && (
              <Link to="/pbj" className="link inline-flex items-center gap-1 text-[13px]">
                <FileCheck2 className="size-4" aria-hidden /> PBJ workspace
              </Link>
            )
          }
        />
        {!current && (
          <div className="p-4 pb-0">
            <Callout tone="danger" title="No PBJ mapping in effect">
              Worked hours for {code} are blocked from PBJ preparation until a mapping is added in the PBJ workspace.
            </Callout>
          </div>
        )}
        {history.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted">No mappings recorded for {code}.</p>
        ) : (
          <TableWrap className="mt-2">
            <thead>
              <tr>
                <th className="th">Effective</th>
                <th className="th">CMS job title</th>
                <th className="th">Reportability</th>
                <th className="th">Scope</th>
                <th className="th">Note</th>
                <th className="th">Updated</th>
              </tr>
            </thead>
            <tbody>
              {history.map((m) => (
                <tr key={m.id} className={clsx(m.id === current?.id && 'bg-brand-50/40')}>
                  <td className="td whitespace-nowrap tabular">
                    {fmtDate(m.effectiveFrom, { year: true })} – {m.effectiveTo ? fmtDate(m.effectiveTo, { year: true }) : 'present'}
                    {m.id === current?.id && (
                      <div>
                        <Badge tone="brand">In effect</Badge>
                      </div>
                    )}
                  </td>
                  <td className="td">{m.pbjJobTitleCode ? `${m.pbjJobTitleCode} — ${PBJ_TITLE_BY_CODE[m.pbjJobTitleCode]?.title}` : '—'}</td>
                  <td className="td">
                    <Badge tone={m.reportability === 'required' ? 'brand' : m.reportability === 'optional' ? 'neutral' : 'neutral'}>{m.reportability.replace('_', ' ')}</Badge>
                  </td>
                  <td className="td whitespace-nowrap">{m.facilityId ? facs[m.facilityId]?.shortName : 'All facilities'}</td>
                  <td className="td max-w-72 text-xs text-muted">{m.note ?? '—'}</td>
                  <td className="td text-xs whitespace-nowrap text-muted">
                    {m.updatedBy}
                    <br />
                    {fmtDate(m.updatedAt.slice(0, 10), { year: true })}
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

function ActivityTab({ employee }: { employee: Employee }) {
  const audit = usePoise((s) => s.audit);
  const workflows = usePoise((s) => s.workflows);
  const timecards = usePoise((s) => s.timecards);
  const shifts = usePoise((s) => s.shifts);
  const corrections = usePoise((s) => s.corrections);
  const events = useMemo(() => {
    const name = employeeName(employee);
    const full = `${employee.firstName} ${employee.lastName}`;
    const related = new Set<string>([
      employee.id,
      ...workflows.filter((w) => w.employeeId === employee.id).map((w) => w.id),
      ...timecards.filter((t) => t.employeeId === employee.id).map((t) => t.id),
      ...shifts.filter((s) => s.employeeId === employee.id).map((s) => s.id),
      ...corrections.filter((c) => c.employeeId === employee.id).map((c) => c.id),
    ]);
    return audit.filter((a) => related.has(a.entityId) || a.detail.includes(name) || a.detail.includes(full) || a.actor === full).slice(0, 60);
  }, [audit, employee, workflows, timecards, shifts, corrections]);
  return (
    <Card>
      <CardHeader title="Activity" subtitle="Audit events recorded in the demo for this person" actions={<History className="size-4 text-muted" aria-hidden />} />
      {events.length === 0 ? (
        <EmptyState icon={History} title="No recorded activity" />
      ) : (
        <ol className="divide-y divide-line">
          {events.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-4 gap-y-0.5 px-4 py-2.5 text-[13px]">
              <span className="w-36 shrink-0 text-xs text-muted tabular">{new Date(a.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{a.action}</span> · <span className="text-muted">{a.detail}</span>
                {(a.before || a.after) && (
                  <span className="block text-xs text-muted">
                    {a.before && <>Before: {a.before} </>}
                    {a.after && <>→ After: {a.after}</>}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted">{a.actor}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function EditModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const update = usePoise((s) => s.updateEmployee);
  const allFacilities = usePoise((s) => s.facilities);
  const employees = usePoise((s) => s.employees);
  const run = useRun();
  const [email, setEmail] = useState(employee.email);
  const [phone, setPhone] = useState(employee.phone);
  const [managerId, setManagerId] = useState(employee.managerId ?? '');
  const [extra, setExtra] = useState(employee.additionalFacilityIds);
  const [agency, setAgency] = useState(employee.agencyName ?? '');
  const managers = employees.filter((e) => e.id !== employee.id && e.status === 'active' && e.workerType === 'employee' && e.primaryFacilityId === employee.primaryFacilityId).sort((a, b) => a.lastName.localeCompare(b.lastName));
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit employee details"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const patch: Partial<Employee> = { email, phone, managerId: managerId || null, additionalFacilityIds: extra };
              if (employee.workerType !== 'employee') patch.agencyName = agency.trim() || undefined;
              const r = run(() => update(employee.id, patch, 'Updated contact, manager or facility assignments.'), { success: 'Employee updated' });
              if (r.ok) onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email" htmlFor="ee">
          <Input id="ee" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Phone" htmlFor="ep">
          <Input id="ep" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Manager" htmlFor="em" className="sm:col-span-2">
          <Select id="em" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="">No manager</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {employeeName(m)} — {roleName(m.roleId)}
              </option>
            ))}
          </Select>
        </Field>
        {employee.workerType !== 'employee' && (
          <Field label="Agency name" htmlFor="ea" className="sm:col-span-2">
            <Input id="ea" value={agency} onChange={(e) => setAgency(e.target.value)} />
          </Field>
        )}
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-[13px] font-medium">Additional facilities</legend>
          <div className="flex flex-wrap gap-4">
            {allFacilities
              .filter((f) => f.id !== employee.primaryFacilityId)
              .map((f) => (
                <Checkbox key={f.id} checked={extra.includes(f.id)} onChange={(v) => setExtra(v ? [...extra, f.id] : extra.filter((x) => x !== f.id))} label={f.name} />
              ))}
          </div>
        </fieldset>
      </div>
      <p className="mt-3 text-xs text-muted">Role, department and primary facility changes would be effective-dated in production and are not editable in this prototype.</p>
    </Modal>
  );
}
