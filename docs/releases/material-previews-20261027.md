# Selected materials in scene and preview

The selected module preview now keeps the original body, facade, back, drawer,
plinth, part and shelf material assignments. It resolves the same catalogue
visuals and saved scale, rotation and surface finish as the main scene. Option
illustrations retain their existing neutral drafts or Tripo artwork.

Preview keys include material assignments, resolved image metadata and appearance
settings. Texture completion or failure invalidates cached pixels; material and
texture caches remain bounded. Production IDs, dimensions, source files, manual
overrides and export rules are unchanged.

## Default material samples

Two official BYSPAN samples are attached by exact manufacturer and full article:

- [605 White, recommended PO](https://span.by/design/dekory/605-belyj/)
- [890 Persian pearl HD, recommended PO](https://span.by/design/dekory/890-persidskij-zhemchug-hd/)

Original JPEG bytes and SHA-256 values are stored in the existing visual manifest.
These are solid-colour digital samples, not calibrated surface scans. Preview
thumbnails retain the originals; rendering uses the interior sample colours
`#ffffff` and `#e1d7cb`. The thin border on the white image is never tiled onto
panels. No measured roughness, embossing or physical scan scale is claimed.
Other finish codes (including PE and SM), decor 810 and other manufacturers do
not inherit these attachments. Existing confirmed texture records are preserved.

## Validation

Local: 720 Node tests and 27 targeted Python tests passed. Real browser checks
cover sample colours, asynchronously loaded wood texture, scale, rotation and
the shared three-state view. The reliability workflow additionally runs the
full constructor/Python suite with disposable PostgreSQL and the material
attachment tests before the isolated staging service is updated.
