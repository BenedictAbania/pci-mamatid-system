# LAKAD authenticated system — implementation record

## Inspected baseline (15 September 2026)

- Branch `develop`; untracked `temp_feature.tsx` and `temp_prototype.tsx` untouched.
- Expo 57 / RN 0.86 / Expo Router. Existing branded login, public prototype, admin
  dashboard, inventory, inspections, PCI results, maintenance, users, reports, settings.
  Reuse `admin-shell.tsx`, light/dark palette, LAKAD.png and lakad_hero_bg.jpg.
- AuthProvider reads profiles.role: admin, reviewer, encoder, viewer. Existing routes
  check session only and admin components reject other roles.
- Database: profiles, branches, sections, sample_units, distress_types, distress_records,
  distress_photos, deduct_value_points. All eight have RLS enabled. Existing SELECT
  policies expose all rows to authenticated users. Encoder writes target owned drafts.
- No assignment, activation, immutable computation or verified approval guard exists.
- Private Storage bucket `sample-unit-photos`; no Storage policies returned.
- Distress catalog and DV points both empty; no CDV table. pci-engine.ts is illustrative.

## Implementation checklist

- Role-safe navigation and robust profile loading.
- Additive migrations, restrictive RLS, assignments and server-enforced workflow.
- Field forms, evidence, submission, return, resubmission and reference-pending guard.
- Engineer-confirmed planning and secure account controls.
- Approved-only overview, maps and reports.
- Automated checks and manual testing guide with engineering limitations.

## Boundaries

No remote writes, migration application, push, merge or deployment without permission.
No illustrative DV/CDV becomes official. Verified licensed reference data, tested
adapter and civil-engineer sign-off are required before approval. An edition setting
is not verification. Missing references must not silently become zero or PCI 100.
Homogeneous boundaries remain engineer-defined. New features require local migrations.
