# STAGE 8.1 — PRODUCTION READINESS CLOSURE

Дата: 2026-09-23. Scope: read-only readiness review и документация. **Stage 9 не выполнялся.** Источники: SPEC G/L/N/O/P/Q, audit 2026-09-22, принятые Stage 0–8, `../stage08/STAGE_8_REPORT.md` и его evidence. Новые факты: `read-only-evidence.json`. Бизнес-правила не переопределялись.

## Контрольная точка и проверка

- Ветка `martin-forest-v2-staging`; входной HEAD `b62439731355aa6e5ceb386fe50f4fd481b98b5f`, локально и GitHub совпали; рабочее дерево до работы clean. Итоговый HEAD — commit данного отчёта, сообщается в финальном ответе.
- Tested runtime `bc6b96101a9eaf88732e1342eaf18c2579e6a385`; Railway deployment `af8ba2e0-dc20-4239-afaa-d6b90c015364` повторно подтверждён SUCCESS. Конфигурация pinned на этот runtime, `python -m backend.v2.serve`, healthcheck `/health`, staging pending work пуст.
- CI run `35896674899` повторно прочитан: completed/success на указанном runtime. **248 PASS / 0 FAIL / 0 SKIP** — выполненный Stage 8 CI, не новый запуск Stage 8.1. Код/тесты/CI не изменены; повторный полный CI не требовался для documentation-only delta.
- Нового HTTP health probe, SQL counts, migration, fixture, job, restore, redeploy не выполнялось. Последние проверенные gates/counts — Stage 8 evidence, не свежий SQL: calibration=0, verified result=0, final candidate=0, final approval=0, produce=0. Native CLOSED; `BAZIS_RUN_REQUIRED` сохраняется неизменённым кодом и принятым runtime.

## P0 closure register

| P0 | Фактическое доказательство / пробел | Что закрывает; владелец | Итог |
|---|---|---|---|
| NC-03 / JOB-10 | Software 600×400 q3 → 620×420 q6; нет native layers/stages/finished-part proof | Производство: isolated run, две 18-mm заготовки на каждую готовую деталь, native outputs/скриншоты, binding run/job/revision, отсутствие двойного выпуска/начисления; отдельно тарифная база glue/L+W | NOT VERIFIED; auto 36-mm release закрыт |
| NC-04 / JOB-08/09/10 | Exporter/parser/signed synthetic results не BAZIS. Доступного Windows/BAZIS runner в текущих callable capabilities нет; нового разрешённого runner не предоставлено | BAZIS-специалист: версия, asymmetric four-edge/grain/rotation fixtures, Orient/Rotation/X-Y-L-W/WithoutBut/Allowance/Overhung/edge positions, exact local material mapping, реальные native outputs, parser и crash/late-output verification | NOT VERIFIED; production native profile отсутствует |
| MIG-01 | Есть только synthetic rehearsal, код и catalogue XLSX. Полный разрешённый legacy DB+files export в checkout/attachments не предоставлен | Артём/владелец данных: разрешённый snapshot с provenance/SHA/time/scope, counts, users/orders/revisions/payments/history/files/3D; restore в отдельную копию, mapping/reconciliation, missing-file/duplicate dispositions, owner sign-off | NOT VERIFIED; production DB не читалась |
| MIG-04 | Повторно подтверждены разные проекты/DB services/domains, staging namespace guards, отсутствие AGENT_API_KEY в staging variable names, legacy branch unchanged. Нет v2→legacy forwarding в принятой архитектуре | Оператор production Agent: разрешённый redacted read-only export endpoint/queue/watch paths/namespace и telemetry за согласованный интервал с подтверждением отсутствия staging jobs. Только metadata; без raw credentials, job injection или подключения staging | NOT VERIFIED; конфигурационная часть подтверждена, full isolation без telemetry не PASS |

Native checklist и provenance reference №69: `../stage06/NATIVE_CALIBRATION.md`. Оригинальные байты №69 в текущих вложениях/checkout не предоставлены; новый native comparison не выполнен. Никаких действий с D:\pgm/Resilio/Windows не было. Отсутствие runner не обходилось mock-результатом.

## P1/P2 и решения Артёма

Полный decision register — `DECISION_REGISTER.md`: NC-01, NC-02, NC-05, NC-06, NC-07, NC-08, NC-09. Все семь остаются неутверждёнными. Указаны владельцы, отсутствующее решение, SPEC fallback и область блокировки. Ограниченный draft/review-only режим не равен разрешению полного cutover. Артём должен утвердить объём запуска, правила NC-01/08 и назначить владельцев цен/производства/email/DR; решения остальных владельцев также фиксируются явно.

UI-01 остаётся **P2 FAIL**: одна generated furniture concept вместо трёх разных фотографий. Принятый дизайн не менялся; это не blocker технической Stage 8.1.

## 3D disabled — условная возможность, не готовая функция

Технически текущий редактор/кабинет работают без protected 3D; отдельного переноса 3D в заказ нет. `/3d/` явно сообщает, что рабочий инструмент не подключён, CTA ведёт в `/order/`. `/constructor.html` в v2 — alias общего cabinet shell (`backend/v2/cabinet_ui.py`), не защищённый конструктор. Нельзя рекламировать его как доступный рабочий инструмент, продавать/активировать подписку или обещать автоматический перенос в заказ. Отсутствующие protected project/subscription APIs должны оставаться недоступными, legacy JS нельзя подключать обходным public mount. Сейчас ничего в routes не менялось.

