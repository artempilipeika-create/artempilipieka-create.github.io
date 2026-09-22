# Martin Forest — Stage 2

Дата: 2026-09-22. Основа: завершённый Stage 0–1, commit `49e291bfa4eca0da3fba8fb4694deba08df72cd7`.
Источники: SPEC v2 FINAL (G/H/I/L/O/P/Q), AUDIT EVIDENCE и приложенное задание Stage 2.

**Stage 2 развёрнут:** runtime `3ff1752469f189f0e13191dcfe01a5e8033abff8`, deployment
`8da85a05-c69d-4a79-b569-a57e34212b3d` — **SUCCESS**, Railway `/health` — PASS.
Probe modes выключены, port/domain = 8000. См. deployment-evidence.json.

## 1. Git и контрольные точки

Ветка: `martin-forest-v2-staging`. Production merge/cutover не выполнялся.

| Commit | Содержание |
|---|---|
| `10fb431cbc59d98376e839a01779982ac090e801` | Migration 0002, auth, permissions/scopes, staff, manager assignment, email, OBLX gateway, API tests |
| `f238c95347a231540f8e7d0e7a6e23eaea1d6755` | Role ceilings, совместимость v9 password hash, operator bootstrap, backup и Railway security/restore probe |
| `dd7b2362ba04a1cc2ceb34a7c6357ab49ef3e10b` | Pagination только по разрешённым записям; диагностика startup |
| `3ff1752469f189f0e13191dcfe01a5e8033abff8` | Единый Python entrypoint для миграции и HTTP server |

Контрольные SHA после изменений:

- baseline: `4fb9d5ceb146480be540a39b454119ea84daa98f`;
- visual preview: `5c97a60145569b7d1df99f5fce5341587db2f75c`;
- production Bridge: `2031c09c2f9d8690cb75856b0a4cadb1533a411b`;
- main: `470776dfd3efd1db9638668d2e19ea174b7901cc` — не изменялся этой работой.

Production deployment IDs остались прежними:
Bridge `dc09ba1c-7182-481d-8c62-4a9e721461c2`, Postgres `168b0c29-6693-433f-9a85-552f9de65b37`.
Не читались production secrets и реальные orders. Production Agent/Windows не опрашивались и не изменялись.

## 2. Railway и изменённые файлы

Использована существующая инфраструктура Stage 1:

| Объект | Значение |
|---|---|
| Project | Martin Forest Site Preview, `6d754ad4-ba7b-45f8-8c5e-356387e7de06` |
| Environment | `ee625678-c15e-452d-9761-cda99274839f` (техническое имя Railway: production; это отдельный preview project) |
| Staging app | `9aacf7bf-edd5-4f08-9423-3fbabea59268` |
| Staging Postgres 18 | `e773c03c-1f76-4f78-adb7-2132528c3a19` |
| Private volume | `29b79637-3f45-4ddd-ad2c-028d6b96af8e`, `/mf-private/storage` |
| HTTPS origin | https://martin-forest-v2-staging-production.up.railway.app |
| Start command | `python -m backend.v2.serve` |

Новые файлы backend/v2: `security.py`, `auth_api.py`, `domain_api.py`, `mail.py`, `operator.py`,
`startup.py`, `serve.py`, `smoke.py`, `migrations/0002_auth_security.sql`.
Изменены `app.py`, `rbac.py`, requirements и staging Dockerfile. Добавлены tests/stage02 и test policy fixture;
Stage 1 tests адаптированы к двум миграциям и появлению защищённых API. CI запускает оба набора.
Документы и доказательства — docs/stage02. Legacy backend, frontend, экспортёры и public assets не менялись и не включены в staging image.

Добавлены отдельные `MF_EMAIL_SEAL_KEY`, `MF_WEB_ORIGIN`, `MF_SECURITY_API`, disabled-by-default Stage 2 probe.
Agent key отсутствует. Transport/dispatch остаются disabled, outbox paused, jobs blocked/cancelled.

## 3. Migration и данные

`0001_foundation.sql` не изменена. Expand-only `0002_auth_security.sql`:

