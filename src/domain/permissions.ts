/**
 * Centralized, SIMULATED permission model. The UI asks `can(user, permission)` instead of
 * checking role names directly. This is a demo authorization layer only — it is not
 * production security and runs entirely in the browser.
 */
import type { DemoUser, DepartmentId, Employee, RoleKey } from './types';

export type Permission =
  | 'overview.view'
  | 'people.view'
  | 'people.edit'
  | 'people.create'
  | 'lifecycle.manage'
  | 'lifecycle.complete_tasks'
  | 'schedule.view'
  | 'schedule.edit'
  | 'schedule.publish'
  | 'time.view_all'
  | 'time.approve'
  | 'time.correct'
  | 'time_off.approve'
  | 'pbj.view'
  | 'pbj.map'
  | 'pbj.validate'
  | 'pbj.approve'
  | 'pbj.export'
  | 'pbj.import'
  | 'reports.view'
  | 'settings.view'
  | 'settings.edit'
  | 'facility.all'
  | 'self.clock'
  | 'self.requests';

const ALL: Permission[] = [
  'overview.view', 'people.view', 'people.edit', 'people.create', 'lifecycle.manage', 'lifecycle.complete_tasks',
  'schedule.view', 'schedule.edit', 'schedule.publish', 'time.view_all', 'time.approve', 'time.correct', 'time_off.approve',
  'pbj.view', 'pbj.map', 'pbj.validate', 'pbj.approve', 'pbj.export', 'pbj.import', 'reports.view', 'settings.view', 'settings.edit', 'facility.all',
];

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  corporate_admin: ALL,
  facility_admin: [
    'overview.view', 'people.view', 'people.edit', 'people.create', 'lifecycle.manage', 'lifecycle.complete_tasks',
    'schedule.view', 'schedule.edit', 'schedule.publish', 'time.view_all', 'time.approve', 'time.correct', 'time_off.approve',
    'pbj.view', 'pbj.approve', 'reports.view', 'settings.view', 'settings.edit',
  ],
  hr_manager: [
    'overview.view', 'people.view', 'people.edit', 'people.create', 'lifecycle.manage', 'lifecycle.complete_tasks',
    'schedule.view', 'time.view_all', 'time_off.approve', 'reports.view', 'settings.view', 'facility.all',
  ],
  scheduler: [
    'overview.view', 'people.view', 'lifecycle.complete_tasks', 'schedule.view', 'schedule.edit', 'schedule.publish',
    'time.view_all', 'time.approve', 'time.correct', 'time_off.approve', 'reports.view',
  ],
  pbj_reviewer: [
    'overview.view', 'people.view', 'time.view_all', 'pbj.view', 'pbj.map', 'pbj.validate', 'pbj.approve', 'pbj.export', 'pbj.import',
    'reports.view', 'settings.view', 'facility.all', 'lifecycle.complete_tasks',
  ],
  employee: ['self.clock', 'self.requests'],
};

export const ROLE_LABEL: Record<RoleKey, string> = {
  corporate_admin: 'Corporate administrator',
  facility_admin: 'Facility administrator',
  hr_manager: 'HR manager',
  scheduler: 'Department manager / scheduler',
  pbj_reviewer: 'PBJ reviewer',
  employee: 'Employee',
};

export const ROLE_DESCRIPTION: Record<RoleKey, string> = {
  corporate_admin: 'All facilities. Full access, including PBJ mapping and settings.',
  facility_admin: 'Cedar Ridge only. Operations, people, scheduling, time approval.',
  hr_manager: 'All facilities. Hiring, onboarding, offboarding, credentials.',
  scheduler: 'Cedar Ridge Nursing. Builds schedules, approves timecards.',
  pbj_reviewer: 'All facilities. PBJ mapping, validation, approval and export.',
  employee: 'Self-service: clock, schedule, timecards and requests.',
};

export function can(user: DemoUser, permission: Permission): boolean {
  return ROLE_PERMISSIONS[user.role].includes(permission);
}

export function canAccessFacility(user: DemoUser, facilityId: string): boolean {
  return user.facilityIds === null || user.facilityIds.includes(facilityId);
}

export function canAccessDepartment(user: DemoUser, departmentId: DepartmentId): boolean {
  return user.departmentIds === null || user.departmentIds.includes(departmentId);
}

export function canManageEmployee(user: DemoUser, e: Employee): boolean {
  const facilities = [e.primaryFacilityId, ...e.additionalFacilityIds];
  return facilities.some((f) => canAccessFacility(user, f)) && canAccessDepartment(user, e.departmentId);
}

/** Where a role lands after switching. */
export function homePath(role: RoleKey): string {
  return role === 'employee' ? '/me' : role === 'pbj_reviewer' ? '/pbj' : role === 'scheduler' ? '/scheduling' : '/';
}
