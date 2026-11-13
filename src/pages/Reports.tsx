import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Callout, Card, CardHeader, EmptyState, Input, PageHeader, SearchInput, Select, TableWrap, Tabs } from '../components/ui';
import { DEPARTMENTS, DEPT_BY_ID } from '../domain/catalog';
import { downloadFile, toCsv } from '../domain/pbj/export';
import { shiftPaidMinutes } from '../domain/scheduling';
import { addDays, daysBetween, fiscalQuarterOf, fmtDate, weekStartOf } from '../domain/time';
import { employeeName, roleName, useEmployeesById, useFacilitiesById, useScopedEmployees, useScopedFacilityIds, useTimecardRows, useToday } from '../store/hooks';
import { usePoise } from '../store/store';

type Tab = 'hours' | 'schedule' | 'credentials' | 'headcount' | 'audit';

const h = (min: number) => (min / 60).toFixed(2);

function ReportCard({ title, subtitle, onCsv, controls, children }: { title: string; subtitle: string; onCsv: () => void; controls?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} actions={<Button size="sm" icon={Download} onClick={onCsv}>Download CSV</Button>} />
      {controls && <div className="flex flex-wrap items-end gap-2 border-b border-line px-4 py-3">{controls}</div>}
      {children}
    </Card>
  );
}

function HoursByDept() {
  const today = useToday();
  const q = fiscalQuarterOf(today);
  const [from, setFrom] = useState(q.start);
  const [to, setTo] = useState(today);
  const rows = useTimecardRows((tc) => tc.workDate >= from && tc.workDate <= to);
  const nonWorked = usePoise((s) => s.nonWorked);
  const ids = useScopedFacilityIds();
  const emps = useEmployeesById();
  const data = useMemo(
    () =>
      DEPARTMENTS.map((d) => {
        const r = rows.filter((x) => x.tc.departmentId === d.id);
        const nw = nonWorked.filter((n) => ids.includes(n.facilityId) && n.date >= from && n.date <= to && emps[n.employeeId]?.departmentId === d.id);
        return {
          dept: d.name,
          worked: r.reduce((s, x) => s + x.calc.workedMinutes, 0),
          approved: r.filter((x) => x.tc.status === 'approved').reduce((s, x) => s + x.calc.workedMinutes, 0),
          paidLeave: nw.filter((n) => n.paid).reduce((s, n) => s + n.hours * 60, 0),
          unpaid: nw.filter((n) => !n.paid).reduce((s, n) => s + n.hours * 60, 0),
          workers: new Set(r.map((x) => x.tc.employeeId)).size,
          timecards: r.length,
        };
      }).filter((d) => d.timecards || d.paidLeave || d.unpaid),
    [rows, nonWorked, ids, from, to, emps],
  );
  const csv = () => downloadFile(`poise-hours-by-department_${from}_${to}.csv`, toCsv([['department', 'worked_hours', 'approved_worked_hours', 'paid_leave_hours', 'unpaid_nonworked_hours', 'workers', 'timecards'], ...data.map((d) => [d.dept, h(d.worked), h(d.approved), h(d.paidLeave), h(d.unpaid), d.workers, d.timecards])]), 'text/csv');
  return (
    <ReportCard
      title="Hours by department"
      subtitle="Worked time from punches is kept separate from paid leave and other nonworked time. Scheduled hours are not included."
      onCsv={csv}
      controls={
        <>
          <label className="text-xs text-muted">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-auto" /></label>
          <label className="text-xs text-muted">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-auto" /></label>
        </>
      }
    >
      <TableWrap>
        <thead>
          <tr>
            {['Department', 'Worked hours', 'Approved worked', 'Paid leave (nonworked)', 'Unpaid nonworked', 'Workers', 'Timecards'].map((x, i) => (
              <th key={x} className={`th ${i ? 'text-right' : ''}`}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.dept}>
              <td className="td font-medium">{d.dept}</td>
              <td className="td text-right tabular">{h(d.worked)}</td>
              <td className="td text-right tabular">{h(d.approved)}</td>
              <td className="td text-right tabular">{h(d.paidLeave)}</td>
              <td className="td text-right tabular">{h(d.unpaid)}</td>
              <td className="td text-right tabular">{d.workers}</td>
              <td className="td text-right tabular">{d.timecards}</td>
            </tr>
          ))}
          <tr>
            <td className="td font-semibold">Total</td>
            {(['worked', 'approved', 'paidLeave', 'unpaid'] as const).map((k) => (
              <td key={k} className="td text-right font-semibold tabular">{h(data.reduce((s, d) => s + d[k], 0))}</td>
            ))}
            <td className="td" />
            <td className="td text-right font-semibold tabular">{data.reduce((s, d) => s + d.timecards, 0)}</td>
          </tr>
        </tbody>
      </TableWrap>
    </ReportCard>
  );
}

