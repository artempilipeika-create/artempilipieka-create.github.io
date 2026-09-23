# Stage 6 — native calibration boundary

Status: **NOT VERIFIED**. There is no safely accessible isolated Windows/BAZIS runner in this session. No BAZIS process was launched, no physical output was ordered, and `D:\pgm`/Resilio were not accessed or changed.

`tests/stage06/fixtures/index.json` records the SHA-256 of six deterministic synthetic exporter fixtures. The neighbouring JSON contains exact manufacturing inputs and structural parser expectations. The fixtures are private/internal manufacturing artifacts when stored by the application; repository fixtures contain synthetic data only.

| Fixture | Required native observation | Current evidence |
|---|---|---|
| four-edges | Asymmetric 600×400, four distinct SKUs on L1/L2/W1/W2; screenshot/export proving native side positions | XML/parser only; NOT VERIFIED |
| texture-on-rotation-forbidden | Grain along length; rotation forbidden in native import | Manifest and comment only; NOT VERIFIED |
| texture-on-rotation-allowed | Grain along length; allowed rotation interpreted correctly | Manifest only; NOT VERIFIED |
| texture-off-rotation-allowed | No grain; rotation allowed | Manifest only; NOT VERIFIED |
| width-grain-asymmetric | Native X/Y/L/W correspondence for width grain | Manifest only; NOT VERIFIED |
| glued-18-plus-18 | Finished 600×400 qty=3 becomes 620×420 qty=6; one blank-nesting operation; glue/finish/edge/packaging remain separate | Stage 4 sealed recipe and XML parser; native NOT VERIFIED |

## Native fields requiring evidence

`Orient`, rotation interpretation, `WithoutButLength/Width`, `Allowance`, `Overhung`, X/Y/L/W axes and all four edge positions are **NOT VERIFIED**. The preview exporter preserves bounded legacy-shaped fields with explicit preview provenance. In particular `Orient=N` does not establish rotation semantics. UUIDs are in sidecar manifests, never invented XML fields. No production-ready export profile is declared.

Before enrollment, an operator must import these fixtures only into a separately authorized staging installation and directory such as `D:\MartinForest_Staging`, capture BAZIS version, exact local material/edge mappings, screenshots/native exports, hashes, errors and run manifest, and independently verify the returned facts. Do not start V7/Site Sync watchers on shared paths. Do not infer a headless CLI or launch command.

The separate Agent package deliberately refuses native execution. The normalized result verifier is an adapter contract, not a proprietary BAZIS result parser. Synthetic Ed25519-signed reports in tests verify signature, identity, files, gates and transactions, **not** BAZIS behavior. No calibration, attestor or native mapping is seeded into live staging. Fake results cannot create final candidates. A real native adapter/profile and calibration evidence require a later explicitly authorized action within the permitted scope.

## Reference №69

Source evidence: SPEC L.3 and the attached audit. The original `04-22.09.26№69 ИП.Козинцев(1).oblx` bytes were not available in the checkout; attachment lookup failed. A fresh byte/XPath comparison is **NOT VERIFIED**.

Recorded facts: `BAZIS-Cutting v2025.11.20.0`, one set, four materials, 120 positions, 306 parts. Material counts: BYSPAN 600SM 18 mm 92/266; EGGER Cyrillic Н3331 ST10 18 mm 5/6; BYSPAN `660  PE` 18 mm 8/8; customer LHDF 3 mm 15/26. Four independent edge blocks are recorded: TopEdge_L1, BottomEdge_L2, LeftEdge_W1, RightEdge_W2. Orient=N and `Вращение запрещено.` are observations from that specimen, not universal semantics. The original fixture has not been rewritten.

## Legacy compatibility/provenance

Production Bridge source at `2031c09c2f9d8690cb75856b0a4cadb1533a411b` was read as reference. Its order-based pull/ack/event contract remains unchanged. The v2 protocol has independent URLs, identity, namespace, run IDs, lease digest, monotonic fencing and dedupe. There is no adapter that forwards v2 jobs to the legacy queue.

V7 AUTO, Site Sync, Import Manager and Linker are retained as existing external tools. Their audit evidence is used for provenance; their complete local archives/processes were not available for a fresh execution review. No legacy watcher, path, mapping database or configuration was edited. This is not a claim that all running Windows processes were inspected.
