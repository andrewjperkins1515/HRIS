import type { CredentialType, Department, DepartmentId, JobRole, ShiftType } from './types';

export const DEPARTMENTS: Department[] = [
  { id: 'nursing', name: 'Nursing', shortName: 'Nursing', color: '#007C85' },
  { id: 'administration', name: 'Administration', shortName: 'Admin', color: '#20363D' },
  { id: 'dietary', name: 'Dietary', shortName: 'Dietary', color: '#B7791F' },
  { id: 'evs', name: 'Environmental Services', shortName: 'EVS', color: '#5A67D8' },
  { id: 'laundry', name: 'Laundry', shortName: 'Laundry', color: '#805AD5' },
  { id: 'maintenance', name: 'Maintenance', shortName: 'Maint.', color: '#718096' },
  { id: 'activities', name: 'Activities', shortName: 'Activities', color: '#D53F8C' },
  { id: 'social_services', name: 'Social Services', shortName: 'Social Svcs', color: '#2B6CB0' },
  { id: 'therapy', name: 'Therapy', shortName: 'Therapy', color: '#2F855A' },
];

export const DEPT_BY_ID = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d])) as Record<DepartmentId, Department>;

const BASE: CredentialType[] = ['TB Screening'];

export const ROLES: JobRole[] = [
  // Nursing
  { id: 'don', name: 'Director of Nursing', departmentId: 'nursing', sourceJobCode: 'RN-DON', flsa: 'exempt', requiredCredentials: ['RN License', 'CPR/BLS', ...BASE], schedulable: true },
  { id: 'adon', name: 'Asst. Director of Nursing', departmentId: 'nursing', sourceJobCode: 'RN-ADM', flsa: 'exempt', requiredCredentials: ['RN License', 'CPR/BLS', ...BASE], schedulable: true },
  { id: 'mds', name: 'MDS Coordinator (RN)', departmentId: 'nursing', sourceJobCode: 'RN-MDS', flsa: 'exempt', requiredCredentials: ['RN License', ...BASE], schedulable: true },
  { id: 'rn', name: 'Registered Nurse', departmentId: 'nursing', sourceJobCode: 'RN', flsa: 'nonexempt', requiredCredentials: ['RN License', 'CPR/BLS', ...BASE], schedulable: true },
  { id: 'lpn', name: 'Licensed Practical Nurse', departmentId: 'nursing', sourceJobCode: 'LPN', flsa: 'nonexempt', requiredCredentials: ['LPN License', 'CPR/BLS', ...BASE], schedulable: true },
  { id: 'cna', name: 'Certified Nursing Assistant', departmentId: 'nursing', sourceJobCode: 'CNA', flsa: 'nonexempt', requiredCredentials: ['CNA Certification', 'CPR/BLS', ...BASE], schedulable: true },
  { id: 'rna', name: 'Restorative Aide', departmentId: 'nursing', sourceJobCode: 'RNA', flsa: 'nonexempt', requiredCredentials: ['CNA Certification', ...BASE], schedulable: true },
  { id: 'cmt', name: 'Medication Aide', departmentId: 'nursing', sourceJobCode: 'CMT', flsa: 'nonexempt', requiredCredentials: ['Medication Aide Certification', ...BASE], schedulable: true },
  { id: 'unit_clerk', name: 'Unit Clerk', departmentId: 'nursing', sourceJobCode: 'UC', flsa: 'nonexempt', requiredCredentials: [...BASE], schedulable: true },
  // Administration
  { id: 'administrator', name: 'Administrator', departmentId: 'administration', sourceJobCode: 'ADMIN', flsa: 'exempt', requiredCredentials: ['Administrator License'], schedulable: false },
  { id: 'bom', name: 'Business Office Manager', departmentId: 'administration', sourceJobCode: 'BOM', flsa: 'exempt', requiredCredentials: [], schedulable: false },
  { id: 'hr_coord', name: 'HR Coordinator', departmentId: 'administration', sourceJobCode: 'HRC', flsa: 'nonexempt', requiredCredentials: [], schedulable: false },
  { id: 'receptionist', name: 'Receptionist', departmentId: 'administration', sourceJobCode: 'RECEP', flsa: 'nonexempt', requiredCredentials: [], schedulable: true },
  // Dietary
  { id: 'dietitian', name: 'Registered Dietitian', departmentId: 'dietary', sourceJobCode: 'RD', flsa: 'exempt', requiredCredentials: [], schedulable: false },
  { id: 'dietary_mgr', name: 'Dietary Manager', departmentId: 'dietary', sourceJobCode: 'DM', flsa: 'exempt', requiredCredentials: ['Food Handler Permit'], schedulable: true },
  { id: 'cook', name: 'Cook', departmentId: 'dietary', sourceJobCode: 'COOK', flsa: 'nonexempt', requiredCredentials: ['Food Handler Permit', ...BASE], schedulable: true },
  { id: 'dietary_aide', name: 'Dietary Aide', departmentId: 'dietary', sourceJobCode: 'DA', flsa: 'nonexempt', requiredCredentials: ['Food Handler Permit', ...BASE], schedulable: true },
  // EVS / Laundry / Maintenance
  { id: 'housekeeper', name: 'Housekeeper', departmentId: 'evs', sourceJobCode: 'HSK', flsa: 'nonexempt', requiredCredentials: [...BASE], schedulable: true },
  { id: 'evs_sup', name: 'EVS Supervisor', departmentId: 'evs', sourceJobCode: 'HSK-SUP', flsa: 'nonexempt', requiredCredentials: [...BASE], schedulable: true },
  { id: 'laundry_aide', name: 'Laundry Aide', departmentId: 'laundry', sourceJobCode: 'LND', flsa: 'nonexempt', requiredCredentials: [...BASE], schedulable: true },
  { id: 'maint_dir', name: 'Maintenance Director', departmentId: 'maintenance', sourceJobCode: 'MNT-DIR', flsa: 'exempt', requiredCredentials: [], schedulable: true },
  { id: 'maint_tech', name: 'Maintenance Technician', departmentId: 'maintenance', sourceJobCode: 'MNT', flsa: 'nonexempt', requiredCredentials: [], schedulable: true },
  // Activities
  { id: 'act_dir', name: 'Activities Director', departmentId: 'activities', sourceJobCode: 'ACT-DIR', flsa: 'exempt', requiredCredentials: [], schedulable: true },
  { id: 'act_asst', name: 'Activities Assistant', departmentId: 'activities', sourceJobCode: 'ACT', flsa: 'nonexempt', requiredCredentials: [...BASE], schedulable: true },
  // Social Services
  { id: 'ss_dir', name: 'Social Services Director', departmentId: 'social_services', sourceJobCode: 'SSD', flsa: 'exempt', requiredCredentials: ['Social Work License'], schedulable: true },
  { id: 'ss_asst', name: 'Social Services Assistant', departmentId: 'social_services', sourceJobCode: 'SSA', flsa: 'nonexempt', requiredCredentials: [], schedulable: true },
  // Therapy
  { id: 'pt', name: 'Physical Therapist', departmentId: 'therapy', sourceJobCode: 'PT', flsa: 'exempt', requiredCredentials: ['Therapy License'], schedulable: true },
  { id: 'pta', name: 'Physical Therapist Assistant', departmentId: 'therapy', sourceJobCode: 'PTA', flsa: 'nonexempt', requiredCredentials: ['Therapy License'], schedulable: true },
  { id: 'ot', name: 'Occupational Therapist', departmentId: 'therapy', sourceJobCode: 'OT', flsa: 'exempt', requiredCredentials: ['Therapy License'], schedulable: true },
  { id: 'cota', name: 'Certified OT Assistant', departmentId: 'therapy', sourceJobCode: 'COTA', flsa: 'nonexempt', requiredCredentials: ['Therapy License'], schedulable: true },
  { id: 'slp', name: 'Speech-Language Pathologist', departmentId: 'therapy', sourceJobCode: 'SLP', flsa: 'exempt', requiredCredentials: ['Therapy License'], schedulable: true },
];

