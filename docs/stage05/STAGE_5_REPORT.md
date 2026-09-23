# Martin Forest — Stage 5

Дата: 23.09.2026. Только client documents / preliminary PDF / cabinet / order history. Источники: SPEC v2 (G/H/J/K/L/N/P/Q), audit evidence 22.09.2026, принятое состояние Stage 0–4 и отдельное задание Stage 5. Stage 6 не начинался.

## 1. Commits и границы

Ветка `martin-forest-v2-staging`; база `9b48bfbc5637251eaf43c88e643b115a3736ded1`, прежний runtime `af6e58466a880eff17ccb1feb7f02e7f8db548f9`.

| Commit | Содержание |
|---|---|
| `8c080933c893edb932aa560013604b190fbb9844` | Documents, private PDF, cabinet; 147 tests PASS |
| `4b09fb058390399b63a92dae29f45b9422f28e20` | Конкурентная генерация, visibility policy, live runner; 149 PASS |
| `9e258d0d8bbb2dc2e6a207759c6b813fc271bfda` | Закрыт обход document binding через прежние file aliases; 150 PASS |
| `1d7b3f5e96809644655a31a9501092137294ef2c` | Template v2: читаемая неизвестная скидка, сохранение v1 artifacts |

Финальный deployment `39019cb5-69ea-429a-a4ce-48ef966f2874` — SUCCESS; обычный запуск, pending changes отсутствуют.

Финальный runtime и persisted source pin: `1d7b3f5e96809644655a31a9501092137294ef2c`. Commit отчёта содержит evidence/docs, без изменения runtime-кода; его SHA указан в итоговом сообщении.

Только staging API `9aacf7bf-edd5-4f08-9423-3fbabea59268`, проект Martin Forest Site Preview `6d754ad4-ba7b-45f8-8c5e-356387e7de06`, environment `ee625678-c15e-452d-9761-cda99274839f`. Его название `production` в Railway не делает этот preview-проект производственным. Postgres `e773c03c-1f76-4f78-adb7-2132528c3a19`; private volume `29b79637-3f45-4ddd-ad2c-028d6b96af8e`, root `/mf-private/storage`.

Production Bridge deployment `dc09ba1c-7182-481d-8c62-4a9e721461c2`, production Postgres deployment `168b0c29-6693-433f-9a85-552f9de65b37` не изменены. Production Agent, baseline, main, Bridge branch, visual preview и Windows не менялись; refs/deployments сохранены в `environment-evidence.json`. Engine Stage 4, каталог, tariff/default profiles не переделывались. Agent transport/outbox dispatch disabled.

## 2. Migration

Добавлена `0005_client_documents.sql` (SHA-256 `755e4edca0fa3dfdc9a6d05ddddee135d0ed23b5ba43f0e5d668828c89fd6819`); 0001–0004 неизменны. Применена после свежего native backup и проверки SHA всех 9 исходных private files. Pre-backup SHA: `3688abc937dce0cc65e1665ddb21f7dafadce892ecf6d5cb7c0ff3f5776e53e6`. Deployment первого применения: `70f39b8b-5241-4762-a9d9-78af4c35d103`; лог `MF_STAGE05_PRE_MIGRATION` подтверждает проверку.

Добавлены клиентские display_name/company_name, читаемый последовательный номер заказа и nullable legacy completed_at. Stage 5 не устанавливает бизнес-завершение заказа. Новые granular own grants клиентам: `documents.generate`; сотрудникам grants автоматически не выдавались.

## 3. Document model

Три новые таблицы, всего 61:

- `mf_document_templates`: immutable template/renderer version и asset SHA.
- `mf_documents`: immutable file/calculation/order/revision binding, document version, безопасный presentation snapshot и его SHA, автор/дата.
- `mf_history_policy`: configurable visibility без удаления истории.

Байты и SHA/size/MIME остаются в каноническом `mf_files`. DB trigger требует sealed calculation, совпадение order/revision, private preliminary PDF без job и статус ready. Unique calculation/template обеспечивает идемпотентность, advisory lock сериализует одновременные запросы. Документ, audit и paused outbox создаются одной транзакцией.

После прерывания между записью файла и binding может остаться зарегистрированный unbound PDF; все download aliases и listings его закрывают. Автоматической очистки нет.

## 4. Renderer

Server-side ReportLab 4.4.9, embedded DejaVu Sans regular/bold из репозитория, лицензия и SHA проверяются. A4 portrait, поля 16–17 мм, основной текст 10 pt, подписи 9 pt, итог 24 pt. Настоящий searchable/selectable текст, кириллица и литовские символы.

