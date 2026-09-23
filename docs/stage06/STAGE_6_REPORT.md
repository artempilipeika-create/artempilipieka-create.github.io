# Martin Forest — Stage 6

Stage 6 реализован в изолированном staging; software/protocol acceptance, HTTPS fake-Agent round-trip, реальный backup/restore и redeploy persistence проверены. Native BAZIS calibration: **NOT VERIFIED**; production readiness не объявляется полной.

Источники: MARTIN_FOREST_SPEC_v2_FINAL.md (G/J/L/O/P/Q), MARTIN_FOREST_AUDIT_EVIDENCE_2026-09-22.md, принятые Stage 0–5 и STAGE_5_REPORT.md. Развивается backend/v2; старый production Bridge не изменён.

## 1. Git и контрольные точки

Ветка: `martin-forest-v2-staging`. Stage 5 accepted HEAD: `d6fe9322c7250042053cf3849e1fca665c87ae44`; accepted runtime: `1d7b3f5e96809644655a31a9501092137294ef2c`; исходный deployment: `39019cb5-69ea-429a-a4ce-48ef966f2874`.

Финальный Railway service: Martin Forest Site Preview / martin-forest-v2-staging, service ID `9aacf7bf-edd5-4f08-9423-3fbabea59268`. Normal deployment `2769bd61-0279-4f83-a152-c3aff6036e1d` — SUCCESS.

Stage 6 tested runtime: `7ca146dbb5f2522604f8a7761e5763ec91f659a5`. Основные implementation commits: `618c24d7f408eaeb75d113518bcb5cf5313dae85`, `bffefaabb5491d3f2cf0860923c9bbf452af74ea`, `d21af2a3f626ffa1c1934d179242dff0275b0ea5`, `9a3db469cce7ec90ee3d426425bf51e73d09303a`, `04ee7c794fd71dd68aa5823a098748e80a810270`, `7ca146dbb5f2522604f8a7761e5763ec91f659a5`. Промежуточные commits содержат диагностику CI; временный cleanup workflow удалён из итогового HEAD.

Сохранённые refs и Railway IDs: environment-before.json, protected-after.json. Baseline `4fb9d5ceb146480be540a39b454119ea84daa98f`, preview `5c97a60145569b7d1df99f5fce5341587db2f75c`, Bridge `2031c09c2f9d8690cb75856b0a4cadb1533a411b`, main `470776dfd3efd1db9638668d2e19ea174b7901cc` не изменены.

## 2. Миграция и данные

`backend/v2/migrations/0006_production_protocol.sql`, SHA-256 `9d2920d36bdb832e6b256027fc62f8201455aaa6b2c56afd69bc227198f52aef`. Миграции 0001–0005 не переписаны.

Добавлены 11 таблиц:

- mf_bazis_calibrations;
- mf_bazis_material_mappings;
- mf_bazis_export_profiles;
- mf_staging_agents;
- mf_agent_requests;
- mf_job_packages;
- mf_job_runs;
- mf_job_results;
- mf_final_calculation_candidates;
- mf_final_approvals;
- mf_job_reconciliations.

Расширены mf_production_jobs, mf_job_events, mf_orders; добавлены explicit reviewed/approved final-candidate pointers. Job содержит exact order/revision/preliminary calculation, purpose, namespace, schema, production profile, catalogue release, financial snapshot hash, creator/admission, lease/result state. Ссылки и package/run/result/candidate identities защищены БД от изменения; admission time после фиксации immutable.

## 3. State machine

Created → admitted → leased → running → result_uploaded → succeeded; отдельные failed, cancelled, uncertain. События не произвольно присваивают бизнес-статус заказа. Истёкший calculate lease допускает новый run_id и package manifest при сохранении старых outputs. Produce после потери lease консервативно становится uncertain; автоматического повторного pull нет. Fencing и attempt монотонны, physical_started нельзя стереть.

## 4–8. Agent auth, lease, events, results

Отдельный server-side `MF_STAGING_AGENT_*` credential: agent UUID, staging environment/namespace, capabilities, digest, expiry/revocation. Service actor имеет только service_agent и не является администратором. Bootstrap — operator-only с granular permission; browser registration отсутствует. Cookie/Origin не заменяют Agent auth.

