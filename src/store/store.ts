/**
 * Poise demo store. A single lightweight Zustand store holds the shared data model and
 * every business action. Components call these actions; the actions delegate rules to
 * pure domain functions so the persistence layer can later be replaced by real APIs.
 *
 * Persistence: browser localStorage (demo only). "Reset demo" restores the seed.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ROLE_BY_ID } from '../domain/catalog';
import { buildTasks, canCompleteWorkflow, OFFBOARDING_TEMPLATE, ONBOARDING_TEMPLATE, unmetDependencies } from '../domain/lifecycle';
import { checkEligibility, shiftIv } from '../domain/scheduling';
import { calcTimecard, canApprove } from '../domain/timecards';
import { addDays, dateRange, localDateOf, quarterFromId, weekStartOf, zonedToUtcMs } from '../domain/time';
import type {
  AuditEvent,
  CorrectionChange,
  CoverageTarget,
  DemoUser,
  Employee,
  Facility,
  ISODate,
  LifecycleTask,
  NonWorkedCategory,
  PbjIssueResolution,
  PbjJobMapping,
  PbjSubmissionRecord,
  Punch,
  PunchType,
  RoleKey,
  Shift,
  TaskStatus,
  Timecard,
  Toast,
} from '../domain/types';
import { canApprovePackage, preparationStatus, runPbjEngine, type PbjResult } from '../domain/pbj/engine';
import { demoXmlExportService } from '../domain/pbj/export';
import type { ParsedImportRow } from '../domain/pbj/importer';
import { DEFAULT_PBJ_RULES, type PbjRuleConfig } from '../domain/pbj/rules';
import { buildSeed, demoUser, SEED_VERSION, type SeedState } from '../data/seed';
import { can, type Permission } from '../domain/permissions';

export type FacilityScope = 'all' | string;

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  value?: T;
}

interface SessionState {
  role: RoleKey;
  facilityScope: FacilityScope;
  pbjRules: PbjRuleConfig;
  toasts: Toast[];
}

export interface PoiseState extends SeedState, SessionState {
  /* session */
  setRole: (role: RoleKey) => void;
  setFacilityScope: (scope: FacilityScope) => void;
  resetDemo: () => void;
  advanceClock: (minutes: number) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;

  /* people & lifecycle */
  createEmployee: (input: NewEmployeeInput) => ActionResult<string>;
  updateEmployee: (id: string, patch: Partial<Employee>, reason?: string) => ActionResult;
  verifyCredential: (employeeId: string, credentialId: string, patch?: Partial<Employee['credentials'][number]>) => ActionResult;
  setTaskStatus: (workflowId: string, taskId: string, status: TaskStatus, note?: string) => ActionResult;
  completeOnboarding: (workflowId: string) => ActionResult;
  startOffboarding: (employeeId: string, input: { separationDate: ISODate; reason: string; rehireEligible: boolean }) => ActionResult<string>;
  unassignShiftsAfter: (employeeId: string, afterDate: ISODate) => ActionResult<number>;
  completeOffboarding: (workflowId: string) => ActionResult;

  /* scheduling */
  createShift: (input: Omit<Shift, 'id'>) => ActionResult<string>;
  updateShift: (id: string, patch: Partial<Omit<Shift, 'id'>>) => ActionResult;
  deleteShift: (id: string) => ActionResult;
  assignShift: (shiftId: string, employeeId: string) => ActionResult<{ warnings: string[] }>;
  unassignShift: (shiftId: string) => ActionResult;
  publishWeek: (facilityId: string, weekStart: ISODate) => ActionResult;
  updateCoverageTarget: (id: string, required: number) => void;

  /* time & attendance */
  clockAction: (employeeId: string, type: PunchType, facilityId?: string) => ActionResult<string>;
  requestCorrection: (input: { timecardId: string; reason: string; changes: CorrectionChange[] }) => ActionResult<string>;
  reviewCorrection: (id: string, decision: 'approved' | 'rejected', note: string) => ActionResult;
  managerCorrect: (input: { timecardId: string; reason: string; changes: CorrectionChange[] }) => ActionResult;
  approveTimecards: (ids: string[]) => ActionResult<{ approved: number; skipped: { id: string; reason: string }[] }>;
  reopenTimecard: (id: string, reason: string) => ActionResult;
  markBreakReviewed: (id: string) => void;
  requestTimeOff: (input: { employeeId: string; startDate: ISODate; endDate: ISODate; category: NonWorkedCategory; hoursPerDay: number; note?: string }) => ActionResult<string>;
  decideTimeOff: (id: string, decision: 'approved' | 'denied') => ActionResult;

  /* PBJ */
  computePbj: (facilityId: string, quarterId: string) => PbjResult;
  saveMapping: (input: Omit<PbjJobMapping, 'id' | 'updatedBy' | 'updatedAt'> & { id?: string }) => ActionResult;
  runPbjValidation: (facilityId: string, quarterId: string) => ActionResult<PbjResult>;
  resolvePbjIssues: (facilityId: string, quarterId: string, issueKeys: string[], decision: PbjIssueResolution['decision'], note: string) => ActionResult;
  clearPbjResolution: (facilityId: string, quarterId: string, issueKey: string) => void;
  approvePbjPackage: (facilityId: string, quarterId: string, note?: string) => ActionResult;
  generatePbjExport: (facilityId: string, quarterId: string) => ActionResult<{ fileName: string; content: string; mimeType: string }>;
  recordPbjSubmission: (facilityId: string, quarterId: string, input: Pick<PbjSubmissionRecord, 'submissionReference' | 'finalValidationStatus' | 'notes'>) => ActionResult;
  newPbjVersion: (facilityId: string, quarterId: string) => ActionResult;
  importAgencyHours: (facilityId: string, fileName: string, rows: ParsedImportRow[], columnMapping: Record<string, string>) => ActionResult<{ accepted: number; created: number }>;

  /* settings */
  updateFacility: (id: string, patch: Partial<Facility>) => ActionResult;
  updatePbjRules: (patch: Partial<PbjRuleConfig>) => void;
}

export interface NewEmployeeInput {
  firstName: string;
  lastName: string;
  preferredName?: string;
  email: string;
  phone: string;
  workerType: Employee['workerType'];
  agencyName?: string;
  employmentType: Employee['employmentType'];
  primaryFacilityId: string;
  additionalFacilityIds: string[];
  roleId: string;
  managerId: string | null;
  hireDate: ISODate;
  firstShiftDate: ISODate;
}