- mf_users: email_version, verification_migration_state; ни один старый email автоматически не подтверждается;
- mf_email_verifications: email_version, purpose, revoked_at; existing consumed_at — атомарный used marker;
- новые permissions, включая `users.roles.write`; существующие определения сохранены;
- новые `mf_rate_events` и `mf_email_deliveries`;
- immutable file identity trigger: нельзя понизить kind/classification, изменить привязки/hash/storage key через UPDATE.

Всего 19 таблиц с migration journal: mf_environment, mf_users, mf_sessions, mf_email_verifications,
mf_roles, mf_permissions, mf_user_roles, mf_permission_grants, mf_orders, mf_order_revisions,
mf_manager_assignments, mf_production_jobs, mf_files, mf_audit, mf_outbox, mf_job_events,
mf_schema_migrations, mf_rate_events, mf_email_deliveries.

Никакого SQLite fallback или подключения v9 к production DB. Реальные пользователи не импортировались.
Хеш v9 `pbkdf2_sha256$260000$…` поддерживается и обновляется после успешного login без plaintext migration.

## 4. API endpoints

Все ниже под `/api/v2`, кроме страницы подтверждения. POST/PUT/PATCH/DELETE требуют trusted Origin и JSON (DELETE без body допустим).

| Method | Path | Результат |
|---|---|---|
| POST | /auth/register | Только client, explicit own grants, unverified, session + encrypted mail intent |
| POST | /auth/login | Postgres session; ротация текущей cookie |
| GET | /auth/me | Safe identity, account/email state, разрешённые общие capabilities |
| POST | /auth/logout | Revoke текущей session |
| POST | /auth/email-verification/request | Resend с cooldown/limits и отзывом старых token |
| POST | /auth/email-verification/confirm | Atomic one-time confirmation |
| POST | /auth/email/change | Password reauth, новая email_version, отзыв token и всех sessions, новая session |
| GET | /verify-email | Самостоятельная страница; GET не подтверждает адрес |
| POST / GET | /orders | Минимальный draft / список разрешённых заказов |
| GET | /orders/{id} | Role-specific allow-listed DTO |
| PATCH | /orders/{id}/draft | Metadata save с обязательным If-Match |
| POST | /orders/{id}/submit, /approve | Проверки permission/scope/email; дальнейший business gate закрыт |
| GET | /orders/{id}/history | Безопасная клиентская история draft events |
| POST / GET | /orders/{id}/assign-manager, /assignments | Admin assignment / append-only history |
| POST / GET | /admin/staff | Создать сотрудника без grants / список staff |
| PUT | /admin/staff/{id}/role, /state | Role change + revoke старых grants; block/unblock |
| POST | /admin/staff/{id}/grants | Explicit permission и scope, без wildcard |
| DELETE | /admin/staff/{id}/grants/{grant_id} | Immediate revoke |
| GET | /admin/audit | Explicit admin audit permission |
| GET / HEAD | /files/{id}, /download, /preview | Один gateway с текущими правами и manifest classification |
| GET / HEAD | /orders/{id}/oblx | Client hard deny до раскрытия существования artifact |

Для verified submit возвращает `409 PACKAGE_NOT_READY`, approve — `409 CALCULATION_INCOMPLETE`:
проверенный source/revision/calculation из следующих этапов ещё не существует. Это security gate, не реализация Stage 3 submission.

## 5. Фактическая permission matrix

В каждой разрешённой ячейке дополнительно нужен **явный действующий grant**. Role сама права не даёт.
`all` действует только для единственной роли admin. Client получает фиксированный список own grants при регистрации.

