/**
 * Deterministic demo seed. All people, facilities and identifiers are fictional.
 *
 * Demo date: Friday, November 13, 2026 at 2:45 PM Eastern (Cedar Ridge local time).
 * History is generated from weekly work patterns with a seeded RNG, then specific
 * scenarios (missing punch, pending correction, onboarding, offboarding, unmapped PBJ job
 * code, etc.) are layered on top so every demo flow has a starting point.
 */
import { ROLE_BY_ID, SHIFT_TYPES } from '../domain/catalog';
import { buildTasks, OFFBOARDING_TEMPLATE, ONBOARDING_TEMPLATE } from '../domain/lifecycle';
import type {
  AuditEvent,
  CorrectionRequest,
  CoverageTarget,
  Credential,
  CredentialType,
  DemoUser,
  DepartmentId,
  Employee,
  Facility,
  ImportBatch,
  LifecycleWorkflow,
  NonWorkedEntry,
  PbjJobMapping,
  PbjPreparation,
  Punch,
  RoleKey,
  ScheduleWeek,
  Shift,
  ShiftType,
  TimeOffRequest,
  Timecard,
} from '../domain/types';
import { addDays, dateRange, dayOfWeek, shiftInterval, zonedToUtc, zonedToUtcMs } from '../domain/time';
import { inferShiftType } from '../domain/catalog';

export const DEMO_TODAY = '2026-11-13';
export const DEMO_NOW_ISO = '2026-11-13T19:45:00.000Z'; // 2:45 PM EST
export const HISTORY_START = '2026-10-01';
export const CURRENT_WEEK = '2026-11-08';
export const NEXT_WEEK = '2026-11-15';
export const SEED_VERSION = 8;

/* ------------------------------ RNG ------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ facilities ------------------------------ */

export const FACILITIES: Facility[] = [
  {
    id: 'fac-cedar',
    name: 'Cedar Ridge Health & Rehabilitation',
    shortName: 'Cedar Ridge',
    city: 'Columbus',
    state: 'OH',
    timeZone: 'America/New_York',
    pbjFacilityId: 'OH36C4127',
    censusEstimate: 24,
    licensedBeds: 32,
    pbjReporting: true,
    includeOptionalPbjCategories: false,
  },
  {
    id: 'fac-willow',
    name: 'Willow Bend Care Center',
    shortName: 'Willow Bend',
    city: 'Springfield',
    state: 'IL',
    timeZone: 'America/Chicago',
    pbjFacilityId: '',
    censusEstimate: 16,
    licensedBeds: 22,
    pbjReporting: true,
    includeOptionalPbjCategories: false,
  },
];

export const DEMO_USERS: DemoUser[] = [
  { role: 'corporate_admin', name: 'Alex Morgan', title: 'VP of Operations', facilityIds: null, departmentIds: null },
  { role: 'facility_admin', name: 'Denise Carter', title: 'Administrator, Cedar Ridge', facilityIds: ['fac-cedar'], departmentIds: null },
  { role: 'hr_manager', name: 'Lauren Pierce', title: 'Regional HR Manager', facilityIds: null, departmentIds: null },
  { role: 'scheduler', name: 'Kim Tran', title: 'Staffing Coordinator, Cedar Ridge Nursing', facilityIds: ['fac-cedar'], departmentIds: ['nursing'] },
  { role: 'pbj_reviewer', name: 'Sam Patel', title: 'Clinical Reimbursement & PBJ', facilityIds: null, departmentIds: null },
  { role: 'employee', name: 'Maria Alvarez', title: 'CNA, Cedar Ridge', facilityIds: ['fac-cedar'], departmentIds: ['nursing'], employeeId: 'E-10011' },
];

export function demoUser(role: RoleKey): DemoUser {
  return DEMO_USERS.find((u) => u.role === role)!;
}

/* ------------------------------ roster ------------------------------ */

type PatternKey = ShiftType | 'admin' | 'dietary_early' | 'dietary_late' | 'none';

const PATTERN_TIMES: Record<PatternKey, { start: string; end: string; brk: number } | null> = {
  day: { start: '07:00', end: '15:00', brk: 30 },
  evening: { start: '15:00', end: '23:00', brk: 30 },
  night: { start: '23:00', end: '07:00', brk: 30 },
  overnight: { start: '19:00', end: '07:00', brk: 30 },
  admin: { start: '08:00', end: '16:30', brk: 30 },
  dietary_early: { start: '06:00', end: '14:30', brk: 30 },
  dietary_late: { start: '14:00', end: '20:00', brk: 0 },
  none: null,
};

interface RosterSpec {
  n: number; // numeric id suffix
  first: string;
  last: string;
  fac: 'fac-cedar' | 'fac-willow';
  role: string;
  pattern: PatternKey;
  days: number[]; // day-of-week worked
  hire: string;
  type?: Employee['workerType'];
  agency?: string;
  emp?: Employee['employmentType'];
  status?: Employee['status'];
  extraFac?: string[];
  manager?: number;
  preferred?: string;
}

const MF = [1, 2, 3, 4, 5];