export const ROLE_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r])) as Record<string, JobRole>;

export const SHIFT_TYPES: { id: ShiftType; label: string; start: string; end: string }[] = [
  { id: 'day', label: 'Day', start: '07:00', end: '15:00' },
  { id: 'evening', label: 'Evening', start: '15:00', end: '23:00' },
  { id: 'night', label: 'Night', start: '23:00', end: '07:00' },
  { id: 'overnight', label: 'Overnight (12h)', start: '19:00', end: '07:00' },
];

export const SHIFT_TYPE_LABEL: Record<ShiftType, string> = {
  day: 'Day',
  evening: 'Evening',
  night: 'Night',
  overnight: 'Overnight',
};

export function inferShiftType(start: string, end: string): ShiftType {
  const h = Number(start.slice(0, 2));
  const crosses = end <= start;
  if (crosses && h >= 18 && h < 22) return 'overnight';
  if (h >= 21 || h < 4) return 'night';
  if (h >= 13) return 'evening';
  return 'day';
}

export const CREDENTIAL_TYPES: CredentialType[] = [
  'RN License',
  'LPN License',
  'CNA Certification',
  'Medication Aide Certification',
  'CPR/BLS',
  'TB Screening',
  'Food Handler Permit',
  'Therapy License',
  'Social Work License',
  'Administrator License',
];

/* ------------------------------------------------------------------------------------- */
/* CMS PBJ job title codes                                                                */
/* Source: CMS Electronic Staffing Data Submission PBJ Long-Term Care Facility Policy     */
/* Manual, Version 2.8 (August 2026), Table 1 "Labor and Job Codes and Descriptions".     */
/* Kept as versioned reference data; verify against the current CMS manual before use.   */
/* ------------------------------------------------------------------------------------- */

export interface PbjJobTitle {
  code: number;
  title: string;
  laborCategoryCode: number;
  laborCategory: string;
  optional: boolean;
  nursing: boolean;
}

const T = (code: number, title: string, lc: number, cat: string, optional = false, nursing = false): PbjJobTitle => ({
  code,
  title,
  laborCategoryCode: lc,
  laborCategory: cat,
  optional,
  nursing,
});

