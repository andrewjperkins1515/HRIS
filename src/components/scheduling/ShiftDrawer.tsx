import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Trash2, UserMinus, UserPlus, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEPARTMENTS, DEPT_BY_ID, inferShiftType, ROLES, ROLE_BY_ID, SHIFT_TYPE_LABEL, SHIFT_TYPES } from '../../domain/catalog';
import { canCoverRole, checkEligibility, shiftPaidMinutes, type EligibilityResult } from '../../domain/scheduling';
import { fmtDate, fmtLocalTime } from '../../domain/time';
import type { DepartmentId, Employee, Facility, ISODate, Shift } from '../../domain/types';
import { employeeName, useFacilitiesById } from '../../store/hooks';
import { usePoise } from '../../store/store';
import { useRun } from '../../store/useRun';
import { Badge, Button, Callout, Checkbox, ConfirmDialog, Drawer, Field, Input, SearchInput, Select, Textarea } from '../ui';
import { EmployeeStatusBadge } from '../status';

export type DrawerState =
  | { mode: 'view'; shiftId: string }
  | { mode: 'create'; facilityId: string; date: ISODate; departmentId: DepartmentId; roleId?: string; employeeId?: string | null };

interface Props {
  state: DrawerState | null;
  onClose: () => void;
  onOpenShift: (id: string) => void;
  canEdit: boolean;
  allowedDepartments: DepartmentId[];
}

export function ShiftDrawer({ state, onClose, onOpenShift, canEdit, allowedDepartments }: Props) {
  const shift = usePoise((s) => (state?.mode === 'view' ? s.shifts.find((x) => x.id === state.shiftId) : undefined));
  if (!state) return null;
  if (state.mode === 'view' && !shift)
    return (
      <Drawer open onClose={onClose} title="Shift not found">
        <p className="text-[13px] text-muted">This shift no longer exists. It may have been deleted.</p>
      </Drawer>
    );
  const key = state.mode === 'view' ? state.shiftId : `new-${state.date}-${state.employeeId ?? ''}`;
  return <ShiftDrawerInner key={key} state={state} shift={shift} onClose={onClose} onOpenShift={onOpenShift} canEdit={canEdit} allowedDepartments={allowedDepartments} />;
}

