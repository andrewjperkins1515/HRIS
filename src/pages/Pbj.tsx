import clsx from 'clsx';
import { AlertTriangle, BookOpen, CopyPlus, Download } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CollectStep } from '../components/pbj/CollectStep';
import { MappingModal, MapStep, type MappingDraft } from '../components/pbj/MapStep';
import { ApproveStep, ExportStep, SubmissionHistory, SubmitStep, useReviewPackageDownload } from '../components/pbj/PackageSteps';
import { fmtInstant, hrs, STEP_ICON, type PbjCtx } from '../components/pbj/shared';
import { ValidateStep } from '../components/pbj/ValidateStep';
import { TONE_FOR_PBJ } from '../components/status';
import { Badge, Button, Callout, Card, CardHeader, ConfirmDialog, EmptyState, PageHeader, Select, TableWrap } from '../components/ui';
import { PBJ_REFERENCE } from '../domain/catalog';
import { preparationStatus } from '../domain/pbj/engine';
import { daysBetween, fmtDate, previousQuarter, quarterFromId } from '../domain/time';
import type { PbjPreparation } from '../domain/types';
import { useCan, useCurrentQuarter, useScopedFacilities, useToday } from '../store/hooks';
import { usePoise } from '../store/store';
import { useRun } from '../store/useRun';

const STEPS = ['collect', 'map', 'validate', 'approve', 'export', 'submit'] as const;
type Step = (typeof STEPS)[number];

function HistoryQuarter({ preps }: { preps: PbjPreparation[] }) {
  if (!preps.length)
    return (
      <Card>
        <EmptyState title="No preparation records in Poise for this quarter" body="This quarter was prepared outside Poise. Source records for prior quarters are not included in the demo dataset." />
      </Card>
    );
  return (
    <div className="space-y-4">
      <Callout tone="info" title="Historical quarter">
        Source records for this quarter are not included in the demo dataset, so checks cannot be rerun. Preparation, export and submission records are shown as kept.
      </Callout>
      {preps.map((p) => (
        <Card key={p.id}>
          <CardHeader title={`Version ${p.version}`} subtitle={`Created ${fmtInstant(p.createdAt)} by ${p.createdBy}`} actions={<Badge tone={p.status === 'submission_recorded' ? 'info' : 'neutral'}>{p.status.replace('_', ' ')}</Badge>} />
          <div className="space-y-4 p-4 text-[13px]">
            {p.validationRuns.map((r) => (
              <p key={r.id}>
                Validation run {fmtInstant(r.runAt)} by {r.runBy}: {r.errorCount} errors, {r.warningCount} warnings, {r.indicatorCount} indicators · {hrs(r.totalEligibleHours)} eligible hours · {r.rulesetVersion}
              </p>
            ))}
            {p.approval && (
              <p>
                Approved {fmtInstant(p.approval.at)} by {p.approval.by} · fingerprint <span className="font-mono text-xs">{p.approval.sourceFingerprint}</span>
              </p>
            )}
            {p.exports.map((e) => (
              <p key={e.id}>
                Export snapshot <span className="font-mono text-xs">{e.fileName}</span> · {e.workerCount} workers · {hrs(e.totalHours)} hours · {fmtInstant(e.generatedAt)}
              </p>
            ))}
          </div>
          <SubmissionHistory subs={p.submissions} />
        </Card>
      ))}
    </div>
  );
}

