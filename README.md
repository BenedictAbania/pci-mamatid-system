# LAKAD / PCI Mamatid

An Expo SDK 58 application for collecting pavement inspection evidence, independent review, and published PCI reports. It uses React Native / Expo Router and Supabase Auth, Postgres RLS, private Storage, and checked workflow RPCs.

**Prototype / Provisional:** the system calculates only with the D6433-07 asphalt path. The D6433-24 calculation module was removed on 5 November 2026; saved D6433-24 records remain readable history. On 5 November 2026 the original PCI Automation project received the D6433-07 migrations and Edge Function after a fresh private backup; see [the migration guide](docs/authenticated-system.md). D6433-07 graph ordinates, engineering validation and a permitted private reference package are still missing. The public browser prototype remains illustrative. See [the D6433-07 transition and engineering questions](docs/d6433-07-transition.md). The migration and matching Edge Function were rehearsed in disposable PCI Automation Review on 3 November 2026. No D6433-07 frontend was deployed, and the original PCI Automation project was not changed by that rehearsal.

New D6433-07 field observations show [versioned provisional severity cues](docs/d6433-07-severity-guidance.md), including a no-severity path for Polished Aggregate. The additive cue-snapshot migration was applied only to PCI Automation Review on 3 November 2026. The original project was not changed for this feature.

## Local setup

