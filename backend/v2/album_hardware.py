"""Project-wide installed fittings for the customer album."""
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from itertools import chain
import re

from .assistant_model import BLUM_PLATES, DOOR_HINGES
from .customer_hardware import light_components, module_components
from .estimate_drilling import _joint, _normal
from .sales_hardware import LEGACY
from .three_d_document import with_installed_drawer_depths
from .wardrobe_estimate import data_file
from .wardrobe_lighting_kit import project_lighting_kits


def name_for_album(name):
    # Pack sizes belong to procurement. The album counts the fittings in the furniture.
    name = re.sub(r'\s*\((?:упак\.|уп/)[^)]*\)', '', name, flags=re.I)
    name = re.sub(r'\s*\(1\s*кг\s*=\s*\d+\s*шт\)', '', name, flags=re.I)
    return ' '.join(name.split())


def sku_text(value):
    return ' '.join((value or '').split())


@dataclass(frozen=True)
class FittingCatalogue:
    photos: dict
    vendor_articles: dict
    blum: dict
    native_hinges: dict


@lru_cache(maxsize=1)
def catalogue():
    products, aliases = {}, {}
    for sku, part in data_file('hardware').items():
        products[sku] = (part.get('photo'), bool(part.get('photoSeries')))
        if part.get('vendorArticle'):
            aliases[sku_text(part['vendorArticle'])] = sku
    blum = {p['article']:('hinge', p) for p in DOOR_HINGES.values() if p.get('brand') == 'Blum'}
    blum.update({p['article']:('plate', p) for p in BLUM_PLATES.values()})
    for sku, (_, fit) in blum.items():
        products[sku] = (fit['photo'].removeprefix('/account/planner/'), False)

    # Older native cabinets sometimes omit the SKU on an otherwise identical hinge.
    # Resolve only full, unambiguous names from the pinned native catalog.
    named = defaultdict(set)
    for cabinet in LEGACY.values():
        hw = cabinet['hardware']
        candidates = [(r['name'], r.get('article')) for r in hw['items']]
        candidates.append((hw.get('hinge_name') or '', hw.get('hinge_article')))
        for name, article in candidates:
            if article and name.casefold().startswith('петля '):
                named[name_for_album(name).casefold()].add(sku_text(article))
    native_hinges = {name: next(iter(skus)) for name, skus in named.items() if len(skus) == 1}
    return FittingCatalogue(products, aliases, blum, native_hinges)


def fitting(raw, qty, unit):
    book = catalogue()
    name = name_for_album(raw['name'])
    article = sku_text(raw.get('article')) or book.native_hinges.get(name.casefold(), '')
    article = book.vendor_articles.get(article, article)
    # A short manufacturer SKU can represent both nickel and onyx on saved door parts.
    if name.endswith('· ONS') and article + '-ONS' in book.blum:
        article += '-ONS'
    joint = None if article else _joint(_normal(name))
    if joint == 'joint:confirmat':
        article = '73116'
    photo, series = book.photos.get(article, (None, False))
    if joint == 'joint:cam':
        photo, series = 'shelf-images/cam.webp', True
    role = family = None
    if article in book.blum:
        role, model = book.blum[article]
        family = ('Blum', model['finish'])
    elif name.casefold() == 'чашка петли никель gtv':
        role, family = 'hinge', ('GTV', 'никель')
    elif name.casefold() == 'ответная планка 3d с саморезами для петель gtv никель':
        role, family = 'plate', ('GTV', 'никель')
    return dict(name=name, article=article, qty=None if qty is None else Decimal(str(qty)), unit=unit,
                images=[(article, photo, series)], role=role, family=family, detail='')


def identity(row):
    # 05.0360 is printed on both a foot and a foot base in the native library.
    known_article = row['article'] in catalogue().photos and row['article'] != '05.0360'
    distinct_name = '' if known_article else row['name'].casefold()
    if row['article'] == '05.0360':
        if 'база' in distinct_name:
            distinct_name = 'база'
        elif 'ножка' in distinct_name:
            distinct_name = 'ножка'
    return row['article'], distinct_name, row['unit'], row['detail']


def accumulate(rows, part):
    key = identity(part)
    if key in rows:
        qty = rows[key]['qty']
        rows[key]['qty'] = None if qty is None or part['qty'] is None else qty + part['qty']
    else:
        rows[key] = part


def hinge_kits(parts):
    # Pair on the same saved door/module, before combining identical kits across the project.
    families = defaultdict(lambda: defaultdict(list))
    for part in parts:
        if part['family'] and part['unit'] == 'pcs' and part['qty'] is not None and part['qty'] > 0:
            families[part['family']][part['role']].append(part)
    for (brand, finish), members in families.items():
        if len(members['hinge']) != 1 or len(members['plate']) != 1:
            continue
        hinge, plate = members['hinge'][0], members['plate'][0]
        qty = min(hinge['qty'], plate['qty'])
        hinge['qty'] -= qty
        plate['qty'] -= qty
        if brand == 'Blum':
            models = catalogue().blum
            h, p = models[hinge['article']][1], models[plate['article']][1]
            kind = {'overlay':'накладная', 'half':'полунакладная', 'inset':'вкладная'}[h['kind']]
            closing = {'soft':'с доводчиком', 'standard':'с пружиной', 'springless':'без пружины'}[h['closing']]
            name = f"Петля Blum {h['series']} {h['angle']}° · {kind}, {closing}"
            shape = 'прямая' if p['shape'] == 'straight' else 'крестообразная'
            detail = f"Планка H0 {shape} · " + ('оникс' if finish == 'ONS' else 'никель')
        else:
            name, detail = 'Петля GTV · никель', 'Чашка и ответная планка 3D с саморезами'
        article = ' + '.join(p['article'] for p in (hinge, plate) if p['article'])
        yield {**hinge, 'name':name, 'article':article, 'detail':detail, 'unit':'set', 'qty':qty,
               'images':hinge['images'] + plate['images']}
    yield from (part for part in parts if part['qty'] != 0)


def order(row):
    name = row['name'].casefold()
    if row['role'] or 'петл' in name:
        group = 0
    elif re.search(r'ящик|направляющ|карго|корзин|сушк|ручка|подъ[её]м', name):
        group = 1
    elif name.startswith(('саморез', 'шуруп', 'гвозд', 'стяжк', 'конфирмат', 'конфермат', 'шкант', 'винт ')):
        group = 3
    else:
        group = 2
    return group, name, row['detail'], row['article']


def project_rows(scene):
    items = scene['items']
    lighting = project_lighting_kits(items)
    rows = {}
    for item in with_installed_drawer_depths(items):
        kit = lighting.get(item.get('item_id'))
        components = chain(module_components(item), light_components(kit) if kit else ())
        parts = {}
        for raw, qty, unit, _ in components:
            if qty != 0:
                accumulate(parts, fitting(raw, qty, unit))
        for part in hinge_kits(parts.values()):
            accumulate(rows, part)
    return sorted(rows.values(), key=order)
