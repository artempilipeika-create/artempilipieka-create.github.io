# Constructor movement and remaining texture collection

Scope: isolated Martin Forest v2 staging only; base commit
`4ca9fbd95c788602cedfbf66f7cf27f2f9970f4d`. No production, database, order or
messaging mutations. User authorized the previously discussed improvements.

## Behavior

- Replace a module within its tier, retain item identity, custom name, materials,
  note, placement and optional envelope. Preserve project leg settings and only
  compatible per-part overrides; optical parts remain protected.
- Existing kitchen/lower/upper selection scopes also control drag, nudge and
  coordinate movement. Validate the final group positions atomically and keep
  one history entry per action. Ghost meshes support WebGL and fallback rendering.
- Optional touching-neighbour shift on width changes, including replacement.
  Stops at a gap, corner, orientation or elevation change; default off.
- Material picker thumbnails, missing/approximate status and stale-search response
  protection. Empty visual metadata no longer hides verified texture data.
- Importer v9.6 retains all 778 v9.5 texture bindings and optical protection.
  Adds user-confirmed 816 PO and 816 TM links to `Bayspan\816 TM.jpg`.
  Exact identity/path/size checks are required; the image bytes have not arrived.
  Runtime hashing is logged without claiming preverified content.
- Read-only Windows collector skips exact already-received files, creates 2048px
  web copies with original paths/hashes, and packs roughly 48MiB batches. Original
  files remain untouched. Source and reproducible toolkit packaging are included.

## Evidence

- Node: 51 targeted core/mobility/native tests pass (50 combined plus the new
  default-corpus/custom-leg regression).
- Python: 23 material visual and image registry tests pass.
- Chromium/WebGL: replacement, group drag, width propagation, atomic rejection,
  undo/redo, save/restore/schema validation, source export, real texture decoding,
  picker status and mobile overflow checks pass. No browser errors or attempted
  API writes. Test scripts use synthetic GET responses.
- Native script syntax and old binding equality verified. Windows PowerShell
  image conversion and BAZIS v9.6 execution still require the user's machine.

## Remaining inputs / explicit limits

- Inventory: 1315 images; 391 received. Remaining image bytes and unambiguous
  catalogue matches are required before claiming complete texture coverage.
- Native shelf count/position changes retain the manual-adjustment marker:
  attachments and drilling must be verified in BAZIS before automation.
- New appliance/lift/drawer families require production FR3D donors. Hardware
  alternatives need approved article/price/source data. No invented donors or prices.
- Mobile viewing works; it is not claimed as a replacement for desktop production
  design. Group movement is by existing scopes, not arbitrary multi-selection.
