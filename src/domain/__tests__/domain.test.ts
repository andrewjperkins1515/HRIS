import { describe, expect, it } from 'vitest';
import { buildSeed, DEMO_NOW_ISO } from '../../data/seed';
import { checkEligibility, findScheduleConflicts } from '../scheduling';
import { calcTimecard, canApprove } from '../timecards';
import {
  fiscalQuarter,
  fiscalQuarterOf,
  localDateOf,
  shiftInterval,
  splitByLocalDay,
  zonedToUtc,
  zonedToUtcMs,
} from '../time';
import { canApprovePackage, effectiveMapping, preparationStatus, runPbjEngine, type PbjInputs } from '../pbj/engine';
import { DEFAULT_PBJ_RULES, roundHours } from '../pbj/rules';
import type { Timecard } from '../types';

const NY = 'America/New_York';
const CHI = 'America/Chicago';
const nowMs = Date.parse(DEMO_NOW_ISO);

describe('time zones and DST', () => {
  it('converts facility-local wall time to UTC', () => {
    expect(zonedToUtc('2026-11-13', '14:45', NY)).toBe('2026-11-13T19:45:00.000Z');
    expect(zonedToUtc('2026-07-01', '07:00', NY)).toBe('2026-07-01T11:00:00.000Z');
    expect(zonedToUtc('2026-11-13', '07:00', CHI)).toBe('2026-11-13T13:00:00.000Z');
  });

  it('a 23:00–07:00 shift is 8h normally, 9h when DST ends, 7h when DST starts', () => {
    const h = (date: string) => {
      const iv = shiftInterval({ date, start: '23:00', end: '07:00' }, NY);
      return (iv.end - iv.start) / 3600000;
    };
    expect(h('2026-11-10')).toBe(8);
    expect(h('2026-10-31')).toBe(9); // DST ends Sun Nov 1, 2026
    expect(h('2026-03-07')).toBe(7); // DST starts Sun Mar 8, 2026
  });

  it('splits overnight work at local midnight', () => {
    const iv = shiftInterval({ date: '2026-10-31', start: '23:00', end: '07:00' }, NY);
    expect(splitByLocalDay(iv, NY)).toEqual([
      { date: '2026-10-31', minutes: 60 },
      { date: '2026-11-01', minutes: 480 },
    ]);
  });

  it('resolves nonexistent spring-forward times after the gap', () => {
    const ms = zonedToUtcMs('2026-03-08', '02:30', NY);
    expect(localDateOf(ms, NY)).toBe('2026-03-08');
    expect(new Date(ms).toISOString()).toBe('2026-03-08T07:30:00.000Z'); // 03:30 EDT
  });

  it('computes CMS fiscal quarters and 45-day deadlines', () => {
    const q = fiscalQuarterOf('2026-11-13');
    expect(q.id).toBe('FY2027-Q1');
    expect(q.start).toBe('2026-10-01');
    expect(q.end).toBe('2026-12-31');
    expect(q.deadline).toBe('2027-02-14');
    expect(fiscalQuarter(2026, 4).deadline).toBe('2026-11-14');
  });

  it('rounds PBJ hours per the manual conversion table', () => {
    expect(roundHours(7 * 60 + 33, 'tenths')).toBeCloseTo(7.6);
    expect(roundHours(7 * 60 + 33, 'hundredths')).toBeCloseTo(7.55);
    expect(roundHours(6, 'tenths')).toBeCloseTo(0.1);
    expect(roundHours(55, 'tenths')).toBeCloseTo(1.0);
  });
});