| Роль | Orders / scope | Изменения | Документы / OBLX | DTO |
|---|---|---|---|---|
| client | Только owner, own grant | Own draft до submit; submit/approve требуют verified | Только свой исходный upload и preliminary PDF; OBLX/internal **всегда DENY** | Свои общие поля; нет internal JSON/artifact metadata |
| manager | Current assigned либо конкретный order grant | Draft gates по permissions; без staff/assignment admin operations | Source/PDF/OBLX по текущему scope и отдельному permission; OBLX требует verified | Общие поля, current manager; PII отдельно через customers.pii.read |
| production | Конкретный job grant, связанный с order | Нет draft/staff операций или выполнения jobs | Только явно разрешённый blocked synthetic job artifact; cancelled отвергается | Order/status/revision, без business_name/цен/PII |
| accounting | Конкретный order grant | Нет draft/staff | Preliminary PDF по grant; OBLX только отдельный grant + scope + verified | Minimal finance projection; financial_state=not_available, суммы не выдумываются |
| viewer | Конкретный order grant | Нет draft/staff | PDF/OBLX только отдельный grant + scope; OBLX требует verified | Минимальные id/status/version/time |
| admin | Явные permissions, all/order scopes | Staff/roles/grants/assignment только с соответствующими permissions и verified | Отдельные file permissions; internal mail sink через web недоступен даже admin | Разрешённые общие поля; PII через permission |
| service_agent | Browser login DENY | DENY | DENY, пока нет безопасного lease/credential transport | Нет browser DTO |

Production job grants в Stage 2 дают только review synthetic artifact и не означают разрешение исполнения.
Service Agent не получает небезопасного альтернативного browser-token механизма: lease-bound доступ оставлен закрытым до отдельного этапа Agent.
`orders.revision.create`, `orders.prices.read` подготовлены как permissions; бизнес-редакции/цены здесь не реализованы.
Blocked client может читать разрешённую собственную историю; изменения запрещены. Blocked staff теряет доступ немедленно, sessions отзываются.

## 6. Manager assignment

Admin + orders.assign_manager + scope + verified → row lock заказа → проверка active manager → новая mf_manager_assignments
(previous/new/actor/time/reason) → обновление current assignment/version → audit + outbox **одна транзакция**.
Прежняя запись не меняется. Старый manager с ещё действительной cookie получает 403 на следующий запрос;
другой explicit order scope остаётся отдельным основанием доступа. Это проверено API test на Postgres и Railway probe для file download.

## 7. Email и sessions

Регистрация → mf_users + SHA-256 token digest + encrypted delivery intent + audit/outbox в одной транзакции.
Token: 32 random bytes; purpose/email/email_version binding; TTL 24h, cooldown 60s, 5/hour, 20/day/account.
Дополнительный network budget и login/confirm rate limiting. Все значения в WebPolicy.
Plaintext token отсутствует в DB/audit; сообщение в mf_email_deliveries зашифровано отдельным staging Fernet key.

Явный FakeCollector расшифровывает только локальное сообщение и сохраняет его private mf_files artifact с SHA-256.
После ошибки collector queued intent остаётся повторяемым; внешней отправки нет. Outbox dispatch не включается.
URL строится из trusted origin, token — в fragment, не query. Страница очищает URL, не загружает внешние ресурсы,
использует CSP nonce/no-referrer; подтверждение только POST. Uvicorn access log отключён.

Confirm блокирует user, атомарно потребляет token только для текущей email_version и создаёт единственный audit effect.
Resend/email change отзывают старые tokens. Email change требует пароль и отзывает старые sessions.
Session cookie: Secure/HttpOnly/SameSite=Lax, host-only, 7 дней; DB хранит только digest. localStorage не используется.

## 8. OBLX и legacy

Client hard deny действует в policy и gateway независимо от владения, случайно выданного grant, filename/MIME/query/Range.
Synthetic OBLX сохранён под видом `.txt`/text/plain и остаётся запрещённым client.
HEAD/download/preview используют ту же авторизацию. Range не выдаёт кусок без неё: допустимый ответ — полный 200, Accept-Ranges:none.
Download всегда attachment/octet-stream, не активный inline HTML/SVG.

DTO строятся по allow-list и не сериализуют revision.content, arbitrary payload, storage key, OBLX URL, manifest или internal comments.
ZIP/bulk/alternate/legacy routers не реализованы и недоступны. public/static/objects не монтируются.
Legacy v9 auth/orders/admin/OBLX/Agent routes не включены в image/router. Legacy frontend/exporter также не обслуживается:
client OBLX-кнопок и browser exporter в **этом staging приложении** нет. Старый visual preview остаётся отдельным неизменённым сервисом.

