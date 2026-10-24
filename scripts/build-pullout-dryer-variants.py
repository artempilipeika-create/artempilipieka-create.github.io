"""Audit 12 independent pull-out dryer donors; never execute their Scheme.
Usage: python scripts/build-pullout-dryer-variants.py /path/to/fr3d
"""
from importlib.machinery import SourceFileLoader
from fr3d_reader import *
g=SourceFileLoader("gola_reader",str(Path(__file__).with_name("build-gola-variants.py"))).load_module()
poly,panel,purchase,slot_data=g.poly,g.panel,g.purchase,g.slot_data
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/"backend/v2/cabinet_assets/planner"

def add_dryer(v,dryer,t):
 v['dryer_brand']='norwing' if 'norwing' in v['source_file'].lower() else 'flat_line'
 v['allowed_widths']=[600,700,800]+([900] if v['dryer_brand']=='flat_line' else [])
 v['dryer_kits']=[]
 for n,mat,path in walk(dryer):
  sc=scheme(n)
  if not sc or vals(sc).get('MountDir')!=2:continue
  tree=cached(sc);hw=purchase(tree)
  row=next(h for h in hw if 'корзина-сушка' in h['name'].lower())
  width=int(re.search(r'сушка (\d+)',row['name'])[1]);assert width in v['allowed_widths']
  object_node=next(n for n,ma,pa in walk(child(tree,'Model')) if vals(n).get('Type')==4001 and 'корзина-сушка' in vals(n).get('Name','').lower())
  f=frame(object_node)
  v['dryer_kits'].append(dict(width=width,rules=rules(sc),name=row['name'],article=row['article'],quantity=1,unit='set',size=f['size']))
 assert sorted(k['width'] for k in v['dryer_kits'])==v['allowed_widths']
 # Keep the actual mounted basket bounds; cache origins differ between sizes.
 for n,mat,path in walk(child(t,'Model')):
  x=vals(n)
  if x.get('Type')==4001 and 'корзина-сушка' in x.get('Name','').lower():
   f=frame(n);local=tran(np.eye(4),n);parent=mat@np.linalg.inv(local)
   v['dryer_bounds']={'lo':r((parent@[*f['origin'],1])[:3]),'size':f['size']};break
 assert 'dryer_bounds' in v
 b=v['dryer_bounds'];v['dryer_front_offset']=round(b['lo'][2]+b['size'][2]-510,4)
 if b['lo'][2]<0:
  v['dryer_front_offset']=0
  v['warnings'].append('В исходнике AQ LineBox + NORWING без Gola корзина вынесена за заднюю стенку. В предпросмотре она установлена внутри корпуса; перед изготовлением исправить её положение в БАЗИС.')
 v['hardware_items']=[h for h in v['hardware_items'] if 'корзина-сушка' not in h['name'].lower()]
 v['min_depth']=510 # Reviewed donor depth; never shrink into the basket or its guides.
 v['label']='Шкаф с выдвижной сушкой · '+('NORWING' if v['dryer_brand']=='norwing' else 'FLAT LINE')+' · '+v['series']+(' · Gola II' if v['execution']=='gola' else '')

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('sources',type=Path);args=ap.parse_args();rows=[]
 for source in sorted(args.sources.glob('*.fr3d')):
  if not any(x in source.name.lower() for x in ('flat','norwing')):continue
  # The user replaced AQ three-drawer revision (1) with revision (2).
  if source.name=='НМРШ3-600.З.С 3мм Гвозди. Ящик AQ LineBox.Gola II(1).fr3d':continue
  t=load(source);m=child(t,'Model');sha=hashlib.sha256(source.read_bytes()).hexdigest();isdrawer=source.name.startswith('НМРШ');system=('ball' if 'Шариковые' in source.name else 'aq' if 'AQ' in source.name else 'slimbox') if isdrawer else None
  layout='inner' if 'Внутренний' in source.name else 'three' if source.name.startswith('НМРШ3') else 'two' if isdrawer else None
  v=dict(id='bazis.'+sha[:12],source_file=source.name,source_sha256=sha,execution='gola' if 'Gola' in source.name else 'standard',kind='drawers' if isdrawer else 'doors',system=system,layout=layout,opening='soft',manufacturer='Westline' if system=='aq' else 'AKS',series={'ball':'Обычные шариковые','aq':'AQ LineBox','slimbox':'Slimbox Evolution'}.get(system,''),drawer_count=(3 if layout in ['inner','three'] else 2) if isdrawer else 0,door_count=0 if isdrawer else 2 if source.name.startswith('НМД2') else 1,side='double' if source.name.startswith('НМД2') else 'left' if 'Отк L' in source.name else 'right',purpose='sink' if 'Мойка' in source.name else 'shelf',model_elastic=planeinfo(child(child(t,'ModelParams'),'Params')),panels=[],profiles=[],hardware_items=purchase(t),elastic_drawers=[],warnings=[])
  dryer=next(n for n in m['children'] if 'сушка' in vals(n).get('Name','').lower())
  slots=[n for n in m['children'] if n is not dryer and vals(n).get('Name','').startswith(('Направляющие','Мульти ящик'))]
  slots=sorted(slots,key=lambda n:frame(n)['origin'][1]);slot_ids={vals(n).get('ID'):i+1 for i,n in enumerate(slots)}
  def visit(n,mat=np.eye(4),path='',drawer_index=None):
   mat=tran(mat,n);x=vals(n);name=x.get('Name','');path+='/'+name if n['key']=='Obj' else ''
   drawer_index=slot_ids.get(x.get('ID'),drawer_index)
   if x.get('Type')==4002 and x.get('Thick',0)>=1:
    p=panel(n,mat,path);p['role']='front' if name=='Фасад' else 'drawer' if drawer_index else 'back' if name=='З.С' else 'shelf' if name=='Полка' else 'body'
    if drawer_index and p['role']!='front':p['drawer_index']=drawer_index
    v['panels'].append(p)
   if x.get('Type')==2004 and name in ['GOLA L','GOLA C']:
    xy=poly(x['Contour']);pts=np.array([(mat@[*p,z,1])[:3] for p in xy for z in [0,x['Thickness']]])
    pr=dict(name=name,article=x['Mat'].split('\r')[-1],material_name=x['Mat'].split('\r')[0],bounds=points_bound(pts),contour_yz=r(np.array([(mat@[*p,0,1])[1:3] for p in xy])))
    v['profiles'].append(pr)
    for a in child(child(child(n,'Params'),'MaterialAttendance'),'List')['children']:
     av=vals(a);v['hardware_items'].append(dict(key='profile-mount-'+str(len(v['profiles'])),name=av['Name'],article=av.get('Art'),quantity=av['Count'],unit='pcs'))
   for c in n['children']:visit(c,mat,path,drawer_index)
  visit(m)
  counts=collections.Counter()
  for p in v['panels']:
   name=p['name'];role=p['role'];counts[role]+=1
   if role=='drawer':
    key='bottom' if p['thickness']==3 or 'Дно' in name else 'rear' if name.startswith(('ЗАДНЯЯ','З/С','Ст. задн.')) else 'front-box' if 'Фронтальная' in name else 'side-P' if '.P' in name else 'side-L'
    p['key']=f"drawer-{p['drawer_index']}-{key}"
    if p['thickness']==3:p['role']='back';p['back_type']='drawer_bottom'
   else:p['key']=('front-' if isdrawer else 'door-')+str(counts[role]) if role=='front' else 'side-'+('L' if p['lo'][0]<100 else 'P') if 'Боковая -' in name else 'bottom' if name=='Дно' else role+'-'+str(counts[role])
  assert len({p['key'] for p in v['panels']})==len(v['panels']), [(p['key'],p['name'],p['source_path']) for p in v['panels']]
  fronts=sorted([p for p in v['panels'] if p['role']=='front'],key=lambda p:p['lo'][1]);v['front_heights']=[p['size'][1] for p in fronts];v['native_front_heights']=v['front_heights']
  v['elastic_drawers']=[slot_data(n,system) for n in slots]
  if system and system!='ball':
   for i,d in enumerate(v['elastic_drawers'],1):
    h=next(h for h in d['heights'] if next((x['Count'] for x in h['rules'] if d['height']<=x['Length']+1e-7),0));k=next(k for k in h['lengths'] if next((x['Count'] for x in k['rules'] if 510<=x['Length']),0));assert not k.get('error')
    d['native_corrections']={};d['native_size_corrections']={}
    for p in [p for p in v['panels'] if p.get('drawer_index')==i]:
     key=p['key'].split('-')[-1];b=k['boards'][key];assert max(abs(a-b) for a,b in zip(p['size'],b['size']))<.1
     expected=[b['center'][0]+18-300,b['center'][1]+d['y'],b['center'][2]+255]
     diff=[round(a-b,4) for a,b in zip(p['center'],expected)];assert max(abs(x) for x in diff)<.1,(source.name,key,diff)
     d['native_corrections'][key]=diff;d['native_size_corrections'][key]=[round(a-b,4) for a,b in zip(p['size'],b['size'])]
  if counts['shelf']>1:v['warnings'].append('В исходном FR3D две полки на одной отметке: 510 и 509 мм по глубине. Перед изготовлением устранить наложение в БАЗИС. Обе детали сохранены в спецификации.')
  v['label']=('Нижний шкаф · '+{'two':'2 ящика','three':'3 ящика','inner':'2 + внутренний'}[layout]+' · '+v['series']+' · Gola II') if isdrawer else f"НМД{v['door_count']}"+(' · Мойка' if v['purpose']=='sink' else ' · Полки')+' · Gola L'+(' · '+v['side'] if v['door_count']==1 else '')
  add_dryer(v,dryer,t)
  rows.append(v)
  print(source.name,'panels',len(v['panels']),'fronts',v['front_heights'],'profiles',[(p['article'],p['bounds']) for p in v['profiles']],'slots',len(slots))
 assert len(rows)==12
 (OUT/'pullout-dryer-variants.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
 (OUT/'pullout-dryer-variants.js').write_text('/* Generated by scripts/build-pullout-dryer-variants.py. */\nglobalThis.MF_PULLOUT_DRYER_VARIANTS = '+json.dumps(rows,ensure_ascii=False,separators=(',',':'))+';\n')
