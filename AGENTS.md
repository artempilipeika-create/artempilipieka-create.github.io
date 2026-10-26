# Martin Forest SPEC v2

- Continue the existing project. Functional source: baseline 4fb9d5ceb146480be540a39b454119ea84daa98f. Visual source: original photographic Sites concept, version 5.
- This branch is for isolated review. Never change main, zapusk-bazis-raskroy-baseline, martin-forest-api-v1 or production infrastructure without the next explicit request.
- D:\pgm is strictly READ ONLY. Do not write, rename, move or delete production files.
- Preserve Bridge API, Postgres, V7 AUTO, SITE SYNC and stable order_id.
- public/ is the served frontend. scripts/build-public-pages.py keeps existing root and preview mirrors aligned. Preserve editor/import/export, catalogue, account, admin and 3D business logic during this visual phase.
- Public pages and styling are the only redesign scope currently approved. Further production logic requires a later implementation phase against SPEC v2.
- Confirmed requirements: 4.4 mm kerf; 10 mm trim on every side; 621 PO and 621 PE are distinct; retain manual edge assignments; never silently convert qty=0 to 1; retain bad Excel rows with errors; three discounts; separate manager/self preparation paths.
- Tests must never submit production orders or send Telegram messages. This preview uses its own ephemeral v9 SQLite database, with no production integration secrets.
- Do not expose a known default administrator. server/preview.py preserves the baseline backend and supplies the preview boundary.

## Constructor reliability and publishing

- For constructor changes, run `node --test tests/webgl/*.test.mjs` and `python -m pytest -q tests/test_*.py tests/stage07/test_furniture_heights.py tests/stage07/test_presentation.py`. Do not dismiss failed checks as unrelated without investigating and correcting their contract or implementation.
- The `Constructor reliability` workflow runs the same suites with disposable PostgreSQL on the active staging branch and reliability audit branches. Database tests must use a local `mf_staging_` database and `MF_EMAIL_PROVIDER=fake`; never point them at a live database or notification provider.
- Before updating the pinned staging service, verify a successful workflow for the code being deployed. After deployment, verify the deployed commit, save/reopen/edit a synthetic QA project, and check browser/runtime errors. Do not modify a customer's project for smoke tests.
- Preserve an existing module's exact `bazis_file` and `bazis_sha256` through load, save and export. Native source identity controls its construction rules; an inferred legacy `template_id` must not override them. Tripo visuals must not replace production geometry or manual material choices.
