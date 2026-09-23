# Stage 7 — furniture visual fix

2026-09-23. Только visual/content pass; новый Stage не начат. Приёмка остаётся за пользователем.

## Контрольная точка

- Ветка: `martin-forest-v2-staging`.
- Исходный принятый HEAD: `1d925be152b3df6a54fa2f4f50ad43030c3e8606`, Git clean.
- Исходный runtime: `8dd33526e356ce24bd9c3390b0052167a777d0b7`.
- Исходный deployment: `b3f876ae-906f-4ca7-8e36-55f195b3ee35`, SUCCESS.
- Новый tested runtime: `a8228b6e0cf7847c5d7a54b2499e39cbd05ee5fb`.
- Итоговый HEAD — documentation commit с этим отчётом; после tested runtime меняются только evidence/docs.
- Финальный deployment: `7f509b33-b747-4bb2-b91a-4f23f186450f`, **SUCCESS**, health **200 / ok=true**. Evidence: `environment.json`, `https-final.json`.
- Промежуточный deployment `fb0362e9-d47a-4189-9024-15c9d9369066` уже содержал тот же tested runtime; затем source pin закреплён в persisted service config через commit staged patch. Первый read-only обход 14 страниц — `https.json`; после закрепления повторены health и asset hashes. Незавершённых staging patches не осталось.

## Что изменено

1. Главная: вместо плиты — реалистичная интерьерная концепция современной кухни: дубовые высокие шкафы, зелёные фасады и остров, светлая столешница. Сохранены структура, заголовок услуг, палитра и основной CTA. Подзаголовок: «Детали для кухни, шкафа и вашей идеи».
2. Изображение заменено в существующем `ui_assets/panels.webp`. Имя сохранено для неизменности backend allowlist; содержимое теперь мебельное. Размер 1536×1024; 76,046 bytes вместо 268,352. Оригинальный PNG создан встроенным imagegen; WebP — только оптимизация формата. Prompt и происхождение: `../ASSETS.md`.
3. «О компании» и «Распил»: старое изображение плит заменено кухней, alt соответствует изображению. На «О компании» не дублируем ту же картинку ещё и в шапке.
4. «Услуги» и «Подготовка заказа»: ненавязчивый мебельный фон шапки с зелёным затемнением. На «Кромкооблицовке» сохранена аккуратная типографическая подача без технически спорной фотографии.
5. «Материалы и кромка»: сохранены текстовый блок, точные обозначения материала и четыре стороны кромки; сомнительных торцов на изображении нет.
6. 3D: название «3D-визуализация проекта», честное пояснение, что рабочий инструмент пока не подключён к кабинету. Нет обещаний доступного онлайн-конструктора и автоматического переноса деталей. CTA ведут к описанию направления или существующей подготовке заказа. Название в footer обновлено на всех девяти публичных страницах.
7. Сборщик публичных страниц сохраняет правки и больше не восстанавливает старую фотографию плит при запуске.
8. В browser test изменён только перечень сохраняемых screenshots; assertions не удалялись и не ослаблялись.

## Границы

Git byte comparison с принятой точкой: без изменений все `backend/v2/*.py`, кабинет/editor JS/CSS/HTML, Agent, migrations, исходные `public/`, Dockerfile, workflow, тесты Stage 1–6. Stage 7 assertions сохранены.

Нет изменений API/auth/RBAC/private documents/storage/OBLX/manifests/lease/XLSX/order revisions/расчётов/approval/produce. Новый frontend JS не добавлен. Новые jobs/orders/credentials не создавались. Staging DB/volumes/secrets не менялись. Обычный start command: `python -m backend.v2.serve`.

Production Bridge deployment `dc09ba1c-7182-481d-8c62-4a9e721461c2`, production Postgres deployment `168b0c29-6693-433f-9a85-552f9de65b37`: только read-only проверка metadata/config. Рабочие очереди, Windows Agent, БАЗИС, `D:\pgm`, Resilio не использовались.

Защищённые refs проверены и не изменены: main `470776dfd3efd1db9638668d2e19ea174b7901cc`; baseline `4fb9d5ceb146480be540a39b454119ea84daa98f`; preview `5c97a60145569b7d1df99f5fce5341587db2f75c`; Bridge `2031c09c2f9d8690cb75856b0a4cadb1533a411b`.

## Проверки и evidence

CI run: https://github.com/artempilipeika-create/artempilipieka-create.github.io/actions/runs/35891640070

**242 PASS / 0 FAIL / 0 SKIP**: Stage 1–6 — 195, Stage 7 presentation — 37, browser — 10. Фактические job summaries — `ci.json`. Использован существующий полный CI: UI/presentation и реальный Chromium+ASGI/Postgres вместе с Stage 1–6. Локальный system Python не содержит pytest; локальная попытка не учитывается как PASS. Решающее evidence — CI.

Browser coverage: 360/768/1440 px, публичные страницы, keyboard/focus, cabinet/editor/immutable revision/preliminary calculation, client→admin deny, staff queue, XLSX qty=0. Это синтетические данные в disposable CI DB, не данные production и не authenticated Railway browser walkthrough.

При переключении контейнера был один transient health 502; после Railway SUCCESS повторная проверка дала 200 и совпадение SHA assets. Поле health `stage=6` сохранено как существующий backend contract; native_execution=calibration_required.

Live staging: read-only HTTPS ключевых публичных страниц и рабочих оболочек, `/health`, noindex, SHA-256 identity картинки/CSS/рабочих JS. Cloud browser отдельно проверяет фактический hero/3D. Screenshots CI относятся к точному tested runtime; live screenshot отмечен отдельно в `screenshots/evidence.json`.

`ACTUAL_GIT_DIFF.patch`, `diff-stat.txt`, `changed-files.txt` — фактический diff принятой точки → tested runtime. Implementation diff: **14 files changed, 71 insertions(+), 21 deletions(-)**. Documentation commit дополнительно содержит отчёт и screenshots, но не меняет runtime.

## Ограничения / NOT VERIFIED

- Изображение — сгенерированная интерьерная концепция, не фотография выполненного заказа Martin Forest. Это явно подписано на главной. Визуальный осмотр не является конструктивной экспертизой. Не заявляется производство показанной кухни компанией.
- Один мебельный visual повторно используется на разных страницах; набор реальных различных проектов компании ещё не предоставлен.
- Рабочий защищённый 3D-инструмент всё ещё не интегрирован. Изменён только честный публичный текст, новая 3D-функциональность не создавалась.
- Native BAZIS calibration — NOT VERIFIED, gate CLOSED; calculate/final/approval/produce boundary и `BAZIS_RUN_REQUIRED` сохранены. Никакого production cutover.
- Реальные iOS/Android, Safari/Firefox, screen reader и полный WCAG audit — NOT VERIFIED. Responsive проверен Chromium viewport 360/768/1440.
- Authenticated manager/admin walkthrough непосредственно на Railway в этом pass не выполнялся; рабочие сценарии проверены существующими browser CI tests. Новые клиентские данные на staging не создавались.
- Остальные ранее документированные ограничения Stage 7 сохраняются; эта визуальная правка их не закрывает.

## Откат

Только staging API service `9aacf7bf-edd5-4f08-9423-3fbabea59268` проекта `6d754ad4-ba7b-45f8-8c5e-356387e7de06`: pin прежний runtime `8dd33526e356ce24bd9c3390b0052167a777d0b7`, сохранить обычный start command и текущие переменные, deploy, проверить `/health`. DB restore/schema rollback не нужны. Production не затрагивается.

После сдачи остановиться для приёмки. Stage 8/9 не запускались.
