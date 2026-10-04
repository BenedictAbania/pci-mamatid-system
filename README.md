# LAKAD / PCI Mamatid

An Expo SDK 57 application for collecting pavement inspection evidence, independent review, and published PCI reports. It uses React Native / Expo Router and Supabase Auth, Postgres RLS, private Storage, and checked workflow RPCs.

**Prototype / Provisional:** the D6433-24 sample/section calculation pipeline is implemented, but real graph ordinates require a private licensed, engineering-reviewed reference package. No such package is committed or configured by this PR. The public browser prototype retains illustrative legacy curves. Civil-engineering validation remains required. No output should be described as official ASTM-compliant solely because it has been approved in this application.

## Local setup

Use Node 22.20 or newer and the committed npm lockfile. Read [AGENTS.md](AGENTS.md) and the [versioned Expo 57 documentation](https://docs.expo.dev/versions/v57.0.0/) before changing code.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
# Edit .env.local with your DISPOSABLE Supabase URL and public anonymous key.
npm.cmd run web
```

Expo reads EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. Public client keys are bundled into the app; RLS is the access boundary. Never put a service-role key in Expo variables. Check whether an existing local .env is present; .env.local should point to the disposable project for testing.

The repository migrations extend an existing application schema; they do not bootstrap a fresh Supabase project. Follow [the migration guide](docs/authenticated-system.md) before signing in to a test backend. Without the published-revisions migration, authenticated screens display a migration/access error. The anonymous /prototype screen is a temporary browser calculation with no database writes.

## Roles and workflow

| Role | Responsibility |
| --- | --- |
| Admin | Road inventory, active accounts, settings and distress catalog; access to internal workflow data. |
| Reviewer | Engineer-defined boundaries and sampling plan; independently approve or return assigned submissions, then publish approved results. |
| Encoder | Collect measurements and photos for assigned units, submit them, and create correction revisions with a reason. |
| Viewer | Read/download published, Reviewer-approved snapshots and current priorities only. No draft, pending/returned inspection, internal computation, review comment, audit, or account table access. |

A plan produces assigned sample units. An Encoder starts and saves a draft, then submits an immutable calculation input snapshot. Staff can calculate provisional D6433-24 output from the saved submission using the private server reference package. A confirmed no-distress inspection can calculate without curves. A Reviewer may return it with comments; resubmission uses a new revision even when no measurements were changed. Approval requires a trusted verified reference calculation, assigned independent Reviewer, and the current revision/action version. Provisional status cannot satisfy that guard; D6433-24 approval additionally requires a trusted engineering validation record. No promotion service is supplied before the engineering validator checks the rules and references.

Approval locks the inspection inputs and calculation. A correction opens a new working revision while the previous approved result remains current. Only approval of the replacement atomically supersedes the old result. Publication is a separate Reviewer action: until the replacement is published it is excluded from Viewer current reports; the old published snapshot remains downloadable as history.

Reports read saved road names, distress labels, inspection evidence and calculation output. They never rebuild old reports from mutable inventory. Legacy approvals without captured labels explicitly show unavailable historical context. Current summaries count one current approval per sample, and section priorities reject superseded, duplicated or incomplete current calculation cohorts. The D6433-24 section calculator uses §11.1 Eqs. 5–7 on current approved snapshot values and confirmed random/additional cohorts. Its results are saved separately as staff-only provisional snapshots and do not become published rankings.

## Screens and limits

Inspection registers, roads, sampling sections, catalogs, accounts and approved reports use pages of 50. Account/catalog/assignment choices also page. Search and CSV export apply to the loaded page, or the selected approved snapshot. Dashboard inventory counts and current sample PCI summaries are server totals; charts/activity are bounded previews. Section priority ranks are calculated server-side across the authorized current set.

Selected inspections load only their measurements, evidence, relevant calculations and up to 50 history entries. More than 500 measurements or 100 photographs causes an explicit incomplete-review error rather than a partial review. Sampling previews show at most 50 units. Approved historical photo objects cannot be overwritten or deleted through authenticated client policies.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run typecheck:calculation
npm.cmd test
npm.cmd run build:web
```

Calculation tests independently check units, fractional deducts, severity alternatives and section weights with fictional curve fixtures. They do not validate actual ASTM curve accuracy. Tests use fictional fixtures in local PGlite, including database role/RLS enforcement, stale actions, corrections, current aggregation, historical snapshots and paging. They never connect to Supabase. The test schema is a reconstruction for automated checks, not a production schema export. See [workflow testing](docs/workflow-testing.md) for real Auth/Storage, two-session concurrency, browser and device acceptance tests.

## Deployment preparation

The web configuration uses Expo static export into dist/. A static host must serve the exported routes and assets; configure Supabase Auth site/redirect URLs for the intended host. Set the public environment variables at build time. A later authorized deployment must coordinate the reviewed schema migration before this frontend, because the new RPCs are required.

Mobile distribution requires a compatible Expo 57 development build/device test and the normal platform signing/build configuration; a web export does not validate a physical phone. The calculate-pci Edge Function is included for a disposable-project rehearsal. It reads private server Storage with a pinned content digest and writes only provisional outputs using race checks; it is not deployed. See [D6433-24 discrepancies, rule provenance, permission question and exact validation gates](docs/d6433-24-engineering-review.md).

The protected admin-invite Edge Function needs server-side configuration and deployment before invitations work. No app, Edge Function, hosted schema or Auth configuration is deployed by this PR.

Review the new migration and validate it in a disposable full Supabase project before any future production application. [Migration history and procedure](docs/authenticated-system.md) document the actual filenames and the hosted history mismatch.
