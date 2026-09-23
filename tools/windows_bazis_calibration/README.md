# Martin Forest — Windows / БАЗИС Calibration Kit v1

**Preparation only. Native gate CLOSED / NOT VERIFIED.** Скрипты не запускают БАЗИС, Agent, станок, сеть или серверный API. Никакого Stage 9. Требуется Windows PowerShell 5.1+; offline validator — Python 3.10+. PowerShell в текущей Linux-сессии не исполнялся: первый Windows preflight сам является непроверенной платформенной частью.

## 1. Изоляция — до копирования fixtures

Используйте отдельный Windows-компьютер/VM с лицензированным БАЗИС и отдельной тестовой базой материалов, без подключения к станкам/production Agent, без production/sync/watch directories. Не устанавливайте новые компоненты и не меняйте production конфигурацию по этой инструкции. Существующий рабочий D:\pgm не открывать. Не останавливайте службы ради прохождения preflight: если есть потенциальный watcher, остановитесь и согласуйте изолированный контур с владельцем.

TestRoot вводится явно, без default. Пример **только после проверки оператором**: `C:\MartinForestCalibration`. Нельзя использовать рабочие папки заказов, drive root, UNC/share, junction/symlink, Users/OneDrive/Resilio/production directories. Проверка имени пути не доказывает изоляцию: оператор проверяет ACL, shares, sync roots, routing watcher, службы/задачи/процессы. Kit не содержит deny-list всех возможных папок заказов и не может доказать отсутствие неизвестного watcher.

Проверьте SHA ZIP по переданному SHA256SUMS до распаковки. Распакуйте kit в `$root\kit` только после подтверждения, что root не наблюдается production. Оригинал №69 может содержать клиентские данные: не публикуйте его или native evidence в публичный Git. Все реальные результаты возвращать приватным архивом, не git add.

## 2. Подготовка каталогов (вручную, без БАЗИС)

Откройте PowerShell. Команды ниже создают **только выбранные тестовые каталоги**; preflight ничего не создаёт и не меняет.

```powershell
$root = Read-Host 'Полный путь НОВОГО изолированного test root'
# Сначала визуально проверьте путь; не вводите production/shared path.
New-Item -ItemType Directory -Path $root -ErrorAction Stop
foreach ($name in 'inbox','work','outbox','archive','failed','evidence') {
  New-Item -ItemType Directory -Path (Join-Path $root $name) -ErrorAction Stop
}
# Распакуйте доставленный ZIP так, чтобы README.md был в $root\kit\README.md.
$kit = Join-Path $root 'kit'
$exe = Read-Host 'Полный путь установленного БАЗИС EXE (не D:\pgm)'
Copy-Item "$kit\templates\isolation-review.json" "$root\isolation-review.json"
```

Заполните isolation-review.json: exact test_root, reviewer_id (псевдоним оператора), ISO timestamp с timezone. Флаги сначала false. Первый preflight покажет inventory и FAIL — это ожидаемо. Запуск **не означает разрешения native**.

```powershell
& "$kit\preflight.ps1" -TestRoot $root -BazisExe $exe -IsolationReview "$root\isolation-review.json" |
  Set-Content -LiteralPath "$root\preflight-initial.json" -Encoding UTF8
```

Прочитайте inventory локально; скрипт не пишет command lines/passwords. Unknown/неполный inventory, потенциальный service/task/process watcher, running БАЗИС, <2 GiB free, неизвестная версия/hash = **PRECHECK FAIL**. Ничего не отключается автоматически. Не обходите FAIL редактированием результата; выберите доказанно изолированный контур и выполните preflight заново. Все обязательные флаги review подтверждает человек после проверки. `PRECHECK CLEAR FOR MANUAL REVIEW` не BAZIS PASS и не универсальная гарантия отсутствия watcher.

## 3. Один новый run на fixture

Сначала закройте предыдущую **тестовую** сессию БАЗИС обычным способом после сохранения evidence. Не закрывайте чужие/production процессы. Шесть fixtures проходят отдельно, даже если bytes двух OBLX совпадают. Отличающиеся sidecars задают разные grain/rotation ожидания; не угадывайте семантику Orient=Y/N.

```powershell
$fixture = 'four-edges'  # затем остальные ID из manifest.json
$run = [guid]::NewGuid().ToString()
$work = Join-Path $root "work\$run"
New-Item -ItemType Directory -Path $work -ErrorAction Stop
New-Item -ItemType Directory -Path "$work\screenshots","$work\outputs" -ErrorAction Stop
Copy-Item "$root\isolation-review.json" "$work\isolation-review.json"
Copy-Item "$kit\templates\observations.json" "$work\observations.json"
Copy-Item "$kit\templates\local-mapping.json" "$work\local-mapping.json"
& "$kit\preflight.ps1" -TestRoot $root -BazisExe $exe -IsolationReview "$work\isolation-review.json" |
  Set-Content -LiteralPath "$work\preflight.json" -Encoding UTF8
& "$kit\verify-input.ps1" -FixtureId $fixture |
  Set-Content -LiteralPath "$work\input-check.json" -Encoding UTF8
```

Остановитесь при любой ошибке, FAIL либо несовпадении SHA. Проверку SHA выполнять **непосредственно перед каждым импортом**, включая повтор: повторный native запуск = новый run UUID и новый work directory. Нельзя использовать старый успешный input-check после правки файла.

В observations.json заполните fixture_id/run_id; order_id/revision_id/job_id/calculation_id — новые offline UUID (`[guid]::NewGuid().ToString()`), не ID существующих заказов. Они только связывают ручные evidence и не создают server jobs. Для настоящей staging E2E потребуются отдельно созданные разрешённые jobs и настоящий lease/attestor contract; kit этого не делает.

