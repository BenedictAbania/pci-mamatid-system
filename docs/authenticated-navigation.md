# Authenticated navigation and task flow

The October 2026 task redesign builds on the current local Expo 57 implementation. Shared navy, spacing, type, radius, and shadow tokens live in `src/lib/design-system.ts`. `AdminShell` supplies responsive navigation, identity, theme controls, scoped search, and print styles. The former royal-blue navigation and decorative photograph are replaced with muted navy and a simple road wordmark. No map is added.

| Role | Navigation | Home focus |
| --- | --- | --- |
| Administrator | Home, Roads, Results & Reports, Users, Settings | Authorized inventory, accounts, workflow overview, administrative tasks |
| Reviewer/CE | Home, Sampling Plans, Inspections to Review, Results | Unconfirmed authorized section plans and submitted independent review assignments |
| Field Inspector | Home, My Inspections | Assigned units, drafts, returned revisions; pending register only |
| Viewer | Overview, Published Results, Maintenance Priorities | Published Reviewer-approved snapshots and eligible published section priorities |

`access.ts` remains the route permission authority. `navigation.ts` reduces navigation without granting permissions. An Administrator still cannot access the field/review route. The legacy CRUD inspection route remains denied. Existing `/dashboard` and `/workspace` home URLs continue to work for their previously authorized roles. `/reports` redirects to `/pci-results?tab=history`; staff `/maintenance-plan` redirects to `/pci-results?tab=priorities`. Viewer priorities remain at `/maintenance-plan`. Results share current/history tabs, with a staff-only maintenance tab. Saved report URLs retain a destination.

## Authorized live data

`dashboard.ts` uses exact, head-only counts under the normal user session and existing RLS. Counts are independent of preview pages. Plans needing attention means authorized sections with `homogeneous_confirmed_by IS NULL`; it does not infer engineering readiness from geometry. Reviewer sample counts and registers explicitly filter their Reviewer ID and exclude self-assignment. Inspector queries explicitly filter their assignment ID. Home registers retain eight rows plus one lookahead; Inspector pending work covers planned/draft/returned, and Reviewer pending work covers submitted only. The primary Inspector action prioritizes returned work, then drafts, then planned units. The Reviewer primary action points to planning when no submission is waiting and plans require attention.

Home links open server-filtered inspection status queries. Text search is labeled as searching the loaded page. A sample task link can resolve one authorized unit outside the current page without moving its pagination cursor. Sampling attention filtering is explicitly labeled as filtering the current section page. Loading, successful zero, load failure with retry, and missing prerequisites remain distinct. Refresh clears prior totals; stale responses cannot repaint a new identity or role.

Viewer home requests no mutable inspection, profile, account, history-comment, or audit records. It uses the existing approved-result feeds, `lakad_report_summary`, and bounded `lakad_section_reports`. Current sample results require current/non-superseded snapshots; Viewer queries also require publication. Displayed result labels, measurements, photos, and CSV data come from saved approved snapshots. Section priorities use the existing eligible section-report service; a sample average is never presented as a section PCI. No publication or engineering-validation rule changes.

## Inspection sequence

1. Sample details: workflow status, Reviewer comments, required date/area/orientation, field-rule confirmation, optional notes/coordinates, and saved/unsaved state. Save and continue advances only after success.
2. Distress measurements: distress selection, units, severity, quantities, existing measurements, and edit/removal confirmation. An unsaved measurement must be added or discarded before continuing.
3. Photos: optional private evidence, preview/upload/removal, or discard a selection before proceeding. Existing file-size/type and authorization checks remain.
4. Review and submit: saved-input summary, explicit missing requirements, submission, or the assigned Reviewer's allowed decision. Calculation details and saved iteration traces are expanded on request, after the field task.

Failure preserves unsaved form input and explains retry/refresh. Workflow requests retain both input revision and action-version tokens. Submitted inputs remain read-only. Return, approval, correction, and publication use the existing workflow actions; no client flag can replace server validation.

The UI can render distress-specific descriptions from an optional live `severity_descriptions` catalog property while saving canonical `low`/`medium`/`high` values. The current catalog does not supply this property. Missing descriptions show an explicit guidance message; no ASTM wording or curve data was invented, copied into the app, or promoted. Supplying validated/licensed descriptions remains a separate data task.

## Verification

Run `npm run test:ui`, `npm test`, `npm run typecheck`, `npm run typecheck:calculation`, `npm run lint`, and `npm run build:web`. The UI suite exercises actual React Native Web DOM/effects with synthetic responses, exact role navigation at desktop/tablet/phone branches in both themes, keyboard drawer/tab behavior, data states, query scopes, task links, save/submit/return behavior, and report/CSV regressions. These checks do not prove browser pixel geometry, native-device behavior, screen-reader output, or printed-page appearance.

Print styles hide controls rather than report data rows; a selected historical snapshot prints independently of its register. Browser Print/Save PDF rendering still needs visual acceptance. Keep test evidence and real session checks in ignored `private-astm/`, with no credentials or ASTM references committed. No Supabase policy/schema or PCI arithmetic change belongs to this UI task.
