import { ChevronRight, Download, ExternalLink, Play, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PBJ_TITLE_BY_CODE } from '../../domain/catalog';
import type { PbjIssue, PbjRowStatus } from '../../domain/pbj/engine';
import { dailyRowsCsv, downloadFile } from '../../domain/pbj/export';
import { RULE_BY_ID } from '../../domain/pbj/rules';
import type { PbjIssueResolution, PbjIssueSeverity } from '../../domain/types';
import { useCan, useEmployeesById } from '../../store/hooks';
import { usePoise } from '../../store/store';
import { useRun } from '../../store/useRun';
import { SeverityBadge } from '../status';
import { Badge, Button, Callout, Card, CardHeader, Drawer, EmptyState, Field, Input, KeyValue, SearchInput, Select, TableWrap, Textarea } from '../ui';
import type { MappingDraft } from './MapStep';
import { fmtInstant, hrs, RowStatusBadge, type PbjCtx } from './shared';

const SECTIONS: { sev: PbjIssueSeverity; title: string; sub: string }[] = [
  { sev: 'error', title: 'Blocking data errors', sub: 'Must be fixed in the underlying record before the package can be approved or exported.' },
  { sev: 'warning', title: 'Review warnings', sub: 'Need a documented reviewer decision. Hours stay excluded or flagged until reviewed.' },
  { sev: 'indicator', title: 'Staffing-monitoring indicators', sub: 'Facility monitoring signals. These are not data errors and do not block preparation.' },
];

function ResolveForm({ ctx, issueKeys, isW202, onDone }: { ctx: PbjCtx; issueKeys: string[]; isW202: boolean; onDone: () => void }) {
  const resolve = usePoise((s) => s.resolvePbjIssues);
  const run = useRun();
  const [decision, setDecision] = useState<PbjIssueResolution['decision']>(isW202 ? 'exclude_hours' : 'acknowledged');
  const [note, setNote] = useState('');
  return (
    <div className="space-y-3 rounded-md border border-line bg-canvas p-3">
      <Field label="Reviewer decision" htmlFor="res-dec">
        <Select id="res-dec" value={decision} onChange={(e) => setDecision(e.target.value as PbjIssueResolution['decision'])}>
          {isW202 ? (
            <>
              <option value="exclude_hours">Exclude hours (training — not in primary role)</option>
              <option value="include_hours">Include hours (worked in primary role)</option>
            </>
          ) : (
            <option value="acknowledged">Acknowledge — record reviewed and correct</option>
          )}
        </Select>
      </Field>
      <Field label="Review note" required htmlFor="res-note" hint="Required. Stored with your demo user and timestamp.">
        <Textarea id="res-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you verify, and where?" />
      </Field>
      <Button
        variant="primary"
        size="sm"
        onClick={() => {
          const r = run(() => resolve(ctx.facility.id, ctx.quarter.id, issueKeys, decision, note), { success: `Decision recorded for ${issueKeys.length} item${issueKeys.length === 1 ? '' : 's'}` });
          if (r.ok) onDone();
        }}
      >
        Record decision{issueKeys.length > 1 ? ` for ${issueKeys.length} items` : ''}
      </Button>
    </div>
  );
}

