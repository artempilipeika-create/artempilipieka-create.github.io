# Martin Forest — Stage 3

Основа: принятый Stage 2, branch martin-forest-v2-staging, HEAD
9395aa11533000337faa17e1a5d7c4d2e75aff37; прежний runtime
3ff1752469f189f0e13191dcfe01a5e8033abff8.

Источники: SPEC v2 FINAL (D/E/F/M/O/P/Q), AUDIT EVIDENCE, приложенное задание Stage 3
и фактически приложенный ДЛЯ ГПТ(5).xlsx. Задание называет (4); файл (5) не переименовывался
и не перезаписывался. Предыдущие этапы сохранены. Stage 4 не начинался.

## 1. Commits и инфраструктура

- e0045e3d6ce76e15e30dcb25f92fd61b6c637288 — каталог, raw ledger, parser, identity, AUTO, templates, draft API.
- 267ed0cf8ac4439f82543dec1a79bad67fd4de63 — sealed releases, explicit draft catalogue update, replay, dedup и дополнительные scope tests.
- Runtime закреплён на 267ed0cf8ac4439f82543dec1a79bad67fd4de63. Последующие commits отчёта/тестов отдельно от runtime.
- Первый Stage 3 deployment: 4b0bc740-1fdf-4dcc-af7d-0b7b7bb76e0e, SUCCESS.

| Объект | ID |
|---|---|
| Project Martin Forest Site Preview | 6d754ad4-ba7b-45f8-8c5e-356387e7de06 |
| Environment (техническое имя production в preview project) | ee625678-c15e-452d-9761-cda99274839f |
| Staging app | 9aacf7bf-edd5-4f08-9423-3fbabea59268 |
| Staging Postgres 18 | e773c03c-1f76-4f78-adb7-2132528c3a19 |
| Private app volume /mf-private | 29b79637-3f45-4ddd-ad2c-028d6b96af8e |
| Postgres volume | 2000d688-b163-4775-93fb-0fe87dab18c6 |

URL: https://martin-forest-v2-staging-production.up.railway.app
Single start command: python -m backend.v2.serve. Dockerfile не содержит legacy/public frontend.

## 2. Migration и новые таблицы

Добавлена 0003_catalogue_imports.sql; 0001/0002 не менялись. Нативный Postgres,
checksum journal и advisory migration/backup locks сохранены.

20 новых таблиц; всего с существующим migration journal — 39:

- mf_catalogue_imports
- mf_catalogue_raw_rows
- mf_catalogue_source_mappings
- mf_materials
- mf_material_variants
- mf_edge_variants
- mf_catalogue_releases
- mf_catalogue_items
- mf_material_price_entries
- mf_catalogue_active
- mf_catalogue_release_seals
- mf_identity_aliases
- mf_material_edge_mappings
- mf_import_templates
- mf_import_template_revisions
- mf_import_batches
- mf_import_rows
- mf_import_row_resolutions
- mf_order_draft_rows
- mf_import_receipts

Raw, variant identity, release snapshots, aliases, mappings, template revisions, import
evidence и receipts — append-only. Seal отдельно запрещает добавление строк в уже
опубликованные items/prices; active pointer принимает только sealed release.
Audit + paused local outbox записываются в той же транзакции, что изменение доменных данных.

## 3. Master SHA и provenance

Файл: ДЛЯ ГПТ(5).xlsx, 1 019 521 bytes.

SHA-256:
54c6f737f0bafecc3dc5df4ed14b573b7e2f5ab0c83e626e5e79fc296c641f4a

Sheet1, A1:L22140, 22 139 строк данных. A–L, cell coordinates, XML types, formula,
cached value и исходные строки сохранены; K остаётся raw logical flag.
Header, source namespace, file manifest, actor и import timestamp связаны с batch.
Raw master хранится как internal/private mf_files и переживает перенос вместе с DB backup.
В публичный Git XLSX и внутренние цены не добавлялись.

## 4. Полный учёт строк

| Disposition | Число |
|---|---:|
| published | 3 065 |
| review | 372 |
| excluded | 18 698 |
| duplicate, с ссылкой на исходную строку | 4 |
| error | 0 |
| **Всего** | **22 139** |

J как набор: M1=2290, M2=1292, M0 M1=44; все прочие классы также учтены.
44 mixed строки остаются review. 327 edge строк требуют решения по единицам/геометрии.
Ещё одна строка M1 с неполной геометрией — review; 185 M1 без достаточной геометрии —
excluded. Вместе это 186 M1_without_board_geometry, согласно фактически выполненному reader.
Прочая непрофильная номенклатура — 18 513 excluded.
Четыре точных дубликата имеют duplicate_of и не создают повторные variants.

