# STAGE 8.3 — WINDOWS / BAZIS NATIVE CALIBRATION KIT

Scope: preparation only. Native execution: **0**. Gate **CLOSED / NOT VERIFIED**. Stage 9 **BLOCKED**. Никаких native/Q статусов не изменено.

## Checkpoint

- Branch `martin-forest-v2-staging`.
- Accepted/input HEAD `a0122fc60c97589c7919b626c884c4ef480b26af`, working tree до работы clean; GitHub ref повторно подтверждён. Итоговый HEAD — commit этого отчёта/kit, сообщается в финальном ответе.
- Tested runtime `bc6b96101a9eaf88732e1342eaf18c2579e6a385` и deployment `af8ba2e0-dc20-4239-afaa-d6b90c015364` оставлены прежними. В Stage 8.3 не было Railway/deployment/health/DB операций.
- CI baseline **248 PASS / 0 FAIL / 0 SKIP**, run `35896674899` повторно подтверждён completed/success на указанном runtime. Это прежний CI, не новый запуск. Все существующие Stage 1–8 tests/assertions без изменений.

## Поставляемый пакет

`MARTIN_FOREST_NATIVE_CALIBRATION_KIT_v1.zip`, SHA-256:
`d1378bb182d088cd14c5671188c50cc4fdace6bc015fe34ff392dd48992df0b0`.

ZIP содержит каталог `kit/` (33 файла). Source: `../../tools/windows_bazis_calibration/`. Полный список исходных файлов — `created-files.txt`; ZIP hash — `ZIP_SHA256SUMS`; SHA всех kit файлов — `kit/SHA256SUMS`. `build-kit.py` позволяет воспроизвести ZIP с фиксированными entry timestamps/permissions; две сборки были byte-identical. Оригинал №69 и реальные evidence отсутствуют намеренно; no credentials/customer payloads.

Состав:

- README.md — полный Windows runbook, isolation/mapping/manual import/return/cleanup.
- manifest.json — pinned fixture sizes/input+sidecar hashes, version/source checkpoint.
- fixtures/ — шесть OBLX и шесть sidecars плюс исходный index.json, **bytes не изменены**.
- reference/69/ — README + audit expected.json, без оригинального файла.
- common.ps1, preflight.ps1, verify-input.ps1, collect-evidence.ps1.
- templates/ — observations.json, local-mapping.json, isolation-review.json, result-manifest.json, job06.json.
- SCREENSHOTS.md и JOB06.md.
- validate-evidence.py, test_validator.py, build-kit.py, SHA256SUMS, .gitignore.

## Fixture SHA (входы, не native proof)

| Fixture | SHA-256 |
|---|---|
| four-edges | a9bb792d6fd5a24255d38e350a76fd6289e3eca5ea04f750b4f06719fb603d43 |
| glued-18-plus-18 | 7442a4c922bbad12c8f3a224e6efb5e52b6e8d093516657a229fc05bb6c6dee4 |
| texture-on-rotation-forbidden | 9cfa57b9d9af0e82dcdbd0c1d8812ce99099b16f3c27227947424bfcf1cea4b0 |
| texture-on-rotation-allowed | 07ab2ea3c2ab6046dd917ec580601f01fc290ac860e8124d31118a79acb9fc00 |
| texture-off-rotation-allowed | b156367e3cbed97dbc6a3fdcb01d23d39495a57f78f7f87af7b92d0221bff43e |
| width-grain-asymmetric | 9cfa57b9d9af0e82dcdbd0c1d8812ce99099b16f3c27227947424bfcf1cea4b0 |

Два byte-identical OBLX не объединены: sidecars/семантика/отдельные run обязательны.

№69: ожидаемый `04-22.09.26№69 ИП.Козинцев(1).oblx`, **153631 bytes**, SHA **89f9b3ef2e646014600e743e809079411875e2c419c41dc613fc1517f3f5e02c**. Значения предоставлены пользователем; оригинал не реконструировался. Input verifier откажет при отсутствии/size/hash mismatch. Offline validator также не примет synthetic input вместо reference.

## Safety / Windows procedure

Оператор сначала подтверждает отдельный Windows/БАЗИС контур, отсутствие machine/production Agent/sync/watch routing; явно выбирает новый root вне production/shared/system paths. D:\pgm не открывается. Пути с reparse points запрещены. Каталоги создаёт сам оператор, скрипт preflight систему не меняет: только читает metadata и пишет JSON в stdout. Перенаправление в отдельный новый evidence-файл — явная команда оператора.

Preflight: Windows version, hashed machine pseudonym (не hostname), exact EXE path/file+product version/hash, running БАЗИС, explicit test dirs/free space/timezone, process/service/task inventory. Raw command lines/credentials не выводятся. Потенциальный watcher, incomplete scan, отсутствующий review, running БАЗИС/недостаток места → PRECHECK FAIL. Авто-stop/disable отсутствует. Heuristic scan не гарантирует отсутствия неизвестного watcher; требуется human inventory/ACL/sync routing review. Выбранный EXE подтверждается оператором как БАЗИС, по версии/About; имя файла само по себе не proof.

