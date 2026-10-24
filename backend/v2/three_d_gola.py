"""Gola sources, purchasing and constraints shared with browser catalogue."""
import json
from pathlib import Path
from .three_d_drawers import drawer_configuration, drawer_hardware, elastic
VARIANTS=json.loads((Path(__file__).parent/'cabinet_assets/planner/gola-variants.json').read_text())
BY_ID={v['id']:v for v in VARIANTS}
def gola_variant(it):
 v=BY_ID.get(it.get('bazis_id'))
 return v if v and v['source_sha256']==it.get('bazis_sha256') else None
def gola_error(it,v=None):
 v=v or gola_variant(it)
 if not v:return 'Фрагмент Gola не совпадает с проверенным исходником'
 base=it.get('legHeightMm') or it.get('base_height') or 100
 minimum=300 if v['kind']=='doors' else 400;maximum=600 if v['door_count']==1 else 1200
 if it.get('module_type')!='base_cabinet' or it.get('base')=='wall' or base not in (80,100,150):return 'Gola: нижний модуль на ножках 80, 100 или 150 мм'
 if not minimum<=it['width']<=maximum or not 600<=it['height']-base<=1000 or not 300<=it['depth']<=700:return f'Gola: ширина {minimum}–{maximum}, корпус 600–1000, глубина 300–700 мм'
 return drawer_configuration(it,v)[1] if v['kind']=='drawers' else ''
def gola_note(it):
 v=gola_variant(it);base=it.get('legHeightMm') or it.get('base_height') or 100
 notes=list(v['warnings'])
 if base!=100:notes.append(f'В БАЗИС заменить опоры 100 мм на {base} мм; высота корпуса {it["height"]-base} мм.')
 return ' '.join(notes) or None
def gola_contents(it):
 v=gola_variant(it);dh=it['height']-(it.get('legHeightMm') or it.get('base_height') or 100)-720
 fronts=[round(elastic(v,1,p['lo'][1]+p['size'][1],dh)-elastic(v,1,p['lo'][1],dh),4) for p in v['panels'] if p['role']=='front']
 text=('Gola II · L + C · '+v['series']) if v['kind']=='drawers' else ('Gola L · '+('под мойку' if v['purpose']=='sink' else 'с полками'))
 text+='. Фасады снизу вверх: '+' + '.join(f'{n:g}'.replace('.',',') for n in fronts)+' мм. Чёрный профиль AKS '+' + '.join(p['article'] for p in v['profiles'])+'; крепления 118236. '
 if v['kind']=='drawers':
  ds,error=drawer_configuration(it,v)
  if error:raise ValueError(error)
  text+='Направляющие '+' / '.join(str(n) for n in dict.fromkeys(d['kit']['length_mm'] for d in ds))+' мм. '
 return text+(gola_note(it) or '')
def gola_hardware(it,v=None):
 v=v or gola_variant(it);metal=v['kind']=='drawers' and v['system']!='ball';base=it.get('legHeightMm') or it.get('base_height') or 100
 rows=drawer_hardware(it) if metal else [dict(h) for h in v['hardware_items']]
 if v['system']=='ball':
  rows=[h for h in rows if not h['name'].startswith('Направляющая шариковая')]
  ds,error=drawer_configuration(it,v)
  if error:raise ValueError(error)
  for d in ds:
   h=next((h for h in d['kit']['hardware'] if 'PRIME by AKS SOFT CLOSE' in h['name']),None)
   if h:rows.append(dict(h,key=f'ball-slide-{d["index"]}',unit='set'))
 if not metal and base!=100:
  for h in rows:
   if h['name'].startswith(('Опора регулируемая','1031 Ножка пластиковая без базы')):
    h['name']=h['name'].replace('Н100',f'Н{base}').replace('высота 100',f'высота {base}');h['article']=None
 for p in v['profiles']:rows.append(dict(key=p['article'],name=p['material_name'],article=p['article'],quantity=it['width']/1000,unit='m',cut_length_mm=it['width'],stock_length_mm=5500,note='Отрезок на модуль; закупку хлыстов считать по раскрою всего ряда'))
 merged=[]
 for h in rows:
  old=next((x for x in merged if (x['name'],x.get('article'),x['unit'])==(h['name'],h.get('article'),h['unit'])),None)
  if old:old['quantity']+=h['quantity']
  else:merged.append(dict(h))
 return merged
