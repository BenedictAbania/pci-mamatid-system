# D6433-24 asphalt PCI audit and provisional implementation

Source examined: the user's local ASTM D6433-24 PDF, 47 pages, SHA-256
`8f70b70f3ec835d90bd2c817081345f52d974c5685cc048e6d7e8e6b148fda01`.
The file and rendered pages remain outside version control. This document paraphrases rules and cites sections; it does not reproduce charts. No D6433-07 curve assumptions were adopted as D6433-24 values.

## Short discrepancy list

| Existing system / source discrepancy | D6433-24 reference | Result in this PR |
| --- | --- | --- |
| 230 ± 93 m², 137–323 m², conditional width below 7.30 m | §2.1.7: AC 225 ± 90 m² | New layout/measurement limits 135–315 m²; actual measured area saved. Historical migrations remain unchanged. |
| 19-type prototype combines weathering/raveling; generic severity configuration | X1.23, X1.24; Figs. X3.25–26 | Separate 20-entry canonical catalog. Raveling dense mix M/H only; weathering L/M/H; polished aggregate has no severity (X1.16.1). Legacy records are not relabeled. |
| Illustrative curves, approximate CDV, early DV rounding, integer deduct-count trimming | §§9.3–9.5.5; Eq. 4; Appendix X3 | Private reference contract; full precision, fractional m, iterative maximum CDV; no prototype fallback. |
| Missing two-/three-severity corrections | §9.6.2.1–.2 | Evaluate original and specified merged-severity cases and select higher PCI; joint multi-type extension remains provisional. |
| Generic density labels can obscure linear/count SI convention | §§1.4, 9.1–9.3; metric Figs. X3.5,9,11,13,15,19 | Quantity/SI sample area ×100, with unit-specific graph identity; equivalent large potholes can be fractional (X1.17.1.2). |
| No section algorithm; arbitrary random subset; unusual random unit lacked replacement | §11.1 Eqs. 5–7; §7.5.3; §2.1.1 | Area-weighted random/additional aggregation; systematic random start/interval; reclassification requires replacement random unit. |
| Old Excellent/Very Good/... labels | Fig. 1 | Good / Satisfactory / Fair / Poor / Very Poor / Serious / Failed. Saved historical labels stay saved. |
| Source examples are inconsistent with newer figures/text | Figs. 2,4,6 vs. X1.23–24 and Fig. 1; Fig. X3.27 | Old worksheet still has 19 combined types; Fig. 6 says 49 Fair, whereas Fig. 1 gives Poor. Fig. 6/§9.5.5.2 use q=8 but X3.27 visibly supplies q=1–7. Unsupported q is rejected. |
| Missing measured-area confirmation, orientation and equivalent-hole evidence | §§5.1,8.2; X1.17 | Field form saves measured area, orientation/sketch description, field-rule confirmation, classified small counts and large-hole diameter/depth/area. Surveyor name/catalog identity captured privately at submission. |

These are implementation findings, not certification that field severity identification or chart digitization is correct. The original public prototype remains explicitly illustrative, with its legacy 19-type catalog/curves and arithmetic isolated from the authenticated calculator.

## Rule provenance

Shared implementation lives in `supabase/functions/_shared/d6433-24/`; `src/lib/d6433-24/` re-exports its browser-safe types/helpers. The HTTP handler imports the same implementation. No graph ordinates are committed.

