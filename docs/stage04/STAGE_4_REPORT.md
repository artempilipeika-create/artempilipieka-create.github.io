# Martin Forest — Stage 4, фактический отчёт

Дата: 23.09.2026. Выполнен только **Stage 4 — Order revisions / Server calculation / Tariffs / Discounts**. Stage 5 не начинался.

Источники: `MARTIN_FOREST_SPEC_v2_FINAL.md` (G/J/O/P/Q), `MARTIN_FOREST_AUDIT_EVIDENCE_2026-09-22.md`, принятое состояние Stage 0–3 и отдельное задание Stage 4. Каталог, Excel importer, strict identity и AUTO Stage 3 не переделывались.

## 1. Ветка, commits и runtime

Ветка: `martin-forest-v2-staging`.

| Commit | Назначение |
|---|---|
| `96f320cef3ef5823c9ac35955fd5905ca500958a` | принятый HEAD Stage 3, база diff |
| `267ed0cf8ac4439f82543dec1a79bad67fd4de63` | runtime до изменений |
| `35c9048f822641f46b352e71602bbf19a403eeff` | миграция, immutable revisions, Decimal engine, API и основные tests |
| `01022dee7fffb1e9d98e285c787339b4a712e9f7` | точное сравнение restore, maintenance-функции и runbook; 119 PASS |
| `af6e58466a880eff17ccb1feb7f02e7f8db548f9` | live runner, проверки округления/stale revision; 121 PASS; финальный runtime и persisted source pin |

Последний commit отчёта содержит только документацию/evidence/diff. Его SHA указан в итоговом сообщении. Backend между `01022de` и `af6e584` байт-в-байт одинаков.

Runtime: `python -m backend.v2.serve`, обычный запуск без maintenance/bootstrap. Deployment `f9bf9f6a-6637-400c-b0bd-0efe47a4cc18`; фактические metadata и config сохранены в `environment-evidence.json`.

## 2. Миграции

Добавлена только `backend/v2/migrations/0004_order_calculation.sql`.
SHA-256: `5fc7017516f9342928aa656839efb6d9c0d358ae452899a1428c99fc6d526436`.
0001–0003 не изменены. Миграция применена после проверки реального pre-Stage-4 dump и private bytes; лог `MF_STAGE04_PRE_MIGRATION` в deployment `d1952029-4ee9-49ec-9af0-916c526a8b21`.

## 3. Таблицы и инфраструктурная изоляция

19 новых таблиц, всего в staging **58**:

| Область | Новые таблицы |
|---|---|
| Production profile | `mf_production_profiles` |
| Тарифы | `mf_tariff_books`, `mf_tariff_entries` |
| Утверждённые цены | `mf_price_books`, `mf_sale_price_entries`, `mf_financial_book_seals` |
| Скидки | `mf_discount_profiles`, `mf_customer_discount_assignments`, `mf_order_discount_overrides` |
| Выбор версий | `mf_calculation_defaults`, `mf_order_financial_contexts` |
| Расчёт | `mf_calculations`, `mf_calculation_lines`, `mf_calculation_seals` |
| Snapshots | `mf_discount_snapshots`, `mf_calculation_price_snapshots` |
| Оценочный раскрой/рецепт | `mf_sheet_estimates`, `mf_manufacturing_recipes` |
| Submit | `mf_submission_receipts` |

В `mf_order_revisions` добавлены FK на catalogue release и production profile. Content защищён уже у draft revision; после submit запрещены любые update/delete. Добавлена защита immutable `order_id`. В `mf_permissions` добавлены granular права; существующим client выданы только explicit own grants расчёта, staff не получили автоматических grants.

Staging использует существующие отдельные ресурсы:

| Ресурс | ID / значение |
|---|---|
| Project Martin Forest Site Preview | `6d754ad4-ba7b-45f8-8c5e-356387e7de06` |
| Environment в этом НЕ production-проекте | `ee625678-c15e-452d-9761-cda99274839f` (в Railway называется `production`) |
| Staging API service | `9aacf7bf-edd5-4f08-9423-3fbabea59268` |
| Staging Postgres 18 service | `e773c03c-1f76-4f78-adb7-2132528c3a19` |
| Postgres volume | `2000d688-b163-4775-93fb-0fe87dab18c6` |
| Private volume | `29b79637-3f45-4ddd-ad2c-028d6b96af8e` |
| Private storage root | `/mf-private/storage` |
| API | `https://martin-forest-v2-staging-production.up.railway.app` |

Production Bridge deployment `dc09ba1c-7182-481d-8c62-4a9e721461c2` и production PG deployment `168b0c29-6693-433f-9a85-552f9de65b37` не изменились. Staging PG deployment также остался `65355a15-c461-43b3-85dd-b9d3eb1076ed`. Оба preview deployments сохранены.

## 4. Order revision model

Стабильные `order_id`, UUID revision, последовательный номер, parent, author/reason, lifecycle, timestamps, content hash, pinned catalogue и production profile. Сервер сохраняет исходные draft rows, problematic/raw evidence, template/import references и source manifests. Коррекция исходной строки требует `draft_row_id` и причины; пропущенные активные строки автоматически не исчезают.

Manager-assisted: verified email, физически сохранённый source с проверкой SHA и содержательный комментарий. Допускаются unresolved/qty=0, возвращается `calculation_not_available`; calculation и production job не создаются автоматически.

Self-prepared: revision + preliminary calculation той же revision. Неизвестные цены допускают submit менеджеру; production-critical проблемы требуют явного `handoff_problematic`. Состояния draft → submitted → review реально работают. Новая правка менеджера создаёт child revision и обнуляет старую approval-ссылку.

Idempotency receipt хранит request snapshot/hash, revision и preliminary calculation ID/state. Receipt, submit, audit и paused outbox фиксируются одной транзакцией. Повтор того же ключа/тела возвращает тот же результат; другое тело — 409; stale If-Match — 412. Уже рассчитанная revision не подменяется текущим изменённым draft.

## 5. Calculation model

Каждый расчёт хранит конкретную revision, input hash, engine/rounding versions, catalogue/profile/tariff/price/discount versions, входной snapshot, строки, категории, completeness и timestamp. Родитель recalculation связывается явно. Сопутствующие строки, price/discount snapshots, plans, recipes и seal создаются в одной транзакции с audit/outbox.

После seal запрещены update/delete и добавление новых строк к старому calculation. GET возвращает immutable allow-list DTO без private paths, сырого Excel, внутренних комментариев финансовых профилей и secrets. Client видит только свой order; manager — разрешённый scope.

## 6. Deterministic sheet estimator

Версия: `guillotine-vertical-first-decimal-v1`. Decimal; сортировка по убыванию площади/сторон, затем detail ID/copy. Размещение: первый лист, минимальный подходящий free rectangle, y/x, фиксированный tie-break вращения. Гильотинный split: вертикаль на высоту свободного прямоугольника, затем горизонталь в полученной полосе.

Учитывает точный формат, 10 мм каждой торцовки, kerf 4.4, qty, явные rotation/grain и child blanks. Grain не выводится инверсией rotation. Неизвестная ориентация требует подтверждения. Невмещающаяся деталь даёт invalid, без фиктивного листа. Площадь — только lower-bound diagnostic.

Сохраняются координаты, cut segments, estimated metres, plan hash. Native соответствие БАЗИС и оптимальность **не заявляются**. Коммерческая подпись: «Расчётное количество листов».

## 7. Production profile

Подтверждённые числа хранятся один раз в versioned profile: kerf 4.4; trim 10 с каждой стороны; 2 слоя; allowance 10 с каждой стороны; finished glued thickness 36; complex `min(L,W)<60`. Входная точность профиля — 3 десятичных знака мм, неподдерживаемая точность не округляется молча.

Глобальные политики NC-01/02/03/09 остаются null. Synthetic profile использован только в явном context одного тестового заказа. Synthetic profiles нельзя активировать глобально.

## 8. Tariff model