describe('timecard calculations', () => {
  const base: Timecard = {
    id: 'T1',
    employeeId: 'E-1',
    facilityId: 'f',
    departmentId: 'nursing',
    roleId: 'cna',
    shiftId: null,
    workDate: '2026-10-31',
    punches: [],
    status: 'pending_approval',
    source: 'clock',
  };
  const p = (type: 'in' | 'out' | 'break_start' | 'break_end', local: [string, string]) => ({
    id: type + local.join(),
    type,
    at: zonedToUtc(local[0], local[1], NY),
    source: 'clock' as const,
    recordedAt: '',
    recordedBy: '',
  });

  it('counts worked minutes across DST end and subtracts breaks', () => {
    const tc = { ...base, punches: [p('in', ['2026-10-31', '23:00']), p('break_start', ['2026-11-01', '03:00']), p('break_end', ['2026-11-01', '03:30']), p('out', ['2026-11-01', '07:00'])] };
    const c = calcTimecard(tc, { timeZone: NY, nowMs });
    expect(c.workedMinutes).toBe(9 * 60 - 30);
    expect(c.breakMinutes).toBe(30);
    expect(c.exceptions.find((e) => e.code === 'missing_out')).toBeUndefined();
  });

  it('flags a missing clock-out once the shift is stale, and blocks approval', () => {
    const tc = { ...base, status: 'open' as const, workDate: '2026-11-11', punches: [p('in', ['2026-11-11', '23:00'])] };
    const c = calcTimecard(tc, { timeZone: NY, nowMs });
    expect(c.onClock).toBe(false);
    expect(c.exceptions.map((e) => e.code)).toContain('missing_out');
    expect(c.workedMinutes).toBe(0);
    expect(canApprove(tc, c).ok).toBe(false);
  });

  it('ignores superseded (corrected) punches but keeps them on record', () => {
    const orig = p('in', ['2026-11-12', '06:41']);
    const tc = { ...base, workDate: '2026-11-12', punches: [{ ...orig, supersededBy: 'C1' }, { ...p('in', ['2026-11-12', '05:58']), source: 'correction' as const }, p('out', ['2026-11-12', '14:30'])] };
    const c = calcTimecard(tc, { timeZone: NY, nowMs });
    expect(c.workedMinutes).toBe(8 * 60 + 32);
    expect(tc.punches).toHaveLength(3);
  });

  it('never derives worked time from a schedule', () => {
    const c = calcTimecard({ ...base, punches: [] }, { timeZone: NY, nowMs, shift: { id: 's', facilityId: 'f', departmentId: 'nursing', roleId: 'cna', date: '2026-10-31', start: '07:00', end: '15:00', shiftType: 'day', unpaidBreakMinutes: 30, employeeId: 'E-1' } });
    expect(c.workedMinutes).toBe(0);
    expect(c.scheduledMinutes).toBe(450);
  });
});

describe('seed scenarios and scheduling', () => {
  const seed = buildSeed();
  const facs = Object.fromEntries(seed.facilities.map((f) => [f.id, f]));
  const emp = (id: string) => seed.employees.find((e) => e.id === id)!;
  const ctx = { facilities: facs, shifts: seed.shifts, timeOff: seed.timeOff };

  it('detects Tom’s overlapping assignment on 11/17', () => {
    const conflicts = findScheduleConflicts('2026-11-15', seed.shifts, Object.fromEntries(seed.employees.map((e) => [e.id, e])), ctx, ['fac-cedar']);
    expect(conflicts.some((c) => c.kind === 'overlap' && c.employeeId === 'E-10009')).toBe(true);
  });

  it('explains why Victor (expired CPR) cannot take a shift', () => {
    const open = seed.shifts.find((s) => s.employeeId === null && s.date === '2026-11-14' && s.roleId === 'cna')!;
    const r = checkEligibility(emp('E-10012'), open, ctx);
    expect(r.ok).toBe(false);
    expect(r.blocking.join(' ')).toMatch(/CPR\/BLS expires 2026-11-05/);
  });

  it('allows an eligible CNA to take the open Saturday night shift', () => {
    const open = seed.shifts.find((s) => s.employeeId === null && s.date === '2026-11-14' && s.roleId === 'cna')!;
    const r = checkEligibility(emp('E-10013'), open, ctx); // Jasmine works Sun–Thu evenings
    expect(r.blocking).toEqual([]);
  });

  it('blocks onboarding employees and post-separation shifts', () => {
    const open = seed.shifts.find((s) => s.date === '2026-11-16' && s.employeeId === null && s.roleId === 'cna')!;
    expect(checkEligibility(emp('E-10038'), open, ctx).blocking.join(' ')).toMatch(/Onboarding/);
    const gloriaShift = seed.shifts.find((s) => s.employeeId === 'E-10028' && s.date === '2026-11-21')!;
    expect(checkEligibility(emp('E-10028'), gloriaShift, ctx).blocking.join(' ')).toMatch(/separation date/);
  });

  it('has James on a missing punch and Maria able to clock in', () => {
    const james = seed.timecards.find((t) => t.employeeId === 'E-10006' && t.workDate === '2026-11-11')!;
    const c = calcTimecard(james, { timeZone: NY, nowMs });
    expect(c.exceptions.map((e) => e.code)).toContain('missing_out');
    expect(seed.timecards.some((t) => t.employeeId === 'E-10011' && t.workDate === '2026-11-13')).toBe(false);
  });
});

