"""A dated wardrobe quotation, built from the same panel geometry and BOM as production."""
import base64
import gzip
import hashlib
import json
import os
from collections import defaultdict
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from . import sheet_estimator
from .estimate_drilling import drill_key
from .sales_hardware import module_hardware, purchasing_rows
from .three_d_document import WARDROBE_RODS, with_installed_drawer_depths
from .wardrobe_lighting_kit import project_lighting_kits, pack_lengths

DATA = Path(__file__).with_name('estimate_data')
GROUPS = {'hardware': 'Фурнитура', 'materials': 'Материалы', 'work': 'Работы'}
UNITS = {'m': 'м', 'm2': 'м²', 'pcs': 'шт.', 'pair': 'пар', 'set': 'компл.'}
CUT = dict(kerf_mm='4.4', trim_left_mm=10, trim_right_mm=10, trim_top_mm=10, trim_bottom_mm=10)
CENT = Decimal('0.01')


def decimal(value):
    return Decimal(str(value))


def cents(value):
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def data_file(name):
    return json.loads((DATA / (name + '.json')).read_text())


@lru_cache(maxsize=1)
def ratebook():
    fragments = [v for k, v in sorted(os.environ.items()) if k.startswith('MF_WARDROBE_RATES_PART_')]
    book = data_file('materials')
    if fragments:
        book.update(json.loads(gzip.decompress(base64.b64decode(''.join(fragments), validate=True))))
    prices = data_file('hardware')
    for sku, product in list(prices.items()):
        if vendor_article := product.get('vendorArticle'):
            prices.setdefault(vendor_article, product)
    return book, prices, data_file('drilling')