Local mappings фиксируют cloud identity/hash, manufacturer provenance, article, thickness/format, local ID/name/code, source/reviewer/time/evidence. Synthetic identities не заменяются похожими production материалами. Без exact map — needs_material_mapping. Stage 6 exporter/profile и manufacturing recipe не меняются.

Для каждого fixture — новый offline run UUID и correlation UUIDs (не server jobs), свежий preflight и SHA непосредственно перед import. Manual open/import без geometry corrections; реальные screenshots/outputs/observations сохраняются перед следующим fixture. Поля Orient/Rotation/axes/WithoutBut/Allowance/Overhung/edges, grain/qty/material/finished/blank documented individually. Неизвестные native labels → not_exposed_review, не inferred mapping.

18+18: expected finished 600×400 q3, blank 620×420 q6; native stages/layers/child relation, grain, finished qty/consumption/L+W должны быть реально видимы либо явно отмечены как не подтверждённые. Tariff policy отдельно от geometry. JOB-06 — отдельная инструкция/шаблон, не запускается автоматически и требует следующего отдельного разрешения после обычного import. Никакого физического производства.

## Collector / validator

Collector копирует только allowlisted документы текущего run, screenshots/native outputs; originals не изменяет; detects reparse entries, oversized/unsupported files и common plaintext credential markers. Это не универсальный DLP: оператор проверяет outputs/screenshots до передачи. Limit 500 files/1 GiB, 256 MiB/file (text secret screening max 16 MiB). Source/copy hashes сверяются, новый package не перезаписывает предыдущий. Manifest содержит SHA/size/source mtime, fixture/run/mapping/version/operator/attestor/warnings; не содержит lease/API tokens. ID attestor и hashes не являются цифровой подписью.

Offline command: `python tools/windows_bazis_calibration/validate-evidence.py <private-returned-run-directory>` из доверенного kit. Никаких API/DB/Agent connections. Проверяет pinned input/sidecar, inventories, completeness, IDs/time/version/mapping, references, screenshots format, declared expected geometry/qty/edges/material/grain/rotation. Три возможных статуса: **READY_FOR_HUMAN_NATIVE_REVIEW**, **INCOMPLETE_EVIDENCE**, **HASH_MISMATCH**. Ни один не BAZIS PASS. Подлинность artifacts, native semantics, attestation/signature и calibration activation требуют следующего human/server review. Неэкспонированный обязательный invariant остаётся открытым, даже если пакет готов для review.

## Validation фактически выполнена

- **21 PASS / 0 FAIL** — новые offline software validator tests, отдельно от baseline 248 и от native acceptance. Tests используют временные явно fabricated package bytes, никогда не native evidence; удаляются после теста.
- Negative cases: input/output/sidecar tamper, quantity/edge/grain/geometry, mapping identity/version, missing screenshots, reference substitution, preflight FAIL, fatal error, path traversal/symlink/unlisted/duplicate files, false self-awarded PASS, version binding.
- Все 13 исходных fixture/index/sidecar files byte-identical Stage 6; шесть OBLX hashes совпали с Stage 8.2.
- ZIP rebuild byte-identical; все 32 manifest-listed payload hashes и SHA256SUMS проверены внутри 33-file ZIP; оригинала №69 там нет.
- Отсутствующий evidence manifest → INCOMPLETE_EVIDENCE, не native success.
- **Windows PowerShell execution NOT VERIFIED:** pwsh/Windows недоступны; scripts прошли source review, но не Windows runtime test. Не объявляется platform/native PASS. Первое действие оператора — read-only preflight, остановиться при любой ошибке. Скрипты UTF-8 BOM для Windows PowerShell 5.1.

## Что передать обратно

Приватный ZIP полного `evidence/native-run-...` для каждого run, включая неизменённый input, sidecar, preflight/review/input-check, mapping, observations, screenshots, native outputs, manifest. Список run IDs/fixture IDs/BAZIS version/machine pseudonym/mapping version/operator и все предупреждения. Не только screenshots. Не публиковать №69/клиентские данные в Git. Никакой cleanup до подтверждения приёмки; автоматического удаления нет.

## Unchanged / NOT VERIFIED / stop

NC-03/04, JOB-06/08/09/10, native E2E-01: **NOT VERIFIED**. Windows runner/version/mapping/native results/attestation ещё не получены. Calibration records/gates не менялись. Stage 8.1 MIG/business/DR blockers остаются прежними.

Production: в этом этапе **не было** deploy, restart, DB reads/writes, jobs/orders, Agent connections, domain/routing/secret changes или Windows remote execution. Production не опрашивался заново; последнее readonly metadata evidence — Stage 8.2. Это утверждение об отсутствии наших операций, не новая remote проверка инфраструктуры.

Git diff ограничен `tools/windows_bazis_calibration/` и `docs/stage08_3/`. Backend/UI/Agent/protocol/migrations/tests Stage 1–8/CI workflow не изменены. Actual file list/stat — в commit данного отчёта. Rollback — revert только kit/docs commit, runtime/DB rollback не нужен.

**Kit подготовлен для ручного исполнения; native readiness не подтверждена. STAGE 9 BLOCKED.** Работа остановлена до пользовательского Windows run и возврата evidence.
