"""Cargo variants and purchasing rules, audited from six exact FR3D sources."""
import json
from pathlib import Path
VARIANTS=json.loads((Path(__file__).parent/'cabinet_assets/planner/cargo-variants.json').read_text())
BY_ID={v['id']:v for v in VARIANTS}
def cargo_variant(it):
    v=BY_ID.get(it.get('bazis_id'))
    return v if v and v['source_sha256']==it.get('bazis_sha256') else None
def cargo_base(it):return it.get('legHeightMm') or it.get('base_height') or 100
def cargo_kit(it):
    v=cargo_variant(it)
    return next((k for k in v['kits'] if k['width']==it.get('width')),None) if v else None
def cargo_error(it):
    v=cargo_variant(it)
    if not v:return 'Карго не совпадает с проверенным исходником'
    k=cargo_kit(it)
    if k and k.get('error'):return k['error']
    if it['width'] not in v['allowed_widths']:return 'Карго '+v['brand'].upper()+': ширина только '+', '.join(map(str,v['allowed_widths']))+' мм'
    if it.get('module_type')!='base_cabinet' or it.get('base')=='wall' or cargo_base(it) not in (80,100,150):return 'Карго: нижний модуль на ножках 80, 100 или 150 мм'
    if not 600<=it['height']-cargo_base(it)<=1000 or not 510<=it['depth']<=700:return 'Карго: высота корпуса 600–1000, глубина 510–700 мм'
    return ''
def cargo_adjustment(it):
    notes=[]
    if cargo_base(it)!=100:notes.append(f"В БАЗИС заменить опоры 100 мм на {cargo_base(it)} мм.")
    if it['depth']!=510:notes.append('В БАЗИС проверить изменение глубины: задняя царга сохраняет 80 мм, передняя царга и комплект карго перемещаются к фасаду без растяжения.')
    return ' '.join(notes) or None
def cargo_hardware(it):
    error=cargo_error(it)
    if error:raise ValueError(error)
    v=cargo_variant(it);k=cargo_kit(it);rows=[dict(h) for h in v['hardware_items']]
    if cargo_base(it)!=100:
        for h in rows:
            if 'Опора регулируемая' in h['name'] or 'Ножка пластиковая без базы' in h['name']:
                h['name']=h['name'].replace('Н100','Н'+str(cargo_base(it))).replace('высота 100','высота '+str(cargo_base(it)))
                h['article']=None;h['note']='Артикул опоры этой высоты подобрать по каталогу'
    rows.append(dict(key='cargo-kit',name=k['name'],article=k['article'],quantity=1,unit='set'))
    for p in v['profiles']:
        rows.append(dict(key=p['article'],name=p['material_name'],article=p['article'],quantity=it['width']/1000,unit='m',cut_length_mm=it['width'],stock_length_mm=5500,note='Отрезок на модуль; закупку хлыстов считать по раскрою всего ряда'))
    return rows
def cargo_contents(it):
    v=cargo_variant(it);k=cargo_kit(it)
    return f"{v['brand'].upper()} · {it['width']} мм; комплект {k['article']}; "+('боковое крепление слева' if k['mounting']=='side_left' else 'нижнее крепление')+'; один выдвижной фасад; '+('Gola L без подсветки' if v['execution']=='gola' else 'накладная ручка')