Утверждённый versioned book содержит ставки BYN: cut18 0.75/m; glued finish cut 1.70/m; normal edge 2.10/m; complex 4.00/m; thick 3.50/m; glue 14.00/m²; packaging 1.50/m².

Entry хранит operation/scope/amount/currency/unit; book нормализует общие source/date, effective interval, approval actor/time, version/supersedes. Новое утверждение создаёт новую версию. Известная ставка сама по себе не разрешает неподтверждённый scope. Cut18 не назначается всем материалам/толщинам. Финальная склеенная операция отделена от первичного раскроя.

## 9. Material price model

Stage 3 `mf_material_price_entries` остались raw provenance с неизвестными currency/VAT/purpose; они не используются как доверенный прайс. Для расчёта требуется отдельная approved sale entry конкретного released item и price book.

Листовая цена: целое N × цена листа. Цена м²: точная полная площадь листа × цена м² × N, без промежуточного округления цены листа. Нулевой approved price требует явного free basis. Review records не попадают в released lookup. Реальный master в live-проверке честно остался без полной цены.

## 10. Edge material и processing

L1/L2 используют L, W1/W2 — W, с qty. Материал группируется по exact edge variant, ширине/толщине, ownership и price version. Processing — отдельная service line по net metres. Цвет и похожее название не объединяют SKU.

По умолчанию нет скрытого ×1.15/ceil5. При null policy billable/procurement неизвестен. Explicit synthetic profile доказал 6 → 10 м материала при неизменных 6 м обработки; округление применяется к группе SKU один раз. Thick/complex ambiguity даёт needs_confirmation, не двойную ставку.

## 11. Customer material

Только explicit supply_source=customer даёт материалу ноль; сохраняются формат, толщина, provided sheets, reason и результат геометрической совместимости. Недостаток листов — invalid. Native compatibility пока NOT YET VERIFIED. Услуги и company edge остаются платными. Аналогично customer edge обнуляет только материал кромки.

## 12. Рецепт 18+18

Только explicit `glued_18_18`: finished detail → child blanks → первичный раскрой → glue → finish cut36 → edge processing → packaging. Для 600×400 q3: 620×420 q6; finished qty остаётся 3. Blanks вместе с прочими деталями того же материала участвуют в общей раскладке; отдельного повторного начисления площади материала нет.

Финальный рез этой операции: `(L+W)×qty/1000 = 3 м`. Factory solid36 не становится склейкой и не получает cut18 автоматически. Реальная база glue остаётся открытой NC-03; synthetic finished-area policy не стала глобальной.

## 13. Три независимые скидки

Materials, edge_material, services — независимые проценты 0…100. Каждая категория хранит rounded gross/discount/net, approved source/version; override — actor/reason. Manager/admin override требует отдельного permission + scope. Клиентские проценты не принимаются.

Policy `BYN-line-half-up-0.01-category-discount-v1`: HALF_UP каждой денежной строки; gross категории суммирует округлённые строки; скидка округляется один раз для категории. Контроль 100/40/60 и 10/20/5 = **179.00 BYN**. Изменение edge-material discount не меняет edge-processing services.

## 14. Incomplete behavior

`complete / incomplete / needs_confirmation / invalid` различаются. `total` существует только для complete preliminary. Для неполного результата возвращаются `known_gross`, `calculated_part`, unresolved categories и machine reasons. Если не утверждён сам discount profile, net calculated_part также null. Неизвестная цена не маскируется нулём или итогом известной части.

## 15. API

