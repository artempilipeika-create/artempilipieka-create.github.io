"""Rebuild the elastic drawer catalogue from the eight source FR3D files.

Usage: python scripts/extract-drawer-elastic.py /path/to/originals
Requires NumPy (audit only; no runtime dependency). Never executes native scripts.
RelX defines upper-inclusive intervals. MountDir 1 selects height; 4 selects depth.
Cached parts are mounted at the front and stretch only across the cabinet width.
The live H116 push assembly supplies its external-only cache; missing or conflicting
assemblies remain explicit errors. Every baseline board is checked against the
separate native-panel audit already stored in drawer-variants.json.
"""
from fr3d_reader import *

args=argparse.ArgumentParser(description=__doc__);args.add_argument('sources',type=Path)
uploads=args.parse_args().sources
path=Path(__file__).resolve().parents[1]/'backend/v2/cabinet_assets/planner/drawer-variants.json'
variants=json.loads(path.read_text())
out=[]
for v in variants:
 source=uploads/v['source_file'];assert hashlib.sha256(source.read_bytes()).hexdigest()==v['source_sha256'];t=load(source);res={'id':v['id'],'drawers':[]}
 for n in child(t,'Model')['children']:
  if not str(vals(n).get('Name','')).startswith('Направляющие'):continue
  f=frame(n);hs=[]
  for ch in child(n,'Objs')['children']:
   sc=scheme(ch)
   if sc and vals(sc).get('MountDir')==1:
    ca=cached(sc);hs.append({'name':vals(ch).get('Name'),'rules':rules(sc),'lengths':length_options(child(ca,'Model'))})
  if not hs:hs=[{'name':vals(n).get('Name'),'rules':[{'Count':1,'Length':1000}], 'lengths':length_options(n)}]
  res['drawers'].append({'frame':f,'heights':hs})
 out.append(res)

vs=variants;es=out
def count(rs,x):return next((r['Count'] for r in rs if x<=r['Length']),0)
# One cache is external-only, but its live instance is present in the uploaded 3-drawer donor.
pv=next(v for v in vs if v['layout']=='three' and v['opening']=='push');pf=next(e for e in es if e['id']==pv['id'])['drawers'][1]['frame']
pushpanels=[]
for p in pv['panels']:
 if p.get('drawer_index')==2:
  pushpanels.append({'name':p['name'],'size':p['size'],'lo':[round(p['center'][j]+[300,0,255][j]-p['size'][j]/2-pf['origin'][j]-(510 if j==2 else 0),4) for j in range(3)]})
for v,e in zip(vs,es):
 ds=[]
 for d in e['drawers']:
  hs=[]
  for h in d['heights']:
   ls=[]
   for l in h['lengths']:
    name=l['name'];length=int(re.search(r'(?:NL=|L-)(\d+)',name)[1]);hh=int(re.search(r'H\s*=\s*(\d+)',name)[1]);hw=next((x for x in l['hardware'] if x['name'].startswith('Система ящиков')),None)
    panels=l['panels'];frame=l['frame']
    if l.get('missing_cache') and '117356' in name:
     panels=pushpanels;frame={'origin':[0,0,0],'size':[564,150,0]};hw=next(x for x in pv['hardware_items'] if x['article']=='117356')
    article=name.split('\r')[1] if '\r' in name else hw['article'] if hw else None
    name=name.split('\r')[0] if v['system']=='aq' else hw['name'] if hw else name
    error='Во фрагменте нет встроенной геометрии этого комплекта' if not panels else ''
    if hw and int(re.search(r'H\s*=\s*(\d+)',hw['name'])[1])!=hh:error='В исходном фрагменте не совпадают высота комплекта и его спецификация'
    boards={}
    if not error:
     for p in panels:
      key='bottom' if 'Дно' in p['name'] else 'rear';assert key not in boards
      # Width is elastic; height and rail length belong to the selected cached kit.
      size=[round(p['size'][0]+564-frame['size'][0],4),*p['size'][1:]]
      lo=p['lo'].copy();lo[2]-=frame['size'][2]
      boards[key]={'size':size,'center':[round(lo[j]+size[j]/2,4) for j in range(3)]}
    ls.append({'rules':l['rules'],'length_mm':length,'height_mm':hh,'name':name,'article':article,'boards':boards,**({'error':error} if error else {})})
   hs.append({'rules':h['rules'],'lengths':ls})
  ds.append({'y':d['frame']['origin'][1],'height':round(d['frame']['size'][1],6),'heights':hs})
 v['elastic_drawers']=ds
 # Every assembled native panel must agree with the independent cached-kit geometry.
 for i,d in enumerate(ds,1):
  h=next(h for h in d['heights'] if count(h['rules'],d['height']))
  k=next(k for k in h['lengths'] if count(k['rules'],510));assert not k.get('error')
  d['native_corrections']={}
  for p in (p for p in v['panels'] if p.get('drawer_index')==i):
   key=p['key'].split('-')[-1];b=k['boards'][key]
   assert max(abs(a-b) for a,b in zip(p['size'],b['size']))<.1
   expected=[b['center'][0]+18-300,b['center'][1]+d['y'],b['center'][2]+255]
   diff=[round(a-b,4) for a,b in zip(p['center'],expected)];assert max(abs(x) for x in diff)<.1,(v['id'],key,diff)
   d['native_corrections'][key]=diff
path.write_text(json.dumps(vs,ensure_ascii=False,indent=2)+'\n')
print('Derived',sum(len(v['elastic_drawers']) for v in vs),'drawer slots; cached assemblies and all native boards agree within 0.1 mm.')
