/**
 * Poise shared data model (prototype).
 *
 * All records are fictional demo data. The shapes are intentionally close to what a
 * production API would return so the persistence layer can later be swapped for real
 * services without rewriting UI components.
 */

export type ISODate = string; // yyyy-mm-dd (facility-local calendar date)
export type ISOInstant = string; // UTC instant, e.g. 2026-11-13T19:45:00.000Z
export type LocalTime = string; // HH:mm (facility-local wall clock)

export type RoleKey =
  | 'corporate_admin'
  | 'facility_admin'
  | 'hr_manager'
  | 'scheduler'
  | 'pbj_reviewer'
  | 'employee';

export interface Facility {
  id: string;
  name: string;
  shortName: string;
  city: string;
  state: string; // 2-letter
  timeZone: string; // IANA
  /** Facility identifier used for PBJ preparation. Kept editable so missing/invalid values can be demonstrated. */
  pbjFacilityId: string;
  /** Planning census estimate. CMS derives census from MDS; this value is for internal monitoring only. */
  censusEstimate: number;
  licensedBeds: number;
  pbjReporting: boolean;
  /** Whether optional PBJ categories (e.g. housekeeping, code 39) are included in the demo export. */
  includeOptionalPbjCategories: boolean;
}

export type DepartmentId =
  | 'nursing'
  | 'administration'
  | 'dietary'
  | 'evs'
  | 'laundry'
  | 'maintenance'
  | 'activities'
  | 'social_services'
  | 'therapy';

export interface Department {
  id: DepartmentId;
  name: string;
  shortName: string;
  color: string; // tailwind-safe hex used for small dots/chips
}

export type CredentialType =
  | 'RN License'
  | 'LPN License'
  | 'CNA Certification'
  | 'Medication Aide Certification'
  | 'CPR/BLS'
  | 'TB Screening'
  | 'Food Handler Permit'
  | 'Therapy License'
  | 'Social Work License'
  | 'Administrator License';

export interface JobRole {
  id: string;
  name: string;
  departmentId: DepartmentId;
  /** Source job code as it appears in payroll / timekeeping. */
  sourceJobCode: string;
  flsa: 'exempt' | 'nonexempt';
  requiredCredentials: CredentialType[];
  /** Roles that can be scheduled on the department grid. */
  schedulable: boolean;
}

export type EmployeeStatus = 'onboarding' | 'active' | 'leave' | 'offboarding' | 'archived';
export type WorkerType = 'employee' | 'agency' | 'contract';
export type PayType = 'exempt' | 'nonexempt' | 'contract';
export type Availability = 'available' | 'preferred' | 'unavailable';

export interface Credential {
  id: string;
  type: CredentialType;
  number?: string;
  issuedOn?: ISODate;
  expiresOn?: ISODate;
  verification: 'verified' | 'pending' | 'not_started';
  /** Prototype-only note: no primary-source verification is performed. */
  note?: string;
}

export interface Employee {
  /** Stable internal identifier. Never reused and never contains PII. */
  id: string;
  /** Stable worker identifier used for PBJ preparation (no PII). */
  pbjEmployeeId: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  email: string;
  phone: string;
  status: EmployeeStatus;
  workerType: WorkerType;
  agencyName?: string;
  payType: PayType | null;
  employmentType: 'full_time' | 'part_time' | 'prn';
  primaryFacilityId: string;
  additionalFacilityIds: string[];
  departmentId: DepartmentId;
  roleId: string;
  managerId: string | null;
  hireDate: ISODate;
  firstShiftDate?: ISODate;
  separationDate?: ISODate;
  archivedAt?: ISOInstant;
  /** Sunday = 0 ... Saturday = 6 */
  availability: Availability[];
  credentials: Credential[];
  createdAt: ISOInstant;
  /** External reference (e.g. agency worker number) used to match imported records. */
  externalRef?: string;
  createdBySource?: 'manual' | 'seed' | 'import';
}

export type TaskStatus = 'not_started' | 'in_progress' | 'done' | 'blocked' | 'waived';