Stage 9 с 3D disabled возможен **только условно**, после явного решения Артёма об исключении этой функции и доказанного сохранения legacy данных; это не закрывает UI-03 и не снимает остальные blockers. Сохранить project IDs/owners, geometry/dimensions/material references, версии/exports/attachments, подписки/expiry/extensions/block flags, связи заказов и audit. Истечение 30-дневной подписки не удаляет проекты. Legacy `constructor.js` содержит browser-local `mf_constructor_order`: серверный dump не гарантирует сохранение browser-local draft; перед сменой origin нужна отдельная согласованная процедура экспорта, без очистки браузерных данных. Полнота реальных 3D данных/подписок сейчас NOT VERIFIED вместе с MIG-01.

## Disaster recovery

`OFFSITE_DR_PLAN.md` фиксирует независимый destination, encryption/key escrow, identity guards, пустой recovery target, hashes, disabled transports, lease/physical reconciliation и критерии RPO/RTO. Его можно подготовить без production изменений — выполнено. Само off-site восстановление **NOT VERIFIED**. Stage 8 restored 72 tables/34 files внутри staging infrastructure; оно не повышено до DR PASS. Новый инфраструктурный target/ключи/retention/RPO/RTO требуют владельца и отдельной разрешённой проверки.

## Delta acceptance от Stage 8

Ни один прежний NOT VERIFIED не закрыт без нового достаточного evidence. Q итоги неизменны: **78 PASS / 1 FAIL / 12 NOT VERIFIED**. Новое: повторная metadata-проверка контрольной точки/production, конкретизированные closure evidence и business/DR plans. Это не новые PASS в Q.

| Оставшийся Q criterion | Приоритет для затронутого запуска | Недостающее |
|---|---|---|
| EMAIL-05 | P1 | Реальный provider delivery/retry, NC-07 |
| ORD-05 | P1 | Реальные payment/CUT workflow events acceptance |
| JOB-01 | P1 | Полная cross-system rename проверка stable identity |
| JOB-04 | P1 | Поздний output предыдущей revision, полная цепочка preservation |
| JOB-06 | P0 для native production | Реальный BAZIS crash/reconciliation; software uncertain/no-retry не native test |
| JOB-08 | P0 | Оригинальный №69 и native comparison |
| JOB-09 | P0 | Native four-edge/grain/rotation calibration |
| JOB-10 | P0 | Native 18+18 стадии/слои/готовый результат |
| MIG-01 | P0 | Реальный разрешённый legacy snapshot и полная reconciliation |
| MIG-04 | P0 | Разрешённая Agent telemetry плюс endpoint/queue isolation evidence |
| UI-03 | P1 для 3D | Protected tool/subscription/history; возможное исключение scope не утверждено |
| E2E-01 | P0 для полного production flow | Реальная native chain, final→approval→produce с согласованным профилем |

Вне Q остаются NOT VERIFIED: все NC-01–09 approvals/calibration; off-site DR/RPO/RTO/key recovery; полнота реальных legacy/3D/browser-local данных; фактическая production Agent telemetry. Нового live authenticated desktop/mobile/tablet acceptance в Stage 8.1 не выполнялось; предыдущий CI/browser evidence не заменяет такую проверку. Новые production secret values/DB contents намеренно не читались; их неизменность нельзя доказывать этим metadata-сравнением.

## Production unchanged evidence и ограничения доказательства

Свежие read-only Railway/GitHub responses сохранены в `read-only-evidence.json` и сопоставлены с `../stage08/environment.json`:

- Bridge deployment `dc09ba1c-7182-481d-8c62-4a9e721461c2`, Postgres deployment `168b0c29-6693-433f-9a85-552f9de65b37` прежние.
- Bridge source branch, routing/build/deploy configuration и шесть variable names совпадают. Secret values не запрашивались. Старый staged patch `fb061e37-22cf-4996-bfad-5f7cc31b45a1` содержит 0 изменений; оставлен нетронутым.
- Protected refs main/baseline/visual preview/Bridge совпадают с Stage 8. Staging DB/private-volume IDs прежние; prod и staging endpoints различны.
- В Stage 8.1 выполнены только metadata/source reads и запись документации в staging Git. Не было deploy/restart, jobs/orders, DB reads production, secret rotation, domain/routing changes или Agent connection. Это доказательство отсутствия наших изменений и совпадения доступной metadata, не аудит всех внешних действий/Windows процессов.

## Фактический diff, rollback и blockers

Только четыре новых documentation/evidence файла в `docs/stage08_1/`: этот отчёт, `DECISION_REGISTER.md`, `OFFSITE_DR_PLAN.md`, `read-only-evidence.json`. Backend/UI/Agent/tests/migrations/workflows не изменены. Patch — Git commit отчёта относительно принятого Stage 8. Runtime/deployment не требуют изменения. Rollback: revert только documentation commit; DB restore/redeploy не нужны.

Полный Stage 9 блокируют: (1) NC-03/04 и JOB-06/08/09/10/E2E-01 без реального native proof; (2) MIG-01 без разрешённого полного snapshot и reconciliation; (3) MIG-04 без telemetry; (4) неутверждённые финансовые/производственные/email/history решения для выбранного launch scope и ORD-05/JOB-01/JOB-04 acceptance; (5) отсутствие off-site recovery proof и утверждённых RPO/RTO; (6) UI-03, если 3D остаётся в объёме. NC-06 можно ограничить подтверждёнными форматами; UI-01/P2 не технический blocker. Ограничения scope вправе принять только Артём — здесь они не приняты.

**STAGE 9 BLOCKED**
