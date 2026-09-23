# STAGE 8.2 — NATIVE BAZIS CALIBRATION / P0 CLOSURE

2026-09-23. Результат: **native execution не начато; все семь целевых пунктов NOT VERIFIED**. Доступность разрешённого изолированного Windows/БАЗИС runner не подтверждена. В соответствии с разделом 3 задания выполнение остановлено до первого native job. Synthetic/fake/parser-only evidence не повышалось до BAZIS PASS.

## Контрольная точка

- Ветка: `martin-forest-v2-staging`.
- Входной HEAD: `49b3ca56c6d6958e1b322a2b95ab40f3e6369ffa`; локальный и GitHub HEAD совпали, исходное рабочее дерево clean. Итоговый HEAD — commit этого отчёта, указан в финальном ответе.
- Tested runtime: `bc6b96101a9eaf88732e1342eaf18c2579e6a385`.
- Railway deployment: `af8ba2e0-dc20-4239-afaa-d6b90c015364`, повторно подтверждён SUCCESS, normal command `python -m backend.v2.serve`, healthcheck `/health`, нет pending staging work. Новый HTTP health probe не выполнялся.
- CI baseline: **248 PASS / 0 FAIL / 0 SKIP**. GitHub run `35896674899` повторно прочитан, completed/success на tested runtime. Это выполненный Stage 8 CI, не новый Stage 8.2 run. Код и все assertions сохранены; documentation-only изменение не требует повторения CI.
- Источники: SPEC G/L/O/P/Q, audit 2026-09-22, принятые Stage 6/8/8.1; `../stage06/NATIVE_CALIBRATION.md`, `../stage08_1/STAGE_8_1_REPORT.md`. Свежая metadata — `read-only-evidence.json`.

## Runner availability — prerequisite не пройден

| Проверка | Фактический результат |
|---|---|
| Windows runner identity / разрешённый канал доступа | NOT VERIFIED. В текущей сессии доступен Linux shell; среди подключённых callable capabilities нет Windows/БАЗИС remote execution. Endpoint/identity изолированного runner не предоставлен. |
| БАЗИС установлен / версия | NOT VERIFIED. Версия из исторического №69 не является версией доступного runner. |
| Запуск исключительно synthetic fixtures | NOT VERIFIED: отсутствует проверяемый runner. |
| Отдельные inbox/work/outbox/failed/archive | NOT VERIFIED: пути на Windows не осматривались и не создавались. |
| Production watcher / Agent исключён | NOT VERIFIED на Windows. Railway metadata isolation не доказывает отсутствие локальных watchers. |
| Local BAZIS material/edge mapping set | NOT VERIFIED: локальная БД материалов недоступна. |
| Calibration profile/version/attestor | Не создан и не активирован. Существующий `mf-oblx-preview-v1` — software preview, не утверждённая native calibration. |

Это ограничение доступа этой сессии, а не утверждение, что на компьютере пользователя нет БАЗИС. Исторические сведения о локальном Hermes/БАЗИС не доказывают текущий безопасный канал или изоляцию; попыток подключиться к прежним адресам/production PC не предпринималось.

## Delta целевых критериев

| ID | Stage 8.2 | Недостающее фактическое evidence |
|---|---|---|
| JOB-08 | NOT VERIFIED | Оригинальные bytes `04-22.09.26№69 ИП.Козинцев(1).oblx` в текущем checkout/каталоге uploads не найдены; внешние архивы заново не обследовались. Нет SHA оригинала и isolated native import. Файл не реконструировался по метаданным. |
| JOB-09 | NOT VERIFIED | Native import asymmetric four-edge и grain/rotation fixtures; exact стороны/оси/material/qty не наблюдались в БАЗИС. |
| JOB-10 | NOT VERIFIED | Нет native доказательства двух 18-mm child blanks на finished part, стадий и сохранения finished qty. |
| JOB-06 | NOT VERIFIED | Не было native старта/прерывания, uncertain/reconciliation, stale lease/fencing сценария на native runner. Software tests предыдущих стадий не закрывают это. |
| NC-03 | NOT VERIFIED | Software recipe 600×400 q3 → 620×420 q6 сохранён. Native child→finished связь, grain, отсутствие двойного расхода/finished qty и L+W стадия не подтверждены. Тарифная база склейки требует отдельного решения производства независимо от geometry proof. |
| NC-04 | NOT VERIFIED | Orient, Rotation, X/Y/L/W, grain allowed/forbidden, WithoutBut, Allowance, Overhung, edge positions, exact material/local mapping, qty, finished/blank dimensions не калиброваны. |
| E2E-01, native часть | NOT VERIFIED | Нет verified native calculate; цепочка final candidate→exact approval→produce authorization не запускалась заново. Физическое производство запрещено. |