Heartbeat и pull сверяют разрешённые/reported capabilities; выдаётся максимум один job. Lease token — 48 random bytes, в БД digest; expiry 120 секунд, renewal с неизменным fencing. Старый token/fencing после re-lease, неверный token и expired lease отвергаются. Nonce UUID + timestamp, bounded body/uploads, agent/network rate limits.

Event dedupe по event_id, run/job и payload hash; повтор без двойного audit/outbox. Result dedupe по result_id и полному payload hash: одинаковый повтор idempotent, изменённый payload conflict. Проверяются exact IDs, manifest hash, file hashes/sizes/classification и время. Private result files и result manifest связаны с job/run. Успех процесса exit=0 недостаточен.

## 9–14. Экспортер, package, reference и calibration

Канонический server exporter `mf-server-oblx-v1`, preview profile `mf-oblx-preview-v1`. UTF-8, XML escaping, bounded text/numbers, deterministic ordering, без timestamps, money, discounts, PII, credentials и придуманных UUID XML tags. DTD/entities и неподдерживаемая encoding запрещены. Browser XML не принимается.

Package: private manifest.json + private OBLX, SHA/size/MIME/kind, input hashes, exact material/edge snapshots, manufacturing recipe, production settings, capabilities, версии и stable order/revision/calculation/job/run IDs. При retry новый run manifest, OBLX bytes для того же manufacturing input остаются одинаковыми. ZIP/public artifact routes не созданы.

OBLX имеет kind=oblx/classification=internal. Клиенту hard deny на прямые/альтернативные routes, HEAD, Range, documents/history/ZIP. Cabinet не получает manifests, leases, Agent progress или Windows paths. Manager видит review/result projection; production — job scope; accounting — финансовую projection; admin — explicit controls. Секреты не входят в DTO.

Шесть fixtures, ожидаемые snapshots и SHA: tests/stage06/fixtures. Four-edge asymmetric 600×400; texture ON rotation forbidden/allowed; texture OFF rotation allowed; width grain; 18+18. Для finished 600×400 qty=3 ровно 620×420 qty=6 child blanks; glue/finish/edge/packaging остаются manifest operations. Stage 4 recipe не изменён.

Reference №69 и ограничения свежего сравнения описаны в NATIVE_CALIBRATION.md. Исходные bytes не получены; факты 1 set/4 materials/120 positions/306 parts взяты из предоставленного audit. Native Orient/Rotation/WithoutBut/Allowance/Overhung/axes/edge positions — **NOT VERIFIED**. XML/parser PASS не называется BAZIS PASS.

## 15–19. Calculate, final, approval, produce, reconciliation

По SPEC G.5 calculate допускается из валидированной immutable submitted/review revision по разрешению менеджера/admin. Это отдельное разрешение на расчёт, не преждевременный workflow approved. Unknown price не подменяется нулём и может блокировать final, не обязательно geometric calculation.

Нормализованный native adapter result требует отдельного calibration record, exact local mappings, BAZIS version, attestor signature, двух expected output files, совпадения geometry/qty/grain/edges/material identity и отсутствия fatal errors. Это адаптерный контракт; реальный proprietary BAZIS parser/runner не объявляется реализованным или проверенным. Live staging не получает calibration/attestor records. Fake result остаётся unverified; final gate `BAZIS_RUN_REQUIRED` закрыт.

Verified calculate result может создать отдельный immutable final candidate: revision + preliminary + job/run/result + input/output hashes + financial snapshot. Preliminary остаётся неизменным. Проверенные факты sheet/cut применяются к pinned tariff/price/discount basis; ambiguous/incomplete basis блокируется. Candidate не становится approved автоматически.

Manager/admin с permission выбирает exact candidate → awaiting_approval. Owner либо уполномоченный менеджер с основанием подтверждает exact candidate/revision → approved. Текущая выбранная пара хранится явно: историческое одобрение другого candidate той же revision не разрешает produce. Новая revision очищает review/approval pointers. Produce требует approved exact revision/candidate, verified original package и production.release. Calculate не может отметить physical_started.

Operator reconciliation требует permission, exact run, reason и job-bound private evidence. Uncertain job не возвращается в active queue. Подтверждённая остановка/неисполнение завершает старый job; новый запуск требует отдельной авторизации. Доказательство физического исхода не выводится из наличия CUT/PDF/exit=0.

