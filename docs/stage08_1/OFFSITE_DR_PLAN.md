# Stage 8.1 — off-site recovery plan

**NOT VERIFIED: отдельное инфраструктурное восстановление не выполнялось.** Это план следующей разрешённой staging-проверки; provisioning/export/restore сейчас не выполнялись. Production не затрагивается.

## Что есть

Stage 8 реально восстановил 72 таблицы и 34 private files в отдельную DB/root, но в том же проекте/инфраструктуре. Post-checkpoint: `post-stage08-c303c2665960`; dump SHA-256 `af88150f034a430a7ebf92b08493c33b46a679c4bbe109f09fec0a6babdbf7f8`. Полные counts/hash — `../stage08/post-stage08.json`. Backup под advisory lock связывает dump и private blobs/manifest. Это не защита от потери всего проекта/аккаунта/volume.

## Предусловия и владелец

Артём и инфраструктурный администратор должны выбрать отдельный recovery account/project/provider, private off-site destination, владельца ключа расшифрования, retention и численные RPO/RTO. Сейчас эти значения не утверждены. Нельзя объявлять их выполненными. Не помещать dump, PII, ключи и private blobs в этот публичный Git.

## Выполнимая последовательность после разрешения отдельной проверки

1. Зафиксировать commit/runtime, migration checksums, Postgres major, private-storage manifest, namespace и время consistent checkpoint. Использовать только staging snapshot. Проверить полноту `database.dump`, `manifest.json`, всех `blobs/<storage_key>`; отсутствие ready-файла блокирует процедуру.
2. Зашифровать комплект; передать в независимое private хранилище с отдельным IAM и запретом public access. Проверить SHA исходного dump после обратной загрузки/расшифрования. Recovery key хранить независимо от потерянного проекта; проверить доступ вторым назначенным оператором. Секреты не включать в публичный manifest.
3. Поднять новый изолированный Postgres совместимой версии и новый private volume/storage в другом инфраструктурном контуре. Без production DSN/key, домена, Agent, SMTP/Telegram, dispatch. Namespace остаётся staging. Никаких watcher/Windows путей production.
4. Существующий `Settings` привязан к ожидаемым staging IDs. Не подделывать их и не снимать guard: заранее согласовать recovery target allowlist/конфигурацию как отдельную проверяемую работу. Пока это не сделано, готовность автоматического off-site запуска не доказана. Можно сверять raw восстановленную копию изолированным operator workflow без публикации приложения.
5. Restore только в новую пустую DB с `_restore` в имени и отдельный пустой root. `backend.v2.backup.restore` проверяет hash, namespace и запрет восстановления поверх source/nonempty target. Не менять исходную staging DB. Проверить extension/migration compatibility до app startup.
6. Сравнить все canonical table counts/hashes; jobs, fencing, runs, results, audit/outbox, immutable revisions/docs, catalogue/price snapshots и все private bytes SHA/size. Сохранять фактические нулевые final candidates/approvals; не создавать fake candidate ради проверки. Native gate остаётся CLOSED.
7. Отдельно проверить сохранность sealed data и возможность безопасного доступа с восстановленными ключами. MF_EMAIL_SEAL_KEY требует независимого escrow; одной DB недостаточно. Operational credentials/leases должны быть неактивны в recovery-копии до reconciliation. Не запускать outbox или повтор physical jobs; uncertain produce требует оператора. Восстановление старого lease не даёт права повторить производство.
8. Только в recovery-копии выполнить health, auth/isolation и private-file negative checks. Замерить фактический RPO/RTO, приложить deployment IDs, timestamps, hashes, access evidence и cleanup/retention decision. Ничего не переключать на production.

## Условия PASS

Независимый оператор восстановил из off-site комплекта при недоступности исходного проекта; проверил данные/файлы/ключи/изоляцию и измерил утверждённые RPO/RTO. Same-project restore, наличие плана или возможность скачать dump этого не доказывают.
