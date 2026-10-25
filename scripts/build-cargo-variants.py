"""Read six cargo donors as data; never execute embedded Scheme.
Usage: python scripts/build-cargo-variants.py source_directory
"""
import math
from fr3d_reader import *
from importlib.machinery import SourceFileLoader
g=SourceFileLoader('g',str(Path(__file__).with_name('build-gola-variants.py'))).load_module()
def pts2(raw):
 b=bytes.fromhex(raw['hex']);count=struct.unpack_from('<I',b)[0];i=4;ps=[]
 for _ in range(count):
  ty=b[i];i+=1
  if ty==16: ps.extend(np.array(struct.unpack_from('<4d',b,i)).reshape(2,2));i+=32
  elif ty==18:
   c,a,z=np.array(struct.unpack_from('<6d',b,i)).reshape(3,2);direction=b[i+48];i+=49
   start=math.atan2(*(a-c)[::-1]);end=math.atan2(*(z-c)[::-1]);delta=(end-start)%(2*math.pi)
   if not direction:delta-=2*math.pi
   if abs(delta)>math.pi:delta-=math.copysign(2*math.pi,delta)
   rad=np.linalg.norm(a-c);ps.extend([c+rad*np.array([math.cos(q),math.sin(q)]) for q in np.linspace(start,start+delta,80)])
  elif ty==17:
   x,y,rad=struct.unpack_from('<3d',b,i);i+=24;ps.extend([[x+rad,y],[x-rad,y],[x,y+rad],[x,y-rad]])
  else:raise ValueError(ty)
 return ps

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'backend/v2/cabinet_assets/planner'
def geometry(t):
 fn={vals(x).get('FastID'):vals(x) for x in child(t,'FurnList')['children']};ps=[]
 for n,ma,path in walk(child(t,'Model')):
  v=vals(n);pts=[]
  if v.get('Type')==2004:
   pts=[(ma@[*p,z,1])[:3] for p in pts2(v['Contour']) for z in [0,v.get('Thickness',0)]]
  elif v.get('Type')==3001:
   e=fn.get(v.get('FastID'),{})
   if all(k in e for k in ['MinX','MaxX','MinY','MaxY','MinZ','MaxZ']) and not re.fullmatch(r'[\d.,]+[xх×][\d.,]+',v.get('Name','')):
    pts=[(ma@[x,y,z,1])[:3] for x in [e['MinX'],e['MaxX']] for y in [e['MinY'],e['MaxY']] for z in [e['MinZ'],e['MaxZ']]]
  ps.extend(pts)
 return points_bound(ps)

def extract(source):
 t=load(source);m=child(t,'Model');sha=hashlib.sha256(source.read_bytes()).hexdigest()
 brand=next(b for b in ['focus','norwing','icon'] if b in source.name.lower())
 v=dict(id='bazis.'+sha[:12],source_file=source.name,source_sha256=sha,brand=brand,execution='gola' if 'Gola' in source.name else 'standard',native_frame=frame(m),model_elastic=planeinfo(child(child(t,'ModelParams'),'Params')),panels=[],profiles=[],hardware_items=[h for h in g.purchase(t) if 'карго' not in h['name'].lower()],kits=[],source_widths=[150,200,300,400],allowed_widths=[200,300,400] if brand=='norwing' else [150,200,300,400],warnings=[])
 v['label']='Карго · '+brand.upper()+(' · Gola L' if v['execution']=='gola' else '')
 assert v['native_frame']=={'origin':[0,0,0],'size':[150,820,510]}
 for n,ma,path in walk(m):
  x=vals(n);name=x.get('Name','')
  if x.get('Type')==4002 and x.get('Thick',0)>=1:
   p=g.panel(n,ma,path);p['center']=[round(p['lo'][i]+p['size'][i]/2-[75,0,255][i],4) for i in range(3)]
   p['role']='front' if name=='Фасад' else 'back' if name=='З.С' else 'body'
   p['key']='front-1' if p['role']=='front' else 'back' if p['role']=='back' else 'side-'+('L' if p['lo'][0]<75 else 'P') if name.startswith('Боковая') else 'bottom' if name=='Дно' else 'rail-rear' if name=='Царга задняя' else 'rail-front'
   v['panels'].append(p)
  if x.get('Type')==2004 and name=='GOLA L':
   xy=g.poly(x['Contour']);pts=[(ma@[*p,z,1])[:3] for p in xy for z in [0,x['Thickness']]]
   v['profiles'].append(dict(name=name,article=x['Mat'].split('\r')[-1],material_name=x['Mat'].split('\r')[0],bounds=points_bound(pts),contour_yz=r(np.array([(ma@[*p,0,1])[1:3] for p in xy]))))
   for a in child(child(child(n,'Params'),'MaterialAttendance'),'List')['children']:
    av=vals(a);v['hardware_items'].append(dict(key='profile-mount',name=av['Name'],article=av.get('Art'),quantity=av['Count'],unit='pcs'))
  sc=scheme(n)
  if not sc or vals(sc).get('MountDir')!=2:continue
  cache=cached(sc);hs=[h for h in g.purchase(cache) if 'карго' in h['name'].lower()]
  if not hs:continue
  assert len(hs)==1 and hs[0]['quantity']==1
  h=hs[0];width=int(re.search(r'карго (\d+)',h['name'])[1]);article=re.sub(r'\s+','',h['article']);bounds=geometry(cache)
  k=dict(width=width,name=h['name'],article=article,source_article=h['article'],quantity=1,unit='set',mounting='side_left' if 'боковое' in h['name'] else 'bottom',rules=rules(sc),bounds=bounds,mount_origin=r(ma[:3,3]),cache_frame=frame(child(cache,'Model')))
  if brand=='norwing' and width==150:k['error']='NORWING 150: корзина и направляющая пересекают правую боковину исходной модели. Требуется исправленный FR3D; выберите 200, 300 или 400 мм.'
  else:assert bounds['lo'][0]>=-.01 and bounds['hi'][0]<=width-36+.01,(source.name,width,bounds)
  v['kits'].append(k)
 assert sorted(k['width'] for k in v['kits'])==v['source_widths']
 assert len(v['panels'])==len({p['key'] for p in v['panels']})==7
 v['kits'].sort(key=lambda k:k['width'])
 # Keep 1 mm clearance above the measured kit envelope, including the Gola grip profile.
 obstruction=max((p['bounds']['size'][1] for p in v['profiles']),default=18)
 v['min_body_height']=max(600,math.ceil(max(k['mount_origin'][1]+k['bounds']['hi'][1]-100 for k in v['kits'] if not k.get('error'))+obstruction+1))
 if brand=='norwing':v['warnings'].append(v['kits'][0]['error'])
 return v

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('sources',type=Path);args=ap.parse_args()
 rows=[extract(p) for p in sorted(args.sources.glob('*Карго*.fr3d'))]
 assert len(rows)==6 and len({(v['brand'],v['execution']) for v in rows})==6
 (OUT/'cargo-variants.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
 (OUT/'cargo-variants.js').write_text('/* Generated from audited FR3D sources; do not edit. */\nglobalThis.MF_CARGO_VARIANTS = '+json.dumps(rows,ensure_ascii=False,separators=(',',':'))+';\n')
 print('Cargo:',[(v['brand'],v['execution'],v['allowed_widths']) for v in rows])
