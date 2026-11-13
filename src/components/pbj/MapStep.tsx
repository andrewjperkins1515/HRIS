import { AlertTriangle, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEPT_BY_ID, PBJ_JOB_TITLES, PBJ_TITLE_BY_CODE, ROLES } from '../../domain/catalog';
import { effectiveMapping } from '../../domain/pbj/engine';
import { fmtDate } from '../../domain/time';
import type { PbjJobMapping, PbjReportability } from '../../domain/types';
import { useCan, useEmployeesById, useToday } from '../../store/hooks';
import { usePoise } from '../../store/store';
import { useRun } from '../../store/useRun';
import { Badge, Button, Callout, Card, CardHeader, Field, Input, Modal, SearchInput, Select, TableWrap, Textarea } from '../ui';
import { WorkerTypeBadge } from '../status';
import { hrs, type PbjCtx } from './shared';

const REPORT_LABEL: Record<PbjReportability, [string, 'success' | 'neutral' | 'info']> = {
  required: ['Required', 'success'],
  optional: ['Optional', 'info'],
  not_reported: ['Not reported', 'neutral'],
};

export interface MappingDraft {
  id?: string;
  facilityId: string | null;
  sourceJobCode: string;
  pbjJobTitleCode: number | null;
  reportability: PbjReportability;
  effectiveFrom: string;
  effectiveTo: string | null;
  note?: string;
}

