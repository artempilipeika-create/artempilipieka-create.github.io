# Showroom scene — 23 October 2026

The NMD2-600 public viewer adds an oak-floor room with two cutaway walls and skirting, real receiving shadows, a soft contact mask, a neutral studio alternative, daylight/warm lighting and a detail camera. Reflections come from a small local, procedural window environment shared with the planner. Rendering remains event-driven, with cached 2048 px shadows and capped pixel ratio; no external HDRI or additional Tripo generation.

The planner keeps the selected room preset and manufacturer materials. Client lighting now has a stronger key/fill separation; stone and concrete floors gain subtle unbranded micro-relief. Selection outlines are hidden during client presentation and restored in technical mode.

Cabinet GLB bytes, geometry, transforms, furniture core, physical dimensions, gaps, BAZIS exports, order payloads and database code are unchanged. The public viewer remains separate from the parameterized manufacturing model. The floor uses the already bundled oak scan solely as an environment finish.

The page build script now matches the existing main element with its class attribute, so rebuilding the showroom is repeatable.

Validation: 82 targeted Node tests passed (GLB bounds and triangle count, dimensions, materials, selection, room and camera behavior). All new/existing viewer asset routes returned 200 through isolated FastAPI checks, unknown paths returned 404. Browser review is recorded after deployment. Local cloud preview was unavailable due to its browser URL policy.
