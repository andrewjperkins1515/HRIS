/**
 * Sample import flow for agency/contract hours (CSV) with explicit column mapping.
 * Parsing and row validation are pure; the store applies accepted rows.
 */
import { PAY_CODES, ROLES } from '../catalog';
import type { ISODate, LocalTime } from '../types';
import { toCsv } from './export';

export const IMPORT_FIELDS = [
  { key: 'externalRef', label: 'Agency worker ID', required: true, hint: 'Stable ID from the agency. No SSNs.' },
  { key: 'workerName', label: 'Worker name', required: true, hint: 'First Last' },
  { key: 'agencyName', label: 'Agency name', required: true, hint: '' },
  { key: 'jobCode', label: 'Source job code', required: true, hint: 'e.g. RN, LPN, CNA' },
  { key: 'workDate', label: 'Work date', required: true, hint: 'YYYY-MM-DD (facility local)' },
  { key: 'timeIn', label: 'Time in', required: true, hint: 'HH:MM, 24-hour' },
  { key: 'timeOut', label: 'Time out', required: true, hint: 'HH:MM, 24-hour; earlier than time in = next day' },
  { key: 'mealMinutes', label: 'Meal break minutes', required: false, hint: 'Defaults to 0' },
  { key: 'payCode', label: 'Pay code', required: false, hint: 'AGY, REG, ORIENT…' },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]['key'];

export const TEMPLATE_HEADERS = ['agency_worker_id', 'worker_name', 'agency_name', 'job_code', 'work_date', 'time_in', 'time_out', 'meal_minutes', 'pay_code'];

export function templateCsv(): string {
  return toCsv([TEMPLATE_HEADERS, ['AGY-0000', 'Sample Worker', 'Example Staffing LLC', 'CNA', '2026-11-10', '07:00', '15:00', '30', 'AGY']]);
}

/** Sample agency file with non-template headers so the mapping step is meaningful. */
export function sampleAgencyCsv(): string {
  return toCsv([
    ['Staff #', 'Name', 'Vendor', 'Position', 'Shift Date', 'Start', 'End', 'Meal (min)', 'Earning Code'],
    ['BRS-4471', 'Renee Castillo', 'BrightShift Staffing', 'CNA', '2026-11-09', '07:00', '15:00', '30', 'AGY'],
    ['BRS-4471', 'Renee Castillo', 'BrightShift Staffing', 'CNA', '2026-11-10', '07:00', '15:00', '30', 'AGY'],
    ['BRS-5120', 'Marcus Webb', 'BrightShift Staffing', 'LPN', '2026-11-10', '23:00', '07:30', '30', 'AGY'],
    ['BRS-5233', 'Hana Suzuki', 'BrightShift Staffing', 'CNA', '2026-11-11', '15:00', '23:00', '0', 'ORIENT'],
    ['BRS-5310', 'Omar Haddad', 'BrightShift Staffing', 'RN', '2026-11-12', '25:00', '07:00', '30', 'AGY'],
  ]);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

/** Guess a column mapping from header names. Users confirm or change it explicitly. */
export function guessMapping(headers: string[]): Partial<Record<ImportFieldKey, number>> {
  const norm = headers.map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const used = new Set<number>();
  // Needles are tried in priority order; a column is never suggested for two fields.
  const find = (...needles: string[]) => {
    for (const n of needles) {
      const exact = norm.findIndex((h, i) => !used.has(i) && h === n);
      const idx = exact >= 0 ? exact : norm.findIndex((h, i) => !used.has(i) && h.includes(n));
      if (idx >= 0) {
        used.add(idx);
        return idx;
      }
    }
    return undefined;
  };
  const externalRef = find('agencyworkerid', 'workerid', 'staff', 'id');
  const workerName = find('workername', 'name');
  const agencyName = find('agencyname', 'agency', 'vendor');
  const jobCode = find('jobcode', 'position', 'job', 'role');
  const workDate = find('workdate', 'shiftdate', 'date');
  const timeIn = find('timein', 'start', 'in');
  const timeOut = find('timeout', 'end', 'out');
  const mealMinutes = find('mealminutes', 'meal', 'break');
  const payCode = find('paycode', 'earning', 'code');
  return { externalRef, workerName, agencyName, jobCode, workDate, timeIn, timeOut, mealMinutes, payCode };
}

export interface ParsedImportRow {
  line: number;
  externalRef: string;
  firstName: string;
  lastName: string;
  agencyName: string;
  jobCode: string;
  roleId: string | null;
  workDate: ISODate;
  timeIn: LocalTime;
  timeOut: LocalTime;
  mealMinutes: number;
  payCode: string;
  errors: string[];
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateImportRows(
  rows: string[][],
  mapping: Partial<Record<ImportFieldKey, number>>,
  opts: { quarterStart: ISODate; today: ISODate },
): ParsedImportRow[] {
  const get = (r: string[], k: ImportFieldKey) => (mapping[k] === undefined ? '' : (r[mapping[k]!] ?? '').trim());
  return rows.map((r, idx) => {
    const errors: string[] = [];
    const name = get(r, 'workerName');
    const [firstName, ...rest] = name.split(/\s+/);
    const jobCode = get(r, 'jobCode').toUpperCase();
    const role = ROLES.find((x) => x.sourceJobCode === jobCode);
    const workDate = get(r, 'workDate');
    const timeIn = get(r, 'timeIn');
    const timeOut = get(r, 'timeOut');
    const meal = Number(get(r, 'mealMinutes') || '0');
    const payCode = (get(r, 'payCode') || 'AGY').toUpperCase();
    const ext = get(r, 'externalRef');
    if (!ext) errors.push('Missing agency worker ID');
    if (/^\d{3}-?\d{2}-?\d{4}$/.test(ext)) errors.push('Worker ID looks like an SSN — not allowed');
    if (!name) errors.push('Missing worker name');
    if (!role) errors.push(`Unknown job code "${jobCode}"`);
    if (!DATE_RE.test(workDate)) errors.push('Invalid work date');
    else if (workDate < opts.quarterStart || workDate > opts.today) errors.push('Work date outside the open reporting period');
    if (!TIME_RE.test(timeIn)) errors.push(`Invalid time in "${timeIn}"`);
    if (!TIME_RE.test(timeOut)) errors.push(`Invalid time out "${timeOut}"`);
    if (Number.isNaN(meal) || meal < 0 || meal > 120) errors.push('Invalid meal minutes');
    if (!PAY_CODES[payCode]) errors.push(`Unknown pay code "${payCode}"`);
    else if (!PAY_CODES[payCode].worked) errors.push(`Pay code ${payCode} is nonworked time — import it as leave, not hours`);
    return {
      line: idx + 2,
      externalRef: ext,
      firstName: firstName ?? '',
      lastName: rest.join(' '),
      agencyName: get(r, 'agencyName'),
      jobCode,
      roleId: role?.id ?? null,
      workDate,
      timeIn,
      timeOut,
      mealMinutes: Number.isNaN(meal) ? 0 : meal,
      payCode,
      errors,
    };
  });
}
