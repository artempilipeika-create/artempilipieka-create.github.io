"""Eight exact FR3D sources, seven configurations in one open tall card."""
import json
import math
from pathlib import Path
from .three_d_vitrine import LIGHTING
VARIANTS=json.loads((Path(__file__).parent/'cabinet_assets/planner/open-tall-variants.json').read_text())
BY_ID={v['id']:v for v in VARIANTS}
def open_tall_variant(it):
    v=BY_ID.get(it.get('bazis_id'))
    return v if v and v['source_sha256']==it.get('bazis_sha256') else None
def open_tall_error(it):
    if not open_tall_variant(it):return 'Открытый пенал не совпадает с проверенным исходником'
    if it.get('module_type')!='tall_cabinet' or it.get('base')=='wall' or it.get('base_height')!=100:return 'Открытый пенал устанавливается на опоры 100 мм'
    if not 300<=it['width']<=600 or not 1800<=it['height']<=2800 or not 300<=it['depth']<=700:return 'Открытый пенал: ширина 300–600, высота 1800–2800, глубина 300–700 мм'
    n=it.get('upper_shelf_count')
    if n is not None and (type(n) is not int or not 1<=n<=8):return 'Количество полок открытого пенала — от 1 до 8'
    return ''
def open_tall_shelves(it):
    n=it.get('upper_shelf_count')
    if n is None:return [1050]
    gap=(it['height']-136-n*18)/(n+1)
    return [round(118+gap+9+i*(gap+18),6) for i in range(n)]
def open_tall_adjustment(it):
    if it.get('upper_shelf_count') is None:return None
    return 'В БАЗИС изменить количество и положение полок ЛДСП 18 мм и их присадку: четыре конфирмата 7 × 50 на полку. В исходнике одна полка с центром 1050 мм от пола. Центры полок: '+', '.join(map(str,open_tall_shelves(it)))+' мм от пола.'
def open_tall_metrics(it):
    v=open_tall_variant(it)
    if not v:return None
    system=LIGHTING.get(v['light_system']);sides=[] if v['lighting']=='none' else ['left','right'] if v['lighting']=='both' else [v['lighting']]
    centers=open_tall_shelves(it);starts=[118,*[y+9 for y in centers]];ends=[*[y-9 for y in centers],it['height']-18]
    segments=[dict(start_mm=round(a,6),end_mm=round(b,6),length_mm=round(b-a,6),led_cut_mm=math.floor((b-a+1e-6)/system['led_cut_step_mm'])*system['led_cut_step_mm'] if system else 0) for a,b in zip(starts,ends)]
    cuts=[s['length_mm'] for _ in sides for s in segments];ledcuts=[s['led_cut_mm'] for _ in sides for s in segments]
    stock=next((s for s in (system or {}).get('profile',{}).get('stock',[]) if s['length_mm']>=it['height']-100),None)
    ledlength=round(sum(ledcuts)/1000,6)
    return dict(light_system=v['light_system'],lighting_sides=sides,groove_width_mm=(system or {}).get('groove_width_mm',0),groove_depth_mm=(system or {}).get('groove_depth_mm',0),
        groove_length_each_mm=it['height']-100 if system else 0,groove_total_m=round((it['height']-100)*len(sides)/1000,6),groove_z_from_back_mm=(it['depth']+18)/2,
        segments=segments,led_cuts_mm=ledcuts,led_order_length_m=ledlength,led_power_w=round(ledlength*(system or {}).get('led_power_w_per_m',0),6),led_voltage_v=(system or {}).get('led_voltage_v'),
        light_profile_cuts_mm=cuts if stock else [],light_profile_stock_mm=stock['length_mm'] if stock else None,light_profile_article=stock['article'] if stock else None,
        light_profile_stock_count=len(sides) if stock else 0,light_profile_end_caps=len(cuts)*2 if stock else 0,shelf_centers_mm=centers,
        lighting_note='Подсветка отдельными отрезками между полками. Лента — рез по 25 мм, отрезки не длиннее проёма. Посадку заглушек и окончательную длину профиля проверить при монтаже. Проводка, соединения, управление и питание 12 В подбираются для группы.' if system else '')
def open_tall_hardware(it):
    error=open_tall_error(it)
    if error:raise ValueError(error)
    v=open_tall_variant(it);m=open_tall_metrics(it);system=LIGHTING.get(v['light_system'])
    rows=[dict(h,quantity=h['quantity']+(4*(len(open_tall_shelves(it))-1) if h['key']==v['confirmat_key'] else 0)) for h in v['hardware_items']]
    if not system:return rows
    rows.append(dict(key=system['led_key'],name=system['led_name'],article=system['led_article'],quantity=m['led_order_length_m'],unit='m',source_url=system['led_url'],cuts_mm=m['led_cuts_mm'],note=m['lighting_note']))
    if system.get('profile'):
        p=system['profile'];s=next(s for s in p['stock'] if s['article']==m['light_profile_article'])
        rows.extend([
            dict(key='light-profile-lira-'+s['article'],name='LIRA-1707 · чёрный профиль с экраном · '+str(s['length_mm'])+' мм',article=s['article'],quantity=m['light_profile_stock_count'],unit='pcs',source_url=s['url'],cuts_mm=m['light_profile_cuts_mm'],stock_length_mm=s['length_mm'],note='Один хлыст на сторону; отрезки между полками, экран включён. Припуск на заглушки проверить при монтаже.'),
            dict(key='light-profile-lira-end-cap',name='Заглушка LIRA-1707, чёрная',article=p['end_cap']['article'],quantity=m['light_profile_end_caps'],unit='pcs',source_url=p['end_cap']['url']),
            dict(key='light-profile-lira-holder',name='Держатель LIRA-1707 · количество по монтажу',article=p['holder']['article'],quantity=None,unit='pcs',source_url=p['holder']['url'],note=p['mount_note']),
            dict(key='light-profile-lira-fasteners',name='Крепёж держателей LIRA-1707 · подбор по монтажу',article=None,quantity=None,unit='set',note='Количество и тип крепежа уточнить по монтажу.')])
    return rows
def open_tall_contents(it):
    v=open_tall_variant(it);m=open_tall_metrics(it)
    text=f"Открытый пенал; корпус, задняя стенка и полки ЛДСП 18 мм. Полки {it['width']-36} × {it['depth']-18-v['shelf_front_setback_mm']} × 18 мм: {len(open_tall_shelves(it))} шт. "
    text+='Дно на всю ширину, боковины стоят на дне. ' if v['bottom_full_width'] else 'Дно между боковинами. '
    if m['lighting_sides']:
        system=LIGHTING[v['light_system']]
        text+=system['label']+' '+{'left':'слева','right':'справа','both':'с двух сторон'}[v['lighting']]+f". Паз {m['groove_width_mm']} × {m['groove_depth_mm']} мм; ось {m['groove_z_from_back_mm']} мм от заднего края; фрезеровка {m['groove_total_m']} м. Лента {system['led_article']}: "+' + '.join(map(str,m['led_cuts_mm']))+f" мм, {m['led_power_w']} Вт. "+m['lighting_note']
        if m['light_profile_cuts_mm']:text+=' Отрезки LIRA: '+' + '.join(map(str,m['light_profile_cuts_mm']))+' мм.'
    else:text+='Без подсветки и фрезеровки под неё.'
    return text+' '+(open_tall_adjustment(it) or 'Центр исходной полки — 1050 мм от пола.')
