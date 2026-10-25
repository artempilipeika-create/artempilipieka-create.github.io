# Visual execution choices

The right-hand module parameters now share a large current-module preview and picture choices for filling, facades, opening, hardware and lighting. The existing 14 catalogue families use the same presentation. Cargo and pull-out dryer selects are exposed as picture choices and compact width chips. Selected cards have a blue border and check; incompatible variants show their reason.

Previews use isolated copies of the canonical furniture model with neutral materials. Filling hides fronts and pulls out drawers; hinge choices open the door; handle and Gola choices show a close view. The upper dryer wire racks are a schematic illustration only. Lighting-system photographs retain the existing clear profile examples. Cargo hardware hints show the current kit's mounting and article.

The view toggle never changes project state. Existing controls and variant functions remain responsible for actual edits, undo and save. There are no schema, BOM, production geometry or order-integration changes. Freeform modules retain their original handles selector. A separate mesh factory shares the existing WebGL context; visible previews render lazily and the image cache is bounded at 24 entries.

Validation: nine variant tests passed; the synthetic browser check covered all 14 families, read-only preview toggles, an actual option change and undo for each family, dryer 900/800 width compatibility, and 390 px mobile layout. Detailed checks covered resizing, save/restore, inner drawers, Gola, hardware and lighting. Existing catalogue/finishes regression passed. All API writes were mocked; no production orders or external messages were sent. See validation.json and captured WebP images.

Commands:

```sh
node --test scripts/test-execution-options.mjs
python scripts/verify-execution-cards-browser.py
python scripts/verify-execution-details-browser.py
python scripts/verify-lively-catalogue-browser.py
```

Browser scripts accept `MF_TEST_BROWSER` and `MF_TEST_OUTPUT`; they need the local Python FastAPI, uvicorn and Playwright dependencies.