## 20. Backup/restore

Pre-backup на исходном Stage 5 runtime: deployment `7276f26b-7ee9-4407-979c-856650433c99`; `/mf-private/backups/pre-stage06`; dump SHA `f7e012377daedd0fd43b2de2378e41d8313920933096447dc98228db25779c94`. Проверены 8 PDF/document bindings, 22 private files и client own-OBLX deny. До migration: orders=8, revisions=7, calculations=4, documents=8, files=22, jobs=1 (legacy blocked), job_events=1. Полное before-state: pre-stage06.json.

В CI реально выполнен pg_dump → pg_restore в отдельную БД `mf_staging_restore_stage06_a1dc160c05`, отдельный storage; 31 private file и 4 synthetic final candidates. Все mf_* row hashes, jobs/runs/lease/fencing, packages/OBLX/results/candidates/audit совпали. Это реальный restore тестовых данных, а не реальный BAZIS run. Live staging restore реально выполнен deployment `572bafdb-6eb0-43b8-83d9-348a2e30b190` (SUCCESS): новая БД `mf_staging_restore_stage06_c19d2e105e83`, новый private root `/mf-private/restore-stage06-c19d2e105e83/storage`. Backup `/mf-private/backups/stage06-c19d2e105e83`, dump SHA `2037a14d379c196f0b38b9814db14607d6d435312a40b599bee391f364e7da95`. Все таблицы и 26 private files совпали; restore-evidence.json содержит полные counts/hashes.

После acceptance: orders=9, revisions=8, calculations=5, documents=8, files=26, production_jobs=2 (старый blocked + новый fake calculate), packages=1, runs=1, results=1, audit=150, outbox=150, staging_agents=1 (revoked). Native calibrations/mappings/final candidates=0. Рабочая staging-БД осталась `railway`; восстановление выполнялось только в отдельную copy. Post-restore redeploy `44e813bf-6f25-429a-a6df-3fdfdb7b3dc2` (SUCCESS) выполнил verify_persistence перед HTTP startup: полный state совпал, 26 private files проверены. Доказательство: persistence-evidence.json. После него выполнен normal deployment `2769bd61-0279-4f83-a152-c3aff6036e1d` (SUCCESS) с обычной командой `python -m backend.v2.serve`. Runtime source pin — `7ca146dbb5f2522604f8a7761e5763ec91f659a5`; saved config и фактический startup не содержат maintenance acceptance/restore/persistence command. См. deployment-evidence.json.

### Live staging round-trip

Deployment `a824a004-84c8-4dc0-aeaf-64611e24bf33` (SUCCESS), runtime `7ca146dbb5f2522604f8a7761e5763ec91f659a5`. До миграции startup повторно проверил pre-backup SHA/22 files/Stage 5 snapshot. Синтетический новый order `52de2c57-4607-4f29-9e75-5da3b5784017`; revision `373d2e0a-4e43-4120-bce4-9bb10ebe3832`; preliminary `23c54974-86f5-481c-809b-2ce75fd58bfc`; calculate job `d68af5ae-7fed-4e00-a712-b82b754fa382`.

Одноразовый fake consumer работал в staging Linux-контейнере; отдельный Windows/Agent service не создавался. Отдельный Agent package выполнил настоящий HTTPS transport round-trip на staging URL: run `de7d4fe4-bbf6-4d6f-93ae-a7966bf95d60`, result `51466353-fc33-40a6-8070-faa14b2fd218`, accepted=true, verified=false. XML parser/fake executor, без запуска БАЗИС. Проверены повтор result_id и конфликт изменённого payload. Final gate остался BAZIS_RUN_REQUIRED; produce jobs создано 0.

Agent `99a0bfbe-bc17-432e-a286-0199e6e2282d` получил отдельный одноразовый staging credential, затем credential отозван и plaintext файл удалён. Временные operator/client accounts disabled, sessions/grants revoked, temporary admin role снята. Live native calibrations — 0. Полное доказательство: live-evidence.json.

