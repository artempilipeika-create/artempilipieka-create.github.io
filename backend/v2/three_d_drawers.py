"""Shared verified AQ LineBox / Slimbox donors; no guessed purchasing rows."""
import json
from pathlib import Path
VARIANTS=json.loads((Path(__file__).parent/'cabinet_assets/planner/drawer-variants.json').read_text())
BY_ID={v['id']:v for v in VARIANTS}

def drawer_variant(it):
    v=BY_ID.get(it.get('bazis_id'))
    return v if v and v['source_sha256']==it.get('bazis_sha256') else None

def drawer_contents(it):
    v=drawer_variant(it)
    if not v:return ''
    layout={'two':'2 ящика','three':'3 ящика','inner':'2 + внутренний'}[v['layout']]
    opening='Push to open' if v['opening']=='push' else 'с доводчиком'
    fronts=' + '.join(f'{h:g}'.replace('.',',') for h in v['front_heights'])
    return (f"{v['manufacturer']} · {v['series']}; {layout}; {opening}. Белая фурнитура; длина 500 мм. "
            f"Фасады снизу вверх: {fronts} мм. Корпус 720 мм; дно и задние стенки ящиков — 16 мм в декоре корпуса. "
            +('Внутренний H84 — с доводчиком, держатель 113187, ручка с поводком 94123. ' if v['layout']=='inner' else '')
            +'Номинальные размеры фасадов — до 0,1 мм; исходные контуры FR3D больше на 0,04 мм.')


def drawer_hardware(it):
    v=drawer_variant(it)
    if not v:return []
    height=it.get('legHeightMm') or it.get('base_height') or 100
    rows=[]
    for h in v['hardware_items']:
        h=dict(h)
        if height!=100 and (h['name'].startswith('Опора регулируемая') or h['name'].startswith('1031 Ножка пластиковая без базы')):
            h['name']=h['name'].replace('Н100',f'Н{height}').replace('высота 100',f'высота {height}')
            h['article']=None
            h['note']='Артикул опоры этой высоты подобрать по каталогу'
        rows.append(h)
    return rows
