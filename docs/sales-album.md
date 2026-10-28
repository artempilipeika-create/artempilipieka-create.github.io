# Client sales album · legacy technical API

As of 2026-10-28, the constructor uses the single four-page workflow documented
in `kitchen-client-album.md`. The old five-page dialog and its independent paid
generation button have been removed. The technical PDF API and renderer remain
for existing integrations. The UI review script below describes the retired dialog.

The constructor's PDF menu opens a five-page A3 sales album: hero image,
materials/second view, cabinet list, and two complete hardware sheets.
Assembly instructions and panel manufacturing lists are excluded. The existing
`specification.pdf` API remains available for earlier integrations.

The dialog saves the current scene before capturing previews. Both the client
snapshot and the server project revision must still match on export. Quantities
and material labels are derived from the owned saved project, never an image.
An oversized list fails visibly instead of losing rows or producing a sixth page.

Legacy hardware data is generated from the native JS catalogue with
`node scripts/export-sales-hardware.mjs`. Regenerate it after catalogue edits;
`--check` and parity tests detect drift. Disabled shelves have no shelf supports.
Guide quantities use their explicit units; one ball-slide set is a pair. Hinges are pieces. Duplicate part articles are not
merged blindly. Missing articles and source conflicts are printed for review.
The legacy single-door donor still has a shelf-fixing conflict, and article
05.0360 occurs on both leg and base: these require source/catalogue confirmation.
Handle quantities derive from actual door/drawer counts; the handle model must
be selected. Prices and installation consumables are not inferred.

## Optional automatic photorealism

Ready PNG/JPEG/WebP files can be inserted immediately. Automatic generation is
OFF unless the isolated application has `MF_IMAGE_API_KEY` configured privately.
Do not put a key in frontend code, a repository, a PDF or chat. `MF_IMAGE_MODEL`
optionally selects the image model; default `gpt-image-2.5-sunburst`.
Only the fixed OpenAI image-edits endpoint is used. One request per owner and
at most two per process may run concurrently. Requests are never retried
automatically. Model/API costs are separate from the ChatGPT subscription.
Reference: https://developers.openai.com/api/docs/guides/image-generation

Images are transient in this export dialog, not persisted as project assets.
The user reviews cabinets/materials before including a photo. This is required
because generative images cannot guarantee manufacturing geometry or exact
colour appearance. The furniture model itself is never modified by generation.

## Sales review corrections, 2026-10-25

- The purchasing ledger removes AQ drawer assembly children only when every
  selected complete parent kit is present; the production BOM is preserved.
  The supplier kit contents remain a procurement confirmation item.
- AKS 114797 denotes one slide set per drawer, including appliance towers;
  identical rows now aggregate with the same unit. Product reference:
  https://aksmebel.ru/catalog/napravlyayushchaya-sharikovaya-l-500-h-45-prime-by-aks-soft-close/
- Technical QA/test project names are replaced by a client-facing album title;
  the stored project name is unchanged.
- The album labels unresolved countertops and unconfigured lighting explicitly.
  New automatic generations require a selected countertop material before any
  provider request. Existing images can still be reused without generation.
- The render prompt describes continuous worktops and disallows invented
  cabinet lighting. No paid image generation was used for these corrections.

Validation: `python -m pytest -q tests/test_sales_album.py`; the browser script
`scripts/verify-sales-album-browser.py --hero /path/to/photo.png` intercepts every
API request and exercises local/specified static UI, including fresh save,
image upload, review, PDF download, mobile layout and stale-scene rejection.
It never writes actual projects or orders. The provider has not been called
without a configured key; test the provider connection separately after setup.

## Release validation, 2026-10-24

Application commit: `251c8b402e04da0cafbd58efc4e595ed54829a8b`.
Isolated service deployment `4486ce7a-4bf2-4ca5-aba0-6af4a1cef84b`
reached SUCCESS and passed `/health`. No variables, schema, volumes, production
Bridge/order integrations, or main branch were changed.

- 50 Python checks passed across sales, accessories, appearance and room equipment
  (49 initial checks plus the added route/auth/revision check).
- 29 JS checks passed for kitchen geometry, default materials and room equipment.
- The synthetic full browser flow produced 5 PDF pages and 7 module thumbnails;
  uploaded photo/review, mobile layout and stale-scene rejection passed.
- Connected Chrome on the deployed site showed the new dialog and disabled
  automatic provider state. Export from the pre-existing QA equipment project
  completed with `Альбом готов: 5 листов.`; console errors/warnings were empty.
  Browser download-event transport timed out after the application completed;
  the app success state was verified independently. The five-page deliverable
  was generated through the same renderer by the synthetic full UI workflow.
- All five delivered PDF pages were rendered and visually inspected.

Automatic image generation remains untested against the provider and disabled
until a private API key is configured. No provider request was billed in this work.
