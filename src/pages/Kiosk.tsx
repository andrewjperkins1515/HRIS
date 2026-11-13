import { Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ClockPanel } from '../components/time/ClockPanel';
import { Callout, Card, EmptyState, Field, PageHeader, SearchInput, Select } from '../components/ui';
import { employeeName, roleName, useFacilitiesById, useScopedEmployees, useScopedFacilityIds } from '../store/hooks';

/** Shared timeclock kiosk (demo). Lets managers demonstrate punches for any worker in scope. */
export default function KioskPage() {
  const employees = useScopedEmployees();
  const facs = useFacilitiesById();
  const scopedIds = useScopedFacilityIds();
  const clockable = useMemo(
    () => employees.filter((e) => e.status === 'active' || e.status === 'offboarding').sort((a, b) => employeeName(a).localeCompare(employeeName(b))),
    [employees],
  );
  const [q, setQ] = useState('');
  const [empId, setEmpId] = useState(() => (clockable.some((e) => e.id === 'E-10011') ? 'E-10011' : clockable[0]?.id ?? ''));
  const emp = clockable.find((e) => e.id === empId);
  const facOptions = emp ? [emp.primaryFacilityId, ...emp.additionalFacilityIds].filter((f) => scopedIds.includes(f)) : [];
  const [facilityId, setFacilityId] = useState<string>('');
  const fId = facOptions.includes(facilityId) ? facilityId : facOptions[0];
  const filtered = clockable.filter((e) => !q || employeeName(e).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Timeclock kiosk"
        description="Demo of a shared facility timeclock. In production, workers would identify themselves with a badge or PIN; here you choose any worker in your scope."
      />
      <Callout tone="warning" className="mb-4">
        Prototype only — no badge, PIN or biometric verification is performed, and punches are stored in this browser.
      </Callout>
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <Card className="p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Find worker" />
          <ul className="mt-2 max-h-[60vh] overflow-y-auto">
            {filtered.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => setEmpId(e.id)}
                  className={`w-full rounded-md px-2.5 py-1.5 text-left text-[13px] ${e.id === empId ? 'bg-brand-50 text-brand-800' : 'hover:bg-canvas'}`}
                >
                  <span className="block font-medium">{employeeName(e)}</span>
                  <span className="block text-xs text-muted">
                    {roleName(e.roleId)} · {facs[e.primaryFacilityId].shortName}
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-2 py-4 text-center text-xs text-muted">No workers match.</li>}
          </ul>
        </Card>
        <div className="space-y-3">
          {emp && fId ? (
            <>
              {facOptions.length > 1 && (
                <Field label="Clocking at facility" htmlFor="kiosk-fac">
                  <Select id="kiosk-fac" value={fId} onChange={(e) => setFacilityId(e.target.value)} className="max-w-xs">
                    {facOptions.map((f) => (
                      <option key={f} value={f}>
                        {facs[f].name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <ClockPanel employeeId={emp.id} facilityId={fId} />
            </>
          ) : (
            <Card>
              <EmptyState icon={Timer} title="Choose a worker" body="Select a worker to clock in or out." />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
