# Database workflow and migration guide

## Observed repository and hosted history

The original **PCI Automation** project (`qsqvqkdqxkqparhzpsqn`) has these recorded migrations as of 2 November 2026. The first two hosted timestamps differ from their repository filenames; later versions match. The original October access mismatch was resolved in the 1 November cutover.

| Repository migration | Hosted version / name |
| --- | --- |
| 20260916_authenticated_workflow.sql | 20260916112803 / authenticated_workflow |
| 20260916140000_align_sample_unit_area_with_manuscript.sql | 20260916152749 / align_sample_unit_area_with_manuscript |
| 20261004151522_published_revisions_and_reports.sql | 20261004151522 / published_revisions_and_reports |
| 20261004162431_d6433_24_provisional_calculations.sql | 20261004162431 / d6433_24_provisional_calculations |
| 20261031211658_reviewer_branch_registration.sql | 20261031211658 / reviewer_branch_registration |
| 20261102023605_reviewer_section_registration.sql | 20261102023605 / reviewer_section_registration |
| 20261102030601_harden_legacy_function_execute.sql | 20261102030601 / harden_legacy_function_execute |

The old guide named a nonexistent 20260915103850 migration and said workflow was unapplied. Those statements were outdated. The repository's two existing filenames and the hosted history timestamps differ. **Do not run db push or migration repair against PCI Automation to resolve this automatically.** Inspect and reconcile history in a disposable clone first, without replaying existing migrations.

There is no complete base-schema migration or committed Supabase config.toml. The migrations depend on existing profiles, branches, sections, sample_units, distress_types, distress_records, distress_photos, deduct_value_points, Auth and Storage. tests/schema-fixture.sql reconstructs a minimal legacy schema for PGlite; it is not a deployable Supabase baseline. Neither supabase db reset nor blindly pushing this migration folder to a fresh hosted project is a supported setup.

## New migration behavior

### Reviewer section registration (2 November 2026)

`20261102023605_reviewer_section_registration.sql` adds a restrictive Reviewer-only check to section INSERT and UPDATE, plus permissive Reviewer policies so legacy Admin-only write policies cannot block the CE. It leaves section SELECT, DELETE, confirmed-layout triggers, and inspection approval policies untouched. `20261102030601_harden_legacy_function_execute.sql` removes anonymous direct execution of the legacy role helper and removes client execution of three trigger helpers; authenticated role-helper access stays in place for existing policies.

On 2 November, four authenticated test roles passed direct section API checks in **PCI Automation Review** (`zxgscjcgxrezmlfyoriw`). A fresh original-project custom-format backup was verified privately at `private-astm/production-cutover/original-20261102-110847/` before both migrations were applied and recorded transactionally in PCI Automation. The original section count remained one. The Review ledger still contains its four earlier baseline/rehearsal entries and does not record the manually executed branch/section SQL; its ledger must be reconciled before any automatic push there. No Review fixtures were copied to the original.

### Signed in but unable to load access

The authenticated frontend calls `lakad_session_access()` immediately after Supabase sign-in, before reading staff profiles. Earlier screenshots of an access/version error came from the pre-cutover database missing this RPC and `approved_results`. PCI Automation now has both plus the provisional D6433-24 catalog mapping. A future access error should be diagnosed against the current environment and logs rather than assumed to be this old migration gap.

The local app distinguishes missing-function errors from network/permission failures, absent profiles, unsupported roles and deactivated accounts. It does not assume Admin access or query profiles as a legacy fallback. Retry cannot repair an unapplied migration.

The ignored local `.env.local` selects PCI Automation. Rebuild static exports after switching environments so Metro does not reuse an old bundle. Database migration is complete for the currently recorded files, but public frontend deployment and engineering validation are separate tasks. Use a disposable backend for write-heavy tests and future migration rehearsals.

The new additive migration creates approved_results, sample revision action versions/current approval pointers, safe session/report/account RPCs, immutable snapshot triggers, scoped Storage preservation, and restrictive Viewer policies. Existing permissive policies cannot expose internal rows to Viewers.

Reviewer approve/return requests must provide both revision and version. The transaction locks the sample row before checking the token, and locks the calculation before approval. Two sessions using one token cannot both act successfully. Returning a submission advances its revision and clears the working computation, preventing a later no-edit resubmission from reviving a stale review token.

An Encoder correction preserves the current approval while opening a new draft. Replacement approval supersedes the prior approval within the same transaction. Saved reports use the approved snapshot, including road/catalog names captured at submission. Backfill accepts only independently approved verified current calculations with valid output; missing legacy label context stays unavailable. Unverified legacy scores are never promoted.

Raw section_results remain internal. The curated section-report RPC requires Reviewer approval and the complete set of distinct current approved constituent computations (all published for a Viewer), freezes road context for newly inserted results, and returns global priority rank without approver account fields. Existing section label context is unavailable. The D6433-24 migration adds a provisional section computation store; it is separate from this published feed. There is still no engineering-validated section publication service.

## Disposable-project procedure before application

