/**
 * Scheduling rules: eligibility, overlaps, coverage and hour totals. Pure functions.
 */
import { ROLE_BY_ID } from './catalog';
import type { CoverageTarget, DepartmentId, Employee, Facility, ISODate, Shift, ShiftType, TimeOffRequest } from './types';
import { addDays, dayOfWeek, daysBetween, overlaps, shiftInterval, weekStartOf, type Interval } from './time';
import { scheduledPaidMinutes } from './timecards';

export const OVERTIME_WEEKLY_MINUTES = 40 * 60;
export const MIN_REST_MINUTES = 8 * 60;
export const CREDENTIAL_WARNING_DAYS = 30;

/** Roles that may cover another role's shift in the demo rule set. */
const COVERS: Record<string, string[]> = {
  don: ['rn', 'adon'],
  adon: ['rn'],
  rn: ['lpn'],
  cna: ['rna'],
  evs_sup: ['housekeeper', 'laundry_aide'],
  housekeeper: ['laundry_aide'],
  dietary_mgr: ['cook', 'dietary_aide'],
  cook: ['dietary_aide'],
  maint_dir: ['maint_tech'],
  act_dir: ['act_asst'],
  ss_dir: ['ss_asst'],
  pt: ['pta'],
  ot: ['cota'],
};

export function canCoverRole(employeeRoleId: string, shiftRoleId: string): boolean {
  return employeeRoleId === shiftRoleId || (COVERS[employeeRoleId] ?? []).includes(shiftRoleId);
}

export interface EligibilityContext {
  facilities: Record<string, Facility>;
  shifts: Shift[];
  timeOff: TimeOffRequest[];
}

export interface EligibilityResult {
  ok: boolean;
  blocking: string[];
  warnings: string[];
  weekMinutesAfter: number;
}

export function shiftIv(shift: Shift, facilities: Record<string, Facility>): Interval {
  return shiftInterval(shift, facilities[shift.facilityId]?.timeZone ?? 'America/New_York');
}

export function shiftPaidMinutes(shift: Shift, facilities: Record<string, Facility>): number {
  return scheduledPaidMinutes(shift, facilities[shift.facilityId]?.timeZone ?? 'America/New_York');
}

export function employeeWeekMinutes(
  employeeId: string,
  weekStart: ISODate,
  shifts: Shift[],
  facilities: Record<string, Facility>,
  excludeShiftId?: string,
): number {
  const end = addDays(weekStart, 6);
  return shifts
    .filter((s) => s.employeeId === employeeId && s.id !== excludeShiftId && s.date >= weekStart && s.date <= end)
    .reduce((sum, s) => sum + shiftPaidMinutes(s, facilities), 0);
}

/** Check whether `employee` can be assigned to `shift`. Explains every reason. */
export function checkEligibility(employee: Employee, shift: Shift, ctx: EligibilityContext): EligibilityResult {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const role = ROLE_BY_ID[shift.roleId];

  if (employee.status === 'archived') blocking.push('Employee record is archived.');
  if (employee.status === 'onboarding')
    blocking.push('Onboarding is not complete. Finish first-shift readiness tasks before scheduling.');
  if (employee.status === 'leave') blocking.push('Employee is on leave.');
  if (employee.separationDate && shift.date > employee.separationDate)
    blocking.push(`Shift is after the separation date (${employee.separationDate}).`);

  const facilityIds = [employee.primaryFacilityId, ...employee.additionalFacilityIds];
  if (!facilityIds.includes(shift.facilityId)) blocking.push('Not assigned to this facility.');

  if (!canCoverRole(employee.roleId, shift.roleId))
    blocking.push(`Role mismatch: ${ROLE_BY_ID[employee.roleId]?.name ?? employee.roleId} cannot cover ${role?.name ?? shift.roleId}.`);

  for (const type of role?.requiredCredentials ?? []) {
    const cred = employee.credentials.find((c) => c.type === type);
    if (!cred) blocking.push(`Missing required credential: ${type}.`);
    else if (cred.verification !== 'verified') blocking.push(`${type} is not verified.`);
    else if (cred.expiresOn && cred.expiresOn < shift.date) blocking.push(`${type} expires ${cred.expiresOn}, before this shift.`);
    else if (cred.expiresOn && daysBetween(shift.date, cred.expiresOn) <= CREDENTIAL_WARNING_DAYS)
      warnings.push(`${type} expires ${cred.expiresOn}.`);
  }

  const avail = employee.availability[dayOfWeek(shift.date)];
  if (avail === 'unavailable') warnings.push('Marked unavailable on this day of the week.');

  for (const t of ctx.timeOff) {
    if (t.employeeId !== employee.id || t.status === 'denied') continue;
    if (shift.date >= t.startDate && shift.date <= t.endDate) {
      if (t.status === 'approved') blocking.push(`Approved time off (${t.category}) on this date.`);
      else warnings.push(`Pending time-off request (${t.category}) on this date.`);
    }
  }

  const iv = shiftIv(shift, ctx.facilities);
  for (const other of ctx.shifts) {
    if (other.id === shift.id || other.employeeId !== employee.id) continue;
    const oiv = shiftIv(other, ctx.facilities);
    if (overlaps(iv, oiv)) {
      const where = other.facilityId !== shift.facilityId ? ` at ${ctx.facilities[other.facilityId]?.shortName}` : '';
      blocking.push(`Overlaps another assigned shift${where} (${other.date} ${other.start}–${other.end}).`);
    } else {
      const gap = Math.min(Math.abs(iv.start - oiv.end), Math.abs(oiv.start - iv.end)) / 60000;
      if (gap < MIN_REST_MINUTES) warnings.push(`Less than ${MIN_REST_MINUTES / 60}h rest from another shift (${other.date} ${other.start}).`);
    }
  }

  const weekStart = weekStartOf(shift.date);
  const weekMinutesAfter =
    employeeWeekMinutes(employee.id, weekStart, ctx.shifts, ctx.facilities, shift.id) + shiftPaidMinutes(shift, ctx.facilities);
  if (employee.payType === 'nonexempt' && weekMinutesAfter > OVERTIME_WEEKLY_MINUTES)
    warnings.push(`Projected ${(weekMinutesAfter / 60).toFixed(1)} scheduled hours this week (overtime).`);

  return { ok: blocking.length === 0, blocking, warnings, weekMinutesAfter };
}

