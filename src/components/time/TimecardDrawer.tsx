import clsx from 'clsx';
import { CheckCircle2, Coffee, PencilLine, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DEPT_BY_ID, PAY_CODES } from '../../domain/catalog';
import { calcTimecard, canApprove, PUNCH_LABEL } from '../../domain/timecards';
import { fmtDate, fmtDateTime, fmtDuration, tzAbbrev } from '../../domain/time';
import { employeeName, roleName, useCan, useFacilitiesById } from '../../store/hooks';
import { usePoise } from '../../store/store';
import { useRun } from '../../store/useRun';
import { TimecardStatusBadge } from '../status';
import { Badge, Button, Callout, Drawer, Field, KeyValue, Modal, Textarea } from '../ui';
import { CorrectionForm } from './CorrectionForm';
import { ActualRange, hoursText, ScheduledRange, varianceText } from './format';

export function TimecardDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { timecards, shifts, corrections, employees, nonWorked, audit, nowIso, approveTimecards, reopenTimecard, markBreakReviewed } = usePoise(
    useShallow((s) => ({
      timecards: s.timecards,
      shifts: s.shifts,
      corrections: s.corrections,
      employees: s.employees,
      nonWorked: s.nonWorked,
      audit: s.audit,
      nowIso: s.demoNowIso,
      approveTimecards: s.approveTimecards,
      reopenTimecard: s.reopenTimecard,
      markBreakReviewed: s.markBreakReviewed,
    })),
  );
  const facs = useFacilitiesById();
  const canApproveP = useCan('time.approve');
  const canCorrect = useCan('time.correct');
  const run = useRun();
  const [correcting, setCorrecting] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const tc = timecards.find((t) => t.id === id);
  const data = useMemo(() => {
    if (!tc) return null;
    const shift = shifts.find((s) => s.id === tc.shiftId);
    const f = facs[tc.facilityId];
    const calc = calcTimecard(tc, { timeZone: f.timeZone, nowMs: Date.parse(nowIso), shift, pendingCorrections: corrections });
    const corrs = corrections.filter((c) => c.timecardId === tc.id);
    const corrIds = new Set(corrs.map((c) => c.id));
    const events = audit.filter((a) => a.entityId.split(',').includes(tc.id) || corrIds.has(a.entityId));
    const leave = nonWorked.filter((n) => n.employeeId === tc.employeeId && n.date === tc.workDate);
    return { shift, f, calc, corrs, events, leave, emp: employees.find((e) => e.id === tc.employeeId) };
  }, [tc, shifts, facs, nowIso, corrections, audit, nonWorked, employees]);

  if (!tc || !data) return <Drawer open={!!id} onClose={onClose} title="Timecard not found" />;
  const { shift, f, calc, corrs, events, leave, emp } = data;
  const tz = f.timeZone;
  const approval = canApprove(tc, calc);
  const v = varianceText(calc.varianceMinutes);
  const breakIssue = calc.exceptions.some((e) => e.code === 'no_break' || e.code === 'short_break');
  const sorted = [...tc.punches].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return (
    <Drawer
      open={!!id}
      onClose={() => {
        setCorrecting(false);
        onClose();
      }}
      width="lg"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {employeeName(emp)} · {fmtDate(tc.workDate, { weekday: true, year: true })} <TimecardStatusBadge status={tc.status} />
        </span>
      }
      subtitle={`${f.name} · ${DEPT_BY_ID[tc.departmentId].name} · ${roleName(tc.roleId)} · times in ${tz} (${tzAbbrev(sorted[0]?.at ?? nowIso, tz)})`}
      footer={
        correcting ? undefined : (
          <>
            {canApproveP && breakIssue && !tc.breakReviewed && (
              <Button icon={Coffee} onClick={() => markBreakReviewed(tc.id)}>
                Mark break reviewed
              </Button>
            )}
            {canCorrect && tc.status !== 'approved' && (
              <Button icon={PencilLine} onClick={() => setCorrecting(true)}>
                Correct punches
              </Button>
            )}
            {canApproveP && tc.status === 'approved' && (
              <Button icon={RotateCcw} onClick={() => setReopenOpen(true)}>
                Reopen
              </Button>
            )}
            {canApproveP && tc.status !== 'approved' && (
              <Button variant="primary" icon={CheckCircle2} disabled={!approval.ok} title={approval.reason} onClick={() => run(() => approveTimecards([tc.id]), { success: 'Timecard approved', successBody: 'It is now eligible for PBJ preparation.' })}>
                Approve
              </Button>
            )}
          </>
        )
      }
    >
      {correcting ? (
        <CorrectionForm timecard={tc} mode="manager" onCancel={() => setCorrecting(false)} onDone={() => setCorrecting(false)} />
      ) : (
        <div className="space-y-5">
          {calc.exceptions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {calc.exceptions.map((e) => (
                <Badge key={e.code} tone={e.severity === 'blocking' ? 'danger' : 'warning'}>
                  {e.label}
                </Badge>
              ))}
              {tc.breakReviewed && <Badge tone="success">Break reviewed</Badge>}
            </div>
          )}
          {!approval.ok && tc.status !== 'approved' && <Callout tone={calc.onClock ? 'info' : 'warning'}>{approval.reason}</Callout>}

          <KeyValue
            cols={3}
            items={[
              { k: 'Scheduled', v: <ScheduledRange shift={shift} /> },
              { k: 'Actual', v: <ActualRange calc={calc} tc={tc} tz={tz} /> },
              { k: 'Variance (worked vs scheduled paid)', v: <span className={v.tone}>{v.text}</span> },
              { k: 'Worked hours', v: <span className="font-semibold tabular">{hoursText(calc.workedMinutes)}</span> },
              { k: 'Recorded breaks', v: calc.breakMinutes ? fmtDuration(calc.breakMinutes) : 'None' },
              { k: 'Scheduled paid hours', v: shift ? hoursText(calc.scheduledMinutes) : '—' },
              { k: 'Source', v: `${tc.source}${tc.importBatchId ? ` · ${tc.importBatchId}` : ''}` },
              { k: 'Pay code', v: tc.sourcePayCode ? `${tc.sourcePayCode} — ${PAY_CODES[tc.sourcePayCode]?.label ?? ''}` : 'REG (worked)' },
              { k: 'Approved', v: tc.approvedBy ? `${tc.approvedBy} · ${fmtDateTime(tc.approvedAt!, tz)}` : '—' },
            ]}
          />
          <Callout tone="neutral">
            Scheduled hours never become worked or PBJ hours. Worked time comes only from punches; approval makes this timecard eligible for PBJ preparation.
          </Callout>

          <section>
            <h3 className="mb-2 text-[13.5px] font-semibold">Punches</h3>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    <th className="th">Punch</th>
                    <th className="th">Time</th>
                    <th className="th">Source</th>
                    <th className="th">Recorded</th>
                    <th className="th">State</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => (
                    <tr key={p.id} className={clsx(p.supersededBy && 'text-subtle')}>
                      <td className={clsx('td', p.supersededBy && 'line-through')}>{PUNCH_LABEL[p.type]}</td>
                      <td className={clsx('td tabular', p.supersededBy && 'line-through')}>{fmtDateTime(p.at, tz)}</td>
                      <td className="td">{p.source}</td>
                      <td className="td text-xs text-muted">
                        {p.recordedBy}
                        <br />
                        {fmtDateTime(p.recordedAt, tz)}
                      </td>
                      <td className="td">{p.supersededBy ? <Badge>Superseded · {p.supersededBy}</Badge> : p.correctionId ? <Badge tone="brand">Correction</Badge> : <Badge tone="success">Original</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-xs text-muted">Original punches are retained. Superseded punches are excluded from worked-time calculations.</p>
          </section>

          <section>
            <h3 className="mb-2 text-[13.5px] font-semibold">Paid leave &amp; nonworked time this date</h3>
            {leave.length === 0 ? (
              <p className="text-[13px] text-muted">None recorded.</p>
            ) : (
              <ul className="space-y-1 text-[13px]">
                {leave.map((n) => (
                  <li key={n.id}>
                    {n.category} · {n.hours.toFixed(2)}h {n.paid ? '(paid)' : '(unpaid)'} — kept separate from worked hours; never PBJ hours.
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[13.5px] font-semibold">Correction history</h3>
            {corrs.length === 0 ? (
              <p className="text-[13px] text-muted">No corrections.</p>
            ) : (
              <ul className="space-y-2">
                {corrs.map((c) => (
                  <li key={c.id} className="rounded-md border border-line p-3 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {c.id} · requested by {c.requestedBy}
                      </span>
                      <Badge tone={c.status === 'approved' ? 'success' : c.status === 'rejected' ? 'danger' : 'warning'}>{c.status}</Badge>
                    </div>
                    <p className="mt-1 text-muted">“{c.reason}”</p>
                    <ul className="mt-1.5 space-y-0.5 tabular">
                      {c.changes.map((ch, i) => (
                        <li key={i}>
                          {PUNCH_LABEL[ch.punchType]}: <span className="line-through">{ch.originalAt ? fmtDateTime(ch.originalAt, tz) : 'none'}</span> → <span className="font-medium">{fmtDateTime(ch.correctedAt, tz)}</span>
                        </li>
                      ))}
                    </ul>
                    {c.reviewer && (
                      <p className="mt-1 text-xs text-muted">
                        Reviewed by {c.reviewer} · {fmtDateTime(c.reviewedAt!, tz)}
                        {c.reviewerNote ? ` — ${c.reviewerNote}` : ''}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[13.5px] font-semibold">Audit history</h3>
            {events.length === 0 ? (
              <p className="text-[13px] text-muted">No audit events recorded in this demo session for this timecard.</p>
            ) : (
              <ol className="space-y-1.5 border-l border-line pl-3 text-[13px]">
                {events.map((e) => (
                  <li key={e.id}>
                    <span className="font-medium">{e.action}</span> · {e.actor} · <span className="text-muted">{fmtDateTime(e.at, tz)}</span>
                    <p className="text-xs text-muted">{e.detail}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
      <Modal
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        title="Reopen approved timecard"
        size="sm"
        footer={
          <>
            <Button onClick={() => setReopenOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                const r = run(() => reopenTimecard(tc.id, reopenReason), { success: 'Timecard reopened', successBody: 'It is no longer PBJ-eligible until approved again.' });
                if (r.ok) {
                  setReopenOpen(false);
                  setReopenReason('');
                }
              }}
            >
              Reopen
            </Button>
          </>
        }
      >
        <Field label="Reason" required htmlFor="reopen-reason" hint="Reopening removes PBJ eligibility and marks prepared PBJ packages stale.">
          <Textarea id="reopen-reason" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
        </Field>
      </Modal>
    </Drawer>
  );
}
