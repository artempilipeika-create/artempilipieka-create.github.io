"""Exact upper donor identities shared with the browser; never substitute a source."""
import json
from pathlib import Path
VARIANTS=json.loads((Path(__file__).parent/'cabinet_assets/planner/upper-variants.json').read_text())
BY_ID={v['id']:v for v in VARIANTS}
EXECUTIONS={'handles':'Накладные ручки','handleless':'Без ручек','push':'Нажатие (tip-on)'}

def upper_variant(it):
    v=BY_ID.get(it.get('bazis_id'))
    return v if v and v['source_sha256']==it.get('bazis_sha256') else None

def upper_error(it,v):
    bounds={'width':(400 if v['filling']=='dryer' else 300,600 if v['door_count']==1 else 900 if v['filling']=='dryer' else 1200),
            'height':(600 if v['filling']=='dryer' else 300,1400),'depth':(250,500)}
    for key,(low,high) in bounds.items():
        if not low<=it[key]<=high:return f'Верхний шкаф: {key} — {low}–{high} мм'
    if v['filling']=='dryer' and it['width']%100:return 'Для сушки ширина модуля меняется с шагом 100 мм'
    return ''

def shelf_count(it,v):
    return (1 if it['height']>850 else 0) if v['filling']=='dryer' else (2 if it['height']>850 else 1)

def upper_adjustment_note(it):
    v=upper_variant(it)
    if not v or v['legacy'] or it['height']==720:return None
    n=shelf_count(it,v)
    marks=[round(it['height']*2/3)] if v['filling']=='dryer' and n else [round(it['height']*(i+1)/(n+1)*2)/2-.5 for i in range(n)]
    return ('Высота отличается от исходных 720 мм. В БАЗИС проверить полки по спецификации сайта: '+
            str(n)+' шт.; центры от низа корпуса: '+(', '.join(f'{y:g}' for y in marks) or 'нет')+' мм. Родные правила FR3D отличаются от правила 850 мм.')

def upper_hardware(it):
    v=upper_variant(it);rows=[]
    if not v or v['legacy']:return rows
    for source in v['hardware_items']:
        h=dict(source)
        if h['article']=='PK 5.0X16B':h['quantity']=4*shelf_count(it,v)
        if h['name'].startswith('Сушка для посуды'):
            h['name']=f"Сушка для посуды {it['width']} MOUNT, белый AKS"
            h['article']=str(113270+(it['width']-400)//100)
        if v['filling']=='dryer' and h['name'].startswith('Конфермат'):h['quantity']+=4*shelf_count(it,v)
        rows.append(h)
    return rows

def upper_contents(it):
    v=upper_variant(it)
    side={'left':'петли слева','right':'петли справа','double':'две створки'}[v['side']]
    return (f"ВМД{v['door_count']}; {EXECUTIONS[v['execution']]}; {side}; "+
            (f"сушка MOUNT {it['width']} мм; " if v['filling']=='dryer' else '')+
            f"полок: {shelf_count(it,v)}; задняя стенка 3 мм."+
            (f" Дно утоплено спереди на {v['bottom_front_inset_mm']:g} мм." if v.get('bottom_front_inset_mm') else ''))
