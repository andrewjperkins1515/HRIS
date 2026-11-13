import { ArrowLeft, ListChecks, UserPlus } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DEPARTMENTS, ROLE_BY_ID, ROLES } from '../domain/catalog';
import { ONBOARDING_TEMPLATE } from '../domain/lifecycle';
import { ROLE_LABEL } from '../domain/permissions';
import { addDays, fmtDate } from '../domain/time';
import type { Employee } from '../domain/types';
import { Button, Callout, Card, CardHeader, Checkbox, Field, Input, PageHeader, Select } from '../components/ui';
import { employeeName, useScopedFacilities, useToday } from '../store/hooks';
import { usePoise } from '../store/store';
import { useRun } from '../store/useRun';

interface FormState {
  firstName: string;
  lastName: string;
  preferredName: string;
  email: string;
  phone: string;
  workerType: Employee['workerType'];
  agencyName: string;
  employmentType: Employee['employmentType'];
  primaryFacilityId: string;
  additionalFacilityIds: string[];
  roleId: string;
  managerId: string;
  hireDate: string;
  firstShiftDate: string;
}

export default function NewEmployeePage() {
  const facilities = useScopedFacilities();
  const allFacilities = usePoise((s) => s.facilities);
  const employees = usePoise((s) => s.employees);
  const createEmployee = usePoise((s) => s.createEmployee);
  const run = useRun();
  const navigate = useNavigate();
  const today = useToday();
  const [f, setF] = useState<FormState>({
    firstName: '',
    lastName: '',
    preferredName: '',
    email: '',
    phone: '',
    workerType: 'employee',
    agencyName: '',
    employmentType: 'full_time',
    primaryFacilityId: facilities[0]?.id ?? '',
    additionalFacilityIds: [],
    roleId: 'cna',
    managerId: '',
    hireDate: today,
    firstShiftDate: addDays(today, 7),
  });
  const [submitted, setSubmitted] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));

  const role = ROLE_BY_ID[f.roleId];
  const managers = useMemo(
    () =>
      employees
        .filter((e) => e.status === 'active' && e.workerType === 'employee' && (e.primaryFacilityId === f.primaryFacilityId || e.additionalFacilityIds.includes(f.primaryFacilityId)))
        .filter((e) => ['don', 'adon', 'administrator', 'dietary_mgr', 'evs_sup', 'maint_dir', 'act_dir', 'ss_dir', 'cook'].includes(e.roleId) || e.departmentId === role?.departmentId)
        .sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [employees, f.primaryFacilityId, role],
  );

  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!f.firstName.trim()) errors.firstName = 'First name is required.';
  if (!f.lastName.trim()) errors.lastName = 'Last name is required.';
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) errors.email = 'Enter a valid email address.';
  if (f.phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a 10-digit phone number.';
  if (f.workerType !== 'employee' && !f.agencyName.trim()) errors.agencyName = 'Agency or contracting company is required for agency/contract workers.';
  if (!f.primaryFacilityId) errors.primaryFacilityId = 'Choose a primary facility.';
  if (!f.hireDate) errors.hireDate = 'Hire date is required.';
  if (!f.firstShiftDate) errors.firstShiftDate = 'First shift date is required.';
  else if (f.firstShiftDate < f.hireDate) errors.firstShiftDate = 'First shift cannot be before the hire date.';
  const err = (k: keyof FormState) => (submitted ? errors[k] : undefined);

  const needsLicense = (role?.requiredCredentials ?? []).some((c) => c !== 'TB Screening');
  const checklist = ONBOARDING_TEMPLATE.filter((t) => t.key !== 'license' || needsLicense);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    const r = run(
      () =>
        createEmployee({
          firstName: f.firstName,
          lastName: f.lastName,
          preferredName: f.preferredName,
          email: f.email,
          phone: f.phone,
          workerType: f.workerType,
          agencyName: f.agencyName || undefined,
          employmentType: f.employmentType,
          primaryFacilityId: f.primaryFacilityId,
          additionalFacilityIds: f.additionalFacilityIds,
          roleId: f.roleId,
          managerId: f.managerId || null,
          hireDate: f.hireDate,
          firstShiftDate: f.firstShiftDate,
        }),
      { success: 'Employee created', successBody: `${f.firstName} ${f.lastName} added with status Onboarding. Checklist applied.` },
    );
    if (r.ok && r.value) navigate(`/people/${r.value}?tab=lifecycle`);
  };

  return (
    <div>
      <Link to="/people" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> People
      </Link>
      <PageHeader title="Add employee" description="Creates the employee record with status Onboarding and applies the onboarding checklist. No external systems are contacted." />
      <form onSubmit={submit} noValidate className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Person" subtitle="Fictional demo data only. Do not enter real personal information." />
            <div className="grid gap-4 p-4 sm:grid-cols-3">
              <Field label="First name" required error={err('firstName')} htmlFor="fn">
                <Input id="fn" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Last name" required error={err('lastName')} htmlFor="ln">
                <Input id="ln" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Preferred name" htmlFor="pn">
                <Input id="pn" value={f.preferredName} onChange={(e) => set('preferredName', e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Email" required error={err('email')} htmlFor="em" className="sm:col-span-2">
                <Input id="em" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="name@example.org" autoComplete="off" />
              </Field>
              <Field label="Phone" required error={err('phone')} htmlFor="ph">
                <Input id="ph" type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(555) 010-0000" autoComplete="off" />
              </Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="Assignment" subtitle="Facility, department, role and manager" />
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <Field label="Worker type" htmlFor="wt">
                <Select id="wt" value={f.workerType} onChange={(e) => set('workerType', e.target.value as Employee['workerType'])}>
                  <option value="employee">Employee</option>
                  <option value="agency">Agency worker</option>
                  <option value="contract">Contract worker</option>
                </Select>
              </Field>
              {f.workerType !== 'employee' ? (
                <Field label="Agency / contracting company" required error={err('agencyName')} htmlFor="ag">
                  <Input id="ag" value={f.agencyName} onChange={(e) => set('agencyName', e.target.value)} />
                </Field>
              ) : (
                <Field label="Employment type" htmlFor="et">
                  <Select id="et" value={f.employmentType} onChange={(e) => set('employmentType', e.target.value as Employee['employmentType'])}>
                    <option value="full_time">Full time</option>
                    <option value="part_time">Part time</option>
                    <option value="prn">PRN / per diem</option>
                  </Select>
                </Field>
              )}
              <Field label="Primary facility" required error={err('primaryFacilityId')} htmlFor="pf">
                <Select
                  id="pf"
                  value={f.primaryFacilityId}
                  onChange={(e) => setF((x) => ({ ...x, primaryFacilityId: e.target.value, managerId: '', additionalFacilityIds: x.additionalFacilityIds.filter((id) => id !== e.target.value) }))}
                >
                  {facilities.map((fac) => (
                    <option key={fac.id} value={fac.id}>
                      {fac.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <fieldset>
                <legend className="mb-1 block text-[13px] font-medium text-ink">Additional facilities</legend>
                <div className="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-1">
                  {allFacilities
                    .filter((fac) => fac.id !== f.primaryFacilityId)
                    .map((fac) => (
                      <Checkbox
                        key={fac.id}
                        checked={f.additionalFacilityIds.includes(fac.id)}
                        onChange={(v) => set('additionalFacilityIds', v ? [...f.additionalFacilityIds, fac.id] : f.additionalFacilityIds.filter((x) => x !== fac.id))}
                        label={fac.shortName}
                      />
                    ))}
                </div>
                <p className="mt-1 text-xs text-muted">Allows scheduling at other facilities.</p>
              </fieldset>
              <Field label="Job role" htmlFor="role" hint={role ? `Department: ${DEPARTMENTS.find((d) => d.id === role.departmentId)?.name} · Source job code ${role.sourceJobCode} · ${role.flsa === 'exempt' ? 'Exempt' : 'Non-exempt'}` : undefined}>
                <Select id="role" value={f.roleId} onChange={(e) => setF((x) => ({ ...x, roleId: e.target.value, managerId: '' }))}>
                  {DEPARTMENTS.map((d) => (
                    <optgroup key={d.id} label={d.name}>
                      {ROLES.filter((r) => r.departmentId === d.id).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label="Manager" htmlFor="mgr" hint="Leaders at the primary facility">
                <Select id="mgr" value={f.managerId} onChange={(e) => set('managerId', e.target.value)}>
                  <option value="">No manager selected</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {employeeName(m)} — {ROLE_BY_ID[m.roleId]?.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Hire date" required error={err('hireDate')} htmlFor="hd">
                <Input id="hd" type="date" value={f.hireDate} onChange={(e) => set('hireDate', e.target.value)} />
              </Field>
              <Field label="Planned first shift" required error={err('firstShiftDate')} htmlFor="fs" hint="Checklist due dates are calculated from this date.">
                <Input id="fs" type="date" value={f.firstShiftDate} onChange={(e) => set('firstShiftDate', e.target.value)} />
              </Field>
            </div>
          </Card>
          {submitted && Object.keys(errors).length > 0 && (
            <Callout tone="danger" title="Please fix the highlighted fields">
              {Object.keys(errors).length} field{Object.keys(errors).length === 1 ? '' : 's'} need attention.
            </Callout>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => navigate('/people')}>Cancel</Button>
            <Button type="submit" variant="primary" icon={UserPlus}>
              Create employee & start onboarding
            </Button>
          </div>
        </div>
        <Card className="h-fit">
          <CardHeader title="Onboarding checklist" subtitle={`${checklist.length} tasks will be applied`} actions={<ListChecks className="size-4 text-muted" aria-hidden />} />
          <ul className="divide-y divide-line">
            {checklist.map((t) => (
              <li key={t.key} className="px-4 py-2 text-[13px]">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{t.title}</span>
                  {t.blocksFirstShift && <span className="shrink-0 text-[11px] font-medium text-warn-700">Blocks first shift</span>}
                </div>
                <div className="text-xs text-muted">
                  {ROLE_LABEL[t.ownerRole]} · due {f.firstShiftDate ? fmtDate(addDays(f.firstShiftDate, t.offsetDays), { weekday: true }) : '—'}
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-line p-4">
            <p className="text-xs text-muted">
              Required credentials for this role: <span className="text-ink">{role?.requiredCredentials.join(', ') || 'none'}</span>. They are created as “not started” and must be verified before onboarding can be completed.
            </p>
          </div>
        </Card>
      </form>
    </div>
  );
}
