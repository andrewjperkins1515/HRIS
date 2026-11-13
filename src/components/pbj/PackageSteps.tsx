import { CheckCircle2, Download, FileCode2, FileText, Send, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { canApprovePackage } from '../../domain/pbj/engine';
import { dailyRowsCsv, DEMO_EXPORT_BANNER, downloadFile, reviewReportHtml } from '../../domain/pbj/export';
import type { PbjSubmissionRecord } from '../../domain/types';
import { useCan, useUser } from '../../store/hooks';
import { usePoise } from '../../store/store';
import { useRun } from '../../store/useRun';
import { Badge, Button, Callout, Card, CardHeader, ConfirmDialog, Field, Input, KeyValue, PlannedNote, Select, TableWrap, Textarea } from '../ui';
import { fmtInstant, hrs, type PbjCtx } from './shared';

export function useReviewPackageDownload(ctx: PbjCtx) {
  const user = useUser();
  const nowIso = usePoise((s) => s.demoNowIso);
  return () => {
    const slug = `${ctx.facility.shortName.replace(/\s+/g, '-').toLowerCase()}_${ctx.quarter.id}_v${ctx.prep?.version ?? 1}`;
    downloadFile(
      `poise-pbj-review_${slug}.html`,
      reviewReportHtml({ facility: ctx.facility, quarter: ctx.quarter, result: ctx.result, statusLabel: ctx.status.label, version: ctx.prep?.version ?? 1, generatedAt: fmtInstant(nowIso), generatedBy: user.name }),
      'text/html',
    );
    downloadFile(`poise-pbj-daily_${slug}.csv`, dailyRowsCsv(ctx.result.rows, ctx.facility), 'text/csv');
  };
}

export function ApproveStep({ ctx }: { ctx: PbjCtx }) {
  const approve = usePoise((s) => s.approvePbjPackage);
  const canApprove = useCan('pbj.approve');
  const run = useRun();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const check = canApprovePackage(ctx.result, ctx.prep);
  const appr = ctx.prep?.approval;
  const current = appr && appr.sourceFingerprint === ctx.result.fingerprint;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Review & approve" subtitle="Approval locks the package to the current source fingerprint. Any later change to source records, mappings or decisions makes it stale." />
        <div className="space-y-4 p-4">
          {appr && (
            <Callout tone={current ? 'success' : 'warning'} title={current ? `Approved by ${appr.by}` : 'Approval is stale'}>
              {fmtInstant(appr.at)} · fingerprint {appr.sourceFingerprint}
              {appr.note ? ` · “${appr.note}”` : ''}
              {!current && ' — source data changed after approval. Rerun checks and approve again.'}
            </Callout>
          )}
          <KeyValue
            cols={3}
            items={[
              { k: 'Eligible hours', v: hrs(ctx.result.totals.eligibleHours) },
              { k: 'Employee / contract', v: `${hrs(ctx.result.totals.employeeHours)} / ${hrs(ctx.result.totals.contractHours)}` },
              { k: 'Current fingerprint', v: <span className="font-mono text-xs">{ctx.result.fingerprint}</span> },
              { k: 'Blocking errors', v: ctx.result.counts.errors },
              { k: 'Unreviewed warnings', v: ctx.result.counts.unresolvedWarnings },
              { k: 'Staffing indicators (informational)', v: ctx.result.counts.indicators },
            ]}
          />
          {!check.ok ? (
            <Callout tone="warning" title="Not ready for approval">
              {check.reason}
            </Callout>
          ) : (
            !current && <Callout tone="info" title="Ready for approval">No detected errors under demo rules and all warnings have reviewer decisions. This is not a compliance determination.</Callout>
          )}
          <Button variant="primary" icon={ShieldCheck} disabled={!check.ok || !canApprove || !!current} onClick={() => setOpen(true)} title={!canApprove ? 'Your demo role cannot approve PBJ packages' : undefined}>
            {current ? 'Approved' : 'Approve package'}
          </Button>
        </div>
      </Card>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Approve ${ctx.facility.shortName} ${ctx.quarter.id} v${ctx.prep?.version ?? 1}?`}
        body="You are confirming that the preparation was reviewed under Poise demo rules. Approval does not validate the data against CMS specifications."
        confirmLabel="Approve package"
        onConfirm={() => {
          const r = run(() => approve(ctx.facility.id, ctx.quarter.id, note.trim() || undefined), { success: 'Package approved', successBody: 'You can now generate the demo export.' });
          if (r.ok) setOpen(false);
        }}
      >
        <Field label="Approval note (optional)" htmlFor="appr-note" className="mt-3">
          <Textarea id="appr-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

export function ExportStep({ ctx }: { ctx: PbjCtx }) {
  const gen = usePoise((s) => s.generatePbjExport);
  const canExport = useCan('pbj.export');
  const run = useRun();
  const downloadReview = useReviewPackageDownload(ctx);
  const approvedCurrent = !!ctx.prep?.approval && ctx.prep.approval.sourceFingerprint === ctx.result.fingerprint;
  const exports = ctx.prep?.exports ?? [];
  return (
    <div className="space-y-4">
      <Callout tone="warning" title={DEMO_EXPORT_BANNER}>
        The prototype generates an <strong>illustrative</strong> XML file through a PBJ export service boundary. It has <strong>not</strong> been validated against the official CMS PBJ XSD, and Poise makes no claim of schema validity. Production must generate from the current CMS data specifications and validate before upload.
      </Callout>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Review package" subtitle="Available at any time — share with administrators and DONs before approval." />
          <div className="space-y-3 p-4 text-[13px]">
            <ul className="space-y-1 text-muted">
              <li className="flex items-center gap-2">
                <FileText className="size-4" aria-hidden /> Review report (HTML): status, totals by job code, all issues & decisions, rule basis
              </li>
              <li className="flex items-center gap-2">
                <FileText className="size-4" aria-hidden /> Daily staffing rows (CSV) with source record references
              </li>
            </ul>
            <Button variant="primary" icon={Download} onClick={downloadReview}>
              Download review package
            </Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Generate export snapshot" subtitle="Requires a current approval. Snapshots are immutable and fingerprinted." />
          <div className="space-y-3 p-4 text-[13px]">
            {!approvedCurrent && <Callout tone="info">{ctx.prep?.approval ? 'The approval is stale. Rerun checks and approve again.' : 'Approve the package first.'}</Callout>}
            <Button
              variant="primary"
              icon={FileCode2}
              disabled={!approvedCurrent || !canExport}
              title={!canExport ? 'Your demo role cannot generate exports' : undefined}
              onClick={() => {
                const r = run(() => gen(ctx.facility.id, ctx.quarter.id), { success: 'Demo export generated', successBody: DEMO_EXPORT_BANNER });
                if (r.ok && r.value) downloadFile(r.value.fileName, r.value.content, r.value.mimeType);
              }}
            >
              Generate demo XML
            </Button>
            <p className="text-xs text-muted">Schema validation against the CMS XSD: <PlannedNote>not performed in prototype</PlannedNote></p>
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Export snapshots" />
        {exports.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted">No export snapshots for this version.</p>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th className="th">File</th>
                <th className="th">Generated</th>
                <th className="th">By</th>
                <th className="th text-right">Workers</th>
                <th className="th text-right">Day rows</th>
                <th className="th text-right">Hours</th>
                <th className="th">Fingerprint</th>
              </tr>
            </thead>
            <tbody>
              {exports.map((e) => (
                <tr key={e.id}>
                  <td className="td font-mono text-xs">{e.fileName}</td>
                  <td className="td text-muted">{fmtInstant(e.generatedAt)}</td>
                  <td className="td">{e.generatedBy}</td>
                  <td className="td text-right tabular">{e.workerCount}</td>
                  <td className="td text-right tabular">{e.dayRowCount}</td>
                  <td className="td text-right tabular">{hrs(e.totalHours)}</td>
                  <td className="td">
                    <span className="font-mono text-xs">{e.sourceFingerprint}</span>{' '}
                    {e.sourceFingerprint === ctx.result.fingerprint ? <Badge tone="success">Current</Badge> : <Badge tone="warning">Stale</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

export function SubmissionHistory({ subs }: { subs: PbjSubmissionRecord[] }) {
  if (!subs.length) return <p className="px-4 py-6 text-center text-[13px] text-muted">No submission records.</p>;
  return (
    <TableWrap>
      <thead>
        <tr>
          <th className="th">Recorded</th>
          <th className="th">By</th>
          <th className="th">Method</th>
          <th className="th">User-entered reference</th>
          <th className="th">Final validation (user-reported)</th>
          <th className="th">Notes</th>
        </tr>
      </thead>
      <tbody>
        {subs.map((s) => (
          <tr key={s.id}>
            <td className="td text-muted">{fmtInstant(s.recordedAt)}</td>
            <td className="td">{s.recordedBy}</td>
            <td className="td">Manual iQIES upload (outside Poise)</td>
            <td className="td font-mono text-xs">{s.submissionReference || '—'}</td>
            <td className="td">
              {s.finalValidationStatus === 'not_recorded' ? <Badge>Not recorded</Badge> : s.finalValidationStatus === 'user_reported_errors' ? <Badge tone="danger">User reported errors</Badge> : <Badge tone="info">User reported accepted</Badge>}
            </td>
            <td className="td text-xs text-muted">{s.notes}</td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

export function SubmitStep({ ctx }: { ctx: PbjCtx }) {
  const record = usePoise((s) => s.recordPbjSubmission);
  const canExport = useCan('pbj.export');
  const run = useRun();
  const [ref, setRef] = useState('');
  const [status, setStatus] = useState<PbjSubmissionRecord['finalValidationStatus']>('not_recorded');
  const [notes, setNotes] = useState('');
  const hasExport = !!ctx.prep?.exports.length;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Direct submission to iQIES" subtitle="Planned integration" actions={<PlannedNote>integration</PlannedNote>} />
          <div className="space-y-3 p-4 text-[13px] text-muted">
            <p>Poise does not submit to CMS in this prototype, and never displays CMS receipts it did not receive. Intended production workflow:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Generate the PBJ XML from the approved snapshot and validate it against the current CMS XSD.</li>
              <li>Upload through iQIES (HARP credentials) or a supported integration; capture the submission identifier.</li>
              <li>Retrieve the Final File Validation Report (can take up to 24 hours) and attach it to the version.</li>
              <li>Reconcile rejected records to source timecards, correct, and resubmit before the deadline (end of the 45th day after quarter end).</li>
              <li>Compare iQIES staffing and census reports with Poise totals.</li>
            </ol>
            <Button icon={Send} disabled title="Planned integration — not available in the prototype">
              Submit to iQIES
            </Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Record a manual submission" subtitle="For uploads performed outside Poise. All values are user-entered." />
          <div className="space-y-3 p-4">
            {!hasExport && <Callout tone="info">Generate an export snapshot first.</Callout>}
            <Field label="Submission reference (as shown in iQIES)" htmlFor="sub-ref" hint="Optional. Poise does not generate or verify this value.">
              <Input id="sub-ref" value={ref} onChange={(e) => setRef(e.target.value)} disabled={!hasExport} />
            </Field>
            <Field label="Final File Validation Report" htmlFor="sub-status">
              <Select id="sub-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} disabled={!hasExport}>
                <option value="not_recorded">Not yet reviewed / not recorded</option>
                <option value="user_reported_accepted">User reports: accepted</option>
                <option value="user_reported_errors">User reports: errors to correct</option>
              </Select>
            </Field>
            <Field label="Notes" htmlFor="sub-notes">
              <Textarea id="sub-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!hasExport} />
            </Field>
            <Button
              variant="primary"
              icon={CheckCircle2}
              disabled={!hasExport || !canExport}
              onClick={() => {
                const r = run(() => record(ctx.facility.id, ctx.quarter.id, { submissionReference: ref.trim() || undefined, finalValidationStatus: status, notes: notes.trim() || undefined }), { success: 'Manual submission recorded', successBody: 'Recorded as user-entered information. Poise did not contact CMS.' });
                if (r.ok) {
                  setRef('');
                  setNotes('');
                }
              }}
            >
              Record manual submission
            </Button>
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Submission history" subtitle="Submission records are user-entered and kept separate from export snapshots and CMS validation results." />
        <SubmissionHistory subs={ctx.prep?.submissions ?? []} />
      </Card>
    </div>
  );
}
