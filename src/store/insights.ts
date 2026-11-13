/**
 * Cross-module operational insights, calculated from the shared demo records.
 * Used by the Overview dashboard and the notification/task indicator so both always agree
 * with the detail screens.
 */
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DEPARTMENTS } from '../domain/catalog';
import { workflowReadiness } from '../domain/lifecycle';
import { preparationStatus, type PbjResult, type PbjStatusSummary } from '../domain/pbj/engine';
import { coverageFor, employeeWeekMinutes, OVERTIME_WEEKLY_MINUTES, summarizeCoverage, type CoverageCell } from '../domain/scheduling';
import { addDays, dateRange, daysBetween, fiscalQuarterOf, weekStartOf } from '../domain/time';
import type { DepartmentId, Employee, Facility, LifecycleWorkflow, Shift } from '../domain/types';
import { useFacilitiesById, useScopedEmployees, useScopedFacilities, useTimecardRows, useToday, useUser, type TimecardRow } from './hooks';
import { usePoise } from './store';

export interface CredentialAlert {
  employee: Employee;
  type: string;
  expiresOn?: string;
  daysLeft: number | null;
  state: 'expired' | 'expiring' | 'unverified';
}

export interface OvertimeRisk {
  employee: Employee;
  workedMinutes: number;
  remainingScheduledMinutes: number;
  projectedMinutes: number;
  level: 'over' | 'approaching';
}

export interface Insights {
  today: string;
  weekStart: string;
  facilities: Facility[];
  headcount: { active: number; onboarding: number; offboarding: number; agency: number; total: number };
  coverageToday: ReturnType<typeof summarizeCoverage> & { cells: CoverageCell[] };
  coverageWeek: ReturnType<typeof summarizeCoverage> & { cells: CoverageCell[] };
  openShifts: Shift[];
  openByDept: { departmentId: DepartmentId; count: number }[];
  overtime: OvertimeRisk[];
  missingPunches: TimecardRow[];
  pendingApprovals: TimecardRow[];
  onClock: TimecardRow[];
  pendingCorrections: number;
  pendingTimeOff: number;
  onboarding: { wf: LifecycleWorkflow; employee: Employee; readiness: ReturnType<typeof workflowReadiness> }[];
  offboarding: { wf: LifecycleWorkflow; employee: Employee; readiness: ReturnType<typeof workflowReadiness>; futureShifts: number }[];
  credentials: CredentialAlert[];
  pbj: { facility: Facility; result: PbjResult; status: PbjStatusSummary; quarterId: string }[];
}

