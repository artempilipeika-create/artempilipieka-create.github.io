"""Reviewed November cabinet sources, shared with the browser catalogue."""
import json
from pathlib import Path
VARIANTS=json.loads((Path(__file__).parent/'cabinet_assets/planner/modern-cabinet-variants.json').read_text())
BY_ID={v['id']:v for v in VARIANTS}
def modern_variant(it):
 v=BY_ID.get(it.get('bazis_id'))
 return v if v and v['source_sha256']==it.get('bazis_sha256') else None
def modern_error(it):
 v=modern_variant(it)
 if not v:return 'Фрагмент не совпадает с проверенным исходником'
 fridge=v['family']=='fridge';dryer=v['filling']=='dryer'
 bounds={'width':(600,600) if fridge or dryer else (300,1200 if v['door_count']==2 else 600),'height':(1800,2800) if fridge else (300,720) if v['family']=='gaslift' else (600 if dryer else 300,1400),'depth':(300,700) if fridge else (250,600)}
 for k,(lo,hi) in bounds.items():
  if it[k]%1 or not lo<=it[k]<=hi:return f'{k}: {lo}–{hi} мм'
 if fridge:
  if it['module_type']!='tall_cabinet' or it['base']=='wall' or it['base_height']!=100:return 'Пенал устанавливается на основание 100 мм'
 elif it['module_type']!='wall_cabinet' or it['base']!='wall' or it['base_height']!=0:return 'Верхний шкаф — навесной, без основания'
 return ''
def modern_hardware(it):
 v=modern_variant(it);count=0 if v['family'] not in ('upper1','upper2') else (1 if it['height']>850 else 0) if v['filling']=='dryer' else (2 if it['height']>850 else 1)
 rows=[];source_count=sum(p['role']=='shelf' for p in v['panels'])
 for source in v['hardware_items']:
  h=dict(source)
  if h['article']=='PK 5.0X16B':h['quantity']=4*count
  if v['filling']=='dryer' and h['name'].startswith('Конфермат'):h['quantity']+=4*(count-source_count)
  rows.append(h)
 return rows
def modern_contents(it):
 v=modern_variant(it)
 if v['family']=='fridge':return 'Пенал под холодильник, без промежуточных полок и задней стенки. Монтаж и вентиляция — по инструкции выбранного холодильника.'
 if v['family']=='gaslift':return f"Верхний шкаф с газлифтами, высота {it['height']} мм. После изменения размеров проверить крепления и ход фасада."
 return ('Сушка '+v['dryer'].upper()+' 600 мм. ' if v['filling']=='dryer' else 'Полки. ')+('Задняя стенка 3 мм в пазу 4 × 5 мм, отступ 10 мм; навесы 806.' if v['back']=='groove' else 'Накладная задняя стенка 3 мм.')
