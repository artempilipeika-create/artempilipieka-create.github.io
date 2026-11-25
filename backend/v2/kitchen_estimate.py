"""Measured kitchen parts, shared row accessories and their owners in a quotation."""
import json
import re
import subprocess
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_HALF_UP
from functools import lru_cache
from pathlib import Path
from threading import BoundedSemaphore

from .three_d_document import AKS_GUIDES
from .three_d_drawers import drawer_variant, drawer_configuration

ROOT = Path(__file__).parent
KITCHEN = {'base_cabinet', 'wall_cabinet', 'tall_cabinet'}
SHARED = ('shared', '')
_PROCESSES = BoundedSemaphore(2)


def is_kitchen(item):
    return item.get('module_type') in KITCHEN or bool(((item.get('assistant_carcass') or {}).get('spec') or {}).get('kitchenModel'))


@lru_cache(maxsize=6)
def geometry(payload):
    with _PROCESSES:
        run = subprocess.run(['node', str(ROOT / 'kitchen_geometry.mjs')], input=payload, capture_output=True,
                             check=True, timeout=25)
    return json.loads(run.stdout)


def project_geometry(scene):
    state = {k: scene.get(k) for k in ('items', 'room', 'plinths', 'wallPanels', 'materialIdentities')}
    state['room'] = state['room'] or {'width':6000, 'depth':4000, 'height':2700}
    return geometry(json.dumps(state, sort_keys=True, separators=(',', ':')).encode())


def board_panel(part, owner, book, body_id=None):
    variant = part.get('variant')
    if not variant and part['role']=='drawer' and body_id:
        selected=next((s for s in book['sheets'] if body_id in s.get('variantIds',[])),{})
        matches=[s for s in book['sheets'] if selected and all(s.get(k)==selected.get(k) for k in ('brand','code','texture'))
                 and s['thickness']==part['thickness'] and s.get('variantIds')]
        if len(matches)==1:
            variant=matches[0]['variantIds'][0]
    if not variant and part.get('materialName') and part['thickness'] == 3:
        name = part['materialName'].upper().replace(' ', '')
        if 'ЛХДФ' in name and 'БЕЛ' in name and 'PREMIUM' not in name:
            white = next((s for s in book['sheets'] if s['code']=='ЛХДФ БЕЛЫЙ' and s.get('variantIds')), None)
            if white:
                variant = white['variantIds'][0]
    return dict(item_id=part['id'], name=part['name'], module_type='blank', body_variant_id=variant,
                blank_length_mm=part['length'], blank_width_mm=part['width'], blank_thickness_mm=part['thickness'],
                estimate_edges=part['edges'], estimate_cuts=part['cuts'], estimate_glass=part.get('glass'),
                estimate_role=part['role'], estimate_edge_review=part.get('edgeReview',False), estimate_owner=owner, estimate_drawer=part.get('drawer'))


def source_owner(item):
    if 'estimate_owner' in item:
        return item['estimate_owner'], item.get('estimate_drawer')
    group = item.get('assistant_carcass') or {}
    if group:
        if item.get('blank_plinth_run'):
            return SHARED, None
        gid = group['group_id']
        match = re.match(r'drawer-(\d+)-(\d+)-', item['item_id'].removeprefix(gid+':'))
        return ('item',gid), (int(match[1]),int(match[2])) if match else None
    return ('item',item['item_id']), None


def money_part(value):
    return value.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)


class Breakdown:
    """Allocate each already-rounded invoice line. Drawer rows are included in their module."""
    def __init__(self, items):
        self.owners = {}
        self.quantities = defaultdict(dict)
        self.by_item = {}
        self.current = None
        for item in items:
            key, drawer = source_owner(item)
            self.by_item[item['item_id']] = (key,drawer)
            meta = item.get('assistant_carcass') or {}
            dims = meta.get('spec') or item
            self.owners.setdefault(key,dict(id=key[1],name=meta.get('name') or item['name'],
                                            width=dims.get('width'),height=dims.get('height'),depth=dims.get('depth')))

    def track(self, group, key, qty):
        amounts = self.quantities[group,key]
        if qty is None or amounts.get(self.current,0) is None:
            amounts[self.current] = None
        else:
            amounts[self.current] = amounts.get(self.current,0) + Decimal(str(qty))

    def finish(self, result):
        def entry():
            return {'base':Decimal(0),'total':Decimal(0),'missing':set()}
        sums = defaultdict(entry)
        for group_id,group in result['groups'].items():
            for row in group['rows']:
                owners = self.quantities.get((group_id,row['key']),{})
                known = sum(q or 0 for q in owners.values())
                cumulative = prev_base = prev_total = Decimal(0)
                for owner, qty in owners.items():
                    if owner is None:
                        continue
                    module, drawer = owner
                    if row['amount'] is None:
                        for target in {(module,None), (module,drawer)}:
                            sums[target]['missing'].add((group['title'],row['key']))
                        continue
                    if not known:
                        continue
                    cumulative += qty
                    base = money_part(Decimal(str(row['base']))*cumulative/known)
                    total = money_part(Decimal(str(row['amount']))*cumulative/known)
                    for target in {(module,None),(module,drawer)}:
                        sums[target]['base'] += base-prev_base
                        sums[target]['total'] += total-prev_total
                    prev_base, prev_total = base, total

        def summary(key):
            s=sums[key]
            return {'base':float(s['base']),'total':float(s['total']),'missing':len(s['missing'])}
        rows=[]
        for module, meta in self.owners.items():
            if module == SHARED:
                continue
            drawers=sorted(k[1] for k in sums if k[0]==module and k[1] is not None)
            children=[]
            for drawer in drawers:
                label = 'Шуфляда '+str(drawer if isinstance(drawer,int) else drawer[1]+1)
                if isinstance(drawer,tuple) and len({d[0] for d in drawers})>1:
                    label+=' · блок '+str(drawer[0]+1)
                children.append(dict(name=label,**summary((module,drawer))))
            rows.append(dict(**meta,**summary((module,None)),drawers=children))
        if (SHARED,None) in sums:
            rows.append(dict(id=None,name='Общие элементы кухни',width=None,height=None,depth=None,
                             **summary((SHARED,None)),drawers=[]))
        return rows