/* ------------------------------ helpers ------------------------------ */

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter = (idCounter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${rand}${idCounter}`;
}

export function currentUser(s: Pick<PoiseState, 'role'>): DemoUser {
  return demoUser(s.role);
}

export function demoNowMs(s: Pick<PoiseState, 'demoNowIso'>): number {
  return Date.parse(s.demoNowIso);
}

export function facilityToday(s: Pick<PoiseState, 'demoNowIso' | 'facilities'>, facilityId?: string): ISODate {
  const f = s.facilities.find((x) => x.id === facilityId) ?? s.facilities[0];
  return localDateOf(s.demoNowIso, f.timeZone);
}

function fullName(e: Employee): string {
  return `${e.preferredName ?? e.firstName} ${e.lastName}`;
}

const pbjCache = new Map<string, { deps: unknown[]; result: PbjResult }>();

function initialSession(): SessionState {
  return { role: 'corporate_admin', facilityScope: 'all', pbjRules: DEFAULT_PBJ_RULES, toasts: [] };
}

/* ------------------------------ store ------------------------------ */

export const usePoise = create<PoiseState>()(
  persist(
    (set, get) => {
      const user = () => currentUser(get());
      const nowIso = () => get().demoNowIso;
      const deny = (p: Permission): ActionResult<never> | null =>
        can(user(), p) ? null : { ok: false, error: `Your demo role (${user().title}) cannot perform this action.` };
      const log = (e: Omit<AuditEvent, 'id' | 'at' | 'actor' | 'actorRole'>) => {
        const u = user();
        const ev: AuditEvent = { id: newId('AU'), at: nowIso(), actor: u.name, actorRole: u.role, ...e };
        set((s) => ({ audit: [ev, ...s.audit].slice(0, 800) }));
      };
      const facility = (id: string) => get().facilities.find((f) => f.id === id)!;
      const employee = (id: string) => get().employees.find((e) => e.id === id);
      const patchEmployee = (id: string, patch: Partial<Employee>) =>
        set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
      const patchTimecard = (id: string, fn: (t: Timecard) => Timecard) =>
        set((s) => ({ timecards: s.timecards.map((t) => (t.id === id ? fn(t) : t)) }));
      const prepFor = (facilityId: string, quarterId: string) =>
        get()
          .preparations.filter((p) => p.facilityId === facilityId && p.quarterId === quarterId && p.status !== 'superseded')
          .sort((a, b) => b.version - a.version)[0];
      const ensurePrep = (facilityId: string, quarterId: string) => {
        let p = prepFor(facilityId, quarterId);
        if (!p) {
          p = {
            id: newId('PBJ'),
            facilityId,
            quarterId,
            version: 1,
            status: 'in_preparation',
            createdAt: nowIso(),
            createdBy: user().name,
            validationRuns: [],
            resolutions: [],
            exports: [],
            submissions: [],
          };
          const created = p;
          set((s) => ({ preparations: [...s.preparations, created] }));
        }
        return p;
      };
      const patchPrep = (id: string, fn: (p: SeedState['preparations'][number]) => SeedState['preparations'][number]) =>
        set((s) => ({ preparations: s.preparations.map((p) => (p.id === id ? fn(p) : p)) }));
      const shiftForClock = (employeeId: string, facilityId: string, nowMs: number) => {
        const s = get();
        const facs = Object.fromEntries(s.facilities.map((f) => [f.id, f]));
        return s.shifts
          .filter((x) => x.employeeId === employeeId && x.facilityId === facilityId)
          .map((x) => ({ x, iv: shiftIv(x, facs) }))
          .filter(({ iv }) => nowMs >= iv.start - 90 * 60000 && nowMs <= iv.end)
          .sort((a, b) => Math.abs(a.iv.start - nowMs) - Math.abs(b.iv.start - nowMs))[0]?.x;
      };

      return {
        ...buildSeed(),
        ...initialSession(),

        /* ------------------------------ session ------------------------------ */
        setRole: (role) => {
          const u = demoUser(role);
          set({ role, facilityScope: u.facilityIds ? u.facilityIds[0] : 'all' });
        },
        setFacilityScope: (scope) => {
          const u = user();
          if (scope === 'all' && u.facilityIds) return;
          if (scope !== 'all' && u.facilityIds && !u.facilityIds.includes(scope)) return;
          set({ facilityScope: scope });
        },
        resetDemo: () => {
          pbjCache.clear();
          set({ ...buildSeed(), ...initialSession(), role: get().role, facilityScope: user().facilityIds?.[0] ?? 'all' });
          get().toast({ tone: 'success', title: 'Demo reset', body: 'All demo records were restored to the seed data.' });
        },
        advanceClock: (minutes) => {
          set((s) => ({ demoNowIso: new Date(Date.parse(s.demoNowIso) + minutes * 60000).toISOString() }));
        },
        toast: (t) => {
          const id = newId('TOAST');
          set((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-4) }));
          setTimeout(() => get().dismissToast(id), t.tone === 'error' ? 7000 : 4500);
        },
        dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

        /* ------------------------------ people ------------------------------ */
        createEmployee: (input) => {
          const d = deny('people.create');
          if (d) return d;
          const role = ROLE_BY_ID[input.roleId];
          if (!role) return { ok: false, error: 'Choose a job role.' };
          const nums = get().employees.map((e) => Number(e.id.replace('E-', ''))).filter((n) => !Number.isNaN(n));
          const id = `E-${Math.max(10200, ...nums) + 1}`;
          const pbjId = 'W' + Math.random().toString(36).slice(2, 9).toUpperCase().replace(/[01OIL]/g, '7');
          const emp: Employee = {
            id,
            pbjEmployeeId: pbjId,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            preferredName: input.preferredName?.trim() || undefined,
            email: input.email.trim(),
            phone: input.phone.trim(),
            status: 'onboarding',
            workerType: input.workerType,
            agencyName: input.workerType === 'employee' ? undefined : input.agencyName,
            payType: input.workerType === 'employee' ? role.flsa : 'contract',
            employmentType: input.employmentType,
            primaryFacilityId: input.primaryFacilityId,
            additionalFacilityIds: input.additionalFacilityIds.filter((f) => f !== input.primaryFacilityId),
            departmentId: role.departmentId,
            roleId: role.id,
            managerId: input.managerId,
            hireDate: input.hireDate,
            firstShiftDate: input.firstShiftDate,
            availability: [0, 1, 2, 3, 4, 5, 6].map(() => 'available'),
            credentials: role.requiredCredentials.map((type) => ({ id: newId('CR'), type, verification: 'not_started' as const })),
            createdAt: nowIso(),
            createdBySource: 'manual',
          };
          const wf = {
            id: newId('WF'),
            employeeId: id,
            kind: 'onboarding' as const,
            status: 'in_progress' as const,
            startedAt: nowIso(),
            startedBy: user().name,
            effectiveDate: input.firstShiftDate,
            tasks: buildTasks(ONBOARDING_TEMPLATE, emp, input.firstShiftDate, () => newId('T')),
          };
          set((s) => ({ employees: [...s.employees, emp], workflows: [...s.workflows, wf] }));
          log({ facilityId: emp.primaryFacilityId, entityType: 'employee', entityId: id, action: 'Created employee', detail: `${fullName(emp)} — ${role.name}. Onboarding checklist applied.` });
          return { ok: true, value: id };
        },
        updateEmployee: (id, patch, reason) => {
          const d = deny('people.edit');
          if (d) return d;
          const e = employee(id);
          if (!e) return { ok: false, error: 'Employee not found.' };
          if (patch.roleId) patch.departmentId = ROLE_BY_ID[patch.roleId].departmentId;
          patchEmployee(id, patch);
          log({ facilityId: e.primaryFacilityId, entityType: 'employee', entityId: id, action: 'Updated employee', detail: reason ?? `Updated ${Object.keys(patch).join(', ')}.` });
          return { ok: true };
        },
        verifyCredential: (employeeId, credentialId, patch) => {
          const d = deny('lifecycle.complete_tasks');
          if (d) return d;
          const e = employee(employeeId);
          if (!e) return { ok: false, error: 'Employee not found.' };
          const cred = e.credentials.find((c) => c.id === credentialId);
          if (!cred) return { ok: false, error: 'Credential not found.' };
          const next = { ...cred, verification: 'verified' as const, ...patch };
          if (!next.expiresOn) return { ok: false, error: 'Enter an expiration date before marking verified.' };
          patchEmployee(employeeId, { credentials: e.credentials.map((c) => (c.id === credentialId ? next : c)) });
          log({ facilityId: e.primaryFacilityId, entityType: 'employee', entityId: employeeId, action: 'Marked credential verified', detail: `${cred.type} for ${fullName(e)} (prototype — no primary-source check performed).` });
          return { ok: true };
        },
        setTaskStatus: (workflowId, taskId, status, note) => {
          const d = deny('lifecycle.complete_tasks');
          if (d) return d;
          const wf = get().workflows.find((w) => w.id === workflowId);
          const task = wf?.tasks.find((t) => t.id === taskId);
          if (!wf || !task) return { ok: false, error: 'Task not found.' };
          if (status === 'done') {
            const unmet = unmetDependencies(wf, task);
            if (unmet.length) return { ok: false, error: `Complete first: ${unmet.map((t) => t.title).join(', ')}.` };
          }
          const patch: Partial<LifecycleTask> = { status, note: note ?? task.note };
          if (status === 'done' || status === 'waived') Object.assign(patch, { completedBy: user().name, completedAt: nowIso() });
          else Object.assign(patch, { completedBy: undefined, completedAt: undefined });
          set((s) => ({ workflows: s.workflows.map((w) => (w.id === workflowId ? { ...w, tasks: w.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) } : w)) }));
          const e = employee(wf.employeeId);
          log({ facilityId: e?.primaryFacilityId ?? null, entityType: 'lifecycle', entityId: workflowId, action: `Task ${status.replace('_', ' ')}`, detail: `${task.title} — ${e ? fullName(e) : ''}` });
          return { ok: true };
        },
        completeOnboarding: (workflowId) => {
          const d = deny('lifecycle.manage');
          if (d) return d;
          const wf = get().workflows.find((w) => w.id === workflowId);
          if (!wf || wf.kind !== 'onboarding') return { ok: false, error: 'Onboarding workflow not found.' };
          const check = canCompleteWorkflow(wf);
          if (!check.ok) return { ok: false, error: check.reason };
          const e = employee(wf.employeeId)!;
          const unverified = e.credentials.filter((c) => c.verification !== 'verified');
          if (unverified.length) return { ok: false, error: `Verify credentials first: ${unverified.map((c) => c.type).join(', ')}.` };
          set((s) => ({ workflows: s.workflows.map((w) => (w.id === workflowId ? { ...w, status: 'completed', completedAt: nowIso() } : w)) }));
          patchEmployee(e.id, { status: 'active' });
          log({ facilityId: e.primaryFacilityId, entityType: 'lifecycle', entityId: workflowId, action: 'Completed onboarding', detail: `${fullName(e)} is now active and can be scheduled.` });
          return { ok: true };
        },
        startOffboarding: (employeeId, input) => {
          const d = deny('lifecycle.manage');
          if (d) return d;
          const e = employee(employeeId);
          if (!e) return { ok: false, error: 'Employee not found.' };
          if (e.status === 'archived' || e.status === 'offboarding') return { ok: false, error: 'Employee is already offboarding or archived.' };
          if (!input.reason.trim()) return { ok: false, error: 'Enter a separation reason.' };
          const wf = {
            id: newId('WF'),
            employeeId,
            kind: 'offboarding' as const,
            status: 'in_progress' as const,
            startedAt: nowIso(),
            startedBy: user().name,
            effectiveDate: input.separationDate,
            reason: input.reason,
            rehireEligible: input.rehireEligible,
            tasks: buildTasks(OFFBOARDING_TEMPLATE, e, input.separationDate, () => newId('T')),
          };
          set((s) => ({ workflows: [...s.workflows, wf] }));
          patchEmployee(employeeId, { status: 'offboarding', separationDate: input.separationDate });
          log({ facilityId: e.primaryFacilityId, entityType: 'lifecycle', entityId: wf.id, action: 'Started offboarding', detail: `${fullName(e)} — separation effective ${input.separationDate} (${input.reason}).` });
          return { ok: true, value: wf.id };
        },
        unassignShiftsAfter: (employeeId, afterDate) => {
          const d = deny('schedule.edit') && deny('lifecycle.manage');
          if (d) return d;
          const affected = get().shifts.filter((s) => s.employeeId === employeeId && s.date > afterDate);
          const weeks = get().scheduleWeeks;
          set((s) => ({
            shifts: s.shifts.map((x) =>
              affected.some((a) => a.id === x.id)
                ? { ...x, employeeId: null, changedAfterPublish: weeks.find((w) => w.id === `${x.facilityId}:${weekStartOf(x.date)}`)?.status === 'published' || x.changedAfterPublish, notes: `Released (offboarding)${x.notes ? ' · ' + x.notes : ''}` }
                : x,
            ),
          }));
          const e = employee(employeeId);
          log({ facilityId: e?.primaryFacilityId ?? null, entityType: 'shift', entityId: employeeId, action: 'Released future shifts', detail: `${affected.length} shift(s) after ${afterDate} returned to open shifts.` });
          return { ok: true, value: affected.length };
        },
        completeOffboarding: (workflowId) => {
          const d = deny('lifecycle.manage');
          if (d) return d;
          const wf = get().workflows.find((w) => w.id === workflowId);
          if (!wf || wf.kind !== 'offboarding') return { ok: false, error: 'Offboarding workflow not found.' };
          const check = canCompleteWorkflow(wf);
          if (!check.ok) return { ok: false, error: check.reason };
          const future = get().shifts.filter((s) => s.employeeId === wf.employeeId && s.date > wf.effectiveDate);
          if (future.length) return { ok: false, error: `${future.length} shift(s) after the separation date are still assigned.` };
          const e = employee(wf.employeeId)!;
          const open = get().timecards.filter((t) => t.employeeId === e.id && t.status !== 'approved');
          if (open.length) return { ok: false, error: `${open.length} timecard(s) still need approval.` };
          set((s) => ({ workflows: s.workflows.map((w) => (w.id === workflowId ? { ...w, status: 'completed', completedAt: nowIso() } : w)) }));
          patchEmployee(e.id, { status: 'archived', archivedAt: nowIso() });
          log({ facilityId: e.primaryFacilityId, entityType: 'lifecycle', entityId: workflowId, action: 'Archived employee', detail: `${fullName(e)} archived. Time, schedule and PBJ history retained.` });
          return { ok: true };
        },

        /* ------------------------------ scheduling ------------------------------ */
        createShift: (input) => {
          const d = deny('schedule.edit');
          if (d) return d;
          if (!input.date || !input.start || !input.end) return { ok: false, error: 'Date, start and end are required.' };
          if (input.start === input.end) return { ok: false, error: 'Start and end cannot be the same.' };
          const id = newId('S');
          const week = get().scheduleWeeks.find((w) => w.id === `${input.facilityId}:${weekStartOf(input.date)}`);
          const shift: Shift = { ...input, id, employeeId: null, changedAfterPublish: week?.status === 'published' };
          set((s) => ({ shifts: [...s.shifts, shift] }));
          log({ facilityId: input.facilityId, entityType: 'shift', entityId: id, action: 'Created shift', detail: `${ROLE_BY_ID[input.roleId]?.name} ${input.date} ${input.start}–${input.end}` });
          if (input.employeeId) {
            const r = get().assignShift(id, input.employeeId);
            if (!r.ok) return { ok: true, value: id, error: r.error };
          }
          return { ok: true, value: id };
        },
        updateShift: (id, patch) => {
          const d = deny('schedule.edit');
          if (d) return d;
          const sh = get().shifts.find((s) => s.id === id);
          if (!sh) return { ok: false, error: 'Shift not found.' };
          const next = { ...sh, ...patch };
          if (next.employeeId) {
            const e = employee(next.employeeId)!;
            const facs = Object.fromEntries(get().facilities.map((f) => [f.id, f]));
            const r = checkEligibility(e, next, { facilities: facs, shifts: get().shifts, timeOff: get().timeOff });
            if (!r.ok) return { ok: false, error: r.blocking.join(' ') };
          }
          const week = get().scheduleWeeks.find((w) => w.id === `${sh.facilityId}:${weekStartOf(sh.date)}`);
          set((s) => ({ shifts: s.shifts.map((x) => (x.id === id ? { ...next, changedAfterPublish: week?.status === 'published' || x.changedAfterPublish } : x)) }));
          log({ facilityId: sh.facilityId, entityType: 'shift', entityId: id, action: 'Edited shift', detail: `${next.date} ${next.start}–${next.end}`, before: `${sh.date} ${sh.start}–${sh.end}`, after: `${next.date} ${next.start}–${next.end}` });
          return { ok: true };
        },
        deleteShift: (id) => {
          const d = deny('schedule.edit');
          if (d) return d;
          const sh = get().shifts.find((s) => s.id === id);
          if (!sh) return { ok: false, error: 'Shift not found.' };
          if (get().timecards.some((t) => t.shiftId === id)) return { ok: false, error: 'This shift has time records and cannot be deleted.' };
          set((s) => ({ shifts: s.shifts.filter((x) => x.id !== id) }));
          log({ facilityId: sh.facilityId, entityType: 'shift', entityId: id, action: 'Deleted shift', detail: `${sh.date} ${sh.start}–${sh.end}` });
          return { ok: true };
        },
        assignShift: (shiftId, employeeId) => {
          const d = deny('schedule.edit');
          if (d) return d;
          const s = get();
          const sh = s.shifts.find((x) => x.id === shiftId);
          const e = employee(employeeId);
          if (!sh || !e) return { ok: false, error: 'Shift or employee not found.' };
          const facs = Object.fromEntries(s.facilities.map((f) => [f.id, f]));
          const r = checkEligibility(e, sh, { facilities: facs, shifts: s.shifts, timeOff: s.timeOff });
          if (!r.ok) return { ok: false, error: `${fullName(e)} cannot be assigned: ${r.blocking.join(' ')}` };
          const week = s.scheduleWeeks.find((w) => w.id === `${sh.facilityId}:${weekStartOf(sh.date)}`);
          set((st) => ({ shifts: st.shifts.map((x) => (x.id === shiftId ? { ...x, employeeId, changedAfterPublish: week?.status === 'published' || x.changedAfterPublish } : x)) }));
          log({ facilityId: sh.facilityId, entityType: 'shift', entityId: shiftId, action: 'Assigned shift', detail: `${fullName(e)} → ${ROLE_BY_ID[sh.roleId]?.name} ${sh.date} ${sh.start}–${sh.end}` });
          return { ok: true, value: { warnings: r.warnings } };
        },
        unassignShift: (shiftId) => {
          const d = deny('schedule.edit');
          if (d) return d;
          const sh = get().shifts.find((x) => x.id === shiftId);
          if (!sh || !sh.employeeId) return { ok: false, error: 'Shift is not assigned.' };
          const e = employee(sh.employeeId);
          const week = get().scheduleWeeks.find((w) => w.id === `${sh.facilityId}:${weekStartOf(sh.date)}`);
          set((s) => ({ shifts: s.shifts.map((x) => (x.id === shiftId ? { ...x, employeeId: null, changedAfterPublish: week?.status === 'published' || x.changedAfterPublish } : x)) }));
          log({ facilityId: sh.facilityId, entityType: 'shift', entityId: shiftId, action: 'Unassigned shift', detail: `${e ? fullName(e) : ''} removed from ${sh.date} ${sh.start}–${sh.end}` });
          return { ok: true };
        },
        publishWeek: (facilityId, weekStart) => {
          const d = deny('schedule.publish');
          if (d) return d;
          const id = `${facilityId}:${weekStart}`;
          const exists = get().scheduleWeeks.some((w) => w.id === id);
          const end = addDays(weekStart, 6);
          set((s) => ({
            scheduleWeeks: exists
              ? s.scheduleWeeks.map((w) => (w.id === id ? { ...w, status: 'published', publishedAt: nowIso(), publishedBy: user().name } : w))
              : [...s.scheduleWeeks, { id, facilityId, weekStart, status: 'published', publishedAt: nowIso(), publishedBy: user().name }],
            shifts: s.shifts.map((x) => (x.facilityId === facilityId && x.date >= weekStart && x.date <= end ? { ...x, changedAfterPublish: false } : x)),
          }));
          const count = get().shifts.filter((x) => x.facilityId === facilityId && x.date >= weekStart && x.date <= end).length;
          log({ facilityId, entityType: 'schedule', entityId: id, action: 'Published schedule', detail: `Week of ${weekStart}: ${count} shifts published. Demo only — no notifications were sent.` });
          return { ok: true };
        },
        updateCoverageTarget: (id, required) => {
          if (deny('settings.edit') && deny('schedule.publish')) return;
          set((s) => ({ coverageTargets: s.coverageTargets.map((c: CoverageTarget) => (c.id === id ? { ...c, required: Math.max(0, required) } : c)) }));
          log({ facilityId: get().coverageTargets.find((c) => c.id === id)?.facilityId ?? null, entityType: 'facility', entityId: id, action: 'Updated coverage target', detail: `Planning target set to ${required}.` });
        },

        /* ------------------------------ time ------------------------------ */
        clockAction: (employeeId, type, facilityIdArg) => {
          const s = get();
          const u = user();
          if (u.role === 'employee' && u.employeeId !== employeeId) return { ok: false, error: 'You can only clock for yourself.' };
          const e = employee(employeeId);
          if (!e) return { ok: false, error: 'Employee not found.' };
          if (e.status !== 'active' && e.status !== 'offboarding') return { ok: false, error: `Clock actions are not available while status is ${e.status}.` };
          const facilityId = facilityIdArg ?? e.primaryFacilityId;
          const f = facility(facilityId);
          const nowMs = demoNowMs(s);
          const open = s.timecards
            .filter((t) => t.employeeId === employeeId && t.status === 'open')
            .map((t) => ({ t, c: calcTimecard(t, { timeZone: facility(t.facilityId).timeZone, nowMs }) }))
            .find(({ c }) => c.onClock);
          const punch: Punch = { id: newId('P'), type, at: s.demoNowIso, source: 'clock', recordedAt: s.demoNowIso, recordedBy: fullName(e) };
          if (type === 'in') {
            if (open) return { ok: false, error: 'Already clocked in.' };
            const shift = shiftForClock(employeeId, facilityId, nowMs);
            const tc: Timecard = {
              id: newId('TC'),
              employeeId,
              facilityId,
              departmentId: shift?.departmentId ?? e.departmentId,
              roleId: shift?.roleId ?? e.roleId,
              shiftId: shift?.id ?? null,
              workDate: localDateOf(nowMs, f.timeZone),
              punches: [punch],
              status: 'open',
              source: 'clock',
            };
            set((st) => ({ timecards: [...st.timecards, tc] }));
            log({ facilityId, entityType: 'punch', entityId: tc.id, action: 'Clock in', detail: `${fullName(e)} clocked in${shift ? '' : ' (no matching scheduled shift — unscheduled work)'}.` });
            return { ok: true, value: tc.id };
          }
          if (!open) return { ok: false, error: 'Not clocked in.' };
          if (type === 'break_start' && open.c.onBreak) return { ok: false, error: 'Already on break.' };
          if (type === 'break_end' && !open.c.onBreak) return { ok: false, error: 'Not on break.' };
          if (type === 'out' && open.c.onBreak) return { ok: false, error: 'End your break before clocking out.' };
          patchTimecard(open.t.id, (t) => ({ ...t, punches: [...t.punches, punch], status: type === 'out' ? 'pending_approval' : t.status }));
          log({ facilityId: open.t.facilityId, entityType: 'punch', entityId: open.t.id, action: type === 'out' ? 'Clock out' : type === 'break_start' ? 'Break start' : 'Break end', detail: `${fullName(e)}` });
          return { ok: true, value: open.t.id };
        },
        requestCorrection: ({ timecardId, reason, changes }) => {
          const tc = get().timecards.find((t) => t.id === timecardId);
          if (!tc) return { ok: false, error: 'Timecard not found.' };
          const u = user();
          if (u.role === 'employee' && u.employeeId !== tc.employeeId) return { ok: false, error: 'You can only request corrections to your own time.' };
          if (!reason.trim() || reason.trim().length < 8) return { ok: false, error: 'A reason of at least 8 characters is required.' };
          if (!changes.length) return { ok: false, error: 'Add at least one punch change.' };
          if (get().corrections.some((c) => c.timecardId === timecardId && c.status === 'pending')) return { ok: false, error: 'A correction is already pending for this timecard.' };
          const id = newId('CORR');
          set((s) => ({
            corrections: [{ id, timecardId, employeeId: tc.employeeId, requestedBy: u.name, requestedByRole: u.role, requestedAt: nowIso(), reason: reason.trim(), changes, status: 'pending' }, ...s.corrections],
          }));
          log({ facilityId: tc.facilityId, entityType: 'correction', entityId: id, action: 'Requested correction', detail: `${changes.length} punch change(s) on ${tc.workDate}.` });
          return { ok: true, value: id };
        },
        reviewCorrection: (id, decision, note) => {
          const d = deny('time.correct');
          if (d) return d;
          const c = get().corrections.find((x) => x.id === id);
          if (!c || c.status !== 'pending') return { ok: false, error: 'Correction is not pending.' };
          if (decision === 'rejected' && !note.trim()) return { ok: false, error: 'Enter a note explaining the rejection.' };
          const tc = get().timecards.find((t) => t.id === c.timecardId)!;
          if (tc.status === 'approved') return { ok: false, error: 'Reopen the approved timecard before applying a correction.' };
          const u = user();
          if (decision === 'approved') {
            patchTimecard(tc.id, (t) => {
              const punches = t.punches.map((p) => (c.changes.some((ch) => ch.originalPunchId === p.id) ? { ...p, supersededBy: c.id } : p));
              for (const ch of c.changes) {
                punches.push({ id: newId('P'), type: ch.punchType, at: ch.correctedAt, source: 'correction', recordedAt: nowIso(), recordedBy: u.name, correctionId: c.id });
              }
              return { ...t, punches, status: t.status === 'open' ? 'pending_approval' : t.status };
            });
          }
          set((s) => ({ corrections: s.corrections.map((x) => (x.id === id ? { ...x, status: decision, reviewer: u.name, reviewedAt: nowIso(), reviewerNote: note.trim() } : x)) }));
          log({
            facilityId: tc.facilityId,
            entityType: 'correction',
            entityId: id,
            action: decision === 'approved' ? 'Approved correction' : 'Rejected correction',
            detail: `${c.changes.map((ch) => ch.punchType).join(', ')} on ${tc.workDate}. ${note}`.trim(),
            before: c.changes.map((ch) => ch.originalAt ?? 'none').join(', '),
            after: c.changes.map((ch) => ch.correctedAt).join(', '),
          });
          return { ok: true };
        },
        managerCorrect: ({ timecardId, reason, changes }) => {
          const d = deny('time.correct');
          if (d) return d;
          const r = get().requestCorrection({ timecardId, reason, changes });
          if (!r.ok) return { ok: false, error: r.error };
          return get().reviewCorrection(r.value!, 'approved', 'Manager-entered correction.');
        },
        approveTimecards: (ids) => {
          const d = deny('time.approve');
          if (d) return d;
          const s = get();
          const nowMs = demoNowMs(s);
          const skipped: { id: string; reason: string }[] = [];
          const ok: string[] = [];
          for (const id of ids) {
            const tc = s.timecards.find((t) => t.id === id);
            if (!tc) continue;
            const calc = calcTimecard(tc, { timeZone: facility(tc.facilityId).timeZone, nowMs, shift: s.shifts.find((x) => x.id === tc.shiftId), pendingCorrections: s.corrections });
            const r = canApprove(tc, calc);
            if (r.ok) ok.push(id);
            else skipped.push({ id, reason: r.reason! });
          }
          set((st) => ({ timecards: st.timecards.map((t) => (ok.includes(t.id) ? { ...t, status: 'approved', approvedBy: user().name, approvedAt: nowIso() } : t)) }));
          if (ok.length) log({ facilityId: s.timecards.find((t) => t.id === ok[0])?.facilityId ?? null, entityType: 'timecard', entityId: ok.join(','), action: 'Approved timecards', detail: `${ok.length} timecard(s) approved.` });
          return { ok: ok.length > 0 || ids.length === 0, value: { approved: ok.length, skipped }, error: ok.length ? undefined : skipped[0]?.reason };
        },
        reopenTimecard: (id, reason) => {
          const d = deny('time.approve');
          if (d) return d;
          if (!reason.trim()) return { ok: false, error: 'A reason is required to reopen.' };
          const tc = get().timecards.find((t) => t.id === id);
          if (!tc || tc.status !== 'approved') return { ok: false, error: 'Only approved timecards can be reopened.' };
          patchTimecard(id, (t) => ({ ...t, status: 'pending_approval', approvedAt: undefined, approvedBy: undefined, reviewNotes: [...(t.reviewNotes ?? []), `Reopened: ${reason}`] }));
          log({ facilityId: tc.facilityId, entityType: 'timecard', entityId: id, action: 'Reopened timecard', detail: reason });
          return { ok: true };
        },
        markBreakReviewed: (id) => {
          if (deny('time.approve')) return;
          patchTimecard(id, (t) => ({ ...t, breakReviewed: true }));
          const tc = get().timecards.find((t) => t.id === id);
          log({ facilityId: tc?.facilityId ?? null, entityType: 'timecard', entityId: id, action: 'Break reviewed', detail: 'Break exception reviewed by manager.' });
        },
        requestTimeOff: (input) => {
          const u = user();
          if (u.role === 'employee' && u.employeeId !== input.employeeId) return { ok: false, error: 'You can only request your own time off.' };
          if (!input.startDate || !input.endDate || input.endDate < input.startDate) return { ok: false, error: 'Choose a valid date range.' };
          if (input.hoursPerDay <= 0 || input.hoursPerDay > 12) return { ok: false, error: 'Hours per day must be between 0 and 12.' };
          const e = employee(input.employeeId)!;
          const id = newId('TO');
          set((s) => ({ timeOff: [{ id, facilityId: e.primaryFacilityId, status: 'pending', requestedAt: nowIso(), ...input }, ...s.timeOff] }));
          log({ facilityId: e.primaryFacilityId, entityType: 'time_off', entityId: id, action: 'Requested time off', detail: `${fullName(e)}: ${input.category} ${input.startDate}${input.endDate !== input.startDate ? ' – ' + input.endDate : ''}` });
          return { ok: true, value: id };
        },
        decideTimeOff: (id, decision) => {
          const d = deny('time_off.approve');
          if (d) return d;
          const req = get().timeOff.find((t) => t.id === id);
          if (!req || req.status !== 'pending') return { ok: false, error: 'Request is not pending.' };
          set((s) => ({ timeOff: s.timeOff.map((t) => (t.id === id ? { ...t, status: decision, decidedBy: user().name, decidedAt: nowIso() } : t)) }));
          if (decision === 'approved') {
            const paid = req.category !== 'Unpaid';
            const entries = dateRange(req.startDate, req.endDate).map((date) => ({ id: newId('NW'), employeeId: req.employeeId, facilityId: req.facilityId, date, hours: req.hoursPerDay, category: req.category, paid, source: 'time_off_request' as const, sourceId: id }));
            set((s) => ({ nonWorked: [...s.nonWorked, ...entries] }));
          }
          const e = employee(req.employeeId);
          log({ facilityId: req.facilityId, entityType: 'time_off', entityId: id, action: decision === 'approved' ? 'Approved time off' : 'Denied time off', detail: `${e ? fullName(e) : ''}: ${req.category} ${req.startDate}–${req.endDate}` });
          return { ok: true };
        },

        /* ------------------------------ PBJ ------------------------------ */
        computePbj: (facilityId, quarterId) => {
          const s = get();
          const prep = prepFor(facilityId, quarterId);
          const resolutions = prep?.resolutions ?? [];
          const f = facility(facilityId);
          const deps = [f, s.employees, s.timecards, s.shifts, s.mappings, s.corrections, resolutions, s.pbjRules, s.demoNowIso];
          const key = `${facilityId}:${quarterId}`;
          const cached = pbjCache.get(key);
          if (cached && cached.deps.every((d, i) => d === deps[i])) return cached.result;
          const result = runPbjEngine({
            facility: f,
            quarter: quarterFromId(quarterId),
            today: localDateOf(s.demoNowIso, f.timeZone),
            nowMs: demoNowMs(s),
            employees: s.employees,
            timecards: s.timecards,
            shifts: s.shifts,
            mappings: s.mappings,
            corrections: s.corrections,
            resolutions,
            rules: s.pbjRules,
          });
          pbjCache.set(key, { deps, result });
          return result;
        },
        saveMapping: (input) => {
          const d = deny('pbj.map');
          if (d) return d;
          if (!input.sourceJobCode) return { ok: false, error: 'Source job code is required.' };
          if (input.reportability !== 'not_reported' && !input.pbjJobTitleCode) return { ok: false, error: 'Choose a CMS job title code, or mark the job as not reported.' };
          if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) return { ok: false, error: 'Effective end must be after the start.' };
          const others = get().mappings.filter((m) => m.id !== input.id && m.sourceJobCode === input.sourceJobCode && m.facilityId === input.facilityId);
          const clash = others.find((m) => m.effectiveFrom <= (input.effectiveTo ?? '9999-12-31') && (m.effectiveTo ?? '9999-12-31') >= input.effectiveFrom);
          if (clash) return { ok: false, error: `Overlaps an existing mapping effective ${clash.effectiveFrom}${clash.effectiveTo ? ' – ' + clash.effectiveTo : ' onward'}. End-date it first.` };
          const m: PbjJobMapping = { ...input, id: input.id ?? newId('MAP'), pbjJobTitleCode: input.reportability === 'not_reported' ? null : input.pbjJobTitleCode, updatedBy: user().name, updatedAt: nowIso() };
          set((s) => ({ mappings: input.id ? s.mappings.map((x) => (x.id === input.id ? m : x)) : [...s.mappings, m] }));
          log({ facilityId: input.facilityId, entityType: 'pbj_mapping', entityId: m.id, action: input.id ? 'Updated PBJ mapping' : 'Created PBJ mapping', detail: `${m.sourceJobCode} → ${m.pbjJobTitleCode ?? 'not reported'} (${m.reportability}) effective ${m.effectiveFrom}${m.effectiveTo ? ' – ' + m.effectiveTo : ''}` });
          return { ok: true };
        },
        runPbjValidation: (facilityId, quarterId) => {
          const d = deny('pbj.validate');
          if (d) return d;
          const prep = ensurePrep(facilityId, quarterId);
          const result = get().computePbj(facilityId, quarterId);
          patchPrep(prep.id, (p) => ({
            ...p,
            validationRuns: [
              ...p.validationRuns,
              { id: newId('RUN'), runAt: nowIso(), runBy: user().name, rulesetVersion: result.rulesetVersion, sourceFingerprint: result.fingerprint, errorCount: result.counts.errors, warningCount: result.counts.warnings, indicatorCount: result.counts.indicators, totalEligibleHours: result.totals.eligibleHours },
            ],
          }));
          log({ facilityId, entityType: 'pbj', entityId: prep.id, action: 'Ran PBJ checks', detail: `${result.counts.errors} errors, ${result.counts.warnings} warnings, ${result.counts.indicators} indicators (${result.rulesetVersion}).` });
          return { ok: true, value: result };
        },
        resolvePbjIssues: (facilityId, quarterId, issueKeys, decision, note) => {
          const d = deny('pbj.validate');
          if (d) return d;
          if (!note.trim()) return { ok: false, error: 'Enter a review note.' };
          const prep = ensurePrep(facilityId, quarterId);
          const res = issueKeys.map((issueKey) => ({ issueKey, decision, note: note.trim(), by: user().name, at: nowIso() }));
          patchPrep(prep.id, (p) => ({ ...p, resolutions: [...p.resolutions.filter((r) => !issueKeys.includes(r.issueKey)), ...res] }));
          log({ facilityId, entityType: 'pbj', entityId: prep.id, action: 'Reviewed PBJ warning', detail: `${issueKeys.length} item(s): ${decision.replace('_', ' ')} — ${note}` });
          return { ok: true };
        },
        clearPbjResolution: (facilityId, quarterId, issueKey) => {
          if (deny('pbj.validate')) return;
          const prep = prepFor(facilityId, quarterId);
          if (!prep) return;
          patchPrep(prep.id, (p) => ({ ...p, resolutions: p.resolutions.filter((r) => r.issueKey !== issueKey) }));
          log({ facilityId, entityType: 'pbj', entityId: prep.id, action: 'Cleared PBJ review decision', detail: issueKey });
        },
        approvePbjPackage: (facilityId, quarterId, note) => {
          const d = deny('pbj.approve');
          if (d) return d;
          const prep = prepFor(facilityId, quarterId);
          const result = get().computePbj(facilityId, quarterId);
          const check = canApprovePackage(result, prep);
          if (!check.ok || !prep) return { ok: false, error: check.reason };
          patchPrep(prep.id, (p) => ({ ...p, status: 'approved', approval: { by: user().name, at: nowIso(), sourceFingerprint: result.fingerprint, note } }));
          log({ facilityId, entityType: 'pbj', entityId: prep.id, action: 'Approved PBJ package', detail: `v${prep.version} approved for export. Fingerprint ${result.fingerprint}.` });
          return { ok: true };
        },
        generatePbjExport: (facilityId, quarterId) => {
          const d = deny('pbj.export');
          if (d) return d;
          const prep = prepFor(facilityId, quarterId);
          const result = get().computePbj(facilityId, quarterId);
          const status = preparationStatus(result, prep);
          if (!prep?.approval || prep.approval.sourceFingerprint !== result.fingerprint) return { ok: false, error: status.stale ? 'The approved package is stale. Rerun checks and approve again.' : 'Approve the package before generating an export.' };
          const out = demoXmlExportService.buildExport({ facility: facility(facilityId), quarter: quarterFromId(quarterId), result, employees: get().employees, generatedAt: nowIso() });
          patchPrep(prep.id, (p) => ({
            ...p,
            status: 'exported',
            exports: [...p.exports, { id: newId('EXP'), generatedAt: nowIso(), generatedBy: user().name, fileName: out.fileName, format: 'demo-xml', sourceFingerprint: result.fingerprint, workerCount: out.workerCount, dayRowCount: out.dayRowCount, totalHours: out.totalHours }],
          }));
          log({ facilityId, entityType: 'pbj', entityId: prep.id, action: 'Generated demo export', detail: `${out.fileName} — ${out.totalHours.toFixed(2)} hours, ${out.workerCount} workers. Not validated for CMS submission.` });
          return { ok: true, value: { fileName: out.fileName, content: out.content, mimeType: out.mimeType } };
        },
        recordPbjSubmission: (facilityId, quarterId, input) => {
          const d = deny('pbj.export');
          if (d) return d;
          const prep = prepFor(facilityId, quarterId);
          const exp = prep?.exports.at(-1);
          if (!prep || !exp) return { ok: false, error: 'Generate an export snapshot first.' };
          const sub: PbjSubmissionRecord = { id: newId('SUB'), recordedAt: nowIso(), recordedBy: user().name, method: 'manual_iqies_upload', exportSnapshotId: exp.id, ...input };
          patchPrep(prep.id, (p) => ({ ...p, status: 'submission_recorded', submissions: [...p.submissions, sub] }));
          log({ facilityId, entityType: 'pbj', entityId: prep.id, action: 'Recorded manual submission', detail: `User-entered record for ${exp.fileName}. Poise did not submit to CMS.` });
          return { ok: true };
        },
        newPbjVersion: (facilityId, quarterId) => {
          const d = deny('pbj.validate');
          if (d) return d;
          const prev = prepFor(facilityId, quarterId);
          const next = {
            id: newId('PBJ'),
            facilityId,
            quarterId,
            version: (prev?.version ?? 0) + 1,
            status: 'in_preparation' as const,
            createdAt: nowIso(),
            createdBy: user().name,
            validationRuns: [],
            resolutions: prev?.resolutions ?? [],
            exports: [],
            submissions: [],
            notes: prev ? `Created from v${prev.version}; review decisions carried forward.` : undefined,
          };
          set((s) => ({ preparations: [...s.preparations.map((p) => (p.id === prev?.id ? { ...p, status: 'superseded' as const } : p)), next] }));
          log({ facilityId, entityType: 'pbj', entityId: next.id, action: 'Created preparation version', detail: `v${next.version} for ${quarterId}.` });
          return { ok: true };
        },
        importAgencyHours: (facilityId, fileName, rows, columnMapping) => {
          const d = deny('pbj.import');
          if (d) return d;
          const valid = rows.filter((r) => r.errors.length === 0);
          if (!valid.length) return { ok: false, error: 'No valid rows to import.' };
          const f = facility(facilityId);
          const batchId = newId('IMP');
          const employees = [...get().employees];
          const created: Employee[] = [];
          const timecards: Timecard[] = [];
          for (const r of valid) {
            let e = employees.find((x) => x.externalRef === r.externalRef && x.workerType !== 'employee');
            if (!e) {
              const nums = employees.map((x) => Number(x.id.replace('E-', ''))).filter((n) => !Number.isNaN(n));
              const role = ROLE_BY_ID[r.roleId!];
              e = {
                id: `E-${Math.max(10200, ...nums) + 1}`,
                pbjEmployeeId: 'W' + Math.random().toString(36).slice(2, 9).toUpperCase().replace(/[01OIL]/g, '8'),
                firstName: r.firstName,
                lastName: r.lastName,
                email: '',
                phone: '',
                status: 'active',
                workerType: 'agency',
                agencyName: r.agencyName || undefined,
                payType: 'contract',
                employmentType: 'prn',
                primaryFacilityId: facilityId,
                additionalFacilityIds: [],
                departmentId: role.departmentId,
                roleId: role.id,
                managerId: null,
                hireDate: r.workDate,
                availability: [0, 1, 2, 3, 4, 5, 6].map(() => 'available'),
                credentials: [],
                createdAt: nowIso(),
                externalRef: r.externalRef,
                createdBySource: 'import',
              };
              employees.push(e);
              created.push(e);
            }
            const inMs = zonedToUtcMs(r.workDate, r.timeIn, f.timeZone);
            let outMs = zonedToUtcMs(r.timeOut <= r.timeIn ? addDays(r.workDate, 1) : r.workDate, r.timeOut, f.timeZone);
            if (outMs <= inMs) outMs += 86400000;
            const mk = (type: PunchType, ms: number): Punch => ({ id: newId('P'), type, at: new Date(ms).toISOString(), source: 'import', recordedAt: nowIso(), recordedBy: `Import ${batchId}` });
            const punches: Punch[] = [mk('in', inMs)];
            if (r.mealMinutes > 0) {
              const mid = inMs + Math.floor((outMs - inMs) / 2);
              punches.push(mk('break_start', mid), mk('break_end', mid + r.mealMinutes * 60000));
            }
            punches.push(mk('out', outMs));
            timecards.push({ id: newId('TC'), employeeId: e.id, facilityId, departmentId: ROLE_BY_ID[r.roleId!].departmentId, roleId: r.roleId!, shiftId: null, workDate: r.workDate, punches, status: 'pending_approval', source: 'import', importBatchId: batchId, sourcePayCode: r.payCode });
          }
          set((s) => ({
            employees,
            timecards: [...s.timecards, ...timecards],
            importBatches: [
              { id: batchId, facilityId, fileName, importedAt: nowIso(), importedBy: user().name, rowCount: rows.length, acceptedCount: valid.length, rejectedCount: rows.length - valid.length, columnMapping, kind: 'agency_hours' },
              ...s.importBatches,
            ],
          }));
          log({ facilityId, entityType: 'pbj', entityId: batchId, action: 'Imported agency hours', detail: `${valid.length} of ${rows.length} rows from ${fileName}; ${created.length} new agency worker(s). Records await timecard approval.` });
          return { ok: true, value: { accepted: valid.length, created: created.length } };
        },

        /* ------------------------------ settings ------------------------------ */
        updateFacility: (id, patch) => {
          const d = deny('settings.edit');
          if (d) return d;
          const before = facility(id);
          set((s) => ({ facilities: s.facilities.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
          log({ facilityId: id, entityType: 'facility', entityId: id, action: 'Updated facility settings', detail: Object.keys(patch).join(', '), before: JSON.stringify(Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof Facility]]))), after: JSON.stringify(patch) });
          return { ok: true };
        },
        updatePbjRules: (patch) => {
          if (deny('settings.edit')) return;
          set((s) => ({ pbjRules: { ...s.pbjRules, ...patch } }));
          log({ facilityId: null, entityType: 'pbj', entityId: 'rules', action: 'Updated PBJ demo rule settings', detail: JSON.stringify(patch) });
        },
      };
    },
    {
      name: 'poise-demo-state',
      version: SEED_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { toasts, ...rest } = s;
        return Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== 'function')) as Partial<PoiseState>;
      },
      migrate: () => ({ ...buildSeed(), ...initialSession() }) as unknown as PoiseState,
    },
  ),
);

/** Convenience: weekStart for demo "today" in a facility. */
export function currentWeekStart(s: Pick<PoiseState, 'demoNowIso' | 'facilities'>, facilityId?: string): ISODate {
  return weekStartOf(facilityToday(s, facilityId));
}
