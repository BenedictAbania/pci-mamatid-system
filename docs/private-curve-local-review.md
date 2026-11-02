# Private draft curve integration for local review

Everything here is **Prototype / Provisional**, without engineering approval or publication eligibility. This Node workflow reads local files and makes no Supabase Auth, Storage, database or network requests. Expo and the Edge Function do not import this adapter or dataset. No production migration/configuration is needed.

## Inventory and missing decisions

The supplied folder has 35 readable files: the source PDF; package README/manifest; two curve JSON files; three CSV review files; review PDF; quality report; 21 overlays; and four reproduction files. All 33 manifest entries match byte counts and hashes. The source PDF matches the candidate's source SHA-256. No listed package file is missing. The README mentions a ZIP for handoff, but no separate ZIP is present or needed by this loader.

The candidate contains 57 DV curves for 20 asphalt types and six importable CDV curves (q=2-7). Detailed traces also contain plotted q=1 for comparison. There are no concrete curves or q>=8 data. Metadata stays `usage: review-only`, `approved_for_calculation: false`, with null reviewer, permission and interpolation-review records. The review register and independent graph checks are pending; structural quality checks are not engineering approval.

Missing decisions include practical domains/endpoints, graph-reading tolerance/interpolation, q=1 identity, shared q=6/7 ink, q>=8 clarification, independent numerical expectations, mixed severity, field evidence, rounding, sampling adequacy and section weighting. This workflow never fills or signs review records. Intended storage/distribution permissions remain a separate open question; PDF possession or engineer sign-off does not supply a redistribution record.

## Run privately

From the repository root with the existing dependencies installed:

```powershell
npm.cmd run review:private-curves
npm.cmd run test:private-curves
```

The first command evaluates three **synthetic field scenarios**, then writes full-precision inputs, outputs, severity alternatives, source/candidate hashes and every queried interpolation bracket to:

- `private-astm/local-review-results/calculation-review.json`
- `private-astm/local-review-results/calculation-review.md`

The Markdown shows density/DV lookup, HDV, fractional m, adjusted TDV/q/CDV iterations, maximum CDV, sample PCI and section weights/contributions. Display rounds to six decimals; JSON retains full precision. Both outputs and all source data stay under the Git-ignored private directory. Never copy source-derived values into public fixtures/docs before permission is resolved.

The adapter clones the candidate without changing metadata, validates the existing calculator's curve identities/axes/nodes, and calls its interpolation and `calculateSample` functions. The trusted `privateCurveReader` still rejects this draft. DV interpolation uses log10 density, CDV linear TDV. Both reject values outside supplied endpoints; missing tails never mean zero. q>=8 is explicitly rejected, including during sample correction. q=1 retains the existing provisional identity policy rather than importing the plotted trace. Masked gaps/connected traces remain unreviewed interpolations.

Section rehearsal calls `calculateSectionForReview`, sharing geometry checks and arithmetic with `calculateSection`, but accepting provisional results and returning `scope: local-review`, `engineering_approved: false`, `publishable: false`. It creates **no approved/current flags or database records**. The production entry point independently retains its current-approved D6433-24 gate; the HTTP handler continues to call that entry point. Local calculation IDs are trace identifiers, not database computation IDs.

## Use another private case

Save a JSON case inside `private-astm/`, following `demoCase()` in `scripts/private-curve-review.mjs`:

```powershell
npm.cmd run review:private-curves -- --input private-astm/my-case.json
```

The shape is `{ description, samples: [{ id, sample_type, input }], section }`. Each input follows the existing `SampleInput` contract: edition, measured area, observations with canonical SI units, explicit no-distress and field-rule confirmations. Section has area, total sample units and required random IDs. For real observations, field confirmation must come from the inspector. Default confirmations are synthetic fixture assumptions, not inspector/engineer attestations. Required random IDs must match the supplied cohort; census areas must partition the section. The script cannot certify field sampling adequacy.

Successful runs overwrite the two generated reports only; rejected runs may leave previous output. Check exit status, case description and input/reference hashes before using a saved report. Supplied manifest/review records are untouched.

## Verification scope

`test:private-curves` is opt-in because the supplied private package is absent in CI. It checks hashes, metadata/approval separation, every imported curve's endpoints and midpoint interpolation, out-of-domain and q>=8 rejection, densities, mixed severity, CDV iteration selection, random/additional/census weighting and production refusal of unapproved samples. It is deliberately separate from `npm test`.

Tests derived from draft nodes establish mechanical consistency, **not independent engineering expectations**. The supplied graph-check CSV also contains draft comparisons, not validated answers. Existing fictional fixtures remain separate. Local checks cannot certify hosted Auth/RLS/Storage, engineering accuracy or rights to deploy these traces.