1. Record the authorized source's migration list and schema definitions using read-only inspection. Obtain a sanitized schema-only baseline through an authorized Supabase export workflow. Exclude production Auth users, data, credentials, and evidence.
2. Create a **separate disposable** Supabase project. Reconstruct the existing application schema, workflow functions/policies, private Storage bucket and its policies there. Account for Supabase-managed Auth/Storage schemas rather than importing the PGlite fixture. Confirm the baseline matches the already-applied workflow and sample-area changes; do not replay them over an already-migrated schema.
3. In a separate temporary checkout, initialize/link the CLI to the disposable project. Use the repository-pinned CLI and check the target project before every command:
   ```powershell
   npx.cmd supabase init
   npx.cmd supabase link --project-ref <DISPOSABLE_PROJECT_REF>
   npx.cmd supabase migration list
   ```
   This repository's filename/history mismatch requires explicit baseline reconciliation in that disposable checkout. Keep production history unchanged. For a controlled first rehearsal, review and execute only 20261004151522_published_revisions_and_reports.sql in the disposable project's SQL editor. Then review and execute 20261004162431_d6433_24_provisional_calculations.sql. Both are transactional and intended to run once, in that order.
4. Add only fictional test accounts/data and a private sample-unit-photos bucket. Configure roles/assignments under trusted administration. Point .env.local to that disposable project. A test-only trusted calculation may populate explicitly fictional verified outputs; it must never be used to label an official result.
5. Run every hosted acceptance case in [workflow-testing.md](workflow-testing.md), including separate sessions, raw REST reads, signed Storage access, migration backfill and snapshot exports. Inspect RLS/grants/functions, not just visible navigation. Verify representative nonempty legacy approvals and production-scale query plans against sanitized fixtures.
6. Document the baseline/history mapping, backup and migration plan, and results. Apply future migrations to the original only after a fresh verified backup, targeted rehearsal, and authorization; deploy the frontend separately.

Use the [Supabase migration workflow](https://supabase.com/docs/guides/deployment/database-migrations) and [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) for the environment you are testing. CLI commands can affect a linked backend; the steps above are for a disposable project only.

## Configured review backend: 5 October 2026

After separate user authorization, **PCI Automation Review** (`zxgscjcgxrezmlfyoriw`, Tokyo) was created in the existing organization at the connector's quoted cost of **$0/month**. The following describes its original October setup; PCI Automation later received the reviewed migrations on 1 and 2 November.

The test baseline was reconstructed from PostgreSQL catalog definitions of the existing production public/private application schema, functions, triggers, constraints, policies and grants. No source table rows, Auth users, credentials, Storage objects or curve data were copied. Supabase-managed Auth/Storage schemas were retained. A private photo bucket and new default workflow settings were created. The review migration ledger contains a schema-only baseline, the published-revisions migration, the D6433-24 provisional migration, and test-only legacy trigger-execute hardening. Its timestamps are generated by the hosted migration tool, rather than copied from repository filenames. This is a rehearsal ledger, not production history repair.

During the October rehearsal, the ignored `.env.local` selected Review; it now selects the original PCI Automation project. Restart Expo and rebuild static exports after changing environments. The published website has not been reconfigured. The private setup record, baseline SQL, fictional credentials and repeatable hosted test script are in `private-astm/review-backend/`; none should be committed. No CLI link to production was added.

Four fresh synthetic Auth accounts were created through the Auth Admin API and assigned roles in server-controlled profiles. A short-lived, one-use setup endpoint was protected by a random token hash, fixed test-account allowlist, empty-project check and expiry, then replaced with a permanently disabled response and JWT checking. The review project has the existing checked `calculate-pci` and `admin-invite` server functions. No private reference bucket/package/path/hash is configured, and no calculation was promoted to verified or approved.

Hosted verification passed 44 checks: all four real Auth logins/access RPCs, Admin profile/account/catalog/readiness queries and inventory writes, Reviewer sample planning, Encoder submission, provisional no-distress PCI 100, missing-reference rejection, concurrent review/stale approve rejection, Viewer raw-table/RPC isolation, and account deactivation with existing JWTs. The summary RPC returns empty aggregates under RLS for a deactivated account; the section-report RPC rejects it. No approved/publication fixture or engineering sign-off was fabricated. Browser verification and build evidence are recorded privately with this setup.

Remaining hosted work includes real photo upload/signed download and retention, invitation email delivery/acceptance, nonempty approved/historical exports, replacement of a validated current result, section publication/current aggregation, representative migration backfill, production-scale query plans, and phone testing. Approval/publication scenarios require the engineering gate and a trusted validation writer, which are still absent. Supabase security advisors show no anonymous security-definer warnings after test-only trigger/grant hardening. They still flag deliberately callable authenticated security-definer RPCs for review and the free-project default with leaked-password protection disabled; this rehearsal does not establish release readiness. See [function advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Rollback and evidence retention

The two existing files under supabase/rollback are manual guards for their original migrations, not a rollback for the new approved-results layer. Do not run them after the new migration: immutable approvals, computation pointers and dependent functions must be preserved. No destructive downgrade is supplied. Rehearse restores or a forward fix in the disposable environment; do not erase approved history or photo objects to recover a release.

Prototype DV/CDV ordinates remain unchanged and illustrative. The new D6433-24 core implements fractional corrections, mixed severity and area-weighted random/additional aggregation with per-rule provenance. Private reference data, licensing, numerical/field engineering validation and a trusted promotion/publication service remain outstanding. See [the engineering review and disposable test gates](d6433-24-engineering-review.md). Edition text or a database verification flag alone is not ASTM compliance.

The new migration fixes the active edition to D6433-24 for new submissions, seeds 20 separate immutable SI mappings without relabeling legacy rows, captures field/catalog context, and saves calculations provisionally. It changes sampling bounds to 135–315 m² and selection to a systematic random interval. Existing drafts need measured area/orientation/field confirmation and legacy distress replacement before new-edition submission. Approved older snapshots stay unchanged; corrections preserve the previous current result until replacement approval.
