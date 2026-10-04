# Database workflow and migration guide

## Observed repository and hosted history

On 4 October 2026, read-only inspection of **PCI Automation** confirmed the existing workflow tables/RLS and these applied migration entries. No schema or configuration was changed.

| Repository migration | Hosted version / name |
| --- | --- |
| 20260916_authenticated_workflow.sql | 20260916112803 / authenticated_workflow |
| 20260916140000_align_sample_unit_area_with_manuscript.sql | 20260916152749 / align_sample_unit_area_with_manuscript |
| 20261004151522_published_revisions_and_reports.sql | New, review only; not applied |

The old guide named a nonexistent 20260915103850 migration and said workflow was unapplied. Those statements were outdated. The repository's two existing filenames and the hosted history timestamps differ. **Do not run db push or migration repair against PCI Automation to resolve this automatically.** Inspect and reconcile history in a disposable clone first, without replaying existing migrations.

There is no complete base-schema migration or committed Supabase config.toml. The migrations depend on existing profiles, branches, sections, sample_units, distress_types, distress_records, distress_photos, deduct_value_points, Auth and Storage. tests/schema-fixture.sql reconstructs a minimal legacy schema for PGlite; it is not a deployable Supabase baseline. Neither supabase db reset nor blindly pushing this migration folder to a fresh hosted project is a supported setup.

## New migration behavior

The new additive migration creates approved_results, sample revision action versions/current approval pointers, safe session/report/account RPCs, immutable snapshot triggers, scoped Storage preservation, and restrictive Viewer policies. Existing permissive policies cannot expose internal rows to Viewers.

Reviewer approve/return requests must provide both revision and version. The transaction locks the sample row before checking the token, and locks the calculation before approval. Two sessions using one token cannot both act successfully. Returning a submission advances its revision and clears the working computation, preventing a later no-edit resubmission from reviving a stale review token.

An Encoder correction preserves the current approval while opening a new draft. Replacement approval supersedes the prior approval within the same transaction. Saved reports use the approved snapshot, including road/catalog names captured at submission. Backfill accepts only independently approved verified current calculations with valid output; missing legacy label context stays unavailable. Unverified legacy scores are never promoted.

Raw section_results remain internal. The curated section-report RPC requires Reviewer approval and the complete set of distinct current approved constituent computations (all published for a Viewer), freezes road context for newly inserted results, and returns global priority rank without approver account fields. Existing section label context is unavailable. There is still no validated section computation/publication service in this repository.

## Disposable-project procedure before application

1. Record the authorized source's migration list and schema definitions using read-only inspection. Obtain a sanitized schema-only baseline through an authorized Supabase export workflow. Exclude production Auth users, data, credentials, and evidence.
2. Create a **separate disposable** Supabase project. Reconstruct the existing application schema, workflow functions/policies, private Storage bucket and its policies there. Account for Supabase-managed Auth/Storage schemas rather than importing the PGlite fixture. Confirm the baseline matches the already-applied workflow and sample-area changes; do not replay them over an already-migrated schema.
3. In a separate temporary checkout, initialize/link the CLI to the disposable project. Use the repository-pinned CLI and check the target project before every command:
   ```powershell
   npx.cmd supabase init
   npx.cmd supabase link --project-ref <DISPOSABLE_PROJECT_REF>
   npx.cmd supabase migration list
   ```
   This repository's filename/history mismatch requires explicit baseline reconciliation in that disposable checkout. Keep production history unchanged. For a controlled first rehearsal, review and execute only 20261004151522_published_revisions_and_reports.sql in the disposable project's SQL editor. It is transactional and intended to run once.
4. Add only fictional test accounts/data and a private sample-unit-photos bucket. Configure roles/assignments under trusted administration. Point .env.local to that disposable project. A test-only trusted calculation may populate explicitly fictional verified outputs; it must never be used to label an official result.
5. Run every hosted acceptance case in [workflow-testing.md](workflow-testing.md), including separate sessions, raw REST reads, signed Storage access, migration backfill and snapshot exports. Inspect RLS/grants/functions, not just visible navigation. Verify representative nonempty legacy approvals and production-scale query plans against sanitized fixtures.
6. Document the baseline/history mapping, backup and migration plan, and results. Only a separately authorized future release may reconcile the actual production migration ledger, apply the reviewed migration and deploy the coordinated frontend.

Use the [Supabase migration workflow](https://supabase.com/docs/guides/deployment/database-migrations) and [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) for the environment you are testing. CLI commands can affect a linked backend; the steps above are for a disposable project only.

## Rollback and evidence retention

The two existing files under supabase/rollback are manual guards for their original migrations, not a rollback for the new approved-results layer. Do not run them after the new migration: immutable approvals, computation pointers and dependent functions must be preserved. No destructive downgrade is supplied. Rehearse restores or a forward fix in the disposable environment; do not erase approved history or photo objects to recover a release.

Prototype DV/CDV curves are unchanged. Verified reference provenance, official adapter implementation, section weighting and engineer sign-off remain outstanding; edition text or a database verification flag alone is not ASTM compliance.