Use Node 22.20 or newer and the committed npm lockfile. Read [AGENTS.md](AGENTS.md) and the [versioned Expo 58 documentation](https://docs.expo.dev/versions/v58.0.0/) before changing code.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
# Edit .env.local with the intended Supabase URL and public anonymous key.
npm.cmd run web
```

Expo reads EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. Public client keys are bundled into the app; RLS is the access boundary. Never put a service-role key in Expo variables. Check whether an existing local .env is present. Use a disposable project for tests that write data.

The repository migrations extend an existing application schema; they do not bootstrap a fresh Supabase project. Follow [the migration guide](docs/authenticated-system.md) before signing in to a test backend. Without the published-revisions migration, authenticated screens display a migration/access error. The anonymous /prototype screen is a temporary browser calculation with no database writes.

On 1 November 2026, the original **PCI Automation** project (`qsqvqkdqxkqparhzpsqn`) received the published-revisions, provisional D6433-24, and Reviewer branch-registration migrations after a private database backup and a Review-project rehearsal. The required `calculate-pci` and `admin-invite` Edge Functions are active there. For the 3 November D6433-07 rehearsal, the ignored local `.env.local` was switched to disposable **PCI Automation Review** (`zxgscjcgxrezmlfyoriw`); the preceding local configuration is backed up privately under `private-astm/review-backend/`. Rebuild with `expo export --platform web --clear` after changing projects so Metro does not reuse an old bundle. Existing original Auth accounts and inspection records were retained. No private ASTM reference package was uploaded. The local environment switch does not deploy a public website or establish engineering approval.

On 2 November 2026, the original project also received `20261102023605_reviewer_section_registration.sql` and `20261102030601_harden_legacy_function_execute.sql` after a fresh private backup. Reviewer/CE section INSERT and UPDATE now match the tested Review policy; existing section data, deletion rules, inspection approval, and publication rules were preserved. The four legacy helper-function grants now match the hardened Review configuration. No synthetic Review accounts or inspection data were copied, and no frontend was deployed.

## Project structure

```text
src/
  app/                 Expo Router screens (each file is a route)
  components/          admin shell, dashboard and workflow UI, splash animation
  lib/
    auth/              roles, route access, navigation, session access
    data/              Supabase client and data loaders/actions
    pci/               PCI classification, prototype engine, calculation service
    d6433-07/          D6433-07 catalog, severity cues, measurement parts (shared with Edge)
    ui/                design tokens, inspection presentation, demo flag
    utils/             formatting/CSV helpers, photo validation
  providers/           Auth and theme context
supabase/
  functions/           calculate-pci, admin-invite, _shared/d6433-07 calculation core
  migrations/          ordered SQL migrations (see docs/authenticated-system.md)
  rollback/            manual guards for the two earliest migrations (used by tests)
tests/                 local test suites (npm test, npm run test:ui)
  fixtures/            PGlite schema reconstruction
  helpers/             TypeScript module loader for tests
docs/                  system, workflow, D6433-07 and testing guides; demo/ scripts
assets/                app icons and images
private-astm/          ignored: private ASTM references, backups, briefs (never commit)
```

## Roles and workflow

| Role | Responsibility |
| --- | --- |
| Admin | View road branches and sections; manage active accounts, settings and distress catalog; access internal workflow data. Existing inventory deletion rules are unchanged. |
| Reviewer | Register and edit road branches and sections, define boundaries and sampling plans; independently approve or return assigned submissions, then publish approved results. |
| Encoder | Collect measurements and photos for assigned units, submit them, and create correction revisions with a reason. |
| Viewer | Read/download published, Reviewer-approved snapshots and current priorities only. No draft, pending/returned inspection, internal computation, review comment, audit, or account table access. |

A plan produces assigned sample units. An Encoder starts and saves a draft, then submits an immutable calculation input snapshot. After the coordinated migration and function deployment, staff can calculate provisional D6433-07 output from a saved submission. Distressed inputs require a separately reviewed private D6433-07 curve package; a confirmed no-distress inspection can calculate without curves. A Reviewer may return it with comments; resubmission uses a new revision even when no measurements were changed. Approval requires a trusted verified reference calculation, assigned independent Reviewer, and the current revision/action version. Provisional status cannot satisfy that guard. No promotion service is supplied before the engineering validator checks the rules and references.

Approval locks the inspection inputs and calculation. A correction opens a new working revision while the previous approved result remains current. Only approval of the replacement atomically supersedes the old result. Publication is a separate Reviewer action: until the replacement is published it is excluded from Viewer current reports; the old published snapshot remains downloadable as history.

Reports read saved road names, distress labels, inspection evidence and calculation output. They never rebuild old reports from mutable inventory. Legacy approvals without captured labels explicitly show unavailable historical context. Current summaries count one current approval per sample, and section priorities reject superseded, duplicated or incomplete current calculation cohorts. The D6433-07 section calculator uses §11.1 Eqs. 5–7 on current approved snapshot values and confirmed random/additional cohorts. Its results are saved separately as staff-only provisional snapshots and do not become published rankings.

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

Calculation tests check D6433-07 grouping, units, fractional deducts and section weights with fictional curve fixtures. The historical D6433-24 core retains its separate alternative-severity tests. None validates actual ASTM curve accuracy. Tests use fictional fixtures in local PGlite, including database role/RLS enforcement, stale actions, corrections, current aggregation, historical snapshots and paging. They never connect to Supabase. The test schema is a reconstruction for automated checks, not a production schema export. See [workflow testing](docs/workflow-testing.md) for real Auth/Storage, two-session concurrency, browser and device acceptance tests.

## Deployment preparation

The web configuration uses Expo static export into dist/. A static host must serve the exported routes and assets; configure Supabase Auth site/redirect URLs for the intended host. Set the public environment variables at build time and clear Metro's cache when switching backends. Both the original and Review projects have the D6433-07 migrations and function; no D6433-07 frontend is deployed.

Mobile distribution requires a compatible Expo 58 development build/device test and the normal platform signing/build configuration; a web export does not validate a physical phone. The deployed `calculate-pci` in both projects is D6433-07. It reads private server Storage with a pinned digest and saves only provisional outputs; it has no D6433-07 curve package or reference hash. A distressed sample fails closed until those are supplied and reviewed. See the [D6433-07 transition](docs/d6433-07-transition.md).

The protected admin-invite Edge Function is deployed to the original and Review projects. Actual invitation delivery and acceptance still require hosted testing with authorized recipients and email configuration; the cutover sent no invitations.

Before further schema changes, rehearse new migrations in a disposable full Supabase project. [Migration history and procedure](docs/authenticated-system.md) document the repository filenames and hosted history.
