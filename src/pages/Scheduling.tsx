import clsx from 'clsx';
import { AlertTriangle, CalendarCheck2, ChevronLeft, ChevronRight, CircleDot, History, Plus, Send } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { ShiftDrawer, type DrawerState } from '../components/scheduling/ShiftDrawer';
import { Badge, Button, Callout, Card, CardHeader, ConfirmDialog, DeptDot, EmptyState, PageHeader, SearchInput, Segmented, Select } from '../components/ui';
import { DEPARTMENTS, DEPT_BY_ID, ROLES, ROLE_BY_ID, SHIFT_TYPE_LABEL } from '../domain/catalog';
import { coverageFor, employeeWeekMinutes, findScheduleConflicts, OVERTIME_WEEKLY_MINUTES, summarizeCoverage, type ScheduleConflict } from '../domain/scheduling';
import { addDays, dateRange, dayOfWeek, fmtDate, fmtDateTime, fmtDow, fmtLocalTime, weekStartOf } from '../domain/time';
import type { DepartmentId, Employee, Shift, ShiftType } from '../domain/types';
import { employeeName, useCan, useEmployeesById, useFacilitiesById, useScopedFacilities, useToday, useUser } from '../store/hooks';
import { usePoise } from '../store/store';
import { useRun } from '../store/useRun';

const TYPE_STYLE: Record<ShiftType, string> = {
  day: 'bg-brand-50 border-brand-200 text-brand-900',
  evening: 'bg-amber-50 border-amber-200 text-amber-900',
  night: 'bg-indigo-50 border-indigo-200 text-indigo-900',
  overnight: 'bg-violet-50 border-violet-200 text-violet-900',
};

type ViewFilter = 'all' | 'open' | 'conflicts';

