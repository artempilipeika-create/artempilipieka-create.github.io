"""Customer-visible module contents, derived from saved components and cut lengths."""
from collections import Counter
from decimal import Decimal
from .album_layout import TYPES
from .sales_hardware import module_hardware, purchasing_rows
from .sales_album import UNITS, client_title
from .three_d_base import refresh_base_source
from .three_d_open_tall import open_tall_metrics
from .three_d_vitrine import vitrine_metrics
from .wardrobe_lighting_kit import LIGHTING, REEL_MM, project_lighting_kits


def number(value):
    return format(Decimal(str(value)).normalize(), 'f').replace('.', ',')


def money(value):
    return format(Decimal(str(value)), '.2f').replace('.', ',') if value is not None else '—'


def measured(qty, unit):
    if qty is None:
        return 'Уточняется'
    if unit == 'pair':
        return number(qty) + (' пара' if qty == 1 else ' пары' if qty in (2, 3, 4) else ' пар')
    return number(qty) + ' ' + UNITS.get(unit, unit)


def pack_text(count, size, label):
    return f'{count} × {number(size / 1000)} м · {label}'


def light_rows(kit):
    """Match installed lengths to their actual reel SKU or bar cutting plan."""
    lengths = Counter()
    for line in kit['lines']:
        lengths[LIGHTING[line['system']]['led_article']] += line['fitted']
    stock = {}
    for bar in kit['stock']:
        sku = bar['article']
        lengths[sku] += sum(kit['lines'][i]['length'] for i in bar['lines'])
        stock[sku] = bar['length']
    for product in kit['rows']:
        sku, qty = product['article'], product['qty']
        installed = purchase = measured(qty, 'pcs')
        if sku in lengths:
            installed = measured(lengths[sku] / 1000, 'm')
            purchase = pack_text(qty, stock.get(sku, REEL_MM), 'хлыст' if sku in stock else 'бобина')
        yield dict(name=product['name'], article=sku, installed=installed, purchase=purchase,
                   price=money(product['price']), amount=money(product['amount']))


def module_groups(items):
    groups = {}
    for pos, item in enumerate(items, 1):
        meta = item.get('assistant_carcass') or {}
        gid = meta.get('group_id')
        # The manual shelf/divider recipes predate assistant_carcass.
        manual = (item.get('module_type') == 'blank' and
                  (item.get('name') or '').startswith(('Шкаф с полками ', 'Шкаф с перегородкой ')))
        key = ('item', pos)
        if gid:
            key = ('cabinet', gid)
        elif manual and ':' in item.get('item_id',''):
            key = ('manual', item['item_id'].rpartition(':')[0])
        groups.setdefault(key, []).append(item)
    for index, ((kind, _), parts) in enumerate(groups.items(), 1):
        first = parts[0]
        if kind in ('cabinet', 'manual'):
            title = next((p['assistant_carcass']['name'] for p in parts if (p.get('assistant_carcass') or {}).get('name')), '')
            if not title:
                title = next(((p.get('name') or '').split(' · ')[0] for p in parts
                              if p.get('item_id', '').endswith((':left', ':top', ':right')) and ' · ' in (p.get('name') or '')), '')
            if not title or title.casefold() in ('корпус ии', 'шкаф ии'):
                title = f'Шкаф {index:02d}'
        else:
            title = first.get('name') or TYPES.get(first.get('module_type'), 'Модуль')
        yield title, parts


def module_rows(parts):
    counts, profiles = {}, {}
    for item in parts:
        rows, _ = module_hardware(item)
        rows, _ = purchasing_rows(refresh_base_source(item), rows)
        metrics = open_tall_metrics(item) or vitrine_metrics(item)
        if metrics and metrics.get('light_profile_article'):
            sku = metrics['light_profile_article']
            profiles[sku] = (sum(metrics['light_profile_cuts_mm']), metrics['light_profile_stock_mm'])
        for row in rows:
            qty = row['qty']
            if qty == 0:
                continue
            key = (row['name'], str(row['article'] or ''), row['unit'])
            before = counts.get(key, 0)
            counts[key] = None if before is None or qty is None else before + Decimal(str(qty))
    result = []
    for (name, article, unit), qty in counts.items():
        installed = purchase = measured(qty, unit)
        if article in profiles and unit == 'pcs':
            length, stock = profiles[article]
            installed, purchase = measured(length / 1000, 'm'), pack_text(qty, stock, 'хлыст')
        result.append(dict(name=name, article=article, installed=installed, purchase=purchase))
    return result


def light_caption(kit):
    spans = Counter(number(line['length']) for line in kit['lines'])
    cuts = ' + '.join((f'{qty} × ' if qty > 1 else '') + span for span, qty in spans.items())
    load = sum(Decimal(str(g['watts'])) for g in kit['groups'])
    return f'Линии подсветки — {cuts} мм. Расчётная нагрузка {number(load)} Вт.'


def build(name, scene):
    items = scene.get('items') or []
    if not items:
        raise ValueError('Добавьте мебель в проект.')
    kits = project_lighting_kits(items)
    modules = []
    for title, parts in module_groups(items):
        rows = module_rows(parts)
        module = dict(name=title, rows=rows)
        for item in parts:
            kit = kits.get(item.get('item_id'))
            if kit:
                rows.extend(light_rows(kit))
                module.update(light_total=money(kit['subtotal']), complete=kit['complete'],
                              lighting=light_caption(kit), sensor=any(g['control'] for g in kit['groups']),
                              estimate_holders=any(r['article'] == '77267' for r in kit['rows']) and
                              (((item.get('assistant_carcass') or {}).get('spec') or {}).get('lightKit') or {}).get('holders') is None)
        modules.append(module)
    return dict(name=client_title(name), order=(scene.get('albumSettings') or {}).get('order_number') or '', modules=modules)