Закрытых native P0: **0**. Q matrix остаётся прежней: 78 PASS / 1 FAIL / 12 NOT VERIFIED. Stage 8.1 business/MIG/DR blockers не пересматривались.

## Inputs, hashes, outputs и result contract

Существующие Stage 6 `.oblx` только прочитаны и SHA-256 пересчитаны; все шесть совпали с `tests/stage06/fixtures/index.json`. Это integrity check входов, **не native acceptance и не новый software CI**. Полный список — `input-inventory.json`.

| Существующий synthetic input | SHA-256 |
|---|---|
| four-edges.oblx | `a9bb792d6fd5a24255d38e350a76fd6289e3eca5ea04f750b4f06719fb603d43` |
| glued-18-plus-18.oblx | `7442a4c922bbad12c8f3a224e6efb5e52b6e8d093516657a229fc05bb6c6dee4` |
| texture-on-rotation-forbidden.oblx | `9cfa57b9d9af0e82dcdbd0c1d8812ce99099b16f3c27227947424bfcf1cea4b0` |
| texture-on-rotation-allowed.oblx | `07ab2ea3c2ab6046dd917ec580601f01fc290ac860e8124d31118a79acb9fc00` |
| texture-off-rotation-allowed.oblx | `b156367e3cbed97dbc6a3fdcb01d23d39495a57f78f7f87af7b92d0221bff43e` |
| width-grain-asymmetric.oblx | `9cfa57b9d9af0e82dcdbd0c1d8812ce99099b16f3c27227947424bfcf1cea4b0` |

Совпадение bytes двух grain fixtures не доказывает native correspondence: их различия в sidecar inputs должны проверяться будущим реальным profile, не выводиться из XML автоматически. Fixtures не изменялись.

Новых job_id/revision_id/run_id/manifest SHA: **нет**, задания не создавались. Output hashes, BAZIS-visible results, screenshots/native exports, parsed native results, local mapping evidence и signatures/attestations: **отсутствуют**. Нулевой exit code не наблюдался и не использовался как proof. Список реально выполненных native операций: **пустой (0)**. Fake Agent, parser, signed synthetic result не запускались.

Для будущего native evidence обязательны exact order/job/revision/run IDs, input manifest/OBLX hashes, output inventory с SHA/size, BAZIS version, exporter/calibration/mapping versions, attestor/signature, expected-file checks, fatal/native warnings и независимая проверка geometry/qty/grain/edges/material. Без этого нельзя активировать staging calibration. Production calibration запрещена.

## Gate и ограничения

Native gate **оставлен CLOSED**: никаких записей calibration, attestor, mapping, final или produce в БД не создавалось. Последние фактически проверенные live нулевые counts — Stage 8; в Stage 8.2 свежий SQL gate query не выполнялся. Код `BAZIS_RUN_REQUIRED`, calculate/final/approval/produce boundary и runtime не менялись. Нет заявления о новом native PASS либо свежем SQL доказательстве.

Продолжение native проверки требует доступного изолированного Windows runner с identity/version/path/process isolation evidence и local mappings; для JOB-08 также оригинала №69. Установка/подключение к production Agent или обход через D:\pgm не допускаются. Не требуется физическое производство: crash test и authorization проверяются только в разрешённом изолированном контуре без станка/производственных outputs. До доказанной изоляции никаких запусков.

## Production unchanged и diff

Свежие Railway metadata полностью совпали с `../stage08_1/read-only-evidence.json` для staging status/config и production status/config. Bridge deployment `dc09ba1c-7182-481d-8c62-4a9e721461c2`, Postgres `168b0c29-6693-433f-9a85-552f9de65b37`; routing, source/build/deploy config и variable names прежние. Старый zero-change staged patch оставлен нетронутым. GitHub protected refs main/baseline/preview/Bridge прежние.

Production DB, raw secrets, Agent configuration/telemetry, реальные orders, D:\pgm и Resilio не читались и не изменялись. Не было deploy/restart/migration/restore/job/create-order/domain/routing действий. Metadata equality подтверждает доступную конфигурацию и отсутствие наших изменений, не является аудитом всех Windows процессов или внешних изменений DB/secret values.

Diff Stage 8.2: только три файла `docs/stage08_2/`: этот отчёт, `read-only-evidence.json`, `input-inventory.json`. Backend/UI/Agent/migrations/tests/CI без изменений. Итоговый Git status проверяется после commit. Runtime/redeploy не нужны. Rollback — revert только документационного commit, без восстановления DB.

**Stage 8.2 native P0 closure: NOT VERIFIED. STAGE 9 BLOCKED.** Stage 9/cutover не выполнялись. Работа остановлена для приёмки.
