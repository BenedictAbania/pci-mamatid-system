# Workflow verification and handoff

## Local commands (Windows CMD)

```bat
cd /d "D:\My Projects\pci-mamatid-system"
npm install
npx tsc --noEmit
npx eslint .
node scripts/test-workflow.mjs
npm run web
```

The database tests run entirely in PGlite. They reconstruct the inspected legacy
schema, apply the new migration, emulate all four authenticated roles, and use
explicitly fictional fixtures. They do not connect to Supabase or send invitations.
They cover route allowlists, input validation, empty-reference PCI, sampling,
assignment isolation, draft/submission/return/resubmission, independent approval,
pending-reference approval denial, deactivation, snapshot preservation, Storage RLS,
protected inventory deletion, and guarded rollback. They do not replace a full
Supabase Auth/Storage integration test.

## Migration (NOT applied)

`supabase/migrations/20260915103850_authenticated_workflow.sql` extends existing tables,
adds scoped restrictive policies without dropping existing policies, and introduces
authenticated transactional RPCs. The original eight tables retain RLS.
New tables: lakad_settings, inspection_computations, inspection_history, lakad_audit,
section_results. New tables have RLS and no browser write grants.

The rollback file is manual-only. It refuses to remove used workflow data or account
deactivation changes. Back up first. Rolling back restores the original broad legacy
read policies; those must not be considered secure for the requested viewer scope.

Do not apply, push, merge, deploy or change hosted configuration without permission.
Before application, compare the current remote schema against the recorded baseline,
back up, and verify the migration in a disposable full Supabase environment.

## Manual role matrix (after migration authorization)

1. Anonymous: `/` and `/login` show login; `/prototype` calculates temporary data
   without writes/uploads. Direct authenticated routes redirect to login.
2. Admin: inventory, accounts, settings, all inspection states and audit. Cannot
   approve as a substitute for the assigned engineer or demote/deactivate self.
3. Reviewer: define homogeneous boundaries, justify required sample count, confirm
   a random sample plan, add justified additional units, review assigned submissions.
4. Encoder: only assigned units. Start planned unit, save date/notes/coordinates,
   enter configured distress/severity/unit and positive measurements, add photos.
   Submit locks editing; returned comments remain visible; correction can resubmit.
5. Viewer: only verified approved/published sample data and published section results.
   No editing controls. Direct RPC attempts must also fail.
6. Deactivate an encoder: existing JWT must lose database access immediately; profile
   refresh must show the inactive-account message. Reactivate to restore access.

Test blank data, missing migration, network failures, empty catalog, invalid dates,
partial coordinates, duplicates, quantity outside sample area, stale revisions,
missing return comments, wrong assignment and approval without verified calculations.
Test JPEG/PNG/WebP under 5 MB, unsupported files, upload after submission, and
cross-assignment reads of Storage paths. Inspect browser network requests on prototype.

Test at 390px and 1440px widths, light/dark themes, keyboard focus, form labels,
navigation drawer, error/success/loading states, printable report layout and private
photographs. Browser/device verification has not yet been performed in this turn.

## Engineering dependencies (intentionally not invented)

- The connected distress catalog and DV reference table were empty on inspection.
  Admins can configure validated distress names, units, and severity rules after the
  migration is applied. No DV/CDV reference values are invented or seeded.
- `pci-service.ts` defines the sample and section adapter contracts. It does not
  implement an official calculation without verified licensed DV/CDV references.
  Outputs remain null/pending; approval is blocked by the backend.
- Automatic ASTM required-inspection recommendation is pending verification. The
  layout estimate uses the user-specified 225 ± 90 m² guidance, and the engineer
  supplies and records the required count and justification.
- The section-results table/consumer UI is ready for trusted results, but verified
  random/additional weighting and server-side publication are not implemented yet.
- Historical calculations must use immutable input snapshots, edition/reference ID
  and algorithm version. Do not promote legacy illustrative or unverified scores.
- In-app map currently opens stored coordinates in OpenStreetMap; it is not an
  embedded GIS map. Official report printing and mobile evidence need visual QA.
- User invitation is implemented as a protected `admin-invite` Edge Function. It
  requires an active administrator token and a server-side service-role secret; the
  function has not been deployed.

## Current verification status

Role-aware routing, settings payloads, authenticated workflow pages, road inventory,
and reference-catalog management have been reconciled. Existing unrelated edits were
preserved. The hosted project remains unchanged, so authenticated modules intentionally
show a single migration-required notice instead of issuing repeated failing requests.

Latest isolated run: 76 checks passed, including catalog administration, refusal to
roll back used workflow data, and successful rollback on an unused schema. TypeScript
and full ESLint checks pass. A web production export succeeds for all routes. Browser
and physical-device visual verification remains manual because no browser surface was
available to the automation session.

The tracked `.env` contains only the Expo-public Supabase URL and anonymous client-key
variables; their values were not printed or changed. No service-role variable is tracked.
Supabase RLS remains the security boundary. Package installation reported 14 moderate
dependency advisories; no automatic or breaking audit fix was applied.
