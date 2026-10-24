"""Sales quantities from the constructor's native catalogue, never from an image."""
from collections import OrderedDict
from copy import deepcopy
import json
from pathlib import Path
from .three_d_document import hardware_for, drawer_slide_length
from .three_d_base import refresh_base_source

LEGACY = json.loads(Path(__file__).with_name('sales_hardware.json').read_text())


def module_hardware(item):
    item = refresh_base_source(item)
    p = LEGACY.get(item.get('bazis_id'))
    if not p:
        rows, note = hardware_for(item)
        return rows, ([note] if note else []) + ([] if rows else ['Нет проверенной ведомости фурнитуры'])
    warnings = []
    if item.get('bazis_sha256') != p['source_sha256']:
        return [], ['Версия исходного шкафа не совпадает с ведомостью']
    hw = deepcopy(p['hardware'])
    rows = hw['items']
    rule = p.get('shelf_rule')
    if rule:
        h = item['height'] - p.get('base_height', 0)
        shelf_count = rule['tall_count'] if h > rule['threshold_mm'] else rule['base_count']
    else:
        shelves = item.get('shelves')
        if shelves is None: shelves = p.get('shelves', [])
        shelf_count = sum(s.get('enabled', True) for s in shelves)
    if not hw.get('native_fixed_items'):
        rows = [r for r in rows if r['key'] != 'shelf-support-marcopol']
        if shelf_count and hw.get('shelf_fixing') != 'confirmat':
            rows.append(dict(key='shelf-support-marcopol',name='Полкодержатель, Marcopol, оцинкованный',quantity=shelf_count*4,unit='pcs'))
        if shelf_count and any('конфермат' in s.get('source_component','').lower() for s in p.get('shelves',[])) and hw.get('shelf_fixing') != 'confirmat':
            warnings.append('Крепление полки: в исходнике конферматы, в ведомости полкодержатели; требуется сверка')
    if hw.get('hinge_count') is not None and not hw.get('hinges_in_items'):
        rows.append(dict(key='hinge',name=hw['hinge_name'],quantity=hw['hinge_count'],unit='pcs',article=hw.get('hinge_article')))
    if hw.get('drawer_count') is not None:
        length = drawer_slide_length(item['depth']) if hw.get('slide_rule') else hw.get('slide_length_mm')
        if length is None: warnings.append('Для глубины шкафа не подобраны направляющие')
        soft = hw.get('slide_type') == 'ball_bearing_soft_close'
        rows.append(dict(key='slides',name=f"Направляющие шариковые L-{length or '?'} h=45 " + ('PRIME by AKS SOFT CLOSE' if soft else 'AKS PLUS'),quantity=hw['drawer_count'],unit='pair'))
    if item.get('handles') == 'handles':
        count = len(p.get('doors',[])) + hw.get('drawer_count',0)
        if count: rows.append(dict(key='handle',name='Ручка мебельная (модель требует выбора)',quantity=count,unit='pcs'))
    if p.get('dryer'):
        for row in rows:
            if row['key'] == 'dish-dryer': row['name'] = f"Сушка для посуды {item['width']} MOUNT, белый AKS"
    if p.get('tier') == 'base' and item.get('legHeightMm',item.get('base_height',100)) != 100:
        warnings.append('Высота опор отличается от исходных 100 мм: требуется подбор')
    return [dict(name=r['name'],qty=r['quantity'],unit=r.get('unit','pcs'),article=r.get('article') or '') for r in rows], warnings


def ledger(scene):
    result = OrderedDict(); warnings = []
    items = scene.get('items') or []
    if not items: raise ValueError('Добавьте шкафчики в проект')
    for i, item in enumerate(items, 1):
        rows, notes = module_hardware(item)
        warnings.extend(f'М{i}: {note}' for note in notes)
        for row in rows:
            # Unknown articles never inherit a similar-looking part's article.
            key = (row['name'],row['article'],row['unit'])
            if key not in result: result[key] = {**row,'qty':0,'modules':[]}
            result[key]['qty'] += row['qty']
            if row['qty'] != 0: result[key]['modules'].append(f'М{i}: {row["qty"]:g}')
    by_article = {}
    for row in result.values():
        if row['article']: by_article.setdefault(row['article'],set()).add(row['name'])
    for article, names in by_article.items():
        if len(names)>1: warnings.append(f'Артикул {article} указан у разных деталей: уточнить перед закупкой')
    return list(result.values()), list(dict.fromkeys(warnings))
