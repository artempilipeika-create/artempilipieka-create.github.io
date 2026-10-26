"""Read the nine 26 October FR3D donors as data, never execute embedded Scheme."""
from fr3d_reader import *
from importlib.machinery import SourceFileLoader
g=SourceFileLoader('ow_g',str(Path(__file__).with_name('build-gola-variants.py'))).load_module()
c=SourceFileLoader('ow_c',str(Path(__file__).with_name('build-cargo-variants.py'))).load_module()
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'backend/v2/cabinet_assets/planner'
def extract(source):
 t=load(source);m=child(t,'Model');sha=hashlib.sha256(source.read_bytes()).hexdigest();wall=source.name.startswith('ВМ')
 v=dict(id='bazis.'+sha[:12],source_file=source.name,source_sha256=sha,native_frame=frame(m),model_elastic=planeinfo(child(child(t,'ModelParams'),'Params')),panels=[],hardware_items=g.purchase(t))
 if wall:
  none='Без подсветки' in source.name
  v.update(wall=True,label='Верхний открытый',light_system='none' if none else 'lira-17.5x6.5' if '17.5' in source.name else 'aq-4x8',lighting='none' if none else 'both' if 'Две стороны' in source.name else 'left' if '_L_' in source.name else 'right',catalogue_primary=True,bottom_full_width=False)
 else:
  v.update(waste=True,brand='geo',label='Мусорные контейнеры',execution='gola' if 'Gola' in source.name else 'standard',profiles=[],kits=[],source_widths=[350,400,450],allowed_widths=[350,400,450],min_body_height=720,warnings=[])
  v['hardware_items']=[h for h in v['hardware_items'] if 'мусорные' not in h['name'].lower()]
 for n,ma,path in walk(m):
  x=vals(n);name=x.get('Name','')
  if x.get('Type')==4002 and x.get('Thick',0)>=1:
   p=g.panel(n,ma,path);p['role']='front' if name=='Фасад' else 'back' if name=='З.С' else 'shelf' if name=='Полка' else 'body'
   p['key']='front-1' if p['role']=='front' else 'back' if p['role']=='back' else 'shelf-1' if p['role']=='shelf' else 'bottom' if name=='Дно' else 'top' if name=='Крыша' else 'side-'+('L' if p['lo'][0]<v['native_frame']['size'][0]/2 else 'P') if name.startswith('Боковая') else 'rail-rear' if name=='Царга задняя' else 'rail-front'
   p['center']=[round(p['lo'][i]+p['size'][i]/2-v['native_frame']['size'][i]/2*(i!=1),6) for i in range(3)]
   if wall:
    p['source_cuts']=panelinfo(n,ma,path)['cuts']
    for cut in p['source_cuts']:
     xy=np.array([p for seg in cut['contour'] for p in seg['points']]);cut['measured_section_mm']=r(np.ptp(xy,axis=0))
     assert cut['measured_section_mm']==([4,8] if v['light_system']=='aq-4x8' else [17.5,6.5])
   v['panels'].append(p)
  if not wall and x.get('Type')==2004 and name=='GOLA L':
   xy=g.poly(x['Contour']);pts=[(ma@[*p,z,1])[:3] for p in xy for z in [0,x['Thickness']]]
   v['profiles'].append(dict(name=name,article=x['Mat'].split('\r')[-1],material_name=x['Mat'].split('\r')[0],bounds=points_bound(pts),contour_yz=r(np.array([(ma@[*p,0,1])[1:3] for p in xy]))))
   for a in child(child(child(n,'Params'),'MaterialAttendance'),'List')['children']:
    av=vals(a);v['hardware_items'].append(dict(key='profile-mount',name=av['Name'],article=av.get('Art'),quantity=av['Count'],unit='pcs'))
  sc=scheme(n)
  if not wall and sc and 'мусор' in vals(sc).get('Name','').lower():
   ca=cached(sc);h=next(h for h in g.purchase(ca) if 'мусорные' in h['name'].lower());width=int(re.search(r'контейнеры (\d+)',h['name'])[1]);bounds=c.geometry(ca)
   v['kits'].append(dict(width=width,name=h['name'],article=h['article'],quantity=1,unit='set',mounting='bottom',rules=rules(sc),bounds=bounds,mount_origin=r(ma[:3,3]),cache_frame=frame(child(ca,'Model')),min_depth=525 if width==450 else 510))
 if wall:
  assert v['native_frame']['size']==[600,2000,600]
  assert len(v['panels'])==6
  shelf=next(p for p in v['panels'] if p['role']=='shelf');v['shelf_front_setback_mm']=600-shelf['lo'][2]-shelf['size'][2]
  v['confirmat_key']=next(h['key'] for h in v['hardware_items'] if 'Конфермат' in h['name'])
  v['warnings']=['В исходнике нет навесов и крепежа к стене; подобрать по нагрузке и основанию.']
 else:
  assert v['native_frame']['size']==[350,820,510]
  assert len(v['panels'])==7 and sorted(k['width'] for k in v['kits'])==[350,400,450]
  v['warnings']=['Комплект 450 мм: в исходнике обозначен h600, рамка кеша 500 мм; перед изготовлением проверить высоту и посадку в БАЗИС. Глубина модели комплекта 521 мм, поэтому глубина корпуса не менее 525 мм.']
 assert len({p['key'] for p in v['panels']})==len(v['panels'])
 return v
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('sources',type=Path);a=ap.parse_args();rows=[extract(f) for f in sorted(a.sources.glob('*.fr3d'))];assert len(rows)==9
 for name,flag in [('open-tall','wall'),('cargo','waste')]:
  p=OUT/(name+'-variants.json');old=[v for v in json.loads(p.read_text()) if not v.get(flag)];data=old+[v for v in rows if v.get(flag)]
  p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');(OUT/(name+'-variants.js')).write_text('/* Exact audited FR3D donors. */\nglobalThis.MF_'+name.upper().replace('-','_')+'_VARIANTS = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
 out=ROOT/'docs/open-wall-waste-20261026';out.mkdir(exist_ok=True);(out/'source-audit.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
 print([(v['source_file'],v['id']) for v in rows])
