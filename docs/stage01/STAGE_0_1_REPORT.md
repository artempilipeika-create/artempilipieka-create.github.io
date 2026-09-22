# Martin Forest — фактический отчёт Stage 0–1

**Результат: код подготовлен и проверен; облачная приёмка Stage 0–1 НЕ завершена.**
Railway разрешил создать пустой staging-сервис, но отказал в создании отдельного Postgres:
`Free plan resource provision limit exceeded`. Новый отдельный проект был отклонён с той же ошибкой.
Тариф, существующие приложения, production DB и Agent не изменялись. Следующие этапы не начаты.

## 1. Ветка, основа, commits

Репозиторий: `artempilipeika-create/artempilipieka-create.github.io`.

- Создана удалённая ветка `martin-forest-v2-staging` от `5c97a60145569b7d1df99f5fce5341587db2f75c`.
- Основная реализация: `8742ebce6fa3658a78958a3849dcfa406f667274`.
- Проверенный итоговый код: `590eb9e2584552c12ecf394996927838eac2971e`.
- Последующий commit добавляет только этот отчёт и доказательства, код совпадает с проверенным commit.

Функциональный baseline наследуется через preview. Три файла `backend/main.py`, `backend/requirements.txt`
и `backend/README.md` скопированы побайтно из Bridge `2031c09…`, hashes записаны в
`bridge-provenance.json`. Исходный Bridge сохранён как основа будущей интеграции, не импортируется новым
runtime. v9 и frontend сохранены в ветке, но текущий infrastructure-only staging их не обслуживает.
Новые модули расположены в `backend/v2`. Слепого merge двух entrypoint не выполнялось.

| Контрольная точка | До и после |
|---|---|
| baseline | `4fb9d5ceb146480be540a39b454119ea84daa98f` |
| visual preview | `5c97a60145569b7d1df99f5fce5341587db2f75c` |
| Bridge branch/deployed commit | `2031c09c2f9d8690cb75856b0a4cadb1533a411b` |
| production Bridge deployment | `dc09ba1c-7182-481d-8c62-4a9e721461c2` |
| production Postgres deployment | `168b0c29-6693-433f-9a85-552f9de65b37` |
| SPEC preview deployment | `c28c394e-ff50-4cc7-ba04-0ad9f5eb804c` |
| старый preview deployment | `5ac650b4-0d52-48c9-9222-29e0a8fd4f3a` |

Конфигурации существующих Bridge и обоих preview совпали с исходными. `main` не изменялся.
См. `control-points-before.json`, `control-points-after.json`; SHA приложенных документов — `source-documents.json`.

## 2. Railway и фактическая граница изоляции

| Объект | Фактическое состояние |
|---|---|
| Project | существующий `Martin Forest Site Preview`, `6d754ad4-ba7b-45f8-8c5e-356387e7de06` |
| Environment | существующий default `production`, `ee625678-c15e-452d-9761-cda99274839f`; новый environment не создан |
| Новый staging service | `martin-forest-v2-staging`, `9aacf7bf-edd5-4f08-9423-3fbabea59268` |
| Source/deployment | не подключены, deployment отсутствует |
| Private volume | `29b79637-3f45-4ddd-ad2c-028d6b96af8e`, `/mf-private`, **STAGED, не применён** |
| Staging Postgres | **не создан**, quota error |
| Staging secrets | не создавались; у сервиса только автоматически предоставленные Railway variables |
| Agent credentials/transport | отсутствуют; Agent не подключён |

Проверка проекта показала: у существующих preview нет постоянных volumes/доменной БД. Их переиспользование
не обеспечивает Stage 1; поэтому создан отдельный пустой сервис. Он находится в проекте, отдельном от
production Bridge, но не в новом Railway environment. Это **частичная подготовка**, не завершённая
изоляция с постоянной БД.

В staging variables отсутствуют `DATABASE_URL`, `MF_DATABASE_URL`, `AGENT_API_KEY`, Telegram secrets.
Есть только `RAILWAY_*` metadata и публичные URL соседних preview. Значения production secrets не читались.
Ни один environment-wide deploy/accept не выполнялся. В текущем pending patch только новый сервис и
его volume; изменения обоих существующих preview отсутствуют.

## 3. Постоянная БД и migrations

В Railway постоянной staging БД пока **нет**. Новая реализация принимает только Postgres и отказывается
запускаться без staging-настроек; fallback на SQLite отсутствует. Схема применена и проверена в отдельном
native Postgres 17 в GitHub CI. Этот тестовый Postgres удалён вместе с runner и не выдаётся за постоянный staging.

