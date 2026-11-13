/**
 * Deterministic PBJ preparation & validation engine (demo rules).
 *
 * Layers kept distinct:
 *   source punches → approved timecards → PBJ eligibility & transformations (this file)
 *   → export snapshots (export.ts) → submission records (store, user-entered only).
 *
 * The engine is a pure function of its inputs so results can be reproduced, tested and
 * fingerprinted. Scheduled hours are never used as a source of PBJ hours.
 */
import { PAY_CODES, PBJ_PAY_TYPE_CODE, PBJ_TITLE_BY_CODE, ROLE_BY_ID } from '../catalog';
import { calcTimecard } from '../timecards';
import type {
  CorrectionRequest,
  Employee,
  Facility,
  ISODate,
  PbjIssueResolution,
  PbjIssueSeverity,
  PbjJobMapping,
  PbjPreparation,
  Shift,
  Timecard,
} from '../types';
import { dateRange, dayOfWeek, overlaps, splitByLocalDay, type FiscalQuarter } from '../time';
import { RULE_BY_ID, roundHours, type PbjRuleConfig } from './rules';

export interface PbjIssue {
  key: string; // stable across runs
  ruleId: string;
  severity: PbjIssueSeverity;
  title: string;
  detail: string;
  employeeId?: string;
  timecardIds?: string[];
  sourceJobCode?: string;
  date?: ISODate;
  hours?: number;
  action: 'map_job' | 'open_timecard' | 'edit_facility' | 'edit_employee' | 'review' | 'none';
  resolution?: PbjIssueResolution;
}

export type PbjRowStatus = 'ready' | 'needs_review' | 'blocked' | 'excluded';

export interface PbjDailyRow {
  key: string;
  employeeId: string;
  pbjEmployeeId: string;
  workerName: string;
  workerType: Employee['workerType'];
  payTypeCode: number | null;
  date: ISODate;
  facilityId: string;
  sourceJobCode: string;
  roleName: string;
  pbjJobTitleCode: number | null;
  pbjJobTitle: string | null;
  rawMinutes: number;
  mealAdjustmentMinutes: number;
  eligibleHours: number;
  timecardId: string;
  timecardStatus: Timecard['status'];
  source: Timecard['source'];
  sourcePayCode?: string;
  status: PbjRowStatus;
  statusReason: string;
  issueKeys: string[];
}

export interface PbjSourceSummary {
  timecards: number;
  approved: number;
  pending: number;
  open: number;
  imported: number;
  daysInRange: number;
  daysWithData: number;
  workers: number;
  employeeWorkers: number;
  contractWorkers: number;
  collectedThrough: ISODate;
}

export interface PbjResult {
  facilityId: string;
  quarterId: string;
  rulesetVersion: string;
  fingerprint: string;
  rows: PbjDailyRow[];
  issues: PbjIssue[];
  source: PbjSourceSummary;
  totals: {
    eligibleHours: number;
    employeeHours: number;
    contractHours: number;
    reviewHours: number;
    blockedHours: number;
    excludedHours: number;
    nursingHours: number;
    rnHours: number;
  };
  byJobCode: { code: number; title: string; hours: number; employeeHours: number; contractHours: number }[];
  counts: { errors: number; warnings: number; indicators: number; unresolvedWarnings: number };
  dailyNursing: { date: ISODate; nursingHours: number; rnHours: number; contractNursingHours: number }[];
}

export interface PbjInputs {
  facility: Facility;
  quarter: FiscalQuarter;
  /** Demo "today": data are collected through this date (or quarter end if earlier). */
  today: ISODate;
  nowMs: number;
  employees: Employee[];
  timecards: Timecard[];
  shifts: Shift[];
  mappings: PbjJobMapping[];
  corrections: CorrectionRequest[];
  resolutions: PbjIssueResolution[];
  rules: PbjRuleConfig;
}

