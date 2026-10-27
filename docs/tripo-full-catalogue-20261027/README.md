# MARTIN FOREST — полный каталог Tripo

Все изображения пакета проверены и подключены: 84 карточки, 83 файлов. Вместе с ранее опубликованными семью вариантами верхнего открытого модуля охвачены все 16 семейств каталога. Карточки под мойку с одним и двумя фасадами используют одинаковый открытый корпус без фасадов.

Рендеры созданы в Tripo Studio, GPT Image 2.5, image-to-image, 1024 × 1024, по одному изображению, без увеличения 4K. Исходные изображения и конструктивные сведения привязаны к каждому заданию в batch-plan.json. Внешний вид карточек иллюстративный; геометрия сцены, нативные FR3D, bazis_id, bazis_file, bazis_sha256, спецификация и выбранные материалы не заменяются рендерами.

## Проверенные детали

- Открытые модули: свет внутри левой, правой или обеих боковых стенок; отдельные исполнения AQ и LIRA.
- Ручки расположены снаружи на свободном крае; у открытых фасадов ручка не рисуется на внутренней поверхности.
- Для трёх шуфляд показаны направляющие всех трёх. Число фасадов и компоновки техники сохранены.
- Витрина: одна стеклянная полка, тонкая чёрная рамка Z1, четыре петли и открывание без ручки.
- Фотографии конкретной фурнитуры поставщиков сохранены.

## Расход

Фактически списано **1480 кредитов**, согласованный предел **1800**. Остаток, проверенный в интерфейсе Tripo: **1040**.

CREDITS.txt и credit-report.json содержат каждый task_id, операцию и стоимость в порядке выполнения, включая отклонённые варианты и один ошибочный повтор. Три первоначальных образца бесплатные. Одинаковые исполнения используют один принятый рендер без дополнительной генерации.

## Проверка и публикация

**Картинки подключены в подготовленной версии кода. На тестовом сайте пока предыдущая версия: запуск публикации был прерван. Сохранение, повторное открытие и редактирование проекта в новой версии ещё предстоит проверить после публикации.**

```json
{
  "node": {
    "passed": 684,
    "failed": 0
  },
  "python_local": {
    "passed": 379,
    "skipped": 37,
    "failed": 0,
    "skip_reason": "PostgreSQL-only checks run in Constructor reliability CI"
  },
  "CI": {
    "workflow": "Constructor reliability",
    "run_id": 40424414377,
    "job_id": 121926493698,
    "commit": "db14adbb59ca5598117bc50fa7ca0168064ccae6",
    "status": "success",
    "node_passed": 684,
    "python_passed": 416
  },
  "staging": {
    "status": "source_change_staged_not_applied_after_interruption",
    "planned_commit": "db14adbb59ca5598117bc50fa7ca0168064ccae6",
    "live_commit": "548547ad4a507d6276ab3f1fb87387e28d446e07",
    "patch_id": "ed134f84-f999-4bfd-960f-847c8e1feb79",
    "browser_save_reopen_edit": "pending deployment"
  },
  "asset_routes": "Six distinct AQ and LIRA WebP images served with correct MIME; unrelated paths remain unavailable",
  "production_geometry_or_source_files_changed": false
}
```

Тестовый сайт: https://martin-forest-v2-staging-production.up.railway.app/constructor.html

## Состав архива

- originals/ — все оригинальные PNG, включая исправленные и отклонённые варианты.
- catalogue/ — готовые WebP, используемые карточками.
- previews/ — обзорные листы.
- batch-plan.json — промпты, исходники, проверки и соответствие карточкам.
- CREDITS.txt и credit-report.json — расход по каждому заданию.

## Соответствие карточкам

