# STAGE 7 — UI / DESIGN

Дата: 2026-09-23. Ветка: `martin-forest-v2-staging`.
Статус: реализация и evidence передаются на приёмку пользователя. Stage 7 самостоятельно принятым не объявляется. Stage 8/9 не выполнялись.

## Контрольные точки

- Принятый Stage 6 HEAD: `3951a746c778e668f7d0ec4372f9002a2f3ee692`; до начала изменений рабочее дерево было чистым.
- Прежний runtime: `7ca146dbb5f2522604f8a7761e5763ec91f659a5`; deployment `2769bd61-0279-4f83-a152-c3aff6036e1d`.
- Stage 7 tested runtime: `8dd33526e356ce24bd9c3390b0052167a777d0b7`.
- Финальный Railway deployment: `b3f876ae-906f-4ca7-8e36-55f195b3ee35`. **SUCCESS**, `/health` **200 / ok=true**. Evidence: `environment-after.json` и `https-final.json`.
- Итоговый HEAD — commit, содержащий этот отчёт; его SHA приводится в сообщении о сдаче. После tested runtime меняются только отчёт/evidence, не исполняемый код.
- Staging: https://martin-forest-v2-staging-production.up.railway.app
- Проект `Martin Forest Site Preview`: `6d754ad4-ba7b-45f8-8c5e-356387e7de06`.
- Environment `ee625678-c15e-452d-9761-cda99274839f` имеет техническое имя `production`, но относится к отдельному staging-проекту. Это не production Bridge.
- API service `9aacf7bf-edd5-4f08-9423-3fbabea59268`; обычный start command `python -m backend.v2.serve`.
- Staging Postgres service `e773c03c-1f76-4f78-adb7-2132528c3a19`, deployment `65355a15-c461-43b3-85dd-b9d3eb1076ed` не изменены.
- Private volume `29b79637-3f45-4ddd-ad2c-028d6b96af8e`, `/mf-private` не изменён.

## Аудит и реализация

До изменений зафиксированы текущие маршруты, дерево Git, конфигурации Railway и источники принятой концепции: `UI_AUDIT.md`, `environment-before.json`. Источники истины — SPEC v2, audit evidence 2026-09-22 и принятый Stage 6 report. Обнаруженные пробелы backend-контрактов зафиксированы; новые доменные контракты не вводились.

Публичный слой использует сохранённые HTML-композиции фотографической версии, существующее фото плит, глубокую зелёную палитру и отдельные страницы услуг. Это развитие существующей концепции. `public/`, корневые legacy-страницы и скрипты сохранены без изменений.

Новый UI адаптирован к существующим v2 API. Legacy v9 не подключён к v2 как второй backend; его auth и browser OBLX экспорт не перенесены в клиентскую сборку.

- Навигация: Главная · О компании · Услуги · Как мы работаем · Контакты; вход/кабинет и CTA «Подготовить заказ».
- Подготовка заказа разделена на самостоятельный и менеджерский сценарии.
- Редактор: создание черновика, ручные позиции, точный выбор материала, отдельные L1/L2/W1/W2, материал клиента, направление текстуры/вращение, существующие параметры рецепта и упаковки.
- XLSX: шаблон/сопоставление колонок, предпросмотр, сохранение источника, ошибки без потери строк, `qty=0` не исправляется автоматически; исправления привязаны к исходным draft rows и требуют причины.
- Manual/AUTO edge actions и обновление каталога используют существующие серверные контракты. Immutable revisions, If-Match, предварительный серверный расчёт сохранены.
- Вход/регистрация, профиль, существующая верификация email, клиентские заказы/история/документы используют Stage 2/5 API. Нет нового хранения auth в localStorage.
- Staff: scoped очередь, назначение менеджера, просмотр каталога/финансовых профилей; доступные существующие admin-действия над сотрудниками/ролями/granular grants и безопасная проекция аудита.
- Навигация учитывает роль, но право на каждое действие проверяет сервер. Нет клиентского механизма обхода RBAC.
- Private OBLX, manifest, Agent/lease данные не показываются клиенту. Нет новых клиентских production/final/produce API вызовов.
- Формы имеют labels, сообщения и busy/disabled states; есть skip link/focus, keyboard menu, подтверждения существенных действий, защита несохранённого ввода и прокрутка широких рабочих таблиц внутри контейнера.

Серверные изменения ограничены регистрацией UI-router и выдачей фиксированных UI-файлов. `public/` или private storage целиком не монтируются. CSP self-only, noindex сохранены. Введён только deployment flag `MF_PRESENTATION_UI=enabled`: без него прежний foundation `/` остаётся 404, как требует неизменённый Stage 1 тест.

