# Visual asset — Stage 7 furniture fix

Current `backend/v2/ui_assets/panels.webp` is a generated interior concept: natural oak tall cabinetry, forest-green kitchen and island, light stone countertop. The legacy URL is retained solely to keep the existing backend asset allowlist unchanged. It no longer contains boards or technical edge close-ups.

Created with the built-in imagegen tool on 2026-09-23; 1536×1024 PNG converted to WebP quality 88 for delivery (76,046 bytes). No customer photo, logo or personal information was used. The homepage caption identifies it as an interior concept / 3D visualization, not a completed Martin Forest project. The services image and decorative page banners reuse this same concept, not multiple claimed installations.

Prompt: “Premium realistic architectural interior visualization for a furniture-parts website hero. Modern kitchen, natural oak tall cabinetry, matte forest-green base cabinetry and island, pale limestone countertop, neutral plaster, soft daylight. Precise aligned closed fronts, consistent narrow reveals, plausible joinery, no exposed particleboard or edge-banding close-up, no impossible overhangs/intersecting doors/floating cabinetry. Wide eye-level architectural photography, calm center for text overlay; no text/logo/watermark/people/collage. Concept visualization, not a claimed completed customer project.”

Visual inspection found no obvious construction intersections or misleading exposed edging. This is not manufacturing validation or proof of an actual completed project. Native BAZIS remains NOT VERIFIED.

The original accepted boards image remains unchanged under `public/assets/panels.webp` and in Git history; neither protected preview nor baseline is modified. Three independently photographed company projects are still unavailable. The prior asset audit below describes Stage 7 before this fix.

---

# Visual provenance

`backend/v2/ui_assets/panels.webp` is byte-identical to `public/assets/panels.webp` in accepted photographic preview commit 5c97a60145569b7d1df99f5fce5341587db2f75c and Stage 6 tree. It is a supplied/reused visual reference, not evidence of Martin Forest's actual factory or commissioned work. Original author/license documentation is NOT VERIFIED. The hero caption identifies it as an illustration. Alt: «Текстура и торцы мебельных плит». Crop/focal position retains accepted `.mf-hero-image` CSS; replace the fixed image asset when approved company photography becomes available.

The same image no longer appears three times on the homepage. The second and third occurrences are replaced with distinct typographic process/material compositions, not fake photographs. SPEC N.2's complete three-distinct-photograph set remains a content/design limitation; this is explicitly reported rather than calling it fully satisfied.

No external fonts, image trackers or CDN scripts are required at runtime. Existing Manrope/Cormorant declarations fall back to local Arial/Georgia when fonts are unavailable. All UI resources obey self-only CSP.
