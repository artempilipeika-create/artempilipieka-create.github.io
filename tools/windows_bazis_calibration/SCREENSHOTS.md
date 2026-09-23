# Screenshot checklist — каждый run

Минимум 3 PNG/JPEG: version/about; imported parts/materials; detail/edges/orientation. Реально нужных кадров может быть больше: все обязательные значения должны быть читаемыми без предположений. Имена файлов связываются через observations.evidence, не считаются доказательством сами по себе.

- Версия БАЗИС/About и открытый fixture; без паролей/клиентских вкладок.
- Материал: exact local ID/code/name, thickness/format; отдельный экран mapping и источник.
- Таблица: qty, L/W, finished/blank dimensions; screenshot native errors/warnings, если есть.
- Асимметричная деталь: ориентиры осей X/Y, длина/ширина и четыре стороны; видимые четыре различные кромки для four-edges (L1=SKU-L1, L2=SKU-L2, W1=SKU-W1, W2=SKU-W2). Должна быть возможна независимая проверка перестановки человеком.
- Grain и разрешённый/запрещённый поворот: фактические UI labels, настройки и вид результата; все три texture cases + width-grain-asymmetric отдельно.
- Orient/Rotation/WithoutBut/Allowance/Overhung: реальные labels/значения. Если поле отсутствует/иначе названо — screenshot соответствующей панели и `not_exposed_review`, без угадывания.
- 18+18: 620×420 q6 blanks; где представлены 600×400 q3 finished, два слоя, child/final links, стадии glue/finish/edge, L+W. Если отсутствуют — отсутствие документируется, invariant остаётся открытым. Расход/finished qty не подменять 6 готовыми деталями.
- Reference: все четыре exact material identities, 120 positions/306 parts, стороны/коды; native export должен позволять проверить все строки, screenshot итога недостаточен.

Скриншоты без редактирования значений. Если требуется скрыть постороннюю PII, лучше переснять чистый тестовый экран; сохраните provenance любых redactions отдельно и не закрывайте проверяемые значения.