`backend/v2/migrations/0001_foundation.sql` содержит DDL доменных таблиц. Versioned runner
`backend/v2/migrate.py` создаёт migration journal, сериализует применение advisory lock, сверяет SHA-256
каждой миграции и отказывается принимать drift/неизвестные версии/непустую исходную БД.
Миграции применяются транзакционно. Production DB schema не менялась.

## 4. Private storage

Подготовлены интерфейс `BlobStore`, volume adapter, server-generated private keys, SHA-256, размер, MIME,
тип/classification, автор, timestamps, статус и связи order/revision/job. Файлы проходят
`staging → запись и fsync → проверка байтов → ready + audit/outbox`. Ошибка сохраняет failed manifest.
Ключи неизменяемы; traversal, symlinks и перезапись отклоняются.

Нет static mount, upload/download gateway, публичного файлового либо OBLX endpoint. `kind=oblx` допускается
только с `classification=internal`. OBLX не генерировался; проверочные файлы — синтетический текст.
Volume Railway пока не смонтирован работающему приложению; FILE-01 требует последующего redeploy-теста.

## 5. Audit/outbox и RBAC foundation

Доменное изменение, `mf_audit` и `mf_outbox` фиксируются одной транзакцией. Проверены успешная запись,
искусственное исключение после всех записей и ошибка записи outbox: частичные изменения отсутствуют.
Audit/история назначений/job events защищены append-only triggers; immutable revisions защищены отдельно.

Outbox ограничен `destination=local_only`, начальный статус `paused`. Jobs используют отдельный
`mf.staging.*` namespace и допускают только `blocked/cancelled`. Отправителя, pull/ack API и Agent нет.

Семь ролей определены в схеме, но роль сама по себе не выдаёт прав. Решение требует точного permission,
scope и текущего состояния пользователя/назначения. Wildcard запрещён, scope `all` действует только
с явным admin grant. Client OBLX всегда denied. Полные auth/RBAC/admin/email flows не переносились.

## 6. Таблицы

В migration/CI созданы **17 таблиц**; в Railway они ещё не созданы:

| Назначение | Таблицы |
|---|---|
| Версии и среда | `mf_schema_migrations`, `mf_environment` |
| Пользователи | `mf_users`, `mf_sessions`, `mf_email_verifications` |
| Разрешения | `mf_roles`, `mf_permissions`, `mf_user_roles`, `mf_permission_grants` |
| Заказы | `mf_orders`, `mf_order_revisions`, `mf_manager_assignments` |
| Файлы/журналы/очередь | `mf_files`, `mf_audit`, `mf_outbox`, `mf_job_events`, `mf_production_jobs` |

## 7. Выполненные tests и restore

- Локально: **19 PASS, 9 SKIPPED** — пропущены только native Postgres tests.
- CI с native Postgres 17: **28 PASS, 0 FAIL, 0 SKIPPED**.
- CI run: https://github.com/artempilipeika-create/artempilipieka-create.github.io/actions/runs/35788628578
- Test job: `106951469433`; проверенный код `590eb9e2584552c12ecf394996927838eac2971e`.
- Workflow artifact `staging-foundation-evidence`: `10721116157`, SHA-256
  `eb5937aa63b621a6ac50c7fee4c6e05ee567fdfcf851062c1c4073fd2a8b293f`.

Реально выполнен `pg_dump` → `pg_restore` в **другую пустую CI-БД** и отдельный каталог файлов.
Сверены counts всех 17 таблиц: в частности 9 orders/revisions/jobs, 18 audit и 18 outbox, 10 file manifests
(включая failed запись контрольной ошибки). Сверены байты успешных файлов; повторный restore в непустую
БД и попытка restore поверх исходной БД отклонены.

Контрольный test file: `f3610ec5-b1d3-4ca6-a5af-0feba11246e3`, 50 байт,
SHA-256 `1904569db06a27b7e605958feaf997605a912de0e2c91ababb5fcb6bdc7d25e2`.
SHA-256 dump: `795eb3a04862ed3fde3603c3d9e0c245541ff12cec420f6d7b048a7f1c66dbf0`.
Доказательства из фактического CI log: `ci-evidence.json`, `ci-tests.log`.

Проверены noindex и отсутствие GET/HEAD/Range/POST путей static/files/OBLX/legacy Agent; schema constraints,
namespace, запрет transport, отзыв доступа при смене manager, blocked admin, deny-by-default,
сохранение private file после повторного открытия volume adapter, migration checksum drift.

