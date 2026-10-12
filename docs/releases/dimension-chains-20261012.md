# Reference-style dimension chains — 2026-10-12

Follow-up to `ae5c383eefd0e73bebdbfe92ffc4892ff1fb682c` on isolated branch
`mf-dimension-chains-20261012`. The user supplied a PlanPlace screenshot and
explicitly requested no depth dimension on the scene.

- Width chains sit above the lower and upper cabinets. Overall straight-row
  lengths occupy a second line farther out. Heights are on the outside of rows.
- Thin arrowed lines and plain numbers replace boxed badges. Hover/focus still
  reveals that cabinet dimensions can be clicked and edited.
- Depth annotations are removed; the existing inspector depth field is unchanged.
- Upper modules with a shared top datum stay in one chain even when their heights
  differ. Each perpendicular corner return and each tier retains its own chain.
- Height labels describe the selected cabinet in their row, or its first cabinet
  when that row is not selected. Clicking edits that cabinet only.
- Camera fitting now clears residual orbit motion, refreshes the viewport before
  fitting, and reserves more space for dimensions in front and mobile views.
- The existing validation, total-height conversion, undo, autosave, clearances,
  client visibility and WebGL fallback are preserved.

Validation: 318 Node tests passed, including shared-top upper-cabinet and no-depth
coverage. Browser acceptance uses only intercepted synthetic APIs and includes
all cardinal rotations, top/front views, a corner kitchen, mobile editing,
invalid-edit rollback, undo, autosave and fallback cleanup. Desktop, corner,
front and mobile screenshots were inspected before release.