/** Effective mapping for a source job code on a date. Facility-specific mappings win. */
export function effectiveMapping(
  mappings: PbjJobMapping[],
  facilityId: string,
  sourceJobCode: string,
  date: ISODate,
): PbjJobMapping | null {
  const active = mappings.filter(
    (m) =>
      m.sourceJobCode === sourceJobCode &&
      m.effectiveFrom <= date &&
      (m.effectiveTo === null || m.effectiveTo >= date) &&
      (m.facilityId === null || m.facilityId === facilityId),
  );
  return active.find((m) => m.facilityId === facilityId) ?? active.find((m) => m.facilityId === null) ?? null;
}

/* ------------------------------ fingerprint ------------------------------ */

function hashString(s: string): string {
  // FNV-1a 32-bit, twice with different seeds for a 64-bit-ish digest.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).toUpperCase();
}

export function sourceFingerprint(i: Omit<PbjInputs, 'nowMs' | 'shifts'>, relevant: Timecard[]): string {
  const parts: string[] = [
    i.facility.id,
    i.facility.pbjFacilityId,
    String(i.facility.includeOptionalPbjCategories),
    i.quarter.id,
    i.rules.version,
    i.rules.rounding,
  ];
  for (const tc of relevant) {
    parts.push(
      [tc.id, tc.status, tc.roleId, tc.sourcePayCode ?? '', ...tc.punches.filter((p) => !p.supersededBy).map((p) => p.type + p.at)].join('|'),
    );
  }
  const empIds = new Set(relevant.map((t) => t.employeeId));
  for (const e of i.employees.filter((x) => empIds.has(x.id)))
    parts.push([e.id, e.pbjEmployeeId, e.payType, e.workerType, e.agencyName ?? '', e.hireDate, e.separationDate ?? ''].join('|'));
  for (const m of i.mappings) parts.push([m.id, m.facilityId, m.sourceJobCode, m.pbjJobTitleCode, m.reportability, m.effectiveFrom, m.effectiveTo].join('|'));
  for (const r of i.resolutions) parts.push([r.issueKey, r.decision].join('|'));
  return hashString(parts.join('\n'));
}

/* ------------------------------ engine ------------------------------ */