describe('PBJ engine', () => {
  const seed = buildSeed();
  const inputs = (overrides: Partial<PbjInputs> = {}): PbjInputs => ({
    facility: seed.facilities[0],
    quarter: fiscalQuarterOf('2026-11-13'),
    today: '2026-11-13',
    nowMs,
    employees: seed.employees,
    timecards: seed.timecards,
    shifts: seed.shifts,
    mappings: seed.mappings,
    corrections: seed.corrections,
    resolutions: [],
    rules: DEFAULT_PBJ_RULES,
    ...overrides,
  });

  it('is deterministic', () => {
    const a = runPbjEngine(inputs());
    const b = runPbjEngine(inputs());
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.totals).toEqual(b.totals);
  });

  it('reports the seeded Cedar Ridge issues', () => {
    const r = runPbjEngine(inputs());
    const ids = new Set(r.issues.map((i) => i.ruleId));
    expect(ids.has('E102')).toBe(true); // RNA unmapped
    expect(ids.has('E105')).toBe(true); // unapproved
    expect(ids.has('E106')).toBe(true); // missing punch
    expect(ids.has('W202')).toBe(true); // orientation pay code
    expect(ids.has('W201')).toBe(true); // meal deduction
    expect(ids.has('E101')).toBe(false);
    expect(r.issues.filter((i) => i.ruleId === 'E105')).toHaveLength(1);
  });

  it('flags the missing Willow Bend facility identifier and agency without agency name', () => {
    const r = runPbjEngine(inputs({ facility: seed.facilities[1] }));
    expect(r.issues.some((i) => i.ruleId === 'E101')).toBe(true);
    expect(r.issues.some((i) => i.ruleId === 'W205')).toBe(true);
  });

  it('mapping a job code clears E102 and changes the fingerprint', () => {
    const before = runPbjEngine(inputs());
    const mappings = [...seed.mappings, { id: 'm', facilityId: null, sourceJobCode: 'RNA', pbjJobTitleCode: 10, reportability: 'required' as const, effectiveFrom: '2024-01-01', effectiveTo: null, updatedBy: '', updatedAt: '' }];
    const after = runPbjEngine(inputs({ mappings }));
    expect(after.issues.some((i) => i.ruleId === 'E102')).toBe(false);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(after.totals.eligibleHours).toBeGreaterThan(before.totals.eligibleHours);
  });

  it('uses effective-dated mappings (RN-MDS 7 → 6 on 2026-07-01)', () => {
    expect(effectiveMapping(seed.mappings, 'fac-cedar', 'RN-MDS', '2026-06-30')?.pbjJobTitleCode).toBe(7);
    expect(effectiveMapping(seed.mappings, 'fac-cedar', 'RN-MDS', '2026-10-15')?.pbjJobTitleCode).toBe(6);
  });

  it('excludes nonreportable and optional categories and never includes unapproved hours', () => {
    const r = runPbjEngine(inputs());
    expect(r.rows.filter((x) => x.sourceJobCode === 'COOK').every((x) => x.status === 'excluded')).toBe(true);
    expect(r.rows.filter((x) => x.sourceJobCode === 'HSK').every((x) => x.status === 'excluded')).toBe(true);
    expect(r.rows.filter((x) => x.timecardStatus !== 'approved').every((x) => x.status !== 'ready')).toBe(true);
  });

  it('splits overnight hours by day and applies DST correctly in PBJ rows', () => {
    const r = runPbjEngine(inputs());
    const nia = r.rows.filter((x) => x.employeeId === 'E-10014' && (x.date === '2026-10-31' || x.date === '2026-11-01'));
    const total = nia.reduce((s, x) => s + x.rawMinutes, 0);
    expect(total).toBeGreaterThan(8 * 60 + 15); // 9h shift minus 30m break, ± punch jitter
  });

  it('cannot approve a package with errors, and "no errors" is never labeled compliant', () => {
    const r = runPbjEngine(inputs());
    expect(canApprovePackage(r, undefined).ok).toBe(false);
    const status = preparationStatus(r, undefined);
    expect(status.label.toLowerCase()).not.toContain('compliant');
  });

  it('marks an approved package stale when source data change', () => {
    const r = runPbjEngine(inputs());
    const prep = { id: 'p', facilityId: 'fac-cedar', quarterId: r.quarterId, version: 1, status: 'approved' as const, createdAt: '', createdBy: '', validationRuns: [], resolutions: [], approval: { by: 'x', at: '', sourceFingerprint: r.fingerprint }, exports: [], submissions: [] };
    expect(preparationStatus(r, prep).stale).toBe(false);
    const changed = seed.timecards.map((t) => (t.employeeId === 'E-10006' && t.workDate === '2026-10-05' ? { ...t, status: 'pending_approval' as const } : t));
    const r2 = runPbjEngine(inputs({ timecards: changed }));
    expect(preparationStatus(r2, prep).stale).toBe(true);
  });

  it('only counts facility-scoped records', () => {
    const cedar = runPbjEngine(inputs());
    expect(cedar.rows.every((x) => x.facilityId === 'fac-cedar')).toBe(true);
    const willow = runPbjEngine(inputs({ facility: seed.facilities[1] }));
    expect(willow.rows.every((x) => x.facilityId === 'fac-willow')).toBe(true);
    const willowIds = new Set(seed.timecards.filter((t) => t.facilityId === 'fac-willow').map((t) => t.id));
    expect(cedar.rows.some((x) => willowIds.has(x.timecardId))).toBe(false);
  });
});
