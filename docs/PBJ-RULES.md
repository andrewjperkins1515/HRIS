# PBJ demo rules — sources, interpretation and gaps

**Status: illustrative.** Poise's PBJ engine is a deterministic, versioned demo rule set. It
is **not** a reproduction of CMS iQIES edit checks. It has **not** been validated against
the PBJ XML data specifications or XSD. "No detected errors" means only that these demo
rules found nothing. It never means compliant.

## Sources consulted (November 13, 2026)

- CMS, *Electronic Staffing Data Submission Payroll-Based Journal Long-Term Care Facility
  Policy Manual*, **Version 2.8, August 2026**:
  https://www.cms.gov/files/document/pbj-policy-manual-v2-8-august-2026.pdf
  - §1.2: Federal fiscal quarters. Submissions are due by the end of the 45th calendar day
    after quarter end (11:59 PM ET). Facilities should check the Final File Validation
    Report in iQIES.
  - §2.1: Each staff member, including agency and contract staff, gets a unique, stable
    employee ID without PII. Hire and termination dates are optional and reported per
    facility.
  - §2.2.a: Hours are entered in tenths (using the minute conversion table) or hundredths.
  - §2.2.b: Hours are reported by calendar day, with midnight as the cutoff.
  - §2.2.c: Report hours paid to deliver services. Exclude leave and non-work absences.
  - §2.2.d: Deduct at least 30 minutes per shift for meals, whether or not the break was
    taken. No more than 22.5 hours per ID per day.
  - §2.2.j: Staff in training who are unavailable for their primary role are not reported.
  - §2.2.o: Pay type codes are 1 exempt, 2 non-exempt, 3 contract.
  - §2.3 Table 1: Job title codes 1–40. Codes 32, 33, 35–40 are optional. That includes 39,
    Housekeeping Service Worker.
  - §2.4: CMS computes census from MDS data.

The job title table in `src/domain/catalog.ts` was transcribed from Table 1 of v2.8.

## Rule set `poise-demo-pbj-rules 0.3 (2026-11)`

Defined in `src/domain/pbj/rules.ts`. Thresholds are configurable in Settings → PBJ rules.

| Rule | Severity | Demo behavior | Basis |
| --- | --- | --- | --- |
| E101 | Error | The facility identifier must exist and match a *demo* format `^[A-Z0-9]{6,16}$` | Demo placeholder. Confirm the official identifier and format |
| E102 | Error | Worked hours have no effective job mapping on the work date | §2.2.e, §2.2.m |
| E103 | Error | A worker ID is missing or duplicated | §2.1.a |
| E104 | Error | Pay type is missing | §2.2.o |
| E105 | Error | A timecard is not approved (Poise policy: only approved time is eligible) | Poise policy |
| E106 | Error | A punch is missing (no in, no out, or an open break) | Poise policy |
| E107 | Error | More than 22.5 hours for one worker on one day | §2.2.d note |
| E108 | Error | Worked time overlaps across records | Data quality |
| W201 | Warning | The meal deduction was applied because the break was missing or short | §2.2.d |
| W202 | Warning | The pay code suggests orientation or training | §2.2.c, §2.2.j |
| W203 | Warning | Hours fall outside the hire or separation dates | Data quality |
| W204 | Warning | More than 16 hours in a day | Review threshold |
| W205 | Warning | An agency or contract worker has no agency name | Audit support |
| I301–I304 | Indicator | RN hours per day, weekend drop, contract share, nursing hours per resident day (estimate) | Facility monitoring only. These are not data errors |

### Interpretation choices to confirm before production

- **Meal deduction.** The demo deducts `max(0, 30 − recorded break)` minutes from shifts of
  6 hours or more, taken from the day segment with the most hours. The manual expects
  deductions on shorter shifts too, and two deductions on 16- and 17-hour double shifts.
  Facility policy for shorter shifts and doubles still needs to be defined.
- **Reportability.** Each source job code is mapped as required, optional, or not reported,
  and mappings are effective-dated. Department alone never decides reportability.
  - Dietary aides are "not reported" by default. They become Paid Feeding Assistants (17)
    only when qualified and feeding residents.
- **Optional categories.** Code 39 (housekeeping, laundry, maintenance) is excluded unless a
  facility opts in.
- **Census.** CMS derives census from MDS data. The planning census in Poise is used only
  for an internal indicator.
- **Exempt staff.** The demo assumes everyone clocks in. Salaried staff who don't clock in
  need a "paid hours" source and a documented method (§2.2.c, §2.2.f).
- **Corporate staff and co-located facilities** (§2.2.h, §2.2.i) are not modeled.

## Gaps before production

1. Get the current **PBJ XML data specifications and XSD** from the CMS Staffing Data
   Submission PBJ page. Implement export against them, and validate every file against the
   XSD in CI and at export time. The current XML is a labeled demo
   (`Demo — not validated for CMS submission`).
2. Map the iQIES submission-time edit checks and Final File Validation Report messages to
   Poise rules and severities.
3. Confirm the facility identifier fields and formats used in the PBJ file header.
4. Add employee ID linking for ID changes (§2.1.g) and handle rehire ID reuse.
5. Make sure the rule-set version is pinned per reporting quarter. Rule changes must not
   silently change a submitted quarter.
6. **iQIES integration:** submission IDs, validation report ingestion, rejected records,
   corrections, and resubmission tracking. It is shown as planned in the UI. Poise never
   shows fabricated CMS receipts.