Это измеренные результаты новых проверок, а не обещание опубликовать все M1/M2:
аудиторское число 180 относилось к прежнему фильтру/генератору.
Нулевые размеры/толщина не заменялись значениями по умолчанию.
В dry-run published означает валидных кандидатов; публикация выполнялась отдельным admin action
с явным согласием оставить review вне release.

## 5. Пять ЛХДФ/HDF и negative group

Точные UUID, article, raw name, thickness и format приведены в master-evidence.json
и подтверждены опубликованным API в live-evidence.json.

- 2141: ЛХДФ 3ММ Белый, 2800х2070 мм — article=null, 3 / 2800×2070.
- 2144: ЛХДФ 3ММ Черный, 3мм — article=null, 3 / 2800×2070.
- 2145: ЛХДФ  Белый — исходные двойные пробелы сохранены, article=null, 3 / 2800×2070.
- 2146: HDF, šviesiai pilka. 4 mm — article=null, 4 / 2800×2070.
- 2147: HDF,  2.8 mm Pilka (U708)/U5034 — article=U708/U5034, 2.8 / 2800×2070.


| Source row | Stable variant UUID |
|---|---|
| 2141 | fb7b270e-66ad-5411-affc-5717b1adf0d6 |
| 2144 | 4ff13ca6-23b5-5eb2-b1f8-82707ef82398 |
| 2145 | 19f3e6b2-9b84-5b5c-8e4f-6d2d67c2d293 |
| 2146 | 4b266664-8666-52c4-be1c-d1fcd225d215 |
| 2147 | f4dfb610-6ed0-51ed-be21-595609e9117b |

ЛХДФ / ХДФ / HDF дают по 5 candidates. U708/U5034 даёт тот же вариант 2147.
Никаких искусственных артикулов и листов 2800×1220.
Смесители 10749–10753 — excluded, variant_id=null: substring HDF не классифицирует их как плиты.

## 6. Stable identity и source scopes

UUIDv5 рассчитывается из namespace и exact physical identity signature; mapping сохраняется в DB.
Номер Excel-строки не участвует в business ID. Без артикула signature включает точное имя,
поэтому похожие белые ЛХДФ не сливаются. Article punctuation и Cyrillic/Latin не смешиваются.
Manufacturer/structure/decor неизвестны, если нет подтверждённого источника.

External L проверяется на уникальность во всём source namespace; коллизии и изменение
связанной identity идут в review. Они не становятся основанием слить варианты.
Цена исключена из physical signature. Новые dimensions/article — новая identity;
rename существующего physical ID требует review/audit, автоматически не публикуется.

Реально выполнена перестановка строк копии текущего XLSX в памяти: все опубликованные UUID
остались прежними; исходный SHA не изменился. Native PG тест повторного supplier import
подтверждает persisted IDs и отдельные price changes. Полный snapshot одного namespace
не делает inactive записи других поставщиков.

## 7. Search и strict identity

Search возвращает candidates по article/name/manufacturer/decor/family/thickness/format;
HDF aliases и поисковое x/х/× не используются в identity.

Состояния: exact_match, confirmed_mapping, unresolved, ambiguous, manual_override,
custom_customer. Хранятся raw fields/cells/source, выбранная точная identity/release,
кандидаты, method/reason, author/time, alias ID/version.
При неполных подтверждённых признаках требуется согласование; manufacturer и 18 мм не угадываются.
621 PO / 621 PE / 621 POX различны. Неизвестный код остаётся unresolved.
Формат не выбирается по цене. Alias требует явного admin approval и не перекрывает physical conflict.
Custom customer требует отдельного подтверждения собственности; нулевая цена не является сигналом.

## 8. Excel parser и шаблоны

Read-only bounded OOXML: 20 MiB input, 100 MiB expansion, 50 sheets/50k rows/750k cells;
ZIP path/cell-coordinate duplicates, macro payload и XML entities отвергаются.
Ни формулы, ни внешние связи не выполняются.

Каждый выбранный worksheet row учтён как header/service/blank/valid/problematic.
qty=0 остаётся 0; -1, 1.5, blank/text не превращаются в 1.
Плохие размеры не удаляют строку. Ошибка содержит sheet/row/field/raw/reason/action.
Formula и cache различны; missing/error cache — видимая ошибка.
Десятичные преобразования и unit conversions записаны, лишняя точность не округляется тихо.