Все 8 Stage 5 PDF SHA сохранены. Активный владелец тестового заказа получил 403 на 20 GET/HEAD запросов с Range к OBLX/manifest через new/legacy/document aliases. Client order/documents/timeline/history не раскрыли job/artifact IDs. Внешние HTTP проверки health, robots, noindex, public/static и legacy /api/orders: http-evidence.json.

## 21–23. Tests и native evidence

CI run `35865206433`, commit `7ca146dbb5f2522604f8a7761e5763ec91f659a5`: **195 PASS, 0 FAIL, 0 SKIP**. Stage 1:28, Stage 2:20, Stage 3:46, Stage 4:27, Stage 5:30, Stage 6:44. Все прежние 151 тест сохранены. Полные данные: ci-evidence.json.

Ранние диагностические CI были отменены после выявления 4-МБ pytest parameter ID; тестовые данные сохранены, имена параметров ограничены. Это не скрытый пропуск тестов. Локальный прогон без Postgres имел skips и не использовался как доказательство DB PASS.

Native BAZIS runner отсутствует; BAZIS-01/02/03/04 **NOT VERIFIED**. Windows/BAZIS физические fixtures не запускались. Signed synthetic fixtures проверяют только software boundary.

## Acceptance

| Criteria | Result | Evidence / limit |
|---|---|---|
| OBLX-EXP-01…06 | PASS (software) | Deterministic XML, four sides, exact identity, manual/customer input, sealed 18+18 recipe |
| OBLX-EXP-07 | PASS (CI + staging) | Active client owner GET/HEAD/Range/list/history/alternate routes |
| JOB-01…08 | PASS (CI) | Lease/fencing/release, event dedupe, result idempotency/conflict |
| JOB-09…13 | PASS (CI) | Separate purposes, new calculate run, physical uncertain, no blind retry |
| FINAL-01…02 | PASS (CI) | No verified run/fake cannot finalize |
| FINAL-03…06 | PASS (synthetic signed contract) | Candidate, explicit exact approvals, new revision reset; no native execution claim |
| BAZIS-01…04 | NOT VERIFIED | No isolated Windows/BAZIS access |
| Stage 5 regressions | PASS | 151/151 prior tests |
| Live HTTPS round-trip | PASS | live-evidence.json; fake/unverified result, credential revoked |
| Live backup → restore | PASS | restore-evidence.json, отдельные staging DB/storage |
| Live redeploy persistence | PASS | persistence-evidence.json: exact tables/state + 26 private files |
| Original reference byte comparison | NOT VERIFIED | Original OBLX bytes unavailable; audit provenance only |

## 24–26. Diff, rollback, production evidence

Actual Git diff: ACTUAL_GIT_DIFF.patch, от принятого Stage 5 HEAD к итоговому staged tree; исключён только сам patch-файл во избежание рекурсии. История implementation commits: implementation-commits.txt. Итоговый report commit не меняет проверенный runtime/backend/Agent/tests; удаляет временный CI cleanup и добавляет доказательства. Rollback procedure: OPERATIONS.md; восстановление pre-stage06 только в новую staging copy, проверка hashes, возврат только staging service на Stage 5 runtime. In-place downgrade и restore поверх рабочей БД не предлагаются.

Production Bridge deployment `dc09ba1c-7182-481d-8c62-4a9e721461c2` и Postgres deployment `168b0c29-6693-433f-9a85-552f9de65b37` не изменены. Staging namespace/database/volume/credentials отдельные; production keys не читались и не использовались. Нет отправки jobs в production endpoints/queue. Прямой аудит журналов Windows Agent не выполнялся: доказательство изоляции — раздельные storage/DB/identity/transport и неизменённый production service, не выдуманная Agent telemetry.

Сознательно не делались: production cutover, изменения main/baseline/preview/legacy Bridge DB/contract; запуск БАЗИС; D:\pgm/Resilio; реальные production orders; новая главная/3D/photos/scraps; Stage 7. Stage 4 бизнес-рецепт, цены и скидки не переопределялись.

## Точка остановки

Stage 7 не начат. Production cutover не выполнен. Production Bridge/DB/Agent, baseline, preview, main, D:\pgm и Resilio не изменялись. Native calibration и оригинальный OBLX byte comparison остаются NOT VERIFIED. Final/produce в live staging закрыты до реального доказанного native run и явных согласований.
