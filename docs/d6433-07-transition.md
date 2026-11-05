# D6433-07 asphalt transition - provisional implementation

The supplied 48-page D6433-07 source PDF has SHA-256
`5b549734f88e54cde5ee5c3c962f360f63a2156c9d994a4e87481deb96fb7cfe`.
The supplied nine-page computation draft has SHA-256
`62de0fabb8e9a0ddc8e684816418dd30ae0d20b52610b0e352d60eeff22a0fe5`.
Both remain outside the repository. This document paraphrases selected rules; it contains
no chart ordinates, graphs or copyrighted severity text.

## Edition-specific changes

| Area | D6433-07 basis | Implementation and review boundary |
| --- | --- | --- |
| Catalog | Appendix X1, X3: 19 AC types; code 19 combines Weathering and Raveling, including L/M/H | Separate D07 records and module. D24 rows and saved snapshots retain their edition; there is no automatic crosswalk. |
| Unit and density | §§2.1.7, 9.1-9.3: AC sample area 225 ± 90 m²; quantity grouped by distress and severity; density = quantity / measured sample area × 100 | SI quantities by area, length or count. Existing field rules remain inspector confirmations; geometry needs field evidence. |
| Deducts | §§9.5.1-9.5.5, Eq. 4: shortcut for at most one DV > 2; fractional allowable m; iterate smallest DV > 2 down to 2; select maximum CDV | Separate D07 provisional core. The D24 §9.6.2 mixed-severity *alternatives* are not applied; D07 §9.1 records severities separately. |
| Curves | D07 Appendix X3: DV graphs for AC types and Fig. X3.26 for corrected TDV | Private D07 package required. D24 points cannot be imported; no private D07 package is configured. q ≥ 8 and out-of-domain queries fail. |
| Sampling | §§7.5.2-7.5.3: initial AC s=10, commonly e=5; Eq. 1 minimum rounded up; systematic interval rounded down with random start | Existing planner estimates and stores engineer-confirmed counts. If 95% confidence is required, §§7.5.2.1-.2 also require actual sample deviation and additional evenly spaced random units when the revised minimum rises. This adequacy check is still a reviewer task, not a system-certified claim. |
| Section | §11.1 Eqs. 5-7: random and additional groups each use surveyed-area weighting; additional area has its actual section fraction | The implementation uses `PCI_r × (section area − additional area) / section area + PCI_a × additional area / section area`. A complete census partitions the section. |
| Rating | Fig. 1: Good, Satisfactory, Fair, Poor, Very Poor, Serious, Failed | Exact fractional thresholds and rounding policy are provisional. Fig. 6 labels PCI 49 as Fair, which conflicts with Fig. 1 (Poor); the app follows Fig. 1 pending CE decision. |

## Corrections to the team's computation draft

- The draft's DV and CDV numbers are explanatory examples, not independent graph readings.
- The example with HDV 30 and six DVs says both `m=7.43` and later `m=5.43`.
  These cannot describe the same input; use a separate case when demonstrating actual fractional trimming.
- The draft's additional-sample explanation defines `N` and `A` as **counts**.
  D6433-07 §11.1 Eq. 7 uses **section and additional areas**, not counts.
- The example random mean of 63.5 from four units totaling 900 m² is correct arithmetic
  for the listed fictional values. It does not establish reference-curve accuracy.
- Fig. 6 uses q=8, while the printed Fig. X3.26 does not offer an unambiguous
  q=8 trace. Record this discrepancy for the engineers; do not synthesize q=8.

## Deployment and validation boundary

The additive migration `20261103045543_d6433_07_provisional_edition.sql` changes
the active catalog for *new* inspection submissions, preserves D24 history,
and leaves calculations `pending` / `provisional`. New distressed inputs cannot
produce an ASTM claim until a D07-specific permitted curve package, interpolation
policy and independent numerical expectations are reviewed. The Edge Function
requires D07-specific private path and hash variables; do not reuse the D24 package.
No approval promotion, publication change, PDF or chart data is included.

The migration and matching Edge Function were rehearsed in disposable PCI Automation
Review on 3 November 2026. Four authenticated synthetic roles passed 28 hosted
API/workflow checks; existing D6433-24 computation snapshots remained unchanged.
The later [severity-cue review](d6433-07-severity-guidance.md) added a separate
Review-only snapshot migration and retained the provisional calculation gate.
The Review project still has no D6433-07 private curves, and it had no approved
D6433-24 result for a historical approved-report test. Browser UI, Storage photo
flows and concurrent review actions remain outside this rehearsal. Coordinate any
future frontend deployment with the migration. Do not infer that a local PGlite
pass proves hosted access.

On 5 November 2026 the original PCI Automation project received these migrations
and the D6433-07 Edge Function after a fresh private backup. See
[the migration guide](authenticated-system.md) for the cutover record.

Ask the CE validators for independent D07 curve readings and tolerances, q=1/q≥8
policy, graph interpolation and rounding, field severity descriptions, sampling
adequacy, section examples and permission to process or distribute reference data.