export default function PbjPage() {
  const [params, setParams] = useSearchParams();
  const facilities = useScopedFacilities().filter((f) => f.pbjReporting);
  const current = useCurrentQuarter();
  const prev = previousQuarter(current);
  const facility = facilities.find((f) => f.id === params.get('facility')) ?? facilities[0];
  const quarterId = params.get('quarter') ?? current.id;
  const quarter = quarterFromId(quarterId);
  const step = (STEPS.includes(params.get('step') as Step) ? params.get('step') : 'validate') as Step;
  const preparations = usePoise((s) => s.preparations);
  const computePbj = usePoise((s) => s.computePbj);
  // Subscribe to engine inputs so the live result re-renders when records change.
  const tc = usePoise((s) => s.timecards);
  const mp = usePoise((s) => s.mappings);
  const em = usePoise((s) => s.employees);
  const fc = usePoise((s) => s.facilities);
  const rules = usePoise((s) => s.pbjRules);
  const nowIso = usePoise((s) => s.demoNowIso);
  void [tc, mp, em, fc, rules, nowIso];
  const newVersion = usePoise((s) => s.newPbjVersion);
  const canValidate = useCan('pbj.validate');
  const run = useRun();
  const today = useToday(facility?.id);
  const [mapDraft, setMapDraft] = useState<MappingDraft | null>(null);
  const [confirmVersion, setConfirmVersion] = useState(false);

  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v === null) n.delete(k);
    else n.set(k, v);
    setParams(n, { replace: true });
  };

  if (!facility)
    return (
      <div>
        <PageHeader title="PBJ preparation" />
        <EmptyState title="No PBJ-reporting facility in scope" body="Change the facility selector or demo role." />
      </div>
    );

  const versions = preparations.filter((p) => p.facilityId === facility.id && p.quarterId === quarterId).sort((a, b) => b.version - a.version);
  const active = versions.find((p) => p.status !== 'superseded');
  const isHistory = quarterId !== current.id;
  const selectedV = params.get('v');
  const viewed = versions.find((p) => String(p.version) === selectedV) ?? active;
  const viewingOld = !!viewed && viewed.status === 'superseded';

  const header = (
    <PageHeader
      title="PBJ preparation"
      description="Prepare, validate and review Payroll Based Journal staffing data from approved timecards. Rules are illustrative and versioned; status reflects Poise demo rules, not CMS acceptance or compliance."
      meta={
        <a href={PBJ_REFERENCE.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
          <BookOpen className="size-3.5" aria-hidden /> Reference: {PBJ_REFERENCE.source}, {PBJ_REFERENCE.version} ({PBJ_REFERENCE.published})
        </a>
      }
    />
  );

  const selectors = (
    <Card className="mb-4">
      <div className="flex flex-wrap items-end gap-3 px-4 py-3">
        <label className="text-[13px]">
          <span className="mb-1 block text-xs font-medium text-muted">Facility</span>
          <Select value={facility.id} onChange={(e) => set('facility', e.target.value)} className="w-auto min-w-56">
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-[13px]">
          <span className="mb-1 block text-xs font-medium text-muted">Reporting quarter</span>
          <Select value={quarterId} onChange={(e) => { const n = new URLSearchParams(params); n.set('quarter', e.target.value); n.delete('v'); setParams(n, { replace: true }); }} className="w-auto">
            <option value={current.id}>{current.label} — in progress</option>
            <option value={prev.id}>{prev.label} — history</option>
          </Select>
        </label>
        {!isHistory && (
          <label className="text-[13px]">
            <span className="mb-1 block text-xs font-medium text-muted">Preparation version</span>
            <Select value={viewed ? String(viewed.version) : ''} onChange={(e) => set('v', e.target.value)} className="w-auto" disabled={!versions.length}>
              {versions.length === 0 && <option value="">v1 (created on first run)</option>}
              {versions.map((p) => (
                <option key={p.id} value={p.version}>
                  v{p.version} · {p.status === 'superseded' ? 'superseded' : p.status.replace('_', ' ')}
                </option>
              ))}
            </Select>
          </label>
        )}
        {!isHistory && canValidate && (
          <Button size="md" icon={CopyPlus} onClick={() => setConfirmVersion(true)}>
            New version
          </Button>
        )}
        <div className="ml-auto text-right text-xs text-muted">
          <div>
            Deadline <strong className="text-ink">{fmtDate(quarter.deadline, { weekday: true, year: true })}</strong> (11:59 PM ET)
          </div>
          <div>{daysBetween(today, quarter.deadline) >= 0 ? `${daysBetween(today, quarter.deadline)} days remaining` : 'Deadline passed'}</div>
        </div>
      </div>
    </Card>
  );

  if (isHistory)
    return (
      <div>
        {header}
        {selectors}
        <HistoryQuarter preps={versions} />
      </div>
    );

  const result = computePbj(facility.id, quarterId);
  const status = preparationStatus(result, active);
  const ctx: PbjCtx = { facility, quarter, result, prep: active, status };

  return (
    <div>
      {header}
      {selectors}
      <PbjBody ctx={ctx} step={step} setStep={(s) => set('step', s)} viewingOld={viewingOld} viewed={viewed} onMap={setMapDraft} />
      <MappingModal draft={mapDraft} onClose={() => setMapDraft(null)} facilityId={facility.id} facilityName={facility.shortName} />
      <ConfirmDialog
        open={confirmVersion}
        onClose={() => setConfirmVersion(false)}
        title={`Create v${(active?.version ?? 0) + 1} for ${facility.shortName}?`}
        body="The current version will be marked superseded and kept for history. Review decisions are carried forward; validation runs, approval and exports start fresh."
        confirmLabel="Create version"
        onConfirm={() => {
          const r = run(() => newVersion(facility.id, quarterId), { success: 'New preparation version created' });
          if (r.ok) {
            setConfirmVersion(false);
            set('v', null);
          }
        }}
      />
    </div>
  );
}

