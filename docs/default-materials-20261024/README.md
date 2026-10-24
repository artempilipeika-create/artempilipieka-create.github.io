# Kitchen material defaults — 2026-10-24

New modules receive the user's requested catalogue variants:

| Role | Verified article / name | Thickness | Variant ID |
| --- | --- | --- | --- |
| Carcass | BYSPAN 605 PO · Белый | 18 mm | 71118e45-0ce3-534b-ad68-db1238304f18 |
| Facades, plinth | BYSPAN 890 PO · Персидский жемчуг | 18 mm | 389a2abc-c6e2-5214-a41b-60054320d0ff |

Verified from the current authenticated catalogue, release
`e6db8155-91a6-4f15-9b89-ce2194b43373`; 605 PE, 605 SM and 605 PO 16 mm
are separate variants and are not used for these defaults.

Both the WebGL draft path (including drag-in previews) and legacy module creation
use the same defaults. The two material records preload before catalogue rendering.
Existing saved projects and copies retain their material choices; no load-time
rewrites. The regular picker still changes each role independently or in a group.
Glass facades/shelves stay glass. Separate 16 mm drawer boards, HDF, countertop
and part-level assignments are not replaced. Row and automatic plinths inherit
890 PO from the new lower modules, while explicit plinth materials still take priority.

Validation: 44 Node tests passed, including real catalogue drafts, real material
picker, save/load, actual BAZIS JSON with automatic plinth, 16 mm drawer protection,
vitrine glass and the prior NMD2 source fix. Updated two stale test harness references
(current importer filename and exporter source-refresh setup); no native importer edits.