export function MappingModal({ draft, onClose, facilityName, facilityId }: { draft: MappingDraft | null; onClose: () => void; facilityName: string; facilityId: string }) {
  const save = usePoise((s) => s.saveMapping);
  const run = useRun();
  const [d, setD] = useState<MappingDraft | null>(draft);
  const [err, setErr] = useState<string | null>(null);
  // reset when opening with a new draft
  const [lastDraft, setLastDraft] = useState(draft);
  if (draft !== lastDraft) {
    setLastDraft(draft);
    setD(draft);
    setErr(null);
  }
  if (!d) return null;
  const role = ROLES.find((r) => r.sourceJobCode === d.sourceJobCode);
  const submit = () => {
    const r = run(() => save({ ...d, note: d.note?.trim() || undefined }), { success: 'PBJ mapping saved', successBody: 'Rerun checks to record updated validation results.' });
    if (r.ok) onClose();
    else setErr(r.error ?? null);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={d.id ? `Edit mapping · ${d.sourceJobCode}` : `Map source job · ${d.sourceJobCode || 'new'}`}
      description="Effective-dated mapping from a source payroll job code to a CMS PBJ job title code."
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            Save mapping
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Source job code" required htmlFor="m-src" hint={role ? `${role.name} · ${DEPT_BY_ID[role.departmentId].name}` : undefined}>
          <Select id="m-src" value={d.sourceJobCode} disabled={!!d.id} onChange={(e) => setD({ ...d, sourceJobCode: e.target.value })}>
            <option value="">Choose…</option>
            {[...new Set(ROLES.map((r) => r.sourceJobCode))].map((c) => (
              <option key={c} value={c}>
                {c} — {ROLES.find((r) => r.sourceJobCode === c)?.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Applies to" htmlFor="m-fac" hint="Facility-specific mappings override the all-facility mapping.">
          <Select id="m-fac" value={d.facilityId ?? ''} onChange={(e) => setD({ ...d, facilityId: e.target.value || null })}>
            <option value="">All facilities</option>
            <option value={facilityId}>{facilityName} only</option>
          </Select>
        </Field>
        <Field label="Reportability" htmlFor="m-rep" required>
          <Select id="m-rep" value={d.reportability} onChange={(e) => setD({ ...d, reportability: e.target.value as PbjReportability })}>
            <option value="required">Required PBJ category</option>
            <option value="optional">Optional category (codes marked “not required/optional”)</option>
            <option value="not_reported">Not reported in PBJ</option>
          </Select>
        </Field>
        <Field label="CMS job title code" htmlFor="m-code" required={d.reportability !== 'not_reported'}>
          <Select id="m-code" value={d.pbjJobTitleCode ?? ''} disabled={d.reportability === 'not_reported'} onChange={(e) => setD({ ...d, pbjJobTitleCode: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Choose…</option>
            {PBJ_JOB_TITLES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code} — {t.title}
                {t.optional ? ' (optional)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Effective from" htmlFor="m-from" required>
          <Input id="m-from" type="date" value={d.effectiveFrom} onChange={(e) => setD({ ...d, effectiveFrom: e.target.value })} />
        </Field>
        <Field label="Effective to" htmlFor="m-to" hint="Leave blank for open-ended.">
          <Input id="m-to" type="date" value={d.effectiveTo ?? ''} onChange={(e) => setD({ ...d, effectiveTo: e.target.value || null })} />
        </Field>
        <Field label="Rationale / note" htmlFor="m-note" className="sm:col-span-2" hint="Recorded in the audit history with your demo user.">
          <Textarea id="m-note" value={d.note ?? ''} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="e.g. Restorative aides are certified nurse aides providing nursing-related services; reported as CNA (10)." />
        </Field>
      </div>
      {d.pbjJobTitleCode && PBJ_TITLE_BY_CODE[d.pbjJobTitleCode] && (
        <p className="mt-3 text-xs text-muted">
          Labor category {PBJ_TITLE_BY_CODE[d.pbjJobTitleCode].laborCategoryCode} · {PBJ_TITLE_BY_CODE[d.pbjJobTitleCode].laborCategory}
        </p>
      )}
      {err && (
        <Callout tone="danger" className="mt-3">
          {err}
        </Callout>
      )}
    </Modal>
  );
}

export function MapStep({ ctx, onMap }: { ctx: PbjCtx; onMap: (d: MappingDraft) => void }) {
  const { facility, result, quarter } = ctx;
  const mappings = usePoise((s) => s.mappings);
  const emps = useEmployeesById();
  const today = useToday(facility.id);
  const canMap = useCan('pbj.map');
  const [q, setQ] = useState('');
  const unmapped = result.issues.filter((i) => i.ruleId === 'E102');
  const codes = useMemo(() => [...new Set(ROLES.map((r) => r.sourceJobCode))], []);
  const hoursByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of result.rows) m.set(r.sourceJobCode, (m.get(r.sourceJobCode) ?? 0) + r.rawMinutes / 60);
    return m;
  }, [result.rows]);
  const asOf = today < quarter.end ? today : quarter.end;

  const workers = useMemo(() => {
    const m = new Map<string, { id: string; hours: number; codes: Set<string> }>();
    for (const r of result.rows) {
      const v = m.get(r.employeeId) ?? { id: r.employeeId, hours: 0, codes: new Set<string>() };
      if (r.status === 'ready') v.hours += r.eligibleHours;
      v.codes.add(r.sourceJobCode);
      m.set(r.employeeId, v);
    }
    return [...m.values()]
      .map((w) => ({ ...w, e: emps[w.id] }))
      .filter((w) => w.e && `${w.e.firstName} ${w.e.lastName} ${w.e.pbjEmployeeId}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.e!.lastName.localeCompare(b.e!.lastName));
  }, [result.rows, emps, q]);
  const idIssues = new Set(result.issues.filter((i) => i.ruleId === 'E103' || i.ruleId === 'E104').map((i) => i.employeeId));

  return (
    <div className="space-y-4">
      {unmapped.length > 0 && (
        <Card className="border-danger-200">
          <CardHeader title="Unmapped source job codes" subtitle="Worked hours exist for these codes but no PBJ mapping is effective on the work dates. These block export." />
          <ul className="divide-y divide-line">
            {unmapped.map((u) => {
              const role = ROLES.find((r) => r.sourceJobCode === u.sourceJobCode);
              return (
                <li key={u.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 size-4 text-danger-600" aria-hidden />
                    <div>
                      <p className="text-[13.5px] font-medium">
                        {u.sourceJobCode} · {role?.name}
                      </p>
                      <p className="text-xs text-muted">
                        {hrs(u.hours ?? 0)} worked hours on {u.timecardIds?.length ?? 0} timecards · {role ? DEPT_BY_ID[role.departmentId].name : ''}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!canMap}
                    title={canMap ? undefined : 'Your demo role cannot edit PBJ mappings'}
                    onClick={() => onMap({ facilityId: null, sourceJobCode: u.sourceJobCode!, pbjJobTitleCode: null, reportability: 'required', effectiveFrom: quarter.start, effectiveTo: null })}
                  >
                    Map job code
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Job mappings"
          subtitle={`Effective-dated mappings from source job codes to CMS PBJ job title codes. Current column shows the mapping effective ${fmtDate(asOf, { year: true })} at ${facility.shortName}. Not every department or role is PBJ-reportable.`}
          actions={
            canMap && (
              <Button size="sm" icon={Plus} onClick={() => onMap({ facilityId: null, sourceJobCode: '', pbjJobTitleCode: null, reportability: 'required', effectiveFrom: quarter.start, effectiveTo: null })}>
                Add mapping
              </Button>
            )
          }
        />
        <TableWrap maxHeight="560px">
          <thead>
            <tr>
              <th className="th">Source job</th>
              <th className="th">Department</th>
              <th className="th">Current CMS job title</th>
              <th className="th">Reportability</th>
              <th className="th">Mapping history (effective-dated)</th>
              <th className="th text-right">Hours this quarter</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => {
              const role = ROLES.find((r) => r.sourceJobCode === code)!;
              const list = mappings.filter((m) => m.sourceJobCode === code && (m.facilityId === null || m.facilityId === facility.id)).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
              const cur = effectiveMapping(mappings, facility.id, code, asOf);
              return (
                <tr key={code} className={!cur ? 'bg-danger-50/50' : undefined}>
                  <td className="td">
                    <span className="font-mono text-[12.5px] font-semibold">{code}</span>
                    <span className="block text-xs text-muted">{role.name}</span>
                  </td>
                  <td className="td text-muted">{DEPT_BY_ID[role.departmentId].name}</td>
                  <td className="td">{cur ? cur.pbjJobTitleCode ? `${cur.pbjJobTitleCode} — ${PBJ_TITLE_BY_CODE[cur.pbjJobTitleCode]?.title}` : <span className="text-muted">—</span> : <Badge tone="danger">Unmapped</Badge>}</td>
                  <td className="td">{cur ? <Badge tone={REPORT_LABEL[cur.reportability][1]}>{REPORT_LABEL[cur.reportability][0]}</Badge> : '—'}</td>
                  <td className="td">
                    <ul className="space-y-1">
                      {list.map((m: PbjJobMapping) => (
                        <li key={m.id} className="flex items-center gap-2 text-xs">
                          <span className="tabular text-muted">
                            {m.effectiveFrom} → {m.effectiveTo ?? 'open'}
                          </span>
                          <span>{m.pbjJobTitleCode ?? 'not reported'}</span>
                          {m.facilityId && <Badge tone="brand">{facility.shortName} only</Badge>}
                          {canMap && (
                            <button className="text-brand-700 hover:underline" onClick={() => onMap({ ...m })} aria-label={`Edit mapping ${m.sourceJobCode} from ${m.effectiveFrom}`}>
                              <Pencil className="inline size-3.5" aria-hidden />
                            </button>
                          )}
                          {m.note && <span className="truncate text-muted" title={m.note}>· {m.note.slice(0, 40)}{m.note.length > 40 ? '…' : ''}</span>}
                        </li>
                      ))}
                      {list.length === 0 && <li className="text-xs text-danger-700">No mapping on file</li>}
                    </ul>
                  </td>
                  <td className="td text-right tabular">{hoursByCode.has(code) ? hrs(hoursByCode.get(code)!) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </Card>

      <Card>
        <CardHeader
          title="Worker identifiers"
          subtitle="Stable, non-PII worker IDs used for PBJ. Agency and contract staff each need their own ID (Policy Manual §2.2.o)."
          actions={<SearchInput value={q} onChange={setQ} placeholder="Search workers" className="w-full sm:w-56" />}
        />
        <TableWrap maxHeight="420px">
          <thead>
            <tr>
              <th className="th">Worker</th>
              <th className="th">PBJ worker ID</th>
              <th className="th">Internal ID</th>
              <th className="th">Worker type</th>
              <th className="th">Pay type code</th>
              <th className="th">Source jobs</th>
              <th className="th text-right">Eligible hours</th>
            </tr>
          </thead>
          <tbody>
            {workers.map(({ e, hours, codes: c }) => (
              <tr key={e!.id} className={idIssues.has(e!.id) ? 'bg-danger-50/50' : undefined}>
                <td className="td">
                  <Link className="link" to={`/people/${e!.id}`}>
                    {e!.preferredName ?? e!.firstName} {e!.lastName}
                  </Link>
                </td>
                <td className="td font-mono text-[12.5px]">{e!.pbjEmployeeId || <Badge tone="danger">Missing</Badge>}</td>
                <td className="td font-mono text-[12.5px] text-muted">{e!.id}</td>
                <td className="td">
                  <WorkerTypeBadge type={e!.workerType} agency={e!.agencyName} />
                </td>
                <td className="td">{e!.payType ? `${{ exempt: 1, nonexempt: 2, contract: 3 }[e!.payType]} · ${e!.payType === 'nonexempt' ? 'Non-exempt' : e!.payType === 'exempt' ? 'Exempt' : 'Contract'}` : <Badge tone="danger">Missing</Badge>}</td>
                <td className="td font-mono text-xs">{[...c].join(', ')}</td>
                <td className="td text-right tabular">{hrs(hours)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}