| Файл | Задание |
|---|---|
| `module-card-images/waste-standard.webp` | `main:waste-standard` |
| `module-card-images/cargo.webp` | `main:cargo` |
| `module-card-images/dishwasher.webp` | `main:dishwasher` |
| `module-card-images/pullout-dryer.webp` | `main:pullout-dryer` |
| `module-card-images/base-single.webp` | `main:base-single` |
| `module-card-images/base-double.webp` | `main:base-double` |
| `module-card-images/base-drawers.webp` | `main:base-drawers` |
| `module-card-images/base-oven.webp` | `main:base-oven` |
| `module-card-images/base-corner.webp` | `main:base-corner` |
| `module-card-images/wall-single.webp` | `main:wall-single` |
| `module-card-images/wall-double.webp` | `main:wall-double` |
| `module-card-images/open-tall-none.webp` | `main:open-tall-none` |
| `module-card-images/tall-vitrine.webp` | `main:tall-vitrine` |
| `module-card-images/tall-storage.webp` | `main:tall-storage` |
| `module-card-images/tall-appliance.webp` | `main:tall-appliance` |
| `execution-card-images/base-base-purpose-shelf.webp` | `option:base:base:purpose:shelf` |
| `execution-card-images/base-base-purpose-sink.webp` | `option:base:base:purpose:sink` |
| `execution-card-images/base-base-execution-standard.webp` | `option:base:base:execution:standard` |
| `execution-card-images/base-base-execution-gola.webp` | `option:base:base:execution:gola` |
| `execution-card-images/base-base-side-left.webp` | `option:base:base:side:left` |
| `execution-card-images/base-base-side-right.webp` | `option:base:base:side:right` |
| `execution-card-images/base-double-base-purpose-shelf.webp` | `option:base-double:base:purpose:shelf` |
| `execution-card-images/base-base-purpose-sink.webp` | `option:base:base:purpose:sink` |
| `execution-card-images/base-double-base-execution-standard.webp` | `option:base-double:base:execution:standard` |
| `execution-card-images/base-double-base-execution-gola.webp` | `option:base-double:base:execution:gola` |
| `execution-card-images/drawer-drawer-execution-standard.webp` | `option:drawer:drawer:execution:standard` |
| `execution-card-images/drawer-drawer-execution-gola.webp` | `option:drawer:drawer:execution:gola` |
| `execution-card-images/drawer-drawer-layout-two.webp` | `option:drawer:drawer:layout:two` |
| `execution-card-images/drawer-drawer-layout-three.webp` | `option:drawer:drawer:layout:three` |
| `execution-card-images/drawer-drawer-layout-inner.webp` | `option:drawer:drawer:layout:inner` |
| `execution-card-images/drawer-drawer-opening-soft.webp` | `option:drawer:drawer:opening:soft` |
| `execution-card-images/drawer-drawer-opening-push.webp` | `option:drawer:drawer:opening:push` |
| `execution-card-images/oven-generic-handles-handles.webp` | `option:oven:generic:handles:handles` |
| `execution-card-images/oven-generic-handles-handleless.webp` | `option:oven:generic:handles:handleless` |
| `execution-card-images/corner-corner-side-left.webp` | `option:corner:corner:side:left` |
| `execution-card-images/corner-corner-side-right.webp` | `option:corner:corner:side:right` |
| `execution-card-images/corner-corner-purpose-sink.webp` | `option:corner:corner:purpose:sink` |
| `execution-card-images/corner-corner-purpose-shelf.webp` | `option:corner:corner:purpose:shelf` |
| `execution-card-images/corner-corner-door_count-1.webp` | `option:corner:corner:door_count:1` |
| `execution-card-images/corner-corner-door_count-2.webp` | `option:corner:corner:door_count:2` |
| `execution-card-images/corner-generic-handles-handles.webp` | `option:corner:generic:handles:handles` |
| `execution-card-images/corner-generic-handles-handleless.webp` | `option:corner:generic:handles:handleless` |
| `execution-card-images/cargo-cargo-execution-standard.webp` | `option:cargo:cargo:execution:standard` |
| `execution-card-images/cargo-cargo-execution-gola.webp` | `option:cargo:cargo:execution:gola` |
| `execution-card-images/dryer-dryer-execution-standard.webp` | `option:dryer:dryer:execution:standard` |
| `execution-card-images/dryer-dryer-execution-gola.webp` | `option:dryer:dryer:execution:gola` |
| `execution-card-images/dishwasher-dishwasher-execution-standard.webp` | `option:dishwasher:dishwasher:execution:standard` |
| `execution-card-images/dishwasher-dishwasher-execution-gola.webp` | `option:dishwasher:dishwasher:execution:gola` |
| `execution-card-images/upper-upper-filling-shelves.webp` | `option:upper:upper:filling:shelves` |
| `execution-card-images/upper-upper-execution-handles.webp` | `option:upper:upper:execution:handles` |
| `execution-card-images/upper-upper-execution-handleless.webp` | `option:upper:upper:execution:handleless` |
| `execution-card-images/upper-upper-execution-push.webp` | `option:upper:upper:execution:push` |
| `execution-card-images/upper-upper-side-left.webp` | `option:upper:upper:side:left` |
| `execution-card-images/upper-upper-side-right.webp` | `option:upper:upper:side:right` |
| `execution-card-images/upper-double-upper-filling-shelves.webp` | `option:upper-double:upper:filling:shelves` |
| `execution-card-images/upper-double-upper-execution-handles.webp` | `option:upper-double:upper:execution:handles` |
| `execution-card-images/upper-double-upper-execution-handleless.webp` | `option:upper-double:upper:execution:handleless` |
| `execution-card-images/upper-double-upper-execution-push.webp` | `option:upper-double:upper:execution:push` |
| `execution-card-images/open-tall-none-open-tall-light_system-none.webp` | `main:open-tall-none` |
| `execution-card-images/open-tall-none-open-tall-lighting-left.webp` | `option:open-tall-none:open-tall:lighting:left` |
| `execution-card-images/open-tall-none-open-tall-lighting-right.webp` | `option:open-tall-none:open-tall:lighting:right` |
| `execution-card-images/open-tall-none-open-tall-lighting-both.webp` | `option:open-tall-none:open-tall:lighting:both` |
| `execution-card-images/tall-vitrine-vitrine-lighting-left.webp` | `option:tall-vitrine:vitrine:lighting:left` |
| `execution-card-images/tall-vitrine-vitrine-lighting-right.webp` | `option:tall-vitrine:vitrine:lighting:right` |
| `execution-card-images/tall-vitrine-vitrine-lighting-both.webp` | `option:tall-vitrine:vitrine:lighting:both` |
| `execution-card-images/tall-vitrine-vitrine-opening-left.webp` | `option:tall-vitrine:vitrine:opening:left` |
| `execution-card-images/tall-vitrine-vitrine-opening-right.webp` | `option:tall-vitrine:vitrine:opening:right` |
| `execution-card-images/tall-storage-tall-opening-left.webp` | `option:tall-storage:tall:opening:left` |
| `execution-card-images/tall-storage-tall-opening-right.webp` | `option:tall-storage:tall:opening:right` |
| `execution-card-images/tall-storage-tall-opening-double.webp` | `option:tall-storage:tall:opening:double` |
| `execution-card-images/tall-storage-generic-handles-handles.webp` | `option:tall-storage:generic:handles:handles` |
| `execution-card-images/tall-storage-generic-handles-handleless.webp` | `option:tall-storage:generic:handles:handleless` |
| `execution-card-images/tall-appliance-tall-layout-door_oven.webp` | `option:tall-appliance:tall:layout:door_oven` |
| `execution-card-images/tall-appliance-tall-layout-door_oven_micro.webp` | `option:tall-appliance:tall:layout:door_oven_micro` |
| `execution-card-images/tall-appliance-tall-layout-drawer_oven.webp` | `option:tall-appliance:tall:layout:drawer_oven` |
| `execution-card-images/tall-appliance-tall-layout-drawer_oven_micro.webp` | `option:tall-appliance:tall:layout:drawer_oven_micro` |
| `execution-card-images/tall-appliance-tall-opening-left.webp` | `option:tall-appliance:tall:opening:left` |
| `execution-card-images/tall-appliance-tall-opening-right.webp` | `option:tall-appliance:tall:opening:right` |
| `execution-card-images/tall-appliance-generic-handles-handles.webp` | `option:tall-appliance:generic:handles:handles` |
| `execution-card-images/tall-appliance-generic-handles-handleless.webp` | `option:tall-appliance:generic:handles:handleless` |
| `module-card-images/waste-gola.webp` | `main:waste-gola` |
| `execution-card-images/open-tall-lira-left.webp` | `option:open-tall:lira:left` |
| `execution-card-images/open-tall-lira-right.webp` | `option:open-tall:lira:right` |
| `execution-card-images/open-tall-lira-both.webp` | `option:open-tall:lira:both` |