| Rule | Standard source | Implementation / policy |
| --- | --- | --- |
| SI authoritative, AC sample bounds | §§1.4,2.1.7 | Validate finite numeric measured area within 135–315 m². UI layouts target 225 m². No automatic imperial reinterpretation. |
| Field record identity, surveyor/date, size/orientation | §§5.1,8.2 | Existing assigned inspector/date/section plus frozen surveyor name, measured area, orientation/sketch description. Sketch/photo and field evidence quality still need a field engineer. |
| Measurement basis and allowed severities per type | Appendix X1 | `catalog.ts` records measurement and severity references and the SI figure per code; migration seeds canonical mappings independently of mutable names. |
| Overlap/exclusions | X1.1.1–.6, X1.15.2, X1.20.4, X1.23.2–X1.24.2 | Sum each type across severity; area cannot exceed sample area. Different types may overlap. Field confirmation covers legitimate overlap, no polished aggregate with bleeding, no separate underlying patch distress, and no simultaneous raveling/weathering in the same area. Spatial correctness cannot be inferred from aggregate quantities. |
| Pothole severity/quantity | X1.17.1.1–.2, Table X1.1 | Small-hole classification is manual with diameter/depth evidence in notes. Large holes >750 mm use actual area/0.5 m²; ≤25 mm depth M, >25 H. No whole-count rounding of equivalents. Exactly 750 mm is rejected for equivalence. |
| Quantity aggregation and density | §§9.1–9.2 | Combine same type/severity before lookup. Density = quantity / actual sample area ×100. For linear m and equivalent count the numerical convention uses their SI metric curves; it is not an area percentage or conversion to square metres. |
| Deduct values | §9.3; Appendix X3 | Each catalog/severity must have the matching SI graph. Missing references or densities outside supplied domains cause failure, not extrapolation. |
| Low-count shortcut | §9.5.1 | If at most one DV >2, use sum of ALL DVs as CDV; other DVs ≤2 are retained. |
| Ordering and allowable deducts | §§9.5.2–.4; Eq. 4; Fig. 5 | Descending DVs, m=min(10,1+9/98×(100−HDV)); floor(m) full values plus next DV×fraction. Fewer available DVs: retain all. |
| Iterative correction | §9.5.5.1–.5; Fig. X3.27 | q counts adjusted DVs strictly >2. Compute CDV, reduce smallest >2 to 2, repeat to q=1, choose maximum CDV. q=1 uses the identity line. The supplied graph supports q=2–7; q≥8 is unavailable pending clarification. |
| Sample PCI | §9.6.1; range §2.1.4 | 100−maximum CDV. Full precision until display. Bounding to 0–100 and exact-boundary classification are listed as numerical policies for validation. |
| Mixed severity | §9.6.2.1–.2 | Two levels: original/all at higher. Three levels: original, L+M→M, M+H→H, L+H→H, all→H. Highest PCI wins. Cartesian evaluation across multiple types, tie-first choice, and 4096-case bound are implementation policies needing validation. |
| Initial minimum count and selection | §7.5.2 Eq. 1; §7.5.3 Eq. 3 | Ceil Eq. 1 (initial AC s=10/e=5 only); floor N/n interval, random first unit in 1..interval, successive intervals through N. Actual selected count can exceed minimum n. Required count remains engineer-confirmed. |
| Additional samples | §2.1.1; §7.7 | Unusual random unit becomes additional and a new unselected random unit replaces it transactionally. Submitted/approved revision cannot change; return/open Encoder correction first. In a complete census there are no additional units. |
| Random/additional section result | §11.1 Eqs. 5–7 | Random mean Σ(PCI×area)/Σarea represents section area less actual additional area. Additional mean uses actual additional areas. Section weights sum to one. Complete census uses actual areas of all units and must partition the section. |
| Condition labels | Fig. 1; §11.2 | Thresholds 85/70/55/40/25/10. At exact threshold use better tier provisionally. Application color tokens are UI design choices, not claimed normative chart colors. |

Frozen catalog IDs, current-approved membership, compare-and-swap tokens, staff-only provisional storage, reference hash pinning, input limits and no-extrapolation errors are application integrity controls, not rules prescribed by ASTM.

## Independent numerical checks and limits

