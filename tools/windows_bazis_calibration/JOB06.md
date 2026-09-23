# JOB-06 — отложенный crash/reconciliation protocol

НЕ выполнять первым проходом. Требуется отдельное явное разрешение пользователя после принятого обычного native import. Этот kit не устанавливает native adapter, не выдаёт lease, не подключает Agent и не запускает процессы. Само прерывание standalone БАЗИС без серверной цепочки не закрывает JOB-06.

Предусловия: изолированный Windows и только synthetic order; machine/physical outputs отсоединены; exact staging job/revision/run, выданный lease/fencing; исправный native adapter и наблюдаемая staging state machine. Не использовать production. Если этих возможностей нет, NOT VERIFIED — остановиться.

После отдельного разрешения оператор фиксирует native-start evidence, затем разрешённым согласованным способом прерывает **только тестовый процесс** до completion. Не применять команды ко всем процессам по имени. Зафиксировать uncertain/reconciliation-required после потери lease, отсутствие автоматической выдачи другому Agent, rejection старого fencing/lease и явное решение оператора. Не запускать повторное физическое производство. Токены не сохранять: только digest/ID/fencing.

`templates/job06.json` — checklist evidence, не автоматический acceptance. Вернуть timestamps и state/event/audit evidence, hashes и ссылку на обычный run. Основной offline validator не закрывает JOB-06: требуется отдельный human/server-contract review. Пока не пройден весь сценарий, JOB-06 NOT VERIFIED.