## 9. Audit / outbox

Staff create, role change, grant/revoke, block/unblock, assignment/reassignment, email confirm/change и успешный sensitive file access
пишут audit/outbox. Passwords, verification/session tokens, DSN и email message body туда не передаются.
Role change отзывает прежние grants и записывает old/new roles в безопасную audit reason. Permission grant остаётся отдельной записью.
Append-only triggers Stage 1 сохранены. Нет production destination или автоматической отправки событий.
Denied privileged actions возвращают machine code; отдельное журналирование каждого deny не включалось.

## 10. Выполненные проверки

- Native Postgres CI: auth/cookies/logout, privilege injection, expiry/revocation/concurrent token confirm, resend/hour/day/network limits,
  email change, legacy password rehash, own/assigned scopes, independent old sessions после revoke/reassign/block,
  accounting/viewer DTO, OBLX explicit scopes/HEAD/Range/MIME, protected classification, no legacy bypass,
  audit/outbox atomicity, migration drift, immutable history/revisions, private storage integrity, backup/restore.
- Первый Stage 2 run: 42 passed / 2 failed в test harness (смена аккаунта отзывала cookie до проверки revoke/reassign).
  Исправлен тест: используются независимые сохранённые sessions, без ослабления HTTP assertions.
- Финальный run `35794887007` на `3ff1752…`: **48 passed, 0 failed, 0 skipped**, Postgres 17.
  Доказательства и названия тестов: ci-evidence.json. Run `35794128909`: 46 passed; `35794747746`: pagination regression прошёл.
- Railway probe deployment `1f659e98-3ca8-42b0-8dc4-20b04c6e52eb`: 7 групп реальных ASGI API-проверок с live staging Postgres/volume,
  плюс проверка сохранности Stage 1. Доказательства: railway-evidence.json.
- Probe создавал только synthetic identities; все 4 отключены, sessions/grants отозваны. Ни одного default admin нет.
- Два промежуточных deploy на `f238c95…` не прошли HTTP healthcheck после успешных probe/restore.
  Запуск заменён единым `python -m backend.v2.serve`; исправлены порт сервера и targetPort домена.
  Последующие deployment `dacad92b…` и финальный `8da85a05…` получили SUCCESS.
- External HTTPS smoke 23:02:19Z: /health 200, /api/v2/auth/me 401, legacy /api/orders 404, /verify-email 200;
  noindex/no-store/no-referrer/nosniff/DENY присутствуют. См. https-evidence.json.
- Полные browser/E2E тесты клиентского интерфейса не выполнялись: этот этап предоставляет API и минимальную verify-email page.

## 11. Acceptance matrix

PASS ниже означает проверку на настоящем Postgres, не mocked DB. Railway subset указан отдельно в evidence.

| ID | Результат | Основание |
|---|---|---|
| AUTH-01 | PASS | Privilege fields rejected; только client |
| AUTH-02 | PASS | Login/session request flow, Postgres |
| AUTH-03 | PASS | Logout cookie digest revoked |
| AUTH-04 | PASS | Old staff session blocked/revoked, file access denied |
| EMAIL-01 | PASS | Unverified login/draft/save; submit/approve 403 EMAIL_NOT_VERIFIED |
| EMAIL-02 | PASS | Fake sink → правильный email/version → confirm |
| EMAIL-03 | PASS | Replay 400, concurrency ровно один 200 и один audit effect |
| EMAIL-04 | PASS | Expired/revoked token rejected |
| EMAIL-05 | PASS | Cooldown/hour/day/network limits |
| EMAIL-06 | PASS | Email change rejects old token; новый подтверждает новый email |
| RBAC-01 | PASS | Owner scope, blocked client read-only |
| RBAC-02 | PASS | Current manager assignment + grant |
| RBAC-03 | PASS | Reassign immediately denies old manager with valid cookie |
| RBAC-04 | PASS | Accounting/viewer allow-listed projections |
| RBAC-05 | PASS | Revoke changes next request without cookie expiry |
| RBAC-06 | PASS | Staff create/role/grant/revoke with audit |
| OBLX-01 | PASS | Own client file → 403 even with injected grant |
| OBLX-02 | PASS | Legacy route unavailable |
| OBLX-03 | PASS | HEAD/Range/download/preview/MIME/query/alternate routes |
| OBLX-04 | PASS | Assigned manager + permission + verified → synthetic file |
| OBLX-05 | PASS | Foreign manager denied |
| OBLX-06 | PASS | Explicit production job artifact scope; wrong job denied |
| OBLX-07 | PASS | Accounting/viewer without separate grant denied |
| OBLX-08 | PASS | DTO excludes payload, URL, metadata |
| MANAGER-01 | PASS | Admin assignment API |
| MANAGER-02 | PASS | Previous/new/actor/reason/time retained |
| MANAGER-03 | PASS | Reassignment appends history |
| LEGACY-01 | PASS | Routers/exporter/static bypasses unmounted |
| AUDIT-01 | PASS | Audited transactional staff/access/assignment writes |

