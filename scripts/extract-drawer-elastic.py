"""Rebuild the elastic drawer catalogue from the eight source FR3D files.

Usage: python scripts/extract-drawer-elastic.py /path/to/originals
Requires NumPy (audit only; no runtime dependency). Never executes native scripts.
RelX defines upper-inclusive intervals. MountDir 1 selects height; 4 selects depth.
Cached parts are mounted at the front and stretch only across the cabinet width.
The live H116 push assembly supplies its external-only cache; missing or conflicting
assemblies remain explicit errors. Every baseline board is checked against the
separate native-panel audit already stored in drawer-variants.json.
"""
from pathlib import Path
import argparse, collections, hashlib, json, re, struct, zlib
import numpy as np
class Reader:
 def __init__(self,b):
  self.b=b; self.i=0; n=self.num('I');self.names=[self.raw(self.num('I')).decode('utf-8') for _ in range(n)]
 def raw(self,n):
  out=self.b[self.i:self.i+n];self.i+=n;return out
 def num(self,f):return struct.unpack('<'+f,self.raw(struct.calcsize('<'+f)))[0]

# Preserve all byte arrays, and Scheme byte strings for inspection without execution.
class RichReader(Reader):
 def node(self):
  at=self.i;k=self.num('I');n=self.num('I');t=self.num('B');v=None;key=self.names[k] if k!=4294967295 else '_'
  if t==1:v=True
  elif t==2:v=False
  elif t==3:v=self.num('B')
  elif t==4:v=self.num('i')
  elif t==5:v=self.num('d')
  elif t==6:
   raw=self.raw(self.num('I')*2)
   v={'bytes':len(raw),'hex':raw.hex()} if key=='Scheme' else raw.decode('utf-16le','replace')
  elif t==7:
   raw=self.raw(self.num('I'));v={'bytes':len(raw),'hex':raw.hex()}
  elif t==9:v=self.num('q')
  elif t not in (0,8):raise ValueError((at,k,n,t))
  return {'key':key,'value':v,'children':[self.node() for _ in range(n)]}
def load(p):
 b=p.read_bytes();idx=b.find(b'\x00\x01\x00\x00\xff\x01x\x9c');r=RichReader(zlib.decompress(b[idx+6:]));tree=r.node();assert r.i==len(r.b);return tree
def child(n,k):return next((a for a in n['children'] if a['key']==k),{'children':[],'value':None})
def vals(n):return {c['key']:c['value'] for c in n['children']}
def planeinfo(n):
 return [{**{'Axis':0},**vals(c)} for c in child(child(n,'Elastic'),'Planes')['children']]
def contour(v):
 b=bytes.fromhex(v['hex']);segs=struct.unpack_from('<I',b)[0];i=4;rows=[]
 for j in range(segs):
  ty=b[i];i+=1
  if ty==16:
   coords=struct.unpack_from('<dddd',b,i);i+=32;rows.append({'type':'line','points':np.array(coords).reshape(2,2).tolist()})
  else:raise ValueError(('unsupported curve',ty,len(b),i))
 assert i==len(b),(i,len(b));return rows
def tran(parent,n):
 tr=vals(child(n,'Trans'));x,y,z,w=[tr.get(k,0) for k in ['Rx','Ry','Rz','Rw']];a=np.eye(4)
 if tr:
  a[:3,:3]=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]];a[:3,3]=[tr.get(k,0) for k in ['X','Y','Z']]
 return parent@a
def r(x):return np.round(x,4).tolist() if isinstance(x,np.ndarray) else round(x,4)
def points_bound(pts):
 pts=np.array(pts);return {'lo':r(pts.min(0)),'hi':r(pts.max(0)),'size':r(np.ptp(pts,axis=0))}