function IssueDrawer({ ctx, issue, onClose, onMap }: { ctx: PbjCtx; issue: PbjIssue | null; onClose: () => void; onMap: (d: MappingDraft) => void }) {
  const timecards = usePoise((s) => s.timecards);
  const clear = usePoise((s) => s.clearPbjResolution);
  const emps = useEmployeesById();
  const canValidate = useCan('pbj.validate');
  const canMap = useCan('pbj.map');
  if (!issue) return null;
  const rule = RULE_BY_ID[issue.ruleId];
  const tcs = (issue.timecardIds ?? []).map((id) => timecards.find((t) => t.id === id)).filter(Boolean);
  const emp = issue.employeeId ? emps[issue.employeeId] : undefined;
  const rows = ctx.result.rows.filter((r) => r.issueKeys.includes(issue.key));
  return (
    <Drawer open onClose={onClose} title={`${issue.ruleId} · ${issue.title}`} subtitle={<SeverityBadge severity={issue.severity} />} width="lg">
      <div className="space-y-5">
        <p className="text-[13.5px]">{issue.detail}</p>
        <KeyValue
          items={[
            { k: 'Rule', v: `${rule.id} — ${rule.description}` },
            { k: 'Basis', v: rule.basis },
            { k: 'Hours affected', v: issue.hours !== undefined ? hrs(issue.hours) : '—' },
            { k: 'Issue key', v: <span className="font-mono text-xs">{issue.key}</span> },
          ]}
        />
        <div>
          <h3 className="mb-2 text-[13px] font-semibold">Trace to source</h3>
          <div className="flex flex-wrap gap-2">
            {issue.action === 'map_job' && (
              <Button variant="primary" size="sm" disabled={!canMap} onClick={() => onMap({ facilityId: null, sourceJobCode: issue.sourceJobCode!, pbjJobTitleCode: null, reportability: 'required', effectiveFrom: ctx.quarter.start, effectiveTo: null })}>
                Map {issue.sourceJobCode}
              </Button>
            )}
            {issue.action === 'edit_facility' && (
              <Link to="/settings?tab=facilities" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand-600 px-2.5 text-[13px] font-medium text-white hover:bg-brand-700">
                Open facility settings <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            )}
            {emp && (
              <Link to={`/people/${emp.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-[13px] font-medium hover:bg-canvas">
                {emp.firstName} {emp.lastName} · {emp.pbjEmployeeId || 'no PBJ ID'} <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            )}
          </div>
          {tcs.length > 0 && (
            <TableWrap className="mt-3 rounded-md border border-line" maxHeight="260px">
              <thead>
                <tr>
                  <th className="th">Source timecard</th>
                  <th className="th">Worker</th>
                  <th className="th">Work date</th>
                  <th className="th">Status</th>
                  <th className="th">Source</th>
                </tr>
              </thead>
              <tbody>
                {tcs.slice(0, 60).map((t) => (
                  <tr key={t!.id}>
                    <td className="td">
                      <Link className="link font-mono text-xs" to={`/time?view=all&tc=${t!.id}`}>
                        {t!.id}
                      </Link>
                    </td>
                    <td className="td">{emps[t!.employeeId] ? `${emps[t!.employeeId].firstName} ${emps[t!.employeeId].lastName}` : t!.employeeId}</td>
                    <td className="td tabular">{t!.workDate}</td>
                    <td className="td">{t!.status.replace('_', ' ')}</td>
                    <td className="td">
                      {t!.source}
                      {t!.sourcePayCode ? ` · ${t!.sourcePayCode}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          {tcs.length > 60 && <p className="mt-1 text-xs text-muted">Showing 60 of {tcs.length} records.</p>}
          {rows.length > 0 && <p className="mt-2 text-xs text-muted">{rows.length} daily staffing row(s) reference this issue.</p>}
        </div>
        {issue.severity === 'warning' && (
          <div>
            <h3 className="mb-2 text-[13px] font-semibold">Review decision</h3>
            {issue.resolution ? (
              <Callout tone="success" title={`${issue.resolution.decision.replace('_', ' ')} by ${issue.resolution.by}`}>
                {issue.resolution.note}
                <span className="block text-xs">{fmtInstant(issue.resolution.at)}</span>
                {canValidate && (
                  <Button size="xs" className="mt-2" icon={RotateCcw} onClick={() => clear(ctx.facility.id, ctx.quarter.id, issue.key)}>
                    Clear decision
                  </Button>
                )}
              </Callout>
            ) : canValidate ? (
              <ResolveForm ctx={ctx} issueKeys={[issue.key]} isW202={issue.ruleId === 'W202'} onDone={onClose} />
            ) : (
              <p className="text-[13px] text-muted">Your demo role cannot record PBJ review decisions.</p>
            )}
          </div>
        )}
        {issue.severity === 'error' && (
          <Callout tone="info">Errors cannot be waived. Fix the underlying record (timecard, worker, mapping or facility), then rerun checks.</Callout>
        )}
      </div>
    </Drawer>
  );
}

const PAGE = 50;

function DailyTable({ ctx }: { ctx: PbjCtx }) {
  const { result, facility } = ctx;
  const [status, setStatus] = useState<'all' | PbjRowStatus>('all');
  const [code, setCode] = useState('all');
  const [q, setQ] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(0);
  const rows = useMemo(
    () =>
      result.rows
        .filter((r) => (status === 'all' || r.status === status) && (code === 'all' || String(r.pbjJobTitleCode ?? 'none') === code) && (!date || r.date === date) && (!q || `${r.workerName} ${r.pbjEmployeeId} ${r.sourceJobCode}`.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => b.date.localeCompare(a.date) || a.workerName.localeCompare(b.workerName)),
    [result.rows, status, code, q, date],
  );
  const codes = [...new Set(result.rows.map((r) => String(r.pbjJobTitleCode ?? 'none')))].sort((a, b) => Number(a) - Number(b));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const p = Math.min(page, pages - 1);
  const counts = (s: PbjRowStatus) => result.rows.filter((r) => r.status === s).length;
  return (
    <Card>
      <CardHeader
        title="Daily staffing table"
        subtitle="One row per worker, calendar day (midnight cutoff in facility time) and source timecard. Eligible hours are after the meal deduction and rounding."
        actions={
          <Button size="sm" icon={Download} onClick={() => downloadFile(`poise-pbj-daily_${facility.shortName.replace(/\s+/g, '-').toLowerCase()}_${ctx.quarter.id}.csv`, dailyRowsCsv(rows, facility), 'text/csv')}>
            CSV ({rows.length})
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-2 border-b border-line px-4 py-3">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Worker, ID or job" className="w-56" />
        <Select aria-label="Review status" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }} className="w-auto">
          <option value="all">All statuses ({result.rows.length})</option>
          <option value="ready">Eligible ({counts('ready')})</option>
          <option value="needs_review">Needs review ({counts('needs_review')})</option>
          <option value="blocked">Blocked ({counts('blocked')})</option>
          <option value="excluded">Excluded ({counts('excluded')})</option>
        </Select>
        <Select aria-label="CMS job code" value={code} onChange={(e) => { setCode(e.target.value); setPage(0); }} className="w-auto">
          <option value="all">All CMS job codes</option>
          {codes.map((c) => (
            <option key={c} value={c}>
              {c === 'none' ? 'Unmapped / not reported' : `${c} — ${PBJ_TITLE_BY_CODE[Number(c)]?.title}`}
            </option>
          ))}
        </Select>
        <Input aria-label="Work date" type="date" value={date} min={ctx.quarter.start} max={ctx.quarter.end} onChange={(e) => { setDate(e.target.value); setPage(0); }} className="w-auto" />
        {(q || status !== 'all' || code !== 'all' || date) && (
          <Button size="sm" variant="ghost" onClick={() => { setQ(''); setStatus('all'); setCode('all'); setDate(''); }}>
            Clear filters
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No rows match these filters" />
      ) : (
        <TableWrap maxHeight="520px">
          <thead>
            <tr>
              {['Worker', 'PBJ worker ID', 'Date', 'Facility', 'Source job', 'Mapped CMS job category', 'Worker type', 'Raw h', 'Meal adj', 'Eligible h', 'Source record', 'Review status'].map((h) => (
                <th key={h} className={`th ${['Raw h', 'Meal adj', 'Eligible h'].includes(h) ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(p * PAGE, p * PAGE + PAGE).map((r) => (
              <tr key={r.key} className="hover:bg-canvas/70">
                <td className="td">
                  <Link className="link" to={`/people/${r.employeeId}`}>
                    {r.workerName}
                  </Link>
                </td>
                <td className="td font-mono text-xs">{r.pbjEmployeeId}</td>
                <td className="td tabular whitespace-nowrap">{r.date}</td>
                <td className="td whitespace-nowrap text-muted">{facility.shortName}</td>
                <td className="td font-mono text-xs">{r.sourceJobCode}</td>
                <td className="td">{r.pbjJobTitleCode ? `${r.pbjJobTitleCode} — ${r.pbjJobTitle}` : <span className="text-muted">—</span>}</td>
                <td className="td">{r.workerType === 'employee' ? 'Employee' : r.workerType === 'agency' ? 'Agency' : 'Contract'}{r.payTypeCode ? ` · ${r.payTypeCode}` : ''}</td>
                <td className="td text-right tabular">{(r.rawMinutes / 60).toFixed(2)}</td>
                <td className="td text-right tabular text-muted">{r.mealAdjustmentMinutes ? `−${(r.mealAdjustmentMinutes / 60).toFixed(2)}` : ''}</td>
                <td className="td text-right font-medium tabular">{r.status === 'excluded' ? <span className="text-muted">({r.eligibleHours.toFixed(2)})</span> : r.eligibleHours.toFixed(2)}</td>
                <td className="td">
                  <Link className="link font-mono text-xs" to={`/time?view=all&tc=${r.timecardId}`}>
                    {r.timecardId}
                  </Link>
                  <span className="block text-[11px] text-muted">
                    {r.source}
                    {r.sourcePayCode ? ` · ${r.sourcePayCode}` : ''} · {r.timecardStatus.replace('_', ' ')}
                  </span>
                </td>
                <td className="td">
                  <RowStatusBadge status={r.status} />
                  {r.statusReason && r.status !== 'ready' && <span className="block text-[11px] text-muted">{r.statusReason}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-muted">
        <span>
          {rows.length ? `${p * PAGE + 1}–${Math.min(rows.length, p * PAGE + PAGE)} of ${rows.length}` : '0 rows'}
        </span>
        <div className="flex gap-1">
          <Button size="xs" disabled={p === 0} onClick={() => setPage(p - 1)}>
            Previous
          </Button>
          <Button size="xs" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function ValidateStep({ ctx, onMap }: { ctx: PbjCtx; onMap: (d: MappingDraft) => void }) {
  const { result, prep } = ctx;
  const runChecks = usePoise((s) => s.runPbjValidation);
  const canValidate = useCan('pbj.validate');
  const run = useRun();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [bulk, setBulk] = useState<string | null>(null);
  const lastRun = prep?.validationRuns.at(-1);
  const current = !!lastRun && lastRun.sourceFingerprint === result.fingerprint;
  const open = result.issues.find((i) => i.key === openKey) ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="text-[13px]">
            {lastRun ? (
              <>
                <p>
                  Last run <strong>{fmtInstant(lastRun.runAt)}</strong> by {lastRun.runBy} · {lastRun.errorCount} errors, {lastRun.warningCount} warnings, {lastRun.indicatorCount} indicators
                </p>
                <p className="text-xs text-muted">
                  Ruleset {lastRun.rulesetVersion} · source fingerprint {lastRun.sourceFingerprint}
                </p>
              </>
            ) : (
              <p className="text-muted">Checks have not been run for this preparation version.</p>
            )}
          </div>
          <Button
            variant="primary"
            icon={Play}
            disabled={!canValidate}
            title={canValidate ? undefined : 'Your demo role cannot run PBJ checks'}
            onClick={() =>
              run(() => runChecks(ctx.facility.id, ctx.quarter.id), {
                success: 'Checks complete',
                successBody: (r) => (r ? `${r.counts.errors} blocking errors · ${r.counts.warnings} warnings · ${r.counts.indicators} indicators${r.counts.errors === 0 ? ' — no detected errors under demo rules' : ''}` : undefined),
              })
            }
          >
            {lastRun ? 'Rerun checks' : 'Run checks'}
          </Button>
        </div>
        {!current && (
          <div className="border-t border-line px-4 py-2.5">
            <Callout tone="warning">
              {lastRun ? 'Source data, mappings or review decisions changed since the last recorded run.' : 'No recorded run yet.'} The results below are a live preview from the current records. Rerun checks to record a validation run for this version.
            </Callout>
          </div>
        )}
      </Card>

      {SECTIONS.map((sec) => {
        const issues = result.issues.filter((i) => i.severity === sec.sev);
        const byRule = new Map<string, PbjIssue[]>();
        for (const i of issues) byRule.set(i.ruleId, [...(byRule.get(i.ruleId) ?? []), i]);
        return (
          <Card key={sec.sev} className={sec.sev === 'error' && issues.length ? 'border-danger-200' : undefined}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {sec.title} <Badge tone={sec.sev === 'error' ? (issues.length ? 'danger' : 'success') : sec.sev === 'warning' ? 'warning' : 'info'}>{issues.length}</Badge>
                </span>
              }
              subtitle={sec.sub}
            />
            {issues.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-muted">{sec.sev === 'error' ? 'No blocking errors detected by the demo rules. This does not mean the data are compliant.' : 'None.'}</p>
            ) : (
              [...byRule.entries()].map(([ruleId, list]) => {
                const unresolved = list.filter((i) => !i.resolution);
                return (
                  <div key={ruleId} className="border-b border-line last:border-b-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-canvas/60 px-4 py-1.5">
                      <span className="text-xs font-semibold text-muted">
                        {ruleId} · {RULE_BY_ID[ruleId].title} ({list.length})
                      </span>
                      {sec.sev === 'warning' && ruleId !== 'W202' && unresolved.length > 1 && canValidate && (
                        <Button size="xs" variant="subtle" onClick={() => setBulk(bulk === ruleId ? null : ruleId)}>
                          Acknowledge all {unresolved.length}
                        </Button>
                      )}
                    </div>
                    {bulk === ruleId && (
                      <div className="px-4 py-3">
                        <ResolveForm ctx={ctx} issueKeys={unresolved.map((i) => i.key)} isW202={false} onDone={() => setBulk(null)} />
                      </div>
                    )}
                    <ul className="divide-y divide-line">
                      {list.map((i) => (
                        <li key={i.key}>
                          <button onClick={() => setOpenKey(i.key)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-canvas" aria-label={`Inspect ${i.ruleId}: ${i.detail}`}>
                            <span className="min-w-0 flex-1 text-[13px]">{i.detail}</span>
                            {i.hours !== undefined && sec.sev !== 'indicator' && <span className="text-xs text-muted tabular">{hrs(i.hours)} h</span>}
                            {sec.sev === 'warning' && (i.resolution ? <Badge tone="success">{i.resolution.decision.replace('_', ' ')}</Badge> : <Badge tone="warning">Needs review</Badge>)}
                            <ChevronRight className="size-4 text-subtle" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </Card>
        );
      })}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Eligible hours by CMS job code" subtitle="Rows with status Eligible only." />
          <TableWrap>
            <thead>
              <tr>
                <th className="th">Code</th>
                <th className="th text-right">Employee</th>
                <th className="th text-right">Contract</th>
                <th className="th text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {result.byJobCode.map((c) => (
                <tr key={c.code}>
                  <td className="td">
                    <span className="font-medium">{c.code}</span> <span className="text-xs text-muted">{c.title}</span>
                  </td>
                  <td className="td text-right tabular">{hrs(c.employeeHours)}</td>
                  <td className="td text-right tabular">{hrs(c.contractHours)}</td>
                  <td className="td text-right font-medium tabular">{hrs(c.hours)}</td>
                </tr>
              ))}
              <tr>
                <td className="td font-semibold">Total</td>
                <td className="td text-right font-semibold tabular">{hrs(result.totals.employeeHours)}</td>
                <td className="td text-right font-semibold tabular">{hrs(result.totals.contractHours)}</td>
                <td className="td text-right font-semibold tabular">{hrs(result.totals.eligibleHours)}</td>
              </tr>
            </tbody>
          </TableWrap>
        </Card>
        <div className="xl:col-span-2">
          <DailyTable ctx={ctx} />
        </div>
      </div>
      <IssueDrawer ctx={ctx} issue={open} onClose={() => setOpenKey(null)} onMap={(d) => { setOpenKey(null); onMap(d); }} />
    </div>
  );
}
