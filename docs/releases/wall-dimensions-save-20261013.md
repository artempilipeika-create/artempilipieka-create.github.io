# Wall dimensions and save diagnostics — 2026-10-13

Based on deployed `2cc9e6101a7a1b31278018e4ba3031fdeb380556`.

- Dimensions are anchored to the rear installation line (rear worktop edge for
  verified lower kitchen modules). Height and clickable cabinet widths remain;
  depth is not shown.
- Overall extents include gaps and an adjoining perpendicular countertop where
  it reaches the same rear line. Opposite walls, islands and tiers stay separate.
- Project validation replies now expose a bounded list of safe, known field
  labels and module numbers. Submitted values, arbitrary field names, exception
  messages and credentials are never returned or logged.
- The error banner and project checker show those details. The ineffective
  “Save copy” action is hidden for 422 validation errors. Local drafts remain.
- Undo back to the last server-acknowledged scene clears an obsolete 422 warning
  without a redundant write. Unknown network results and version conflicts retain
  their existing recovery behavior.
- The existing synthetic browser acceptance now validates every write with the
  real Create/Update Pydantic models instead of accepting arbitrary payloads.

Incident evidence: staging and Postgres were Online; the same project returned
200 on PATCH through 2026-10-12 21:32:12 UTC, then repeated PATCH and POST 422
responses from 21:32:19. There were no service failures. The previous response
only returned VALIDATION_ERROR, so the exact rejected field in that private
browser draft could not be determined from the historical logs. Do not claim
that this specific draft is synchronized without a successful retry.