// Managers: 10001 DON Cedar, 10002 Admin Cedar, 10101 Admin Willow, 10102 DON Willow
const ROSTER: RosterSpec[] = [
  // ---- Cedar Ridge ----
  { n: 10001, first: 'Rachel', last: 'Bloom', fac: 'fac-cedar', role: 'don', pattern: 'admin', days: MF, hire: '2019-03-11', manager: 10002 },
  { n: 10002, first: 'Denise', last: 'Carter', fac: 'fac-cedar', role: 'administrator', pattern: 'admin', days: MF, hire: '2017-08-21' },
  { n: 10003, first: 'Ellen', last: 'Fischer', fac: 'fac-cedar', role: 'mds', pattern: 'admin', days: MF, hire: '2020-01-06', manager: 10001 },
  { n: 10004, first: 'Priya', last: 'Nair', fac: 'fac-cedar', role: 'rn', pattern: 'day', days: [0, 1, 2, 3, 4], hire: '2021-05-17', manager: 10001 },
  { n: 10005, first: 'Michael', last: 'Grant', fac: 'fac-cedar', role: 'rn', pattern: 'overnight', days: [5, 6, 0], hire: '2022-02-14', manager: 10001 },
  { n: 10006, first: 'James', last: 'Okafor', fac: 'fac-cedar', role: 'lpn', pattern: 'night', days: [1, 2, 3, 4, 5], hire: '2018-10-01', manager: 10001 },
  { n: 10007, first: 'Sofia', last: 'Russo', fac: 'fac-cedar', role: 'lpn', pattern: 'evening', days: MF, hire: '2023-04-03', manager: 10001 },
  { n: 10008, first: 'Andre', last: 'Lewis', fac: 'fac-cedar', role: 'lpn', pattern: 'day', days: [2, 3, 4, 5, 6], hire: '2020-09-14', manager: 10001 },
  { n: 10009, first: 'Tomás', last: 'Reyes', preferred: 'Tom', fac: 'fac-cedar', role: 'cna', pattern: 'day', days: MF, hire: '2021-07-12', manager: 10001 },
  { n: 10010, first: 'Kevin', last: 'Marsh', fac: 'fac-cedar', role: 'cna', pattern: 'day', days: [0, 1, 2, 3, 4], hire: '2022-11-28', manager: 10001 },
  { n: 10011, first: 'Maria', last: 'Alvarez', fac: 'fac-cedar', role: 'cna', pattern: 'evening', days: MF, hire: '2019-06-24', manager: 10001 },
  { n: 10012, first: 'Victor', last: 'Hughes', fac: 'fac-cedar', role: 'cna', pattern: 'night', days: [0, 1, 2, 3, 4], hire: '2020-03-02', manager: 10001 },
  { n: 10013, first: 'Jasmine', last: 'Brooks', fac: 'fac-cedar', role: 'cna', pattern: 'evening', days: [0, 1, 2, 3, 4], hire: '2023-01-09', manager: 10001 },
  { n: 10014, first: 'Nia', last: 'Robinson', fac: 'fac-cedar', role: 'cna', pattern: 'night', days: [2, 3, 4, 5, 6], hire: '2021-12-06', manager: 10001 },
  { n: 10015, first: 'Ethan', last: 'Cole', fac: 'fac-cedar', role: 'cna', pattern: 'day', days: [6, 0], hire: '2024-05-20', emp: 'part_time', manager: 10001 },
  { n: 10016, first: 'Lucy', last: 'Park', fac: 'fac-cedar', role: 'cna', pattern: 'evening', days: [5, 6, 0], hire: '2024-08-12', emp: 'part_time', manager: 10001 },
  { n: 10017, first: 'Brenda', last: 'Fox', fac: 'fac-cedar', role: 'rna', pattern: 'day', days: MF, hire: '2018-04-16', manager: 10001 },
  { n: 10018, first: 'Carlos', last: 'Mendez', fac: 'fac-cedar', role: 'cmt', pattern: 'day', days: [0, 1, 2, 3, 6], hire: '2022-06-06', manager: 10001 },
  { n: 10019, first: 'Patty', last: 'Owens', fac: 'fac-cedar', role: 'unit_clerk', pattern: 'day', days: MF, hire: '2016-02-01', manager: 10001 },
  { n: 10020, first: 'Renee', last: 'Castillo', fac: 'fac-cedar', role: 'cna', pattern: 'none', days: [], hire: '2026-10-05', type: 'agency', agency: 'BrightShift Staffing', emp: 'prn', manager: 10001 },
  { n: 10021, first: 'Greg', last: 'Holt', fac: 'fac-cedar', role: 'bom', pattern: 'admin', days: MF, hire: '2019-09-09', manager: 10002 },
  { n: 10022, first: 'Tara', last: 'Quinn', fac: 'fac-cedar', role: 'receptionist', pattern: 'admin', days: MF, hire: '2023-03-13', manager: 10002 },
  { n: 10023, first: 'Helen', last: 'Moss', fac: 'fac-cedar', role: 'dietitian', pattern: 'admin', days: [2, 4], hire: '2021-01-11', emp: 'part_time', manager: 10002, extraFac: ['fac-willow'] },
  { n: 10024, first: 'Rosa', last: 'Delgado', fac: 'fac-cedar', role: 'dietary_mgr', pattern: 'dietary_early', days: MF, hire: '2018-07-30', manager: 10002 },
  { n: 10025, first: 'Frank', last: 'Bell', fac: 'fac-cedar', role: 'cook', pattern: 'dietary_early', days: [0, 1, 2, 3, 6], hire: '2020-11-02', manager: 10024 },
  { n: 10026, first: 'Dana', last: 'Whitfield', fac: 'fac-cedar', role: 'dietary_aide', pattern: 'dietary_early', days: MF, hire: '2022-08-15', manager: 10024 },
  { n: 10027, first: 'Leo', last: 'Martin', fac: 'fac-cedar', role: 'dietary_aide', pattern: 'dietary_late', days: [0, 1, 2, 4, 5], hire: '2024-02-05', emp: 'part_time', manager: 10024 },
  { n: 10028, first: 'Gloria', last: 'Benson', fac: 'fac-cedar', role: 'housekeeper', pattern: 'day', days: MF, hire: '2015-05-04', status: 'offboarding', manager: 10030 },
  { n: 10029, first: 'Ray', last: 'Simmons', fac: 'fac-cedar', role: 'housekeeper', pattern: 'day', days: [0, 3, 4, 5, 6], hire: '2021-10-18', manager: 10030 },
  { n: 10030, first: 'Diane', last: 'Ford', fac: 'fac-cedar', role: 'evs_sup', pattern: 'day', days: MF, hire: '2017-01-23', manager: 10002 },
  { n: 10031, first: 'Mei', last: 'Chen', fac: 'fac-cedar', role: 'laundry_aide', pattern: 'day', days: [1, 2, 3, 5, 6], hire: '2023-06-19', manager: 10030 },
  { n: 10032, first: 'Bob', last: 'Turner', fac: 'fac-cedar', role: 'maint_dir', pattern: 'admin', days: MF, hire: '2014-09-08', manager: 10002 },
  { n: 10033, first: 'Carla', last: 'Jimenez', fac: 'fac-cedar', role: 'act_dir', pattern: 'admin', days: MF, hire: '2019-11-11', manager: 10002 },
  { n: 10034, first: 'Owen', last: 'Price', fac: 'fac-cedar', role: 'act_asst', pattern: 'day', days: [0, 3, 4, 5, 6], hire: '2024-09-03', manager: 10033 },
  { n: 10035, first: 'Hannah', last: 'Wolfe', fac: 'fac-cedar', role: 'ss_dir', pattern: 'admin', days: MF, hire: '2020-06-22', manager: 10002 },
  { n: 10036, first: 'Daniel', last: 'Okoro', fac: 'fac-cedar', role: 'pt', pattern: 'admin', days: MF, hire: '2023-02-27', type: 'contract', agency: 'Summit Rehab Partners', manager: 10002 },
  { n: 10037, first: 'Erin', last: 'Shaw', fac: 'fac-cedar', role: 'cota', pattern: 'admin', days: [1, 2, 3, 4], hire: '2022-04-11', manager: 10002 },
  { n: 10038, first: 'Jordan', last: 'Lee', fac: 'fac-cedar', role: 'cna', pattern: 'none', days: [], hire: '2026-11-09', status: 'onboarding', manager: 10001 },
  // ---- Willow Bend ----
  { n: 10101, first: 'Paul', last: 'Reed', fac: 'fac-willow', role: 'administrator', pattern: 'admin', days: MF, hire: '2018-02-05' },
  { n: 10102, first: 'Karen', last: 'Vance', fac: 'fac-willow', role: 'don', pattern: 'admin', days: MF, hire: '2020-07-13', manager: 10101 },
  { n: 10103, first: 'Grace', last: 'Kim', fac: 'fac-willow', role: 'rn', pattern: 'day', days: [0, 1, 3, 5], hire: '2021-03-22', emp: 'part_time', manager: 10102, extraFac: ['fac-cedar'] },
  { n: 10104, first: 'Tyrone', last: 'Hill', fac: 'fac-willow', role: 'lpn', pattern: 'day', days: [1, 2, 3, 4, 6], hire: '2019-05-06', manager: 10102 },
  { n: 10105, first: 'Amy', last: 'Novak', fac: 'fac-willow', role: 'lpn', pattern: 'night', days: [0, 1, 2, 3, 4], hire: '2022-09-19', manager: 10102 },
  { n: 10106, first: 'Luis', last: 'Ortega', fac: 'fac-willow', role: 'cna', pattern: 'day', days: MF, hire: '2020-12-07', manager: 10102 },
  { n: 10107, first: 'Kayla', last: 'Burns', fac: 'fac-willow', role: 'cna', pattern: 'day', days: [0, 2, 3, 4, 6], hire: '2023-08-28', manager: 10102 },
  { n: 10108, first: 'Jada', last: 'Wright', fac: 'fac-willow', role: 'cna', pattern: 'evening', days: MF, hire: '2021-04-26', manager: 10102 },
  { n: 10109, first: 'Sam', last: 'Ellis', fac: 'fac-willow', role: 'cna', pattern: 'evening', days: [0, 4, 5, 6], hire: '2024-01-15', emp: 'part_time', manager: 10102 },
  { n: 10110, first: 'Rita', last: 'Gomez', fac: 'fac-willow', role: 'cna', pattern: 'night', days: [2, 3, 4, 5, 6], hire: '2019-10-14', manager: 10102 },
  { n: 10111, first: 'Paul', last: 'Dixon', fac: 'fac-willow', role: 'cna', pattern: 'evening', days: [1, 2, 3], hire: '2026-09-28', type: 'agency', emp: 'prn', manager: 10102 },
  { n: 10112, first: 'Ben', last: 'Ward', fac: 'fac-willow', role: 'cmt', pattern: 'day', days: [1, 2, 3, 4, 5], hire: '2022-03-07', manager: 10102 },
  { n: 10113, first: 'June', last: 'Harper', fac: 'fac-willow', role: 'cook', pattern: 'dietary_early', days: MF, hire: '2017-06-12', manager: 10101 },
  { n: 10114, first: 'Aisha', last: 'Rahman', fac: 'fac-willow', role: 'dietary_aide', pattern: 'none', days: [], hire: '2026-11-16', status: 'onboarding', manager: 10113 },
  { n: 10115, first: 'Iris', last: 'Cole', fac: 'fac-willow', role: 'housekeeper', pattern: 'day', days: MF, hire: '2021-08-02', manager: 10101 },
  { n: 10116, first: 'Dale', last: 'Price', fac: 'fac-willow', role: 'maint_tech', pattern: 'admin', days: MF, hire: '2020-04-20', manager: 10101 },
  { n: 10117, first: 'Nora', last: 'Lake', fac: 'fac-willow', role: 'act_asst', pattern: 'day', days: [1, 3, 5, 6], hire: '2023-10-30', manager: 10101 },
  { n: 10118, first: 'Ivy', last: 'Grant', fac: 'fac-willow', role: 'ss_asst', pattern: 'admin', days: MF, hire: '2022-01-24', manager: 10101 },
  { n: 10119, first: 'Mark', last: 'Silva', fac: 'fac-willow', role: 'ot', pattern: 'admin', days: [1, 2, 4], hire: '2023-05-08', type: 'contract', agency: 'Summit Rehab Partners', manager: 10101 },
];