Все поля независимы; X1=L1, X2=L2, Y1=W1, Y2=W2, конфликты видны.
SKU кромки сохраняется отдельно от mark. Dictionary зависит от template revision.
Texture и rotation не выводятся друг из друга. Material header распознаётся до dimensional
validation; новый header сбрасывает прежний article, blank/service границы задаются template.
Sheets выбираются явно или утверждённой named policy.

Template revision содержит name/owner, headers fingerprint, mapping, policy, inheritance,
dictionary, units, status/version/author. Старые bytes + старый template дают тот же replay hash.
Client — собственные templates с explicit grant; manager — назначенный клиент и templates.manage;
admin — templates.manage/all. Reassignment немедленно меняет доступ.

## 9. AUTO и draft

auto_suggestion не является confirmed. confirmed_database_mapping требует approved mapping
ID/version и exact material→edge. Substring designation остаётся только suggestion.
manual_override хранит автора/время/причину; это относится и к явному NONE.
AUTO никогда не меняет material selection. Несовместимая ручная кромка сохраняется с warning.
Reset AUTO — отдельное действие одной стороны.

Confirm меняет только DRAFT; сохраняет raw/problematic rows, resolution, pinned release/template,
edge provenance. Add/replace/new_revision явные; repeat bytes/template/sheets/release и повтор
confirm не создают скрытых дубликатов. Exclusion требует причину и оставляет raw/audit.
new_revision фиксирует immutable draft checkpoint без обхода submit gate.
Смена active release не переписывает snapshots. Explicit draft catalogue update предваряется diff,
сохраняет manual edges и не подбирает заменитель исчезнувшему exact variant.

## 10. API

Все routes ниже имеют prefix /api/v2; CSRF Origin, JSON, session и granular permissions сохранены.

| Метод | Route | Назначение |
|---|---|---|
| GET | /catalogue/materials, /catalogue/edges | Safe candidates + pagination |
| GET | /catalogue/materials/{variant_id} | Exact release variant |
| GET | /catalogue/releases | Active pointer/version list |
| GET | /catalogue/releases/{id}/data.js | Reproducible cache + content SHA |
| POST / GET | /catalogue/imports, /catalogue/imports/{id} | Admin raw ingest / dry-run ledger |
| POST | /catalogue/imports/{id}/publish | Atomic sealed release |
| POST | /catalogue/releases/{id}/activate | Audited pointer switch/rollback |
| POST | /catalogue/aliases, /catalogue/edge-mappings | Explicit approved versioned mapping |
| POST | /import-templates, /import-templates/{id}/revisions | Immutable template edits |
| GET | /import-templates/{id}/revisions | Scoped history |
| POST | /imports/preview | Selected sheets, no row loss |
| GET | /imports/{id} | Stored report |
| POST | /imports/{id}/replay | Original template reproduction |
| POST | /imports/{id}/rows/{row_id}/resolution | Explicit material resolution |
| POST | /imports/{id}/confirm | Idempotent draft application |
| GET | /orders/{id}/draft/rows | Pinned snapshots |
| POST | /orders/{id}/draft/rows/{row_id}/material, /edges, /auto, /exclude | Scoped explicit edits |
| GET / POST | /orders/{id}/draft/catalogue-update | Diff / conscious release update |

## 11. Backup, restore и redeploy

Pre-migration dump SHA:
c374390347864d7ff1b214e47af8ed8e31a1ee2c075f877641eac80f09535681

В pre-stage03 сохранены 3 manifest files, прежние migration versions, runtime SHA и
catalogue_before=null. Доказательство: pre-migration-backup.json.

Native PG CI выполнил реальный Stage 3 dump → restore отдельной DB и private bytes,
сверил active release и source file SHA. Railway post-import restore/redeploy доказательства
приведены отдельно в cloud-restore-evidence.json, deployment-evidence.json и live-evidence.json.
Реальный Railway restore: mf_staging_restore_stage03_9e4c8658833c, 7 files, 44 278 raw rows
(два batch по 22 139), active release e6db8155-91a6-4f15-9b89-ce2194b43373.
Dump SHA: e0aec56c5f56840360f1e47141437a13d262e8124bc5abb083affb9869a8ca81. Master bytes и SHA проверены после restore.
Ни одна рабочая staging DB не восстанавливалась поверх себя.

Процедура и безопасный полный возврат к Stage 2 — RUNBOOK.md.
Отдельная off-site disaster recovery, восстановление на новом Railway project и production
restore — NOT VERIFIED; они не выполнялись в этом этапе.