**Railway redeploy, Railway restore и production restore: NOT YET VERIFIED.**
Проверка CI не подтверждает mounts, секреты, daily backup schedule или долговечность Railway.

## 8. Acceptance criteria

PASS с пометкой CI относится к проверенному коду; все cloud gates остаются обязательными до завершения Stage 1.

| ID | Результат | Фактическое доказательство/ограничение |
|---|---|---|
| ENV-01 | PASS | Baseline/preview SHA, deployments и configs не изменены |
| ENV-02 | PASS | Bridge deployment `dc09ba1c…`, commit и config прежние |
| ENV-03 | NOT VERIFIED | Live Agent не наблюдался; staging jobs только в изолированном CI, transport отсутствует, production запросы не отправлялись |
| ENV-04 | PASS | Удалённая `martin-forest-v2-staging` существует и содержит изменения |
| DB-01 | FAIL — BLOCKED | Railway Postgres не создан из-за quota; код использует только Postgres |
| DB-02 | PASS | Versioned SQL migration + hash journal, native CI |
| DB-03 | NOT VERIFIED | Нет Railway redeploy с постоянной БД |
| FILE-01 | NOT VERIFIED | Railway volume staged, persistence после redeploy не проверена |
| FILE-02 | PASS — код/CI | Нет файловых routes/mounts, GET/HEAD/Range=404; live Railway ещё не проверен |
| FILE-03 | PASS — CI | SHA-256 в mf_files; проверка при чтении и restore |
| AUDIT-01 | PASS — CI | Synthetic action создал audit entry |
| OUTBOX-01 | PASS — CI | Domain/audit/outbox commit и два rollback-сценария |
| SEC-01 | NOT VERIFIED | Staging DB credentials пока не созданы |
| SEC-02 | PASS для текущего пустого сервиса | Список Railway variables не содержит Agent key; код запрещает legacy key |
| SEC-03 | PASS — код/CI | Публичного OBLX endpoint нет; live deployment отсутствует |
| BACKUP-01 | PASS — процедура и CI restore | RUNBOOK + реальный изолированный restore; Railway backup/restore NOT YET VERIFIED |

## 9. Что сознательно не выполнялось

Не менялись ЛХДФ, каталог, Excel parser, qty=0, 621 PO/PE, AUTO, расчёт листов, тарифы, три скидки,
PDF, email verification flow, OBLX exporter, БАЗИС, Agent v2, фотографии, главная, 3D и scraps.
Нет production cutover, merge в main, переноса реальных заказов/пользователей или исправления бизнес-правил.
`D:\pgm`, Windows-пути и контракт `/api/orders`, pull/ack/events не затрагивались.

## 10. Rollback procedure

Подробно: `RUNBOOK.md`. Сейчас новый сервис не запущен, БД нет, staging volume только staged.
Для остановки текущей попытки не требуется откат production; можно оставить подготовку неразвёрнутой.
Если решено убрать подготовку, откатываются только pending изменения нового сервиса/volume после
проверки patch; существующие preview и их настройки не трогаются.

Будущий работающий Stage 1 откатывается на предыдущий совместимый Stage 1 commit с сохранением данных.
При необходимости restore — только в отдельную staging-копию с проверкой counts/hashes. Нельзя
восстанавливать старый dump поверх новых заказов или запускать v9 с v2 DB variables.
Preview SHA `5c97a60…` — исходная точка Git, **не runtime rollback** для Postgres-приложения.

## 11. Фактический Git diff

Проверенный changeset (без последующего evidence-only commit): **28 файлов, +2108 / −5 строк**.
Из существующего кода изменён только staging Dockerfile. Frontend, server/v9 и контрольные ветки не изменены.
397 строк `backend/main.py` — точная копия существующего Bridge, не новый production backend.

Сравнение проверенного кода:
https://github.com/artempilipeika-create/artempilipieka-create.github.io/compare/5c97a60145569b7d1df99f5fce5341587db2f75c...590eb9e2584552c12ecf394996927838eac2971e

Полный текущий diff (включая финальные доказательства):
https://github.com/artempilipeika-create/artempilipieka-create.github.io/compare/spec-v2-homepage-preview-20260922...martin-forest-v2-staging

Воспроизведение: `git diff 5c97a60145569b7d1df99f5fce5341587db2f75c martin-forest-v2-staging`.

## 12. Точка остановки

Остановлено в пределах Stage 0–1. Для завершения нужны отдельный staging Postgres, завершение настройки
private volume/secrets, deployment и реальные cloud redeploy/restore tests. До этого Stage 1 не принят.
Переход к Stage 2/3 не выполняется без следующего отдельного сообщения Артёма.
