# Martin Forest — Stage 8.4: ручные файлы заказа

Дата: 24.09.2026. Только staging. Передано на приёмку пользователю; Stage 9 не начат.

## Контрольная точка

| Параметр | Значение |
|---|---|
| Ветка | `martin-forest-v2-staging` |
| Принятый Stage 8.3 HEAD | `1d20047f6b00c62de27f38300fbf6d259a86bb92` |
| Реализация / tested runtime | `9b711864ab546cf49c25fedbcd2005412754f69b` |
| Runtime основной live-проверки | `23cf841d89b91e206b69d7e072ddb15e77ece07d` |
| Railway live acceptance | `26165f87-329e-4f9b-943f-f140d342ce95` |
| Финальный Railway deployment | `aea2dfb9-a26f-4531-bbc6-63cd507822d4` — **SUCCESS**, обычный `python -m backend.v2.serve` |
| Финальный CI | [35994141866](https://github.com/artempilipeika-create/artempilipieka-create.github.io/actions/runs/35994141866) — **291 PASS / 0 FAIL / 0 SKIP** |
| Native gate | **CLOSED / NOT VERIFIED** |
| Stage 9 | **BLOCKED / NOT STARTED** |

Финальный HEAD с этим отчётом — документационный потомок tested runtime; точный SHA передан в итоговом сообщении. Исполняемые файлы документационный коммит не меняет.

Staging: https://martin-forest-v2-staging-production.up.railway.app/staff . Railway project `6d754ad4-ba7b-45f8-8c5e-356387e7de06`, service `9aacf7bf-edd5-4f08-9423-3fbabea59268`, environment `ee625678-c15e-452d-9761-cda99274839f`. Название Railway environment — `production`, но это отдельный **Martin Forest Site Preview**, не production Bridge.

## Что реализовано

В рабочем кабинете и карточке заказа есть «Файлы заказа»: выбор файла, явный тип, видимость, короткий внутренний комментарий и список со скачиванием. Список показывает имя, категорию, размер, загрузившего, дату/время, видимость и состояние сохранения. В клиентском кабинете видны только разрешённые вложения своего заказа, без внутренних комментариев и персональных данных сотрудника.

Каждая загрузка создаёт новый file ID и private storage key. Старые файлы с таким же именем остаются доступными в истории. SHA-256 зависит от содержимого: одинаковые байты имеют одинаковый SHA, но разные записи. Редактирование видимости и hard-delete на этом этапе не добавлены.

Загрузка не меняет статус заказа, согласование, оплату, расчёт, native status или production status; не создаёт job, final candidate, approval или produce authorization. Ручной OBLX не становится производственным результатом и не подменяет прежний `/orders/{id}/oblx` alias.

При начале работы обнаружен уже существовавший коммит `d33cfb9…` с частичной реализацией Stage 8.4 и упавшей браузерной проверкой. Работа продолжена поверх него. Исправлена доступность кнопок во время загрузки интерфейса, добавлены время и безопасная клиентская таблица. Финальная проверка обычного XLS выявила отклонение нулевого заполнения после BIFF EOF; это исправлено в tested runtime и закреплено отдельным тестом.

## Архитектура и миграция

Подробный аудит: [ARCHITECTURE_AUDIT.md](ARCHITECTURE_AUDIT.md).

Переиспользованы `VolumeStore`, существующий приватный Railway volume `/mf-private`, `mf_files`, двухфазный `save_private_file`, `read_verified`, общий GET/HEAD/preview download gateway, order/revision bindings, RBAC, `record_event`, audit/outbox и backup/restore. Второе хранилище и public static URL не создавались.

Миграция **`0007_manual_attachments.sql`** добавляет `kind=attachment`, таблицу метаданных `mf_order_attachments`, три разрешения и ограничения неизменяемости/привязки. Canonical `classification=private/internal` сохранена. Предварительные документы продолжают использовать отдельную существующую модель `mf_documents`; ручной PDF не получает её расчётный или согласованный статус. Manager-assisted intake, исходный Excel, raw rows и provenance не заменены.

Запись ready появляется только после записи/проверки байтов и успешной транзакции привязки. При сбое остаётся failed manifest для сверки, без готового вложения в списке. При отзыве разрешения во время записи повторная проверка запрещает ready commit.

## Права

Для всех действий сервер заново проверяет состояние аккаунта, роль, разрешение и актуальный scope. Новые разрешения не выдаются существующим сотрудникам автоматически.

| Роль | Чтение | Загрузка |
|---|---|---|
| Manager | Только назначенный/разрешённый заказ; `orders.read` + `files.attachments.read`; internal требует `files.attachments.internal.read`, OBLX также `orders.oblx.read` и подтверждённую почту | `files.attachments.upload` + права чтения + подтверждённая почта |
| Admin | Те же точные разрешения, в существующем all/order scope | По выданным разрешениям |
| Client | Собственный заказ + `files.source.read`, только явный `client_visible` | Новый staff endpoint запрещён; прежний intake сохранён |
| Viewer/accounting | Явное разрешение чтения конкретного заказа; internal manual files закрыты | Запрещена |
| Production | Только по существующим ограничениям order/job и дополнительным attachment grants; обхода через роль нет | Запрещена |
| Blocked/disabled staff, service Agent | Запрещено | Запрещена |

## Форматы, классификация и видимость

Категории: `source`, `drawing`, `image`, `document`, `internal_working`, `production_internal`, `oblx`, `other`. Названия интерфейса — по-русски. Категория задаётся явно, а содержимое независимо проверяется сервером.

Видимость: `staff_internal` по умолчанию; `client_visible` только по явному выбору для допустимых файлов; `production_internal` для OBLX/производственных вложений. OBLX определяется по содержимому независимо от имени, MIME и указанной категории. Внутренние категории нельзя открыть клиенту.

**Форматы:** XLSX, XLS, CSV, PDF, OBLX, PNG, JPG/JPEG, WebP, TXT, DOCX. **Максимум: 10 MiB = 10 485 760 байт**; лимит JSON/base64 запроса — 14 MiB. MIME проверяется на сервере. DOC, DWG/DXF и общие архивы не включены. Исполняемые файлы/скрипты запрещены; содержимое не выполняется.

Office с макросами, вложенными/внешними активными объектами или шифрованием отклоняется. PDF с активными действиями, шифрованием или `ObjStm` пока отклоняется. Поддержка безопасного поднабора не означает поддержку всех вариантов Office/PDF. TXT/CSV — UTF-8/UTF-16.

Downloads требуют авторизации, используют attachment disposition, безопасное имя, `nosniff`, sandbox CSP, `Cache-Control: no-store`. Range сохраняет прежнее поведение: полный ответ 200 только после проверки прав, `Accept-Ranges: none`. Public storage paths не выдаются.

## CI и security evidence

Первый полный успешный прогон основной реализации: [35993062268](https://github.com/artempilipeika-create/artempilipieka-create.github.io/actions/runs/35993062268), **290 PASS / 0 FAIL / 0 SKIP**. Все прежние 248 тестов сохранены без изменения assertions; добавлены 40 серверных/операторских и 2 браузерные проверки. Финальный прогон дополнительно включает обычный XLS с нулевым заполнением секторов.

[ci-final.json](ci-final.json) содержит финальные job IDs и фактические сводки: прежние 248 + 41 новых серверных/операторских + 2 новых браузерных теста. [ci.json](ci.json), [browser-results.xml](browser-results.xml) и [скриншоты](screenshots/) относятся к runtime основной проверки. [ci-acceptance-contract.json](ci-acceptance-contract.json) — отдельная проверка оператора в ASGI/Postgres; она явно **не является live HTTPS evidence**.

Покрыты все 18 требуемых групп: назначенный/чужой order, запрет staff upload клиенту, owner/foreign PDF, internal deny, OBLX GET/HEAD/Range и aliases, переименование, два immutable ID, storage failure, revoke во время записи и при чтении, blocked staff, executable/active/archive reject, traversal, отсутствие workflow mutations, реальный backup/restore. Дополнительно проверены role ceilings, неполная binding, cross-order revision, офисные/графические форматы, UI upload и клиентская проекция на 360/1440 px. Прежняя браузерная серия также проверяет 768 px.

## Живой staging

[live-evidence.json](live-evidence.json): **70 HTTP assertions**, все ожидаемые ответы получены. Один synthetic order: `8dbf6bd8-e759-4869-821c-9b9ff6dae2ba`.

| Файл | Результат |
|---|---|
| `drawing.pdf`, явный client-visible | Владелец скачивает; чужой клиент получает 403 |
| Второй `drawing.pdf` | Другой immutable ID; только сотрудникам |
| `final.pdf` с OBLX XML | Определён как OBLX, принудительно production-internal |
| `ready.oblx` | Только internal, клиенту запрещены все проверенные aliases |
| `sketch.png` | Сохранён как внутреннее изображение |

Полный order row до/после загрузок совпал. Новых revisions, calculations, documents, production jobs и final candidates у этого заказа нет. Все 34 прежних private файла остались неизменными. Четыре временные учётные записи отключены; сессии и grants отозваны, временная admin role удалена.

Live-проверка выполнена на `23cf841…`. Последующий `9b711864…` меняет только обработку нулевого заполнения XLS и добавляет соответствующий fixture/test. Его отдельная XLS-загрузка по живому HTTPS **NOT VERIFIED**; проверка XLS через API входит в финальный CI. Остальная реализация live-проверки совпадает.

## Backup/restore и сохранность

До миграции: [pre-stage84.json](pre-stage84.json), **72 таблицы / 34 файла**, dump SHA-256 `beaa5b7e48ae468aab32d3bd4d8ae1262a219b1e0fc1ceafbe461db4d1163b8d`.

После acceptance и отключения identities: [post-stage84.json](post-stage84.json), **73 таблицы / 39 файлов**, dump SHA-256 `dc31b0ed4d5f6a40b250cd9236b51ce0b9a22d7ee49d77bc8262444b992265c2`. Выполнен настоящий restore в новую базу `mf_staging_restore_stage84_db2e2fa129c7` и отдельный private root. Все canonical snapshots, file manifests и байтовые SHA совпали с рабочей staging. Рабочая база восстановлением не перезаписывалась.

[persistence.json](persistence.json): после повторного deployment `db8cdf38…` повторно проверены те же 73 таблицы и 39 файлов. Railway `redeploy` использовал предыдущий snapshot с acceptance entrypoint; сохранённый результат предотвратил повторное создание данных. Обычный `python -m backend.v2.serve` восстановлен новым configuration deployment, подтверждён startup logs.

Изменились только synthetic users/roles/grants/sessions, один заказ и его assignment, пять файлов/attachments, rate events, audit/outbox, плюс миграция/определения permissions. Catalogue, prices/defaults, расчёты, revisions, production/native tables не изменились.

## Actual Git diff и rollback

[ACTUAL_GIT_DIFF.patch](ACTUAL_GIT_DIFF.patch) — фактический diff исполняемого кода и тестов от Stage 8.3 до tested runtime. [changed-files.txt](changed-files.txt) — полный список, [diff-stat.txt](diff-stat.txt) — статистика. Документы и evidence текущего отчёта находятся только в `docs/stage08_4/`. Производственные ветки, main и визуальные preview не менялись.

**Откат с учётом схемы:** старый runtime не следует просто запускать на схеме 0007: существующий migration guard отклонит неизвестную ему миграцию. Не удалять новую таблицу/файлы и не переписывать journal.

1. При проблеме остановить ручные записи в staging отзывом upload grants; сохранить post-stage84 backup и все новые байты.
2. Для возврата к старой версии восстановить `/mf-private/backups/pre-stage84` только в **новую пустую** staging-базу с `_restore` в имени и отдельный private root. Проверить snapshot и SHA через существующие `restore`/`verify`.
3. Лишь после проверки переключить **только staging** на эту копию и прежний runtime `bc6b96101a9eaf88732e1342eaf18c2579e6a385` с `python -m backend.v2.serve`. Исходная staging с пятью вложениями и post-backup сохраняются; это не hard-delete истории.
4. Альтернатива без возврата данных — совместимый со схемой 0007 исправляющий релиз. Такие действия описаны, но не выполнялись.

## Production и NOT VERIFIED

[environment.json](environment.json) и [protected-before.json](protected-before.json) фиксируют границы. Production Bridge deployment `dc09ba1c-7182-481d-8c62-4a9e721461c2` и production Postgres deployment `168b0c29-6693-433f-9a85-552f9de65b37` неизменны. Производственную БД/данные не читали и не изменяли; прямую побайтовую сверку production DB не заявляем. Ветка main, baseline и Bridge refs сохранены.

БАЗИС, Windows, `D:\pgm`, Resilio, Calibration Kit и подключение Agent не запускались. Все native counters остаются нулевыми: calibrations, verified results, final candidates, produce jobs. Existing staging protocol endpoint configuration не изменена; transport/outbox dispatch выключены.

**NOT VERIFIED:** native calibration/БАЗИС и производственный запуск; production cutover/Stage 9; off-site disaster recovery; полная совместимость со всеми разновидностями Office/PDF; реальный Windows browser upload сотрудника; authenticated live browser screenshots (UI проверен в CI, live transport — HTTPS); live XLS после финального точечного исправления; выдача новых grants постоянным сотрудникам и их рабочая приёмка. Ранее открытые Stage 8.1–8.3 business/native ограничения этим этапом не закрываются.

На Stage 8.4 работа останавливается.