/* ------------------------------ week-level analysis ------------------------------ */

export interface ScheduleConflict {
  kind: 'overlap' | 'overtime' | 'ineligible';
  employeeId: string;
  shiftIds: string[];
  message: string;
}

export function findScheduleConflicts(
  weekStart: ISODate,
  shifts: Shift[],
  employees: Record<string, Employee>,
  ctx: EligibilityContext,
  facilityFilter?: string[],
): ScheduleConflict[] {
  const end = addDays(weekStart, 6);
  const inWeek = shifts.filter((s) => s.employeeId && s.date >= addDays(weekStart, -1) && s.date <= end);
  const byEmp = new Map<string, Shift[]>();
  for (const s of inWeek) byEmp.set(s.employeeId!, [...(byEmp.get(s.employeeId!) ?? []), s]);
  const out: ScheduleConflict[] = [];
  for (const [empId, list] of byEmp) {
    const relevant = list.filter((s) => !facilityFilter || facilityFilter.includes(s.facilityId));
    if (!relevant.length) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (overlaps(shiftIv(a, ctx.facilities), shiftIv(b, ctx.facilities)))
          out.push({
            kind: 'overlap',
            employeeId: empId,
            shiftIds: [a.id, b.id],
            message: `Overlapping shifts on ${a.date}${a.facilityId !== b.facilityId ? ' across facilities' : ''}.`,
          });
      }
    }
    const emp = employees[empId];
    const minutes = employeeWeekMinutes(empId, weekStart, shifts, ctx.facilities);
    if (emp?.payType === 'nonexempt' && minutes > OVERTIME_WEEKLY_MINUTES)
      out.push({
        kind: 'overtime',
        employeeId: empId,
        shiftIds: list.map((s) => s.id),
        message: `${(minutes / 60).toFixed(1)} scheduled hours (over 40).`,
      });
    if (emp) {
      for (const s of relevant.filter((x) => x.date >= weekStart)) {
        const res = checkEligibility(emp, s, ctx);
        const nonOverlap = res.blocking.filter((b) => !b.startsWith('Overlaps'));
        if (nonOverlap.length)
          out.push({ kind: 'ineligible', employeeId: empId, shiftIds: [s.id], message: nonOverlap[0] });
      }
    }
  }
  return out;
}

export interface CoverageCell {
  date: ISODate;
  departmentId: DepartmentId;
  shiftType: ShiftType;
  required: number;
  scheduled: number; // shifts created (assigned + open)
  assigned: number;
  open: number;
}

export function coverageFor(
  facilityId: string,
  dates: ISODate[],
  shifts: Shift[],
  targets: CoverageTarget[],
  departmentIds?: DepartmentId[],
): CoverageCell[] {
  const cells: CoverageCell[] = [];
  const t = targets.filter((x) => x.facilityId === facilityId && (!departmentIds || departmentIds.includes(x.departmentId)));
  for (const date of dates) {
    for (const target of t) {
      const matching = shifts.filter(
        (s) => s.facilityId === facilityId && s.date === date && s.departmentId === target.departmentId && s.shiftType === target.shiftType,
      );
      const assigned = matching.filter((s) => s.employeeId).length;
      cells.push({
        date,
        departmentId: target.departmentId,
        shiftType: target.shiftType,
        required: target.required,
        scheduled: matching.length,
        assigned,
        open: matching.length - assigned,
      });
    }
  }
  return cells;
}

export function summarizeCoverage(cells: CoverageCell[]) {
  const required = cells.reduce((s, c) => s + c.required, 0);
  const assigned = cells.reduce((s, c) => s + Math.min(c.assigned, c.required), 0);
  const scheduled = cells.reduce((s, c) => s + c.scheduled, 0);
  const gaps = cells.filter((c) => c.assigned < c.required);
  return { required, assigned, scheduled, gaps, pct: required ? Math.round((assigned / required) * 100) : 100 };
}
