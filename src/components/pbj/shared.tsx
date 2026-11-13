import { CheckCircle2, CircleDashed, CircleSlash, Clock, RefreshCw, XCircle, type LucideIcon } from 'lucide-react';
import type { PbjResult, PbjRowStatus, PbjStatusSummary, PbjStepState } from '../../domain/pbj/engine';
import type { FiscalQuarter } from '../../domain/time';
import type { Facility, PbjPreparation } from '../../domain/types';
import { Badge, type Tone } from '../ui';

/** Everything a PBJ workflow step needs. */
export interface PbjCtx {
  facility: Facility;
  quarter: FiscalQuarter;
  result: PbjResult;
  prep: PbjPreparation | undefined;
  status: PbjStatusSummary;
}

export const STEP_ICON: Record<PbjStepState, [LucideIcon, string]> = {
  complete: [CheckCircle2, 'text-ok-600'],
  attention: [Clock, 'text-warn-600'],
  blocked: [XCircle, 'text-danger-600'],
  not_started: [CircleDashed, 'text-subtle'],
  stale: [RefreshCw, 'text-warn-600'],
  planned: [CircleSlash, 'text-subtle'],
};

const ROW: Record<PbjRowStatus, [string, Tone]> = {
  ready: ['Eligible', 'success'],
  needs_review: ['Needs review', 'warning'],
  blocked: ['Blocked', 'danger'],
  excluded: ['Excluded', 'neutral'],
};

export function RowStatusBadge({ status }: { status: PbjRowStatus }) {
  const [l, t] = ROW[status];
  return <Badge tone={t}>{l}</Badge>;
}

export function hrs(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtInstant(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }).format(Date.parse(iso));
}
