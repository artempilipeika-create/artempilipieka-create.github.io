# Z1 visual treatment · 12 October 2026

First visual improvement pass, starting with the existing AQ/LIRA Z1 vitrines.

- Glass uses a physical specular material, angle-dependent opacity and a subtle
  green edge on the original 4 mm panels. Alpha blending keeps stacked shelves
  visible behind the facade. This is a real-time approximation, not optical
  ray tracing or a photometric simulation.
- Black frame and light-profile finishes have a tighter metallic reflection;
  KUBIC supports retain their original shape with a clearer metal finish.
- A finite vertical strip-light calculation illuminates interior carcass
  surfaces and both faces of each glass shelf. Its coordinates follow the
  verified groove axis, selected left/right/both side and cabinet dimensions.
  Lighting is bounded to the interior surfaces of that cabinet; it does not
  add global scene lights, shadow maps, geometry or render passes. Ghosts and
  translucent inspection shells omit this surface-light treatment.
- Material copies retain the real material image, fallback metadata and
  optical-part protection. Catalogue thumbnails use the same mesh factory.
- No changes to canonical parts, hardware quantities, BAZIS data, source
  fragments, material mappings, saved scene schema or prices.

## Verification

56 existing vitrine/visual tests passed, including all twelve donor variants,
source geometry, glass protection, native export and LDSP order separation.
JavaScript syntax and Git whitespace checks passed.

`scripts/verify-vitrine-visuals-browser.py` renders with intercepted local
assets and synthetic API reads, using the real asset router and existing
Chromium WebGL runtime. No preview server or production API writes are used.
The three reviewed scenes are white/both/closed LIRA, K009 PW/left/open LIRA,
and graphite/right/closed AQ at 450 × 2600 × 500 mm. It also exercises normal,
inspection and hidden-facade modes. All shaders compiled without browser errors.

Comparing the same scenes against `bc528b8de804358d7aaf60e4f79ddb31723596fc`
confirms identical production parts, hardware, draw calls and triangle counts:
75/12680, 72/12560 and 71/12452 respectively. A controlled light-on/off pixel
comparison changes 128251 pixels inside the view and zero pixels in the sampled
outside-wall area. Before/after images were visually inspected.

The native importer is unaffected; this release requires only a site update.
