# Stage 3 — эксплуатация и откат

Работать только с project 6d754ad4-ba7b-45f8-8c5e-356387e7de06, environment
ee625678-c15e-452d-9761-cda99274839f, service 9aacf7bf-edd5-4f08-9423-3fbabea59268.
Техническое имя environment «production» относится к отдельному Martin Forest Site Preview.
Production project 7f59bf67-56db-4f6c-b213-c9c7b9342932 запрещён конфигурацией.

## Границы

Start command: python -m backend.v2.serve. Отдельный Postgres 18 и volume /mf-private/storage.
MF_AGENT_TRANSPORT=disabled, MF_OUTBOX_DISPATCH=disabled. Jobs остаются blocked/cancelled.
Никаких real email, БАЗИС, D:\pgm, production API/DB/Agent, ценовых расчётов или Stage 4.

Migration 0003_catalogue_imports.sql применяется только после native pre-stage03 backup:
 /mf-private/backups/pre-stage03/{database.dump,manifest.json,stage03-before.json}.
Если backup не завершён, запуск останавливается до миграции. Существующий неполный каталог
backup нельзя использовать как подтверждение; исследовать и сохранить отдельно до повторной попытки.

## Master и публикация

1. Войти через обычную staging session с verified admin и явными catalogue.import / catalogue.publish.
2. POST /api/v2/catalogue/imports: filename, content_base64, source_namespace, profile=complete_namespace_v1.
   Namespace означает ПОЛНЫЙ снимок конкретного источника/поставщика. Для частичного поставщика —
   отдельный постоянный namespace; нельзя выдавать частичный файл за полный прежний namespace.
3. Проверить GET /catalogue/imports/{id}: report, dispositions, added/inactive/changed,
   price_changes, format_changes, collisions, reasons. Pagination rows: offset/limit.
   В dry-run disposition=published означает кандидатов, которые попадут в release при публикации.
   review/excluded/duplicate не исчезают из raw ledger. error блокирует release.
4. POST /catalogue/imports/{id}/publish: expected_active_release, reason и
   accept_review_exclusion=true только после осознанного решения оставить review за пределами release.
   Raw источника находится в internal mf_files, не выдаётся web gateway даже admin.
5. Release, items и prices неизменяемы; seal запрещает последующие INSERT/UPDATE/DELETE items/prices.
   Active pointer переключается вместе с audit/outbox одной транзакцией.
6. GET /catalogue/releases/{id}/data.js возвращает generated cache, ETag и X-Content-SHA256.
   backend.v2.catalogue.verify_cache проверяет байтовое совпадение с release и отвергает drift.
   Legacy public/data.js сохранён как исторический код и НЕ включён в новый staging image.
   Ручное редактирование legacy data.js не управляет новым каталогом.

Unknown manufacturer/decor/structure не угадываются. Семейство HDF не означает подтверждённое
ламинирование. Отсутствующий артикул остаётся null. M2 с неподтверждённой единицей/геометрией —
review. Стоимость D — private provenance, currency/VAT/purpose/approved_profile=NULL (NC-05);
ноль не означает бесплатно, материал клиента или доверенную цену.

## Excel и drafts

Все write routes: trusted Origin, application/json, текущая session, explicit permission + scope.
- templates: POST /import-templates и /import-templates/{id}/revisions.
  Immutable definition: headers fingerprint, sheet policy, mapping, inheritance, edge dictionary, units.
- POST /imports/preview требует order_id и template_revision_id. Пустой explicit sheet selection
  возвращает доступные листы; выбор не выполняется молча.
- GET /imports/{id} хранит полный отчёт, включая blank/service/problematic.
- POST /imports/{id}/rows/{row_id}/resolution — явный вариант или явная собственность клиента,
  причина обязательна. Автоматический exact не выводится из search.
- POST /imports/{id}/confirm с mode=add/replace/new_revision и If-Match версии заказа.
  Повтор тех же bytes/template/sheets/release возвращает тот же import_id; confirm идемпотентен.
  new_revision сохраняет immutable draft checkpoint до применения нового импорта; это НЕ submit.
- GET /orders/{id}/draft/rows — снимки и индикатор нового каталога.
- material / edges / auto / exclude под /orders/{id}/draft/rows/{row_id} — отдельные
  явные действия с reason и If-Match. Manual NONE защищён как manual SKU.
- GET /orders/{id}/draft/catalogue-update показывает diff; POST с release_id и reason
  явно обновляет доступные exact variants. Отсутствующий вариант сохраняет старый pinned snapshot,
  получает предупреждение; заменитель не подбирается.
- POST /imports/{id}/replay повторяет исходный файл по старой immutable template revision.
- Submit и approve остаются закрыты прежними business gates.

## Backup / restore

Рабочие команды (внутри staging container; credentials уже в изолированном environment):

    python -m backend.v2.backup backup /mf-private/backups/manual-UNIQUE

Точный CLI смотреть: python -m backend.v2.backup --help.
Native custom-format dump + все зарегистрированные bytes + SHA manifest снимаются под
exclusive backup advisory lock. API writers держат shared lock. Telegram не участвует.

Restore разрешён только в НОВУЮ пустую БД, имя содержит _restore, и в отдельный пустой каталог.
Использовать backend.v2.backup.restore(target_settings, backup_directory), где target_settings
ссылается на НОВОЕ имя staging DB и отдельный storage_root. Функция отвергает исходную БД,
непустую БД/storage, несовпадающий namespace и checksum; pg_restore --single-transaction.
Проверить actual file bytes, SHA, active release, raw row counts и старые snapshots.
Backup на том же volume — проверка восстановления, не доказательство off-site disaster recovery.

MF_STAGE03_OPERATOR_MODE=bootstrap — только явно заданная временная синтетическая
@example.invalid учётная запись с новым случайным password минимум 32 символа. Использует
обычную Stage 2 registration/verification инфраструктуру через private fake email collector.
Пароль никогда не выводится в logs. После импорта режим retire_restore отзывает session/grants,
отключает account, уничтожает рабочий password hash, снимает новый backup и реально восстанавливает
отдельную mf_staging_restore_stage03_* DB и отдельные bytes. Evidence:
 /mf-private/stage03-restore-evidence.json.
После проверки вернуть mode=off и очистить временный password. Это не постоянная admin учётная запись.

## Rollback

- Ошибка содержания каталога: POST /catalogue/releases/{previous_release}/activate с verified admin,
  catalogue.publish и причиной. Меняется только pointer; draft/revision snapshots остаются прежними.
- Ошибка нового приложения: выключить MF_SECURITY_API и сохранить текущий backup.
  Не запускать Stage 2 runtime поверх БД с неизвестной ему migration 0003.
- Полный возврат к Stage 2: восстановить pre-stage03 dump + bytes в отдельную staging копию;
  проверить её, затем перенастроить ТОЛЬКО staging app на эту копию и её private storage root,
  закрепить source commit 3ff1752469f189f0e13191dcfe01a5e8033abff8.
  Существующая Stage 3 DB/volume сохраняется для расследования. Down migration отсутствует намеренно.
- Production cutover, destructive restore поверх рабочей DB и изменения защищённых services запрещены.

## Ограничения

Клиентский UI не монтировался и не перерабатывался. Stage 3 предоставляет API и данные;
visual preview остаётся на прежнем commit. Нет guessed manufacturer mapping, конвертации
неподтверждённых unit profiles или бизнес-разрешения review строк. Такие строки сохраняются
для отдельного решения каталога. Нет вычисления формул Excel, macros или external links.
