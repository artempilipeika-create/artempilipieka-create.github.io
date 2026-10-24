# Straight automatic plinth and native skinali export — 2026-10-24

Automatic plinths now follow cabinet fronts only. Free row ends no longer add
side returns, which made a straight row appear U-shaped. Real kitchen corners,
material changes, leg heights and gaps still split and align the front boards.
Explicit manual L/U plinth choices remain available and unchanged.

Previously wall panels were exported only as notes/schedule data with
`native_import: false`. A 6 mm skinali now also appears in the native `items`
array, one straight FR3D per resolved surface. This preserves unequal corner
arms and disabled sections. The exported position is the board frame's bottom
centre, with its positive Z facing into the room at all four wall orientations.
The actual export status includes the counts of plinths and skinali segments.

Original source: `Скиналь.Прямая.fr3d`, SHA-256
`8bc8c1cdbad74e25ba11cc9b9000de7135de18bef5dda61a2f9f69e6c12e12b2`.
Read-only source inspection confirms a 2000 × 600 × 6 mm frame and panel,
origin (0, 0, 0), name `Скиналь`, material `Скинали Скиф Дуб Вотан` / `111 CH`.
A selected skinali material must be loaded and exactly 6 mm. Without a selected
decor, the exact original native material is retained. Tile, LDSP wall finishes
and lights stay schedule-only. Architectural openings are documented for
manual cutting; socket holes, hardware and cutting optimization are not added.

The BAZIS importer remains byte-for-byte 9.9.4. Source identities, source bytes,
module construction and the 605 PO / 890 PO material fix are unchanged.
The downloadable source pack contains the original straight plinth and skinali
inside a new subfolder, with no replacement of existing source files.
A fresh website export is required; previously downloaded JSON lacks skinali
objects. This change has not yet been deployed.

Validation:
- 143 Node tests passed across actual JSON export, strict FR3D resolution,
  native placement/material API mocks, four walls and four panel shapes,
  automatic finishes, manual accessories, kitchen rows, corners, countertops,
  catalogue isolation, 605 PO / 890 PO and global X/Z alignment.
- 37 Python tests passed across wall finishes, accessories and countertops,
  including save roundtrip, original FR3D measurements and source download.
- Native Windows BAZIS runtime is not available here; mocks do not establish
  that end-to-end runtime result.
- [Geometry review](finishes-review.jpg) uses actual MeshFactory and
  WallFinishMesh geometry with offline review lighting; it is not a browser
  screenshot or an AI-generated furniture design.
