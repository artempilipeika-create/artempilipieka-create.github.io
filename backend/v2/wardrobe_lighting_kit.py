"""Purchasing and fitting quantities for the lighting machined into a custom wardrobe."""
import json
from collections import Counter, defaultdict
from decimal import Decimal
from functools import lru_cache
from math import ceil
from pathlib import Path

from .assistant_model import LIGHTING

ASSETS = Path(__file__).parent / 'cabinet_assets' / 'planner'
REEL_MM = 5000
PROFILE_KERF_MM = 4.4
MAX_OUTPUTS = 6
MAX_UTILIZATION = .8


@lru_cache(maxsize=1)
def catalogue():
    return json.loads((ASSETS / 'wardrobe-light-kit.json').read_text())


def pack_lengths(cuts, capacity, kerf=0, limit=None):
    """Best fit decreasing. A cut stays whole. Kerf applies between cuts on a stock."""
    bins = []
    for length, key in sorted(cuts, key=lambda cut: -cut[0]):
        candidates = [b for b in bins if b['used'] + kerf + length <= capacity + 1e-7
                      and (limit is None or len(b['keys']) < limit)]
        if candidates:
            target = max(candidates, key=lambda b: b['used'])
            target['used'] += kerf + length
            target['keys'].append(key)
        else:
            bins.append({'used': length, 'keys': [key]})
    return bins


def profile_bars(pieces, stock):
    # Try cutting short pieces on short stock as well as packing everything on long stock.
    # Two 1,450 mm and two 510 mm pieces, for example, fit on just two 2 m bars.
    def with_stock(bins):
        return [(next(s for s in stock if b['used'] <= s['length_mm'] + 1e-7), b) for b in bins]
    short, long = stock[0]['length_mm'], stock[-1]['length_mm']
    plans = [with_stock(pack_lengths(pieces, long, PROFILE_KERF_MM))]
    short_pieces = [p for p in pieces if p[0] <= short]
    long_pieces = [p for p in pieces if p[0] > short]
    plans.append(with_stock(pack_lengths(long_pieces, long, PROFILE_KERF_MM) +
                            pack_lengths(short_pieces, short, PROFILE_KERF_MM)))
    return min(plans, key=lambda plan: (sum(s['length_mm'] for s,_ in plan), len(plan)))


def lighting_quote(runs, settings=None):
    data = catalogue()
    settings = settings or {}
    control = settings.get('control', 'touch')
    quantities = Counter()
    notes, lines, groups, stock_cuts = [], [], [], []
    strips, profiles = defaultdict(list), defaultdict(list)
    loads = []
    for number, run in enumerate(runs):
        system, span = run['system'], run['length']
        model = LIGHTING[system]
        step = model['led_cut_step_mm']
        fitted = int((span + 1e-7) // step) * step
        watts = round(fitted * model['led_power_w_per_m'] / 1000, 6)
        lines.append({'label': run['label'], 'system': system, 'length': span, 'fitted': fitted, 'watts': watts})
        if model.get('profile'):
            profiles[system].append((span, number))
        if fitted:
            strips[model['led_article']].append((fitted, number))
            loads.append((watts, number))
            quantities['103033' if model.get('profile') else '92641'] += 1
        else:
            notes.append(f'{run["label"]} · длина паза {span:g} мм. Для целого сегмента ленты нужны {step} мм.')

    for article, pieces in strips.items():
        quantities[article] += len(pack_lengths(pieces, REEL_MM))
    for system, pieces in profiles.items():
        model = LIGHTING[system]
        profile = model['profile']
        stock = sorted(profile['stock'], key=lambda item: item['length_mm'])
        for bought, bar in profile_bars(pieces, stock):
            quantities[bought['article']] += 1
            stock_cuts.append({'article': bought['article'], 'length': bought['length_mm'], 'lines': bar['keys']})
        quantities[profile['end_cap']['article']] += 2 * len(pieces)
        name = model['label'].split()[0]
        holders = settings.get('holders1708' if system == 'lira-1708' else 'holders')
        if holders is None:
            holders = sum(max(2, ceil(span/500)) for span,_ in pieces)
            notes.append(f'Держатели {name} для сметы — 4 шт. на 2 м, минимум 2 на отрезок.')
        else:
            notes.append(f'Держатели {name} по заданию менеджера — {holders} шт.')
        quantities[profile['holder']['article']] += holders
    supplies = sorted(data['supplies'], key=lambda s: s['watts'])
    for group in pack_lengths(loads, supplies[-1]['watts'] * MAX_UTILIZATION, limit=MAX_OUTPUTS):
        supply = next(s for s in supplies if group['used'] <= s['watts'] * MAX_UTILIZATION + 1e-7)
        quantities[supply['article']] += 1
        if control in data['controls']:
            quantities[data['controls'][control]] += 1
        if len(group['keys']) > 1:
            quantities['78715'] += 1
        groups.append({'lines': group['keys'], 'watts': round(group['used'], 4), 'supply': supply['article'],
                       'rated': supply['watts'], 'control': data['controls'].get(control)})
    if groups:
        notes.append('Блок с вилкой и выходным шнуром включён в комплект. Для тесной ниши с затруднённой вентиляцией запас мощности нужно пересмотреть по паспорту AKS.')
    if strips.get(LIGHTING['aq-4x8']['led_article']):
        notes.append('AQ LED-LINE устанавливается в паз. Для каждого отрезка предусмотрен 2-метровый провод со свободным концом. Соединение с лентой и изоляция выполняются на монтаже.')
    if any(len(g['lines']) > 1 for g in groups):
        notes.append('Для разветвителя 78715 сверить допустимый ток с нагрузкой группы. Длины проводов проверить по месту.')
    if len(groups) > 1:
        notes.append('У каждой группы свой блок питания и независимое управление.')
    if control != 'external' and groups:
        notes.append('Место установки выключателя выбирает монтажник. Врезка выполняется на месте.')
    prices = settings.get('prices') or {}
    rows, subtotal = [], Decimal('0')
    for article, product in data['products'].items():
        qty = quantities[article]
        if not qty:
            continue
        price = prices.get(article, product['price'])
        amount = Decimal(str(price)) * qty if price is not None else None
        if amount is not None:
            subtotal += amount
        rows.append(dict(name=product['name'], article=article, qty=qty, unit='pcs', url=product['url'],
                         price=price, amount=float(amount) if amount is not None else None))
    return dict(lines=lines, groups=groups, stock=stock_cuts, rows=rows, notes=notes, subtotal=float(subtotal),
                complete=all(row['price'] is not None for row in rows) and all(line['fitted'] for line in lines),
                checked=data['checked'])


def project_lighting_kits(items):
    """A saved specification is repeated on every panel. Read each actual cut only once."""
    cabinets = {}
    for item in items:
        meta = item.get('assistant_carcass') or {}
        if not meta.get('group_id'):
            continue
        cabinet = cabinets.setdefault(str(meta['group_id']), {'host': item['item_id'], 'runs': [],
                                       'settings': (meta.get('spec') or {}).get('lightKit')})
        if item['item_id'] == str(meta['group_id']) + ':top':
            cabinet['host'] = item['item_id']
        for op in item.get('blank_machining') or []:
            if op.get('lightSystem'):
                span = item['blank_length_mm'] - (op.get('start') or 0) - (op.get('end') or 0)
                cabinet['runs'].append(dict(label=item.get('name') or 'Деталь', system=op['lightSystem'], length=span))
    return {c['host']: lighting_quote(c['runs'], c['settings']) for c in cabinets.values() if c['runs']}
