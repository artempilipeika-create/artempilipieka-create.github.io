# Stage 8.4 — audit before continuation

Accepted checkpoint: `1d20047f6b00c62de27f38300fbf6d259a86bb92` (Stage 8.3), runtime `bc6b96101a9eaf88732e1342eaf18c2579e6a385`.
At session start the remote staging branch already contained `d33cfb9e9e16e08953167baf85f53d25dae92772`, a partial Stage 8.4 implementation, with a failed browser job in CI run 35991460443. Railway still ran the accepted old runtime. Continued this descendant; did not reset the remote branch or duplicate its storage.

| Existing component | Finding and Stage 8.4 use |
|---|---|
| `storage.py / VolumeStore` | Existing private Railway volume; random object keys, restrictive modes, fsync and atomic no-overwrite link. Reused unchanged. |
| `files.py / mf_files` | Existing two-phase manifest: staging → bytes + SHA verification → ready. Failed writes retain a failed manifest for reconciliation. Extended only with bound manual `attachment` kind and trusted classification override. |
| `mf_documents / document_service.py` | Generated preliminary PDFs keep their existing calculation/revision/presentation seals. Manual PDFs do not enter this authoritative document model. |
| Order/revision binding | Existing `mf_orders` identity and optional `mf_order_revisions` binding are used. Revision ownership checked before storage and again at ready commit. |
| Upload APIs | Existing catalogue/import/manager intake APIs have purpose-specific provenance. Added a metadata workflow at `/api/v2/orders/{id}/attachments` over the same file store; no second blob service. |
| Manager original intake | Existing `kind=source`, raw rows, import receipts, immutable parent/child revisions are unchanged. Manual `category=source` is a separate attachment, never a substitute for original intake evidence. |
| Download gateway | Existing `/api/v2/files/{id}`, `/download`, `/preview` GET/HEAD aliases dispatch manual bindings through the same authorized gateway. Range returns authorized full 200 with `Accept-Ranges: none`, preserving existing behavior. |
| Native OBLX alias | Excludes manual bindings from `/orders/{id}/oblx`; a manually uploaded OBLX must not replace the alias's existing production artifact. Its own file ID remains downloadable by appropriately scoped staff. |
| RBAC | Current role ceiling + exact unrevoked/unexpired scope + order ownership/assignment + account state. Three new permission definitions; no automatic grants to real users. |
| Audit/outbox | Existing transactional `record_event`, append-only audit, disabled dispatcher. `attachment.ready`, `file.ready` and authorized staff/client download records. No bytes or staff comment in audit/outbox payloads. |
| Client projections | Existing order/calculation/history DTOs remain narrow. New listing filters internal files before DTO creation; staff comments and actual uploader identity are omitted for clients. |
| Backup/restore | Existing advisory lock, pg_dump/pg_restore, file manifests and SHA checks reused unchanged. Stage-specific orchestration restores only to a new database and private root. |

## Permissions matrix

Every row also requires `orders.read` in the current permitted scope. A role alone grants nothing.

| Role | List/download permitted visible attachments | Internal manual files | Upload |
|---|---|---|---|
| Client | Own order, `files.source.read`; only explicit `client_visible` and safe file kind | Always denied, including direct IDs and aliases | Denied at the staff attachment endpoint; existing intake unchanged |
| Manager | `files.attachments.read`, assigned or explicit order scope | Also `files.attachments.internal.read`; OBLX additionally `orders.oblx.read` and verified email | Also `files.attachments.upload`, verified email; internal grants checked again when bytes become ready |
| Admin | Exact attachment grants in existing all/order scope | Same internal/OBLX checks | Same explicit grants and verified email |
| Viewer/accounting | Explicit order-scoped attachment read grant | New internal read permission remains outside these role ceilings | Denied, even if an upload grant row exists |
| Production | Attachment read/internal grants plus existing job-based `orders.read` eligibility | Subject to all existing job/order restrictions; manual OBLX receives no job identity to bypass them | Denied |
| Blocked/disabled staff, service Agent | Denied | Denied | Denied |

## Classification and visibility

Canonical file classification remains `private` / `internal`. Explicit UI category is stored in `mf_order_attachments`: `source`, `drawing`, `image`, `document`, `internal_working`, `production_internal`, `oblx`, `other`.

Visibility is explicit: `client_visible`, `staff_internal` (default), or `production_internal`. Internal working/production categories cannot be client-visible. Native XML content is recognized independently of filename and requested category; recognized OBLX is always `kind=oblx`, `classification=internal`, `category=oblx`, `visibility=production_internal`. Sensitive text signatures are rejected or confined to production-internal visibility.

No edit-visibility or delete endpoint is introduced. Records, filenames, bindings, visibility and stored bytes are immutable; another upload creates a distinct file ID/key. Equal content correctly retains the same SHA-256 value, without overwriting history.

## Formats and limits

Maximum raw file: 10 MiB (10,485,760 bytes). The server also bounds the JSON/base64 request stream to 14 MiB before Pydantic parsing. Browser validation is supplementary.

Accepted passive formats: XLSX, XLS, CSV, PDF, OBLX, PNG, JPG/JPEG, WebP, UTF-8/UTF-16 TXT, DOCX. MIME is determined by the server, not supplied by the client. XLS/DOCX/XLSX with active, embedded, external or encrypted content are rejected. PDF active actions, encrypted objects and object streams (`ObjStm`) are currently rejected; this is deliberately a supported subset of PDF, not a universal PDF parser. Image decoding checks dimensions and format. General archives, DOC, DWG/DXF and executable/script extensions are not enabled.

Filename/path traversal, control characters, reserved Windows names and double executable extensions are rejected. Downloads force attachment disposition, percent-encoded safe original names, `nosniff`, sandbox CSP and `no-store`. No public object URL is returned.

## No automatic workflow

Manual upload writes file manifest/attachment metadata and audit/outbox records only. It does not update the order, create a revision, calculation, generated document, production job, final candidate, approval, verified native result or produce authorization. Synthetic acceptance compares the complete order row and protected table snapshots. Native gate remains CLOSED / NOT VERIFIED.
