# Approved client album — 2026-10-29

The user approved cover 2 and a front elevation with visible interior. The cover uses the original paid photograph to all A4 landscape edges, with only MARTIN FOREST, the order number and project name. The vector elevation is page 2, material samples stay on page 3, and the numbered module schedule is on page 4.

The order number is saved in `scene.albumSettings.order_number`; changes to album metadata do not invalidate a paid render. A single paid image is reused for PDF rebuilds. JPEG input is embedded without recompression or downsampling. New supported GPT Image 2 renders request 2048 × 1440, JPEG quality 100; the configured 2.5 model requests xhigh. No paid provider requests were made during validation.

The first wall-cabinet tier follows the associated lower run's worktop plus 600 mm. Explicitly stacked uppers remain above their parent tier. The browser and server apply the same mounting rule. Native source filenames, hashes and manual materials are preserved. The drawing projects the production parts used by the editor; unknown native interiors are labelled as outlines.

Validation: 750 JavaScript checks; 490 Python checks plus a dedicated asset-route check passed locally. 37 database checks were skipped locally and are required in the disposable-Postgres Constructor reliability workflow before deployment. All four PDF pages were rendered and visually inspected. Tests cover all 151 registered native variants, mounting/ceiling constraints, saved order metadata, one-paid-image reuse and byte-for-byte JPEG preservation.

Publication must pin the exact successful workflow commit to the existing martin-forest-v2-staging Railway service. No importer changes are part of this update.