## Проверки

CI: https://github.com/artempilipeika-create/artempilipieka-create.github.io/actions/runs/35887899521

| Набор | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| Stage 1 | 28 | 0 | 0 |
| Stage 2 | 20 | 0 | 0 |
| Stage 3 | 46 | 0 | 0 |
| Stage 4 | 27 | 0 | 0 |
| Stage 5 | 30 | 0 | 0 |
| Stage 6 | 44 | 0 | 0 |
| Stage 7 API/presentation | 37 | 0 | 0 |
| Stage 7 Chromium | 10 | 0 | 0 |
| Всего | **242** | **0** | **0** |

Все 195 прежних тестов сохранены без удаления/ослабления. Migrations, Agent package, auth/RBAC/domain/production/calculation/document/storage implementations не изменены. Старые restore-тесты выполнялись в disposable CI Postgres; рабочая staging DB не восстанавливалась и новые migrations не применялись.

Браузерные тесты используют настоящий Chromium + ASGI TestClient + PostgreSQL, не поддельные ответы бизнес-API. HTTP transport перехватывается для доставки запросов к тестовому приложению. Это не браузерные сессии на Railway; live staging проверялся отдельно.

360/768/1440 px: публичные страницы, вход/регистрация, клиентский кабинет, редактирование позиции, сохранение редакции, предварительный расчёт, документы и client→admin deny. Проверены manager scoped queue, admin staff/audit, logout/error, импорт XLSX с нулевым количеством, отсутствие page errors/внешних запросов/глобального horizontal overflow. Для широких таблиц разрешена внутренняя прокрутка.

Проверены skip link, keyboard menu/Escape, label associations, primary text contrast >=4.5:1. 200% проверено как эквивалент layout viewport 720 CSS px для экрана 1440 px; настоящий browser zoom не заявляется проверенным.

При проверке screenshots обнаружен дефект удаления remote font import: semicolon внутри URL повреждал `:root`. Исправлено в tested runtime; добавлены проверки computed body background и максимальной ширины контейнера. CI после исправления полностью зелёный. В отчёт включены только screenshots исправленного runtime.

## Реальные страницы и live evidence

Проверены HTTPS 200, noindex и CSP для `/`, `/about/`, `/services/`, `/services/raspil/`, `/services/kromka/`, `/how-it-works/`, `/contacts/`, `/order/`, `/3d/`, `/login`, `/register`, `/account`, `/editor`, `/staff`, `/admin.html`, `/constructor.html`. Последний маршрут показывает отдельное честное состояние неподключённого инструмента, а не рабочий 3D.

Live HTTPS: регистрация одного синтетического клиента, собственный пустой кабинет, один собственный черновик, staff/audit deny, OBLX GET/HEAD/Range deny и отзыв сессии после logout. Заказ не отправлялся, calculation/job/produce не создавались. Тестовый draft ID: `fae1c088-6dd2-4956-b1f9-ab707e322ef3`. Учётная запись использует `example.invalid`; пароль не сохранён в Git/evidence. Черновик остаётся в staging, API удаления не добавлялся.

Эта аутентифицированная HTTPS проверка выполнена на `3c54793cb5eed948036b864f5143a9c5b031ef4b` / `e598017f-db0e-4f67-9405-83bf0d0b8767`; рабочий JS и все доменные компоненты byte-identical финальному runtime. Единственное исполняемое изменение после неё — исправление начала публичного CSS. На финальном deployment повторно проверены 16 страниц, health и byte identity ресурсов без создания новых данных; см. `https-final.json`.

Cloud browser проверил фактическую staging главную, переход «Подготовить заказ» и самостоятельный сценарий до формы входа. Финальный live screenshot — `screenshots/live-home.jpg`. Screenshot логина — `screenshots/live-login.jpg`.

`/health` сохраняет Stage 6 backend contract: `ok=true`, `environment=staging`, `stage=6`, `agent_transport=disabled`, `staging_agent_api=enabled`, `native_execution=calibration_required`. Поле stage не переименовывалось ради UI. Health не является свежим SQL-доказательством количества final candidates.

## Production и безопасность

Production Bridge deployment `dc09ba1c-7182-481d-8c62-4a9e721461c2`, Postgres deployment `168b0c29-6693-433f-9a85-552f9de65b37` не изменены. Read-only metadata/config comparison до/после сохранён; значения production secrets не читались. Production API/DB/orders/queue/Agent не использовались.

