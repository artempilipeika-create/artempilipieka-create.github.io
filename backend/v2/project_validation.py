"""Useful project errors without echoing submitted values or arbitrary keys."""
FIELDS = {
    'name': 'Название', 'width': 'Ширина', 'height': 'Высота', 'depth': 'Глубина',
    'x': 'Положение X', 'z': 'Положение Z', 'rotation': 'Поворот',
    'body_height': 'Высота корпуса', 'base_height': 'Высота основания',
    'legHeightMm': 'Ножки', 'rearServiceGapMm': 'Задний зазор',
    'worktop_thickness': 'Толщина столешницы', 'countertopThicknessMm': 'Толщина столешницы',
    'countertopDepthMm': 'Глубина столешницы', 'countertopStockLengthMm': 'Длина заготовки столешницы',
    'body_variant_id': 'Материал корпуса', 'front_variant_id': 'Материал фасада',
    'back_variant_id': 'Материал задней стенки', 'plinthMaterialId': 'Материал цоколя',
    'countertopMaterialId': 'Материал столешницы', 'part_materials': 'Материалы деталей',
    'material_variant_id': 'Материал полки', 'shelves': 'Полки', 'offset_mm': 'Положение полки',
    'thickness': 'Толщина полки', 'width_clearance': 'Зазор полки по ширине',
    'depth_clearance': 'Зазор полки по глубине', 'source_component': 'Исходный компонент',
    'bazis_id': 'Модель БАЗИС', 'bazis_file': 'Файл БАЗИС', 'bazis_sha256': 'Версия модели БАЗИС',
    'glass_shelf_count': 'Стеклянные полки', 'upper_shelf_count': 'Верхние полки',
    'production_note': 'Заметка', 'appliance_details': 'Встраиваемая техника',
    'features': 'Замер комнаты', 'survey': 'Замер комнаты', 'version': 'Версия проекта',
    'request_id': 'Запрос сохранения', 'selected_item_id': 'Выбранный модуль',
}
REASONS = {
    'int_from_float': 'нужны целые миллиметры', 'int_type': 'нужно целое число',
    'int_parsing': 'нужно целое число', 'float_parsing': 'нужно число',
    'multiple_of': 'координаты должны быть кратны 0,5 мм',
    'greater_than_equal': 'значение меньше допустимого', 'less_than_equal': 'значение больше допустимого',
    'literal_error': 'недопустимый вариант', 'missing': 'обязательное поле не заполнено',
    'extra_forbidden': 'редактор передал неподдерживаемый параметр',
    'uuid_parsing': 'некорректный идентификатор', 'uuid_type': 'некорректный идентификатор',
    'string_too_long': 'превышена допустимая длина', 'string_too_short': 'значение не заполнено',
    'too_long': 'слишком много элементов', 'finite_number': 'нужно конечное число',
}
MODEL_REASONS = {
    'Leg height and legacy base height must agree': 'Высота ножек и основания не совпадает.',
    'Countertop thickness aliases must agree': 'Два значения толщины столешницы не совпадают.',
    'Module height must equal base plus body; worktop is separate': 'Общая высота модуля должна равняться высоте корпуса плюс основание.',
    'Shelf position must stay inside the cabinet body': 'Полка выходит за пределы корпуса.',
    'Worktop is supported only for compatible lower modules': 'Столешница назначена несовместимому модулю.',
    'Suspended modules have no floor base': 'У навесного шкафа не должно быть напольного основания.',
    'Kitchen legs require a lower cabinet': 'Кухонные ножки допустимы только для нижнего шкафа.',
    'Room feature outside measured envelope': 'Элемент замера выходит за пределы комнаты.',
    'Room survey and features disagree': 'Отметка о замере не соответствует списку элементов комнаты.',
    'Duplicate room feature id': 'В замере повторяется идентификатор элемента.',
    'Door must start at floor': 'Дверной проём должен начинаться от пола.',
    'Ширина модуля с одной дверью не должна превышать 600 мм': 'Ширина модуля с одной дверью не должна превышать 600 мм.',
    'Ширина НШД-600 всегда 600 мм': 'Ширина НШД-600 всегда 600 мм.',
    'Исходный файл витрины не совпадает с проверенной моделью': 'Исходный файл витрины не совпадает с проверенной моделью.',
}

def project_validation_issues(errors):
    issues=[]
    for err in errors[:8]:
        loc=err.get('loc',())
        # Only a numeric index and known labels leave the server. Never return
        # input, ctx, Pydantic's raw message, or user-supplied extra field names.
        item_index=loc[loc.index('items')+1] if 'items' in loc and len(loc)>loc.index('items')+1 else None
        item_index=item_index if type(item_index) is int else None
        field=next((FIELDS[k] for k in reversed(loc) if isinstance(k,str) and k in FIELDS),'Параметры')
        reason=REASONS.get(err.get('type'),'параметры не согласованы; откройте «Проверить проект»')
        model_reason=str((err.get('ctx') or {}).get('error',''))
        reason=MODEL_REASONS.get(model_reason,reason)
        prefix=f'Модуль {item_index+1}' if item_index is not None else 'Комната' if 'room' in loc else 'Проект'
        issues.append({'item_index':item_index,'message':f'{prefix} · {field}: {reason}'})
    return issues
