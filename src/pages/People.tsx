import clsx from 'clsx';
import { BadgeCheck, UserMinus, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DEPARTMENTS, DEPT_BY_ID } from '../domain/catalog';
import { workflowReadiness } from '../domain/lifecycle';
import { daysBetween, fmtDate } from '../domain/time';
import type { DepartmentId, EmployeeStatus, WorkerType } from '../domain/types';
import { EmployeeStatusBadge, WorkerTypeBadge } from '../components/status';
import { Badge, Button, Card, CardHeader, Checkbox, DeptDot, EmptyState, PageHeader, ProgressBar, SearchInput, Select, TableWrap, Tabs } from '../components/ui';
import { employeeName, roleName, useCan, useEmployeesById, useFacilitiesById, useScopedEmployees, useScopedFacilities, useToday } from '../store/hooks';
import { usePoise } from '../store/store';

type Tab = 'directory' | 'onboarding' | 'offboarding' | 'credentials';

export default function PeoplePage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'directory';
  const canCreate = useCan('people.create');
  const navigate = useNavigate();
  const all = useScopedEmployees({ includeArchived: true });
  const workflows = usePoise((s) => s.workflows);
  const ids = new Set(all.map((e) => e.id));
  const onb = workflows.filter((w) => w.status === 'in_progress' && w.kind === 'onboarding' && ids.has(w.employeeId)).length;
  const off = workflows.filter((w) => w.status === 'in_progress' && w.kind === 'offboarding' && ids.has(w.employeeId)).length;
  const setTab = (t: Tab) => setParams(t === 'directory' ? {} : { tab: t });

  return (
    <div>
      <PageHeader
        title="People"
        description="Employee directory, lifecycle queues and credentials across the facilities in your scope."
        actions={
          canCreate && (
            <Button variant="primary" icon={UserPlus} onClick={() => navigate('/people/new')}>
              Add employee
            </Button>
          )
        }
      />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'directory', label: 'Directory', count: all.filter((e) => e.status !== 'archived').length },
          { value: 'onboarding', label: 'Onboarding', count: onb },
          { value: 'offboarding', label: 'Offboarding', count: off },
          { value: 'credentials', label: 'Credentials' },
        ]}
      />
      <div className="mt-4">
        {tab === 'directory' && <Directory />}
        {tab === 'onboarding' && <LifecycleQueue kind="onboarding" />}
        {tab === 'offboarding' && <LifecycleQueue kind="offboarding" />}
        {tab === 'credentials' && <CredentialsList />}
      </div>
    </div>
  );
}