Защищённые refs не изменены:

- main: `470776dfd3efd1db9638668d2e19ea174b7901cc`.
- baseline: `4fb9d5ceb146480be540a39b454119ea84daa98f`.
- photographic preview: `5c97a60145569b7d1df99f5fce5341587db2f75c`.
- legacy Bridge: `2031c09c2f9d8690cb75856b0a4cadb1533a411b`.

Calculate / final candidate / manager approval / produce boundary сохранена. Fake/native-unverified не представляется подтверждённым расчётом БАЗИС. UI называет стоимость предварительной, не открывает produce и не делает native gate readiness claim. `BAZIS_RUN_REQUIRED` и private документы/OBLX покрыты неизменёнными Stage 1–6 регрессиями. Никаких Windows/БАЗИС/Resilio/`D:\pgm` действий не выполнялось.

## Ограничения и NOT VERIFIED

1. Native BAZIS calibration — **NOT VERIFIED**, gate CLOSED; production cutover — NOT PERFORMED. Stage 7 не пытался это менять.
2. Полная защищённая интеграция рабочего 3D — **NOT IMPLEMENTED / NOT VERIFIED**: отсутствует v2 project/subscription contract. Исходный инструмент сохранён; публичное описание отдельно; честная заглушка после входа не считается работающим инструментом. Это незакрытая часть желаемого UX, требующая отдельного решения по контракту.
3. Полная функциональная эквивалентность legacy v9 — **NOT VERIFIED**. Нет переноса неподдерживаемых v2 функций: произвольный source upload вне XLSX template flow, полный UI публикации каталога/тарифов, список/revoke granular grants без соответствующей projection. Существующие legacy-функции из исходников не удалены. Staff UI охватывает перечисленные выше существующие v2 операции.
4. Обрезки не опубликованы. Рабочий внутренний inventory UI не реализован при отсутствии v2 contract; не выдаётся за готовый раздел.
5. SPEC N.2: комплект трёх разных производственных фотографий не завершён. Использован существующий утверждённый визуальный asset; два повтора заменены типографическими блоками. Авторство/лицензия исходного фото и факт съёмки именно производства компании — **NOT VERIFIED**. См. `ASSETS.md`.
6. Аутентифицированный browser walkthrough manager/admin на Railway — **NOT VERIFIED**; есть реальный CI browser workflow с ASGI/Postgres и отдельный live client HTTPS workflow. Не выдаём одно за другое.
7. Safari/Firefox, реальные iOS/Android/tablet устройства, screen reader и полный WCAG audit — **NOT VERIFIED**. Проверен Chromium с указанными viewport. Native 200% zoom — **NOT VERIFIED**, проверен layout-equivalent.
8. Полный финальный визуальный approval пользователем — **PENDING**. 242 PASS не заменяют приёмку и не закрывают перечисленные продуктовые пробелы.
9. Не выполнялась повторная SQL-инвентаризация production/final candidates на live staging; сохранность boundary подтверждается неизменённым кодом, regressions, no-production-action evidence и health. Прежние Stage 6 counts/backup остаются историческими evidence, не объявляются новыми.

## Diff, screenshots, rollback

`ACTUAL_GIT_DIFF.patch` — фактический Git text diff принятого Stage 6 → tested runtime, включая список binary changes; binary assets доступны в Git. `git-diff-stat.txt` и `changed-ui-files.txt` — точные списки. Финальный report commit добавляет только docs/evidence, отдельно от исполняемого diff.

Screenshots `home-360.jpg`, `home-1440.jpg`, `editor-360.jpg`, `editor-1440.jpg` получены из Chromium CI run 35887899521. Полный набор desktop/tablet/mobile PNG — artifact `stage07-browser-evidence` этого CI run. Локальные JPEG — компактные viewport copies, не все full-page PNG. Hashes и происхождение в `screenshots/evidence.json`.

Rollback выполняется только на staging API service: вернуть source commitSha `7ca146dbb5f2522604f8a7761e5763ec91f659a5`, start command `python -m backend.v2.serve`, убрать/выключить `MF_PRESENTATION_UI`, deploy и проверить `/health`/`/account`. DB/volume/secrets остаются прежними, schema rollback/restore не требуется: Stage 7 не менял migrations. Альтернатива — временно отключить public UI flag; это не откатывает workspace assets, полный rollback требует pin Stage 6 runtime. Не восстанавливать backup поверх рабочей DB для отката дизайна.

После отчёта работа останавливается для приёмки. Stage 8, Stage 9 и production cutover не запускались.
