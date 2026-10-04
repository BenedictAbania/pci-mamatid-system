# Workflow verification and hosted acceptance

## Automated checks

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build:web
```

Individual suites: test:workflow, test:e2e, test:alignment and test:published. All use local fictional data; none connect to Supabase, invite real users or apply hosted migrations. test:e2e is a database/domain scenario, not a browser/device end-to-end run.

PGlite rebuilds tests/schema-fixture.sql and the appropriate repository migrations. The published suite applies all three migrations and covers:
- Viewer zero-row access to internal tables, including own profile, raw calculations, review comments, audit and accounts; only minimal role/active bootstrap and published approved snapshots are readable.
- Pending, returned and unpublished approvals excluded from Viewer reads and summaries; private evidence paths and mutation attempts blocked even with a permissive legacy Storage read policy.
- Missing/stale revision/version rejected; return/resubmit without edits creates a new computation; overlapping approve/return requests with the same token allow only one action.
- Approved inputs/computations/reports locked; a reasoned correction retains the current approval until atomic replacement; historical evidence remains stored.
- Current sample summaries count only current approvals, stale/incomplete or duplicated section cohorts are excluded, and historical exports retain saved road/distress labels despite renaming and edits.
- More than one page of current approvals; no repeated samples, bounded pages, server totals covering rows beyond the page; account/RPC clamps and global section priorities.

PGlite queues requests on one connection. These tests verify stale-token behavior and transactional logic, **not** independent PostgreSQL connections waiting on a row lock. They do not exercise real Supabase JWT/Auth, PostgREST schema caching, signed URLs or physical devices. Hosted schema compatibility/backfill and query performance remain separate gates.

## Disposable Supabase acceptance matrix

Apply only the reviewed new migration to a matching disposable baseline as described in [authenticated-system.md](authenticated-system.md). Use fictional accounts and records; never run these write scenarios in PCI Automation production.

1. **Viewer network boundary:** sign in and visit workspace/dashboard/results/reports/priorities and try direct staff routes and /prototype. Inspect network requests: they must not query internal tables/accounts. Using the same Viewer bearer token, query internal tables through REST; no rows may be returned, including their own profile. Account/admin/workflow RPC attempts fail. Unpublished approved feed rows and private photos are absent. Published curated data/downloads contain no Reviewer comments, audit or account fields.
2. **Real two-session race:** open two Reviewer sessions assigned to one submitted fictional sample with a trusted test-only calculation. Record revision/version in both sessions. Start approve vs return simultaneously (then return vs return on another submission). Exactly one succeeds; the other receives the changed/refresh error. Assert one history transition and at most one current approved result. Repeat with separate API connections, checking row-lock waits and transaction rollback.
3. **No-edit resubmission:** return the sample, resubmit as Encoder without changing measurements, and try the old Reviewer token. It must fail. Refresh and review the new computation. Missing tokens and tokens from an earlier revision fail too.
4. **Correction:** publish a test-only approved result, request correction with a reason as its assigned Encoder, then save/edit/submit the new draft. Viewer current PCI and section priority continue to show the old approval until replacement approval. Before replacement publication, Viewer current reports exclude that sample while old published history remains accessible. Publish the replacement; staff/Viewer summaries count it once and the old approval is superseded. Rankings referring to the old calculation disappear until a trusted new section result exists.
5. **History:** save/export the original published report. Rename its branch/section/distress catalog, change correction measurements and photo captions, and publish the replacement. Original CSV/print, calculation output, date, names and photo content must still match the saved snapshot. A legacy approval without captured labels must show unavailable context, not current labels. Approved photo overwrite/delete attempts fail, including during corrections. Test newly issued signed URLs and expiry.
6. **Aggregation and paging:** seed over 100 fictional samples/accounts/catalog records/sections. Navigate forward/back, empty/final pages and search labels; no screen downloads the entire table. Current summary counts all eligible current samples even beyond page 50; Viewers exclude unpublished approvals. Section ranks continue globally across pages with the documented PCI/risk/area ordering and no duplicate sections. Test a cursor invalidated by concurrent replacement by refreshing to page 1.
7. **Limits and lifecycle:** test assigned Encoder/Reviewer isolation, deactivation with an existing JWT, role changes/token refresh, missing migration, network errors and refresh after a stale action. A selected inspection above 500 measurements or 100 photos must fail closed. Verify photo picker/upload rejection and signed-URL read permission for JPEG/PNG/WebP evidence under the existing size limit.
8. **Visual/device:** inspect 390px and 1440px web widths, light/dark, keyboard/focus, drawer navigation, loading/error/success states and CSV/print-to-PDF layout. Exercise authenticated sessions, persistence, picker and evidence on an actual Expo 57-compatible phone/development build. Production web export alone is not device readiness.

Use a test-only trusted service to stage fictional verified calculations in this disposable backend, with reference_id/algorithm_version clearly marked TEST ONLY. The shipped illustrative engine and pending adapter must still show **prototype**, cannot be approved, and must not write an official result.

## Release boundaries

The new migration is included for review and has not been applied to the connected project. The existing two workflow migrations were observed applied on 4 October 2026; the old documentation saying otherwise has been corrected. No app, Auth configuration or Edge Function is deployed by this work. The protected admin-invite function still needs a separately authorized configuration/deployment and invitation test.

Engineering work remains: licensed DV/CDV provenance and validation, VerifiedPciAdapter implementation, independently validated sample and section calculations/weighting, and civil-engineer sign-off. Do not substitute a fixture or browser prototype for any of these.
