# LAKAD role dashboards

The current task-focused navigation, muted navy theme, and inspection sequence supersede the earlier visual layout below. See [Authenticated navigation and task flow](authenticated-navigation.md) for the current specification and query scopes.

`src/app/dashboard.tsx` and `src/app/workspace.tsx` render the same `RoleDashboard`. Existing home routes and permissions in `access.ts` remain authoritative. The dashboard offers navigation to existing authorized screens; it does not approve, return, calculate or publish records.

The shared shell reuses `LAKAD.png` and `lakad_hero_bg.jpg`. Presentation tokens in `design-system.ts` cover light/dark palettes, typography, spacing, corners, shadows and breakpoints. Shared dashboard parts provide metric cards, panel headers, notices, resource states, workflow badges and progress rows. Desktop uses four metrics and two panel columns when available width permits; tablet uses two metrics and stacked panels; narrow phones use one metric and stacked register fields. Navigation becomes a dismissible drawer with web keyboard focus containment and Escape/focus restoration. No map or implicit demo mode is included.

| Role | Dashboard scope and actions |
| --- | --- |
| Administrator | Authorized inventory totals, all current workflow revisions, account count/management, eligible approved snapshots and reports. No engineering review authority. |
| Encoder | Assigned sample units, drafts, returned and submitted revisions; assigned-inspection navigation. Approved-result and priority panels explain the role limitation. |
| Reviewer | Planning inventory, sample units assigned for review, submitted queue, current eligible approvals and reports; links to sample planning and authorized review screen. |
| Viewer | Current published Reviewer-approved snapshots, published report history, eligible published section rankings and reports. No mutable inventory, inspection, account, audit or internal-comment queries. |

## Live data and eligibility

`src/lib/data/dashboard.ts` uses normal authenticated Supabase clients. Database RLS is preserved. [Exact counts with head-only requests](https://supabase.com/docs/reference/javascript/select) cover each full authorized scope rather than the eight-row register or three-row result preview. Encoder and Reviewer sample queries also explicitly filter `assigned_to` or `reviewer_id`. Inventory counts retain the authorized inventory scope, independently of sample assignments. Account counts are Administrator-only. Saved provisional computations are counted via their actual `verification = pending` status, not promoted into result totals.

`lakad_report_summary` supplies the full current-approved sample count and average under RLS. Publication totals explicitly require `is_current`, no superseding timestamp and a publication timestamp. The Viewer applies publication filters to every approved-result table query. Current previews also pass `currentApprovedResults`; road names, measurements and labels come from immutable `report_snapshot`, not live inventory. Published history is a separate count and remains accessible in the existing paginated Reports screen.

`lakad_section_reports(page_size: 3)` supplies the top three priorities from the full eligible ranking. Its existing backend predicates reject missing/superseded sample approvals and require publication for Viewer access. The dashboard does not equate a sample PCI average with section PCI or count a preview as a section total.

The staff register requests nine units, retains eight, and uses the ninth to determine continuation. Its stable ID cursor avoids offsets and UUID cursor injection. Related section labels are fetched only for the current page's section IDs. Rows are labeled as current saved revisions in ID order, not falsely described as the latest chronological records or an invented inspection cycle. Full workflows are available through authorized action buttons.

## States and safeguards

Loading, successful empty, request error and missing prerequisite/role unavailability are distinct resource states. Missing exact counts fail rather than becoming zero. Refresh clears previous totals and results immediately; failed requests show retry and never establish an empty scope. Request generations and identity/role keys prevent older responses from painting a refreshed or different account's dashboard.

The provisional notice uses this revision's actual `PROVISIONAL_LABEL` from the D6433-07 engine contract. The shipped calculator still produces provisional previews; the notice does not infer reference acceptance from empty counts or claim that saved approved snapshots are provisional. The dashboard does not expose private reference availability, install curves, run calculations, enable publication or change approval gates. Account metadata is display-only; live session authorization still determines role. Viewer names use signed-in account metadata/email without granting profile-table access.

## Verification

Run `npm run test:dashboard` for synthetic query-contract, contrast, responsive-branch and actual React/RN Web DOM/effect/keyboard regression checks. These are not browser pixel-layout, screen-reader, native-device or engineering validation. Also run the existing `npm test`, `npm run test:export-ui-fixes`, both type checks, lint and web export.

Private evidence and hosted synthetic-session checks belong in Git-ignored `private-astm/`. The review database has no eligible populated results; populated dashboard tests use explicitly synthetic local responses and do not create engineering approvals. Perform browser visual checks at desktop/tablet/phone widths, with real icon fonts/images and both themes, plus screen-reader and physical-device testing before evaluator sessions. Nothing in this change deploys or migrates Supabase.
