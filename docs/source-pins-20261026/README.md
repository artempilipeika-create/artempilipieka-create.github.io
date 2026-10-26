# Preserve saved module sources — 26 October 2026

The importer error showed a missing exact LIRA left/left vitrine donor, SHA-256
`298ec5f7d35c1d45a895e17200e03b69d511b84a6ce578eb1046315f36629af1`.
The original user upload was recovered read-only: 1,147,107 bytes, matching that
hash exactly. The preceding open-wall/waste update did not change this vitrine
record. The screenshot alone does not establish an on-disk FR3D overwrite.

Separate code paths did silently replace known source revisions on scene load,
API read/save, export and native import. They are now disabled. Saved SHA-256
and filenames remain pinned; selecting a variant explicitly still selects its
current source. No database migration or bulk project rewrite is performed.
Already-saved replacements are not automatically reversed: their original
intent cannot be inferred reliably.

Historical upper dryer, NMD2, Z1 and pull-out dryer identities remain intact.
Historical Z1 donors without global elasticity keep their original size limit.
The old NORWING revision retains its actual basket bounds and warning; these
were recovered from the pre-correction registry, not inferred from the new one.
Renamed exact files retain their saved name and resolve by their exact bytes.

Importer 9.9.5 reports actual hashes and locations of same-name mismatches. It
keeps strict SHA validation and never substitutes a donor. The existing tools
mirror remains byte-identical for compatibility; the user download is named
`Martin_Forest_Import_v9_9_5_SOURCE_PINS.js`. Source files are read, not saved.
The recovered original is supplied separately in a new subfolder, not committed
to this repository or copied over any user file.

Validation: 114 focused Node tests and 92 Python tests pass. Cross-family checks
exercise real scene normalization and exporter code, preserving source pins and
input objects. The recovered actual FR3D passes strict importer preflight and
has the same hash before and after it (`source-proof.json`). The complete Node
suite is compared against an isolated worktree of the starting commit; see
`test-comparison.json` for existing failures and the no-new-failure comparison.
Native Windows BAZIS execution remains untested in this environment.