export default function SchedulingPage() {
  const [params, setParams] = useSearchParams();
  const user = useUser();
  const canEdit = useCan('schedule.edit');
  const canPublish = useCan('schedule.publish');
  const run = useRun();
  const scoped = useScopedFacilities();
  const facs = useFacilitiesById();
  const empsById = useEmployeesById();
  const { shifts, scheduleWeeks, coverageTargets, timeOff, audit, employees, publishWeek } = usePoise(
    useShallow((s) => ({
      shifts: s.shifts,
      scheduleWeeks: s.scheduleWeeks,
      coverageTargets: s.coverageTargets,
      timeOff: s.timeOff,
      audit: s.audit,
      employees: s.employees,
      publishWeek: s.publishWeek,
    })),
  );

  // ---------- facility & week ----------
  const shiftParam = params.get('shift');
  const linkedShift = shiftParam ? shifts.find((s) => s.id === shiftParam) : undefined;
  const [pickedFacility, setPickedFacility] = useState<string | null>(null);
  const facilityId =
    (linkedShift && scoped.some((f) => f.id === linkedShift.facilityId) ? linkedShift.facilityId : null) ??
    (pickedFacility && scoped.some((f) => f.id === pickedFacility) ? pickedFacility : scoped[0]?.id);
  const facility = facs[facilityId];
  const today = useToday(facilityId);
  const weekStart = weekStartOf(params.get('week') || today);
  const days = dateRange(weekStart, addDays(weekStart, 6));
  const filter = (params.get('filter') as ViewFilter) || 'all';

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: k !== 'week' });
  };

  // ---------- filters ----------
  const allowedDepts = (user.departmentIds ?? DEPARTMENTS.map((d) => d.id)) as DepartmentId[];
  const [dept, setDept] = useState<'all' | DepartmentId>(allowedDepts.length === 1 ? allowedDepts[0] : 'all');
  const [role, setRole] = useState<string>('all');
  const [q, setQ] = useState('');
  const visibleDepts = dept === 'all' ? allowedDepts : [dept];
  useEffect(() => setRole('all'), [dept]);

  // ---------- drawer ----------
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  useEffect(() => {
    if (shiftParam && shifts.some((s) => s.id === shiftParam)) setDrawer({ mode: 'view', shiftId: shiftParam });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftParam]);
  const openShift = (id: string) => {
    setDrawer({ mode: 'view', shiftId: id });
    setParam('shift', id);
  };
  const closeDrawer = () => {
    setDrawer(null);
    setParam('shift', null);
  };

  // ---------- derived ----------
  const weekShifts = useMemo(
    () => shifts.filter((s) => s.facilityId === facilityId && s.date >= weekStart && s.date <= days[6] && visibleDepts.includes(s.departmentId) && (role === 'all' || s.roleId === role)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shifts, facilityId, weekStart, dept, role, user],
  );
  const ctx = useMemo(() => ({ facilities: facs, shifts, timeOff }), [facs, shifts, timeOff]);
  const conflicts = useMemo(
    () => (facilityId ? findScheduleConflicts(weekStart, shifts, empsById, ctx, [facilityId]).filter((c) => c.shiftIds.some((id) => weekShifts.some((s) => s.id === id))) : []),
    [weekStart, shifts, empsById, ctx, facilityId, weekShifts],
  );
  const conflictsByShift = useMemo(() => {
    const m = new Map<string, ScheduleConflict[]>();
    for (const c of conflicts) if (c.kind !== 'overtime') for (const id of c.shiftIds) m.set(id, [...(m.get(id) ?? []), c]);
    return m;
  }, [conflicts]);
  const conflictEmpIds = new Set(conflicts.map((c) => c.employeeId));
  // Group repeated messages (e.g. an expired credential on every shift) into one row.
  const groupedConflicts = useMemo(() => {
    const m = new Map<string, ScheduleConflict>();
    for (const c of conflicts) {
      const k = `${c.kind}|${c.employeeId}|${c.message}`;
      const g = m.get(k);
      if (g) g.shiftIds = [...new Set([...g.shiftIds, ...c.shiftIds])];
      else m.set(k, { ...c, shiftIds: [...c.shiftIds] });
    }
    return [...m.values()];
  }, [conflicts]);

  const week = scheduleWeeks.find((w) => w.id === `${facilityId}:${weekStart}`);
  const status = week?.status ?? 'draft';
  const allWeekShifts = shifts.filter((s) => s.facilityId === facilityId && s.date >= weekStart && s.date <= days[6]);
  const changes = allWeekShifts.filter((s) => s.changedAfterPublish).length;
  const openCount = allWeekShifts.filter((s) => !s.employeeId && visibleDepts.includes(s.departmentId)).length;

  // Employee rows: facility staff in visible departments + anyone assigned this week.
  const rowsByDept = useMemo(() => {
    const assignedIds = new Set(weekShifts.filter((s) => s.employeeId).map((s) => s.employeeId!));
    const list = employees.filter((e) => {
      if (assignedIds.has(e.id)) return true;
      if (e.status === 'archived') return false;
      if (![e.primaryFacilityId, ...e.additionalFacilityIds].includes(facilityId)) return false;
      if (!ROLE_BY_ID[e.roleId]?.schedulable) return false;
      if (!visibleDepts.includes(e.departmentId)) return false;
      if (role !== 'all' && e.roleId !== role) return false;
      if (e.workerType !== 'employee' && !assignedIds.has(e.id) && e.employmentType === 'prn') return true;
      return true;
    });
    const filtered = list.filter((e) => (!q || employeeName(e).toLowerCase().includes(q.toLowerCase())) && (filter !== 'conflicts' || conflictEmpIds.has(e.id)));
    const byDept = new Map<DepartmentId, Employee[]>();
    for (const e of filtered) {
      const d = weekShifts.find((s) => s.employeeId === e.id)?.departmentId ?? e.departmentId;
      if (!visibleDepts.includes(d)) continue;
      byDept.set(d, [...(byDept.get(d) ?? []), e]);
    }
    for (const [, arr] of byDept) arr.sort((a, b) => ROLES.findIndex((r) => r.id === a.roleId) - ROLES.findIndex((r) => r.id === b.roleId) || a.lastName.localeCompare(b.lastName));
    return byDept;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, weekShifts, facilityId, dept, role, q, filter, conflicts, user]);

  const coverageCells = useMemo(() => (facilityId ? coverageFor(facilityId, days, shifts, coverageTargets, visibleDepts) : []), [facilityId, days.join(), shifts, coverageTargets, dept, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const coverage = summarizeCoverage(coverageCells);

  const recent = audit.filter((a) => a.facilityId === facilityId && (a.entityType === 'schedule' || a.entityType === 'shift')).slice(0, 6);
  const [confirmPublish, setConfirmPublish] = useState(false);

  if (!facility) return <EmptyState title="No facility in scope" />;

  const createAt = (date: string, employee?: Employee) =>
    setDrawer({
      mode: 'create',
      facilityId,
      date,
      departmentId: employee?.departmentId ?? (dept === 'all' ? allowedDepts[0] : dept),
      roleId: employee?.roleId ?? (role !== 'all' ? role : undefined),
      employeeId: employee?.id ?? null,
    });

  return (
    <div>
      <PageHeader
        title="Scheduling"
        description="Weekly department schedules. Assignments are checked against demo eligibility rules; publishing records a demo activity event and sends no notifications."
        actions={
          <>
            {canEdit && (
              <Button icon={Plus} onClick={() => createAt(today >= weekStart && today <= days[6] ? today : weekStart)}>
                New shift
              </Button>
            )}
            {canPublish && (
              <Button variant="primary" icon={Send} onClick={() => setConfirmPublish(true)} disabled={status === 'published' && changes === 0}>
                {status === 'published' ? (changes ? `Republish (${changes} change${changes === 1 ? '' : 's'})` : 'Published') : 'Publish week'}
              </Button>
            )}
          </>
        }
      />

      {/* Toolbar */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
          {scoped.length > 1 && (
            <Select aria-label="Facility" value={facilityId} onChange={(e) => { setPickedFacility(e.target.value); setParam('shift', null); }} className="h-8 w-auto py-0 text-[13px] font-medium">
              {scoped.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          )}
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" icon={ChevronLeft} aria-label="Previous week" onClick={() => setParam('week', addDays(weekStart, -7))} />
            <Button size="sm" onClick={() => setParam('week', null)}>
              Today
            </Button>
            <Button size="sm" variant="ghost" icon={ChevronRight} aria-label="Next week" onClick={() => setParam('week', addDays(weekStart, 7))} />
            <span className="ml-1 text-[14px] font-semibold tabular">
              {fmtDate(weekStart)} – {fmtDate(days[6], { year: true })}
            </span>
          </div>
          {status === 'published' ? (
            <Badge tone={changes ? 'warning' : 'success'} dot>
              Published{changes ? ` · ${changes} change${changes === 1 ? '' : 's'} since publish` : ''}
            </Badge>
          ) : (
            <Badge tone="neutral" dot>
              Draft
            </Badge>
          )}
          {week?.publishedAt && <span className="text-xs text-muted">by {week.publishedBy}, {fmtDateTime(week.publishedAt, facility.timeZone)}</span>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value as 'all' | DepartmentId)} className="h-8 w-auto py-0 text-[13px]" disabled={allowedDepts.length === 1}>
              {allowedDepts.length > 1 && <option value="all">All departments</option>}
              {allowedDepts.map((d) => (
                <option key={d} value={d}>
                  {DEPT_BY_ID[d].name}
                </option>
              ))}
            </Select>
            <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} className="h-8 w-auto py-0 text-[13px]">
              <option value="all">All roles</option>
              {ROLES.filter((r) => visibleDepts.includes(r.departmentId) && r.schedulable).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <SearchInput value={q} onChange={setQ} placeholder="Find employee" className="w-44" label="Find employee" />
            <Segmented<ViewFilter>
              label="View"
              value={filter}
              onChange={(v) => setParam('filter', v === 'all' ? null : v)}
              options={[
                { value: 'all', label: 'All' },
                { value: 'open', label: 'Open', count: openCount },
                { value: 'conflicts', label: 'Conflicts', count: groupedConflicts.length },
              ]}
            />
          </div>
        </div>
      </Card>

      {!canEdit && <Callout tone="neutral" className="mb-4" title="Read-only view">Your demo role can view schedules. Scheduling changes require a scheduler or administrator role.</Callout>}

      {/* Conflicts */}
      {conflicts.length > 0 && (filter === 'conflicts' || filter === 'all') && (
        <Card className="mb-4">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-warn-600" aria-hidden /> Schedule warnings ({groupedConflicts.length})
              </span>
            }
            subtitle="Overlapping assignments, ineligible assignments and overtime projections for this week."
          />
          <ul className="divide-y divide-line">
            {groupedConflicts.map((c, i) => {
              const e = empsById[c.employeeId];
              const targets = c.shiftIds
                .map((id) => shifts.find((s) => s.id === id))
                .filter((s): s is Shift => !!s && s.facilityId === facilityId && s.date >= weekStart && s.date <= days[6])
                .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
              return (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[13px]">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge tone={c.kind === 'overtime' ? 'warning' : 'danger'}>{c.kind === 'overlap' ? 'Overlap' : c.kind === 'overtime' ? 'Overtime' : 'Ineligible'}</Badge>
                    <span className="font-medium">{employeeName(e)}</span>
                    <span className="text-muted">{c.message}</span>
                  </span>
                  {c.kind !== 'overtime' && targets.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {targets.map((t) => (
                        <Button key={t.id} size="xs" variant="subtle" onClick={() => openShift(t.id)}>
                          {fmtDow(t.date)} {fmtLocalTime(t.start)}
                        </Button>
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Grid */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-[12.5px]">
            <thead>
              <tr>
                <th className="th sticky left-0 z-[2] w-52 bg-canvas">Employee</th>
                {days.map((d) => (
                  <th key={d} className={clsx('th text-center', d === today && 'bg-brand-50 text-brand-800')}>
                    <span className="block">{fmtDow(d)}</span>
                    <span className="block text-[13px] font-semibold text-ink tabular">{fmtDate(d)}</span>
                  </th>
                ))}
                <th className="th w-20 text-right">Hours</th>
              </tr>
            </thead>
            <tbody>
              {visibleDepts.map((d) => {
                const emps = rowsByDept.get(d) ?? [];
                const openShifts = weekShifts.filter((s) => !s.employeeId && s.departmentId === d);
                if (filter === 'open' && !openShifts.length) return null;
                if (filter !== 'open' && !emps.length && !openShifts.length) return null;
                return (
                  <Fragment key={d}>
                    <tr>
                      <td colSpan={9} className="sticky left-0 border-b border-line bg-white px-3 pt-3 pb-1.5">
                        <span className="flex items-center gap-2 text-[13px] font-semibold">
                          <DeptDot color={DEPT_BY_ID[d].color} />
                          {DEPT_BY_ID[d].name}
                          <span className="font-normal text-muted">· {emps.length} staff</span>
                        </span>
                      </td>
                    </tr>
                    {openShifts.length > 0 && (
                    <tr className="bg-warn-50/40">
                      <td className="td sticky left-0 z-[1] bg-[#fffbf2] font-medium text-warn-700">
                        Open shifts
                        <span className="block text-[11px] font-normal text-muted">{openShifts.length} this week</span>
                      </td>
                      {days.map((day) => (
                        <td key={day} className="td align-top">
                          <div className="flex flex-col gap-1">
                            {openShifts
                              .filter((s) => s.date === day)
                              .map((s) => (
                                <ShiftChip key={s.id} shift={s} open onClick={() => openShift(s.id)} warn={conflictsByShift.get(s.id)} />
                              ))}
                          </div>
                        </td>
                      ))}
                      <td className="td" />
                    </tr>
                    )}
                    {filter !== 'open' &&
                      emps.map((e) => {
                        const minutes = employeeWeekMinutes(e.id, weekStart, shifts, facs);
                        const ot = e.payType === 'nonexempt' && minutes > OVERTIME_WEEKLY_MINUTES;
                        return (
                          <tr key={e.id} className="group">
                            <td className="td sticky left-0 z-[1] bg-white group-hover:bg-canvas">
                              <div className="font-medium text-ink">{employeeName(e)}</div>
                              <div className="flex flex-wrap items-center gap-1 text-[11.5px] text-muted">
                                {ROLE_BY_ID[e.roleId]?.sourceJobCode}
                                {e.workerType !== 'employee' && <Badge tone="mint" className="px-1.5 py-0 text-[10.5px]">{e.workerType === 'agency' ? 'Agency' : 'Contract'}</Badge>}
                                {e.status !== 'active' && <Badge tone={e.status === 'offboarding' ? 'warning' : 'info'} className="px-1.5 py-0 text-[10.5px]">{e.status === 'offboarding' ? `Leaves ${fmtDate(e.separationDate!)}` : e.status}</Badge>}
                              </div>
                            </td>
                            {days.map((day) => {
                              const cellShifts = weekShifts.filter((s) => s.employeeId === e.id && s.date === day);
                              const otherFac = shifts.filter((s) => s.employeeId === e.id && s.date === day && s.facilityId !== facilityId);
                              const avail = e.availability[dayOfWeek(day)];
                              const to = timeOff.find((t) => t.employeeId === e.id && t.status !== 'denied' && day >= t.startDate && day <= t.endDate);
                              return (
                                <td
                                  key={day}
                                  className={clsx('td relative align-top', day === today && 'bg-brand-50/30', avail === 'unavailable' && 'bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,#eef2f4_5px,#eef2f4_10px)]')}
                                  title={avail === 'unavailable' ? 'Marked unavailable' : undefined}
                                >
                                  <div className="flex min-h-9 flex-col gap-1">
                                    {to && (
                                      <span className={clsx('rounded px-1.5 py-0.5 text-[11px] font-medium', to.status === 'approved' ? 'bg-silver-100 text-ink' : 'border border-dashed border-warn-200 text-warn-700')}>
                                        {to.category} {to.status === 'pending' ? '(pending)' : ''}
                                      </span>
                                    )}
                                    {cellShifts.map((s) => (
                                      <ShiftChip key={s.id} shift={s} employee={e} onClick={() => openShift(s.id)} warn={conflictsByShift.get(s.id)} />
                                    ))}
                                    {otherFac.map((s) => (
                                      <span key={s.id} className="rounded border border-dashed border-line-strong px-1.5 py-0.5 text-[11px] text-muted" title="Assigned at another facility">
                                        {facs[s.facilityId]?.shortName} {fmtLocalTime(s.start)}–{fmtLocalTime(s.end)}
                                      </span>
                                    ))}
                                    {avail === 'unavailable' && !cellShifts.length && <span className="text-[11px] text-subtle">Unavailable</span>}
                                    {canEdit && !cellShifts.length && e.status !== 'archived' && (
                                      <button
                                        onClick={() => createAt(day, e)}
                                        className="flex h-6 items-center justify-center rounded text-subtle opacity-0 group-hover:opacity-100 hover:bg-brand-50 hover:text-brand-700 focus:opacity-100"
                                        aria-label={`Add shift for ${employeeName(e)} on ${fmtDate(day)}`}
                                      >
                                        <Plus className="size-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            <td className={clsx('td text-right tabular', ot ? 'font-semibold text-warn-700' : 'text-ink')} title={ot ? 'Over 40 scheduled hours (non-exempt)' : 'Scheduled paid hours this week, all facilities'}>
                              {(minutes / 60).toFixed(1)}
                              {ot && <span className="block text-[10.5px] font-medium">Overtime</span>}
                            </td>
                          </tr>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {visibleDepts.every((d) => !(rowsByDept.get(d)?.length) && !weekShifts.some((s) => !s.employeeId && s.departmentId === d)) && (
            <EmptyState icon={CalendarCheck2} title={filter === 'open' ? 'No open shifts this week' : filter === 'conflicts' ? 'No schedule conflicts this week' : 'No shifts match these filters'} />
          )}
        </div>
      </Card>

      {/* Coverage */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={`Coverage · ${coverage.assigned}/${coverage.required} target slots assigned`}
            subtitle="Facility-defined planning target — not a regulatory determination. Shown as assigned / target; open shifts in parentheses."
          />
          {coverageCells.length === 0 ? (
            <EmptyState title="No planning targets for these departments" body="Targets can be configured in Settings." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-0 text-[12.5px]">
                <thead>
                  <tr>
                    <th className="th">Department · shift</th>
                    {days.map((d) => (
                      <th key={d} className={clsx('th text-center', d === today && 'text-brand-800')}>
                        {fmtDow(d)} {fmtDate(d).split(' ')[1]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coverageTargets
                    .filter((t) => t.facilityId === facilityId && visibleDepts.includes(t.departmentId))
                    .map((t) => (
                      <tr key={t.id}>
                        <td className="td whitespace-nowrap">
                          <span className="flex items-center gap-2">
                            <DeptDot color={DEPT_BY_ID[t.departmentId].color} />
                            {DEPT_BY_ID[t.departmentId].shortName} · {SHIFT_TYPE_LABEL[t.shiftType]}
                            <span className="text-muted">(target {t.required})</span>
                          </span>
                        </td>
                        {days.map((d) => {
                          const c = coverageCells.find((x) => x.date === d && x.departmentId === t.departmentId && x.shiftType === t.shiftType)!;
                          const short = c.assigned < c.required;
                          return (
                            <td key={d} className="td text-center tabular">
                              <span className={clsx('inline-block min-w-12 rounded px-1.5 py-0.5', short ? 'bg-warn-50 font-semibold text-warn-700' : 'text-ink')}>
                                {c.assigned}/{c.required}
                                {c.open > 0 && <span className="font-normal text-muted"> ({c.open})</span>}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><History className="size-4 text-muted" aria-hidden />Schedule activity</span>} subtitle={facility.name} />
          {recent.length === 0 ? (
            <EmptyState title="No schedule activity yet" />
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((a) => (
                <li key={a.id} className="px-4 py-2 text-[12.5px]">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{a.action}</span>
                    <span className="shrink-0 text-muted">{fmtDateTime(a.at, facility.timeZone)}</span>
                  </div>
                  <p className="text-muted">
                    {a.actor} · {a.detail}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[11.5px] text-muted">
        {(['day', 'evening', 'night', 'overnight'] as ShiftType[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={clsx('inline-block size-3 rounded border', TYPE_STYLE[t])} />
            {SHIFT_TYPE_LABEL[t]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded bg-[repeating-linear-gradient(135deg,transparent,transparent_2px,#dfe8eb_2px,#dfe8eb_4px)]" /> Unavailable
        </span>
        <span className="flex items-center gap-1.5">
          <CircleDot className="size-3 text-warn-600" /> Changed since publish
        </span>
        <span>Times shown in {facility.timeZone}.</span>
      </div>

      <ShiftDrawer state={drawer} onClose={closeDrawer} onOpenShift={openShift} canEdit={canEdit} allowedDepartments={allowedDepts} />

      <ConfirmDialog
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        onConfirm={() => {
          run(() => publishWeek(facilityId, weekStart), { success: 'Schedule published', successBody: 'Recorded in the activity log. No notifications were sent (prototype).' });
          setConfirmPublish(false);
        }}
        title={`Publish week of ${fmtDate(weekStart, { year: true })}?`}
        confirmLabel="Publish"
      >
        <div className="space-y-3 text-[13.5px] text-muted">
          <p>
            The {facility.name} schedule for {fmtDate(weekStart)} – {fmtDate(days[6])} will change to <strong className="text-ink">Published</strong> and a demo activity event will be recorded.
          </p>
          <p>This prototype does not send texts, emails or push notifications to staff.</p>
          {(openCount > 0 || conflicts.length > 0) && (
            <Callout tone="warning" title="You can still publish">
              {openCount > 0 && `${openCount} open shift${openCount === 1 ? '' : 's'} remain. `}
              {conflicts.length > 0 && `${groupedConflicts.length} schedule warning${groupedConflicts.length === 1 ? '' : 's'} unresolved.`}
            </Callout>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}

function ShiftChip({ shift, employee, open, onClick, warn }: { shift: Shift; employee?: Employee; open?: boolean; onClick: () => void; warn?: ScheduleConflict[] }) {
  const crosses = shift.end <= shift.start;
  const covering = employee && employee.roleId !== shift.roleId;
  const role = ROLE_BY_ID[shift.roleId];
  const hasWarn = !!warn?.length;
  return (
    <button
      onClick={onClick}
      title={[`${role?.name} · ${SHIFT_TYPE_LABEL[shift.shiftType]} ${fmtLocalTime(shift.start)}–${fmtLocalTime(shift.end)}${crosses ? ' (ends next day)' : ''}`, shift.notes, ...(warn ?? []).map((w) => w.message), shift.changedAfterPublish ? 'Changed since publish' : ''].filter(Boolean).join('\n')}
      className={clsx(
        'relative w-full rounded border px-1.5 py-1 text-left leading-tight transition-shadow hover:shadow-card focus-visible:outline-2',
        open ? 'border-dashed border-warn-600/50 bg-white text-warn-700' : TYPE_STYLE[shift.shiftType],
        hasWarn && 'ring-1 ring-danger-600',
      )}
    >
      <span className="flex items-center justify-between gap-1">
        <span className="font-semibold tabular">
          {fmtLocalTime(shift.start)}–{fmtLocalTime(shift.end)}
        </span>
        <span className="flex items-center gap-0.5">
          {shift.changedAfterPublish && <CircleDot className="size-3 text-warn-600" aria-label="Changed since publish" />}
          {hasWarn && <AlertTriangle className="size-3 text-danger-600" aria-label="Schedule warning" />}
        </span>
      </span>
      <span className="block truncate text-[10.5px] opacity-80">
        {open ? role?.sourceJobCode : covering ? `Covering ${role?.sourceJobCode}` : SHIFT_TYPE_LABEL[shift.shiftType]}
        {crosses ? ' → next day' : ''}
      </span>
    </button>
  );
}