const CRED_NUMBERS: Partial<Record<CredentialType, string>> = {
  'RN License': 'RN.',
  'LPN License': 'PN.',
  'CNA Certification': 'NA-',
  'Medication Aide Certification': 'MA-',
  'Therapy License': 'TL-',
  'Social Work License': 'SW.',
  'Administrator License': 'NHA-',
};

function pbjIdFor(n: number): string {
  // Deterministic, non-PII worker identifier.
  const rnd = mulberry32(n * 7919);
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = 'W';
  for (let i = 0; i < 7; i++) s += chars[Math.floor(rnd() * chars.length)];
  return s;
}

function buildEmployee(spec: RosterSpec): Employee {
  const role = ROLE_BY_ID[spec.role];
  const rnd = mulberry32(spec.n);
  const credentials: Credential[] = role.requiredCredentials.map((type, idx) => {
    const exp = type === 'TB Screening' ? addDays('2027-01-01', Math.floor(rnd() * 240)) : addDays('2027-03-01', Math.floor(rnd() * 600));
    return {
      id: `CR-${spec.n}-${idx}`,
      type,
      number: CRED_NUMBERS[type] ? `${CRED_NUMBERS[type]}${Math.floor(100000 + rnd() * 899999)}` : undefined,
      issuedOn: addDays(spec.hire, 10),
      expiresOn: exp,
      verification: 'verified',
    };
  });
  const workerType = spec.type ?? 'employee';
  const availability = [0, 1, 2, 3, 4, 5, 6].map((d) => (spec.days.includes(d) ? 'preferred' : 'available')) as Employee['availability'];
  return {
    id: `E-${spec.n}`,
    pbjEmployeeId: pbjIdFor(spec.n),
    firstName: spec.first,
    lastName: spec.last,
    preferredName: spec.preferred,
    email: `${(spec.preferred ?? spec.first).toLowerCase().replace(/[^a-z]/g, '')}.${spec.last.toLowerCase()}@example.org`,
    phone: `(555) 01${String(spec.n).slice(-2)}-${String(1000 + ((spec.n * 37) % 9000)).slice(0, 4)}`,
    status: spec.status ?? 'active',
    workerType,
    agencyName: spec.agency,
    payType: workerType === 'employee' ? role.flsa : 'contract',
    employmentType: spec.emp ?? 'full_time',
    primaryFacilityId: spec.fac,
    additionalFacilityIds: spec.extraFac ?? [],
    departmentId: role.departmentId,
    roleId: spec.role,
    managerId: spec.manager ? `E-${spec.manager}` : null,
    hireDate: spec.hire,
    availability,
    credentials,
    createdAt: `${spec.hire}T12:00:00.000Z`,
    createdBySource: 'seed',
  };
}

