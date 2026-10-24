# Client sales album

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
Guide quantities are pairs; hinges are pieces. Duplicate part articles are not
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

Validation: `python -m pytest -q tests/test_sales_album.py`; the browser script
`scripts/verify-sales-album-browser.py --hero /path/to/photo.png` intercepts every
API request and exercises local/specified static UI, including fresh save,
image upload, review, PDF download, mobile layout and stale-scene rejection.
It never writes actual projects or orders. The provider has not been called
without a configured key; test the provider connection separately after setup.
