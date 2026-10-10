# Z1 elasticity complete, 11 October 2026

The uploads supplied at 02:17 Minsk time complete the source corrections. All twelve AQ/LIRA, left/right/both-lighting and left/right-opening variants now support the existing dimension limits: width 300–600, height 1800–2800, depth 450–700 mm.

| Choice | Current source file | SHA-256 | Result |
| --- | --- | --- | --- |
| LIRA / both / L | ПН-600.Витрина. Фр_17.5мм_Две стороны_Центр.Z1_отк_L.Пл_4-9мм.(2).fr3d | 605a0bfbc114fc4ba57857f77ca7f728e0d8ed7147380908e668a0e8ce7ab35a | Global elasticity added: X460, Y1700, equal Z165/Z440. Resize enabled. |
| LIRA / both / P | ПН-600.Витрина. Фр_17.5мм_Две стороны_Центр.Z1_отк_P.Пл_4-9мм.(1).fr3d | 7ed7202afb11dec8cf9f188ef5bd1cf2278326ba0997edfb93477ced39f774fb | Byte-identical to the previous donor; current uploaded filename adopted. Resize retained. |

Independent extraction confirms unchanged seven-panel geometry, 17.5 × 6.5 mm grooves and trajectories, Z1 frame, hardware quantities and nested elasticity. The new LIRA Y1700 stretch plane is read by the hinge renderer. Original shelf Y1043 remains below the plane.

Stable catalogue IDs are retained. Explicit previous source identities upgrade saved scenes to current filenames, hashes and resize flags using the existing compatibility path. Placement, dimensions, materials, glass shelves and notes are preserved. No database migration or bulk project rewrite is involved.

This supersedes the remaining LIRA both/L fixed-size restriction recorded in `vitrine-source-corrections-20261011.md` and `vitrine-lira-20261011.md`.

Validation: 255 WebGL/core tests and six Python schema/PDF/parity tests passed, including resizing all twelve variants and upgrading known previous donor versions. Independently parsed panel geometry matches the existing production fixtures for both uploads. Browser QA and actual BAZIS runtime execution are unavailable here.