Нет URL fetch, клиентского HTML/CSS, внешних шрифтов или raster whole-page. Текст экранируется; неподдерживаемые glyphs не заменяются незаметно. Лимиты: 500 строк / 500 KB presentation / 2 000 символов поля / 100 страниц / subprocess 512 MiB, 20 s CPU, 30 s wall / PDF 10 MB.

## 5. Template versions

`mf-preliminary-a4-v1` сохранён. Финальный `mf-preliminary-a4-v2` исправляет перенос «Уточняется» в колонке неизвестной скидки шрифтом 9 pt. Финансовые значения не изменялись. Asset SHA включает source renderer/projection и font checksums. Реальная проверка v1 → v2 создаёт новый file_id/document_version, сохраняет прежние SHA и сравнивает финансовые проекции.

## 6. Секции PDF и источник чисел

Общая безопасная `document_projection` используется кабинетом и PDF. Единственный финансовый источник — immutable calculation snapshot. Renderer не считает тарифы, листы, метры, скидки или суммы.

Документ включает бренд/заголовок, читаемый заказ/редакцию/клиента/дату; полные material identity/размеры/расчётные листы/клиентскую цену; отдельную кромку с net и только утверждёнными procurement/billable; применимые услуги; три категории скидок; complete preliminary либо рассчитанную часть; точный обязательный disclaimer. Повторяются заголовки таблиц, номер заказа и страницы. Internal UUID/paths/Agent/OBLX/debug/purchase price не выводятся.

## 7. Complete example

Actual staging calculation `537e764a-03eb-4b7d-9ea9-305d249bff27`: synthetic approved prices, **111.02 BYN**. Материал 100.00 gross → 90.00 после 10%; услуги 22.13 gross → 21.02 после 5%; пустая категория кромки отдельно хранит 20%, но пустого блока кромки нет.

Реальный PDF скачан через HTTPS с проверкой manifest SHA, отрисован и визуально проверен. Старый v1 — `cloud-pdf/complete.pdf`, финальный v2 — `cloud-pdf-v2/complete.pdf`.

## 8. Incomplete example

Actual master calculation `75d1597e-4cae-411d-8d7c-a817ada20af8`: цена материала и часть commercial policies не утверждены. Нет ложного полного total; заголовок «РАССЧИТАННАЯ ЧАСТЬ», значение «Уточняется» при неизвестном net после скидок, известная услуга упаковки 0.36 BYN сохранена. Причины переведены на клиентский язык, machine codes отсутствуют. `cloud-pdf-v2/incomplete.pdf`.

Отдельный fixture с известной скидкой и неизвестной ценой материала показывает рассчитанную часть **1.89 BYN**, `pdf/incomplete.pdf`.

## 9. Customer material example

`pdf/customer-material.pdf`: explicit customer material = 0.00, точный обязательный текст. Company edge 2.40 gross, услуги 3.25 gross остаются платными; после независимых скидок 1.92 + 3.09 = 5.01 BYN. Все числа скопированы из engine result. Synthetic fixture, не реальный прайс.

## 10. Multi-page examples и visual evidence

`pdf/one-material.pdf` — 1 страница; `five-materials.pdf` — 2; `twenty-materials.pdf` — 6. `glued-36mm.pdf` — 1; customer — 2; incomplete — 1. Все 13 страниц синтетических PDF отрисованы и просмотрены, включая повторные headers/footers и длинные русские/литовские названия. Glyphs и word bounds проверены дополнительно.

`pdf-renders/` содержит страницы и contact sheets; `pdf-visual-evidence.json` — SHA/число страниц/проверки. `cloud-pdf/` сохраняет v1, `cloud-pdf-v2/` — финальные фактические PDF и renders. Text assertions не заменяли визуальный просмотр.

## 11. Cabinet API

| Маршрут | Назначение |
|---|---|
| POST `/api/v2/calculations/{id}/documents/preliminary` | Immutable, idempotent private PDF текущей server template version |
| GET `/api/v2/calculations/{id}/documents` | Доступные версии |
| GET/HEAD `/api/v2/documents/{file_id}` | Fresh authorization + SHA verified download |
| GET `/api/v2/account/orders` | Только собственные разрешённые заказы, pagination |
| GET `/api/v2/account/orders/{id}` | Безопасная detail/calculation/revision projection |
| GET `.../{id}/timeline`, `.../{id}/documents` | Клиентская история и разрешённые source/PDF |
| GET/PATCH `/api/v2/account/profile` | Имя/компания клиента; старые PDF не меняются |

Новой бизнес-модели заказа не создавалось. Stage 4 submit/revision/calculation APIs остаются каноническими.

## 12. Frontend

