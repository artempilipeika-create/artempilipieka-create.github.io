"""Extract the eight audited open tall donors as data, never execute Scheme.
Usage: python scripts/build-open-tall-variants.py source_directory
"""
from fr3d_reader import *
from importlib.machinery import SourceFileLoader
g=SourceFileLoader('open_tall_g',str(Path(__file__).with_name('build-gola-variants.py'))).load_module()
SOURCES={
 'ПН-600. Фр_4мм_L_Центр.Пл_18мм..fr3d':'0f88bf06d3a83274b14045be8038e0572dfa44ee0724f2ad4b502bc0e79dd860',
 'ПН-600. Фр_4мм_P_Центр.Пл_18мм..fr3d':'7804e46e0985b41debc8e6d6529cdabfefd9a7bc7f12a8d7f10ab1e3c9a382a9',
 'ПН-600. Фр_17.5мм_Две стороны_Центр.Пл_18мм..fr3d':'6605c90fe9e48d73c05466bb9650c90912ff12bbc53b333ba90efc940001fc9f',
 'ПН-600.Открытый Без подсветки(1).fr3d':'1d3c4c663a42d3c0d90087f9e899a3e2f30957ff9c134f224442949ec60db912',
 'ПН-600.Открытый. Фр_4мм_L_Центр.Пл_18мм..fr3d':'dd2d6b26906f467f305002d768a976931bc619d7c99caf9a2863fb0b16facabc',
 'ПН-600.Фр_4мм_Две стороны_Центр.18мм..fr3d':'0737b0adf0525405d33b7a47854fa31aa14e958fad261e2f91f146c1d295c346',
 'ПН-600.Фр_17.5мм_L_Центр.Пл_18мм..fr3d':'6667341f40848950a69cb505adaa144d689dae96cb638bb213c7b38d64939ce4',
 'ПН-600.Фр_17.5мм_P_Центр.Пл_18мм..fr3d':'cba171b0c9ece1af1aaa30315b9c1dcd2c04b9d94138204fd0966f958ca326ab',
}
def extract(source):
 sha=hashlib.sha256(source.read_bytes()).hexdigest();assert sha==SOURCES[source.name],source.name
 t=load(source);m=child(t,'Model');none='Без подсветки' in source.name
 system='none' if none else 'lira-17.5x6.5' if '17.5' in source.name else 'aq-4x8'
 side='none' if none else 'both' if 'Две стороны' in source.name else 'left' if '_L_' in source.name else 'right'
 v=dict(id='bazis.'+sha[:12],source_file=source.name,source_sha256=sha,label='Открытый пенал',light_system=system,lighting=side,catalogue_primary=not sha.startswith('0f88bf06'),native_frame=frame(m),model_elastic=planeinfo(child(child(t,'ModelParams'),'Params')),panels=[],hardware_items=g.purchase(t))
 assert v['native_frame']=={'origin':[0,0,0],'size':[600,2000,600]}
 assert {p['Axis'] for p in v['model_elastic']}=={0,1,2}
 for n,ma,path in walk(m):
  x=vals(n);name=x.get('Name','')
  if x.get('Type')!=4002 or x.get('Thick',0)<1:continue
  p=g.panel(n,ma,path);assert p['thickness']==18
  p['center']=[round(p['lo'][i]+p['size'][i]/2-[300,0,300][i],6) for i in range(3)]
  p['role']='back' if name=='З.С' else 'shelf' if name=='Полка' else 'body'
  p['key']='back' if p['role']=='back' else 'shelf-1' if p['role']=='shelf' else 'bottom' if name=='Дно' else 'top' if name=='Крыша' else 'side-L' if p['lo'][0]<300 else 'side-P'
  p['source_cuts']=panelinfo(n,ma,path)['cuts']
  expected_side=side=='both' or side=='left' and p['key']=='side-L' or side=='right' and p['key']=='side-P'
  assert len(p['source_cuts'])==int(p['key'].startswith('side-') and expected_side)
  for c in p['source_cuts']:
   assert (c['parameters']['width'],c['parameters']['depth'])==((4,8) if system=='aq-4x8' else (17.5,6.5))
   x=18 if p['key']=='side-L' else 582
   assert sorted(c['trajectory_world_surface'])==[[x,100,309],[x,2000,309]]
  v['panels'].append(p)
 assert len(v['panels'])==len({p['key'] for p in v['panels']})==6
 shelf=next(p for p in v['panels'] if p['key']=='shelf-1');assert shelf['lo'][:2]==[18,1041]
 v['shelf_front_setback_mm']=600-shelf['lo'][2]-shelf['size'][2]
 v['bottom_full_width']=none
 for h in v['hardware_items']:
  if 'Конфермат' in h['name']:assert h['quantity']==(12 if none else 4);v['confirmat_key']=h['key']
  if 'упак' in h['name'].lower():h['note']='Количество в штуках; упаковка поставщика не равна единице расхода'
 assert 'confirmat_key' in v
 return v
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('sources',type=Path);args=ap.parse_args()
 rows=[extract(args.sources/name) for name in SOURCES]
 out=Path(__file__).resolve().parents[1]/'backend/v2/cabinet_assets/planner'
 (out/'open-tall-variants.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
 (out/'open-tall-variants.js').write_text('/* Generated from eight exact audited FR3D donors. */\nglobalThis.MF_OPEN_TALL_VARIANTS = '+json.dumps(rows,ensure_ascii=False,separators=(',',':'))+';\n')
 print('Open tall:',len(rows),'sources,',len({(v['light_system'],v['lighting']) for v in rows}),'configurations')