/* ------------------------------ seed builder ------------------------------ */

export interface SeedState {
  seedVersion: number;
  facilities: Facility[];
  employees: Employee[];
  workflows: LifecycleWorkflow[];
  shifts: Shift[];
  scheduleWeeks: ScheduleWeek[];
  coverageTargets: CoverageTarget[];
  timeOff: TimeOffRequest[];
  timecards: Timecard[];
  nonWorked: NonWorkedEntry[];
  corrections: CorrectionRequest[];
  audit: AuditEvent[];
  mappings: PbjJobMapping[];
  preparations: PbjPreparation[];
  importBatches: ImportBatch[];
  demoNowIso: string;
}

export function buildSeed(): SeedState {
  const rnd = mulberry32(20261113);
  const ri = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const facById = Object.fromEntries(FACILITIES.map((f) => [f.id, f]));
  const employees = ROSTER.map(buildEmployee);
  const empById = new Map(employees.map((e) => [e.id, e]));
  const nowMs = Date.parse(DEMO_NOW_ISO);

  // ---- scenario tweaks on people ----
  const priya = empById.get('E-10004')!;
  priya.credentials.find((c) => c.type === 'RN License')!.expiresOn = '2026-11-30';
  const victor = empById.get('E-10012')!;
  victor.credentials.find((c) => c.type === 'CPR/BLS')!.expiresOn = '2026-11-05';
  const lucy = empById.get('E-10016')!;
  lucy.credentials.find((c) => c.type === 'TB Screening')!.expiresOn = '2026-12-04';
  const renee = empById.get('E-10020')!;
  renee.externalRef = 'BRS-4471';
  const dixon = empById.get('E-10111')!; // agency without agency name (PBJ warning W205)
  dixon.agencyName = undefined;
  const maria = empById.get('E-10011')!;
  maria.availability[6] = 'unavailable';
  const kevin = empById.get('E-10010')!;
  kevin.availability[5] = 'unavailable';
  const gloria = empById.get('E-10028')!;
  gloria.separationDate = '2026-11-20';
  const jordan = empById.get('E-10038')!;
  jordan.firstShiftDate = '2026-11-16';
  jordan.credentials = [
    { id: 'CR-10038-0', type: 'CNA Certification', number: 'NA-482201', issuedOn: '2026-08-14', expiresOn: '2028-08-14', verification: 'pending', note: 'Awaiting registry lookup (placeholder).' },
    { id: 'CR-10038-1', type: 'CPR/BLS', number: undefined, issuedOn: '2026-09-02', expiresOn: '2028-09-30', verification: 'verified' },
    { id: 'CR-10038-2', type: 'TB Screening', issuedOn: undefined, expiresOn: undefined, verification: 'not_started' },
  ];
  const aisha = empById.get('E-10114')!;
  aisha.firstShiftDate = '2026-11-18';
  aisha.credentials = aisha.credentials.map((c) => ({ ...c, verification: 'not_started', issuedOn: undefined, expiresOn: undefined }));

  // ---- shifts from patterns ----
  const shifts: Shift[] = [];
  let shiftSeq = 1;
  const nextWeekEnd = addDays(NEXT_WEEK, 6);
  const allDates = dateRange(addDays(HISTORY_START, -1), nextWeekEnd);
  for (const spec of ROSTER) {
    const times = PATTERN_TIMES[spec.pattern];
    if (!times) continue;
    const e = empById.get(`E-${spec.n}`)!;
    for (const date of allDates) {
      if (!spec.days.includes(dayOfWeek(date))) continue;
      if (date < e.hireDate) continue;
      shifts.push({
        id: `S-${shiftSeq++}`,
        facilityId: spec.fac,
        departmentId: e.departmentId,
        roleId: e.roleId,
        date,
        start: times.start,
        end: times.end,
        shiftType: inferShiftType(times.start, times.end),
        unpaidBreakMinutes: times.brk,
        employeeId: e.id,
      });
    }
  }
  const findShift = (empId: string, date: string) => shifts.find((s) => s.employeeId === empId && s.date === date);
  const addShift = (s: Omit<Shift, 'id' | 'shiftType' | 'unpaidBreakMinutes'> & Partial<Pick<Shift, 'shiftType' | 'unpaidBreakMinutes'>>) => {
    const full: Shift = { id: `S-${shiftSeq++}`, shiftType: inferShiftType(s.start, s.end), unpaidBreakMinutes: 30, ...s };
    shifts.push(full);
    return full;
  };

  // Gloria (offboarding, separation 11/20): she is still assigned to a shift after separation (Sat 11/21 picked up).
  addShift({ facilityId: 'fac-cedar', departmentId: 'evs', roleId: 'housekeeper', date: '2026-11-21', start: '07:00', end: '15:00', employeeId: gloria.id });
  // Open shifts — current (published) week and next (draft) week.
  addShift({ facilityId: 'fac-cedar', departmentId: 'nursing', roleId: 'cna', date: '2026-11-14', start: '23:00', end: '07:00', employeeId: null, notes: 'Call-off coverage' });
  addShift({ facilityId: 'fac-cedar', departmentId: 'nursing', roleId: 'cna', date: '2026-11-17', start: '15:00', end: '23:00', employeeId: null });
  addShift({ facilityId: 'fac-cedar', departmentId: 'nursing', roleId: 'cna', date: '2026-11-21', start: '07:00', end: '15:00', employeeId: null });
  addShift({ facilityId: 'fac-cedar', departmentId: 'nursing', roleId: 'lpn', date: '2026-11-21', start: '23:00', end: '07:00', employeeId: null });
  addShift({ facilityId: 'fac-cedar', departmentId: 'nursing', roleId: 'rn', date: '2026-11-19', start: '07:00', end: '15:00', employeeId: null, notes: 'Priya PTO request pending' });
  addShift({ facilityId: 'fac-cedar', departmentId: 'dietary', roleId: 'dietary_aide', date: '2026-11-16', start: '14:00', end: '20:00', employeeId: null, unpaidBreakMinutes: 0 });
  addShift({ facilityId: 'fac-willow', departmentId: 'nursing', roleId: 'cna', date: '2026-11-15', start: '23:00', end: '07:00', employeeId: null });
  addShift({ facilityId: 'fac-willow', departmentId: 'nursing', roleId: 'lpn', date: '2026-11-20', start: '15:00', end: '23:00', employeeId: null });
  // Conflicting assignment: Tom double-booked on Tue 11/17 (day + mid shift).
  addShift({ facilityId: 'fac-cedar', departmentId: 'nursing', roleId: 'cna', date: '2026-11-17', start: '11:00', end: '19:00', employeeId: 'E-10009', notes: 'Mid shift — admissions' });
  // Jordan's first shift is waiting on onboarding (open, earmarked).
  addShift({ facilityId: 'fac-cedar', departmentId: 'nursing', roleId: 'cna', date: '2026-11-16', start: '07:00', end: '15:00', employeeId: null, notes: 'Earmarked: Jordan Lee first shift (with preceptor)' });
  // Victor's CPR expired 11/05 — he is still on next week's draft (ineligible assignment warning).

  // ---- timecards from shifts before "now" ----
  const timecards: Timecard[] = [];
  let tcSeq = 1;
  let pSeq = 1;
  const mkPunch = (type: Punch['type'], ms: number, source: Punch['source'] = 'clock', by = 'Timeclock'): Punch => ({
    id: `P-${pSeq++}`,
    type,
    at: new Date(ms).toISOString(),
    source,
    recordedAt: new Date(ms).toISOString(),
    recordedBy: by,
  });

  for (const s of shifts) {
    if (!s.employeeId) continue;
    const tz = facById[s.facilityId].timeZone;
    const iv = shiftInterval(s, tz);
    if (iv.start > nowMs) continue;
    if (s.date < HISTORY_START) {
      if (iv.end <= Date.parse(zonedToUtc(HISTORY_START, '00:00', tz))) continue;
    }
    const e = empById.get(s.employeeId)!;
    const inMs = iv.start + ri(-8, 4) * 60000;
    const punches: Punch[] = [mkPunch('in', inMs)];
    const durMin = (iv.end - iv.start) / 60000;
    const onClockNow = iv.end > nowMs;
    if (durMin >= 6 * 60) {
      const bs = iv.start + Math.round(durMin * 0.5) * 60000 + ri(-30, 30) * 60000;
      if (bs < nowMs) {
        punches.push(mkPunch('break_start', bs));
        const be = bs + ri(30, 34) * 60000;
        if (be < nowMs) punches.push(mkPunch('break_end', be));
      }
    }
    if (!onClockNow) punches.push(mkPunch('out', iv.end + ri(-3, 8) * 60000));
    const approved = s.date <= '2026-11-10';
    timecards.push({
      id: `TC-${tcSeq++}`,
      employeeId: e.id,
      facilityId: s.facilityId,
      departmentId: s.departmentId,
      roleId: s.roleId,
      shiftId: s.id,
      workDate: s.date,
      punches,
      status: onClockNow ? 'open' : approved ? 'approved' : 'pending_approval',
      source: 'clock',
      approvedBy: approved ? (s.departmentId === 'nursing' && s.facilityId === 'fac-cedar' ? 'Kim Tran' : s.facilityId === 'fac-cedar' ? 'Denise Carter' : 'Paul Reed') : undefined,
      approvedAt: approved ? new Date(iv.end + 26 * 3600000).toISOString() : undefined,
    });
  }

  // Remove the history window's leftover day-before timecards that end before quarter start
  const tcByShift = new Map(timecards.map((t) => [t.shiftId, t]));

  // Scenario: James Okafor — missing clock-out on Wed 11/11 night shift.
  const jamesShift = findShift('E-10006', '2026-11-11')!;
  const jamesTc = tcByShift.get(jamesShift.id)!;
  jamesTc.punches = jamesTc.punches.filter((p) => p.type === 'in' || p.type === 'break_start' || p.type === 'break_end');
  jamesTc.status = 'open';

  // Scenario: Dana Whitfield — late clock-in 11/12 with a pending correction request.
  const danaShift = findShift('E-10026', '2026-11-12')!;
  const danaTc = tcByShift.get(danaShift.id)!;
  const danaIn = danaTc.punches.find((p) => p.type === 'in')!;
  danaIn.at = zonedToUtc('2026-11-12', '06:41', 'America/New_York');
  danaIn.recordedAt = danaIn.at;
  danaIn.source = 'kiosk';

  // Scenario: Maria — no meal break recorded on 11/02 (W201 meal deduction + break review).
  const mariaTc = tcByShift.get(findShift('E-10011', '2026-11-02')!.id)!;
  mariaTc.punches = mariaTc.punches.filter((p) => p.type === 'in' || p.type === 'out');
  // Scenario: Sofia — short break on 11/12 (pending approval, break review).
  const sofiaTc = tcByShift.get(findShift('E-10007', '2026-11-12')!.id)!;
  const sbs = sofiaTc.punches.find((p) => p.type === 'break_start')!;
  const sbe = sofiaTc.punches.find((p) => p.type === 'break_end')!;
  sbe.at = new Date(Date.parse(sbs.at) + 18 * 60000).toISOString();
  // Scenario: Andre — unscheduled extra shift Thu 11/12 evening? Use: Ray picks up unscheduled hours 11/11.
  const rayIn = zonedToUtcMs('2026-11-11', '16:00', 'America/New_York');
  timecards.push({
    id: `TC-${tcSeq++}`,
    employeeId: 'E-10029',
    facilityId: 'fac-cedar',
    departmentId: 'evs',
    roleId: 'housekeeper',
    shiftId: null,
    workDate: '2026-11-11',
    punches: [mkPunch('in', rayIn), mkPunch('out', rayIn + 4 * 3600000 + 5 * 60000)],
    status: 'pending_approval',
    source: 'clock',
  });

  // Agency imported hours (Renee Castillo) — import batch with an orientation day (PBJ W202).
  const importBatch: ImportBatch = {
    id: 'IMP-1001',
    facilityId: 'fac-cedar',
    fileName: 'brightshift_oct_wk1-2.csv',
    importedAt: '2026-10-20T15:12:00.000Z',
    importedBy: 'Sam Patel',
    rowCount: 9,
    acceptedCount: 9,
    rejectedCount: 0,
    columnMapping: { externalRef: 'Staff #', workerName: 'Name', agencyName: 'Vendor', jobCode: 'Position', workDate: 'Shift Date', timeIn: 'Start', timeOut: 'End', mealMinutes: 'Meal (min)', payCode: 'Earning Code' },
    kind: 'agency_hours',
  };
  const reneeDates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-10', '2026-10-11', '2026-10-13', '2026-10-14', '2026-10-17', '2026-10-18'];
  for (const d of reneeDates) {
    const inMs = zonedToUtcMs(d, '07:00', 'America/New_York');
    const orient = d === '2026-10-05';
    timecards.push({
      id: `TC-${tcSeq++}`,
      employeeId: renee.id,
      facilityId: 'fac-cedar',
      departmentId: 'nursing',
      roleId: 'cna',
      shiftId: null,
      workDate: d,
      punches: [
        mkPunch('in', inMs, 'import', 'Import IMP-1001'),
        mkPunch('break_start', inMs + 4 * 3600000, 'import', 'Import IMP-1001'),
        mkPunch('break_end', inMs + 4.5 * 3600000, 'import', 'Import IMP-1001'),
        mkPunch('out', inMs + 8 * 3600000, 'import', 'Import IMP-1001'),
      ],
      status: 'approved',
      source: 'import',
      importBatchId: importBatch.id,
      sourcePayCode: orient ? 'ORIENT' : 'AGY',
      approvedBy: 'Kim Tran',
      approvedAt: '2026-10-20T16:00:00.000Z',
    });
  }

  // ---- corrections ----
  const corrections: CorrectionRequest[] = [
    {
      id: 'CORR-1001',
      timecardId: danaTc.id,
      employeeId: 'E-10026',
      requestedBy: 'Dana Whitfield',
      requestedByRole: 'employee',
      requestedAt: '2026-11-12T19:40:00.000Z',
      reason: 'I arrived at 5:58 AM but the kitchen timeclock was frozen until Rosa restarted it. Rosa can confirm.',
      changes: [{ punchType: 'in', originalPunchId: danaIn.id, originalAt: danaIn.at, correctedAt: zonedToUtc('2026-11-12', '05:58', 'America/New_York') }],
      status: 'pending',
    },
    {
      id: 'CORR-0990',
      timecardId: tcByShift.get(findShift('E-10013', '2026-11-03')!.id)!.id,
      employeeId: 'E-10013',
      requestedBy: 'Jasmine Brooks',
      requestedByRole: 'employee',
      requestedAt: '2026-11-04T14:05:00.000Z',
      reason: 'Clocked back in late from break — kiosk queue. Returned after 30 minutes.',
      changes: [],
      status: 'approved',
      reviewer: 'Kim Tran',
      reviewedAt: '2026-11-04T16:20:00.000Z',
      reviewerNote: 'Confirmed with charge nurse.',
    },
  ];
  // Apply the historical approved correction so original punches are preserved and superseded.
  {
    const tc = timecards.find((t) => t.id === corrections[1].timecardId)!;
    const be = tc.punches.find((p) => p.type === 'break_end');
    if (be) {
      const bs = tc.punches.find((p) => p.type === 'break_start')!;
      const corrected = mkPunch('break_end', Date.parse(bs.at) + 30 * 60000, 'correction', 'Kim Tran');
      corrected.correctionId = 'CORR-0990';
      corrected.recordedAt = '2026-11-04T16:20:00.000Z';
      corrections[1].changes = [{ punchType: 'break_end', originalPunchId: be.id, originalAt: be.at, correctedAt: corrected.at }];
      be.supersededBy = 'CORR-0990';
      tc.punches.push(corrected);
    }
  }

  // ---- time off & nonworked ----
  const timeOff: TimeOffRequest[] = [
    { id: 'TO-2001', employeeId: 'E-10004', facilityId: 'fac-cedar', startDate: '2026-11-19', endDate: '2026-11-19', category: 'PTO', hoursPerDay: 7.5, status: 'pending', note: 'Family appointment', requestedAt: '2026-11-09T13:00:00.000Z' },
    { id: 'TO-2002', employeeId: 'E-10011', facilityId: 'fac-cedar', startDate: '2026-11-25', endDate: '2026-11-26', category: 'PTO', hoursPerDay: 7.5, status: 'pending', note: 'Thanksgiving travel', requestedAt: '2026-11-10T22:10:00.000Z' },
    { id: 'TO-1990', employeeId: 'E-10008', facilityId: 'fac-cedar', startDate: '2026-11-03', endDate: '2026-11-03', category: 'Sick', hoursPerDay: 7.5, status: 'approved', requestedAt: '2026-11-03T10:00:00.000Z', decidedBy: 'Kim Tran', decidedAt: '2026-11-03T12:00:00.000Z' },
    { id: 'TO-1991', employeeId: 'E-10107', facilityId: 'fac-willow', startDate: '2026-11-18', endDate: '2026-11-18', category: 'PTO', hoursPerDay: 7.5, status: 'approved', requestedAt: '2026-11-01T10:00:00.000Z', decidedBy: 'Karen Vance', decidedAt: '2026-11-02T12:00:00.000Z' },
  ];
  // Andre was sick 11/03: remove that worked timecard/shift, record nonworked sick pay instead.
  {
    const s = findShift('E-10008', '2026-11-03');
    if (s) {
      const idx = timecards.findIndex((t) => t.shiftId === s.id);
      if (idx >= 0) timecards.splice(idx, 1);
      shifts.splice(shifts.indexOf(s), 1);
    }
    // Kayla has approved PTO on 11/18: unassign the draft shift
    const k = findShift('E-10107', '2026-11-18');
    if (k) k.employeeId = null;
  }
  const nonWorked: NonWorkedEntry[] = [
    { id: 'NW-1', employeeId: 'E-10008', facilityId: 'fac-cedar', date: '2026-11-03', hours: 7.5, category: 'Sick', paid: true, source: 'time_off_request', sourceId: 'TO-1990' },
    { id: 'NW-2', employeeId: 'E-10001', facilityId: 'fac-cedar', date: '2026-10-12', hours: 8, category: 'Holiday', paid: true, source: 'manual' },
    { id: 'NW-3', employeeId: 'E-10106', facilityId: 'fac-willow', date: '2026-10-23', hours: 7.5, category: 'PTO', paid: true, source: 'manual' },
    { id: 'NW-4', employeeId: 'E-10107', facilityId: 'fac-willow', date: '2026-11-18', hours: 7.5, category: 'PTO', paid: true, source: 'time_off_request', sourceId: 'TO-1991' },
  ];

  // ---- schedule weeks ----
  const scheduleWeeks: ScheduleWeek[] = [];
  for (const f of FACILITIES) {
    for (let w = '2026-09-27'; w <= NEXT_WEEK; w = addDays(w, 7)) {
      const published = w <= CURRENT_WEEK;
      scheduleWeeks.push({
        id: `${f.id}:${w}`,
        facilityId: f.id,
        weekStart: w,
        status: published ? 'published' : 'draft',
        publishedAt: published ? `${addDays(w, -9)}T20:00:00.000Z` : undefined,
        publishedBy: published ? (f.id === 'fac-cedar' ? 'Kim Tran' : 'Karen Vance') : undefined,
      });
    }
  }

  // ---- coverage targets (facility-defined planning settings) ----
  const T = (facilityId: string, departmentId: DepartmentId, shiftType: ShiftType, required: number): CoverageTarget => ({
    id: `CT-${facilityId}-${departmentId}-${shiftType}`,
    facilityId,
    departmentId,
    shiftType,
    required,
  });
  const coverageTargets: CoverageTarget[] = [
    T('fac-cedar', 'nursing', 'day', 7),
    T('fac-cedar', 'nursing', 'evening', 4),
    T('fac-cedar', 'nursing', 'night', 3),
    T('fac-cedar', 'nursing', 'overnight', 1),
    T('fac-cedar', 'dietary', 'day', 3),
    T('fac-cedar', 'dietary', 'evening', 1),
    T('fac-cedar', 'evs', 'day', 2),
    T('fac-cedar', 'laundry', 'day', 1),
    T('fac-cedar', 'activities', 'day', 1),
    T('fac-cedar', 'therapy', 'day', 1),
    T('fac-willow', 'nursing', 'day', 4),
    T('fac-willow', 'nursing', 'evening', 2),
    T('fac-willow', 'nursing', 'night', 2),
    T('fac-willow', 'dietary', 'day', 1),
    T('fac-willow', 'evs', 'day', 1),
  ];

  // ---- workflows ----
  let taskSeq = 1;
  const tid = () => `T-${taskSeq++}`;
  const jordanWf: LifecycleWorkflow = {
    id: 'WF-3001',
    employeeId: jordan.id,
    kind: 'onboarding',
    status: 'in_progress',
    startedAt: '2026-11-02T15:00:00.000Z',
    startedBy: 'Lauren Pierce',
    effectiveDate: '2026-11-16',
    tasks: buildTasks(ONBOARDING_TEMPLATE, jordan, '2026-11-16', tid),
  };
  const doneKeys = ['offer', 'i9', 'background', 'exclusion', 'payroll'];
  for (const t of jordanWf.tasks) {
    if (doneKeys.includes(t.key)) Object.assign(t, { status: 'done', completedBy: 'Lauren Pierce', completedAt: '2026-11-09T18:00:00.000Z' });
    if (t.key === 'license') Object.assign(t, { status: 'in_progress', note: 'Registry lookup pending (placeholder).' });
    if (t.key === 'tb') Object.assign(t, { status: 'blocked', note: 'Clinic result not yet received.' });
  }
  const aishaWf: LifecycleWorkflow = {
    id: 'WF-3002',
    employeeId: aisha.id,
    kind: 'onboarding',
    status: 'in_progress',
    startedAt: '2026-11-11T16:00:00.000Z',
    startedBy: 'Lauren Pierce',
    effectiveDate: '2026-11-18',
    tasks: buildTasks(ONBOARDING_TEMPLATE, aisha, '2026-11-18', tid),
  };
  aishaWf.tasks.find((t) => t.key === 'offer')!.status = 'done';
  const gloriaWf: LifecycleWorkflow = {
    id: 'WF-3003',
    employeeId: gloria.id,
    kind: 'offboarding',
    status: 'in_progress',
    startedAt: '2026-11-06T14:00:00.000Z',
    startedBy: 'Lauren Pierce',
    effectiveDate: '2026-11-20',
    reason: 'Retirement',
    rehireEligible: true,
    tasks: buildTasks(OFFBOARDING_TEMPLATE, gloria, '2026-11-20', tid),
  };
  gloriaWf.tasks.find((t) => t.key === 'notice')!.status = 'done';
  const completedWf: LifecycleWorkflow = {
    id: 'WF-2950',
    employeeId: 'E-10015',
    kind: 'onboarding',
    status: 'completed',
    startedAt: '2024-05-06T14:00:00.000Z',
    startedBy: 'Lauren Pierce',
    effectiveDate: '2024-05-20',
    tasks: buildTasks(ONBOARDING_TEMPLATE, empById.get('E-10015')!, '2024-05-20', tid).map((t) => ({ ...t, status: 'done' as const, completedBy: 'Lauren Pierce', completedAt: '2024-05-19T14:00:00.000Z' })),
    completedAt: '2024-05-20T12:00:00.000Z',
  };

  // ---- PBJ mappings ----
  const M = (sourceJobCode: string, code: number | null, reportability: PbjJobMapping['reportability'], effectiveFrom = '2024-01-01', effectiveTo: string | null = null, note?: string): PbjJobMapping => ({
    id: `MAP-${sourceJobCode}-${effectiveFrom}`,
    facilityId: null,
    sourceJobCode,
    pbjJobTitleCode: code,
    reportability,
    effectiveFrom,
    effectiveTo,
    note,
    updatedBy: 'Sam Patel',
    updatedAt: '2026-07-01T14:00:00.000Z',
  });
  const mappings: PbjJobMapping[] = [
    M('RN-DON', 5, 'required'),
    M('RN-ADM', 6, 'required'),
    M('RN-MDS', 7, 'required', '2024-01-01', '2026-06-30'),
    M('RN-MDS', 6, 'required', '2026-07-01', null, 'Reclassified: MDS coordinators perform RAI functions without direct care (RN with administrative duties).'),
    M('RN', 7, 'required'),
    M('LPN', 9, 'required'),
    M('CNA', 10, 'required'),
    M('CMT', 12, 'required'),
    M('UC', null, 'not_reported', '2024-01-01', null, 'Clerical role; not a PBJ job category.'),
    M('ADMIN', 1, 'required'),
    M('BOM', null, 'not_reported'),
    M('HRC', null, 'not_reported'),
    M('RECEP', null, 'not_reported'),
    M('RD', 16, 'required'),
    M('DM', null, 'not_reported', '2024-01-01', null, 'Dietary manager is not a CMS job title; review if role includes dietitian duties.'),
    M('COOK', null, 'not_reported'),
    M('DA', null, 'not_reported', '2024-01-01', null, 'Dietary aides are reported as Paid Feeding Assistant (17) only when qualified and feeding residents.'),
    M('HSK', 39, 'optional'),
    M('HSK-SUP', 39, 'optional'),
    M('LND', 39, 'optional'),
    M('MNT-DIR', 39, 'optional'),
    M('MNT', 39, 'optional'),
    M('ACT-DIR', 28, 'required'),
    M('ACT', 29, 'required'),
    M('SSD', 30, 'required'),
    M('SSA', 31, 'required'),
    M('PT', 21, 'required'),
    M('PTA', 22, 'required'),
    M('OT', 18, 'required'),
    M('COTA', 19, 'required'),
    M('SLP', 26, 'required'),
    // RNA (Restorative Aide) intentionally unmapped — demo blocking error.
  ];

  // ---- PBJ preparations ----
  const preparations: PbjPreparation[] = [
    {
      id: 'PBJ-CEDAR-FY2027-Q1-v1',
      facilityId: 'fac-cedar',
      quarterId: 'FY2027-Q1',
      version: 1,
      status: 'in_preparation',
      createdAt: '2026-10-05T14:00:00.000Z',
      createdBy: 'Sam Patel',
      validationRuns: [
        {
          id: 'RUN-1',
          runAt: '2026-11-02T15:30:00.000Z',
          runBy: 'Sam Patel',
          rulesetVersion: 'poise-demo-pbj-rules 0.3 (2026-11)',
          sourceFingerprint: 'OUTDATED00000000',
          errorCount: 3,
          warningCount: 2,
          indicatorCount: 2,
          totalEligibleHours: 0,
        },
      ],
      resolutions: [],
      exports: [],
      submissions: [],
      notes: 'Monthly mid-quarter review. Final package after quarter close (deadline Feb 14, 2027).',
    },
    {
      id: 'PBJ-WILLOW-FY2027-Q1-v1',
      facilityId: 'fac-willow',
      quarterId: 'FY2027-Q1',
      version: 1,
      status: 'in_preparation',
      createdAt: '2026-10-05T14:00:00.000Z',
      createdBy: 'Sam Patel',
      validationRuns: [],
      resolutions: [],
      exports: [],
      submissions: [],
    },
    {
      id: 'PBJ-CEDAR-FY2026-Q4-v2',
      facilityId: 'fac-cedar',
      quarterId: 'FY2026-Q4',
      version: 2,
      status: 'submission_recorded',
      createdAt: '2026-10-08T14:00:00.000Z',
      createdBy: 'Sam Patel',
      validationRuns: [
        { id: 'RUN-Q4-3', runAt: '2026-11-03T16:00:00.000Z', runBy: 'Sam Patel', rulesetVersion: 'poise-demo-pbj-rules 0.2 (2026-10)', sourceFingerprint: 'Q4ARCHIVED000001', errorCount: 0, warningCount: 0, indicatorCount: 3, totalEligibleHours: 28311.4 },
      ],
      resolutions: [],
      approval: { by: 'Denise Carter', at: '2026-11-04T13:00:00.000Z', sourceFingerprint: 'Q4ARCHIVED000001' },
      exports: [
        { id: 'EXP-Q4-1', generatedAt: '2026-11-04T14:00:00.000Z', generatedBy: 'Sam Patel', fileName: 'poise-demo-pbj_cedar-ridge_FY2026-Q4_NOT-FOR-SUBMISSION.xml', format: 'demo-xml', sourceFingerprint: 'Q4ARCHIVED000001', workerCount: 41, dayRowCount: 3290, totalHours: 28311.4 },
      ],
      submissions: [
        {
          id: 'SUB-Q4-1',
          recordedAt: '2026-11-05T15:00:00.000Z',
          recordedBy: 'Sam Patel',
          method: 'manual_iqies_upload',
          exportSnapshotId: 'EXP-Q4-1',
          submissionReference: '',
          finalValidationStatus: 'not_recorded',
          notes: 'Demo record. Upload performed outside Poise; Final File Validation Report not yet reviewed.',
        },
      ],
    },
  ];

  // ---- audit ----
  const audit: AuditEvent[] = [
    { id: 'AU-1', at: '2026-10-30T20:00:00.000Z', actor: 'Kim Tran', actorRole: 'scheduler', facilityId: 'fac-cedar', entityType: 'schedule', entityId: 'fac-cedar:2026-11-08', action: 'Published schedule', detail: 'Week of Nov 8 published (demo — no notifications sent).' },
    { id: 'AU-2', at: '2026-10-20T15:12:00.000Z', actor: 'Sam Patel', actorRole: 'pbj_reviewer', facilityId: 'fac-cedar', entityType: 'pbj', entityId: 'IMP-1001', action: 'Imported agency hours', detail: '9 rows imported from brightshift_oct_wk1-2.csv.' },
    { id: 'AU-3', at: '2026-11-04T16:20:00.000Z', actor: 'Kim Tran', actorRole: 'scheduler', facilityId: 'fac-cedar', entityType: 'correction', entityId: 'CORR-0990', action: 'Approved correction', detail: 'Break end corrected for Jasmine Brooks (11/03).' },
    { id: 'AU-4', at: '2026-11-06T14:00:00.000Z', actor: 'Lauren Pierce', actorRole: 'hr_manager', facilityId: 'fac-cedar', entityType: 'lifecycle', entityId: 'WF-3003', action: 'Started offboarding', detail: 'Gloria Benson — separation effective Nov 20, 2026 (Retirement).' },
    { id: 'AU-5', at: '2026-11-02T15:00:00.000Z', actor: 'Lauren Pierce', actorRole: 'hr_manager', facilityId: 'fac-cedar', entityType: 'lifecycle', entityId: 'WF-3001', action: 'Started onboarding', detail: 'Jordan Lee — CNA, first shift planned Nov 16.' },
    { id: 'AU-6', at: '2026-11-12T19:40:00.000Z', actor: 'Dana Whitfield', actorRole: 'employee', facilityId: 'fac-cedar', entityType: 'correction', entityId: 'CORR-1001', action: 'Requested correction', detail: 'Clock-in 6:41 AM → 5:58 AM on Nov 12.' },
    { id: 'AU-7', at: '2026-07-01T14:00:00.000Z', actor: 'Sam Patel', actorRole: 'pbj_reviewer', facilityId: null, entityType: 'pbj_mapping', entityId: 'MAP-RN-MDS-2026-07-01', action: 'Updated PBJ mapping', detail: 'RN-MDS → 6 (RN with administrative duties) effective Jul 1, 2026.' },
  ];

  // De-dup any time-off overlap: Priya's 11/19 shift remains assigned (pending PTO shows warning). Keep.
  void SHIFT_TYPES;

  return {
    seedVersion: SEED_VERSION,
    facilities: FACILITIES.map((f) => ({ ...f })),
    employees,
    workflows: [jordanWf, aishaWf, gloriaWf, completedWf],
    shifts,
    scheduleWeeks,
    coverageTargets,
    timeOff,
    timecards,
    nonWorked,
    corrections,
    audit,
    mappings,
    preparations,
    importBatches: [importBatch],
    demoNowIso: DEMO_NOW_ISO,
  };
}