export function runPbjEngine(i: PbjInputs): PbjResult {
  const { facility, quarter, rules } = i;
  const tz = facility.timeZone;
  const collectedThrough = i.today < quarter.end ? i.today : quarter.end;
  const emp = new Map(i.employees.map((e) => [e.id, e]));
  const shiftById = new Map(i.shifts.map((s) => [s.id, s]));
  const resolutionByKey = new Map(i.resolutions.map((r) => [r.issueKey, r]));

  // Collect: timecards at this facility that can contribute minutes to quarter days.
  const relevant = i.timecards
    .filter((tc) => tc.facilityId === facility.id && tc.workDate >= addDaysSafe(quarter.start, -1) && tc.workDate <= collectedThrough)
    .sort((a, b) => (a.workDate === b.workDate ? a.id.localeCompare(b.id) : a.workDate.localeCompare(b.workDate)));

  const issues: PbjIssue[] = [];
  const issueByKey = new Map<string, PbjIssue>();
  const addIssue = (issue: Omit<PbjIssue, 'title' | 'severity'> & { title?: string }) => {
    const def = RULE_BY_ID[issue.ruleId];
    const existing = issueByKey.get(issue.key);
    if (existing) {
      // Aggregate (e.g. unmapped job code across many records)
      existing.hours = round2((existing.hours ?? 0) + (issue.hours ?? 0));
      existing.timecardIds = [...new Set([...(existing.timecardIds ?? []), ...(issue.timecardIds ?? [])])];
      return existing;
    }
    const full: PbjIssue = {
      ...issue,
      title: issue.title ?? def.title,
      severity: def.severity,
      resolution: resolutionByKey.get(issue.key),
    };
    issueByKey.set(issue.key, full);
    issues.push(full);
    return full;
  };

  // Facility-level checks
  if (!facility.pbjFacilityId || !new RegExp(rules.facilityIdPattern).test(facility.pbjFacilityId)) {
    addIssue({
      key: `E101:${facility.id}`,
      ruleId: 'E101',
      detail: facility.pbjFacilityId
        ? `"${facility.pbjFacilityId}" does not match the demo identifier format.`
        : `${facility.name} has no PBJ facility identifier on file.`,
      action: 'edit_facility',
    });
  }

  // Worker-level checks
  const workerIds = [...new Set(relevant.map((t) => t.employeeId))];
  const idCounts = new Map<string, number>();
  for (const e of i.employees) if (e.pbjEmployeeId) idCounts.set(e.pbjEmployeeId, (idCounts.get(e.pbjEmployeeId) ?? 0) + 1);
  const workerBlocked = new Set<string>();
  for (const id of workerIds) {
    const e = emp.get(id);
    if (!e) continue;
    if (!e.pbjEmployeeId || (idCounts.get(e.pbjEmployeeId) ?? 0) > 1) {
      workerBlocked.add(id);
      addIssue({
        key: `E103:${id}`,
        ruleId: 'E103',
        employeeId: id,
        detail: e.pbjEmployeeId ? `Identifier ${e.pbjEmployeeId} is used by more than one worker.` : `${fullName(e)} has no PBJ worker identifier.`,
        action: 'edit_employee',
      });
    }
    if (!e.payType) {
      workerBlocked.add(id);
      addIssue({ key: `E104:${id}`, ruleId: 'E104', employeeId: id, detail: `${fullName(e)} has no pay type classification.`, action: 'edit_employee' });
    }
    if ((e.workerType === 'agency' || e.workerType === 'contract') && !e.agencyName) {
      addIssue({ key: `W205:${id}`, ruleId: 'W205', employeeId: id, detail: `${fullName(e)} is ${e.workerType} staff with no agency recorded.`, action: 'edit_employee' });
    }
  }

  // Row building
  const rows: PbjDailyRow[] = [];
  const workedByWorker = new Map<string, { tcId: string; start: number; end: number }[]>();

  for (const tc of relevant) {
    const e = emp.get(tc.employeeId);
    if (!e) continue;
    const calc = calcTimecard(tc, { timeZone: tz, nowMs: i.nowMs, shift: tc.shiftId ? shiftById.get(tc.shiftId) : null, pendingCorrections: i.corrections });
    const role = ROLE_BY_ID[tc.roleId];
    const sourceJobCode = role?.sourceJobCode ?? tc.roleId;
    const rowIssueKeys: string[] = [];
    let blockedReason = '';
    let reviewReason = '';

    for (const iv of calc.workedIntervals) {
      const list = workedByWorker.get(e.id) ?? [];
      list.push({ tcId: tc.id, start: iv.start, end: iv.end });
      workedByWorker.set(e.id, list);
    }

    // Split worked time by facility-local calendar day (midnight cutoff, §2.2.b)
    const segs = new Map<string, number>();
    for (const iv of calc.workedIntervals)
      for (const s of splitByLocalDay(iv, tz)) segs.set(s.date, (segs.get(s.date) ?? 0) + s.minutes);
    const segList = [...segs.entries()].filter(([d]) => d >= quarter.start && d <= collectedThrough);
    const tcMinutesInQuarter = segList.reduce((s, [, m]) => s + m, 0);

    // Jobs that are not PBJ-reportable on the work date do not generate PBJ issues.
    const tcMapping = effectiveMapping(i.mappings, facility.id, sourceJobCode, tc.workDate);
    const reportable =
      !tcMapping || tcMapping.reportability === 'required' || (tcMapping.reportability === 'optional' && facility.includeOptionalPbjCategories);

    // Missing punches / unapproved
    const missing = calc.exceptions.find((x) => x.code === 'missing_out' || x.code === 'missing_in' || x.code === 'open_break');
    if (reportable && missing && tc.workDate >= quarter.start) {
      const k = `E106:${tc.id}`;
      addIssue({ key: k, ruleId: 'E106', employeeId: e.id, timecardIds: [tc.id], date: tc.workDate, detail: `${fullName(e)} — ${missing.label} on ${tc.workDate}.`, action: 'open_timecard' });
      rowIssueKeys.push(k);
      blockedReason = missing.label;
    }
    if (reportable && tc.status !== 'approved' && !calc.onClock && (tcMinutesInQuarter > 0 || missing) && tc.workDate >= quarter.start) {
      // Grouped per facility: one actionable issue listing every unapproved record.
      const k = `E105:${facility.id}`;
      addIssue({
        key: k,
        ruleId: 'E105',
        timecardIds: [tc.id],
        hours: round2(tcMinutesInQuarter / 60),
        detail: '',
        action: 'open_timecard',
      });
      rowIssueKeys.push(k);
      blockedReason ||= 'Timecard not approved';
    }
    if (calc.onClock) {
      blockedReason ||= 'Shift in progress';
    }
    if (segList.length === 0) continue;

    // Meal deduction (§2.2.d): at least N minutes per qualifying shift, net of recorded breaks
    let mealAdj = 0;
    if (reportable && calc.workedMinutes + calc.breakMinutes >= rules.mealDeductionThresholdMinutes && calc.breakMinutes < rules.mealDeductionMinutes && !calc.onClock) {
      mealAdj = rules.mealDeductionMinutes - calc.breakMinutes;
      const k = `W201:${tc.id}`;
      addIssue({
        key: k,
        ruleId: 'W201',
        employeeId: e.id,
        timecardIds: [tc.id],
        date: tc.workDate,
        hours: round2(mealAdj / 60),
        detail: `${fullName(e)} — ${calc.breakMinutes ? `${calc.breakMinutes}m` : 'no'} break recorded on ${tc.workDate}; ${mealAdj}m deducted from PBJ hours.`,
        action: 'review',
      });
      rowIssueKeys.push(k);
    }

    // Pay code review (§2.2.j)
    const payCode = tc.sourcePayCode ? PAY_CODES[tc.sourcePayCode] : undefined;
    let excludeForPayCode = false;
    if (reportable && payCode?.reviewForPbj) {
      const k = `W202:${tc.id}`;
      const issue = addIssue({
        key: k,
        ruleId: 'W202',
        employeeId: e.id,
        timecardIds: [tc.id],
        date: tc.workDate,
        hours: round2(tcMinutesInQuarter / 60),
        detail: `${fullName(e)} — pay code ${tc.sourcePayCode} (${payCode.label}) on ${tc.workDate}. ${payCode.reviewForPbj}`,
        action: 'review',
      });
      rowIssueKeys.push(k);
      if (!issue.resolution) reviewReason = 'Pay code needs review';
      else if (issue.resolution.decision === 'exclude_hours') excludeForPayCode = true;
    }

    // Employment dates
    if (reportable && (tc.workDate < e.hireDate || (e.separationDate && tc.workDate > e.separationDate))) {
      const k = `W203:${tc.id}`;
      const issue = addIssue({ key: k, ruleId: 'W203', employeeId: e.id, timecardIds: [tc.id], date: tc.workDate, detail: `${fullName(e)} worked on ${tc.workDate}, outside employment dates.`, action: 'review' });
      rowIssueKeys.push(k);
      if (!issue.resolution) reviewReason ||= 'Outside employment dates';
    }

    // Deduct meal from the largest day segment
    const largest = segList.reduce((a, b) => (b[1] > a[1] ? b : a))[0];

    for (const [date, minutes] of segList) {
      const mapping = effectiveMapping(i.mappings, facility.id, sourceJobCode, date);
      const keys = [...rowIssueKeys];
      let status: PbjRowStatus = 'ready';
      let reason = '';
      if (!mapping) {
        const k = `E102:${facility.id}:${sourceJobCode}`;
        addIssue({
          key: k,
          ruleId: 'E102',
          sourceJobCode,
          timecardIds: [tc.id],
          hours: round2(minutes / 60),
          detail: `Source job "${sourceJobCode}" (${role?.name ?? 'unknown role'}) has no PBJ mapping effective on worked dates.`,
          action: 'map_job',
        });
        keys.push(k);
        status = 'blocked';
        reason = 'Unmapped job code';
      } else if (mapping.reportability === 'not_reported' || (mapping.reportability === 'optional' && !facility.includeOptionalPbjCategories)) {
        status = 'excluded';
        reason = mapping.reportability === 'not_reported' ? 'Job not PBJ-reportable' : 'Optional category not included';
      }
      if (status !== 'excluded') {
        if (blockedReason || workerBlocked.has(e.id)) {
          status = 'blocked';
          reason = blockedReason || 'Worker record incomplete';
        } else if (excludeForPayCode) {
          status = 'excluded';
          reason = 'Excluded after review (training)';
        } else if (status !== 'blocked' && reviewReason) {
          status = 'needs_review';
          reason = reviewReason;
        }
      }
      const adj = date === largest ? Math.min(mealAdj, minutes) : 0;
      const eligibleMinutes = Math.max(0, minutes - adj);
      const code = mapping?.pbjJobTitleCode ?? null;
      rows.push({
        key: `${tc.id}:${date}`,
        employeeId: e.id,
        pbjEmployeeId: e.pbjEmployeeId,
        workerName: fullName(e),
        workerType: e.workerType,
        payTypeCode: e.payType ? PBJ_PAY_TYPE_CODE[e.payType] : null,
        date,
        facilityId: facility.id,
        sourceJobCode,
        roleName: role?.name ?? tc.roleId,
        pbjJobTitleCode: code,
        pbjJobTitle: code ? PBJ_TITLE_BY_CODE[code]?.title ?? null : null,
        rawMinutes: minutes,
        mealAdjustmentMinutes: adj,
        eligibleHours: roundHours(eligibleMinutes, rules.rounding),
        timecardId: tc.id,
        timecardStatus: tc.status,
        source: tc.source,
        sourcePayCode: tc.sourcePayCode,
        status,
        statusReason: reason || (status === 'ready' ? 'Eligible' : ''),
        issueKeys: keys,
      });
    }
  }

  // Overlapping worked time for the same worker (E108)
  for (const [empId, list] of workedByWorker) {
    list.sort((a, b) => a.start - b.start);
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length && list[y].start < list[x].end; y++) {
        if (list[x].tcId === list[y].tcId) continue;
        if (!overlaps(list[x], list[y])) continue;
        const ids = [list[x].tcId, list[y].tcId].sort();
        const k = `E108:${ids.join('+')}`;
        const e = emp.get(empId)!;
        addIssue({ key: k, ruleId: 'E108', employeeId: empId, timecardIds: ids, detail: `${fullName(e)} has overlapping worked time on two records.`, action: 'open_timecard' });
        for (const r of rows) if (ids.includes(r.timecardId) && r.status !== 'excluded') {
          r.status = 'blocked';
          r.statusReason = 'Overlapping records';
          r.issueKeys.push(k);
        }
      }
    }
  }

  // Daily totals per worker (E107 / W204) — reportable rows only
  const perWorkerDay = new Map<string, { hours: number; rows: PbjDailyRow[] }>();
  for (const r of rows) {
    if (r.status === 'excluded') continue;
    const k = `${r.employeeId}:${r.date}`;
    const v = perWorkerDay.get(k) ?? { hours: 0, rows: [] };
    v.hours += r.eligibleHours;
    v.rows.push(r);
    perWorkerDay.set(k, v);
  }
  for (const [k, v] of perWorkerDay) {
    const [empId, date] = k.split(':');
    const e = emp.get(empId)!;
    if (v.hours > rules.maxDailyHours) {
      const ik = `E107:${k}`;
      addIssue({ key: ik, ruleId: 'E107', employeeId: empId, date, hours: round2(v.hours), timecardIds: v.rows.map((r) => r.timecardId), detail: `${fullName(e)} has ${v.hours.toFixed(2)} hours on ${date} (max ${rules.maxDailyHours}).`, action: 'open_timecard' });
      for (const r of v.rows) {
        r.status = 'blocked';
        r.statusReason = 'Over daily maximum';
        r.issueKeys.push(ik);
      }
    } else if (v.hours > rules.reviewDailyHours) {
      const ik = `W204:${k}`;
      const issue = addIssue({ key: ik, ruleId: 'W204', employeeId: empId, date, hours: round2(v.hours), timecardIds: v.rows.map((r) => r.timecardId), detail: `${fullName(e)} has ${v.hours.toFixed(2)} hours on ${date}.`, action: 'review' });
      for (const r of v.rows) {
        r.issueKeys.push(ik);
        if (!issue.resolution && r.status === 'ready') {
          r.status = 'needs_review';
          r.statusReason = 'Long day';
        }
      }
    }
  }

  const unapproved = issueByKey.get(`E105:${facility.id}`);
  if (unapproved) {
    const n = unapproved.timecardIds?.length ?? 0;
    unapproved.detail = `${n} timecard${n === 1 ? ' is' : 's are'} open or pending approval (${(unapproved.hours ?? 0).toFixed(2)} worked hours). Approve them in Time & Attendance.`;
  }

  // W201 rows: meal deduction is applied automatically; rows stay "ready" but the warning
  // remains unresolved until acknowledged.

  // Totals
  const sum = (pred: (r: PbjDailyRow) => boolean) => round2(rows.filter(pred).reduce((s, r) => s + r.eligibleHours, 0));
  const isContract = (r: PbjDailyRow) => r.payTypeCode === 3;
  const nursing = (r: PbjDailyRow) => !!r.pbjJobTitleCode && !!PBJ_TITLE_BY_CODE[r.pbjJobTitleCode]?.nursing;
  const rn = (r: PbjDailyRow) => !!r.pbjJobTitleCode && [5, 6, 7].includes(r.pbjJobTitleCode);
  const ready = (r: PbjDailyRow) => r.status === 'ready';

  const byCode = new Map<number, { hours: number; employeeHours: number; contractHours: number }>();
  for (const r of rows.filter(ready)) {
    if (!r.pbjJobTitleCode) continue;
    const v = byCode.get(r.pbjJobTitleCode) ?? { hours: 0, employeeHours: 0, contractHours: 0 };
    v.hours += r.eligibleHours;
    if (isContract(r)) v.contractHours += r.eligibleHours;
    else v.employeeHours += r.eligibleHours;
    byCode.set(r.pbjJobTitleCode, v);
  }

  // Staffing-monitoring indicators (not errors)
  const days = dateRange(quarter.start, collectedThrough);
  const dailyNursing = days.map((date) => {
    const dr = rows.filter((r) => r.date === date && ready(r));
    return {
      date,
      nursingHours: round2(dr.filter(nursing).reduce((s, r) => s + r.eligibleHours, 0)),
      rnHours: round2(dr.filter(rn).reduce((s, r) => s + r.eligibleHours, 0)),
      contractNursingHours: round2(dr.filter((r) => nursing(r) && isContract(r)).reduce((s, r) => s + r.eligibleHours, 0)),
    };
  });
  const lowRnDays = dailyNursing.filter((d) => d.rnHours < rules.rnHoursPerDayIndicator);
  if (lowRnDays.length)
    addIssue({
      key: `I301:${facility.id}:${quarter.id}`,
      ruleId: 'I301',
      detail: `${lowRnDays.length} day(s) with fewer than ${rules.rnHoursPerDayIndicator} RN hours among eligible records: ${lowRnDays.slice(0, 4).map((d) => d.date).join(', ')}${lowRnDays.length > 4 ? '…' : ''}.`,
      action: 'none',
    });
  const wkend = dailyNursing.filter((d) => [0, 6].includes(dayOfWeek(d.date)));
  const wkday = dailyNursing.filter((d) => ![0, 6].includes(dayOfWeek(d.date)));
  const avg = (l: typeof dailyNursing) => (l.length ? l.reduce((s, d) => s + d.nursingHours, 0) / l.length : 0);
  if (wkend.length && wkday.length && avg(wkday) > 0) {
    const drop = Math.round((1 - avg(wkend) / avg(wkday)) * 100);
    if (drop >= rules.weekendDropIndicatorPct)
      addIssue({ key: `I302:${facility.id}:${quarter.id}`, ruleId: 'I302', detail: `Weekend nursing hours average ${drop}% below weekdays (${avg(wkend).toFixed(1)} vs ${avg(wkday).toFixed(1)} h/day).`, action: 'none' });
  }
  const totalNursing = dailyNursing.reduce((s, d) => s + d.nursingHours, 0);
  const contractNursing = dailyNursing.reduce((s, d) => s + d.contractNursingHours, 0);
  if (totalNursing > 0) {
    const share = Math.round((contractNursing / totalNursing) * 100);
    if (share >= rules.contractShareIndicatorPct)
      addIssue({ key: `I303:${facility.id}:${quarter.id}`, ruleId: 'I303', detail: `${share}% of eligible nursing hours were worked by contract/agency staff.`, action: 'none' });
    const daysWithData = dailyNursing.filter((d) => d.nursingHours > 0).length || 1;
    const hprd = totalNursing / daysWithData / Math.max(1, facility.censusEstimate);
    addIssue({
      key: `I304:${facility.id}:${quarter.id}`,
      ruleId: 'I304',
      detail: `${hprd.toFixed(2)} nursing hours per resident day using a planning census of ${facility.censusEstimate}. Internal estimate only.`,
      action: 'none',
    });
  }

  const sev = { error: 0, warning: 1, indicator: 2 } as const;
  issues.sort((a, b) => sev[a.severity] - sev[b.severity] || a.ruleId.localeCompare(b.ruleId) || (a.date ?? '').localeCompare(b.date ?? ''));

  const fp = sourceFingerprint(i, relevant);
  const daysWithData = new Set(rows.map((r) => r.date)).size;
  const workers = new Set(rows.map((r) => r.employeeId));
  return {
    facilityId: facility.id,
    quarterId: quarter.id,
    rulesetVersion: rules.version,
    fingerprint: fp,
    rows,
    issues,
    source: {
      timecards: relevant.length,
      approved: relevant.filter((t) => t.status === 'approved').length,
      pending: relevant.filter((t) => t.status === 'pending_approval').length,
      open: relevant.filter((t) => t.status === 'open').length,
      imported: relevant.filter((t) => t.source === 'import').length,
      daysInRange: days.length,
      daysWithData,
      workers: workers.size,
      employeeWorkers: [...workers].filter((id) => emp.get(id)?.workerType === 'employee').length,
      contractWorkers: [...workers].filter((id) => emp.get(id)?.workerType !== 'employee').length,
      collectedThrough,
    },
    totals: {
      eligibleHours: sum(ready),
      employeeHours: sum((r) => ready(r) && !isContract(r)),
      contractHours: sum((r) => ready(r) && isContract(r)),
      reviewHours: sum((r) => r.status === 'needs_review'),
      blockedHours: sum((r) => r.status === 'blocked'),
      excludedHours: sum((r) => r.status === 'excluded'),
      nursingHours: round2(totalNursing),
      rnHours: round2(dailyNursing.reduce((s, d) => s + d.rnHours, 0)),
    },
    byJobCode: [...byCode.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([code, v]) => ({ code, title: PBJ_TITLE_BY_CODE[code]?.title ?? '', hours: round2(v.hours), employeeHours: round2(v.employeeHours), contractHours: round2(v.contractHours) })),
    counts: {
      errors: issues.filter((x) => x.severity === 'error').length,
      warnings: issues.filter((x) => x.severity === 'warning').length,
      indicators: issues.filter((x) => x.severity === 'indicator').length,
      unresolvedWarnings: issues.filter((x) => x.severity === 'warning' && !x.resolution).length,
    },
    dailyNursing,
  };
}