[Staging cabinet](https://martin-forest-v2-staging-production.up.railway.app/account): login/register, данные клиента, свои заказы, создание черновика, detail, расчёт, версии и документы. Только `/api/v2`, secure same-origin cookie; нет browser DB/localStorage financial model/v9 SQLite/frontend recalculation.

Две CTA: «Скачать предварительный расчёт» генерирует/скачивает конкретный snapshot; «Отправить заказ на обработку» использует существующий submit с If-Match и Idempotency-Key. Incomplete можно передать с явным подтверждением проблемных строк, если позволяет Stage 4 gate. Manager-assisted без calculation показывает «Расчёт после обработки менеджером», без 0 BYN.

CSP, noindex/no-store/nosniff; DOM строится через textContent, без innerHTML. В браузере проверена опубликованная страница входа; screenshot `cabinet-login-live.jpg`. Приватные сценарии проверены API/ASGI и wiring tests; authenticated browser click-through отдельно не заявляется.

## 13. Timeline и история

Allow-list коммерческих событий: draft, submitted, review, редакция менеджера, calculation created, document generated. Нет технических job events или произвольных audit reasons/PII. Прежние calculations/PDF сохраняются и доступны по разрешённой visibility policy.

NC-08 остаётся открытым: default visibility без временного ограничения, direct history enabled. Тест 60-дневного legacy completed_at + configurable 30-day filter проверяет скрытие без удаления и отдельный direct-access switch. Production completion logic не вводилась.

## 14. Document permissions

Client — только own + explicit grants. Manager — current assigned order + permission. Accounting — order/file + financial permission. Viewer/admin — explicit scope/grants. Production/service_agent — denied. Каждый запрос проверяет актуальные roles/grants/account state; отзыв действует немедленно. Staff download создаёт refs-only audit/outbox. Предыдущие `/files`, `/download`, `/preview` направлены в тот же PDF gateway; unbound PDF недоступен.

## 15. OBLX regression

Все Stage 2 tests сохранены. Дополнительно client own internal artifact с ложным именем `.pdf`/MIME PDF проверен через document/file/order route, GET/HEAD/Range, alternate download/preview, history/listings. В живом staging — 10 HTTP denials; разрешённые source/PDF присутствуют, internal file ID отсутствует в проекции. Использован synthetic non-XML fixture, exporter не создавался.

## 16. Backup / real restore

Pre-Stage-5 checkpoint — 6 orders, 5 revisions, 2 calculations, 9 files. Первый Stage 5 restore реально выполнен в `mf_staging_restore_stage05_bb038f33aaac` с отдельным root; 17 files / 4 PDF восстановлены, dump SHA `42462ae0cd54d88b8998ea916c7da683fd32c514addeac3ea58513691037b257`.

После template v2 выполнен новый backup/restore: DB `mf_staging_restore_stage05_template_v2_6c48dbbd2ff2`, root `/mf-private/restore-stage05-template-v2-6c48dbbd2ff2/storage`; dump SHA `3f8dc32762e4f466c818b214c75362c8cfb6ba8faa36c56cbbec46ab1c55dd9a`. Восстановлены 22 files, 8 documents, 4 calculations, 7 revisions. Backup `/mf-private/backups/stage05-template-v2-6c48dbbd2ff2`. Полное evidence — `cloud-restore-v2-evidence.json`. Сравнивались полные PostgreSQL table snapshots, revision/input/result hashes, PDF presentation/bindings/SHA/bytes, users/sessions/roles/grants/assignments. Рабочая staging DB не перезаписывалась. Production restore не выполнялся.

## 17. Redeploy persistence

Финальный `persistence-evidence.json` фиксирует отдельный redeploy `63068068-133f-4d68-876e-2788922303fd` и совпадение состояния с реальной restore-копией. Данные, PDFs и authorization metadata проверяются вместе. После проверки возвращён обычный `python -m backend.v2.serve`, probe/bootstrap off, временные accounts disabled, sessions/grants revoked, временные credential variables очищены.

## 18. Regression tests

Предыдущие 121 tests остаются PASS. Native GitHub Actions с отдельным Postgres выполняет Stage 0–1/2/3/4/5 без SQLite и без production credentials. Local запуск без Postgres не выдаётся за полный результат: PG tests там skipped.

## 19. Stage 5 tests

30 новых tests: PDF 1/5/20, Cyrillic/Lithuanian, customer/edge/glue/incomplete, deterministic bytes, searchable text, no internal data/HTML execution, resource limits; idempotency/concurrency; versioning; catalogue/tariff/discount immutability; SHA corruption/HEAD/Range/aliases/public URL; role matrix/revocation; own cabinet, timeline, canonical submit, source/OBLX listing; profile immutability/CSP/Origin; real native restore; NC-08 no-deletion/direct visibility; unknown discount typography. Финальный native CI [run 35854770240](https://github.com/artempilipeika-create/artempilipieka-create.github.io/actions/runs/35854770240): **151 PASS, 0 FAIL, 0 SKIP**; job `107160543624`. Run/commit/job и restore evidence — `ci-template-v2-evidence.json`.

## 20. Acceptance matrix

| Criteria | Result | Доказательство |
|---|---|---|
| PDF-01 | PASS | 1/5/20 materials, 1/2/6 pages; actual renders |
| PDF-02 | PASS | Длинные русские/Lithuanian names, embedded fonts, visual/word bounds |
| PDF-03 | PASS | Customer material 0 + обязательный текст + платные услуги/company edge |
| PDF-04 | PASS | Три процента и category amounts скопированы из calculation |
| PDF-05 | PASS | No-edge fixture без пустого блока/нулевых service fillers |
| PDF-06 | PASS | 18+18, glue/finish36, actual 111.02; без recipe IDs |
| PDF-07 | PASS | Incomplete/null net, calculated part, human reasons |
| PDF-08 | PASS | Repeat table headers/order/page numbers, целые строки |
| PDF-09 | PASS | Searchable text, embedded fonts, нет page raster |
| PDF-10 | PASS | Allow-list, no internal fields, links, metadata leakage |
| DOC-01 | PASS | Same template/calculation + concurrent generation |
| DOC-02 | PASS | Реальные v1 → v2 artifacts, старые SHA/финансы сохранены |
| DOC-03 | PASS | CI меняет catalogue/tariff/discount; старый PDF неизменен |
| DOC-04 | PASS | Download SHA, corruption deny, live HTTPS comparison |
| CAB-01 | PASS | Own-only list/detail, foreign deny |
| CAB-02 | PASS | Staff не получает client account projection |
| CAB-03 | PASS | Complete amount = immutable API/PDF projection |
| CAB-04 | PASS | Incomplete label, нет ложного 0/полного total |
| CAB-05 | PASS | Manager-assisted no-calculation label, amount=null |
| CAB-06 | PASS | Safe timeline, no Agent/debug/job events |
| CAB-07 | PASS | Source + preliminary only, internal/OBLX исключены |
| CAB-08 | PASS | Canonical generation/submit wiring + actual API submit |
| OBLX regression | PASS | Stage 2 suite + новые routes/HEAD/Range/history/listing |
| Backup/restore | PASS | Native CI + две реальные отдельные Railway restore-копии |
| Redeploy persistence | PASS | Финальное сравнение таблиц/байтов/authorization metadata |
| Production isolation | PASS | Protected refs/deployments; transport/dispatch disabled, jobs +0 |

PASS CAB-08 подтверждает canonical API и frontend wiring. Полный browser click-through после аутентификации отдельно указан ниже как NOT VERIFIED.

## 21. Фактический Git diff

`implementation.diff` — реальный `git diff` от принятого Stage 4 до runtime Stage 5 для backend/tests/workflow; `implementation-stat.txt` — сводка. Font binary assets находятся в том же commit, в стандартном diff отмечены как binary. Все evidence/PDF/renders добавлены отдельным documentation commit. Main/protected branches не изменялись.

## 22. Rollback

Подробная процедура — `RUNBOOK.md`. Для возврата Stage 4 восстановить **pre-stage05** в новый isolated DB/private root, сверить исходные хэши, переключить только staging API и pinned runtime на `af6e584`. Stage 5 DB/root сохранить. Не выполнять in-place SQL downgrade; Stage 4 readiness намеренно отклоняет схему 0005. Для application-only rollback использовать совместимый Stage 5 commit/template. Production не участвует.

## 23. NOT VERIFIED / сознательно вне этапа

- Authenticated browser click-through и отдельная мобильная визуальная сессия не выполнялись; есть browser screenshot входа и native/live API проверки приватных сценариев.
- Production restore, off-site retention, RPO/RTO и автоматический backup schedule не проверялись.
- NC-01/02/03/05/08/09 не превращены в новые бизнес-правила. Synthetic price/profile остаются изолированными; real master incomplete остаётся incomplete.
- Не делались OBLX exporter/generation, Bridge jobs v2, Agent v2, БАЗИС/native calibration, production calculation/final price/release/cutover, homepage/photos/scraps/3D redesign. `BAZIS_RUN_REQUIRED` сохранён.
- Внешняя email-отправка остаётся fake collector Stage 2; пользовательский production onboarding этим этапом не объявляется завершённым.

**STOP: Stage 6 не начинать без отдельного разрешения.**