def panelinfo(n,mat,path):
 v=vals(n);lines=contour(v['Contour']);local=np.array([p for seg in lines for p in seg['points']]);pts=[(mat@[*xy,z,1])[:3] for xy in local for z in [0,v['Thick']]]
 ret={'name':v.get('Name'),'id':v.get('ID'),'material':v.get('Mat'),'thickness':v['Thick'],'local_size':r(np.ptp(local,axis=0)),'local_bounds':points_bound(local),'bounds':points_bound(pts),'path':path,'matrix':r(mat),'cuts':[]}
 for c in child(n,'Cuts')['children']:
  cv=vals(c);par=vals(child(c,'Params'));line=contour(cv['Trajectory']);localp=np.array([p for seg in line for p in seg['points']]);surface_z=0 if cv.get('Front',True) else v['Thick']
  worldp=[(mat@[*xy,surface_z,1])[:3] for xy in localp]
  ret['cuts'].append({'name':cv.get('Name'),'sign':cv.get('Sign'),'front':cv.get('Front',True),'parameters':par,'trajectory_local':r(localp),'trajectory_world_surface':r(np.array(worldp)),'length':r(sum(np.linalg.norm(np.array(seg['points'][1])-seg['points'][0]) for seg in line)),'contour':contour(cv['Contour'])})
 return ret
def walk(n,mat=np.eye(4),path=''):
 mat=tran(mat,n);v=vals(n)
 if n['key']=='Obj':path+='/'+str(v.get('Name','?'))
 yield n,mat,path
 for c in n['children']:yield from walk(c,mat,path)


def scheme(n):
 s=child(child(child(n,'Params'),'Elastic'),'Scheme')['value']
 return RichReader(bytes.fromhex(s['hex'])[5:]).node() if s else None
def cached(sc):
 bb=bytes.fromhex(child(child(sc,'PrimObj'),'ObjectCache')['value']['hex']);rr=RichReader(bb[9:]);rr.node();return RichReader(zlib.decompress(bb[9+rr.i+5:])).node()
def rules(sc):return [{"Count":0,**vals(c)} for c in child(sc,'RelX')['children']]

def frame(m):
 # First bounding frame of the loaded fragment, before child assemblies.
 for n,mat,path in walk(m):
  v=vals(n)
  if v.get('Type')==1001 and 'Width' in v:
   return {'origin':r(mat[:3,3]),'size':[v.get(k,0) for k in ('Width','Height','Depth')]}
 raise ValueError('no frame')

def hardware(t):
 out=collections.Counter();fn={vals(n).get('FastID'):n for n in child(t,'FurnList')['children']}
 for n,mat,path in walk(child(t,'Model')):
  v=vals(n)
  if v.get('Type')==4001:out[v.get('Name','')]+=1
  if v.get('Type')==3001:
   entry=fn.get(v.get('FastID'));els=child(child(entry,'ParData'),'Elements')['children'] if entry else []
   for el in els:out[el['value']]+=1
   if not els:out[v.get('Name','')]+=1
 return [{'name':k.split('\r')[0],'article':k.split('\r')[-1] if '\r' in k else None,'quantity':v} for k,v in out.items()]

def kit(sc):
 
 if not child(child(sc,'PrimObj'),'ObjectCache')['value']:return {'missing_cache':True,'name':vals(child(sc,'PrimObj')).get('Name'),'file':vals(child(sc,'PrimObj')).get('File'),'rules':rules(sc),'frame':None,'panels':[],'hardware':[]}
 t=cached(sc);m=child(t,'Model');f=frame(m);panels=[]
 for n,mat,path in walk(m):
  v=vals(n)
  if v.get('Type')==4002 and v.get('Thick',0)>=1:
   p=panelinfo(n,mat,path);panels.append({'name':p['name'],'lo':p['bounds']['lo'],'size':p['bounds']['size']})
 return {'name':vals(child(sc,'PrimObj')).get('Name'), 'rules':rules(sc),'frame':f,'panels':panels,'hardware':hardware(t)}

def length_options(model):
 found=[]
 for n,mat,path in walk(model):
  sc=scheme(n)
  if sc and vals(sc).get('MountDir')==4:
   k=kit(sc); k['holder_name']=vals(n).get('Name');found.append(k)
 return found

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