## 12. Tests и acceptance matrix

Runtime 267ed0c: GitHub Actions run 35841323686, job 107116816030 — **89 PASS**:
все прежние 48 Stage 0–2 regression tests и 41 новый Stage 3 test.
Native Postgres использован реально; SQLite/fake DB не заменяли integration tests.
Дополнительные буквальные PO/PE и проверки каждой стороны отмечены в final-ci-evidence.json.

| Criteria | Результат | Доказательство |
|---|---|---|
| CAT-01,02,03 | PASS | Реальный master + authenticated live search/exact UUID |
| CAT-04 | PASS | Реальные 10749–10753 + negative test |
| CAT-05,06 | PASS | 22 139 accounted; classes/reasons + DB ledger |
| CAT-07 | PASS | Перестановка реального XLSX в памяти + native re-import |
| CAT-08 | PASS | Duplicate sync collision fixture, review, разные UUID |
| CAT-09 | PASS | Native immutable checkpoint + live release switch/rollback |
| CAT-10 | PASS | Byte reproducibility/hash + verify_cache rejects modified cache |
| ID-01,02 | PASS | Full article PO/PE/POX mismatch; raw сохранён |
| ID-03,04,05 | PASS | Manufacturer/structure/thickness/format conflicts, no nearest/cheaper substitution |
| IMP-01 | PASS | Native и live preview→confirm→draft→reload qty=0 |
| IMP-02,03 | PASS | -1/1.5/blank/text, bad dimensions retained |
| IMP-04,05,06,07,08,09 | PASS | Header reset, axis mapping/conflict, explicit multisheet, SKU, formula cache |
| IMP-10 | PASS | Immutable template revision + stored replay hash after new revision |
| AUTO-01,02,03,04,05 | PASS | Manual/material/NONE preserved, incompatibility warning, suggestion distinction |
| AUTO-06 | PASS | Immutable draft checkpoint remains identical after publish/rollback; submit stays closed |
| Stage 0–2 regressions | PASS | Все прежние 48 checks, включая client OBLX hard deny |
| Backup/restore | PASS | Native CI и отдельное Railway restore, см. evidence |
| Redeploy persistence | PASS | Published catalogue, draft qty/manual NONE, identical cache и private bytes |
| Off-site disaster recovery | NOT VERIFIED | Копия проверялась в отдельной DB/storage того же staging Postgres/volume |
| Production Agent physical log inspection | NOT VERIFIED | Production Agent не опрашивался; staging transport отсутствует/disabled |

## 13. Защищённые контуры и сознательно не сделанное

Контрольные SHA:
baseline 4fb9d5ceb146480be540a39b454119ea84daa98f;
visual preview 5c97a60145569b7d1df99f5fce5341587db2f75c;
Bridge 2031c09c2f9d8690cb75856b0a4cadb1533a411b;
main 470776dfd3efd1db9638668d2e19ea174b7901cc.

Production Bridge deployment dc09ba1c-7182-481d-8c62-4a9e721461c2,
production PG deployment 168b0c29-6693-433f-9a85-552f9de65b37 — неизменны.
Visual service c28c394e-ff50-4cc7-ba04-0ad9f5eb804c и original preview
5ac650b4-0d52-48c9-9222-29e0a8fd4f3a — неизменны.

Не менялись production secrets/DB schema/legacy Agent contract, /api/orders/pull/ack/events,
Windows paths, D:\pgm. Production credentials не читались.
Staging noindex, private volume, session RBAC, disabled transport/outbox сохранены.
Временный staging operator имеет отдельный случайный secret; после acceptance отключён,
sessions/grants отозваны. Постоянного default admin не создано.

Не реализованы calculation engine, sheets estimation/cutting, tariffs/discounts, PDF/final price,
OBLX exporter, Agent v2/transport, БАЗИС, real email provider, дизайн/фото/3D/scraps.
Review records требуют отдельного решения по каталогу. Manufacturer/structure/decor, NC-05
и отсутствующие форматы не выдуманы. Legacy frontend не монтировался в staging app;
проверенная граница этого этапа — backend API/data, без UI redesign.

## 14. Фактический Git diff и остановка

stage3-code.diff содержит полный Git diff к принятому Stage 2 по backend/tests/workflow.
git-diff-stat.txt содержит итоговый список изменённых файлов и статистику, включая evidence/docs.
Исходный master и credentials в diff отсутствуют.

Stage 3 завершён. **STOP. Stage 4 требует отдельного сообщения Артёма.**

