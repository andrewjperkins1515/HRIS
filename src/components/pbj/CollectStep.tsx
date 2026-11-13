import { ArrowRight, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadFile } from '../../domain/pbj/export';
import { guessMapping, IMPORT_FIELDS, parseCsv, sampleAgencyCsv, templateCsv, validateImportRows, type ImportFieldKey } from '../../domain/pbj/importer';
import { fmtDate } from '../../domain/time';
import { useCan, useToday } from '../../store/hooks';
import { usePoise } from '../../store/store';
import { useRun } from '../../store/useRun';
import { Badge, Button, Callout, Card, CardHeader, Modal, ProgressBar, Select, TableWrap } from '../ui';
import { fmtInstant, hrs, type PbjCtx } from './shared';

function ImportWizard({ ctx, open, onClose }: { ctx: PbjCtx; open: boolean; onClose: () => void }) {
  const importRows = usePoise((s) => s.importAgencyHours);
  const today = useToday(ctx.facility.id);
  const run = useRun();
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ImportFieldKey, number>>>({});
  const [step, setStep] = useState<'file' | 'map' | 'preview'>('file');

  const reset = () => {
    setFileName('');
    setTable(null);
    setMapping({});
    setStep('file');
  };
  const load = (name: string, text: string) => {
    const t = parseCsv(text);
    setFileName(name);
    setTable(t);
    setMapping(guessMapping(t[0] ?? []));
    setStep('map');
  };
  const headers = table?.[0] ?? [];
  const parsed = useMemo(
    () => (table && step === 'preview' ? validateImportRows(table.slice(1), mapping, { quarterStart: ctx.quarter.start, today }) : []),
    [table, mapping, step, ctx.quarter.start, today],
  );
  const missingRequired = IMPORT_FIELDS.filter((f) => f.required && mapping[f.key] === undefined);
  const valid = parsed.filter((r) => !r.errors.length);

  const close = () => {
    reset();
    onClose();
  };
  const doImport = () => {
    const colMap = Object.fromEntries(Object.entries(mapping).map(([k, v]) => [k, headers[v as number] ?? '']));
    const r = run(() => importRows(ctx.facility.id, fileName, parsed, colMap), {
      success: 'Agency hours imported',
      successBody: (v) => `${v?.accepted} rows imported${v?.created ? `, ${v.created} new agency worker(s) created` : ''}. Imported records await timecard approval before they are PBJ-eligible.`,
    });
    if (r.ok) close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="Import agency / contract hours"
      description={`Into ${ctx.facility.name}. Times are interpreted in the facility time zone (${ctx.facility.timeZone}).`}
      footer={
        step === 'file' ? (
          <Button onClick={close}>Cancel</Button>
        ) : step === 'map' ? (
          <>
            <Button onClick={reset}>Choose another file</Button>
            <Button variant="primary" iconRight={ArrowRight} disabled={missingRequired.length > 0} onClick={() => setStep('preview')}>
              Preview rows
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setStep('map')}>Back to mapping</Button>
            <Button variant="primary" disabled={!valid.length} onClick={doImport}>
              Import {valid.length} valid row{valid.length === 1 ? '' : 's'}
            </Button>
          </>
        )
      }
    >
      <ol className="mb-4 flex flex-wrap gap-2 text-xs">
        {(['file', 'map', 'preview'] as const).map((s, i) => (
          <li key={s} className={`rounded-full px-2.5 py-1 font-medium ${step === s ? 'bg-brand-600 text-white' : 'bg-silver-100 text-muted'}`}>
            {i + 1}. {s === 'file' ? 'Choose file' : s === 'map' ? 'Map columns' : 'Validate & import'}
          </li>
        ))}
      </ol>
      {step === 'file' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-dashed border-line-strong p-4">
              <p className="font-medium">Upload a CSV file</p>
              <p className="mt-1 text-xs text-muted">One row per worked shift. Any column names — you will map them in the next step.</p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-white px-3 py-1.5 text-sm font-medium hover:bg-canvas">
                <Upload className="size-4" aria-hidden /> Choose CSV…
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) load(f.name, await f.text());
                  }}
                />
              </label>
            </div>
            <div className="rounded-lg border border-line bg-canvas p-4">
              <p className="font-medium">Use the demo agency file</p>
              <p className="mt-1 text-xs text-muted">Fictional BrightShift Staffing export with its own column names, an orientation pay code and one invalid time.</p>
              <Button className="mt-3" icon={FileSpreadsheet} onClick={() => load('brightshift_nov_wk2_sample.csv', sampleAgencyCsv())}>
                Load sample agency file
              </Button>
            </div>
          </div>
          <Button variant="ghost" size="sm" icon={Download} onClick={() => downloadFile('poise_agency_hours_template.csv', templateCsv(), 'text/csv')}>
            Download import template (CSV)
          </Button>
        </div>
      )}
      {step === 'map' && table && (
        <div>
          <p className="mb-3 text-[13px] text-muted">
            <strong className="text-ink">{fileName}</strong> · {table.length - 1} data rows · {headers.length} columns. Confirm which column supplies each Poise field. Suggestions were guessed from header names.
          </p>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {IMPORT_FIELDS.map((f) => (
              <label key={f.key} className="grid grid-cols-[150px_1fr] items-center gap-2 text-[13px]">
                <span>
                  <span className="font-medium">{f.label}</span>
                  {f.required && <span className="text-danger-600"> *</span>}
                  {f.hint && <span className="block text-[11px] text-muted">{f.hint}</span>}
                </span>
                <Select
                  value={mapping[f.key] ?? ''}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) })}
                  aria-label={`Column for ${f.label}`}
                >
                  <option value="">— Not mapped —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`} {table[1]?.[i] ? `(e.g. ${table[1][i]})` : ''}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
          {missingRequired.length > 0 && (
            <Callout tone="warning" className="mt-4">
              Map required fields: {missingRequired.map((f) => f.label).join(', ')}.
            </Callout>
          )}
        </div>
      )}
      {step === 'preview' && (
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="success">{valid.length} valid</Badge>
            <Badge tone={parsed.length - valid.length ? 'danger' : 'neutral'}>{parsed.length - valid.length} with errors (will be skipped)</Badge>
          </div>
          <TableWrap maxHeight="380px">
            <thead>
              <tr>
                {['Line', 'Agency ID', 'Worker', 'Agency', 'Job', 'Date', 'In', 'Out', 'Meal', 'Pay code', 'Result'].map((h) => (
                  <th key={h} className="th">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.map((r) => (
                <tr key={r.line} className={r.errors.length ? 'bg-danger-50/60' : undefined}>
                  <td className="td tabular text-muted">{r.line}</td>
                  <td className="td font-mono text-xs">{r.externalRef}</td>
                  <td className="td">
                    {r.firstName} {r.lastName}
                  </td>
                  <td className="td text-xs">{r.agencyName}</td>
                  <td className="td font-mono text-xs">{r.jobCode}</td>
                  <td className="td tabular">{r.workDate}</td>
                  <td className="td tabular">{r.timeIn}</td>
                  <td className="td tabular">
                    {r.timeOut}
                    {r.timeOut < r.timeIn && <span className="text-xs text-muted"> +1d</span>}
                  </td>
                  <td className="td tabular">{r.mealMinutes}</td>
                  <td className="td">{r.payCode === 'ORIENT' ? <Badge tone="warning">ORIENT</Badge> : r.payCode}</td>
                  <td className="td text-xs">{r.errors.length ? <span className="text-danger-700">{r.errors.join('; ')}</span> : <span className="text-ok-700">Ready</span>}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <p className="mt-3 text-xs text-muted">
            Imported rows become timecards with source “import” in <em>pending approval</em>. Original imported values are kept as source punches. Orientation pay codes are flagged for PBJ review.
          </p>
        </div>
      )}
    </Modal>
  );
}

export function CollectStep({ ctx }: { ctx: PbjCtx }) {
  const { result, facility } = ctx;
  const s = result.source;
  const batches = usePoise((st) => st.importBatches).filter((b) => b.facilityId === facility.id);
  const canImport = useCan('pbj.import');
  const [open, setOpen] = useState(false);
  const approvedPct = s.timecards ? (s.approved / s.timecards) * 100 : 100;
  const unapproved = result.issues.find((i) => i.ruleId === 'E105');

  return (
    <div className="space-y-4">
      <Callout tone="neutral" title="Data layers">
        Source punches (clock, kiosk, import) → <strong>approved timecards</strong> → PBJ eligibility & transformations (mapping, midnight split, meal deduction) → export snapshot → submission record. Scheduled hours are never used as PBJ hours.
      </Callout>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Source-data completeness" subtitle={`Collected ${fmtDate(ctx.quarter.start)} – ${fmtDate(s.collectedThrough, { year: true })} (data through the demo date; quarter ends ${fmtDate(ctx.quarter.end, { year: true })}).`} />
          <div className="space-y-4 p-4">
            <div>
              <div className="mb-1 flex justify-between text-[13px]">
                <span>Timecards approved</span>
                <span className="tabular">
                  {s.approved} / {s.timecards}
                </span>
              </div>
              <ProgressBar value={approvedPct} tone={approvedPct < 100 ? 'warning' : 'success'} label="Approved timecards" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Pending approval', s.pending],
                ['Open (incl. on clock)', s.open],
                ['Imported records', s.imported],
                ['Days with data', `${s.daysWithData}/${s.daysInRange}`],
                ['Workers', s.workers],
                ['Employees', s.employeeWorkers],
                ['Agency / contract', s.contractWorkers],
                ['Eligible hours', hrs(result.totals.eligibleHours)],
                ['Employee hours', hrs(result.totals.employeeHours)],
                ['Contract hours', hrs(result.totals.contractHours)],
                ['Hours blocked', hrs(result.totals.blockedHours)],
                ['Excluded (not reportable)', hrs(result.totals.excludedHours)],
              ].map(([l, v]) => (
                <div key={l as string} className="rounded-md bg-canvas px-3 py-2">
                  <div className="text-[15px] font-semibold tabular">{v}</div>
                  <div className="text-[11.5px] text-muted">{l}</div>
                </div>
              ))}
            </div>
            {unapproved && (
              <Callout tone="warning" title="Unapproved source records">
                {unapproved.detail}{' '}
                <Link className="link" to="/time?view=pending">
                  Open approvals
                </Link>
              </Callout>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Import agency hours" subtitle="Sample import flow with explicit column mapping." />
          <div className="space-y-3 p-4 text-[13px]">
            <p className="text-muted">Agencies often send hours outside the timeclock. Import them so agency/contract staff are included with their own stable worker IDs.</p>
            <Button variant="primary" icon={Upload} disabled={!canImport} onClick={() => setOpen(true)} title={canImport ? undefined : 'Your demo role cannot import'}>
              Import CSV…
            </Button>
            <Button variant="ghost" size="sm" icon={Download} onClick={() => downloadFile('poise_agency_hours_template.csv', templateCsv(), 'text/csv')}>
              Download template
            </Button>
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Import history" subtitle={facility.name} />
        {batches.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted">No imports for this facility.</p>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th className="th">Batch</th>
                <th className="th">File</th>
                <th className="th">Imported</th>
                <th className="th">By</th>
                <th className="th text-right">Rows</th>
                <th className="th text-right">Accepted</th>
                <th className="th text-right">Rejected</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="td font-mono text-xs">{b.id}</td>
                  <td className="td">{b.fileName}</td>
                  <td className="td text-muted">{fmtInstant(b.importedAt)}</td>
                  <td className="td">{b.importedBy}</td>
                  <td className="td text-right tabular">{b.rowCount}</td>
                  <td className="td text-right tabular">{b.acceptedCount}</td>
                  <td className="td text-right tabular">{b.rejectedCount}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      <ImportWizard ctx={ctx} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
