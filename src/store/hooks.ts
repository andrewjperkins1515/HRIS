/**
 * Read-side hooks and selectors. Facility filtering is applied here once, so every screen
 * uses the same scope rules.
 */
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DEPT_BY_ID, ROLE_BY_ID } from '../domain/catalog';
import { can, canAccessFacility, type Permission } from '../domain/permissions';
import { calcTimecard, type TimecardCalc } from '../domain/timecards';
import { fiscalQuarterOf, localDateOf } from '../domain/time';
import type { Employee, Facility, Shift, Timecard } from '../domain/types';
import { currentUser, demoNowMs, usePoise } from './store';

export function useUser() {
  const role = usePoise((s) => s.role);
  return useMemo(() => currentUser({ role }), [role]);
}

export function useCan(p: Permission): boolean {
  const user = useUser();
  return can(user, p);
}

export function useFacilitiesById(): Record<string, Facility> {
  const facilities = usePoise((s) => s.facilities);
  return useMemo(() => Object.fromEntries(facilities.map((f) => [f.id, f])), [facilities]);
}

/** Facilities visible under the current role and facility selector. */
export function useScopedFacilities(): Facility[] {
  const facilities = usePoise((s) => s.facilities);
  const scope = usePoise((s) => s.facilityScope);
  const user = useUser();
  return useMemo(
    () => facilities.filter((f) => canAccessFacility(user, f.id) && (scope === 'all' || scope === f.id)),
    [facilities, scope, user],
  );
}

export function useScopedFacilityIds(): string[] {
  const f = useScopedFacilities();
  return useMemo(() => f.map((x) => x.id), [f]);
}

/** Employees whose primary or additional facility is in scope (department scope applied for schedulers). */
export function useScopedEmployees(opts: { includeArchived?: boolean; allDepartments?: boolean } = {}): Employee[] {
  const employees = usePoise((s) => s.employees);
  const ids = useScopedFacilityIds();
  const user = useUser();
  return useMemo(
    () =>
      employees.filter(
        (e) =>
          (opts.includeArchived || e.status !== 'archived') &&
          [e.primaryFacilityId, ...e.additionalFacilityIds].some((f) => ids.includes(f)) &&
          (opts.allDepartments || !user.departmentIds || user.departmentIds.includes(e.departmentId)),
      ),
    [employees, ids, user, opts.includeArchived, opts.allDepartments],
  );
}

export function useEmployeesById(): Record<string, Employee> {
  const employees = usePoise((s) => s.employees);
  return useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
}

export function useNowMs(): number {
  return usePoise((s) => demoNowMs(s));
}

/** Demo "today" in the first scoped facility's time zone. */
export function useToday(facilityId?: string): string {
  const nowIso = usePoise((s) => s.demoNowIso);
  const facs = useFacilitiesById();
  const scoped = useScopedFacilities();
  const tz = (facilityId ? facs[facilityId] : scoped[0])?.timeZone ?? 'America/New_York';
  return localDateOf(nowIso, tz);
}

export function useCurrentQuarter() {
  const today = useToday();
  return useMemo(() => fiscalQuarterOf(today), [today]);
}

export interface TimecardRow {
  tc: Timecard;
  calc: TimecardCalc;
  employee: Employee | undefined;
  shift: Shift | undefined;
  facility: Facility;
}

/** Timecards in scope with calculations. */
export function useTimecardRows(filter?: (tc: Timecard) => boolean): TimecardRow[] {
  const { timecards, shifts, corrections } = usePoise(useShallow((s) => ({ timecards: s.timecards, shifts: s.shifts, corrections: s.corrections })));
  const nowMs = useNowMs();
  const facs = useFacilitiesById();
  const ids = useScopedFacilityIds();
  const emps = useEmployeesById();
  const user = useUser();
  return useMemo(() => {
    const shiftById = new Map(shifts.map((s) => [s.id, s]));
    return timecards
      .filter((tc) => ids.includes(tc.facilityId) && (!user.departmentIds || user.departmentIds.includes(tc.departmentId)) && (!filter || filter(tc)))
      .map((tc) => {
        const shift = tc.shiftId ? shiftById.get(tc.shiftId) : undefined;
        const facility = facs[tc.facilityId];
        return { tc, shift, facility, employee: emps[tc.employeeId], calc: calcTimecard(tc, { timeZone: facility.timeZone, nowMs, shift, pendingCorrections: corrections }) };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timecards, shifts, corrections, nowMs, facs, ids, emps, user]);
}

export function employeeName(e: Employee | undefined): string {
  if (!e) return 'Unknown';
  return `${e.preferredName ?? e.firstName} ${e.lastName}`;
}

export function roleName(roleId: string): string {
  return ROLE_BY_ID[roleId]?.name ?? roleId;
}

export function deptName(id: string): string {
  return DEPT_BY_ID[id as keyof typeof DEPT_BY_ID]?.name ?? id;
}
