# Prototype notes

## Simulated in this prototype

| Area | Prototype behavior | Production need |
| --- | --- | --- |
| Sign-in and roles | A role switcher and a client-side permission table | SSO (SAML/OIDC), server-side authorization, facility/department scoping, audit |
| Persistence | Browser `localStorage`, per browser | API plus database, multi-user concurrency, retention policy |
| Notifications | An in-app "needs attention" list only. Publishing a schedule sends nothing | SMS, push, and email delivery with opt-in and quiet hours |
| Background checks, OIG/state exclusion checks, license verification | Checklist placeholders. Checking a task orders nothing | Integrations with screening vendors, state registries, and Nursys |
| Payroll | "Payroll handoff" tasks only. No transactions are created | Payroll integration (pay codes, final pay, accrual balances) |
| Access provisioning and revocation | Checklist tasks only | Identity and EHR provisioning (SCIM) and badge systems |
| Timeclock | A browser button plus a simulated demo clock | Kiosk or mobile clock with geofence/biometric options and device management |
| Agency hours | CSV import with column mapping | Agency/VMS feeds and invoice reconciliation |
| PBJ export | Demo XML, not schema-validated | Spec-conformant XML validated against the official XSD |
| PBJ submission | A manual record the user enters | iQIES workflow: submission IDs, Final File Validation Report, rejections, resubmission |
| Census | Planning estimate | MDS-derived census or CMS reports |

## Time handling

- Punches are stored as UTC instants. Schedules are stored as the facility's local date and
  wall-clock time in its IANA time zone (`src/domain/time.ts`).
- Shifts that cross midnight are split at local midnight for daily totals and PBJ.
- Daylight saving is handled explicitly. Tests in `src/domain/__tests__/domain.test.ts` cover:
  - fall-back (9-hour night shift on Oct 31 → Nov 1, 2026)
  - spring-forward (7-hour shift)
  - nonexistent local times
- Worked time, breaks, and nonworked or paid leave are separate records. Paid leave never
  becomes worked or PBJ hours.

## Data model

See `src/domain/types.ts`. Business rules live in pure functions under `src/domain/`.
The store (`src/store/store.ts`) holds the actions and persistence.