function Directory() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | EmployeeStatus>('all');
  const [dept, setDept] = useState<'all' | DepartmentId>('all');
  const [wt, setWt] = useState<'all' | WorkerType>('all');
  const [fac, setFac] = useState('all');
  const [archived, setArchived] = useState(false);
  const facilities = useScopedFacilities();
  const facs = useFacilitiesById();
  const emps = useEmployeesById();
  const employees = useScopedEmployees({ includeArchived: true });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return employees
      .filter((e) => (archived || status === 'archived' ? true : e.status !== 'archived'))
      .filter((e) => status === 'all' || e.status === status)
      .filter((e) => dept === 'all' || e.departmentId === dept)
      .filter((e) => wt === 'all' || e.workerType === wt)
      .filter((e) => fac === 'all' || e.primaryFacilityId === fac || e.additionalFacilityIds.includes(fac))
      .filter(
        (e) =>
          !needle ||
          [e.firstName, e.lastName, e.preferredName, e.id, e.pbjEmployeeId, e.email, roleName(e.roleId), e.agencyName].some((x) => x?.toLowerCase().includes(needle)),
      )
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
  }, [employees, q, status, dept, wt, fac, archived]);

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-2 border-b border-line p-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, ID, role, agency…" className="w-full sm:w-72" label="Search employees" />
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-auto">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="onboarding">Onboarding</option>
          <option value="offboarding">Offboarding</option>
          <option value="leave">On leave</option>
          <option value="archived">Archived</option>
        </Select>
        <Select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value as typeof dept)} className="w-auto">
          <option value="all">All departments</option>
          {DEPARTMENTS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Worker type" value={wt} onChange={(e) => setWt(e.target.value as typeof wt)} className="w-auto">
          <option value="all">All worker types</option>
          <option value="employee">Employees</option>
          <option value="agency">Agency</option>
          <option value="contract">Contract</option>
        </Select>
        {facilities.length > 1 && (
          <Select aria-label="Facility" value={fac} onChange={(e) => setFac(e.target.value)} className="w-auto">
            <option value="all">All facilities in scope</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.shortName}
              </option>
            ))}
          </Select>
        )}
        <div className="flex h-8 items-center">
          <Checkbox checked={archived} onChange={setArchived} label="Include archived" />
        </div>
        <span className="ml-auto self-center text-xs text-muted">{rows.length} people</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No people match these filters" body="Try clearing the search or filters." />
      ) : (
        <TableWrap maxHeight="68vh">
          <thead>
            <tr>
              <th className="th">ID</th>
              <th className="th">Name</th>
              <th className="th">Role</th>
              <th className="th">Department</th>
              <th className="th">Facility</th>
              <th className="th">Type</th>
              <th className="th">Status</th>
              <th className="th">Hire date</th>
              <th className="th">Manager</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr
                key={e.id}
                className={clsx('cursor-pointer hover:bg-brand-50/40', e.status === 'archived' && 'text-muted')}
                onClick={() => navigate(`/people/${e.id}`)}
              >
                <td className="td font-mono text-xs text-muted tabular">{e.id}</td>
                <td className="td">
                  <Link to={`/people/${e.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline" onClick={(ev) => ev.stopPropagation()}>
                    {e.lastName}, {e.preferredName ?? e.firstName}
                  </Link>
                </td>
                <td className="td whitespace-nowrap">{roleName(e.roleId)}</td>
                <td className="td whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <DeptDot color={DEPT_BY_ID[e.departmentId].color} />
                    {DEPT_BY_ID[e.departmentId].shortName}
                  </span>
                </td>
                <td className="td whitespace-nowrap">
                  {facs[e.primaryFacilityId]?.shortName}
                  {e.additionalFacilityIds.length > 0 && <span className="text-xs text-muted"> +{e.additionalFacilityIds.map((f) => facs[f]?.shortName).join(', ')}</span>}
                </td>
                <td className="td">
                  <WorkerTypeBadge type={e.workerType} />
                </td>
                <td className="td">
                  <EmployeeStatusBadge status={e.status} />
                </td>
                <td className="td whitespace-nowrap tabular">{fmtDate(e.hireDate, { year: true })}</td>
                <td className="td whitespace-nowrap text-muted">{e.managerId ? employeeName(emps[e.managerId]) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Card>
  );
}

function LifecycleQueue({ kind }: { kind: 'onboarding' | 'offboarding' }) {
  const workflows = usePoise((s) => s.workflows);
  const shifts = usePoise((s) => s.shifts);
  const timecards = usePoise((s) => s.timecards);
  const emps = useEmployeesById();
  const scoped = useScopedEmployees({ includeArchived: true });
  const facs = useFacilitiesById();
  const today = useToday();
  const ids = new Set(scoped.map((e) => e.id));
  const list = workflows.filter((w) => w.kind === kind && ids.has(w.employeeId)).sort((a, b) => (a.status === b.status ? a.effectiveDate.localeCompare(b.effectiveDate) : a.status === 'in_progress' ? -1 : 1));
  const active = list.filter((w) => w.status === 'in_progress');
  const recent = list.filter((w) => w.status === 'completed').slice(0, 5);

  if (!active.length && !recent.length)
    return (
      <Card>
        <EmptyState icon={kind === 'onboarding' ? UserPlus : UserMinus} title={`No ${kind} workflows`} body={kind === 'onboarding' ? 'Add an employee to start an onboarding checklist.' : 'Start offboarding from an employee profile.'} />
      </Card>
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={kind === 'onboarding' ? 'Onboarding in progress' : 'Offboarding in progress'}
          subtitle={kind === 'onboarding' ? 'First-shift readiness is blocked until every required task is done.' : 'Review future shifts, final timecards and handoffs before archiving.'}
        />
        {active.length === 0 ? (
          <EmptyState title={`No ${kind} in progress`} />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th className="th">Employee</th>
                <th className="th">Facility</th>
                <th className="th">{kind === 'onboarding' ? 'First shift' : 'Separation'}</th>
                <th className="th">Progress</th>
                <th className="th">{kind === 'onboarding' ? 'Readiness' : 'Impact'}</th>
                <th className="th">Next due</th>
              </tr>
            </thead>
            <tbody>
              {active.map((wf) => {
                const e = emps[wf.employeeId];
                const r = workflowReadiness(wf, today);
                const nextDue = wf.tasks.filter((t) => t.status !== 'done' && t.status !== 'waived').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
                const future = shifts.filter((s) => s.employeeId === wf.employeeId && s.date > wf.effectiveDate).length;
                const openTc = timecards.filter((t) => t.employeeId === wf.employeeId && t.status !== 'approved').length;
                return (
                  <tr key={wf.id} className="hover:bg-canvas">
                    <td className="td">
                      <Link to={`/people/${wf.employeeId}?tab=lifecycle`} className="font-medium text-ink hover:text-brand-700 hover:underline">
                        {employeeName(e)}
                      </Link>
                      <div className="text-xs text-muted">{roleName(e.roleId)}</div>
                    </td>
                    <td className="td whitespace-nowrap">{facs[e.primaryFacilityId]?.shortName}</td>
                    <td className="td whitespace-nowrap tabular">
                      {fmtDate(wf.effectiveDate, { weekday: true })}
                      <div className="text-xs text-muted">{daysBetween(today, wf.effectiveDate) >= 0 ? `in ${daysBetween(today, wf.effectiveDate)} days` : `${-daysBetween(today, wf.effectiveDate)} days ago`}</div>
                    </td>
                    <td className="td min-w-36">
                      <div className="mb-1 text-xs text-muted tabular">
                        {r.done}/{r.total} tasks
                      </div>
                      <ProgressBar value={r.pct} label="Progress" />
                    </td>
                    <td className="td">
                      {kind === 'onboarding' ? (
                        r.ready ? (
                          <Badge tone="success">First-shift ready</Badge>
                        ) : (
                          <div>
                            <Badge tone="warning">{r.blockers.length} blocker{r.blockers.length === 1 ? '' : 's'}</Badge>
                            <div className="mt-1 max-w-64 text-xs text-muted">{r.blockers.slice(0, 3).map((b) => b.task.title).join(' · ')}</div>
                          </div>
                        )
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {future > 0 ? <Badge tone="warning">{future} shift{future === 1 ? '' : 's'} after separation</Badge> : <Badge tone="success">No future shifts</Badge>}
                          {openTc > 0 && <Badge tone="info">{openTc} timecard{openTc === 1 ? '' : 's'} not approved</Badge>}
                        </div>
                      )}
                    </td>
                    <td className="td whitespace-nowrap">
                      {nextDue ? (
                        <>
                          <span className={clsx('tabular', nextDue.dueDate < today && 'font-medium text-danger-700')}>{fmtDate(nextDue.dueDate)}</span>
                          <div className="max-w-56 truncate text-xs text-muted">{nextDue.title}</div>
                        </>
                      ) : (
                        <span className="text-muted">All tasks done</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
      {recent.length > 0 && (
        <Card>
          <CardHeader title="Recently completed" />
          <ul className="divide-y divide-line">
            {recent.map((wf) => (
              <li key={wf.id} className="flex items-center justify-between px-4 py-2 text-[13px]">
                <Link to={`/people/${wf.employeeId}?tab=lifecycle`} className="link">
                  {employeeName(emps[wf.employeeId])}
                </Link>
                <span className="text-muted">Completed {wf.completedAt ? fmtDate(wf.completedAt.slice(0, 10), { year: true }) : ''}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function CredentialsList() {
  const employees = useScopedEmployees();
  const today = useToday();
  const [filter, setFilter] = useState<'attention' | 'all'>('attention');
  const rows = employees
    .flatMap((e) =>
      e.credentials.map((c) => {
        const daysLeft = c.expiresOn ? daysBetween(today, c.expiresOn) : null;
        const state = c.verification !== 'verified' ? 'unverified' : daysLeft !== null && daysLeft < 0 ? 'expired' : daysLeft !== null && daysLeft <= 30 ? 'expiring' : 'current';
        return { e, c, daysLeft, state };
      }),
    )
    .filter((r) => filter === 'all' || r.state !== 'current')
    .sort((a, b) => (a.daysLeft ?? -9999) - (b.daysLeft ?? -9999));
  const tone = { expired: 'danger', expiring: 'warning', unverified: 'info', current: 'success' } as const;
  const label = (r: (typeof rows)[number]) =>
    r.state === 'expired' ? `Expired ${r.c.expiresOn ? fmtDate(r.c.expiresOn) : ''}` : r.state === 'expiring' ? `Expires in ${r.daysLeft} days` : r.state === 'unverified' ? (r.c.verification === 'pending' ? 'Verification pending' : 'Not verified') : 'Current';
  return (
    <Card>
      <CardHeader
        title="Credentials"
        subtitle="Expired, expiring within 30 days, or unverified. Expired or unverified credentials block scheduling for roles that require them. Verification in the prototype is a placeholder — no primary-source checks are performed."
        actions={
          <Select aria-label="Credential filter" value={filter} onChange={(e) => setFilter(e.target.value as 'attention' | 'all')} className="w-auto">
            <option value="attention">Needs attention</option>
            <option value="all">All credentials</option>
          </Select>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={BadgeCheck} title="No credentials need attention" />
      ) : (
        <TableWrap maxHeight="65vh">
          <thead>
            <tr>
              <th className="th">Employee</th>
              <th className="th">Role</th>
              <th className="th">Credential</th>
              <th className="th">Number</th>
              <th className="th">Expires</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.e.id + r.c.id} className="hover:bg-canvas">
                <td className="td">
                  <Link to={`/people/${r.e.id}?tab=credentials`} className="font-medium text-ink hover:text-brand-700 hover:underline">
                    {employeeName(r.e)}
                  </Link>
                  {r.e.status === 'onboarding' && <span className="ml-1.5 text-xs text-muted">(onboarding)</span>}
                </td>
                <td className="td whitespace-nowrap">{roleName(r.e.roleId)}</td>
                <td className="td whitespace-nowrap">{r.c.type}</td>
                <td className="td font-mono text-xs text-muted">{r.c.number ?? '—'}</td>
                <td className="td whitespace-nowrap tabular">{r.c.expiresOn ? fmtDate(r.c.expiresOn, { year: true }) : '—'}</td>
                <td className="td">
                  <Badge tone={tone[r.state as keyof typeof tone]}>{label(r)}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Card>
  );
}