function ShiftDrawerInner({ state, shift, onClose, onOpenShift, canEdit, allowedDepartments }: Props & { state: DrawerState; shift?: Shift }) {
  const run = useRun();
  const facs = useFacilitiesById();
  const { createShift, updateShift, deleteShift } = usePoise((s) => s);
  const isNew = state.mode === 'create';
  const base: Omit<Shift, 'id'> = shift ?? {
    facilityId: (state as Extract<DrawerState, { mode: 'create' }>).facilityId,
    departmentId: (state as Extract<DrawerState, { mode: 'create' }>).departmentId,
    roleId:
      (state as Extract<DrawerState, { mode: 'create' }>).roleId ??
      ROLES.find((r) => r.departmentId === (state as Extract<DrawerState, { mode: 'create' }>).departmentId && r.schedulable)!.id,
    date: (state as Extract<DrawerState, { mode: 'create' }>).date,
    start: '07:00',
    end: '15:00',
    shiftType: 'day',
    unpaidBreakMinutes: 30,
    employeeId: (state as Extract<DrawerState, { mode: 'create' }>).employeeId ?? null,
    notes: '',
  };
  const [form, setForm] = useState({ ...base, notes: base.notes ?? '' });
  const [editing, setEditing] = useState(isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const facility = facs[form.facilityId];
  const deptOptions = DEPARTMENTS.filter((d) => allowedDepartments.includes(d.id));
  const roleOptions = ROLES.filter((r) => r.departmentId === form.departmentId);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const preview = { ...form, id: shift?.id ?? '__new', shiftType: inferShiftType(form.start, form.end) } as Shift;
  const paid = form.start && form.end && form.start !== form.end ? shiftPaidMinutes(preview, facs) : 0;
  const crosses = form.end <= form.start;

  const save = () => {
    const payload = { ...form, shiftType: inferShiftType(form.start, form.end), notes: form.notes.trim() || undefined };
    if (isNew) {
      const r = run(() => createShift(payload), { success: 'Shift created', successBody: payload.employeeId ? undefined : 'Added as an open shift.' });
      if (r.ok) {
        if (r.error) usePoise.getState().toast({ tone: 'warning', title: 'Created as open shift', body: r.error });
        onOpenShift(r.value!);
      }
    } else {
      const { employeeId: _ignored, ...patch } = payload;
      void _ignored;
      const r = run(() => updateShift(shift!.id, patch), { success: 'Shift updated' });
      if (r.ok) setEditing(false);
    }
  };

  const title = isNew ? 'New shift' : `${ROLE_BY_ID[form.roleId]?.name ?? 'Shift'}`;
  const subtitle = (
    <span>
      {facility?.shortName} · {fmtDate(form.date, { weekday: true, year: true })} · {fmtLocalTime(form.start)}–{fmtLocalTime(form.end)}
      {crosses ? ' (ends next day)' : ''}
    </span>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      width="lg"
      footer={
        editing ? (
          <>
            <Button onClick={isNew ? onClose : () => { setForm({ ...base, notes: base.notes ?? '' }); setEditing(false); }}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={!form.date || !form.start || !form.end || form.start === form.end}>
              {isNew ? (form.employeeId ? 'Create & assign' : 'Create open shift') : 'Save changes'}
            </Button>
          </>
        ) : canEdit && shift ? (
          <>
            <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)} className="mr-auto text-danger-700">
              Delete
            </Button>
            <Button onClick={() => setEditing(true)}>Edit shift details</Button>
          </>
        ) : undefined
      }
    >
      {!canEdit && <Callout tone="neutral" className="mb-4" title="Read-only">Your demo role can view schedules but not change them.</Callout>}
      {shift?.changedAfterPublish && (
        <Callout tone="warning" className="mb-4" title="Changed since the schedule was published">
          Republish the week to make this change part of the published schedule.
        </Callout>
      )}

      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Department" htmlFor="sd-dept">
            <Select
              id="sd-dept"
              value={form.departmentId}
              onChange={(e) => {
                const d = e.target.value as DepartmentId;
                const r = ROLES.find((x) => x.departmentId === d && x.schedulable) ?? ROLES.find((x) => x.departmentId === d)!;
                setForm((f) => ({ ...f, departmentId: d, roleId: r.id }));
              }}
            >
              {deptOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Role" htmlFor="sd-role">
            <Select id="sd-role" value={form.roleId} onChange={(e) => set('roleId', e.target.value)}>
              {roleOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.sourceJobCode})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="sd-date" hint="Facility-local date the shift starts">
            <Input id="sd-date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Preset">
            <div className="flex flex-wrap gap-1.5">
              {SHIFT_TYPES.map((t) => (
                <Button key={t.id} size="xs" variant={form.start === t.start && form.end === t.end ? 'subtle' : 'secondary'} onClick={() => setForm((f) => ({ ...f, start: t.start, end: t.end }))}>
                  {t.label} {fmtLocalTime(t.start)}–{fmtLocalTime(t.end)}
                </Button>
              ))}
            </div>
          </Field>
          <Field label="Start" htmlFor="sd-start">
            <Input id="sd-start" type="time" value={form.start} onChange={(e) => set('start', e.target.value)} />
          </Field>
          <Field label="End" htmlFor="sd-end" hint={crosses ? 'Ends the next calendar day' : undefined}>
            <Input id="sd-end" type="time" value={form.end} onChange={(e) => set('end', e.target.value)} />
          </Field>
          <Field label="Unpaid break (minutes)" htmlFor="sd-break">
            <Input id="sd-break" type="number" min={0} max={120} step={15} value={form.unpaidBreakMinutes} onChange={(e) => set('unpaidBreakMinutes', Math.max(0, Number(e.target.value) || 0))} />
          </Field>
          <Field label="Scheduled paid hours">
            <p className="py-1.5 text-[13.5px] tabular">
              {(paid / 60).toFixed(2)} h · {SHIFT_TYPE_LABEL[inferShiftType(form.start, form.end)]}
              <span className="block text-xs text-muted">Calculated in {facility?.timeZone} (DST-aware). Scheduled hours never become worked hours.</span>
            </p>
          </Field>
          <Field label="Notes" htmlFor="sd-notes" className="sm:col-span-2">
            <Textarea id="sd-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
          </Field>
          {isNew && form.employeeId && (
            <Callout tone="info" className="sm:col-span-2">
              Will be assigned to {employeeName(usePoise.getState().employees.find((e) => e.id === form.employeeId))} if eligibility checks pass; otherwise it is created as an open shift.
            </Callout>
          )}
        </div>
      ) : (
        shift && <ShiftSummary shift={shift} facility={facility} />
      )}

      {!isNew && shift && <Assignment shift={shift} canEdit={canEdit} />}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          const r = run(() => deleteShift(shift!.id), { success: 'Shift deleted' });
          setConfirmDelete(false);
          if (r.ok) onClose();
        }}
        title="Delete this shift?"
        body="The shift is removed from the schedule and the change is recorded in the activity log. Shifts with time records cannot be deleted."
        confirmLabel="Delete shift"
        tone="danger"
      />
    </Drawer>
  );
}

