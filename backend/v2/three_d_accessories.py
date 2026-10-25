"""Verified dishwasher donors. Row plinth geometry is exported from the browser plan."""
import json
from pathlib import Path
VARIANTS=json.loads((Path(__file__).parent/'cabinet_assets/planner/accessory-variants.json').read_text())
BY_ID={v['id']:v for v in VARIANTS if v['kind']=='dishwasher'}
def dishwasher(it):
 v=BY_ID.get(it.get('bazis_id'))
 return v if v and v['source_sha256']==it.get('bazis_sha256') else None
def dishwasher_error(it):
 if not dishwasher(it):return 'Фрагмент посудомойки не совпадает с проверенным исходником'
 if it.get('module_type')!='base_cabinet' or it.get('base')=='wall' or (it.get('legHeightMm') or it.get('base_height') or 100)!=100:return 'Посудомойка: исходная установка на отметке 100 мм'
 if not 450<=it['width']<=600 or not 700<=it['height']<=1100 or not 450<=it['depth']<=700:return 'Посудомойка: ширина 450–600, высота 700–1100, глубина 450–700 мм'
 return ''
def dishwasher_hardware(it):
 return [dict(name=p['material_name'],article=p['article'],quantity=it['width']/1000,unit='m') for source in dishwasher(it)['profiles'] for p in [source.get('documentation_profile',source)]]
def dishwasher_contents(it):
 v=dishwasher(it);height=(688.5 if v['variant']=='gola' else 717)+it['height']-820
 return f"Посудомойка · {'Gola L без подсветки' if v['variant']=='gola' else 'обычное исполнение'}. Фасад {it['width']-3:g} × {height:g} × 18 мм. Без мебельного корпуса. Размер ниши сверить с паспортом техники."

def plinth_summary(scene,entry):
 """Same straight-row grouping as the browser; returns source panel blank sizes."""
 if entry.get('automatic'):
  return 'По расстановке кухни. Общий цоколь нижних шкафов, пеналов и витрин по линии закрытых фасадов; одинаковые высота и материал объединяются, отключённые участки пропускаются. Каждая планка — прямой исходный FR3D, толщина 18 мм, высота опор минус 3 мм. Точные детали и положения — в экспорте БАЗИС.'
 import math
 def local(it):
  angle=math.radians(-it.get('rotation',0));c=round(math.cos(angle));s=round(math.sin(angle))
  return it['x']*c-it['z']*s,it['x']*s+it['z']*c
 items=scene.get('items',[]);seed=next((it for it in items if it['item_id'] in entry['members']),None)
 if not seed:return 'Ряд удалён — цоколь требует перепривязки.'
 def group(it):
  _,z=local(it)
  return (it.get('rotation',0),round(z-it['depth']/2-50,1),it['height'],it.get('countertopDepthMm') or 600,it.get('countertopThicknessMm') or 38)
 same=sorted([it for it in items if it.get('module_type')=='base_cabinet' and group(it)==group(seed)],key=lambda it:local(it)[0])
 runs=[]
 for it in same:
  x,_=local(it);lo=x-it['width']/2;hi=x+it['width']/2
  if runs and abs(runs[-1]['hi']-lo)<=1:runs[-1]['hi']=hi;runs[-1]['items'].append(it)
  else:runs.append(dict(lo=lo,hi=hi,items=[it]))
 run=next(r for r in runs if seed in r['items']);ids={it['item_id'] for it in run['items']}
 if any(it['item_id'] in entry['members'] and it['item_id'] not in ids for it in items):return 'Ряд разделён — цоколь требует перепривязки.'
 first=run['items'][0];w=entry.get('width') or run['hi']-run['lo'];h=entry.get('height') or first.get('legHeightMm') or first.get('base_height') or 100
 inset=entry.get('inset',40);d=entry.get('depth') or first['depth']-inset;shape=entry.get('shape','straight')
 sizes=[(w,h-3,18)] if shape=='straight' else [(w-(36 if shape=='u' else 18),h,18)]+[(h,d,18)]*(2 if shape=='u' else 1)
 names={'straight':'Прямой','left':'Возврат слева','right':'Возврат справа','u':'П-образный'}
 return names[shape]+'. Детали: '+' / '.join(' × '.join(f'{n:g}' for n in size) for size in sizes)+f' мм. Отступ от передней плоскости модуля {inset} мм.'