export interface LifecycleTask {
  id: string;
  key: string;
  title: string;
  category: 'documents' | 'credentials' | 'access' | 'training' | 'payroll' | 'equipment' | 'scheduling' | 'compliance';
  ownerRole: RoleKey;
  ownerName: string;
  dueDate: ISODate;
  status: TaskStatus;
  dependsOn: string[]; // task keys
  blocksFirstShift: boolean;
  /** Clarifies that marking the task in the prototype does not perform any external action. */
  placeholderNote?: string;
  completedBy?: string;
  completedAt?: ISOInstant;
  note?: string;
}

export interface LifecycleWorkflow {
  id: string;
  employeeId: string;
  kind: 'onboarding' | 'offboarding';
  status: 'in_progress' | 'completed' | 'cancelled';
  startedAt: ISOInstant;
  startedBy: string;
  /** For offboarding: effective separation date. For onboarding: planned first shift. */
  effectiveDate: ISODate;
  reason?: string;
  rehireEligible?: boolean;
  tasks: LifecycleTask[];
  completedAt?: ISOInstant;
}

export type ShiftType = 'day' | 'evening' | 'night' | 'overnight';

export interface Shift {
  id: string;
  facilityId: string;
  departmentId: DepartmentId;
  roleId: string;
  /** Facility-local date on which the shift starts. */
  date: ISODate;
  start: LocalTime;
  end: LocalTime; // if end <= start the shift ends the next calendar day
  shiftType: ShiftType;
  unpaidBreakMinutes: number;
  employeeId: string | null;
  notes?: string;
  /** Set when a published week's shift changes so reviewers can see what moved. */
  changedAfterPublish?: boolean;
}

export interface ScheduleWeek {
  id: string; // `${facilityId}:${weekStart}`
  facilityId: string;
  weekStart: ISODate; // Sunday
  status: 'draft' | 'published';
  publishedAt?: ISOInstant;
  publishedBy?: string;
}

export interface CoverageTarget {
  id: string;
  facilityId: string;
  departmentId: DepartmentId;
  shiftType: ShiftType;
  /** Facility-defined planning headcount per day. Not a regulatory determination. */
  required: number;
}

export interface TimeOffRequest {
  id: string;
  employeeId: string;
  facilityId: string;
  startDate: ISODate;
  endDate: ISODate;
  category: NonWorkedCategory;
  hoursPerDay: number;
  status: 'pending' | 'approved' | 'denied';
  note?: string;
  requestedAt: ISOInstant;
  decidedBy?: string;
  decidedAt?: ISOInstant;
}

export type PunchType = 'in' | 'out' | 'break_start' | 'break_end';

export interface Punch {
  id: string;
  type: PunchType;
  at: ISOInstant;
  source: 'clock' | 'kiosk' | 'import' | 'correction' | 'manager_entry';
  recordedAt: ISOInstant;
  recordedBy: string;
  /** Original punches are never deleted. A correction supersedes them. */
  supersededBy?: string; // correction id
  correctionId?: string;
}

export type TimecardStatus = 'open' | 'pending_approval' | 'approved';

export interface Timecard {
  id: string;
  employeeId: string;
  facilityId: string;
  departmentId: DepartmentId;
  roleId: string;
  shiftId: string | null;
  /** Facility-local date on which work began. */
  workDate: ISODate;
  punches: Punch[];
  status: TimecardStatus;
  source: 'clock' | 'import' | 'manual';
  importBatchId?: string;
  /** Source pay code from imports (e.g. REG, OT, ORIENT). Worked vs. nonworked is decided by pay-code rules. */
  sourcePayCode?: string;
  approvedBy?: string;
  approvedAt?: ISOInstant;
  reviewNotes?: string[];
  breakReviewed?: boolean;
}

export type NonWorkedCategory = 'PTO' | 'Sick' | 'Holiday' | 'Bereavement' | 'Unpaid' | 'Training';

/** Paid/unpaid leave and other nonworked time. Kept separate from worked time on purpose. */
export interface NonWorkedEntry {
  id: string;
  employeeId: string;
  facilityId: string;
  date: ISODate;
  hours: number;
  category: NonWorkedCategory;
  paid: boolean;
  source: 'time_off_request' | 'manual' | 'import';
  sourceId?: string;
}

export interface CorrectionChange {
  punchType: PunchType;
  originalPunchId: string | null;
  originalAt: ISOInstant | null;
  correctedAt: ISOInstant;
}

