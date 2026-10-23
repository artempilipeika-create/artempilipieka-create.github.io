# Studio depth and presentation — 23 October 2026

Request: improve the actual Martin Forest scene before adding generated appliance assets.

The planner and public product viewer now render through a linear HDR colour/depth target and a 16-sample depth-based ambient occlusion pass. The final pass performs tone mapping and sRGB conversion once. A bounded framebuffer and up to four MSAA samples retain small cabinet details. GPUs without floating-point colour buffers use the direct rendering path. Orthographic views and nested catalogue render targets bypass post-processing.

A blocker search and disk filter replace the fixed PCF shadow kernel for the bundled Three r180: contact shadows remain tighter and distant shadows soften. The planner shadow camera uses fitted near/far planes and a normal bias to reduce edge acne. Texture updates wait for image data. The procedural reflection environment and actual manufacturer material maps remain in place.

Client presentation uses a lower camera, 32-degree field of view, a seamless studio ground and distance haze. The measured room, selected finishes, cabinet geometry, GLB, production core and BAZIS data are unchanged. These are real-time graphics changes; no Tripo generation or credits were used.

Validation before live review: 79 existing geometry/materials/selection/room/camera/viewer tests passed, plus four new rendering lifecycle tests. The new asset route returns 200, unknown assets remain 404. Node syntax and whitespace checks passed. GPU shader compilation and visual results are checked on the deployed site below.

Live review: Railway deployment 7ad33bc8-23c0-492c-8cbe-1079919eab0e succeeded at code commit 661e4f31bb4c131f9eabd73a86d400d98c4c88e8. The existing signed-in kitchen was reloaded without editing its room or modules. Technical 3D, client perspective, client front view and top view worked. The public GLB loaded; room/studio, lighting and front/back controls worked. No shader or rendering errors were reported in either page. The earlier unloaded-texture warning did not recur after the final reload. Evidence: before.jpg and after.jpg. The screen-space effect remains view-dependent; no phone or low-end hardware benchmark was completed.