| Endpoint | Семантика |
|---|---|
| POST `/api/v2/orders/{id}/revisions` | immutable content, явный parent/reason, If-Match |
| GET `/api/v2/orders/{id}/revisions[/{revision_id}]` | scoped история/редакция |
| POST `/api/v2/orders/{id}/calculations` | server preliminary по revision_id |
| GET `/api/v2/calculations/{id}` | immutable calculation DTO |
| GET `/api/v2/orders/{id}/calculations` | история |
| POST `/api/v2/calculations/{id}/recalculate` | новая запись, старая не меняется |
| POST `/api/v2/orders/{id}/submit` | verified, If-Match, Idempotency-Key, два flow |
| POST `/api/v2/orders/{id}/review` | submitted → review, permission/scope |
| POST `/api/v2/calculations/{id}/fix` | 409 BAZIS_RUN_REQUIRED |
| POST `/api/v2/financial/{production-profiles,tariff-books,price-books,discount-profiles}` | явные approved versions, admin permission |
| GET `/api/v2/financial/versions/{kind}/{id}` | protected version inspection |
| GET/POST `/api/v2/financial/defaults` | explicit version selection, optimistic version |
| POST `/api/v2/orders/{id}/financial-context` | admin, явный order context |
| POST `/api/v2/orders/{id}/discount-overrides` | manager/admin + scoped permission + reason |
| POST `/api/v2/financial/customers/{id}/discount` | история customer profile assignments |

Financial fields в browser requests отвергаются 422. Production/final/PDF endpoints не реализованы за счёт обходов. Существующий approval gate остаётся закрыт.

## 16. Фактические calculation fixtures

`actual-engine-fixtures.json` — сохранённые результаты исполнения engine с явно synthetic inputs. `live-evidence.json` — реальные HTTP DTO из staging.

Live synthetic calculation: `537e764a-03eb-4b7d-9ea9-305d249bff27`; order `d2c6de29-1bad-411c-8c2a-6119851d66e1`; revision `4ad6ef03-5ca4-4094-be0c-a42bc35039e5`.

| Начисление | Количество | Gross BYN |
|---|---:|---:|
| Чистый лист, synthetic approved price | 1 | 100.00 |
| Первичный estimated cut, synthetic scope | 7.82 м | 5.87 |
| Glue, synthetic finished-area basis | 0.72 м² | 10.08 |
| Finish cut36 | 3 м | 5.10 |
| Packaging finished area | 0.72 м² | 1.08 |

Materials net после 10%: 90.00; services gross 22.13, скидка 5%=1.11, net 21.02. Итого **111.02 BYN**, type=preliminary, synthetic=true. Edge category пустая, отдельной нулевой packaging line нет.

Реальный master: тот же active release, утверждённого sale price/discount profile нет; total=null, причины NC-05, NC-09 и APPROVED_DISCOUNT_PROFILE_REQUIRED. Глобальные defaults и catalogue release не изменялись.

## 17. Backup → actual restore → redeploy

До Stage 4: 39 таблиц, 3 orders, 1 revision, 2 releases, 7 files, 1 ранее существовавший blocked staging job. Backup `/mf-private/backups/pre-stage04`; dump SHA `77b6afbfd2371efe9a5d41b3eb40eae4fba24e940c259716d6ec7ab890ccbfd7`.

После Stage 4 реально выполнено:

| Показатель | Факт |
|---|---|
| Backup | `/mf-private/backups/stage04-439cbbfd82dd` |
| Dump SHA-256 | `62009173e63b8dc539fdff0347bea30c7fc2b2bddb5f0dd80f1bbc6012702f50` |
| Новая restore DB | `mf_staging_restore_stage04_439cbbfd82dd` |
| Отдельный restore root | `/mf-private/restore-stage04-439cbbfd82dd/storage` |
| Restore deployment | `fb49d023-06b0-4dc0-9b6a-0cfb9f99dafd` |
| Verification после redeploy | `61ef2ee9-9113-43c8-8049-7f43c5582737` |
| Рабочая staging после этапа | 58 таблиц, 6 orders, 5 revisions, 2 calculations, 8 calculation lines, 9 private files |
| Сверка | полные snapshots 21 таблицы + revision/input/result hashes + SHA каждого private file совпали |
| Active release | `e6db8155-91a6-4f15-9b89-ce2194b43373`, без изменения |
| Jobs | 1 старый blocked fixture, новых jobs 0 |

Рабочая DB не перезаписывалась restore. Dump, manifests и bytes хранятся приватно. Temporary synthetic operator disabled, password hash уничтожен, sessions/grants отозваны, admin role снята, credential variables очищены и local credentials удалены.

