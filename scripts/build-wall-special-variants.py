"""Build the public donor catalogue from the static audit; never execute FR3D code.
Usage: python scripts/build-wall-special-variants.py qa-output/upper-donor-audit.json
"""
import json, sys
from pathlib import Path
out=Path(__file__).resolve().parents[1]/'backend/v2/cabinet_assets/planner'
append='--append' in sys.argv[2:]
source=json.loads(Path(sys.argv[1]).read_text())['variants']
rows=json.loads((out/'wall-special-variants.json').read_text()) if append else []
for v in source:
 corner=v['family']=='upper_corner'
 row={k:v[k] for k in ['id','source_file','source_sha256','native_frame','global_planes','door_count','execution']}
 row.update(family='corner' if corner else 'vitrine'+str(v['door_count']),opening=v['door_side'],light_system=None if corner else 'aq-4x8' if v['groove_width_mm']==4 else 'lira-17.5x6.5',lighting=v['groove_side'],panels=[],profiles=[],hardware_items=[])
 for i,h in enumerate(v['hardware_items']):row['hardware_items'].append(dict(h,key='native-'+str(i),unit='pcs'))
 for p in v['panels']+v['profiles']:
  profile=p['native_type']==2004;glass='стекло' in p['material'].lower();front=p['path'].startswith('/Фасад.')
  role='front' if front else 'back' if p['name']=='З.С' else 'shelf' if p['name']=='Полка' else 'body'
  q=dict(key='native-'+str(p['id']),native_id=p['id'],name=p['name'],role=role,material_name=p['material'].split('\r')[0],lo=p['bounds']['lo'],size=p['bounds']['size'],axes=[max(range(3),key=lambda a:abs(axis[a])) for axis in p['axes']],thickness=p['thickness'],front_vertices=p['world_vertices_front'],back_vertices=p['world_vertices_back'],edges=p['butts'],cuts=p.get('cuts',[]),texture_direction=p['tex_dir'])
  if glass:q['optical_material']='glass'
  if profile:q.update(optical_material='frame',native_profile=dict(section=p['local_loops'],matrix=p['matrix'],clip_planes=p['clip_planes']),extrusion_length_mm=p['extrusion_length_mm'])
  if front:q['door_index']=0 if v['door_count']==1 or p['bounds']['lo'][0]+p['bounds']['size'][0]/2<300 else 1
  row['profiles' if profile else 'panels'].append(q)
 row['warnings']=[]
 row['door_pivot']=next((p['origin'] for p in v.get('animation_points',[]) if p['name']=='Точка анимации двери'),None)
 if corner:
  insert=next(p for p in row['panels'] if p['name']=='Вставка низ')['size'][0]
  depth={303:300,340:340}[insert]
  if '340' in v['source_file'] and depth!=340:
   print('Skipping mismatched 340 mm source:',v['source_file']);continue
  row['return_depth']=str(depth)
  face=next(p for p in row['panels'] if p['role']=='front')['size'][0]
  if face>600:
   limit=v['native_frame']['size'][0]-(face-600)
   row['warnings'].append(f'В исходнике ВМУД1-1000 фасад {face:g} мм. Для фасада не шире 600 мм уменьшите ширину корпуса до {limit:g} мм.')
  row['warnings'].append('Гвозди задней стенки в перечне фурнитуры исходника не указаны; количество уточнить при сборке.')
  if v['execution']=='handleless':row['warnings'].append('В исполнении без ручек стоят обычные петли; толкателя в исходнике нет. Способ открывания проверить.')
  if v['door_side']=='right':row['warnings'].append('В правом исходнике отсутствуют четыре крепежа 6,3 × 13, присутствующие в левом. Комплектность крепежа проверить перед сборкой.')
 else:row['warnings'].append('Для перестроения полок в БАЗИС нужен родной фрагмент KUBIC со стеклом 4 мм в библиотеке базовых элементов. После импорта проверить две полки и восемь полкодержателей.')
 row['native_dependency']=next((r.get('cached',{}).get('file') for r in v['shelf_rules'] if r.get('cached',{}).get('missing_cache')),None)
 if not any(r['id']==row['id'] for r in rows):rows.append(row)
for row in rows:
 if row['family']=='corner':row.setdefault('return_depth','300')
assert rows and len({r['id'] for r in rows})==len(rows)
(out/'wall-special-variants.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
(out/'wall-special-variants.js').write_text('/* Static geometry from source-pinned FR3D files. */\nglobalThis.MF_WALL_SPECIAL_VARIANTS='+json.dumps(rows,ensure_ascii=False,separators=(',',':'))+';\n')
print('Built',len(rows),'variants')
