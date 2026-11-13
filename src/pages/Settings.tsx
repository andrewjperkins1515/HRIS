import { Check, RotateCcw, Save, X } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Callout, Card, CardHeader, Checkbox, ConfirmDialog, Field, Input, PageHeader, Select, TableWrap, Tabs } from '../components/ui';
import { SeverityBadge } from '../components/status';
import { DEPT_BY_ID, PBJ_REFERENCE, SHIFT_TYPE_LABEL } from '../domain/catalog';
import { ROLE_LABEL, ROLE_PERMISSIONS, type Permission } from '../domain/permissions';
import { DEFAULT_PBJ_RULES, PBJ_RULES, type PbjRuleConfig } from '../domain/pbj/rules';
import { tzAbbrev } from '../domain/time';
import type { Facility, RoleKey } from '../domain/types';
import { useCan, useScopedFacilities } from '../store/hooks';
import { usePoise } from '../store/store';
import { useRun } from '../store/useRun';

type Tab = 'facilities' | 'coverage' | 'pbj' | 'roles' | 'about';

function FacilityForm({ facility, editable }: { facility: Facility; editable: boolean }) {
  const update = usePoise((s) => s.updateFacility);
  const pattern = usePoise((s) => s.pbjRules.facilityIdPattern);
  const nowIso = usePoise((s) => s.demoNowIso);
  const run = useRun();
  const [d, setD] = useState(facility);
  const [base, setBase] = useState(facility);
  if (facility !== base) {
    setBase(facility);
    setD(facility);
  }
  const validId = !!d.pbjFacilityId && new RegExp(pattern).test(d.pbjFacilityId);
  const dirty = JSON.stringify(d) !== JSON.stringify(facility);
  return (
    <Card>
      <CardHeader
        title={facility.name}
        subtitle={`${facility.city}, ${facility.state}`}
        actions={
          editable && (
            <>
              {dirty && (
                <Button size="sm" onClick={() => setD(facility)}>
                  Discard
                </Button>
              )}
              <Button
                size="sm"
                variant="primary"
                icon={Save}
                disabled={!dirty || !d.name.trim()}
                onClick={() =>
                  run(
                    () =>
                      update(facility.id, {
                        name: d.name.trim(),
                        shortName: d.shortName.trim() || facility.shortName,
                        pbjFacilityId: d.pbjFacilityId.trim().toUpperCase(),
                        censusEstimate: Math.max(1, Math.round(d.censusEstimate)),
                        licensedBeds: Math.max(1, Math.round(d.licensedBeds)),
                        includeOptionalPbjCategories: d.includeOptionalPbjCategories,
                      }),
                    { success: 'Facility settings saved', successBody: 'PBJ checks use the updated values; rerun checks to record a run.' },
                  )
                }
              >
                Save
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Facility name" htmlFor={`${facility.id}-name`}>
          <Input id={`${facility.id}-name`} value={d.name} disabled={!editable} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label="Short name" htmlFor={`${facility.id}-short`}>
          <Input id={`${facility.id}-short`} value={d.shortName} disabled={!editable} onChange={(e) => setD({ ...d, shortName: e.target.value })} />
        </Field>
        <Field label="Time zone" hint="Read-only in the prototype. All schedules and punches are interpreted in this zone, including DST.">
          <Input value={`${facility.timeZone} (${tzAbbrev(nowIso, facility.timeZone)})`} disabled />
        </Field>
        <Field
          label="PBJ facility identifier"
          htmlFor={`${facility.id}-pbj`}
          error={!validId ? (d.pbjFacilityId ? 'Does not match the demo format (6–16 uppercase letters/digits).' : 'Missing — PBJ preparation is blocked (E101).') : null}
          hint="Demo format check only. Confirm the identifier required by current CMS PBJ specifications."
        >
          <Input id={`${facility.id}-pbj`} value={d.pbjFacilityId} disabled={!editable} placeholder="e.g. IL14W2208" onChange={(e) => setD({ ...d, pbjFacilityId: e.target.value.toUpperCase() })} className="font-mono" />
        </Field>
        <Field label="Planning census estimate" htmlFor={`${facility.id}-census`} hint="Internal monitoring only. CMS calculates census from MDS data.">
          <Input id={`${facility.id}-census`} type="number" min={1} value={d.censusEstimate} disabled={!editable} onChange={(e) => setD({ ...d, censusEstimate: Number(e.target.value) })} />
        </Field>
        <Field label="Licensed beds" htmlFor={`${facility.id}-beds`}>
          <Input id={`${facility.id}-beds`} type="number" min={1} value={d.licensedBeds} disabled={!editable} onChange={(e) => setD({ ...d, licensedBeds: Number(e.target.value) })} />
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Checkbox
            checked={d.includeOptionalPbjCategories}
            disabled={!editable}
            onChange={(v) => setD({ ...d, includeOptionalPbjCategories: v })}
            label="Include optional PBJ categories (e.g. housekeeping, code 39) in the demo export"
          />
        </div>
      </div>
    </Card>
  );
}

function CoverageTab({ editable }: { editable: boolean }) {
  const facilities = useScopedFacilities();
  const targets = usePoise((s) => s.coverageTargets);
  const update = usePoise((s) => s.updateCoverageTarget);
  return (
    <div className="space-y-4">
      <Callout tone="info" title="Facility-defined planning settings">
        Coverage targets are internal staffing plans used by the schedule and Overview. Meeting a target does not establish regulatory compliance.
      </Callout>
      {facilities.map((f) => (
        <Card key={f.id}>
          <CardHeader title={f.name} subtitle="Required headcount per day by department and shift" />
          <TableWrap>
            <thead>
              <tr>
                <th className="th">Department</th>
                <th className="th">Shift</th>
                <th className="th w-40">Planning target</th>
              </tr>
            </thead>
            <tbody>
              {targets
                .filter((t) => t.facilityId === f.id)
                .map((t) => (
                  <tr key={t.id}>
                    <td className="td">{DEPT_BY_ID[t.departmentId].name}</td>
                    <td className="td">{SHIFT_TYPE_LABEL[t.shiftType]}</td>
                    <td className="td">
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        aria-label={`${DEPT_BY_ID[t.departmentId].name} ${SHIFT_TYPE_LABEL[t.shiftType]} target`}
                        defaultValue={t.required}
                        disabled={!editable}
                        className="w-24"
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isNaN(v) && v !== t.required) update(t.id, v);
                        }}
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </TableWrap>
        </Card>
      ))}
    </div>
  );
}

function PbjRulesTab({ editable }: { editable: boolean }) {
  const rules = usePoise((s) => s.pbjRules);
  const updateRules = usePoise((s) => s.updatePbjRules);
  const toast = usePoise((s) => s.toast);
  const [d, setD] = useState<PbjRuleConfig>(rules);
  const dirty = JSON.stringify(d) !== JSON.stringify(rules);
  const num = (k: keyof PbjRuleConfig, label: string, hint?: string, scale = 1) => (
    <Field label={label} htmlFor={`r-${k}`} hint={hint}>
      <Input id={`r-${k}`} type="number" step="any" disabled={!editable} value={(d[k] as number) / scale} onChange={(e) => setD({ ...d, [k]: Number(e.target.value) * scale })} />
    </Field>
  );
  const save = () => {
    updateRules({ ...d, version: `${DEFAULT_PBJ_RULES.version} + local overrides` });
    toast({ tone: 'success', title: 'PBJ demo rule settings saved', body: 'The rule version changed, so prepared packages are now stale.' });
  };
  return (
    <div className="space-y-4">
      <Callout tone="warning" title="Illustrative, versioned rules">
        These demo rules interpret the{' '}
        <a className="link" href={PBJ_REFERENCE.url} target="_blank" rel="noreferrer">
          {PBJ_REFERENCE.source} {PBJ_REFERENCE.version} ({PBJ_REFERENCE.published})
        </a>
        . They are not CMS edit checks. Verify every rule against current official CMS specifications before production use.
      </Callout>
      <Card>
        <CardHeader
          title="Rule settings"
          subtitle={<>Active version: <span className="font-mono text-xs">{rules.version}</span></>}
          actions={
            editable && (
              <>
                <Button size="sm" icon={RotateCcw} onClick={() => { updateRules(DEFAULT_PBJ_RULES); setD(DEFAULT_PBJ_RULES); }}>
                  Restore defaults
                </Button>
                <Button size="sm" variant="primary" icon={Save} disabled={!dirty} onClick={save}>
                  Save
                </Button>
              </>
            )
          }
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Hours rounding" htmlFor="r-round" hint="§2.2.a allows tenths (conversion table) or hundredths.">
            <Select id="r-round" value={d.rounding} disabled={!editable} onChange={(e) => setD({ ...d, rounding: e.target.value as PbjRuleConfig['rounding'] })}>
              <option value="hundredths">Hundredths</option>
              <option value="tenths">Tenths (CMS conversion table)</option>
            </Select>
          </Field>
          {num('mealDeductionMinutes', 'Meal deduction (minutes)', 'Per qualifying shift, net of recorded breaks (§2.2.d).')}
          {num('mealDeductionThresholdMinutes', 'Apply meal deduction at (hours)', 'Demo threshold.', 60)}
          {num('maxDailyHours', 'Maximum hours per day', '§2.2.d note: 22.5.')}
          {num('reviewDailyHours', 'Review long days over (hours)')}
          {num('rnHoursPerDayIndicator', 'RN hours/day monitoring level')}
          {num('contractShareIndicatorPct', 'Contract share indicator (%)')}
          {num('weekendDropIndicatorPct', 'Weekend drop indicator (%)')}
        </div>
      </Card>
      <Card>
        <CardHeader title="Rule catalog" subtitle="Errors block approval; warnings need a reviewer decision; indicators are monitoring only." />
        <TableWrap>
          <thead>
            <tr>
              <th className="th">Rule</th>
              <th className="th">Type</th>
              <th className="th">Description</th>
              <th className="th">Basis</th>
            </tr>
          </thead>
          <tbody>
            {PBJ_RULES.map((r) => (
              <tr key={r.id}>
                <td className="td whitespace-nowrap">
                  <span className="font-mono text-xs font-semibold">{r.id}</span> {r.title}
                </td>
                <td className="td">
                  <SeverityBadge severity={r.severity} />
                </td>
                <td className="td text-muted">{r.description}</td>
                <td className="td text-xs text-muted">{r.basis}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}

function RolesTab() {
  const roles = Object.keys(ROLE_PERMISSIONS) as RoleKey[];
  const perms = [...new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r]))] as Permission[];
  return (
    <div className="space-y-4">
      <Callout tone="warning" title="Simulated permissions">
        Roles and permissions are simulated in the browser to demonstrate the centralized permission model (<span className="font-mono text-xs">domain/permissions.ts</span>). This is not production security. Production would use SSO and server-side authorization.
      </Callout>
      <Card>
        <TableWrap maxHeight="640px">
          <thead>
            <tr>
              <th className="th">Permission</th>
              {roles.map((r) => (
                <th key={r} className="th text-center">
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {perms.map((p) => (
              <tr key={p}>
                <td className="td font-mono text-xs">{p}</td>
                {roles.map((r) => (
                  <td key={r} className="td text-center">
                    {ROLE_PERMISSIONS[r].includes(p) ? <Check className="mx-auto size-4 text-ok-600" aria-label="Allowed" /> : <X className="mx-auto size-4 text-silver-400" aria-label="Not allowed" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}

function AboutTab() {
  const reset = usePoise((s) => s.resetDemo);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="About this prototype" subtitle="Poise (draft name) — workforce management & HRIS for long-term care" />
        <div className="space-y-3 p-4 text-[13.5px] text-muted">
          <p>All people, facilities and identifiers are fictional. Data are stored in this browser (localStorage) and shared across every screen through one data model.</p>
          <p className="font-medium text-ink">Simulated in the prototype</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Sign-in, roles and permissions (demo role selector)</li>
            <li>Demo clock fixed at Fri, Nov 13, 2026 (advance it from the timeclock)</li>
            <li>Lifecycle tasks: marking a task does not order background checks, create payroll transactions or revoke access</li>
            <li>Schedule publishing records an activity event; no notifications are sent</li>
            <li>PBJ rules are illustrative; the XML export is a demo and is not validated against the CMS schema</li>
          </ul>
          <p className="font-medium text-ink">Production integrations remaining</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>SSO / identity provider and server-side authorization</li>
            <li>Payroll system (earnings codes, final pay, pay periods)</li>
            <li>Physical timeclocks / mobile geofenced clocking</li>
            <li>Background check, exclusion list and license verification vendors</li>
            <li>Access provisioning (EHR, badge, timeclock)</li>
            <li>CMS PBJ XML generation validated against the official XSD; iQIES submission and Final File Validation Report retrieval</li>
            <li>Employee notifications (SMS / email / push)</li>
          </ul>
        </div>
      </Card>
      <Card>
        <CardHeader title="Demo data" />
        <div className="space-y-3 p-4 text-[13.5px] text-muted">
          <p>Reset restores the deterministic seed: two facilities, ~55 workers, six weeks of punches, and the scenarios used in the demo flows.</p>
          <Button variant="danger" icon={RotateCcw} onClick={() => setConfirm(true)}>
            Reset demo data
          </Button>
        </div>
      </Card>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => { reset(); setConfirm(false); }} title="Reset the demo?" body="All changes made in this browser will be discarded." confirmLabel="Reset demo" tone="danger" />
    </div>
  );
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'facilities';
  const facilities = useScopedFacilities();
  const editable = useCan('settings.edit');
  return (
    <div>
      <PageHeader title="Settings" description="Facility configuration, planning targets, PBJ demo rules and the simulated permission model." meta={!editable && <Badge tone="neutral">Read-only for your demo role</Badge>} />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
          tabs={[
            { value: 'facilities', label: 'Facilities' },
            { value: 'coverage', label: 'Coverage targets' },
            { value: 'pbj', label: 'PBJ rules' },
            { value: 'roles', label: 'Roles & permissions' },
            { value: 'about', label: 'About prototype' },
          ]}
        />
      </div>
      {tab === 'facilities' && (
        <div className="space-y-4">
          {facilities.map((f) => (
            <FacilityForm key={f.id} facility={f} editable={editable} />
          ))}
        </div>
      )}
      {tab === 'coverage' && <CoverageTab editable={editable} />}
      {tab === 'pbj' && <PbjRulesTab editable={editable} />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'about' && <AboutTab />}
    </div>
  );
}
