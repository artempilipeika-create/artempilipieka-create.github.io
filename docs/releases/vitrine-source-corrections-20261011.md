# Z1 source corrections, 11 October 2026

Three supplied FR3D uploads were parsed without executing embedded scripts. All seven panels, profile lengths, grooves, hardware quantities and nested elasticity still match the prior production geometry. The twelve catalogue choices and their stable IDs remain unchanged.

| Choice | Current source file | SHA-256 | Result |
| --- | --- | --- | --- |
| AQ / both / L | ПН-600.Витрина. Фр_4мм_Две стороны_Центр.Z1_отк_L.Пл_4-9мм(2).fr3d | 104baef026a61709d71314d5f31e5bd11a84bfbb728109686131f7b1b13ddb37 | Global elasticity added: X435, Y1720, equal Z185/Z420. Resize enabled. |
| AQ / both / P | ПН-600.Витрина. Фр_4мм_Две стороны_Центр.Z1_отк_P.Пл_4-9мм.(3).fr3d | 9f3d56c0117949747b8c0190832a2e716e0da5b0ca46f1403f894f0565eb7947 | Byte-identical to previous upload; filename updated. Existing resize retained. |
| LIRA / both / L | ПН-600.Витрина. Фр_17.5мм_Две стороны_Центр.Z1_отк_L.Пл_4-9мм.(1).fr3d | 076d752ac1cf119230d8db984f76fc74e82e7b14828472436daf1ef0484f1259 | Byte-identical to previous upload. No global elasticity; remains fixed at 600 × 2000 × 600 mm. |

The author explicitly accepted the current LIRA / left / L body replacement and its settings. That donor stays unchanged; its former internal-name warning is now recorded as an accepted source note.

Known previous hashes are explicitly listed per stable catalogue ID. Opening/saving an existing project upgrades only a matching known source to the current filename, hash and resize flag. Item identity, dimensions, placement, materials, shelf count and notes are retained. Unknown hashes are still rejected. Shared views and PDF calculations recognize the known previous versions. No project database migration or mass rewrite is performed.

Native export uses the corrected filename/hash from the normalized scene. The AQ both/L visual hinge positioning now reads the measured Y1720 plane; only the upper hinge moves, as before. Original shelf Y1043 remains below the stretch plane.

Validation: all 255 WebGL/core tests and six Python schema/PDF/parity tests passed. Independently extracted panel fixtures match all three supplied files. Browser QA is unavailable in this managed environment; actual BAZIS runtime import/resizing has not been executed here.

This supersedes the AQ both/L fixed-size limitation in `vitrine-z1-20261010.md`. The LIRA both/L limitation in `vitrine-lira-20261011.md` still applies.