export const PBJ_REFERENCE = {
  source: 'CMS PBJ Long-Term Care Facility Policy Manual',
  version: 'Version 2.8',
  published: 'August 2026',
  url: 'https://www.cms.gov/files/document/pbj-policy-manual-v2-8-august-2026.pdf',
};

export const PBJ_JOB_TITLES: PbjJobTitle[] = [
  T(1, 'Administrator', 1, 'Administration Services'),
  T(2, 'Medical Director', 2, 'Physician Services'),
  T(3, 'Other Physician', 2, 'Physician Services'),
  T(4, 'Physician Assistant', 2, 'Physician Services'),
  T(5, 'Registered Nurse Director of Nursing', 3, 'Nursing Services', false, true),
  T(6, 'Registered Nurse with Administrative Duties', 3, 'Nursing Services', false, true),
  T(7, 'Registered Nurse', 3, 'Nursing Services', false, true),
  T(8, 'Licensed Practical/Vocational Nurse with Administrative Duties', 3, 'Nursing Services', false, true),
  T(9, 'Licensed Practical/Vocational Nurse', 3, 'Nursing Services', false, true),
  T(10, 'Certified Nurse Aide', 3, 'Nursing Services', false, true),
  T(11, 'Nurse Aide in Training', 3, 'Nursing Services', false, true),
  T(12, 'Medication Aide/Technician', 3, 'Nursing Services', false, true),
  T(13, 'Nurse Practitioner', 2, 'Physician Services'),
  T(14, 'Clinical Nurse Specialist', 3, 'Nursing Services', false, true),
  T(15, 'Pharmacist', 4, 'Pharmacy Services'),
  T(16, 'Dietitian', 5, 'Dietary Services'),
  T(17, 'Paid Feeding Assistant', 5, 'Dietary Services'),
  T(18, 'Occupational Therapist', 6, 'Therapeutic Services'),
  T(19, 'Occupational Therapy Assistant', 6, 'Therapeutic Services'),
  T(20, 'Occupational Therapy Aide', 6, 'Therapeutic Services'),
  T(21, 'Physical Therapist', 6, 'Therapeutic Services'),
  T(22, 'Physical Therapy Assistant', 6, 'Therapeutic Services'),
  T(23, 'Physical Therapy Aide', 6, 'Therapeutic Services'),
  T(24, 'Respiratory Therapist', 6, 'Therapeutic Services'),
  T(25, 'Respiratory Therapy Technician', 6, 'Therapeutic Services'),
  T(26, 'Speech/Language Pathologist', 6, 'Therapeutic Services'),
  T(27, 'Therapeutic Recreation Specialist', 6, 'Therapeutic Services'),
  T(28, 'Qualified Activities Professional', 6, 'Therapeutic Services'),
  T(29, 'Other Activities Staff', 6, 'Therapeutic Services'),
  T(30, 'Qualified Social Worker', 6, 'Therapeutic Services'),
  T(31, 'Other Social Worker', 6, 'Therapeutic Services'),
  T(32, 'Dentist', 7, 'Dental Services', true),
  T(33, 'Podiatrist', 8, 'Podiatry Services', true),
  T(34, 'Mental Health Service Worker', 9, 'Mental Health Services'),
  T(35, 'Vocational Service Worker', 10, 'Vocational Services', true),
  T(36, 'Clinical Laboratory Service Worker', 11, 'Clinical Laboratory Services', true),
  T(37, 'Diagnostic X-ray Service Worker', 12, 'Diagnostic X-ray Services', true),
  T(38, 'Blood Service Worker', 13, 'Administration & Storage of Blood Services', true),
  T(39, 'Housekeeping Service Worker', 14, 'Housekeeping Services', true),
  T(40, 'Other Service Worker', 15, 'Other Services', true),
];

export const PBJ_TITLE_BY_CODE = Object.fromEntries(PBJ_JOB_TITLES.map((t) => [t.code, t])) as Record<number, PbjJobTitle>;

/** PBJ pay type codes (Policy Manual v2.8 §2.2.o). */
export const PBJ_PAY_TYPE_CODE: Record<'exempt' | 'nonexempt' | 'contract', number> = {
  exempt: 1,
  nonexempt: 2,
  contract: 3,
};

/**
 * Source pay codes and how Poise treats them. Worked time and nonworked time are kept
 * distinct; nonworked categories never flow into PBJ eligible hours.
 */
export const PAY_CODES: Record<string, { label: string; worked: boolean; reviewForPbj?: string }> = {
  REG: { label: 'Regular worked', worked: true },
  OT: { label: 'Overtime worked', worked: true },
  AGY: { label: 'Agency worked', worked: true },
  ORIENT: {
    label: 'Orientation / training',
    worked: true,
    reviewForPbj: 'Staff in training who are not available for their primary role are not reported (Policy Manual §2.2.j).',
  },
  PTO: { label: 'Paid time off', worked: false },
  SICK: { label: 'Sick leave', worked: false },
  HOL: { label: 'Holiday pay', worked: false },
};
