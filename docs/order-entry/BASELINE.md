# Order-entry simplification — baseline 2026-09-24

Staging only. Project Martin Forest Site Preview (`6d754ad4-ba7b-45f8-8c5e-356387e7de06`), service martin-forest-v2-staging (`9aacf7bf-edd5-4f08-9423-3fbabea59268`), environment `ee625678-c15e-452d-9761-cda99274839f` (named production inside the isolated staging project).

Branch `martin-forest-v2-staging`; remote and clean local baseline `60c4d932f32bc0cd683df91838c9a7044e09081e`. Active application commit `9b711864ab546cf49c25fedbcd2005412754f69b`, deployment `c6443622-a06a-447c-8de2-358e19fdc108`. Confirmed through Railway status/config and git ls-remote before edits. Normal start `python -m backend.v2.serve`, no bootstrap change.

## OLD versus CURRENT

Historical restored frontend: commit `88cbd62`, `order.js` and `importer.js`; baseline lineage `4fb9d5ceb146480be540a39b454119ea84daa98f` retained in git.

| Area | Historical restored frontend | Before this change | Implementation direction |
|---|---|---|---|
| Manual | `makeDetail`, `renderDetail`, direct cells and add detail | Separate full form for every detail | Direct cells using existing revision API |
| Excel | `detectMapping`, `showImportPreview`, dropdown fields | Letter inputs, exact header entry and template UUID | Actual workbook preview and field dropdowns |
| Templates | Named owner templates and fingerprint | Versioned backend existed, UI required UUID | Existing immutable templates, owner-scoped listing, matching headers |
| Materials | Normalized article and embedded-code search | Strict complete physical identity; unresolved ordinary client text | Search suggestions with explicit confirmation of exact current variant |
| Invalid quantity | `Math.max(1,...)` silently repaired zero | Preserved invalid rows | Preserve current behavior; show row-specific errors |
| PDF | Earlier client-side estimate/export | Server PDF had financial lines but no details | Existing server snapshot/PDF extended with details and inline view |
| Manager | Separate source attachment path | UI required template/import | Source-only upload through existing private file storage/gateway |

No rollback of the catalogue, prices, permissions or financial engine. No migrations, production data, Bridge calls, agent/native actions or automatic customer messages.