function ScheduleVsWorked() {
  const today = useToday();
  const [week, setWeek] = useState(weekStartOf(addDays(today, -7)));
  const end = addDays(week, 6);
  const shifts = usePoise((s) => s.shifts);
  const facs = useFacilitiesById();
  const ids = useScopedFacilityIds();
  const emps = useScopedEmployees({ includeArchived: true });
  const rows = useTimecardRows((tc) => tc.workDate >= week && tc.workDate <= end);
  const data = useMemo(
    () =>
      emps
        .map((e) => {
          const sch = shifts.filter((s) => s.employeeId === e.id && ids.includes(s.facilityId) && s.date >= week && s.date <= end);
          const tcs = rows.filter((r) => r.tc.employeeId === e.id);
          const scheduled = sch.reduce((s, x) => s + shiftPaidMinutes(x, facs), 0);
          const worked = tcs.reduce((s, r) => s + r.calc.workedMinutes, 0);
          return { e, scheduled, worked, shifts: sch.length, timecards: tcs.length, unscheduled: tcs.filter((r) => !r.tc.shiftId).length };
        })
        .filter((x) => x.scheduled || x.worked)
        .sort((a, b) => Math.abs(b.worked - b.scheduled) - Math.abs(a.worked - a.scheduled)),
    [emps, shifts, rows, ids, week, end, facs],
  );
  const csv = () => downloadFile(`poise-scheduled-vs-worked_${week}.csv`, toCsv([['employee_id', 'name', 'role', 'scheduled_paid_hours', 'worked_hours', 'variance_hours', 'shifts', 'timecards', 'unscheduled_timecards'], ...data.map((d) => [d.e.id, employeeName(d.e), roleName(d.e.roleId), h(d.scheduled), h(d.worked), h(d.worked - d.scheduled), d.shifts, d.timecards, d.unscheduled])]), 'text/csv');
  return (
    <ReportCard
      title="Scheduled vs. worked"
      subtitle={`Week of ${fmtDate(week, { year: true })} – ${fmtDate(end)}. Scheduled hours are paid hours on the schedule; worked hours come only from punches.`}
      onCsv={csv}
      controls={
        <div className="flex items-center gap-1">
          <Button size="sm" icon={ChevronLeft} onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week" />
          <span className="px-2 text-[13px] font-medium">{fmtDate(week)} – {fmtDate(end)}</span>
          <Button size="sm" icon={ChevronRight} onClick={() => setWeek(addDays(week, 7))} aria-label="Next week" />
        </div>
      }
    >
      {data.length === 0 ? (
        <EmptyState title="No scheduled or worked time this week" />
      ) : (
        <TableWrap maxHeight="560px">
          <thead>
            <tr>
              {['Employee', 'Role', 'Scheduled', 'Worked', 'Variance', 'Shifts', 'Timecards'].map((x, i) => (
                <th key={x} className={`th ${i > 1 ? 'text-right' : ''}`}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => {
              const v = d.worked - d.scheduled;
              return (
                <tr key={d.e.id}>
                  <td className="td font-medium">{employeeName(d.e)}</td>
                  <td className="td text-muted">{roleName(d.e.roleId)}</td>
                  <td className="td text-right tabular">{h(d.scheduled)}</td>
                  <td className="td text-right tabular">{h(d.worked)}</td>
                  <td className={`td text-right tabular ${Math.abs(v) > 60 ? 'font-semibold text-warn-700' : ''}`}>{v > 0 ? '+' : ''}{h(v)}</td>
                  <td className="td text-right tabular">{d.shifts}</td>
                  <td className="td text-right tabular">
                    {d.timecards}
                    {d.unscheduled > 0 && <Badge tone="warning" className="ml-1">{d.unscheduled} unscheduled</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </ReportCard>
  );
}

function Credentials() {
  const today = useToday();
  const emps = useScopedEmployees();
  const [window, setWindow] = useState('60');
  const data = useMemo(
    () =>
      emps
        .flatMap((e) => e.credentials.map((c) => ({ e, c, days: c.expiresOn ? daysBetween(today, c.expiresOn) : null })))
        .filter((x) => window === 'all' || x.c.verification !== 'verified' || (x.days !== null && x.days <= Number(window)))
        .sort((a, b) => (a.days ?? -9999) - (b.days ?? -9999)),
    [emps, today, window],
  );
  const csv = () => downloadFile(`poise-credentials_${today}.csv`, toCsv([['employee_id', 'name', 'role', 'credential', 'number', 'expires_on', 'days_left', 'verification'], ...data.map((d) => [d.e.id, employeeName(d.e), roleName(d.e.roleId), d.c.type, d.c.number, d.c.expiresOn, d.days, d.c.verification])]), 'text/csv');
  return (
    <ReportCard
      title="Credential expiration"
      subtitle="Verification status is recorded in Poise only — no primary-source checks are performed in the prototype."
      onCsv={csv}
      controls={
        <Select aria-label="Window" value={window} onChange={(e) => setWindow(e.target.value)} className="w-auto">
          <option value="30">Expired or within 30 days + unverified</option>
          <option value="60">Expired or within 60 days + unverified</option>
          <option value="all">All credentials</option>
        </Select>
      }
    >
      <TableWrap maxHeight="560px">
        <thead>
          <tr>
            {['Employee', 'Role', 'Credential', 'Expires', 'Days left', 'Verification'].map((x) => (
              <th key={x} className="th">{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.e.id + d.c.id}>
              <td className="td font-medium">{employeeName(d.e)}</td>
              <td className="td text-muted">{roleName(d.e.roleId)}</td>
              <td className="td">{d.c.type}</td>
              <td className="td tabular">{d.c.expiresOn ? fmtDate(d.c.expiresOn, { year: true }) : '—'}</td>
              <td className="td tabular">{d.days === null ? '—' : d.days < 0 ? <Badge tone="danger">Expired</Badge> : d.days <= 30 ? <Badge tone="warning">{d.days}</Badge> : d.days}</td>
              <td className="td">{d.c.verification === 'verified' ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">{d.c.verification.replace('_', ' ')}</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </ReportCard>
  );
}

function Headcount() {
  const today = useToday();
  const q = fiscalQuarterOf(today);
  const emps = useScopedEmployees({ includeArchived: true, allDepartments: true });
  const facs = useFacilitiesById();
  const ids = useScopedFacilityIds();
  const data = useMemo(
    () =>
      ids.map((fid) => {
        const list = emps.filter((e) => e.primaryFacilityId === fid);
        const current = list.filter((e) => e.status === 'active' || e.status === 'offboarding' || e.status === 'leave');
        const hires = list.filter((e) => e.hireDate >= q.start && e.hireDate <= today && e.workerType === 'employee');
        const seps = list.filter((e) => e.separationDate && e.separationDate >= q.start && e.separationDate <= q.end && e.workerType === 'employee');
        return {
          facility: facs[fid],
          current: current.length,
          employees: current.filter((e) => e.workerType === 'employee').length,
          agency: current.filter((e) => e.workerType !== 'employee').length,
          onboarding: list.filter((e) => e.status === 'onboarding').length,
          offboarding: list.filter((e) => e.status === 'offboarding').length,
          archived: list.filter((e) => e.status === 'archived').length,
          hires: hires.length,
          seps: seps.length,
          byDept: DEPARTMENTS.map((d) => ({ d, n: current.filter((e) => e.departmentId === d.id).length })).filter((x) => x.n),
        };
      }),
    [ids, emps, facs, q.start, q.end, today],
  );
  const csv = () => downloadFile(`poise-headcount_${today}.csv`, toCsv([['facility', 'current', 'employees', 'agency_contract', 'onboarding', 'offboarding', 'archived', 'hires_qtd', 'separations_scheduled_in_quarter', 'turnover_pct_illustrative'], ...data.map((d) => [d.facility.name, d.current, d.employees, d.agency, d.onboarding, d.offboarding, d.archived, d.hires, d.seps, d.employees ? ((d.seps / d.employees) * 100).toFixed(1) : '0'])]), 'text/csv');
  return (
    <ReportCard title="Headcount & turnover snapshot" subtitle={`As of ${fmtDate(today, { year: true })}. Turnover = employee separations in ${q.id} ÷ current employee headcount (illustrative; not the CMS PBJ turnover measure).`} onCsv={csv}>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        {data.map((d) => (
          <div key={d.facility.id} className="rounded-md border border-line p-3">
            <p className="font-medium">{d.facility.name}</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              {[
                ['Current', d.current],
                ['Employees', d.employees],
                ['Agency/contract', d.agency],
                ['Onboarding', d.onboarding],
                ['Offboarding', d.offboarding],
                ['Archived', d.archived],
                [`Hires ${q.id}`, d.hires],
                [`Separations ${q.id}`, d.seps],
                ['Turnover', d.employees ? `${((d.seps / d.employees) * 100).toFixed(1)}%` : '—'],
              ].map(([l, v]) => (
                <div key={l as string} className="rounded bg-canvas px-2 py-1.5">
                  <div className="font-semibold tabular">{v}</div>
                  <div className="text-[11px] text-muted">{l}</div>
                </div>
              ))}
            </div>
            <ul className="mt-3 space-y-1 text-[13px]">
              {d.byDept.map(({ d: dept, n }) => (
                <li key={dept.id} className="flex justify-between">
                  <span>{DEPT_BY_ID[dept.id].name}</span>
                  <span className="tabular text-muted">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </ReportCard>
  );
}

function AuditLog() {
  const audit = usePoise((s) => s.audit);
  const ids = useScopedFacilityIds();
  const facs = useFacilitiesById();
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const data = audit.filter((a) => (a.facilityId === null || ids.includes(a.facilityId)) && (type === 'all' || a.entityType === type) && (!q || `${a.actor} ${a.action} ${a.detail}`.toLowerCase().includes(q.toLowerCase())));
  const types = [...new Set(audit.map((a) => a.entityType))].sort();
  const csv = () => downloadFile('poise-audit-log.csv', toCsv([['at', 'actor', 'role', 'facility', 'entity_type', 'entity_id', 'action', 'detail', 'before', 'after'], ...data.map((a) => [a.at, a.actor, a.actorRole, a.facilityId ? facs[a.facilityId]?.name : 'All', a.entityType, a.entityId, a.action, a.detail, a.before, a.after])]), 'text/csv');
  return (
    <ReportCard
      title="Audit log"
      subtitle="Demo activity events recorded by every action in Poise (most recent first)."
      onCsv={csv}
      controls={
        <>
          <SearchInput value={q} onChange={setQ} placeholder="Search actor, action, detail" className="w-64" />
          <Select aria-label="Entity type" value={type} onChange={(e) => setType(e.target.value)} className="w-auto">
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </Select>
        </>
      }
    >
      <TableWrap maxHeight="600px">
        <thead>
          <tr>
            {['When', 'Actor', 'Facility', 'Action', 'Detail'].map((x) => (
              <th key={x} className="th">{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 300).map((a) => (
            <tr key={a.id}>
              <td className="td whitespace-nowrap text-muted tabular">{new Date(a.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}</td>
              <td className="td whitespace-nowrap">{a.actor}</td>
              <td className="td whitespace-nowrap text-muted">{a.facilityId ? facs[a.facilityId]?.shortName : 'All'}</td>
              <td className="td whitespace-nowrap font-medium">{a.action}</td>
              <td className="td text-muted">{a.detail}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </ReportCard>
  );
}

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'hours';
  return (
    <div>
      <PageHeader title="Reports" description="Operational reports calculated from the same demo records as every other screen. Filtered by the facility selector." />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
          tabs={[
            { value: 'hours', label: 'Hours by department' },
            { value: 'schedule', label: 'Scheduled vs. worked' },
            { value: 'credentials', label: 'Credentials' },
            { value: 'headcount', label: 'Headcount & turnover' },
            { value: 'audit', label: 'Audit log' },
          ]}
        />
      </div>
      {tab === 'hours' && <HoursByDept />}
      {tab === 'schedule' && <ScheduleVsWorked />}
      {tab === 'credentials' && <Credentials />}
      {tab === 'headcount' && <Headcount />}
      {tab === 'audit' && <AuditLog />}
      <Callout tone="neutral" className="mt-4">Custom report builder and scheduled report delivery are planned capabilities.</Callout>
    </div>
  );
}