/* ------------------------------ preparation status ------------------------------ */

export type PbjStepState = 'complete' | 'attention' | 'blocked' | 'not_started' | 'stale' | 'planned';

export interface PbjStatusSummary {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
  stale: boolean;
  steps: { key: string; title: string; state: PbjStepState; detail: string }[];
}

export function preparationStatus(result: PbjResult, prep: PbjPreparation | undefined): PbjStatusSummary {
  const lastRun = prep?.validationRuns.at(-1);
  const runCurrent = !!lastRun && lastRun.sourceFingerprint === result.fingerprint;
  const approvalCurrent = !!prep?.approval && prep.approval.sourceFingerprint === result.fingerprint;
  const lastExport = prep?.exports.at(-1);
  const exportCurrent = !!lastExport && lastExport.sourceFingerprint === result.fingerprint;
  const stale = (!!prep?.approval && !approvalCurrent) || (!!lastExport && !exportCurrent);
  const unmapped = result.issues.filter((x) => x.ruleId === 'E102').length;
  const sourceOpen = result.source.open + result.source.pending;
  const { errors, unresolvedWarnings } = result.counts;

  const steps: PbjStatusSummary['steps'] = [
    {
      key: 'collect',
      title: 'Collect source data',
      state: sourceOpen ? 'attention' : 'complete',
      detail: sourceOpen ? `${sourceOpen} timecard(s) not yet approved` : `${result.source.timecards} timecards through ${result.source.collectedThrough}`,
    },
    {
      key: 'map',
      title: 'Map workers & jobs',
      state: unmapped ? 'blocked' : 'complete',
      detail: unmapped ? `${unmapped} unmapped job code(s)` : 'All worked job codes mapped',
    },
    {
      key: 'validate',
      title: 'Validate & resolve',
      state: !lastRun ? 'not_started' : !runCurrent ? 'stale' : errors ? 'blocked' : unresolvedWarnings ? 'attention' : 'complete',
      detail: !lastRun
        ? 'Checks have not been run'
        : !runCurrent
          ? 'Source data changed since last run — rerun checks'
          : errors
            ? `${errors} blocking error(s)`
            : unresolvedWarnings
              ? `${unresolvedWarnings} warning(s) to review`
              : 'No detected errors under demo rules',
    },
    {
      key: 'approve',
      title: 'Review & approve',
      state: approvalCurrent ? 'complete' : prep?.approval ? 'stale' : 'not_started',
      detail: approvalCurrent ? `Approved by ${prep!.approval!.by}` : prep?.approval ? 'Approval is stale — source changed' : 'Awaiting reviewer approval',
    },
    {
      key: 'export',
      title: 'Generate export',
      state: exportCurrent ? 'complete' : lastExport ? 'stale' : 'not_started',
      detail: exportCurrent ? lastExport!.fileName : lastExport ? 'Export snapshot is stale' : 'No export snapshot',
    },
    {
      key: 'submit',
      title: 'Track submission',
      state: prep?.submissions.length ? 'complete' : 'planned',
      detail: prep?.submissions.length ? 'Manual submission recorded' : 'Direct iQIES submission is a planned integration',
    },
  ];

  let label = 'Not started';
  let tone: PbjStatusSummary['tone'] = 'neutral';
  if (prep?.submissions.length && !stale) [label, tone] = ['Submission recorded', 'info'];
  else if (stale) [label, tone] = ['Package stale', 'warning'];
  else if (exportCurrent) [label, tone] = ['Export generated', 'success'];
  else if (approvalCurrent) [label, tone] = ['Approved for export', 'success'];
  else if (errors) [label, tone] = [`Blocked · ${errors} error${errors === 1 ? '' : 's'}`, 'danger'];
  else if (!runCurrent) [label, tone] = ['Checks need to run', 'warning'];
  else if (unresolvedWarnings) [label, tone] = ['Needs review', 'warning'];
  else [label, tone] = ['Ready for approval', 'info'];

  return { label, tone, stale, steps };
}

export function canApprovePackage(result: PbjResult, prep: PbjPreparation | undefined): { ok: boolean; reason?: string } {
  const lastRun = prep?.validationRuns.at(-1);
  if (!lastRun) return { ok: false, reason: 'Run checks first.' };
  if (lastRun.sourceFingerprint !== result.fingerprint) return { ok: false, reason: 'Source data changed since the last run. Rerun checks.' };
  if (result.counts.errors) return { ok: false, reason: `Resolve ${result.counts.errors} blocking error(s).` };
  if (result.counts.unresolvedWarnings) return { ok: false, reason: `Review ${result.counts.unresolvedWarnings} warning(s).` };
  return { ok: true };
}

/* ------------------------------ helpers ------------------------------ */

function fullName(e: Employee): string {
  return `${e.preferredName ?? e.firstName} ${e.lastName}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addDaysSafe(date: ISODate, n: number): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return t.toISOString().slice(0, 10);
}