- SI conversion oracle: 2500 ft² = 232.2576 m²; 130 ft = 39.624 m. Linear density becomes 17.06036745406824 in the SI convention, not the imperial worksheet's 5.2. One hole gives 0.4305564166683889, not 0.04. Area-to-area percentages are invariant under consistent conversion.
- Equivalent potholes: one small hole plus 0.65 m² large hole gives 2.3 equivalent holes; at 25 mm large-hole depth severity is M. Fractional evidence must agree with quantity.
- Fig. 6 deduct-stage input HDV 25.1: independent rational arithmetic gives m=1103/140=7.878571428571..., eighth weighted DV=6519/1400=4.656428571428..., initial TDV=146379/1400=104.556428571428.... The example rounds m to 7.9 and the eighth DV to 4.8, hence TDV 104.7. Do not claim an exact match to that rounded handwriting.
- Fig. 6 published CDV checkpoints have maximum 51, giving PCI 49. Tests check this maximum arithmetic separately from the full-precision algorithm; they do not digitize or validate the missing q=8 curve. Fig. 4 is imperial and includes old type 19 L; it is not used as an end-to-end SI/2024 oracle.
- Independent section oracle: section 2250 m²; random units 225 m²/PCI80 and 150 m²/PCI50 → random mean 68; additional 225 m²/PCI20 → section PCI (68×2025+20×225)/2250 = 63.2, weights 0.54/0.36/0.1. For a complete 600 m² census of those three units, PCI=50.
- Tests use deliberately fictional graph points to check exact nodes, semilog interpolation, linear CDV interpolation, wrong figures, missing/out-of-domain curves, floating-point retention and invalid package metadata. Passing these tests is **not** validation of real ASTM ordinates.
- Empty input is not PCI100 unless the inspector explicitly confirms no distress and field rules; a confirmed sound sample can compute provisionally without curves.

## Permission question and private reference contract

**Open permission question:** does the project's license permit digitizing the supplied ASTM graphs, storing that derivative numeric dataset on a server, returning computed numerical traces, or embedding/distributing it with an app? No permission was supplied in this task. The user was asked; pending a response this PR assumes no distribution permission. A purchased PDF or an engineer's review is not recorded here as redistribution authorization.

ASTM's [copyright and permissions page](https://store.astm.org/restricted_copyright-and-permissions) describes permission requests. Obtain written terms from the relevant rights holder/license administrator for the intended use. This is an unresolved project requirement, not a legal conclusion.

Accordingly:
- No PDF, chart image, real chart coordinate dataset or reference package is committed.
- The Edge Function reads an optional **private server** Storage object. It does not expose a curve-download API and never uses public prototype ordinates.
- Do not upload even the private numeric package until permission covers that use.
- The private package must identify edition, reference ID, source PDF SHA-256, reviewer, permission record and interpolation review. Its byte SHA-256 must match the server's independently configured approved digest.
- These metadata checks attest only to package structure and the configured digest; they cannot establish legal permission or engineering accuracy by themselves.

Package shape (no example ordinates):
```typescript
{
  edition: 'ASTM D6433-24',
  id: string,
  source_sha256: string,
  usage: 'private-server',
  permission_record: string,
  reviewed_by: string,
  interpolation_review: string,
  dv: Record<'<code>:<low|medium|high|none>', {
    figure: string, x_scale: 'log10', points: [number, number][]
  }>,
  cdv: Record<'2'|'3'|'4'|'5'|'6'|'7', {
    figure: 'X3.27', x_scale: 'linear', points: [number, number][]
  }>
}
```
Include only catalog-applicable keys. Polished aggregate uses `12:none`; raveling has no low key. Points must be finite, unique, ascending in x, positive on log axes, y within 0–100. All 20 catalog entries and applicable severities are required, even if the current sample uses fewer types. q=8–10 data is refused because it cannot be attributed to the provided Fig. X3.27.

Straight interpolation in graph coordinates (log10 x for DV; linear x for CDV) is a **provisional numerical policy**. Curves are not guaranteed straight between sparse supplied points. An engineer must approve node density, coverage, read uncertainty and tolerances; interpolation cannot recover missing curve points.

## Engineering validation register: exact outstanding cases

All new output remains **Prototype / Provisional**, including results from a supplied private package. There is no engineering-promotion or official publication service in this PR. A trusted validation mechanism must replace provisional status with validated output plus an engineering validation record before Reviewer approval; arbitrary browser flags cannot do this.

