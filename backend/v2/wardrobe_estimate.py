"""A dated wardrobe quotation, built from the same panel geometry and BOM as production."""
import base64
import gzip
import hashlib
import json
import os
import re
from collections import defaultdict
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from . import kitchen_estimate as kitchen
from .kitchen_worktop import with_default_worktops
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
    def __init__(self, breakdown=None):
        self.breakdown = breakdown
        self.groups = {group: {} for group in GROUPS}

    def add(self, group, key, name, qty, unit, rate=None, *, record=None, reason=None, article=None, photo=None):
        if qty == 0:
            return
        if self.breakdown:
            self.breakdown.track(group,key,qty)
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

    def owner(self, item):
        if self.breakdown:
            self.breakdown.current = kitchen.source_owner(item)

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
        if self.breakdown:
            result['modules'] = self.breakdown.finish(result)
        result['fingerprint'] = hashlib.sha256(json.dumps(result, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        return result


def decor_label(record):
    return ' '.join(str(s) for s in (record.get('type'), record.get('brand'), record.get('code'),
                    record.get('texture'), record.get('name')) if s)


def panel_costs(scene, book, lines):
    operations = book['operations']
    sheets = {v: row for row in book['sheets'] for v in row.get('variantIds', [])}
    edges = defaultdict(list)
    for edge in book['edges']:
        edges[edge['brand'],edge['code'],edge['texture'],edge['width'],decimal(edge['thickness'])].append(edge)
    batches = defaultdict(list)
    owners = {}
    for item in scene.get('items', []):
        name = item['name']
        lines.owner(item)
        if item.get('module_type') != 'blank':
            lines.add('materials', 'unmeasured:'+item['item_id'], name, None, 'м²', reason='Нужна деталировка модуля')
            continue
        length, width, thickness = (decimal(item['blank_'+v+'_mm']) for v in ('length','width','thickness'))
        shelf = item.get('blank_shelf') or ''
        if item.get('estimate_glass') or item.get('blank_front_frame') == 'Z1' or (shelf and not shelf.startswith('board/')):
            frame = item.get('blank_front_frame') == 'Z1'
            area = (length-decimal(27.5))*(width-decimal(27.5)) if frame else length*width
            glass = 'Стекло для фасада Z1' if frame else 'Стекло '+str(thickness)+' мм'
            lines.add('materials', glass, glass, area/1000000, 'м²')
            if frame:
                lines.add('hardware','frame-z1','Алюминиевый профиль Z1',(length+width)*2/1000,'м')
            continue
        variant = str(item.get('body_variant_id') or item.get('front_variant_id') or '')
        identity = scene.get('materialIdentities', {}).get(variant, {})
        board = sheets.get(variant, {})
        if board and decimal(board['thickness']) != thickness:
            board = {}
        label = decor_label(board) if board else ' '.join(x for x in (identity.get('manufacturer'),identity.get('article')) if x) or name
        label += ' · '+str(thickness)+' мм'
        material_key = variant or label
        raw_l, raw_w = length, width
        dimensions = {'length':length,'width':width}
        parts = item.get('estimate_edges')
        if parts is None:
            bits = item.get('blank_edge_code') or '0000'
            parts = [dict(span=span,thick=item.get('blank_edge_thickness_mm',1),clip=True)
                     for bit,span in zip(bits,['length','length','width','width']) if bit=='1']
        totals = defaultdict(Decimal)
        if item.get('estimate_edge_review'):
            lines.add('materials','edge-plan:'+item['item_id'],name+' · схема кромления',None,'м',reason='Сверить оклейку с фрагментом БАЗИС')
        for edge in parts:
            et=decimal(edge['thick'])
            totals[et] += decimal(edge['mm'])/1000 if 'mm' in edge else dimensions[edge['span']]/1000
            if edge.get('clip') and edge.get('span')=='length':
                raw_w-=et
            if edge.get('clip') and edge.get('span')=='width':
                raw_l-=et
        for edge_t,edge_m in totals.items():
            widths=(22,23) if thickness<=18 else (42,43) if thickness<=36 else ()
            candidates=[v for w in widths for v in edges.get((board.get('brand'),board.get('code'),board.get('texture'),w,edge_t),[])]
            if lines.breakdown:
                candidates=kitchen.edge_options(board,edge_t,thickness,candidates)
            match=max(candidates,key=lambda r:r['price'],default={})
            tape='Кромка ПВХ '+str(match.get('width') or next(iter(widths),'—'))+' × '+str(edge_t)+' мм · '+label
            lines.add('materials','edge:'+material_key+':'+str(thickness)+':'+str(edge_t.normalize()),tape,edge_m,'м',match.get('price'),record=match)
            edge_key='edgeComplex' if min(width,length)<60 else 'edgeThick' if thickness>22 else 'edgeNormal'
            lines.work(operations,edge_key,edge_m)
        lines.add('materials','sheet:'+material_key+':'+str(thickness),label,raw_l*raw_w/1000000,
                  'м²',board.get('price'),record=board)
        owners[item['item_id']]=item
        batches[(material_key,thickness)].append(dict(detail_id=item['item_id'],length=str(raw_l),width=str(raw_w),
                                                     qty=1,grain='length',rotation=False))
        lines.work(operations,'pack',length*width/1000000,unit='м²')
        for cut in item.get('estimate_cuts',()):
            qty=None if cut['mm'] is None else decimal(cut['mm'])/1000
            lines.work(operations,cut['key'],qty,cut['name'])
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
                cuts={}
                sheet_estimator.estimate(dict(length=str(sizes[0]),width=str(sizes[1])),parts,CUT,cut_by_detail=cuts)
                for ident,metres in cuts.items():
                    lines.owner(owners[ident])
                    lines.work(operations,rate_key,metres,'Раскрой плиты '+str(thickness)+' мм')
                continue
            except sheet_estimator.PlacementError:
                pass
        for part in parts:
            lines.owner(owners[part['detail_id']])
            lines.add('work','cut-missing:'+variant+':'+str(thickness),'Раскрой · '+(decor_label(sheets.get(variant,{})) or 'плита '+str(thickness)+' мм'),
                      None,'м',reason='Уточнить формат листа или карту раскроя')



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


def drill_costs(operations, lines, rule, qty):
    for hole in rule:
        key = 'drill:'+str(hole['diameter'])+':'+hole['kind']
        kind = {'end':'торцевое','blind':'глухое','through':'сквозное'}[hole['kind']]
        lines.work(operations,key,decimal(qty)*hole['count'],'Присадка Ø'+str(hole['diameter'])+', '+kind,'шт.')


def hardware_costs(scene, book, prices, drilling, lines, geometry=None):
    items = scene.get('items') or []
    kits = project_lighting_kits(items)
    cuts = defaultdict(list)
    operations = book['operations']
    for item in with_installed_drawer_depths(items):
        lines.owner(item)
        owner=kitchen.source_owner(item)
        measured=(geometry or {}).get('modules',{}).get(item['item_id']) or {}
        rows, warnings = module_hardware(item)
        rows, _ = purchasing_rows(item,rows)
        if measured and (item.get('kitchenFilling') or {}).get('backMount'):
            rows=[r for r in rows if r.get('article')!='16181' and not r['name'].lower().startswith('гвозди')]
        for note in warnings:
            if measured and (item.get('kitchenFilling') or {}).get('backMount'):
                note = re.sub(r'(?: · )?(?:Паз|Четверть) под ЛХДФ 3 мм · [0-9.,]+ × [0-9.,]+ мм$', '', note)
                if not note:
                    continue
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
        drawer_drilling=kitchen.metal_drawer_drilling(item) if measured else {}
        for index,holes in drawer_drilling.items():
            lines.breakdown.current=(owner[0],index)
            drill_costs(operations,lines,holes,1)
        for drawer,row in kitchen.drawer_rows(item,rows,measured.get('panels',[]),measured.get('guideDepth')) if measured else ((None,r) for r in rows):
            if lines.breakdown:
                lines.breakdown.current=(owner[0],drawer if drawer is not None else owner[1])
            article, name, qty, unit = row.get('article') or '', row['name'], row['qty'], row['unit']
            article = str(article).replace('\xa0',' ').strip()
            if kitchen.is_kitchen(item) and re.search(r'blum|бл[юу]м|legrabox|леграбокс|tandembox|тандембокс|movento', name, re.I):
                lines.add('hardware','blum:'+str(article or name),name,qty,UNITS.get(unit,unit),reason='BLUM пока не оценивается',article=article)
                continue
            product = prices.get(article,{})
            profile = drill_key(item,row,drilling)
            rule = [] if drawer in drawer_drilling else drilling.get(profile)
            if measured and (article=='16181' or name.lower().startswith('гвозди')):
                rule=[]
            if measured and rule is None:
                rule=kitchen.native_rule(item,row)
            if measured:
                # An explicit empty list in the source means no machining on boards.
                from .estimate_drilling import _joint, _normal
                joint = _joint(_normal(name))
                if joint:
                    profile=joint
                    if rule is None:
                        rule=drilling.get(joint)
            if measured and rule is None:
                lines.add('work','drilling-unverified:'+(article or name),'Присадка · '+name,None,'шт.',
                          reason='Уточнить схему присадки')
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
                drill_costs(operations,lines,rule,qty)
            if (profile or '').endswith('joint:cam') and not article:
                continue
            if unit=='m' and product.get('stockMm') and qty is not None:
                cuts[article].append((float(decimal(qty)*1000),item['item_id']))
                continue
            rate = decimal(product['price'])/decimal(product['pack']) if product else None
            lines.add('hardware',((article+'·'+name) if article=='05.0360' else (article or name))+':'+unit,name,qty,UNITS.get(unit,unit),rate,record=product,
                      article=article or None,photo=product.get('photo'),reason='Уточнить количество' if qty is None else None)
    for article,pieces in cuts.items():
        product = prices.get(article,{})
        length = product.get('stockMm')
        ok = length and all(0 < span <= length for span,_ in pieces)
        qty = len(pack_lengths(pieces,length,4.4)) if ok else None
        if lines.breakdown:
            owners={lines.breakdown.by_item.get(key) for _,key in pieces}
            lines.breakdown.current=owners.pop() if len(owners)==1 else (kitchen.SHARED,None)
        lines.add('hardware',article+':stock',product.get('name') or 'Профиль · '+article,qty,'хлыст',
                  product.get('price'),record=product,article=article,photo=product.get('photo'),
                  reason=None if ok else 'Уточнить длину хлыста')


def calculate(scene, markup=0, date=None, rates=None):
    scene = with_default_worktops(scene)
    book, prices, drilling = rates or ratebook()
    items = scene.get('items') or []
    has_kitchen = any(kitchen.is_kitchen(it) for it in items) or bool(scene.get('wallPanels') or scene.get('plinths'))
    lines = Lines(kitchen.Breakdown(items) if has_kitchen else None)
    geometry = None
    if has_kitchen:
        geometry=kitchen.project_geometry(scene)
        panels=[]
        for it in items:
            module=geometry['modules'].get(it['item_id'])
            if module is None:
                panels.append(it)
            else:
                owner=kitchen.source_owner(it)[0]
                panels.extend(kitchen.board_panel(p,owner,book,it.get('body_variant_id')) for p in module['panels'])
        panels.extend(kitchen.board_panel(p,kitchen.SHARED,book) for p in geometry['extraPanels'])
        panel_costs({**scene,'items':panels},book,lines)
        for op in geometry['operations']:
            lines.breakdown.current=lines.breakdown.by_item.get(op.get('item'),(kitchen.SHARED,None))
            qty=decimal(op['mm'])/1000 if 'mm' in op else op['qty']
            lines.work(book['operations'],op['key'],qty,op['name'],op.get('unit','м'))
        lines.breakdown.current=(kitchen.SHARED,None)
        for issue in geometry['issues']:
            lines.add('work','shared:'+issue,issue,None,'',reason='Уточнить конструкцию')
    else:
        panel_costs(scene,book,lines)
    hardware_costs(scene,book,prices,drilling,lines,geometry)
    return lines.finish(markup,date or datetime.now(ZoneInfo('Europe/Minsk')).date().isoformat())


def customer_totals(quote):
    """Only customer selling amounts are passed from the estimate into the album."""
    groups = {}
    for group in quote['groups'].values():
        if group['rows']:
            priced = group['missing'] < len(group['rows'])
            groups[group['title']] = group['total'] if priced else None
    has_price = any(amount is not None for amount in groups.values())
    return dict(date=quote['date'], total=quote['total'] if has_price else None,
                complete=has_price and quote['complete'], missing=quote['missing'], groups=groups)
