# Poise — HRIS & workforce management prototype

> **Prototype. Fictional data only.** Sign-in and permissions are simulated in the browser
> and are **not** production security. "Poise" is a working name.

Poise is an interactive prototype of a workforce management and HRIS platform for
long-term care facilities and multi-facility operators. It connects employee onboarding
and offboarding, department scheduling, timekeeping, and Payroll Based Journal (PBJ)
preparation on one shared data model.

It is meant for reviews with facility administrators, directors of nursing, HR teams,
schedulers, and corporate leadership.

## Run it

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # domain tests (time math, DST, overlaps, PBJ engine, facility filtering)
npm run build      # type-check + production build into dist/
```

The demo state is saved in browser `localStorage`. Use **Reset demo** in the top bar to
restore the seed data.

**Demo date:** Friday, November 13, 2026, 2:45 PM Eastern. A simulated **demo clock** drives
all screens. Use the Kiosk or self-service clock to advance it.

## Demo roles

Switch roles from the header or the profile menu. Each role sees different navigation
and actions, all decided by one permission table (`src/domain/permissions.ts`).

| Role | Persona | Scope |
| --- | --- | --- |
| Corporate administrator | Alex Morgan | All facilities, everything |
| Facility administrator | Denise Carter | Cedar Ridge only |
| HR manager | Lauren Pierce | All facilities: people, lifecycle, credentials |
| Department manager / scheduler | Kim Tran | Cedar Ridge Nursing: scheduling, timecards |
| PBJ reviewer | Sam Patel | All facilities: PBJ mapping, validation, export |
| Employee | Maria Alvarez (CNA) | Self-service (mobile-friendly) |

## Connected demo flows

1. **Create an employee and complete onboarding.** People → Add employee → complete the
   checklist and verify credentials → Complete onboarding. The status becomes Active and
   the employee can be scheduled.
2. **Assign and publish an open shift.** Scheduling → next week → open shift → pick an
   eligible employee. Ineligible employees show the reasons. Then Publish (an activity
   event is recorded; no notifications are sent).
3. **Clock in and out as an employee.** Switch to Employee → Clock in → advance the demo
   clock → break → Clock out. The timecard appears in the manager's approval queue.
4. **Resolve a missing punch and approve the timecard.** Time & Attendance → Exceptions →
   James Okafor 11/11 → add the missing clock-out with a reason → Approve. The original
   punches are preserved.
5. **Resolve a PBJ mapping issue, rerun checks, download a review package.** PBJ → Cedar
   Ridge → map `RNA` (Restorative Aide) → Rerun checks → Download review package.
6. **Start offboarding and review future-shift impact.** People → an employee → Start
   offboarding → review future shifts after the separation date → release them →
   finish the tasks → Archive. History is retained.

## Seeded scenarios

- Two facilities in different time zones: Cedar Ridge (Columbus, OH, Eastern) and Willow
  Bend (Springfield, IL, Central).
- Six weeks of punches (Oct 1 – Nov 13), including the Nov 1 DST change. A night shift
  that spans it is 9 hours.
- Departments: Nursing, Administration, Dietary, EVS, Laundry, Maintenance, Activities,
  Social Services, Therapy. Includes employees, agency workers, and contract workers.
- Onboarding: Jordan Lee (blocked on TB screening) and Aisha Rahman.
- Offboarding: Gloria Benson. She still has a shift after her separation date.
- Expired CPR (Victor Hughes) and an expiring RN license (Priya Nair).
- Open shifts, an overlapping assignment (Tom Reyes, Tue Nov 17), and overnight and 12-hour
  shifts.
- A missing clock-out (James Okafor) and a pending correction request (Dana Whitfield).
- PBJ issues:
  - Unmapped job code `RNA`.
  - Missing facility identifier at Willow Bend.
  - Orientation pay code needing review.
  - Agency worker without an agency name.
  - Staffing-monitoring indicators.

## Architecture

```
src/
  domain/            pure business logic (no React) — swap the store for APIs later
    types.ts         shared data model
    time.ts          facility time zones, DST-safe conversions, midnight splits, fiscal quarters
    timecards.ts     worked-time calculation, exceptions, approval rules
    scheduling.ts    eligibility, overlaps, coverage, overtime
    lifecycle.ts     onboarding/offboarding checklists, dependencies, readiness
    permissions.ts   centralized simulated permission model
    catalog.ts       departments, roles, CMS PBJ job title codes (versioned reference data)
    pbj/             rules.ts (versioned demo rules), engine.ts (validation & eligibility),
                     export.ts (export service boundary, demo XML, review report), importer.ts
  data/seed.ts       deterministic fictional seed data
  store/             Zustand store (actions + localStorage persistence), read hooks, insights
  components/        app shell, UI kit
  pages/             screens
```

Data layers are kept separate on purpose:

1. **Source punches.** Originals are never deleted. Corrections supersede them.
2. **Approved timecards.**
3. **PBJ eligibility and transformations.** These include the midnight split, meal deduction, and mapping.
4. **Export snapshots.** Each one is fingerprinted.
5. **Submission records.** These are entered by the user. Poise never fabricates CMS results.

Scheduled hours never become worked or PBJ hours. When source data changes after
approval or export, the PBJ package is marked stale.

## What is simulated, and production integrations that remain

See [`docs/PROTOTYPE-NOTES.md`](docs/PROTOTYPE-NOTES.md) and
[`docs/PBJ-RULES.md`](docs/PBJ-RULES.md).
