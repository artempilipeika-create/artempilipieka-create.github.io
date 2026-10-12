# Scene dimensions — 2026-10-12

Isolated branch `mf-scene-dimensions-20261012`, based on the deployed
`7ed8ba4259981b78901cea4d2b209a2f1b390f84` project-safety release.

## User-facing behavior

- Dimensions are on by default; the “Размеры” button toggles the overlay.
- Every visible cabinet has a width annotation. The selected cabinet also has
  overall height and nominal carcass depth. Screen-facing labels follow camera
  orbit, zoom, cabinet position and all four supported rotations.
- A second dimension gives the extent of each contiguous, straight row with at
  least two cabinets. Gaps, tiers and perpendicular returns split rows; an
  L-shaped kitchen is not incorrectly represented by one summed dimension.
- Click a cabinet's number to edit it. Enter submits; Escape cancels. The existing
  interaction/history pipeline validates model limits, collisions and room bounds.
  Rejected edits change nothing. One successful edit is one undo step and is
  included in the existing autosave snapshot.
- Overall height includes the enabled countertop. Editing it subtracts the
  existing thickness before updating the saved module height, preserving legs
  and thickness. The visible summary separates carcass, base and countertop.
- Drag previews show nearest cardinal wall/cabinet clearances. Group movement
  uses the group's outer envelope. Clearances use closed facade bounds, not
  handles, opening sweeps, room services or countertop overhangs.
- Labels avoid one another; at extremely dense/edge-on views secondary labels
  can be suppressed. Selected dimensions have priority. Client presentation
  hides the overlay. WebGL loss closes the editor and keeps the original 2D fallback.

No source-model identities, production geometry, export format, persistence
schema or neighbor resizing rules were changed.

## Verification

- `node --test tests/webgl/*.test.mjs`: 317 passed, including 9 dimension tests.
- `scripts/verify-scene-dimensions-browser.py`: actual Chromium/WebGL, synthetic
  intercepted APIs only. Verified all four rotations, top/front views, live drag
  clearances and cancellation, width/height/depth editing, left anchoring,
  invalid-size and collision rollback, one-step undo/redo, autosaved values,
  toggle/client view, 390 px mobile editing and fallback cleanup. No page errors.
- Inspected desktop, top, drag, mobile and mobile editor screenshots. Moved the
  height breakdown away from dimension lines and reserved space for mobile controls.
