import type { EmployeeStatus, PbjIssueSeverity, TaskStatus, TimecardStatus, WorkerType } from '../domain/types';
import { Badge, type Tone } from './ui';

const EMP: Record<EmployeeStatus, [string, Tone]> = {
  onboarding: ['Onboarding', 'info'],
  active: ['Active', 'success'],
  leave: ['On leave', 'neutral'],
  offboarding: ['Offboarding', 'warning'],
  archived: ['Archived', 'neutral'],
};
export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  const [l, t] = EMP[status];
  return (
    <Badge tone={t} dot>
      {l}
    </Badge>
  );
}

export function WorkerTypeBadge({ type, agency }: { type: WorkerType; agency?: string }) {
  if (type === 'employee') return <Badge tone="neutral">Employee</Badge>;
  return <Badge tone="mint">{type === 'agency' ? 'Agency' : 'Contract'}{agency ? ` · ${agency}` : ''}</Badge>;
}

const TC: Record<TimecardStatus, [string, Tone]> = {
  open: ['Open', 'neutral'],
  pending_approval: ['Pending approval', 'warning'],
  approved: ['Approved', 'success'],
};
export function TimecardStatusBadge({ status }: { status: TimecardStatus }) {
  const [l, t] = TC[status];
  return <Badge tone={t}>{l}</Badge>;
}

const TASK: Record<TaskStatus, [string, Tone]> = {
  not_started: ['Not started', 'neutral'],
  in_progress: ['In progress', 'info'],
  done: ['Done', 'success'],
  blocked: ['Blocked', 'danger'],
  waived: ['Waived', 'neutral'],
};
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const [l, t] = TASK[status];
  return <Badge tone={t}>{l}</Badge>;
}

const SEV: Record<PbjIssueSeverity, [string, Tone]> = {
  error: ['Blocking error', 'danger'],
  warning: ['Review warning', 'warning'],
  indicator: ['Staffing indicator', 'info'],
};
export function SeverityBadge({ severity }: { severity: PbjIssueSeverity }) {
  const [l, t] = SEV[severity];
  return <Badge tone={t}>{l}</Badge>;
}

export const TONE_FOR_PBJ: Record<'success' | 'warning' | 'danger' | 'neutral' | 'info', Tone> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  neutral: 'neutral',
  info: 'info',
};
