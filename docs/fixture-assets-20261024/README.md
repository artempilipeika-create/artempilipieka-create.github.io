# Uploaded Tripo fixtures

The user's three GLB uploads are integrated as shared, lazy-loaded presentation
assets. No new Tripo calls or credits were used. The previously generated hob GLB
was not uploaded, so the existing analytic induction hob remains in use.

| Asset | Original bytes | Web bytes including manifest | Triangles |
|---|---:|---:|---:|
| Sink | 60,301,640 | 1,273,099 | 23,999 |
| Faucet | 64,067,396 | 1,132,247 | 24,000 |
| Hood | 66,628,924 | 1,307,747 | 24,000 |

Original identities: sink `libfile_085a4eb6b70081918279bdc1f37c86ad`, faucet
`libfile_0a9cf675cb0881918167131b325b4054`, hood
`libfile_d8b0959767648191b6a96c76af16c6db`. Per-asset manifests retain the original
SHA-256, task ID, counts, bounds, orientation correction and resource layout.

The sink is rotated from the generated presentation plane into the horizontal
worktop. Its complete bowl is cleared by a visual opening covered by the rim.
The faucet arch is aligned with +Z and positioned by its measured foot center,
retaining its source proportions at 330 mm height. Chrome/black choices remain,
as do the existing angled and compact faucet alternatives.

The hob inspector now offers an optional chimney hood with width 400–1200 mm
and worktop-to-hood distance 400–1200 mm. Default is off for existing projects;
when selected, defaults are 600 mm width and 650 mm distance. The presentation
envelope is 525 mm high and 450 mm deep. These are concept dimensions, not a
manufacturer's installation specification. Placement follows cabinet rotation,
offset and back-wall position. The UI rejects a hood crossing the ceiling or
another cabinet. Settings survive save/load and one-step undo/redo.

Native cabinet parts, FR3D identities, cutlists and BAZIS construction dimensions
are unchanged. No production cutout is manufactured from this visual mesh.
Shared resources survive replacing one cabinet and are released by the factory;
late downloads cannot reattach to disposed previews. Analytic fallbacks remain
visible while loading or if a request fails.

Validation: 92 Node tests and 22 Python tests passed, including actual geometry,
resource lifetime, four rotations, faucet anchor, collision checks, inspector
undo/redo, scene persistence, HTTP asset routes and previous material/plinth fixes.
The review PNG renders the actual MeshFactory output offline with review lighting;
it is not a screenshot of the deployed website. The sink is shown in the native
under-sink cabinet with vertical rails.

Reproduce the placement review:

```sh
node scripts/export-fixture-review.mjs /tmp/fixtures.json
python scripts/render-fixture-review.py /tmp/fixtures.json
```

Publication is pending explicit approval after the production deployment review
rejected the previous attempt. This commit includes the earlier plinth isolation
and importer 9.9.4 material-name corrections through its parent.