## 4. Exact local mappings

В local-mapping.json задайте собственную mapping_version, для каждого material/edge exact local BAZIS ID/name/code, source и verified_by/verified_at, screenshot/native export references. Сохраните cloud identity/hash и исходные article/thickness/format. Manufacturer в synthetic fixture не установлен: не выдумывайте производителя по похожему коду. `NOT PROVIDED IN SYNTHETIC SOURCE` — допустимое описание происхождения, не production mapping.

Синтетические SKU-L1/L2/W1/W2 требуют четырёх различимых записей **в отдельной тестовой базе**, явно оформленных оператором как synthetic. Не маппить похожие production SKU. Без точного mapping — `needs_material_mapping`, остановить fixture. Шаблон охватывает source material-18 и четыре edge IDs; если другой sidecar содержит иные identities, добавьте их дословно с identity_sha256 из sidecar. Reference №69 требует собственных exact записей после чтения оригинала, не synthetic map.

## 5. Ручной import и наблюдения

1. Убедитесь в CLEAR preflight, SHA и exact mappings. Запишите started_at с timezone.
2. Вручную запустите выбранный EXE; подтвердите About/file version. Только тестовая БД/настройки, без machine export/физического производства.
3. Импортируйте **именно** путь input выбранного ID из manifest.json. Не исправляйте XML, геометрию, qty или material ради ожидаемого результата. Отказ импорта — полезный отрицательный результат, не повод подменить файл.
4. Выполните только разрешённый ручной расчёт. Сохраните screenshots по `SCREENSHOTS.md`, оригинальные outputs/native export/report в `$work\outputs`. Сохраните messages/errors. Не делайте dump диска/общие logs.
5. Заполните observations.json фактическими значениями и относительными ссылками `screenshots/...`, `outputs/...`. `observed` — реально видимое поле; `not_exposed_review` — поле не представлено/имеет другое имя: запишите факт и screenshot, не предполагаемый mapping. Такой статус требует отдельного review и не закрывает invariant.
6. expected_comparison заполните **фактически наблюдёнными** значениями для сравнения с immutable sidecar. Несовпадение/отсутствие нельзя заменить expected. Finished relation/stages, отсутствующие в native export, остаются NOT VERIFIED; kit не добавляет их в native XML. Запишите completed_at/version/operator/attestor/mapping version, warnings/fatal errors. Attestor ID не цифровая подпись.
7. Сохраните evidence перед следующим fixture. Никакие секреты/пароли/токены, полные command lines или чужие файлы в package не включать; проверьте screenshots на PII. Collector копирует только эту run directory, но не является полноценным DLP-сканером.

```powershell
& "$kit\collect-evidence.ps1" -TestRoot $root -FixtureId $fixture -RunId $run
```

Collector создаёт новый `$root\evidence\native-run-<timestamp>-<run_id>\manifest.json`, copies inputs/sidecar/preflight/review/mapping/observations, screenshots/outputs, SHA/size/mtime. Не редактирует originals, не перезаписывает evidence. Объём ограничен 500 файлами/1 GiB, 256 MiB на файл. Неизвестный native extension требует отдельного review; не переименовывайте его в разрешённый ради обхода. Если копирование прервано до manifest — package incomplete, сохраните его для разбора; новый сбор создаёт новый каталог.

## 6. Отдельные сценарии

- Four-edge: доказать L1/L2/W1/W2, оси, material, qty=3, 600×400, grain/rotation. Стороны не объединять.
- 18+18: finished 600×400 q3; software blank 620×420 q6. Показать, что БАЗИС действительно импортировал, layers/child→finished/stages, отсутствие удвоения finished qty/расхода и grain. Если native не несёт final relationship/L+W stage, записать это явно; не считать автоматически подтверждённым. Геометрия не утверждает тарифы.
- Reference №69: см. `reference/69/README.md`; ID `reference-69`, отдельный run, оригинал readonly, no reconstruction.
- Crash JOB-06: **не выполнять сейчас**. Отдельный `JOB06.md`, отдельное разрешение после обычного native import. Kit не содержит kill/retry/Agent команд.

## 7. Проверка и возврат

На машине с Python 3.10+ из доверенной копии kit:

```powershell
python "$kit\validate-evidence.py" "C:\MartinForestCalibration\evidence\native-run-..."
```

Путь примера замените фактическим. Validator работает offline, без server credentials. Ровно три статуса: READY_FOR_HUMAN_NATIVE_REVIEW / INCOMPLETE_EVIDENCE / HASH_MISMATCH. READY означает проверяемый комплект и согласованность заявленных фактов, **не BAZIS PASS**. Подлинность screenshots/наблюдений, подпись attestor, native semantics и calibration activation проверяет человек отдельным этапом. Пока любой обязательный invariant не доказан, gate CLOSED.

Верните приватно полный каталог каждого run в ZIP, без удаления preflight/failed observations, и текстовый список: fixture IDs/run UUIDs, версия БАЗИС, machine pseudonym, mapping version, operator ID, трудности/отказы. Не возвращайте только screenshots. №69/клиентские данные не коммитить. Сохраните исходные outputs до подтверждения приёмки и hashes после копирования архива.

Cleanup: автоматического удаления нет. После подтверждённого получения evidence и решения владельца можно вручную удалить **только созданный выделенный test root**. Не трогать установленный БАЗИС, shared mappings, службы, production пути, Resilio. Никакой calibration record этим kit не активируется.