export interface CorrectionRequest {
  id: string;
  timecardId: string;
  employeeId: string;
  requestedBy: string;
  requestedByRole: RoleKey;
  requestedAt: ISOInstant;
  reason: string;
  changes: CorrectionChange[];
  status: 'pending' | 'approved' | 'rejected';
  reviewer?: string;
  reviewedAt?: ISOInstant;
  reviewerNote?: string;
}

export interface AuditEvent {
  id: string;
  at: ISOInstant;
  actor: string;
  actorRole: RoleKey;
  facilityId: string | null;
  entityType:
    | 'employee'
    | 'lifecycle'
    | 'shift'
    | 'schedule'
    | 'timecard'
    | 'punch'
    | 'correction'
    | 'time_off'
    | 'pbj'
    | 'pbj_mapping'
    | 'facility'
    | 'system';
  entityId: string;
  action: string;
  detail: string;
  before?: string;
  after?: string;
}

/* ----------------------------------------------------------------------------------- */
/* PBJ                                                                                  */
/* ----------------------------------------------------------------------------------- */

export type PbjReportability = 'required' | 'optional' | 'not_reported';

/** Effective-dated mapping from a source job code to a CMS PBJ job title code. */
export interface PbjJobMapping {
  id: string;
  /** null = applies to all facilities unless a facility-specific mapping exists. */
  facilityId: string | null;
  sourceJobCode: string;
  pbjJobTitleCode: number | null;
  reportability: PbjReportability;
  effectiveFrom: ISODate;
  effectiveTo: ISODate | null;
  note?: string;
  updatedBy: string;
  updatedAt: ISOInstant;
}

export type PbjIssueSeverity = 'error' | 'warning' | 'indicator';

export interface PbjIssueResolution {
  issueKey: string;
  decision: 'acknowledged' | 'exclude_hours' | 'include_hours';
  note: string;
  by: string;
  at: ISOInstant;
}

export interface PbjValidationRun {
  id: string;
  runAt: ISOInstant;
  runBy: string;
  rulesetVersion: string;
  sourceFingerprint: string;
  errorCount: number;
  warningCount: number;
  indicatorCount: number;
  totalEligibleHours: number;
}

export interface PbjExportSnapshot {
  id: string;
  generatedAt: ISOInstant;
  generatedBy: string;
  fileName: string;
  format: 'demo-xml';
  sourceFingerprint: string;
  workerCount: number;
  dayRowCount: number;
  totalHours: number;
}

export interface PbjSubmissionRecord {
  id: string;
  recordedAt: ISOInstant;
  recordedBy: string;
  method: 'manual_iqies_upload';
  exportSnapshotId: string;
  /** Free text typed by the user from iQIES. Poise does not fabricate identifiers or results. */
  submissionReference?: string;
  finalValidationStatus: 'not_recorded' | 'user_reported_accepted' | 'user_reported_errors';
  notes?: string;
}

export interface PbjPreparation {
  id: string;
  facilityId: string;
  quarterId: string; // e.g. FY2027-Q1
  version: number;
  status: 'in_preparation' | 'approved' | 'exported' | 'submission_recorded' | 'superseded';
  createdAt: ISOInstant;
  createdBy: string;
  validationRuns: PbjValidationRun[];
  resolutions: PbjIssueResolution[];
  approval?: { by: string; at: ISOInstant; sourceFingerprint: string; note?: string };
  exports: PbjExportSnapshot[];
  submissions: PbjSubmissionRecord[];
  notes?: string;
}

export interface ImportBatch {
  id: string;
  facilityId: string;
  fileName: string;
  importedAt: ISOInstant;
  importedBy: string;
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  columnMapping: Record<string, string>;
  kind: 'agency_hours';
}

export interface DemoUser {
  role: RoleKey;
  name: string;
  title: string;
  /** For facility-scoped roles. null = all facilities. */
  facilityIds: string[] | null;
  departmentIds: DepartmentId[] | null;
  /** For the employee role. */
  employeeId?: string;
}

export interface Toast {
  id: string;
  tone: 'success' | 'info' | 'warning' | 'error';
  title: string;
  body?: string;
}
