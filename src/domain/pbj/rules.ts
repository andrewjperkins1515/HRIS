/**
 * PBJ demo rule set (versioned, configurable).
 *
 * These rules are ILLUSTRATIVE. They were written against the CMS PBJ Long-Term Care
 * Facility Policy Manual v2.8 (August 2026) but have not been reconciled with the
 * current PBJ XML data specifications or iQIES edit checks. Before production use,
 * each rule must be verified against the official CMS specifications and policy guidance
 * in effect for the reporting quarter.
 */
import type { PbjIssueSeverity } from '../types';

export interface PbjRuleConfig {
  version: string;
  reference: string;
  /** Hours rounding for reported hours. Manual §2.2.a allows tenths or hundredths. */
  rounding: 'hundredths' | 'tenths';
  /** Minimum minutes deducted per worked shift for meals when a shorter break was recorded (§2.2.d). */
  mealDeductionMinutes: number;
  /** Apply the meal deduction to shifts with at least this many worked minutes (demo threshold). */
  mealDeductionThresholdMinutes: number;
  /** Maximum hours per worker per day (§2.2.d note). */
  maxDailyHours: number;
  /** Review threshold for long days. */
  reviewDailyHours: number;
  /** Staffing-monitoring indicator: minimum RN hours per day (facility monitoring setting). */
  rnHoursPerDayIndicator: number;
  /** Staffing-monitoring indicator: contract share of nursing hours. */
  contractShareIndicatorPct: number;
  /** Staffing-monitoring indicator: weekend vs weekday nursing hours drop. */
  weekendDropIndicatorPct: number;
  /** Demo facility-identifier pattern. Replace with the official format rule. */
  facilityIdPattern: string;
}

export const DEFAULT_PBJ_RULES: PbjRuleConfig = {
  version: 'poise-demo-pbj-rules 0.3 (2026-11)',
  reference: 'CMS PBJ Policy Manual v2.8 (Aug 2026) — illustrative interpretation, not CMS edit checks',
  rounding: 'hundredths',
  mealDeductionMinutes: 30,
  mealDeductionThresholdMinutes: 6 * 60,
  maxDailyHours: 22.5,
  reviewDailyHours: 16,
  rnHoursPerDayIndicator: 8,
  contractShareIndicatorPct: 20,
  weekendDropIndicatorPct: 20,
  facilityIdPattern: '^[A-Z0-9]{6,16}$',
};

export interface PbjRuleDef {
  id: string;
  severity: PbjIssueSeverity;
  title: string;
  description: string;
  basis: string;
}

export const PBJ_RULES: PbjRuleDef[] = [
  {
    id: 'E101',
    severity: 'error',
    title: 'Facility identifier missing or invalid',
    description: 'The facility record must carry a PBJ facility identifier that matches the demo format.',
    basis: 'Demo format check. Confirm the identifier and format required by the current PBJ data specifications.',
  },
  {
    id: 'E102',
    severity: 'error',
    title: 'Unmapped source job code',
    description: 'Worked hours exist for a source job code with no effective PBJ job mapping on the work date.',
    basis: 'Policy Manual §2.2.e, §2.2.m — hours are reported by job title code.',
  },
  {
    id: 'E103',
    severity: 'error',
    title: 'Missing or duplicate worker identifier',
    description: 'Each worker, including agency and contract staff, needs a unique, stable identifier without PII.',
    basis: 'Policy Manual §2.1.a, §2.2.o.',
  },
  {
    id: 'E104',
    severity: 'error',
    title: 'Missing pay type',
    description: 'Worker must be classified as exempt, non-exempt or contract.',
    basis: 'Policy Manual §2.2.o (pay type codes 1, 2, 3).',
  },
  {
    id: 'E105',
    severity: 'error',
    title: 'Unapproved time record',
    description: 'Only approved timecards are eligible for PBJ preparation in Poise.',
    basis: 'Poise preparation policy (hours must be based on payroll/auditable data — §1.1).',
  },
  {
    id: 'E106',
    severity: 'error',
    title: 'Missing punch',
    description: 'A time record has an unmatched clock-in, clock-out or break.',
    basis: 'Poise preparation policy.',
  },
  {
    id: 'E107',
    severity: 'error',
    title: 'Daily hours exceed maximum',
    description: 'A worker has more than the maximum reportable hours for one calendar day.',
    basis: 'Policy Manual §2.2.d note — no more than 22.5 hours for a single day.',
  },
  {
    id: 'E108',
    severity: 'error',
    title: 'Duplicate or overlapping time records',
    description: 'The same worker has overlapping worked time across records.',
    basis: 'Poise data-quality rule.',
  },
  {
    id: 'W201',
    severity: 'warning',
    title: 'Meal-break deduction applied',
    description: 'No or a short meal break was recorded; the minimum meal deduction was applied to PBJ hours.',
    basis: 'Policy Manual §2.2.d — deduct at least 30 minutes per shift whether or not a break was taken.',
  },
  {
    id: 'W202',
    severity: 'warning',
    title: 'Potential nonworked or training hours',
    description: 'Source pay code suggests orientation/training time. Confirm whether hours were spent in the primary role.',
    basis: 'Policy Manual §2.2.c, §2.2.j.',
  },
  {
    id: 'W203',
    severity: 'warning',
    title: 'Hours outside employment dates',
    description: 'Worked hours fall before the hire date or after the separation date.',
    basis: 'Poise data-quality rule.',
  },
  {
    id: 'W204',
    severity: 'warning',
    title: 'Long daily hours',
    description: 'A worker has more than 16 hours on one calendar day. Confirm the record.',
    basis: 'Poise review threshold.',
  },
  {
    id: 'W205',
    severity: 'warning',
    title: 'Agency worker missing agency name',
    description: 'Contract/agency worker should identify the supplying agency for audit support.',
    basis: 'Poise audit-support rule (§2.2.f — data must be auditable).',
  },
  {
    id: 'I301',
    severity: 'indicator',
    title: 'Days below RN-hours monitoring level',
    description: 'Days where RN hours (job codes 5–7) fall below the facility monitoring setting.',
    basis: 'Facility staffing-monitoring indicator. Not a PBJ data error.',
  },
  {
    id: 'I302',
    severity: 'indicator',
    title: 'Weekend nursing hours drop',
    description: 'Average weekend nursing hours are notably lower than weekday hours.',
    basis: 'Facility staffing-monitoring indicator. Not a PBJ data error.',
  },
  {
    id: 'I303',
    severity: 'indicator',
    title: 'Contract share of nursing hours',
    description: 'Share of nursing hours worked by contract/agency staff exceeds the monitoring setting.',
    basis: 'Facility staffing-monitoring indicator. Not a PBJ data error.',
  },
  {
    id: 'I304',
    severity: 'indicator',
    title: 'Nursing hours per resident day (planning estimate)',
    description: 'Uses the facility planning census estimate. CMS calculates census from MDS data; this figure is for internal monitoring only.',
    basis: 'Policy Manual §2.4 describes CMS census methodology.',
  },
];

export const RULE_BY_ID = Object.fromEntries(PBJ_RULES.map((r) => [r.id, r])) as Record<string, PbjRuleDef>;

export function roundHours(minutes: number, rounding: PbjRuleConfig['rounding']): number {
  if (rounding === 'tenths') {
    // Manual §2.2.a conversion table: 1–6 min = .1, 7–12 = .2 ... 55–60 = 1.0
    const whole = Math.floor(minutes / 60);
    const rem = minutes - whole * 60;
    return whole + Math.ceil(rem / 6) / 10;
  }
  return Math.round((minutes / 60) * 100) / 100;
}
