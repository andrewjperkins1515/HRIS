/**
 * Employee lifecycle: onboarding and offboarding checklists. Pure functions.
 *
 * Checking a task in this prototype records that someone marked it complete in Poise.
 * It does not order a background check, create a payroll transaction, or revoke access
 * in any external system.
 */
import { ROLE_BY_ID } from './catalog';
import type { Employee, ISODate, LifecycleTask, LifecycleWorkflow, RoleKey } from './types';
import { addDays } from './time';

interface TaskTemplate {
  key: string;
  title: string;
  category: LifecycleTask['category'];
  ownerRole: RoleKey;
  offsetDays: number; // relative to start (onboarding) or separation (offboarding)
  dependsOn?: string[];
  blocksFirstShift?: boolean;
  placeholderNote?: string;
  when?: (e: Employee) => boolean;
}

const needsLicense = (e: Employee) => (ROLE_BY_ID[e.roleId]?.requiredCredentials ?? []).some((c) => c !== 'TB Screening');

export const ONBOARDING_TEMPLATE: TaskTemplate[] = [
  { key: 'offer', title: 'Signed offer letter on file', category: 'documents', ownerRole: 'hr_manager', offsetDays: -10, blocksFirstShift: true },
  {
    key: 'i9',
    title: 'Form I-9 section 1 & 2 review',
    category: 'documents',
    ownerRole: 'hr_manager',
    offsetDays: -3,
    dependsOn: ['offer'],
    blocksFirstShift: true,
    placeholderNote: 'Document placeholder only. No identity documents are stored in the prototype.',
  },
  {
    key: 'background',
    title: 'Background check result reviewed',
    category: 'compliance',
    ownerRole: 'hr_manager',
    offsetDays: -5,
    dependsOn: ['offer'],
    blocksFirstShift: true,
    placeholderNote: 'Prototype only — marking this task does not order or receive a background check.',
  },
  {
    key: 'exclusion',
    title: 'OIG / state exclusion list check',
    category: 'compliance',
    ownerRole: 'hr_manager',
    offsetDays: -5,
    dependsOn: ['offer'],
    blocksFirstShift: true,
    placeholderNote: 'Prototype only — no external exclusion database is queried.',
  },
  {
    key: 'license',
    title: 'License / certification verification',
    category: 'credentials',
    ownerRole: 'hr_manager',
    offsetDays: -3,
    dependsOn: ['offer'],
    blocksFirstShift: true,
    placeholderNote: 'Prototype only — no primary-source verification is performed.',
    when: needsLicense,
  },
  { key: 'tb', title: 'TB screening result received', category: 'credentials', ownerRole: 'hr_manager', offsetDays: -2, blocksFirstShift: true },
  {
    key: 'payroll',
    title: 'Payroll & tax setup handoff',
    category: 'payroll',
    ownerRole: 'hr_manager',
    offsetDays: -2,
    dependsOn: ['i9'],
    placeholderNote: 'Prototype only — no payroll record or transaction is created.',
  },
  {
    key: 'access',
    title: 'Badge, timeclock & EHR access request',
    category: 'access',
    ownerRole: 'facility_admin',
    offsetDays: -1,
    dependsOn: ['background'],
    blocksFirstShift: true,
    placeholderNote: 'Prototype only — no accounts are provisioned in external systems.',
  },
  { key: 'orientation', title: 'General orientation & policies', category: 'training', ownerRole: 'facility_admin', offsetDays: 0, dependsOn: ['access'] },
  {
    key: 'competency',
    title: 'Department competency checklist',
    category: 'training',
    ownerRole: 'scheduler',
    offsetDays: 7,
    dependsOn: ['orientation'],
  },
  { key: 'first_shift', title: 'First shift scheduled with preceptor', category: 'scheduling', ownerRole: 'scheduler', offsetDays: -1, dependsOn: ['tb'] },
];