function ShiftSummary({ shift, facility }: { shift: Shift; facility: Facility }) {
  const facs = useFacilitiesById();
  const paid = shiftPaidMinutes(shift, facs);
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      {[
        ['Department', DEPT_BY_ID[shift.departmentId].name],
        ['Role', `${ROLE_BY_ID[shift.roleId]?.name} (${ROLE_BY_ID[shift.roleId]?.sourceJobCode})`],
        ['Shift', `${SHIFT_TYPE_LABEL[shift.shiftType]} · ${fmtLocalTime(shift.start)}–${fmtLocalTime(shift.end)}${shift.end <= shift.start ? ' → next day' : ''}`],
        ['Paid hours', `${(paid / 60).toFixed(2)} h (${shift.unpaidBreakMinutes}m unpaid break)`],
        ['Facility', facility.name],
        ['Time zone', facility.timeZone],
        ['Notes', shift.notes || '—'],
      ].map(([k, v]) => (
        <div key={k} className={k === 'Notes' || k === 'Facility' ? 'col-span-2' : ''}>
          <dt className="text-xs font-medium text-muted">{k}</dt>
          <dd className="mt-0.5 text-[13.5px]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Assignment({ shift, canEdit }: { shift: Shift; canEdit: boolean }) {
  const run = useRun();
  const facs = useFacilitiesById();
  const { employees, shifts, timeOff, assignShift, unassignShift } = usePoise((s) => s);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [confirmUnassign, setConfirmUnassign] = useState(false);
  const ctx = useMemo(() => ({ facilities: facs, shifts, timeOff }), [facs, shifts, timeOff]);
  const assigned = shift.employeeId ? employees.find((e) => e.id === shift.employeeId) : undefined;
  const assignedCheck = assigned ? checkEligibility(assigned, shift, ctx) : null;

  const candidates = useMemo(() => {
    const list = employees.filter(
      (e) =>
        e.id !== shift.employeeId &&
        e.status !== 'archived' &&
        [e.primaryFacilityId, ...e.additionalFacilityIds].includes(shift.facilityId) &&
        (showAll || canCoverRole(e.roleId, shift.roleId)) &&
        (!q || employeeName(e).toLowerCase().includes(q.toLowerCase())),
    );
    return list
      .map((e) => ({ e, r: checkEligibility(e, shift, ctx) }))
      .sort((a, b) => Number(b.r.ok) - Number(a.r.ok) || a.r.warnings.length - b.r.warnings.length || a.r.weekMinutesAfter - b.r.weekMinutesAfter);
  }, [employees, shift, ctx, q, showAll]);

  return (
    <section className="mt-6 border-t border-line pt-5">
      <h3 className="text-[14px] font-semibold">Assignment</h3>
      {assigned ? (
        <div className="mt-2 rounded-md border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Link to={`/people/${assigned.id}`} className="link text-[13.5px]">
                {employeeName(assigned)}
              </Link>
              <p className="text-xs text-muted">
                {ROLE_BY_ID[assigned.roleId]?.name} · {(assignedCheck!.weekMinutesAfter / 60).toFixed(1)}h scheduled this week (all facilities)
              </p>
            </div>
            {canEdit && (
              <Button size="sm" icon={UserMinus} onClick={() => setConfirmUnassign(true)}>
                Unassign
              </Button>
            )}
          </div>
          <EligibilityDetail r={assignedCheck!} ignoreSelfOverlap />
        </div>
      ) : (
        <p className="mt-1 text-[13px] text-muted">This is an open shift. Choose an eligible employee below.</p>
      )}

      {canEdit && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput value={q} onChange={setQ} placeholder="Search employees" className="w-full sm:w-64" label="Search candidates" />
            <Checkbox checked={showAll} onChange={setShowAll} label="Include other roles" />
          </div>
          <p className="mt-2 text-xs text-muted">
            Eligibility checks status, facility assignment, role, required credentials, availability, time off, overlapping assignments, rest and weekly hours. Demo rules only.
          </p>
          <ul className="mt-2 divide-y divide-line rounded-md border border-line">
            {candidates.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">No employees match.</li>}
            {candidates.map(({ e, r }) => (
              <li key={e.id} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {r.ok ? <CheckCircle2 className="size-4 text-ok-600" aria-label="Eligible" /> : <XCircle className="size-4 text-danger-600" aria-label="Not eligible" />}
                      <span className="text-[13.5px] font-medium">{employeeName(e)}</span>
                      <span className="text-xs text-muted">{ROLE_BY_ID[e.roleId]?.sourceJobCode}</span>
                      {e.workerType !== 'employee' && <Badge tone="mint">{e.workerType === 'agency' ? 'Agency' : 'Contract'}</Badge>}
                      {e.status !== 'active' && <EmployeeStatusBadge status={e.status} />}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{(r.weekMinutesAfter / 60).toFixed(1)}h this week if assigned</p>
                    <EligibilityDetail r={r} />
                  </div>
                  <Button
                    size="sm"
                    variant={r.ok ? 'primary' : 'secondary'}
                    icon={UserPlus}
                    disabled={!r.ok}
                    title={r.ok ? undefined : r.blocking.join(' ')}
                    onClick={() =>
                      run(() => assignShift(shift.id, e.id), {
                        success: `${employeeName(e)} assigned`,
                        successBody: (v) => (v?.warnings.length ? `Warnings: ${v.warnings.join(' ')}` : undefined),
                      })
                    }
                  >
                    {assigned ? 'Reassign' : 'Assign'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ConfirmDialog
        open={confirmUnassign}
        onClose={() => setConfirmUnassign(false)}
        onConfirm={() => {
          run(() => unassignShift(shift.id), { success: 'Shift unassigned', successBody: 'It is now an open shift.' });
          setConfirmUnassign(false);
        }}
        title="Unassign this shift?"
        body={`${employeeName(assigned)} will be removed and the shift becomes open. No notification is sent in this prototype.`}
        confirmLabel="Unassign"
      />
    </section>
  );
}

function EligibilityDetail({ r, ignoreSelfOverlap }: { r: EligibilityResult; ignoreSelfOverlap?: boolean }) {
  const blocking = ignoreSelfOverlap ? r.blocking : r.blocking;
  if (!blocking.length && !r.warnings.length) return null;
  return (
    <ul className="mt-1.5 space-y-0.5">
      {blocking.map((b) => (
        <li key={b} className={clsx('flex gap-1.5 text-xs text-danger-700')}>
          <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {b}
        </li>
      ))}
      {r.warnings.map((w) => (
        <li key={w} className="flex gap-1.5 text-xs text-warn-700">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {w}
        </li>
      ))}
    </ul>
  );
}
