# D6433-07 severity cues - provisional CE review

The Inspector sees short, original paraphrases of Appendix X1 when selecting a
D6433-07 asphalt distress. They are prompts for recording an observation, not
CE-approved criteria or validated PCI data. Version `D07-X1-draft-2026-11-03`
is displayed and saved with each new D6433-07 distress measurement. The saved
cue is carried into the immutable submitted input snapshot; the Inspector and
Reviewer see that saved cue on reopen and in the bounded recent revision view
(up to 50 submitted computations). Older D6433-24 rows are unchanged and
never borrow D6433-07 wording. The original PDF and working brief are ignored
by Git and are not distributed with this repository.

| Code | Asphalt distress | Appendix X1 severity basis | Choice coverage |
| --- | --- | --- | --- |
| 1 | Alligator Cracking | X1.5.1 | L/M/H |
| 2 | Bleeding | X1.6.1 | L/M/H |
| 3 | Block Cracking | X1.7.1; X1.14.2 cross-reference | L/M/H |
| 4 | Bumps and Sags | X1.8.2; ride X1.4.6 | L/M/H |
| 5 | Corrugation | X1.9.1; ride X1.4.6 | L/M/H |
| 6 | Depression | X1.10.1 | L/M/H |
| 7 | Edge Cracking | X1.11.1 | L/M/H |
| 8 | Joint Reflection Cracking | X1.12.1 | L/M/H |
| 9 | Lane/Shoulder Drop-Off | X1.13.1 | L/M/H |
| 10 | Longitudinal and Transverse Cracking | X1.14.2 | L/M/H |
| 11 | Patching and Utility Cut Patching | X1.15.1 | L/M/H |
| 12 | Polished Aggregate | X1.16.1 | No severity; save null |
| 13 | Potholes | X1.17.1; Table X1.1 (visually checked) | L/M/H using diameter and depth |
| 14 | Railroad Crossing | X1.18.1; ride X1.4.6 | L/M/H |
| 15 | Rutting | X1.19.1 | L/M/H using mean depth |
| 16 | Shoving | X1.20.3; ride X1.4.6 | L/M/H |
| 17 | Slippage Cracking | X1.21.1 | L/M/H |
| 18 | Swell | X1.22.1; ride X1.4.6 | L/M/H |
| 19 | Weathering and Raveling | X1.23.1 | L/M/H |

The brief's summary was checked against the supplied PDF. The Polished
Aggregate exception, 19-type catalog, mean rut depth, combined Weathering and
Raveling type, and the pothole matrix match Appendix X1. The low Edge Cracking
cue now explicitly includes low **or medium** cracks without breakup, which the
brief's shorter wording did not convey. The Pothole matrix was inspected on PDF
page 20; the printed high-width and pit-size clauses were inspected on pages
18 and 23 rather than inferred from extraction.

## CE decisions still needed

- Confirm all 18 graded sets of paraphrases and the ride-quality procedure
  in X1.4.6-X1.4.7, including operating speed and vehicle context.
- Resolve the 25 mm overlap for Depression (X1.10.1) and the exact 25, 50,
  and 100 mm gaps for Lane/Shoulder Drop-Off (X1.13.1).
- Confirm all filled-crack, secondary-cracking and breakup alternatives in
  Joint Reflection and Longitudinal/Transverse Cracking (X1.12.1, X1.14.2).
  The latter prints a high-width threshold as `75 m` alongside `3 in.`;
  the app does not turn that discrepancy into an automatic rule.
- Resolve the Pothole table's overlapping 200 and 450 mm column endpoints,
  exactly 750 mm, depths below the table's starting range, and evidence for
  equivalent counts above 750 mm (X1.17.1; Table X1.1). The form now records
  diameter and depth for every small-hole group and dimensions plus measured
  area for large holes. It rejects unresolved boundaries.
- Resolve exactly 40 mm in Slippage Cracking (X1.21.1) and the printed
  metric/imperial pit-size inconsistency for high Weathering and Raveling
  (X1.23.1). Confirm patch exclusions and the Block Cracking cross-reference.
- Decide whether the team has permission to distribute even paraphrased
  source-derived field cues in a public app. No ASTM PDF text or figures are
  embedded, and no CE review or distribution permission is asserted here.

The versioned cue is entered by the authenticated Encoder client and retained
as a provisional observation record. It is not a trusted engineering reference
or a substitute for the source document. The Review-only migration
`20261103105805_d6433_07_severity_guidance_snapshot.sql` stores the captured
cue in `distress_records.measurement_details`, which is included in the
submitted calculation input snapshot. It does not modify the calculation,
approval, publication, Viewer, or historical D6433-24 rules.

## Provisional measurement-parts form

The Inspector now chooses one active D6433-07 distress from an alphabetical
dropdown. Only that type's draft Appendix X1 severity cues and unit-specific
measurement form are shown. Polished Aggregate still saves `null` severity.

- For an area type, each part is either a simple rectangle (measured length ×
  width) or an irregular measured area. For a length type, each part is an
  affected length. These are entry aids for the catalog units cited above,
  not new ASTM severity rules.
- For Potholes (X1.17.1–.2; Table X1.1), each small-hole group records a whole
  count, diameter, and maximum depth. Each hole above 750 mm records diameter,
  depth, and measured area; its equivalent count is area / 0.5 m². Ambiguous
  exact 200, 450, and 750 mm diameters, and small holes below the draft table
  range, are rejected pending CE direction. Different severities need separate
  distress records.
- Maximum depression depth (X1.10.1), lane/shoulder height difference
  (X1.13.1), mean rut depth (X1.19.1), and mean slippage-crack width
  (X1.21.1) have separate optional severity-evidence fields. They never add to
  Q. The Inspector selects severity from the draft cues; the system does not
  infer those grades from the entered depth/width while CE boundary decisions
  remain open.

The Review-only migration `20261103120853_d6433_07_measurement_parts.sql`
recomputes Q from the submitted parts in the database before saving and stores
parts plus optional severity evidence alongside the versioned draft guidance.
Submission snapshots freeze all of these fields. Older D6433-07 rows that lack
parts remain readable; editing one requires entering actual measured parts.
D6433-24 rows and approval/publication gates are unchanged. This migration has
not been applied to the original PCI Automation project.

CE must additionally decide whether numeric depth/height evidence should be
mandatory for Depression, Lane/Shoulder Drop-Off and Rutting; how to record
multiple potholes whose dimensions yield different severities; whether any
upper limits on affected length or grouped-hole count are appropriate; and
whether rectangular approximations are acceptable for each area distress.