Файлы доказательств: `cloud-restore-evidence.json`, `persistence-evidence.json`, `pre-stage04.json`. Отдельный native CI restore подтверждён `ci-final-evidence.json`. Это проверенное восстановление staging, не production и не обещание off-site retention/RPO или автоматического ежедневного backup.

## 18. Регрессии

Финальный CI [35848348034](https://github.com/artempilipeika-create/artempilipieka-create.github.io/actions/runs/35848348034), job `107139830982`, commit `af6e58466a880eff17ccb1feb7f02e7f8db548f9`: **121 PASS, 0 FAIL, 0 SKIP**.

| Набор | PASS |
|---|---:|
| Stage 0–1 | 28 |
| Stage 2 security | 20 |
| Stage 3 catalogue/import/identity/AUTO | 46 |
| Stage 4 | 27 |

Локальный прогон pure tests отдельно успешен; DB tests локально пропускаются из-за отсутствия native PostgreSQL. Их PASS подтверждён именно CI с настоящим Postgres, а не SQLite/mock.

Первый CI: 118 PASS/1 FAIL — restore comparison пытался сериализовать SQL numeric, декодированный JSON loader во float. Исправлено точное сравнение PostgreSQL `to_jsonb(row)::text`; engine продолжает запрещать float. Следующие CI: 119 PASS, затем 121 PASS. Live API и cloud restore прошли отдельно после этого.

## 19. Acceptance matrix

Все PASS ниже означают выполненный автоматический/HTTP тест соответствующего поведения, а не утверждение открытой бизнес-политики.

| ID | Статус | Доказательство / фактический результат |
|---|---|---|
| CAL-01 | PASS | маленькая деталь → 1 полный лист; также exact m² conversion 29.0594052 → 29.06 |
| CAL-02 | PASS | 2781×100 > usable2780 → invalid, plans=[] |
| CAL-03 | PASS | 1388×1100 q2 → 2 листа при kerf4.4 |
| CAL-04 | PASS | 1387.8×1100 q2 → 1 лист, точная граница2780 |
| CAL-05 | PASS | customer material0, services и company edge положительны |
| CAL-06 | PASS | raw0 без approved price → null/incomplete |
| CAL-07 | PASS | неизвестная edge price → total=null, известная часть отдельно |
| CAL-08 | PASS | 90+32+57=179.00 |
| CAL-09 | PASS | edge discount меняет только edge_material |
| CAL-10 | PASS | native DB/HTTP: старый financial DTO byte-identical после новых tariff/price/profile/discount versions |
| CAL-11 | PASS | net6 без policy → procurement=null, скрытых10нет |
| CAL-12 | PASS | synthetic1.15/ceil5 → procurement10, processing6 |
| CAL-13 | PASS | один SKU на нескольких деталях округлён одной группой |
| CAL-14 | PASS | blanks620×420 q6, finishedq3, packaging0.72, один material charge; live подтверждён |
| CAL-15 | PASS | finish cut3м, не6; live подтверждён |
| CAL-16 | PASS | factorysolid36 без glue и cut18 |
| CAL-17 | PASS | thick/complex конфликт → needs_confirmation, без двойной ставки |
| CAL-18 | PASS | API injection422, DTO не изменён; native + live |
| ORD-01 | PASS | повтор key/body → тот же receipt/order/revision; native + live |
| ORD-02 | PASS | другой body409, staleIfMatch412; native + live |
| ORD-03 | PASS | child revision после manager change, old content immutable; native + live |
| ORD-04 | PASS | old approval pointer очищен при child; synthetic native DB check, без production run |
| ORD-05 | PASS | каталог/тариф/цены обновились — старые snapshots/DTO неизменны |
| ORD-06 | PASS | сохранён проблемный Excel qty0/raw; submit manager, calculation_not_available, jobs0; native + live |
| ORD-07 | PASS | incomplete price можно передать review, total не становится complete/final; native + live |
| Final-price gate | PASS (ожидаемый BLOCK) | fix409 BAZIS_RUN_REQUIRED; настоящий final НЕ создан |
| Stage2 security | PASS | own/assigned scope, revoke/block, verified email, clientOBLXdeny, legacy closed |
| Atomicity/sealing | PASS | injected rollback не оставляет calculation/lines/audit/outbox; sealed history не дополняется/не меняется |
| Backup/restore | PASS | реальный CI restore и отдельный cloud restore, все hashes/bytes совпали |
| Persistence | PASS | после redeploy: 5 revisions,2 calculations,9 files сохранены |
| Protected branches/deployments | PASS | main/baseline/preview/Bridge SHA и production deployments без изменения |
| Staging transport | PASS | disabled/local_only; jobs count1→1, новых production/staging jobs не создавалось |
| Native BAZIS / actual final | NOT VERIFIED / UNAVAILABLE | Stage 6 не выполнялся, gate закрыт |

## 20. Открытые NC и границы результата

**Реально рассчитано:** Decimal line/category sums и скидки; метраж назначенных сторон; finished packaging area; formula finish-cut; server DTO по immutable inputs; synthetic approved fixtures; воспроизводимость сохранённых snapshots.

**Остаётся estimated:** количество чистых листов, размещение и guillotine cut segments/metres. Не оптимальный и не фактический БАЗИС-раскрой.

**Needs confirmation:** NC-01 edge procurement/billable policy; NC-02 thick/complex classification; NC-03 реальная glue area basis/технологическая приёмка маршрута; NC-05 metadata/approval реального master D и edge prices; NC-09 спорные billable cuts/scopes. Неутверждённый discount profile также не придуман как три нуля.

**Не является final до Stage 6:** ни один расчёт Stage 4. Нет verified BAZIS run, final fixing, awaiting_approval через fake final, production release или автоматического исполнения.

NC-04 native axes/rotation/allowances остаётся непроверенным. NC-06–10 вне разрешённого объёма Stage 4 не переопределялись.

## 21. Фактический Git diff и сознательно исключённые работы

`implementation.diff` получен непосредственно командой:

```sh
git diff 96f320cef3ef5823c9ac35955fd5905ca500958a af6e58466a880eff17ccb1feb7f02e7f8db548f9 -- backend/v2 tests/stage04 .github/workflows/staging-foundation.yml
```

`implementation-stat.txt` — фактическая статистика того же diff: 22 файла, 1678 добавлений, 15 удалений. Документация/evidence хранятся отдельно в `docs/stage04/`. Полный repository compare включая документацию доступен от Stage3 SHA до финального report commit, указанного в итоговом сообщении.

Не изменены importer/catalogue/strict identity/AUTO modules и старые migrations. Не делались PDF, кабинет/UI, OBLX exporter, Agentv2, БАЗИС, production transport/cutover, redesign, фото, 3D, scraps, реальный email provider. Не менялись main, baseline, visual preview, production Bridge/PG/Agent, Windows automation и `D:\pgm`.

## 22. Rollback

1. Сохранить свежий backup текущих Stage 4 DB + bytes; остановить новые записи staging на время переключения. Transport/dispatch оставить disabled.
2. Для отката приложения использовать schema-compatible Stage 4 commit, например `01022dee7fffb1e9d98e285c787339b4a712e9f7`; migrations0004 не откатывать вручную, историю не удалять.
3. Для полного возврата к Stage 3 восстановить `/mf-private/backups/pre-stage04` в НОВУЮ пустую staging DB и отдельный storage root. Проверить dump/files SHA, таблицы и manifests; затем направить только staging app на эту копию с runtime `267ed0cf8ac4439f82543dec1a79bad67fd4de63`.
4. Рабочую Stage 4 DB/bytes сохранить для reconciliation, не перезаписывать старым backup. Stage 3 нельзя просто запустить поверх schema0004: readiness намеренно отвергает неизвестные migrations.
5. Production ресурсы и защищённые ветки в rollback не участвуют. Подробности и команды существующего backup модуля — в `RUNBOOK.md`.

**Stage 4 завершён. Stage 5 не начат.**
