# Martin Forest — client images, 24 October 2026 (Minsk)

Runtime: `6ec22f4132db8368074629a8b942856bdfcc813d`.
Existing constructor: https://martin-forest-v2-staging-production.up.railway.app/constructor.html

## Result

“Картинка для клиента” is accessible from the constructor header in both working and client modes. A modal previews the actual WebGL scene, with a clean PNG or a branded Martin Forest presentation sheet. The sheet includes the project title, Minsk date, camera label, room dimensions and module count. It does not invent prices, client details, approval signatures or manufacturing status. The render includes the real appliances, selected textures, backsplash and wall lighting. PNG scene sizes are 1920×1080 and 2560×1440, bounded by GPU texture size; the branded layout adds header and footer outside that scene image.

Presets: overall, left, right, front, top, and current camera. Up to six named cameras persist as `Scene.presentationViews` in the existing project JSON, with undo, autosave, duplicate and version snapshot support. Camera metadata is independent of furniture dimensions, production notes and material identity. The modal can apply a selected camera to the scene.

Capture runs synchronously at an independent resolution, through the real studio renderer. It hides selection and placement guides and restores camera, optical offset, projection, renderer pixel ratio, scene size, display lighting and guide visibility in `finally`, including failed encoding. No replacement geometry or generated concept image is used.

Device-local scene quality offers Auto / High / Smooth. Auto starts from browser memory/core hints when available; after 36 eligible samples it reduces rendering resolution if median CPU frame submission exceeds 42 ms. This is a bounded heuristic, not a GPU benchmark or a guaranteed frame rate. Export resolution stays independent. Existing room shadow, exact mesh, texture and production logic remain intact.

## Validation

- 40 targeted Node checks passed: presentation capture success/failure restoration, persistent camera undo/autosave, bounded export sizes and filenames, sustained quality reduction, existing client framing, material appearance, wall finishes and autosave.
- 136 Python checks passed: finite/bounded/unique camera schema and round trip; existing wall finishes, materials, fixtures, sockets and shafts; all four new assets served under unchanged CSP.
- JavaScript syntax, Python compilation and git whitespace checks passed.
- Existing standalone Playwright camera checks encode superseded 36° FOV and are not used as evidence for the current 32° client framing. Browser QA uses the connected browser UI.

No database migration, authentication change, order submission, production integration call, manufacturing/export rewrite or new Tripo credit usage.

## Live evidence

Connected Chrome review: 1920×1512 branded preview and 2560×1440 clean front preview rendered from the saved kitchen. Both “Общий ракурс” and “Фасадный ракурс” persisted after explicit save and page reload. Applying the front preset updated the main scene. The PNG link became ready with a valid blob URL and filename; clicking reached the application download handler. Browser automation could not return a downloaded blob file (its downloadMedia capability reports blob downloads unsupported), so filesystem delivery is not claimed. No console warnings/errors were reported.

The first live review caught legacy dialog CSS limiting the modal to 540 px; scoped styles fixed the width, header contrast and control spacing. Top-view review caught a room badge and technical floor outlines; the final renderer hides these in client presentation while preserving room geometry.

Screenshot: `presentation.jpg`.

Final isolated Railway deployment `a0722e9f-7188-47bd-a09a-923e8041fe43` reached SUCCESS at 2026-10-23 22:29:43 UTC (24 October 01:29 Minsk), pinned to the runtime above. Final Chrome reload confirmed a clean top view with no numeric room badge or technical outlines; the PNG filename used 2026-10-24, matching the sheet. Both side presets completed. Device quality was changed to Smooth and restored to Auto. Final browser warnings/errors: none. The presentation dialog is left open as the deliverable. `clean-top.jpg` and `presentation.jpg` are final UI evidence.