export const OFFBOARDING_TEMPLATE: TaskTemplate[] = [
  { key: 'notice', title: 'Separation notice & reason documented', category: 'documents', ownerRole: 'hr_manager', offsetDays: -7 },
  { key: 'future_shifts', title: 'Review future shifts after separation date', category: 'scheduling', ownerRole: 'scheduler', offsetDays: -5, dependsOn: ['notice'] },
  { key: 'final_timecards', title: 'Final timecards approved', category: 'payroll', ownerRole: 'scheduler', offsetDays: 1, dependsOn: ['notice'] },
  {
    key: 'final_pay',
    title: 'Final pay handoff to payroll',
    category: 'payroll',
    ownerRole: 'hr_manager',
    offsetDays: 2,
    dependsOn: ['final_timecards'],
    placeholderNote: 'Prototype only — no payroll transaction is created.',
  },
  { key: 'equipment', title: 'Badge, keys & equipment returned', category: 'equipment', ownerRole: 'facility_admin', offsetDays: 0 },
  {
    key: 'access_revoke',
    title: 'Access revocation (timeclock, EHR, building)',
    category: 'access',
    ownerRole: 'facility_admin',
    offsetDays: 0,
    placeholderNote: 'Prototype only — access is not actually revoked in any external system.',
  },
  { key: 'exit_interview', title: 'Exit interview (optional)', category: 'documents', ownerRole: 'hr_manager', offsetDays: 0 },
  { key: 'pbj_term', title: 'Record PBJ termination date (optional field)', category: 'compliance', ownerRole: 'pbj_reviewer', offsetDays: 3 },
];

const OWNER_NAMES: Record<RoleKey, string> = {
  corporate_admin: 'Corporate Admin',
  facility_admin: 'Facility Admin',
  hr_manager: 'HR',
  scheduler: 'Scheduler',
  pbj_reviewer: 'PBJ Reviewer',
  employee: 'Employee',
};

export function buildTasks(
  template: TaskTemplate[],
  employee: Employee,
  anchor: ISODate,
  makeId: () => string,
): LifecycleTask[] {
  const included = template.filter((t) => !t.when || t.when(employee));
  const keys = new Set(included.map((t) => t.key));
  return included.map((t) => ({
    id: makeId(),
    key: t.key,
    title: t.title,
    category: t.category,
    ownerRole: t.ownerRole,
    ownerName: OWNER_NAMES[t.ownerRole],
    dueDate: addDays(anchor, t.offsetDays),
    status: 'not_started',
    dependsOn: (t.dependsOn ?? []).filter((k) => keys.has(k)),
    blocksFirstShift: !!t.blocksFirstShift,
    placeholderNote: t.placeholderNote,
  }));
}

export function isTaskDone(t: LifecycleTask): boolean {
  return t.status === 'done' || t.status === 'waived';
}

/** Dependencies that are not yet done. */
export function unmetDependencies(wf: LifecycleWorkflow, task: LifecycleTask): LifecycleTask[] {
  return task.dependsOn
    .map((k) => wf.tasks.find((t) => t.key === k))
    .filter((t): t is LifecycleTask => !!t && !isTaskDone(t));
}

export interface Readiness {
  ready: boolean;
  done: number;
  total: number;
  pct: number;
  blockers: { task: LifecycleTask; reason: string }[];
  overdue: LifecycleTask[];
}

export function workflowReadiness(wf: LifecycleWorkflow, today: ISODate): Readiness {
  const done = wf.tasks.filter(isTaskDone).length;
  const blockers: Readiness['blockers'] = [];
  for (const t of wf.tasks) {
    if (isTaskDone(t)) continue;
    if (wf.kind === 'onboarding' && t.blocksFirstShift) blockers.push({ task: t, reason: 'Required before first shift' });
    else if (t.status === 'blocked') blockers.push({ task: t, reason: t.note || 'Marked blocked' });
  }
  const overdue = wf.tasks.filter((t) => !isTaskDone(t) && t.dueDate < today);
  return {
    ready: blockers.length === 0,
    done,
    total: wf.tasks.length,
    pct: wf.tasks.length ? Math.round((done / wf.tasks.length) * 100) : 100,
    blockers,
    overdue,
  };
}

export function canCompleteWorkflow(wf: LifecycleWorkflow): { ok: boolean; reason?: string } {
  if (wf.status !== 'in_progress') return { ok: false, reason: 'Workflow is not in progress.' };
  const open = wf.tasks.filter((t) => !isTaskDone(t));
  if (open.length) return { ok: false, reason: `${open.length} task${open.length === 1 ? '' : 's'} still open.` };
  return { ok: true };
}
