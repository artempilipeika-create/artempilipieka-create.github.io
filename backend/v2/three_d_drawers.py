"""Shared verified AQ LineBox / Slimbox donors; no guessed purchasing rows."""
import json
from pathlib import Path
VARIANTS=json.loads((Path(__file__).parent/'cabinet_assets/planner/drawer-variants.json').read_text())
GOLA_METAL=[v for v in json.loads((Path(__file__).parent/'cabinet_assets/planner/gola-variants.json').read_text()) if v['kind']=='drawers' and v['system']!='ball']
BY_ID={v['id']:v for v in VARIANTS+GOLA_METAL}

def drawer_variant(it):
    v=BY_ID.get(it.get('bazis_id'))
    return v if v and v['source_sha256']==it.get('bazis_sha256') else None

def elastic(v,axis,value,delta):
    planes=[p for p in v['model_elastic'] if p['Axis']==axis]
    total=sum(p['Weight'] for p in planes)
    return value+(delta*sum(p['Weight'] for p in planes if value>p['Pos'])/total if total else 0)

def matches(rules,value):
    return next((r['Count'] for r in rules if value<=r['Length']+1e-7),0)==1

def drawer_configuration(it,v=None):
    v=v or drawer_variant(it)
    if not v:return [],'Фрагмент ящиков не совпадает с проверенным исходником'
    delta=it['height']-(it.get('legHeightMm') or it.get('base_height') or 100)-720
    rows=[]
    for index,d in enumerate(v['elastic_drawers'],1):
        y=elastic(v,1,d['y'],delta)
        height=elastic(v,1,d['y']+d['height'],delta)-y
        h=next((h for h in d['heights'] if matches(h['rules'],height)),None)
        kit=next((k for k in h['lengths'] if matches(k['rules'],it['depth'])),None) if h else None
        error=('Для этой высоты в исходном фрагменте нет подходящего ящика' if not h else
               'Для этой глубины в исходном фрагменте нет подходящих направляющих' if not kit else kit.get('error',''))
        if error:return rows,f'Ящик {index}: {error}.'
        rows.append(dict(index=index,y=y,height=height,kit=kit))
    return rows,''

def drawer_front_heights(it):
    v=drawer_variant(it)
    if not v:return []
    delta=it['height']-(it.get('legHeightMm') or it.get('base_height') or 100)-720
    return [round(elastic(v,1,p['center'][1]+p['size'][1]/2,delta)-elastic(v,1,p['center'][1]-p['size'][1]/2,delta),4)
            for p in v['panels'] if p['role']=='front']

def drawer_contents(it):
    v=drawer_variant(it)
    if not v:return ''
    layout={'two':'2 ящика','three':'3 ящика','inner':'2 + внутренний'}[v['layout']]
    opening='Push to open' if v['opening']=='push' else 'с доводчиком'
    fronts=' + '.join(f'{h:g}'.replace('.',',') for h in drawer_front_heights(it))
    drawers,error=drawer_configuration(it)
    if error:raise ValueError(error)
    lengths=' / '.join(str(n) for n in dict.fromkeys(d['kit']['length_mm'] for d in drawers))
    body=it['height']-(it.get('legHeightMm') or it.get('base_height') or 100)
    return (f"{v['manufacturer']} · {v['series']}; {layout}; {opening}. Белая фурнитура; направляющие {lengths} мм. "
            f"Фасады снизу вверх: {fronts} мм. Корпус {body} мм; дно и задние стенки ящиков — 16 мм в декоре корпуса. "
            +('Внутренний H84 — с доводчиком, держатель 113187, ручка с поводком 94123. ' if v['layout']=='inner' else '')
            +'Номинальные размеры фасадов — до 0,1 мм; исходные контуры FR3D больше на 0,04 мм.')


def drawer_hardware(it):
    v=drawer_variant(it)
    if not v:return []
    height=it.get('legHeightMm') or it.get('base_height') or 100
    rows=[]
    for h in v['hardware_items']:
        if h['name'].startswith(('Система ящиков','Ящик высокий AQ','Ящик средний AQ','Ящик низкий AQ','AQ LineBox Направляющая,')):continue
        h=dict(h)
        if height!=100 and (h['name'].startswith('Опора регулируемая') or h['name'].startswith('1031 Ножка пластиковая без базы')):
            h['name']=h['name'].replace('Н100',f'Н{height}').replace('высота 100',f'высота {height}')
            h['article']=None
            h['note']='Артикул опоры этой высоты подобрать по каталогу'
        rows.append(h)
    drawers,error=drawer_configuration(it)
    if error:raise ValueError(error)
    def add(name,article,quantity,unit):
        row=next((h for h in rows if h['name']==name and h['article']==article),None)
        if row:row['quantity']+=quantity
        else:rows.append(dict(key=f'elastic-{len(rows)}',name=name,article=article,quantity=quantity,unit=unit,source='Эластичный комплект из FR3D'))
    for d in drawers:
        kit=d['kit']
        if v['system']=='aq':add('AQ LineBox Направляющая, '+str(kit['length_mm']),None,2,'pcs')
        add(kit['name'],kit['article'],1,'set')
    return rows