NOT VERIFIED: real email-provider delivery (NC-07 open), production Agent interaction, browser frontend flow,
Railway platform-native snapshot restore and off-volume disaster recovery. Эти возможности не включались.

## 12. Backup / rollback

Перед migration 0002 создан `/mf-private/backups/pre-stage02`:
DB SHA-256 `fd8056b92469de7cbe67285351bd67d1e28800e907aaf666d98ef2f598fe5114`, 1 private file.

Реальный Railway restore Stage 2:

- dump SHA-256 `fb2964c32e38b0c90a349dfe8afce49f66d02ac787c51cd47d14eb1a5568e7e4`;
- исходная копия: `/mf-private/backups/stage02-9c1da2f15ea6422bab240b8c8a99b164`;
- отдельная целевая DB: `mf_staging_restore_stage02_9c1da2f15ea6`;
- отдельная директория private bytes; восстановлены 3 файла;
- запись заказа `78b05015-e11c-40f4-84a6-40b83310748e` и байты файла `9f877603-1129-442d-84da-c7e4e22a741f` прочитаны из копии;
- основной staging app не переключался на restore DB.

Быстрый rollback: `MF_SECURITY_API=disabled`, probe modes off, redeploy текущего совместимого Stage 2 build.
Полный возврат Stage 1 — только pre-migration restore в **новую** staging DB/private directory и старый runtime;
Stage 1 fail-closed runner не примет схему с migration 0002. Production не участвует. Подробно: RUNBOOK.md.

## 13. Что сознательно не выполнялось

Нет изменений ЛХДФ, каталога, Excel/parser, qty=0, 621 PO/PE, AUTO, раскроя/расчёта листов, тарифов/скидок/цен,
PDF, OBLX exporter, БАЗИС, Agent v2, Windows paths/D:\pgm, дизайна, фотографий, 3D/scraps.
Нет реальных заказов, писем клиентам, Telegram, production jobs, production schema/deployment change, merge в main.
Полная админка/кабинет/frontend и реальный email provider остаются за пределами этапа.

## 14. Фактический Git diff

Проверенный code changeset относительно Stage 1: **18 файлов, +1520 / −38 строк** (до финального documentation/evidence commit).
Финальный changeset с документацией: 25 files changed, 2112 insertions(+), 38 deletions(-).
Полный diff к финальному HEAD: https://github.com/artempilipeika-create/artempilipieka-create.github.io/compare/49e291bfa4eca0da3fba8fb4694deba08df72cd7...martin-forest-v2-staging

Code diff:
https://github.com/artempilipeika-create/artempilipieka-create.github.io/compare/49e291bfa4eca0da3fba8fb4694deba08df72cd7...3ff1752469f189f0e13191dcfe01a5e8033abff8

Воспроизведение:

```sh
git diff --stat 49e291bfa4eca0da3fba8fb4694deba08df72cd7 3ff1752469f189f0e13191dcfe01a5e8033abff8
git diff 49e291bfa4eca0da3fba8fb4694deba08df72cd7 3ff1752469f189f0e13191dcfe01a5e8033abff8
```

После завершения Stage 2 работа останавливается. Stage 3 не начинается без следующего отдельного сообщения Артёма.
