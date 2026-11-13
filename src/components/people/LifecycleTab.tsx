import clsx from 'clsx';
import { Archive, CheckCircle2, ClipboardList, Lock, UserMinus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SHIFT_TYPE_LABEL } from '../../domain/catalog';
import { canCompleteWorkflow, isTaskDone, unmetDependencies, workflowReadiness } from '../../domain/lifecycle';
import { ROLE_LABEL } from '../../domain/permissions';
import { addDays, fmtDate, fmtLocalTime } from '../../domain/time';
import type { Employee, LifecycleTask, LifecycleWorkflow, TaskStatus } from '../../domain/types';
import { useCan, useFacilitiesById, useToday, roleName } from '../../store/hooks';
import { usePoise } from '../../store/store';
import { useRun } from '../../store/useRun';
import { TaskStatusBadge } from '../status';
import { Badge, Button, Callout, Card, CardHeader, Checkbox, ConfirmDialog, EmptyState, Field, Input, Modal, ProgressBar, Select, TableWrap, Textarea } from '../ui';

const REASONS = ['Resignation', 'Retirement', 'Termination', 'End of contract / assignment', 'Job abandonment', 'Other'];

export function StartOffboardingModal({ employee, open, onClose, onStarted }: { employee: Employee; open: boolean; onClose: () => void; onStarted?: () => void }) {
  const today = useToday(employee.primaryFacilityId);
  const shifts = usePoise((s) => s.shifts);
  const timecards = usePoise((s) => s.timecards);
  const start = usePoise((s) => s.startOffboarding);
  const run = useRun();
  const [date, setDate] = useState(addDays(today, 7));
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState('');
  const [rehire, setRehire] = useState(true);
  const future = shifts.filter((s) => s.employeeId === employee.id && date && s.date > date);
  const openTc = timecards.filter((t) => t.employeeId === employee.id && t.status !== 'approved').length;
  const invalid = !date || date < employee.hireDate;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Start offboarding · ${employee.preferredName ?? employee.firstName} ${employee.lastName}`}
      description="Sets status to Offboarding, records the separation date and applies the offboarding checklist."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            icon={UserMinus}
            disabled={invalid}
            onClick={() => {
              const r = run(() => start(employee.id, { separationDate: date, reason: notes.trim() ? `${reason} — ${notes.trim()}` : reason, rehireEligible: rehire }), {
                success: 'Offboarding started',
                successBody: future.length ? `${future.length} future shift(s) after the separation date need review.` : 'No shifts are scheduled after the separation date.',
              });
              if (r.ok) {
                onClose();
                onStarted?.();
              }
            }}
          >
            Start offboarding
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Effective separation date" required htmlFor="sep" error={invalid ? 'Separation date must be on or after the hire date.' : undefined} hint="Last day of employment at this facility.">
          <Input id="sep" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Reason" htmlFor="reason">
          <Select id="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Notes (optional)" htmlFor="notes" className="sm:col-span-2">
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal note for HR" />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox checked={rehire} onChange={setRehire} label="Eligible for rehire" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Callout tone={future.length ? 'warning' : 'neutral'} title={`${future.length} scheduled shift${future.length === 1 ? '' : 's'} after ${date ? fmtDate(date, { year: true }) : 'the separation date'}`}>
          {future.length ? 'You can release them to open shifts after starting offboarding.' : 'No future shifts are affected.'}
        </Callout>
        <Callout tone="neutral" title={`${openTc} timecard${openTc === 1 ? '' : 's'} not yet approved`}>
          Final timecards must be approved before the employee can be archived. Time and PBJ history is retained.
        </Callout>
      </div>
    </Modal>
  );
}

function TaskRow({ wf, task, canEdit, today }: { wf: LifecycleWorkflow; task: LifecycleTask; canEdit: boolean; today: string }) {
  const setTaskStatus = usePoise((s) => s.setTaskStatus);
  const run = useRun();
  const unmet = unmetDependencies(wf, task);
  const deps = task.dependsOn.map((k) => wf.tasks.find((t) => t.key === k)).filter(Boolean) as LifecycleTask[];
  const done = isTaskDone(task);
  const overdue = !done && task.dueDate < today && wf.status === 'in_progress';
  const change = (status: TaskStatus) => run(() => setTaskStatus(wf.id, task.id, status), { success: status === 'done' ? 'Task completed' : 'Task updated', successBody: task.title });
  return (
    <tr className={clsx(done && 'bg-canvas/50')}>
      <td className="td min-w-64">
        <div className={clsx('font-medium', done && 'text-muted')}>{task.title}</div>
        {task.placeholderNote && <div className="mt-0.5 text-xs text-warn-700">{task.placeholderNote}</div>}
        {task.note && <div className="mt-0.5 text-xs text-muted">Note: {task.note}</div>}
        {task.completedBy && (
          <div className="mt-0.5 text-xs text-muted">
            {task.status === 'waived' ? 'Waived' : 'Marked done'} by {task.completedBy}
            {task.completedAt ? ` · ${fmtDate(task.completedAt.slice(0, 10))}` : ''}
          </div>
        )}
      </td>
      <td className="td whitespace-nowrap text-muted">{ROLE_LABEL[task.ownerRole]}</td>
      <td className={clsx('td whitespace-nowrap tabular', overdue && 'font-medium text-danger-700')}>
        {fmtDate(task.dueDate)}
        {overdue && <div className="text-xs">Overdue</div>}
      </td>
      <td className="td text-xs">
        {deps.length === 0 ? (
          <span className="text-subtle">—</span>
        ) : (
          deps.map((d) => (
            <div key={d.id} className={clsx('flex items-center gap-1', isTaskDone(d) ? 'text-muted' : 'text-warn-700')}>
              {isTaskDone(d) ? <CheckCircle2 className="size-3" aria-hidden /> : <Lock className="size-3" aria-hidden />}
              {d.title}
            </div>
          ))
        )}
      </td>
      <td className="td">
        <div className="flex flex-col items-start gap-1">
          <TaskStatusBadge status={task.status} />
          {task.blocksFirstShift && wf.kind === 'onboarding' && !done && <span className="text-[11px] text-warn-700">Blocks first shift</span>}
        </div>
      </td>
      <td className="td">
        {canEdit && wf.status === 'in_progress' && (
          <div className="flex items-center gap-1.5">
            {!done && (
              <Button size="xs" variant="subtle" icon={CheckCircle2} disabled={unmet.length > 0} title={unmet.length ? `Waiting on: ${unmet.map((u) => u.title).join(', ')}` : 'Mark task done'} onClick={() => change('done')}>
                Done
              </Button>
            )}
            <Select aria-label={`Status for ${task.title}`} value={task.status} onChange={(e) => change(e.target.value as TaskStatus)} className="h-7 w-auto py-0 text-xs">
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="blocked">Blocked</option>
              <option value="done" disabled={unmet.length > 0}>
                Done
              </option>
              <option value="waived">Waived</option>
            </Select>
          </div>
        )}
        {canEdit && wf.status === 'in_progress' && unmet.length > 0 && !done && <div className="mt-1 text-[11px] text-muted">Waiting on {unmet.length} task{unmet.length === 1 ? '' : 's'}</div>}
      </td>
    </tr>
  );
}

function TaskTable({ wf, canEdit, today }: { wf: LifecycleWorkflow; canEdit: boolean; today: string }) {
  return (
    <TableWrap>
      <thead>
        <tr>
          <th className="th">Task</th>
          <th className="th">Owner</th>
          <th className="th">Due</th>
          <th className="th">Depends on</th>
          <th className="th">Status</th>
          <th className="th">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {wf.tasks.map((t) => (
          <TaskRow key={t.id} wf={wf} task={t} canEdit={canEdit} today={today} />
        ))}
      </tbody>
    </TableWrap>
  );
}

function OnboardingCard({ wf, employee }: { wf: LifecycleWorkflow; employee: Employee }) {
  const today = useToday(employee.primaryFacilityId);
  const canTasks = useCan('lifecycle.complete_tasks');
  const canManage = useCan('lifecycle.manage');
  const complete = usePoise((s) => s.completeOnboarding);
  const run = useRun();
  const [confirm, setConfirm] = useState(false);
  const r = workflowReadiness(wf, today);
  const unverified = employee.credentials.filter((c) => c.verification !== 'verified');
  const check = canCompleteWorkflow(wf);
  const active = wf.status === 'in_progress';
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <ClipboardList className="size-4 text-brand-600" aria-hidden /> Onboarding
            {active ? <Badge tone="info">In progress</Badge> : <Badge tone="success">Completed {wf.completedAt ? fmtDate(wf.completedAt.slice(0, 10), { year: true }) : ''}</Badge>}
          </span>
        }
        subtitle={`Started ${fmtDate(wf.startedAt.slice(0, 10), { year: true })} by ${wf.startedBy} · planned first shift ${fmtDate(wf.effectiveDate, { weekday: true, year: true })}`}
        actions={
          active &&
          canManage && (
            <Button variant="primary" icon={CheckCircle2} onClick={() => setConfirm(true)}>
              Complete onboarding
            </Button>
          )
        }
      />
      {active && (
        <div className="grid gap-4 border-b border-line p-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-muted">Progress</p>
            <p className="mt-1 text-lg font-semibold tabular">
              {r.done}/{r.total} tasks
            </p>
            <ProgressBar value={r.pct} className="mt-1.5" label="Onboarding progress" />
          </div>
          <div className="md:col-span-2">
            {r.ready ? (
              <Callout tone="success" title="First-shift ready">
                All tasks that block the first shift are complete.
              </Callout>
            ) : (
              <Callout tone="warning" title={`Not first-shift ready · ${r.blockers.length} blocker${r.blockers.length === 1 ? '' : 's'}`}>
                <ul className="mt-1 list-disc pl-4">
                  {r.blockers.map((b) => (
                    <li key={b.task.id}>
                      <strong>{b.task.title}</strong> — {b.task.status === 'blocked' ? b.task.note || 'marked blocked' : b.reason.toLowerCase()}
                    </li>
                  ))}
                </ul>
              </Callout>
            )}
            {unverified.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                Credentials not yet verified: {unverified.map((c) => c.type).join(', ')}.{' '}
                <Link to="?tab=credentials" className="link">
                  Verify credentials
                </Link>
              </p>
            )}
          </div>
        </div>
      )}
      <TaskTable wf={wf} canEdit={canTasks} today={today} />
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          const res = run(() => complete(wf.id), { success: 'Onboarding complete', successBody: `${employee.firstName} ${employee.lastName} is now Active and can be scheduled.` });
          if (res.ok) setConfirm(false);
        }}
        title="Complete onboarding?"
        body={
          check.ok && unverified.length === 0
            ? `${employee.firstName} ${employee.lastName} will become Active and eligible for scheduling, subject to credential and availability checks.`
            : 'Onboarding cannot be completed yet.'
        }
        confirmLabel="Complete onboarding"
        confirmDisabled={!check.ok || unverified.length > 0}
      >
        {(!check.ok || unverified.length > 0) && (
          <Callout tone="warning" className="mt-3">
            {!check.ok && <div>{check.reason}</div>}
            {unverified.length > 0 && <div>Verify credentials first: {unverified.map((c) => c.type).join(', ')}.</div>}
          </Callout>
        )}
      </ConfirmDialog>
    </Card>
  );
}

function OffboardingCard({ wf, employee }: { wf: LifecycleWorkflow; employee: Employee }) {
  const today = useToday(employee.primaryFacilityId);
  const facs = useFacilitiesById();
  const canTasks = useCan('lifecycle.complete_tasks');
  const canManage = useCan('lifecycle.manage');
  const canSchedule = useCan('schedule.edit');
  const shifts = usePoise((s) => s.shifts);
  const timecards = usePoise((s) => s.timecards);
  const release = usePoise((s) => s.unassignShiftsAfter);
  const archive = usePoise((s) => s.completeOffboarding);
  const run = useRun();
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const active = wf.status === 'in_progress';
  const future = shifts.filter((s) => s.employeeId === employee.id && s.date > wf.effectiveDate).sort((a, b) => a.date.localeCompare(b.date));
  const beforeSep = shifts.filter((s) => s.employeeId === employee.id && s.date >= today && s.date <= wf.effectiveDate).length;
  const unapproved = timecards.filter((t) => t.employeeId === employee.id && t.status !== 'approved');
  const r = workflowReadiness(wf, today);
  const check = canCompleteWorkflow(wf);
  const archiveBlockers = [
    !check.ok ? check.reason : null,
    future.length ? `${future.length} shift(s) after the separation date are still assigned.` : null,
    unapproved.length ? `${unapproved.length} timecard(s) still need approval.` : null,
  ].filter(Boolean) as string[];

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <UserMinus className="size-4 text-warn-600" aria-hidden /> Offboarding
            {active ? <Badge tone="warning">In progress</Badge> : <Badge tone="neutral">Completed · archived</Badge>}
          </span>
        }
        subtitle={`Separation effective ${fmtDate(wf.effectiveDate, { weekday: true, year: true })} · ${wf.reason ?? ''}${wf.rehireEligible === false ? ' · not eligible for rehire' : wf.rehireEligible ? ' · eligible for rehire' : ''} · started by ${wf.startedBy}`}
        actions={
          active &&
          canManage && (
            <Button variant="danger" icon={Archive} onClick={() => setConfirmArchive(true)}>
              Archive employee
            </Button>
          )
        }
      />
      {active && (
        <div className="grid gap-4 border-b border-line p-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold">Future shifts after separation</p>
              {future.length > 0 && (canSchedule || canManage) && (
                <Button size="sm" variant="primary" onClick={() => setConfirmRelease(true)}>
                  Release {future.length} shift{future.length === 1 ? '' : 's'} to open
                </Button>
              )}
            </div>
            {future.length === 0 ? (
              <Callout tone="success" title="No shifts after the separation date">
                {beforeSep > 0 ? `${beforeSep} shift(s) remain scheduled through the separation date.` : 'Nothing else scheduled.'}
              </Callout>
            ) : (
              <ul className="divide-y divide-line rounded-md border border-warn-200 bg-warn-50/40">
                {future.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-[13px]">
                    <span>
                      <span className="font-medium">{fmtDate(s.date, { weekday: true })}</span> · {fmtLocalTime(s.start)}–{fmtLocalTime(s.end)} · {roleName(s.roleId)}
                    </span>
                    <span className="text-xs text-muted">
                      {facs[s.facilityId]?.shortName} · {SHIFT_TYPE_LABEL[s.shiftType]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-[13px] font-semibold">Final timecards & payroll handoff</p>
            <Callout tone={unapproved.length ? 'warning' : 'success'} title={unapproved.length ? `${unapproved.length} timecard${unapproved.length === 1 ? '' : 's'} not approved` : 'All timecards approved'}>
              {unapproved.length ? (
                <Link to="/time?view=pending" className="link">
                  Review in Time & Attendance
                </Link>
              ) : (
                'Ready for payroll handoff.'
              )}
            </Callout>
            <p className="text-xs text-muted">Payroll, equipment and access tasks below only record status in Poise. No payroll transaction or access revocation occurs in the prototype.</p>
            <p className="text-xs text-muted tabular">
              Checklist: {r.done}/{r.total} tasks done
            </p>
          </div>
        </div>
      )}
      <TaskTable wf={wf} canEdit={canTasks} today={today} />
      <ConfirmDialog
        open={confirmRelease}
        onClose={() => setConfirmRelease(false)}
        onConfirm={() => {
          const res = run(() => release(employee.id, wf.effectiveDate), { success: 'Shifts released', successBody: (n) => `${n} shift(s) returned to open shifts for rescheduling.` });
          if (res.ok) setConfirmRelease(false);
        }}
        title={`Release ${future.length} future shift${future.length === 1 ? '' : 's'}?`}
        body={`Shifts after ${fmtDate(wf.effectiveDate, { year: true })} will become open shifts. Changes to published weeks are flagged for the scheduler. No notifications are sent.`}
        confirmLabel="Release shifts"
      />
      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={() => {
          const res = run(() => archive(wf.id), { success: 'Employee archived', successBody: 'Time, schedule and PBJ history are retained.' });
          if (res.ok) setConfirmArchive(false);
        }}
        title="Archive this employee?"
        body="The employee will be removed from active lists and scheduling. All time, schedule, PBJ and audit history is retained."
        confirmLabel="Archive employee"
        tone="danger"
        confirmDisabled={archiveBlockers.length > 0}
      >
        {archiveBlockers.length > 0 && (
          <Callout tone="warning" className="mt-3" title="Resolve before archiving">
            <ul className="list-disc pl-4">
              {archiveBlockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Callout>
        )}
      </ConfirmDialog>
    </Card>
  );
}

export function LifecycleTab({ employee }: { employee: Employee }) {
  const workflows = usePoise((s) => s.workflows);
  const canManage = useCan('lifecycle.manage');
  const [startOpen, setStartOpen] = useState(false);
  const list = workflows
    .filter((w) => w.employeeId === employee.id)
    .sort((a, b) => (a.status === b.status ? b.startedAt.localeCompare(a.startedAt) : a.status === 'in_progress' ? -1 : 1));
  const canStartOff = canManage && (employee.status === 'active' || employee.status === 'leave');
  return (
    <div className="space-y-4">
      {canStartOff && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-white px-4 py-3">
          <p className="text-[13px] text-muted">Separating this employee? Offboarding records the separation date, reviews future shifts and final timecards, and archives the record while retaining history.</p>
          <Button icon={UserMinus} onClick={() => setStartOpen(true)}>
            Start offboarding
          </Button>
        </div>
      )}
      {list.length === 0 && (
        <Card>
          <EmptyState icon={ClipboardList} title="No lifecycle workflows" body="This record pre-dates Poise onboarding, or was created by an import." />
        </Card>
      )}
      {list.map((wf) => (wf.kind === 'onboarding' ? <OnboardingCard key={wf.id} wf={wf} employee={employee} /> : <OffboardingCard key={wf.id} wf={wf} employee={employee} />))}
      <StartOffboardingModal employee={employee} open={startOpen} onClose={() => setStartOpen(false)} />
    </div>
  );
}