| ID | Required engineering decision / evidence |
| --- | --- |
| E01 | Independently digitize/review all applicable DV curves for 20 asphalt types using SI metric figures and all severities; certify package node accuracy, complete practical domain, sample reference SHA, version and licensing terms. No real-reference package is available in this PR. |
| E02 | Obtain authoritative clarification for q=8,9,10: §9.5.5.2 and Fig. 6 use q=8 but supplied X3.27 visibly ends at q=7. No q substitution/extrapolation is permitted. Such samples currently fail explicitly. |
| E03 | Set graph-reading/interpolation tolerance and precision convention. Check full-precision Eq. 4 against the rounded Fig. 6 example (m7.878571..., fractional DV4.656428..., TDV104.556428...) and certify rounding/display policy, q=1 identity and PCI bounding. |
| E04 | Reconcile Fig. 6's PCI49 “Fair” with Fig. 1 “Poor,” §2.1.5 terminology (excellent) with Fig. 1 “Good,” and exact 85/70/55/40/25/10 threshold inclusivity. |
| E05 | Confirm interpretation of §9.6.2 when several distress types have mixed severity simultaneously, including candidate interactions, tie choice and rejection above 4096 alternatives. Check two-level, all five three-level cases and multiple-type real-reference fixtures. |
| E06 | Resolve field boundary/typographic ambiguities: Table X1.1 diameters exactly 200/450 mm and exactly 750 mm; depression at 25 mm (X1.10.1); drop-off at 25/50/100 mm (X1.13.1); slippage width exactly 40 mm (X1.21.1); “75 m” paired with 3 in. in X1.14.2.3; patch ft²-only wording in X1.15.2 against §1.4 SI. Do not infer severity automatically for these. |
| E07 | Validate actual field observations: ride-quality severity, rut mean depth, sketches/orientation and sample geometry, patches and allowed overlaps/exclusions, small-hole diameter/depth evidence and large-hole area/depth. Confirmation is manual; the app cannot prove these from aggregate quantities/photos. |
| E08 | Approve measured-area/section partition, unequal random areas, additional actual area, census treatment and unusual-unit replacement on real section fixtures. Ensure additional intervals sit in their identified unselected slot. |
| E09 | Perform §7.5.2.1–.2 actual-deviation adequacy check and repeat/add evenly spaced random samples as needed; the app supplies the initial Eq. 1 estimate/systematic selection but does not certify 95% confidence or automate supplemental random survey rounds. A materially changed plan requires an engineer-controlled section revision. |
| E10 | Validate end-to-end SI field input → real DV → fractional trimming → CDV → mixed-severity selection → section PCI with independently calculated cases, including curve endpoints, low density, high-q, zero/one DV>2, fractional large holes, no distress, census and replacement. Fictional tests cannot satisfy this gate. |

## Disposable Supabase / hosted acceptance gates

Do not apply to PCI Automation as part of this PR. See the [migration guide](authenticated-system.md) for its existing-history mismatch.

1. Reconstruct a sanitized matching baseline in a **disposable** Supabase project; apply published-revisions migration then `20261004162431_d6433_24_provisional_calculations.sql`. Test populated legacy rows and confirm no older edition is relabeled.
2. Confirm the 20 mapped descriptors, immutable units/severity sets, measured-area/orientation form, small/large pothole evidence, return/correction/resubmission and unusual-random replacement with real Auth sessions. Keep historical approved output identical.
3. Only after permission and engineering reference review, create a private `pci-reference-data` Storage bucket. Add the reviewed package privately. Keep all browser roles denied Storage access, including direct REST requests. Confirm no public bucket route exists.
4. In the disposable project's Edge Function secrets only, set `D6433_24_REFERENCE_PATH` and `D6433_24_REFERENCE_SHA256` (hash of exact package bytes). Normal Supabase URL/anon/service keys must remain server-side. Never place a service key or reference package in Expo public variables.
5. Deploy `calculate-pci` to that disposable project in a separately authorized rehearsal; test function bundling, gateway JWT configuration, `auth.getUser`, inactive/Viewer/unassigned tokens, private Storage, missing package/wrong digest/out-of-domain errors and CORS from the web app. None of these hosted services has been exercised by the local HTTP mocks.
6. Use two actual database sessions: return versus in-flight calculation, two review sessions, sample correction/replacement approval versus in-flight section calculation, additional-plan/reclassification versus aggregation. Exactly stale writers must fail. Local PGlite queues statements on one connection and is not a hosted lock-wait test.
7. Verify staff trace uses the winning severity groups; Viewer receives only previously approved/published reports and no provisional sample/section output. Test web and Expo 57 device forms, pagination and private evidence.
8. Record the engineering validation decisions above and implement/review a trusted validation/promotion/publication workflow separately. This PR does not turn provisional aggregates into published section rankings.
