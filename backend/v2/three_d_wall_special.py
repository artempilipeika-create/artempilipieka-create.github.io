"""Source-pinned upper glass/corner modules; geometry is shared JSON, not guessed templates."""
import json
from pathlib import Path
VARIANTS=json.loads((Path(__file__).parent/'cabinet_assets/planner/wall-special-variants.json').read_text())
BY_ID={v['id']:v for v in VARIANTS}
LABELS={'corner':'ВМУД1-1000 · угловой','vitrine1':'ВМД1 · витрина','vitrine2':'ВМД2 · витрина'}
def wall_special_variant(it):
 v=BY_ID.get(it.get('bazis_id'))
 return v if v and v['source_sha256']==it.get('bazis_sha256') else None

def wall_special_error(it):
 v=wall_special_variant(it)
 if not v:return 'Исполнение не совпадает с исходным файлом БАЗИС'
 if it['module_type']!='wall_cabinet' or it['base']!='wall' or it.get('base_height')!=0:return 'Верхний модуль — навесной, без цоколя'
 lo,hi=(800,1000) if v['family']=='corner' else (300,600) if v['door_count']==1 else (600,1200)
 if not lo<=it['width']<=hi or not 300<=it['height']<=1400:return 'Размер верхнего модуля вне допустимого диапазона'
 if not 250<=it['depth']<=600:return 'Глубина верхнего модуля — от 250 до 600 мм'
 return ''

def wall_special_shelves(it):
 v=wall_special_variant(it);n=1 if v['family']=='corner' else 2;t=18 if n==1 else 4
 gap=(it['height']-36-n*18)/(n+1)
 return [round(18+(i+1)*gap+i*18+t/2,6) for i in range(n)]

def wall_special_hardware(it):
 v=wall_special_variant(it);items=[dict(h) for h in v['hardware_items']]
 if v['family']!='corner':
  w,h,_=v['native_frame']['size'];cuts=[round(max(p['size'][0],p['size'][1])+(it['width']-w)/v['door_count'] if p['size'][0]>p['size'][1] else p['size'][1]+it['height']-h,6) for p in v['profiles']]
  lengths=[abs(c['trajectory_world_surface'][-1][1]-c['trajectory_world_surface'][0][1])+it['height']-h for p in v['panels'] for c in p['cuts']];length=round(sum(lengths)/1000,6)
  items.extend([dict(key='z1-profile',name='Профиль фасадный Z1 · отрезки по модели',article='Z1',quantity=round(sum(cuts)/1000,6),unit='m',cuts_mm=cuts),dict(key='led-upper',name='Подсветка · метраж по пазам, комплект питания по монтажу',article=None,quantity=length,unit='m')])
  if v['light_system']=='lira-17.5x6.5':items.append(dict(key='light-profile-upper',name='Профиль под паз 17,5 × 6,5 мм · подбор по монтажу',article=None,quantity=length,unit='m'))
 return items

def wall_special_contents(it):
 v=wall_special_variant(it)
 text=LABELS[v['family']]+'; '+('ЛДСП 18 мм; '+('накладные ручки' if v['execution']=='handles' else 'без ручек') if v['family']=='corner' else 'Z1; стекло 4 мм; две стеклянные полки; паз '+('4 × 8' if v['light_system']=='aq-4x8' else '17,5 × 6,5')+' мм; подсветка '+{'left':'слева','right':'справа','both':'с двух сторон'}[v['lighting']])
 return text+'. Центры полок от низа корпуса: '+', '.join(f'{n:g}' for n in wall_special_shelves(it))+' мм. '+' '.join(v['warnings'])