class Lines:
    def __init__(self):
        self.groups = {group: {} for group in GROUPS}

    def add(self, group, key, name, qty, unit, rate=None, *, record=None, reason=None, article=None, photo=None):
        if qty == 0:
            return
        rows = self.groups[group]
        if key in rows:
            row = rows[key]
            row['qty'] = None if qty is None or row['qty'] is None else row['qty'] + decimal(qty)
            return
        record = record or {}
        rows[key] = dict(key=key, name=name, qty=None if qty is None else decimal(qty), unit=unit,
                         rate=None if rate is None else decimal(rate), article=article, photo=photo,
                         source=record.get('source'), checked=record.get('date'), photoSeries=bool(record.get('photoSeries')),
                         reason=reason or ('Требуется цена' if rate is None else None))

    def work(self, operations, key, qty, label=None, unit='м'):
        record = operations.get(key, {})
        self.add('work', key, record.get('name') or label or key, qty, record.get('unit', unit), record.get('price'), record=record)

    def finish(self, markup, date):
        groups = {}
        factor = 1 + decimal(markup) / 100
        base_total = Decimal(0)
        customer_total = Decimal(0)
        missing = 0
        for key, title in GROUPS.items():
            items = []
            base_before, customer_before = base_total, customer_total
            for row in self.groups[key].values():
                qty, rate = row['qty'], row['rate']
                base = amount = None
                if qty is not None and rate is not None and not row['reason']:
                    base = cents(qty * rate)
                    base_total += base
                    # Keep the invoice, its sections and the account percentage equal to the cent.
                    new_total = cents(base_total * factor)
                    amount, customer_total = new_total - customer_total, new_total
                item = {k: v for k, v in row.items() if k not in ('qty','rate')}
                item.update(qty=None if qty is None else float(qty), baseUnit=None if rate is None else float(rate),
                            unitPrice=None if rate is None else float((rate * factor).quantize(Decimal('.000001'))),
                            base=None if base is None else float(base), amount=None if amount is None else float(amount))
                items.append(item)
            count = sum(row['amount'] is None for row in items)
            missing += count
            groups[key] = dict(title=title, rows=items, missing=count, base=float(base_total-base_before),
                               total=float(customer_total-customer_before))
        result = dict(date=date, currency='BYN', markup=float(markup), groups=groups, missing=missing,
                      base=float(base_total), total=float(customer_total), complete=missing == 0)
        result['fingerprint'] = hashlib.sha256(json.dumps(result, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        return result


def decor_label(record):
    return ' '.join(str(s) for s in (record.get('type'), record.get('brand'), record.get('code'),
                    record.get('texture'), record.get('name')) if s)


def panel_costs(scene, book, lines):
    operations = book['operations']
    sheets = {v: row for row in book['sheets'] for v in row.get('variantIds', [])}
    edges = {(r['brand'], r['code'], r['texture'], r['width'], decimal(r['thickness'])): r for r in book['edges']}
    batches = defaultdict(list)
    for item in scene.get('items', []):
        name = item['name']
        if item.get('module_type') != 'blank':
            lines.add('materials', 'unmeasured:'+item['item_id'], name, None, 'м²', reason='Нужна деталировка модуля')
            continue
        length, width, thickness = (decimal(item['blank_'+v+'_mm']) for v in ('length','width','thickness'))
        shelf = item.get('blank_shelf') or ''
        if item.get('blank_front_frame') == 'Z1' or (shelf and not shelf.startswith('board/')):
            frame = item.get('blank_front_frame') == 'Z1'
            area = (length-decimal(27.5))*(width-decimal(27.5)) if frame else length*width
            glass = 'Стекло для фасада Z1' if frame else 'Стекло для полок '+str(thickness)+' мм'
            lines.add('materials', glass, glass, area/1000000, 'м²')
            if frame:
                lines.add('hardware','frame-z1','Алюминиевый профиль Z1',(length+width)*2/1000,'м')
            continue
        variant = str(item.get('body_variant_id') or item.get('front_variant_id') or '')
        identity = scene.get('materialIdentities', {}).get(variant, {})
        board = sheets.get(variant, {})
        if board and decimal(board['thickness']) != thickness:
            board = {}
        label = decor_label(board) if board else ' '.join(x for x in (identity.get('manufacturer'),identity.get('article')) if x) or ('Плита '+name)
        label += ' · '+str(thickness)+' мм'
        material_key = variant or label
        bits = item.get('blank_edge_code') or '0000'
        long_sides, short_sides = bits[:2].count('1'), bits[2:].count('1')
        edge_t = decimal(item.get('blank_edge_thickness_mm', 1))
        edge_m = (length*long_sides+width*short_sides)/1000
        if edge_m:
            tape_width = 22 if thickness <= 18 else (42 if thickness <= 36 else None)
            match = edges.get((board.get('brand'), board.get('code'), board.get('texture'), tape_width, edge_t))
            if match is None and tape_width == 42:
                match = edges.get((board.get('brand'), board.get('code'), board.get('texture'), 43, edge_t))
            match = match or {}
            tape = 'Кромка ПВХ '+str(match.get('width') or tape_width or '—')+' × '+str(edge_t)+' мм · '+label
            lines.add('materials','edge:'+material_key+':'+str(thickness)+':'+str(edge_t),tape,edge_m,'м',match.get('price'),record=match)
            edge_key = 'edgeComplex' if min(width,length)<60 else 'edgeThick' if thickness>22 else 'edgeNormal'
            lines.work(operations,edge_key,edge_m)
        raw_l, raw_w = length-short_sides*edge_t, width-long_sides*edge_t
        lines.add('materials','sheet:'+material_key+':'+str(thickness),label,raw_l*raw_w/1000000,
                  'м²',board.get('price'),record=board)
        batches[(material_key,thickness)].append(dict(detail_id=item['item_id'],length=str(raw_l),width=str(raw_w),
                                                     qty=1,grain='length',rotation=False))
        lines.work(operations,'pack',length*width/1000000,unit='м²')
        for op in item.get('blank_machining') or []:
            kind = op['kind']
            label_op = {'groove':'Фрезеровка паза','rabbet':'Выборка четверти','miter':'Запил под 45°'}[kind]
            span = length if op['edge'].startswith('x') else width
            tariff = 'mill16to18' if 16<=thickness<=18 and kind in ('groove','rabbet') else kind
            lines.work(operations,tariff,(span-decimal(op.get('start') or 0)-decimal(op.get('end') or 0))/1000,label_op)
        grip = item.get('blank_edge_pull')
        if grip:
            span = decimal(item['height'] if grip['edge'] in ('left','right') else item['width'])
            lines.work(operations,'mill16to18' if 16<=thickness<=18 else 'gripGroove',span/1000,'Фрезеровка под врезную ручку')
    for (variant,thickness), parts in batches.items():
        sizes = book.get('sheetFormats',{}).get(variant)
        rate_key = 'cutHdf' if thickness in (3,4) else 'cut18' if 10<=thickness<=18 else 'cut36' if thickness==36 else 'cut:'+str(thickness)
        if sizes:
            try:
                plan = sheet_estimator.estimate(dict(length=str(sizes[0]),width=str(sizes[1])),parts,CUT)
                lines.work(operations,rate_key,plan['cut_metres'],'Раскрой плиты '+str(thickness)+' мм')
                continue
            except sheet_estimator.PlacementError:
                pass
        lines.add('work','cut-missing:'+variant+':'+str(thickness),'Раскрой · '+(decor_label(sheets.get(variant,{})) or 'плита '+str(thickness)+' мм'),
                  None,'м',reason='Уточнить формат листа или карту раскроя')
    if scene.get('plinths') or scene.get('wallPanels') or scene.get('worktops'):
        lines.add('materials','kitchen-accessories','Общие элементы кухни',None,'',reason='Требуется отдельный расчёт')


def rod_lengths(spec):
    inner = spec['width']-2*spec['thickness']
    n, t = spec['sections'], spec['thickness']
    if positions := spec.get('dividerPositions'):
        widths = [end-start for start,end in zip([0,*[x+t for x in positions]],[*positions,inner])]
    else:
        w, extra = divmod(inner-t*(n-1),n)
        widths = [w+int(i<extra) for i in range(n)]
    for rod in spec.get('rods') or []:
        width = widths[rod['section']]
        if rod.get('column') is not None:
            zone = next(z for z in spec['nicheSplits'] if z['section']==rod['section'] and z['level']==rod['level'])
            left = zone.get('leftWidth') or (width-18+1)//2
            width = left if rod['column']==0 else width-18-left
        product = WARDROBE_RODS[rod['article']]
        yield rod['article'], width-product['cutAllowance'], product['holderArticle']


def hardware_costs(scene, book, prices, drilling, lines):
    items = scene.get('items') or []
    kits = project_lighting_kits(items)
    cuts = defaultdict(list)
    operations = book['operations']
    for item in with_installed_drawer_depths(items):
        rows, warnings = module_hardware(item)
        rows, _ = purchasing_rows(item,rows)
        for note in warnings:
            if note == 'Нет проверенной ведомости фурнитуры' and item.get('module_type')=='blank':
                continue
            lines.add('hardware','note:'+note,note,None,'',reason='Уточнить комплектацию')
        kit = kits.get(item['item_id'])
        if kit:
            rows += kit['rows']
            if not all(line['fitted'] for line in kit['lines']):
                lines.add('hardware','lighting-fit','Комплект подсветки',None,'',reason='Уточнить длину подсветки')
        spec = (item.get('assistant_carcass') or {}).get('spec') or {}
        feet = spec.get('feet') or {}
        panel_key = item['item_id'].rpartition(':')[2]
        if feet.get('article')=='118779' and spec.get('bottomFit')=='none' and panel_key.startswith('divider-'):
            positions=spec.get('dividerPositions') or []
            if feet.get('layout')=='width' and not positions:
                n,t=spec['sections'],spec['thickness']
                w,extra=divmod(spec['width']-(n+1)*t,n)
                positions=[(w+t)*i+min(i,extra)-t for i in range(1,n)]
            index=int(panel_key[8:]) if panel_key[8:].isdigit() else -1
            central=(0<=index<len(positions) and spec['width']>800 and abs(positions[index]+1.5*spec['thickness']-spec['width']/2)<9)
            if feet.get('layout')!='width' or central:
                rows += [dict(article=sku,name=label,unit='pcs',qty=2) for sku,label in (
                    ('118779','Регулятор уровня М6 чёрный'),('106466','Муфта регулятора М6 вбиваемая'))]
        if item['item_id'].endswith(':top') and spec.get('rods'):
            rows=[r for r in rows if r['article'] not in WARDROBE_RODS]
            for sku, length, holder in rod_lengths(spec):
                cuts[sku].append((length,item['item_id']))
                rows.append(dict(article=holder, name='Держатель штанги AKS · '+holder, unit='pcs', qty=2))
        for row in rows:
            article, name, qty, unit = row.get('article') or '', row['name'], row['qty'], row['unit']
            article = str(article).replace('\xa0',' ').strip()
            product = prices.get(article,{})
            profile = drill_key(item,row,drilling)
            rule = drilling.get(profile)
            # The BOM gives the entire eccentric joint. The shop sells its two components separately.
            if (profile or '').endswith('joint:confirmat') and not article:
                article='73116'
                product=prices.get(article,{})
            if (profile or '').endswith('joint:cam') and not article:
                for sku in ('108917','88567'):
                    part=prices.get(sku,{})
                    rate=decimal(part['price'])/decimal(part['pack']) if part else None
                    lines.add('hardware',sku+':pcs',part.get('name') or 'Стяжка · '+sku,qty,'шт.',rate,
                              record=part,article=sku,photo=part.get('photo'))
            if rule is None and item.get('module_type')=='blank' and row not in (kit or {}).get('rows',[]):
                lines.add('work','drilling-unverified:'+(article or name),'Присадка · '+name,None,'шт.',
                          reason='Уточнить схему присадки')
            if rule is not None and qty is not None:
                for hole in rule:
                    key = 'drill:'+str(hole['diameter'])+':'+hole['kind']
                    kind = {'end':'торцевое','blind':'глухое','through':'сквозное'}[hole['kind']]
                    lines.work(operations,key,decimal(qty)*hole['count'],'Присадка Ø'+str(hole['diameter'])+', '+kind,'шт.')
            if (profile or '').endswith('joint:cam') and not article:
                continue
            if unit=='m' and product.get('stockMm') and qty is not None:
                cuts[article].append((float(decimal(qty)*1000),item['item_id']))
                continue
            rate = decimal(product['price'])/decimal(product['pack']) if product else None
            lines.add('hardware',(article or name)+':'+unit,name,qty,UNITS.get(unit,unit),rate,record=product,
                      article=article or None,photo=product.get('photo'),reason='Уточнить количество' if qty is None else None)
    for article,pieces in cuts.items():
        product = prices.get(article,{})
        length = product.get('stockMm')
        ok = length and all(0 < span <= length for span,_ in pieces)
        qty = len(pack_lengths(pieces,length,4.4)) if ok else None
        lines.add('hardware',article+':stock',product.get('name') or 'Профиль · '+article,qty,'хлыст',
                  product.get('price'),record=product,article=article,photo=product.get('photo'),
                  reason=None if ok else 'Уточнить длину хлыста')


def calculate(scene, markup=0, date=None, rates=None):
    book, prices, drilling = rates or ratebook()
    lines = Lines()
    panel_costs(scene,book,lines)
    hardware_costs(scene,book,prices,drilling,lines)
    return lines.finish(markup,date or datetime.now(ZoneInfo('Europe/Minsk')).date().isoformat())
