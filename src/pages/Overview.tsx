import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CalendarX2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { DEPT_BY_ID, SHIFT_TYPE_LABEL } from '../domain/catalog';
import { fmtDate, fmtLocalTime, quarterFromId } from '../domain/time';
import { Badge, Card, CardHeader, DeptDot, EmptyState, PageHeader, ProgressBar, Stat } from '../components/ui';
import { TONE_FOR_PBJ } from '../components/status';
import { employeeName, roleName, useCan, useFacilitiesById } from '../store/hooks';
import { useInsights } from '../store/insights';

function SectionLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">
      {children} <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

export default function OverviewPage() {
  const i = useInsights();
  const facs = useFacilitiesById();
  const canPbj = useCan('pbj.view');
  const scopeLabel = i.facilities.length > 1 ? `${i.facilities.length} facilities` : i.facilities[0]?.name;

  // Coverage by department & shift for today
  const byDeptToday = new Map<string, { required: number; assigned: number; open: number }>();
  for (const c of i.coverageToday.cells) {
    const k = c.departmentId;
    const v = byDeptToday.get(k) ?? { required: 0, assigned: 0, open: 0 };
    v.required += c.required;
    v.assigned += Math.min(c.assigned, c.required);
    v.open += c.open;
    byDeptToday.set(k, v);
  }
  const gapsToday = i.coverageToday.cells.filter((c) => c.assigned < c.required);

  return (
    <div>
      <PageHeader
        title="Overview"
        description={`Operations for ${scopeLabel} · ${fmtDate(i.today, { weekday: true, year: true })}. Every figure is calculated from the shared demo records and links to the screen behind it.`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Active workforce" value={i.headcount.active} sub={`${i.headcount.agency} agency/contract · ${i.headcount.onboarding} onboarding`} icon={Users} to="/people" />
        <Stat
          label="Coverage today"
          value={`${i.coverageToday.assigned}/${i.coverageToday.required}`}
          sub={i.coverageToday.gaps.length ? `${i.coverageToday.gaps.length} shift slot${i.coverageToday.gaps.length === 1 ? '' : 's'} below target` : 'All planning targets met'}
          tone={i.coverageToday.gaps.length ? 'warning' : 'success'}
          icon={CalendarClock}
          to="/scheduling"
        />
        <Stat label="Open shifts (14 days)" value={i.openShifts.length} sub={i.openByDept.map((d) => `${DEPT_BY_ID[d.departmentId].shortName} ${d.count}`).join(' · ') || 'None'} tone={i.openShifts.length ? 'warning' : 'success'} icon={CalendarX2} to="/scheduling?filter=open" />
        <Stat label="Overtime risk (week)" value={i.overtime.filter((o) => o.level === 'over').length} sub={`${i.overtime.filter((o) => o.level === 'approaching').length} approaching 40 hours`} tone={i.overtime.some((o) => o.level === 'over') ? 'warning' : 'neutral'} icon={Clock3} to="/scheduling?filter=conflicts" />
        <Stat label="Missing punches" value={i.missingPunches.length} sub={`${i.pendingCorrections} correction request${i.pendingCorrections === 1 ? '' : 's'} pending`} tone={i.missingPunches.length ? 'danger' : 'success'} icon={AlertTriangle} to="/time?view=exceptions" />
        <Stat label="Timecards to approve" value={i.pendingApprovals.length} sub={`${i.onClock.length} on the clock now`} tone={i.pendingApprovals.length ? 'info' : 'success'} icon={ClipboardCheck} to="/time?view=pending" />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {/* Coverage */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Do we have enough people scheduled?"
            subtitle="Assigned shifts vs. facility-defined planning targets. Targets are internal settings, not a regulatory determination."
            actions={<SectionLink to="/scheduling">Open schedule</SectionLink>}
          />
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Today by department</p>
              {byDeptToday.size === 0 ? (
                <p className="text-[13px] text-muted">No coverage targets for this scope.</p>
              ) : (
                <ul className="space-y-2.5">
                  {[...byDeptToday.entries()].map(([dept, v]) => {
                    const pct = v.required ? (v.assigned / v.required) * 100 : 100;
                    return (
                      <li key={dept}>
                        <div className="mb-1 flex items-center justify-between text-[13px]">
                          <span className="flex items-center gap-2">
                            <DeptDot color={DEPT_BY_ID[dept as keyof typeof DEPT_BY_ID].color} />
                            {DEPT_BY_ID[dept as keyof typeof DEPT_BY_ID].name}
                          </span>
                          <span className="tabular text-muted">
                            <span className={clsx('font-semibold', pct < 100 ? 'text-warn-700' : 'text-ink')}>{v.assigned}</span> / {v.required}
                          </span>
                        </div>
                        <ProgressBar value={pct} tone={pct < 100 ? 'warning' : 'brand'} label={`${dept} coverage`} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Below target · rest of this week</p>
              {i.coverageWeek.gaps.length === 0 ? (
                <p className="text-[13px] text-muted">No gaps against planning targets.</p>
              ) : (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {i.coverageWeek.gaps.slice(0, 7).map((g) => (
                    <li key={`${g.date}-${g.departmentId}-${g.shiftType}`} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[13px]">
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{fmtDate(g.date, { weekday: true })}</span> · {DEPT_BY_ID[g.departmentId].shortName} {SHIFT_TYPE_LABEL[g.shiftType].toLowerCase()}
                      </span>
                      <Badge tone="warning">
                        {g.assigned}/{g.required}
                        {g.open ? ` · ${g.open} open` : ''}
                      </Badge>
                    </li>
                  ))}
                  {i.coverageWeek.gaps.length > 7 && <li className="px-3 py-1.5 text-xs text-muted">+{i.coverageWeek.gaps.length - 7} more</li>}
                </ul>
              )}
              {gapsToday.length > 0 && <p className="mt-2 text-xs text-muted">Today: {gapsToday.length} department-shift slot(s) below target.</p>}
            </div>
          </div>
        </Card>

        {/* Open shifts */}
        <Card>
          <CardHeader title="Where are the open shifts?" subtitle="Unassigned shifts in the next 14 days" actions={<SectionLink to="/scheduling?filter=open">Fill shifts</SectionLink>} />
          {i.openShifts.length === 0 ? (
            <EmptyState icon={BadgeCheck} title="No open shifts" />
          ) : (
            <ul className="divide-y divide-line">
              {i.openShifts.slice(0, 7).map((s) => (
                <li key={s.id}>
                  <Link to={`/scheduling?week=${s.date}&shift=${s.id}`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-canvas">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[13px] font-medium">
                        <DeptDot color={DEPT_BY_ID[s.departmentId].color} />
                        {roleName(s.roleId)}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {fmtDate(s.date, { weekday: true })} · {fmtLocalTime(s.start)}–{fmtLocalTime(s.end)}
                        {i.facilities.length > 1 && ` · ${facs[s.facilityId].shortName}`}
                      </span>
                    </span>
                    <Badge tone={s.shiftType === 'night' || s.shiftType === 'overnight' ? 'info' : 'neutral'}>{SHIFT_TYPE_LABEL[s.shiftType]}</Badge>
                  </Link>
                </li>
              ))}
              {i.openShifts.length > 7 && <li className="px-4 py-2 text-xs text-muted">+{i.openShifts.length - 7} more open shifts</li>}
            </ul>
          )}
        </Card>

        {/* Timecards */}
        <Card>
          <CardHeader title="Which timecards need attention?" actions={<SectionLink to="/time">Time & Attendance</SectionLink>} />
          <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
            {[
              ['Missing punches', i.missingPunches.length, '/time?view=exceptions', 'text-danger-700'],
              ['Corrections', i.pendingCorrections, '/time?view=corrections', 'text-warn-700'],
              ['Pending approval', i.pendingApprovals.length, '/time?view=pending', 'text-ink'],
            ].map(([l, v, to, c]) => (
              <Link key={l as string} to={to as string} className="px-2 py-3 hover:bg-canvas">
                <span className={clsx('block text-xl font-semibold tabular', Number(v) ? (c as string) : 'text-ink')}>{v}</span>
                <span className="text-xs text-muted">{l}</span>
              </Link>
            ))}
          </div>
          <ul className="divide-y divide-line">
            {i.missingPunches.slice(0, 4).map((r) => (
              <li key={r.tc.id}>
                <Link to={`/time?view=exceptions&tc=${r.tc.id}`} className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-canvas">
                  <span className="min-w-0 text-[13px]">
                    <span className="font-medium">{employeeName(r.employee)}</span>
                    <span className="block text-xs text-muted">
                      {fmtDate(r.tc.workDate, { weekday: true })} · {roleName(r.tc.roleId)}
                    </span>
                  </span>
                  <Badge tone="danger">{r.calc.exceptions.find((e) => e.severity === 'blocking')?.label}</Badge>
                </Link>
              </li>
            ))}
            {i.overtime.slice(0, 3).map((o) => (
              <li key={o.employee.id}>
                <Link to={`/people/${o.employee.id}?tab=time`} className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-canvas">
                  <span className="min-w-0 text-[13px]">
                    <span className="font-medium">{employeeName(o.employee)}</span>
                    <span className="block text-xs text-muted">
                      {(o.workedMinutes / 60).toFixed(1)}h worked + {(o.remainingScheduledMinutes / 60).toFixed(1)}h scheduled this week
                    </span>
                  </span>
                  <Badge tone={o.level === 'over' ? 'warning' : 'neutral'}>{(o.projectedMinutes / 60).toFixed(1)}h projected</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        {/* Lifecycle */}
        <Card>
          <CardHeader title="Who is onboarding or offboarding?" actions={<SectionLink to="/people?tab=onboarding">Lifecycle queues</SectionLink>} />
          {i.onboarding.length + i.offboarding.length === 0 ? (
            <EmptyState icon={UserPlus} title="No lifecycle workflows in progress" />
          ) : (
            <ul className="divide-y divide-line">
              {i.onboarding.map(({ wf, employee, readiness }) => (
                <li key={wf.id}>
                  <Link to={`/people/${employee.id}?tab=lifecycle`} className="block px-4 py-2.5 hover:bg-canvas">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[13px] font-medium">
                        <UserPlus className="size-4 text-brand-600" aria-hidden />
                        {employeeName(employee)}
                      </span>
                      <Badge tone={readiness.ready ? 'success' : 'warning'}>{readiness.ready ? 'First-shift ready' : `${readiness.blockers.length} blocker${readiness.blockers.length === 1 ? '' : 's'}`}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {roleName(employee.roleId)} · first shift {fmtDate(wf.effectiveDate, { weekday: true })} · {readiness.done}/{readiness.total} tasks
                    </p>
                    <ProgressBar value={readiness.pct} className="mt-1.5" label="Onboarding progress" />
                  </Link>
                </li>
              ))}
              {i.offboarding.map(({ wf, employee, readiness, futureShifts }) => (
                <li key={wf.id}>
                  <Link to={`/people/${employee.id}?tab=lifecycle`} className="block px-4 py-2.5 hover:bg-canvas">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[13px] font-medium">
                        <UserMinus className="size-4 text-warn-600" aria-hidden />
                        {employeeName(employee)}
                      </span>
                      {futureShifts > 0 ? <Badge tone="warning">{futureShifts} shift{futureShifts === 1 ? '' : 's'} after separation</Badge> : <Badge>Offboarding</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {roleName(employee.roleId)} · separation {fmtDate(wf.effectiveDate, { weekday: true })} · {readiness.done}/{readiness.total} tasks
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Credentials */}
        <Card>
          <CardHeader title="Credential expirations" subtitle="Expired or expiring within 30 days" actions={<SectionLink to="/people?tab=credentials">All credentials</SectionLink>} />
          {i.credentials.filter((c) => c.state !== 'unverified').length === 0 ? (
            <EmptyState icon={BadgeCheck} title="No expiring credentials" />
          ) : (
            <ul className="divide-y divide-line">
              {i.credentials
                .filter((c) => c.state !== 'unverified')
                .slice(0, 6)
                .map((c) => (
                  <li key={c.employee.id + c.type}>
                    <Link to={`/people/${c.employee.id}?tab=credentials`} className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-canvas">
                      <span className="min-w-0 text-[13px]">
                        <span className="font-medium">{employeeName(c.employee)}</span>
                        <span className="block text-xs text-muted">
                          {c.type} · {roleName(c.employee.roleId)}
                        </span>
                      </span>
                      <Badge tone={c.state === 'expired' ? 'danger' : 'warning'}>{c.state === 'expired' ? `Expired ${fmtDate(c.expiresOn!)}` : `${c.daysLeft} days`}</Badge>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        {/* PBJ */}
        {canPbj && (
          <Card className="xl:col-span-3">
            <CardHeader
              title="What is preventing PBJ preparation?"
              subtitle={i.pbj[0] ? `${quarterFromId(i.pbj[0].quarterId).label} · deadline ${fmtDate(quarterFromId(i.pbj[0].quarterId).deadline, { year: true })} (45 days after quarter end). Status reflects Poise demo rules only.` : undefined}
              actions={<SectionLink to="/pbj">PBJ workspace</SectionLink>}
            />
            <div className="grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0">
              {i.pbj.map(({ facility, result, status }) => (
                <Link key={facility.id} to={`/pbj?facility=${facility.id}`} className="block p-4 hover:bg-canvas">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium">
                      <FileCheck2 className="size-4 text-brand-600" aria-hidden />
                      {facility.name}
                    </span>
                    <Badge tone={TONE_FOR_PBJ[status.tone]}>{status.label}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    {[
                      ['Errors', result.counts.errors, 'text-danger-700'],
                      ['Warnings', result.counts.unresolvedWarnings, 'text-warn-700'],
                      ['Indicators', result.counts.indicators, 'text-info-600'],
                      ['Eligible hrs', result.totals.eligibleHours.toLocaleString(undefined, { maximumFractionDigits: 0 }), 'text-ink'],
                    ].map(([l, v, c]) => (
                      <div key={l as string} className="rounded-md bg-canvas px-2 py-2">
                        <div className={clsx('text-lg font-semibold tabular', Number(v) || l === 'Eligible hrs' ? (c as string) : 'text-ink')}>{v}</div>
                        <div className="text-[11.5px] text-muted">{l}</div>
                      </div>
                    ))}
                  </div>
                  <ul className="mt-3 space-y-1">
                    {result.issues
                      .filter((x) => x.severity === 'error')
                      .slice(0, 3)
                      .map((x) => (
                        <li key={x.key} className="flex gap-2 text-[12.5px] text-muted">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-danger-600" aria-hidden />
                          <span>
                            <span className="font-medium text-ink">{x.title}.</span> {x.detail}
                          </span>
                        </li>
                      ))}
                    {result.counts.errors === 0 && <li className="text-[12.5px] text-muted">No blocking errors detected by demo rules.</li>}
                  </ul>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