def drawer_rows(item, rows, panels, guide_depth=None):
    """Keep discrete kits and runners with the actual drawer that owns them."""
    indices = sorted({p['drawer'] for p in panels if p.get('drawer')})
    variant = drawer_variant(item)
    kits = defaultdict(list)
    if variant:
        configured, error = drawer_configuration(item,variant)
        if not error:
            for d in configured:
                kit=d['kit']
                kits[kit.get('article'),kit['name']].append(d['index'])
    for row in rows:
        name = row['name']
        article = row.get('article') or ''
        owners = kits.get((article,name))
        if owners and len(owners)==row['qty']:
            for index in owners:
                yield index,dict(row,qty=1)
            continue
        if not article and re.search(r'шариков\w*.*PRIME|PRIME.*шариков',name,re.I):
            from .three_d_document import drawer_slide_length
            length=drawer_slide_length(guide_depth or item['depth'])
            rail=AKS_GUIDES.get(str(length))
            if rail:
                row=dict(row,article=rail['article'],name='Направляющие шариковые PRIME by AKS '+str(length)+' мм',unit='set')
        record=native_book().get(item.get('bazis_sha256'),{})
        places=(record.get('owners') or {}).get(name+'|'+article,[])
        if places and row.get('qty') is not None and all(i in [0,*indices] for i in places):
            quantities=Counter(places)
            if len(places)==row['qty']:
                for index,n in quantities.items():
                    yield index or None,dict(row,qty=n)
                continue
            # Kit contents also appear in FR3D. Only the loose screws on the purchase
            # schedule are bought separately, once per drawer.
            if indices and set(quantities)==set(indices) and row['qty']%len(indices)==0 and name.lower().startswith(('шуруп','саморез')):
                for index in indices:
                    yield index,dict(row,qty=row['qty']//len(indices))
                continue
        if indices and row.get('qty')==len(indices) and ('направляющ' in name.lower() or name.lower().startswith('ручка')):
            for index in indices:
                yield index, dict(row,qty=1)
        else:
            yield None,row

@lru_cache(maxsize=1)
def edge_tariffs():
    return json.loads((ROOT/'estimate_data'/'edge_tariffs.json').read_text())


def edge_options(board, thickness, board_thickness, exact):
    """Highest available rate for this board, decoration and compatible tape size."""
    widths = (22,23) if board_thickness<=18 else (42,43) if board_thickness<=36 else ()
    if not board or not widths:
        return exact
    decor = str(board.get('name','')).lower()
    brand = board.get('brand','').upper()
    texture = str(board.get('texture','')).upper()
    wood = re.search(r'дуб|орех|ясень|сосн|ольх|кл[её]н|венге|каштан|бук\b|пихт|вяз\b|вишн|акаци|гикори|бер[её]з|лиственниц|тик\b|\bель\b|палисандр|дерев|зебрано|кедр|таксус|бодега|ноче\b|барнвуд|артвуд|блэквуд|черешн|кипарис|граб\b',decor)
    group = 'декорированная' if wood or brand=='EGGER' and str(board.get('code','')).startswith('H') else 'однотонная'
    white = bool(re.search(r'\bбелый\b',decor)) and not wood
    matches=list(exact)
    for row in edge_tariffs():
        if row['width'] not in widths or not row['minT']<=thickness<=row['maxT']:
            continue
        supplier,g=row['supplier'],row['group']
        if supplier=='ABC Egger' and brand!='EGGER' or supplier=='Dekta' and brand!='DEKTA':
            continue
        ok = g==group or white and g=='белая базовая'
        if supplier=='Dekta':
            ok=bool(texture and texture in [s.strip().upper() for s in g.split(',')])
        if ok:
            matches.append(row)
    return matches

@lru_cache(maxsize=1)
def native_book():
    return json.loads((ROOT/'estimate_data'/'kitchen_native.json').read_text())


def native_rule(item, row):
    records=native_book().get(item.get('bazis_sha256'),{}).get('drilling',{})
    name=row['name']
    article=row.get('article') or ''
    exact=records.get(name+'|'+article)
    if exact is not None:
        return exact
    if article:
        options=[holes for key,holes in records.items() if key.endswith('|'+article)]
    else:
        options=[holes for key,holes in records.items() if key.partition('|')[0].strip()==name.strip()]
    if options and all(rule==options[0] for rule in options):
        return options[0]
    return None

def metal_drawer_drilling(item):
    variant=drawer_variant(item)
    record=native_book().get(item.get('bazis_sha256'),{})
    if not variant or not record.get('holes') or variant.get('system') not in ('aq','slimbox'):
        return {}
    default={**item,'height':820,'legHeightMm':100,'base_height':100,'depth':510}
    original,err=drawer_configuration(default,variant)
    current,err_now=drawer_configuration(item,variant)
    if err or err_now:
        return {}
    result={}
    for new,old in zip(current,original):
        index=new['index']
        if new['kit'].get('article') and new['kit']['article']==old['kit'].get('article') and str(index) in record['holes']:
            result[index]=record['holes'][str(index)]
    return result