export function useInsights(): Insights {
  const facilities = useScopedFacilities();
  const facsById = useFacilitiesById();
  const today = useToday();
  const user = useUser();
  const employees = useScopedEmployees({ includeArchived: false });
  const { shifts, coverageTargets, workflows, corrections, timeOff, preparations, computePbj, allEmployees } = usePoise(
    useShallow((s) => ({
      shifts: s.shifts,
      coverageTargets: s.coverageTargets,
      workflows: s.workflows,
      corrections: s.corrections,
      timeOff: s.timeOff,
      preparations: s.preparations,
      computePbj: s.computePbj,
      allEmployees: s.employees,
    })),
  );
  const tcRows = useTimecardRows();
  // Recompute PBJ when relevant records change.
  const pbjDeps = usePoise(useShallow((s) => [s.timecards, s.mappings, s.employees, s.facilities, s.preparations, s.pbjRules, s.demoNowIso]));

  return useMemo(() => {
    const ids = facilities.map((f) => f.id);
    const depts = user.departmentIds ?? undefined;
    const weekStart = weekStartOf(today);
    const weekDates = dateRange(weekStart, addDays(weekStart, 6));
    const inScope = (s: Shift) => ids.includes(s.facilityId) && (!depts || depts.includes(s.departmentId));

    const headcount = {
      active: employees.filter((e) => e.status === 'active' || e.status === 'offboarding').length,
      onboarding: employees.filter((e) => e.status === 'onboarding').length,
      offboarding: employees.filter((e) => e.status === 'offboarding').length,
      agency: employees.filter((e) => e.workerType !== 'employee' && e.status !== 'onboarding').length,
      total: employees.length,
    };

    const todayCells = ids.flatMap((f) => coverageFor(f, [today], shifts, coverageTargets, depts));
    const weekCells = ids.flatMap((f) => coverageFor(f, weekDates.filter((d) => d >= today), shifts, coverageTargets, depts));

    const horizon = addDays(today, 13);
    const openShifts = shifts.filter((s) => inScope(s) && !s.employeeId && s.date >= today && s.date <= horizon).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    const openByDept = DEPARTMENTS.map((d) => ({ departmentId: d.id, count: openShifts.filter((s) => s.departmentId === d.id).length })).filter((x) => x.count > 0);

    // Overtime: approved/pending worked minutes this week + remaining scheduled minutes (not yet worked).
    const overtime: OvertimeRisk[] = [];
    for (const e of employees) {
      if (e.payType !== 'nonexempt') continue;
      const worked = tcRows
        .filter((r) => r.tc.employeeId === e.id && r.tc.workDate >= weekStart && r.tc.workDate <= addDays(weekStart, 6))
        .reduce((s, r) => s + r.calc.workedMinutes, 0);
      const remaining = employeeWeekMinutes(e.id, weekStart, shifts.filter((s) => s.date > today), facsById);
      const projected = worked + remaining;
      if (projected > OVERTIME_WEEKLY_MINUTES) overtime.push({ employee: e, workedMinutes: worked, remainingScheduledMinutes: remaining, projectedMinutes: projected, level: 'over' });
      else if (projected >= OVERTIME_WEEKLY_MINUTES - 4 * 60) overtime.push({ employee: e, workedMinutes: worked, remainingScheduledMinutes: remaining, projectedMinutes: projected, level: 'approaching' });
    }
    overtime.sort((a, b) => b.projectedMinutes - a.projectedMinutes);

    const missingPunches = tcRows.filter((r) => r.calc.exceptions.some((x) => x.code === 'missing_out' || x.code === 'missing_in' || x.code === 'open_break'));
    const pendingApprovals = tcRows.filter((r) => r.tc.status === 'pending_approval');
    const onClock = tcRows.filter((r) => r.calc.onClock);
    const scopedTcIds = new Set(tcRows.map((r) => r.tc.id));
    const pendingCorrections = corrections.filter((c) => c.status === 'pending' && scopedTcIds.has(c.timecardId)).length;
    const empIds = new Set(employees.map((e) => e.id));
    const pendingTimeOff = timeOff.filter((t) => t.status === 'pending' && empIds.has(t.employeeId)).length;

    const empById = new Map(allEmployees.map((e) => [e.id, e]));
    const activeWf = workflows.filter((w) => w.status === 'in_progress' && empIds.has(w.employeeId));
    const onboarding = activeWf.filter((w) => w.kind === 'onboarding').map((wf) => ({ wf, employee: empById.get(wf.employeeId)!, readiness: workflowReadiness(wf, today) }));
    const offboarding = activeWf
      .filter((w) => w.kind === 'offboarding')
      .map((wf) => ({ wf, employee: empById.get(wf.employeeId)!, readiness: workflowReadiness(wf, today), futureShifts: shifts.filter((s) => s.employeeId === wf.employeeId && s.date > wf.effectiveDate).length }));

    const credentials: CredentialAlert[] = [];
    for (const e of employees) {
      for (const c of e.credentials) {
        if (e.status === 'onboarding') continue;
        const daysLeft = c.expiresOn ? daysBetween(today, c.expiresOn) : null;
        if (c.verification !== 'verified') credentials.push({ employee: e, type: c.type, expiresOn: c.expiresOn, daysLeft, state: 'unverified' });
        else if (daysLeft !== null && daysLeft < 0) credentials.push({ employee: e, type: c.type, expiresOn: c.expiresOn, daysLeft, state: 'expired' });
        else if (daysLeft !== null && daysLeft <= 30) credentials.push({ employee: e, type: c.type, expiresOn: c.expiresOn, daysLeft, state: 'expiring' });
      }
    }
    credentials.sort((a, b) => (a.daysLeft ?? -999) - (b.daysLeft ?? -999));

    const quarterId = fiscalQuarterOf(today).id;
    const pbj = facilities
      .filter((f) => f.pbjReporting)
      .map((facility) => {
        const result = computePbj(facility.id, quarterId);
        const prep = preparations.filter((p) => p.facilityId === facility.id && p.quarterId === quarterId && p.status !== 'superseded').sort((a, b) => b.version - a.version)[0];
        return { facility, result, status: preparationStatus(result, prep), quarterId };
      });

    return {
      today,
      weekStart,
      facilities,
      headcount,
      coverageToday: { ...summarizeCoverage(todayCells), cells: todayCells },
      coverageWeek: { ...summarizeCoverage(weekCells), cells: weekCells },
      openShifts,
      openByDept,
      overtime,
      missingPunches,
      pendingApprovals,
      onClock,
      pendingCorrections,
      pendingTimeOff,
      onboarding,
      offboarding,
      credentials,
      pbj,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities, today, user, employees, shifts, coverageTargets, workflows, corrections, timeOff, preparations, tcRows, facsById, allEmployees, computePbj, ...pbjDeps]);
}

export interface ActionItem {
  id: string;
  title: string;
  detail: string;
  to: string;
  tone: 'danger' | 'warning' | 'info';
}

/** Actionable task list for the notification indicator, filtered by permissions. */
export function actionItems(i: Insights, can: (p: Parameters<typeof import('../domain/permissions').can>[1]) => boolean): ActionItem[] {
  const out: ActionItem[] = [];
  if (can('time.approve')) {
    if (i.missingPunches.length) out.push({ id: 'missing', title: `${i.missingPunches.length} missing punch${i.missingPunches.length === 1 ? '' : 'es'}`, detail: 'Timecards cannot be approved until corrected.', to: '/time?view=exceptions', tone: 'danger' });
    if (i.pendingCorrections) out.push({ id: 'corr', title: `${i.pendingCorrections} correction request${i.pendingCorrections === 1 ? '' : 's'}`, detail: 'Employee-submitted punch changes awaiting review.', to: '/time?view=corrections', tone: 'warning' });
    if (i.pendingApprovals.length) out.push({ id: 'approve', title: `${i.pendingApprovals.length} timecards pending approval`, detail: 'Approved timecards become PBJ-eligible.', to: '/time?view=pending', tone: 'info' });
  }
  if (can('time_off.approve') && i.pendingTimeOff) out.push({ id: 'pto', title: `${i.pendingTimeOff} time-off request${i.pendingTimeOff === 1 ? '' : 's'}`, detail: 'Pending manager decision.', to: '/time?view=time_off', tone: 'info' });
  if (can('schedule.edit') && i.openShifts.length) out.push({ id: 'open', title: `${i.openShifts.length} open shift${i.openShifts.length === 1 ? '' : 's'} in the next 14 days`, detail: i.openByDept.map((d) => `${DEPARTMENTS.find((x) => x.id === d.departmentId)?.shortName} ${d.count}`).join(' · '), to: '/scheduling?filter=open', tone: 'warning' });
  if (can('lifecycle.complete_tasks')) {
    const blocked = i.onboarding.filter((o) => !o.readiness.ready);
    if (blocked.length) out.push({ id: 'onb', title: `${blocked.length} onboarding${blocked.length === 1 ? '' : 's'} not first-shift ready`, detail: blocked.map((b) => `${b.employee.firstName} ${b.employee.lastName}`).join(', '), to: '/people?tab=onboarding', tone: 'warning' });
    if (i.offboarding.length) out.push({ id: 'off', title: `${i.offboarding.length} offboarding in progress`, detail: i.offboarding.some((o) => o.futureShifts) ? 'Future shifts after separation need review.' : 'Track final tasks.', to: '/people?tab=offboarding', tone: i.offboarding.some((o) => o.futureShifts) ? 'warning' : 'info' });
  }
  if (can('people.view')) {
    const bad = i.credentials.filter((c) => c.state !== 'unverified');
    if (bad.length) out.push({ id: 'cred', title: `${bad.length} credential${bad.length === 1 ? '' : 's'} expired or expiring`, detail: 'Within 30 days. Affects scheduling eligibility.', to: '/people?tab=credentials', tone: bad.some((c) => c.state === 'expired') ? 'danger' : 'warning' });
  }
  if (can('pbj.view')) {
    for (const p of i.pbj) if (p.result.counts.errors) out.push({ id: `pbj-${p.facility.id}`, title: `PBJ: ${p.result.counts.errors} blocking error${p.result.counts.errors === 1 ? '' : 's'} at ${p.facility.shortName}`, detail: p.status.label, to: `/pbj?facility=${p.facility.id}`, tone: 'danger' });
  }
  return out;
}