function PbjBody({ ctx, step, setStep, viewingOld, viewed, onMap }: { ctx: PbjCtx; step: Step; setStep: (s: Step) => void; viewingOld: boolean; viewed?: PbjPreparation; onMap: (d: MappingDraft) => void }) {
  const downloadReview = useReviewPackageDownload(ctx);
  const { status, result } = ctx;
  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={TONE_FOR_PBJ[status.tone]} className="px-2.5 py-1 text-[13px]">
              {status.label}
            </Badge>
            <span className="text-[13px] text-muted">
              {ctx.facility.name} · v{ctx.prep?.version ?? 1} · data through {fmtDate(result.source.collectedThrough, { year: true })} · {hrs(result.totals.eligibleHours)} eligible hours
              {result.counts.errors === 0 && ' · No detected errors under demo rules'}
            </span>
          </div>
          <Button size="sm" icon={Download} onClick={downloadReview}>
            Download review package
          </Button>
        </div>
        {status.stale && (
          <div className="border-b border-line px-4 py-2.5">
            <Callout tone="warning" icon={AlertTriangle} title="Prepared package is stale">
              Source records, mappings or review decisions changed after this package was approved or exported. Rerun checks and approve again before generating a new export.
            </Callout>
          </div>
        )}
        <ol className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6" aria-label="PBJ workflow">
          {status.steps.map((s, idx) => {
            const [Icon, color] = STEP_ICON[s.state];
            const key = STEPS[idx];
            const activeStep = step === key;
            return (
              <li key={s.key} className="border-line [&:not(:last-child)]:border-r max-xl:border-b">
                <button
                  onClick={() => setStep(key)}
                  aria-current={activeStep ? 'step' : undefined}
                  className={clsx('flex h-full w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors', activeStep ? 'bg-brand-50 shadow-[inset_0_-2px_0_var(--color-brand-600)]' : 'hover:bg-canvas')}
                >
                  <Icon className={clsx('mt-0.5 size-[18px] shrink-0', color)} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold tracking-wide text-muted uppercase">Step {idx + 1}</span>
                    <span className="block text-[13px] font-medium text-ink">{s.title}</span>
                    <span className="block text-xs text-muted">{s.detail}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </Card>

      {viewingOld && viewed && (
        <Callout tone="info" title={`Viewing superseded v${viewed.version}`} className="mb-4">
          Older versions are kept for audit history. Actions below apply to the active version v{ctx.prep?.version}. v{viewed.version}: {viewed.validationRuns.length} run(s), {viewed.exports.length} export(s), {viewed.approval ? `approved by ${viewed.approval.by}` : 'not approved'}.
        </Callout>
      )}

      {step === 'collect' && <CollectStep ctx={ctx} />}
      {step === 'map' && <MapStep ctx={ctx} onMap={onMap} />}
      {step === 'validate' && <ValidateStep ctx={ctx} onMap={onMap} />}
      {step === 'approve' && <ApproveStep ctx={ctx} />}
      {step === 'export' && <ExportStep ctx={ctx} />}
      {step === 'submit' && <SubmitStep ctx={ctx} />}

      {ctx.prep && ctx.prep.validationRuns.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="Preparation history" subtitle={`Validation runs for v${ctx.prep.version}`} />
          <TableWrap maxHeight="260px">
            <thead>
              <tr>
                <th className="th">Run</th>
                <th className="th">By</th>
                <th className="th">Ruleset</th>
                <th className="th text-right">Errors</th>
                <th className="th text-right">Warnings</th>
                <th className="th text-right">Indicators</th>
                <th className="th text-right">Eligible h</th>
                <th className="th">Fingerprint</th>
              </tr>
            </thead>
            <tbody>
              {[...ctx.prep.validationRuns].reverse().map((r) => (
                <tr key={r.id}>
                  <td className="td text-muted">{fmtInstant(r.runAt)}</td>
                  <td className="td">{r.runBy}</td>
                  <td className="td text-xs">{r.rulesetVersion}</td>
                  <td className="td text-right tabular">{r.errorCount}</td>
                  <td className="td text-right tabular">{r.warningCount}</td>
                  <td className="td text-right tabular">{r.indicatorCount}</td>
                  <td className="td text-right tabular">{hrs(r.totalEligibleHours)}</td>
                  <td className="td">
                    <span className="font-mono text-xs">{r.sourceFingerprint}</span> {r.sourceFingerprint === result.fingerprint ? <Badge tone="success">Current</Badge> : <Badge>Outdated</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
