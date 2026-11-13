import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { effectivePunches, PUNCH_LABEL } from '../../domain/timecards';
import { addDays, fmtDateTime, localDateOf, localTimeOf, tzAbbrev, zonedToUtc } from '../../domain/time';
import type { CorrectionChange, PunchType, Shift, Timecard } from '../../domain/types';
import { useFacilitiesById } from '../../store/hooks';
import { usePoise } from '../../store/store';
import { useRun } from '../../store/useRun';
import { Button, Callout, Field, IconButton, Input, Select, Textarea } from '../ui';

interface Row {
  target: string; // punch id or `add:${type}`
  date: string;
  time: string;
}

function defaultFor(target: string, tc: Timecard, shift: Shift | undefined, tz: string): Pick<Row, 'date' | 'time'> {
  if (target.startsWith('add:')) {
    const type = target.slice(4) as PunchType;
    if (shift) {
      const overnight = shift.end <= shift.start;
      if (type === 'out') return { date: overnight ? addDays(shift.date, 1) : shift.date, time: shift.end };
      if (type === 'in') return { date: shift.date, time: shift.start };
    }
    return { date: tc.workDate, time: '' };
  }
  const p = tc.punches.find((x) => x.id === target);
  return p ? { date: localDateOf(p.at, tz), time: localTimeOf(p.at, tz) } : { date: tc.workDate, time: '' };
}

/**
 * Punch correction form. Employees submit a request; managers (mode="manager") record and
 * approve a correction in one step. Original punches are always preserved.
 */
export function CorrectionForm({ timecard, mode, onDone, onCancel }: { timecard: Timecard; mode: 'request' | 'manager'; onDone: () => void; onCancel: () => void }) {
  const facs = useFacilitiesById();
  const tz = facs[timecard.facilityId].timeZone;
  const shift = usePoise((s) => s.shifts.find((x) => x.id === timecard.shiftId));
  const requestCorrection = usePoise((s) => s.requestCorrection);
  const managerCorrect = usePoise((s) => s.managerCorrect);
  const run = useRun();
  const punches = effectivePunches(timecard);
  const hasOut = punches.some((p) => p.type === 'out');
  const initialTarget = !hasOut ? 'add:out' : punches[0]?.id ?? 'add:in';
  const [rows, setRows] = useState<Row[]>([{ target: initialTarget, ...defaultFor(initialTarget, timecard, shift, tz) }]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const options = [
    ...punches.map((p) => ({ value: p.id, label: `Change ${PUNCH_LABEL[p.type].toLowerCase()} (${fmtDateTime(p.at, tz)})` })),
    ...(['in', 'out', 'break_start', 'break_end'] as PunchType[]).map((t) => ({ value: `add:${t}`, label: `Add missing ${PUNCH_LABEL[t].toLowerCase()}` })),
  ];

  const submit = () => {
    setError(null);
    const changes: CorrectionChange[] = [];
    for (const r of rows) {
      if (!r.date || !r.time) return setError('Enter a date and time for each change.');
      const correctedAt = zonedToUtc(r.date, r.time, tz);
      if (r.target.startsWith('add:')) changes.push({ punchType: r.target.slice(4) as PunchType, originalPunchId: null, originalAt: null, correctedAt });
      else {
        const p = timecard.punches.find((x) => x.id === r.target)!;
        if (p.at === correctedAt) return setError(`${PUNCH_LABEL[p.type]} is unchanged.`);
        changes.push({ punchType: p.type, originalPunchId: p.id, originalAt: p.at, correctedAt });
      }
    }
    if (reason.trim().length < 8) return setError('Enter a reason (at least 8 characters).');
    const fn = mode === 'manager' ? managerCorrect : requestCorrection;
    const r = run(() => fn({ timecardId: timecard.id, reason, changes }), {
      success: mode === 'manager' ? 'Correction recorded' : 'Correction request submitted',
      successBody: mode === 'manager' ? 'Original punches were preserved and marked superseded.' : 'Your manager will review it in Time & Attendance.',
    });
    if (r.ok) onDone();
  };

  return (
    <div className="space-y-3">
      {mode === 'manager' && (
        <Callout tone="info">
          Corrections add new punches and mark originals as superseded. The audit trail records you as reviewer, the timestamp, and original and corrected values.
        </Callout>
      )}
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <Field label="Punch" htmlFor={`corr-target-${i}`}>
            <Select
              id={`corr-target-${i}`}
              value={r.target}
              onChange={(e) => {
                const target = e.target.value;
                setRows(rows.map((x, j) => (j === i ? { target, ...defaultFor(target, timecard, shift, tz) } : x)));
              }}
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor={`corr-date-${i}`}>
            <Input id={`corr-date-${i}`} type="date" value={r.date} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
          </Field>
          <Field label={`Time (${tzAbbrev(zonedToUtc(timecard.workDate, '12:00', tz), tz)})`} htmlFor={`corr-time-${i}`}>
            <Input id={`corr-time-${i}`} type="time" value={r.time} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} />
          </Field>
          {rows.length > 1 ? <IconButton icon={Trash2} label="Remove change" onClick={() => setRows(rows.filter((_, j) => j !== i))} /> : <span />}
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={Plus} onClick={() => setRows([...rows, { target: 'add:break_start', date: timecard.workDate, time: '' }])}>
        Add another change
      </Button>
      <Field label="Reason" required htmlFor="corr-reason" hint="Required. Stored with the correction and shown in the audit history.">
        <Textarea id="corr-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Forgot to clock out; charge nurse confirmed departure at 7:00 AM." />
      </Field>
      <p className="text-xs text-muted">Times are entered in facility local time ({tz}).</p>
      {error && <Callout tone="danger">{error}</Callout>}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={submit}>
          {mode === 'manager' ? 'Save correction' : 'Submit request'}
        </Button>
      </div>
    </div>
  );
}
