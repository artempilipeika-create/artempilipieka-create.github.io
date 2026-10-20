"""Read Gola FR3D donors as data. Preserve SHA, panels, contours and native rules."""
from fr3d_reader import *
import math
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'backend/v2/cabinet_assets/planner'

def poly(raw):
 b=bytes.fromhex(raw['hex']);count=struct.unpack_from('<I',b)[0];i=4;segments=[]
 for _ in range(count):
  ty=b[i];i+=1
  if ty==16:
   seg=np.array(struct.unpack_from('<4d',b,i)).reshape(2,2);i+=32
  elif ty==18:
   c,a,z=np.array(struct.unpack_from('<6d',b,i)).reshape(3,2);i+=48;ccw=b[i];i+=1
   start=math.atan2(*(a-c)[::-1]);end=math.atan2(*(z-c)[::-1]);delta=(end-start)%(2*math.pi)
   if not ccw:delta-=2*math.pi
   # BAZIS Direction=true denotes clockwise; endpoints and observed quarter circles
   # select the minor fillet independently of the segment storage orientation.
   if abs(delta)>math.pi:delta=delta-math.copysign(2*math.pi,delta)
   radius=np.linalg.norm(a-c);assert abs(radius-np.linalg.norm(z-c))<.01
   seg=np.array([c+radius*np.array([math.cos(q),math.sin(q)]) for q in np.linspace(start,start+delta,max(3,math.ceil(abs(delta)*12)+1))])
  else:raise ValueError(('unsupported profile segment',ty))
  segments.append(seg)
 assert i==len(b) or (len(b)-i==4*count and not any(b[i:]))
 chain=list(segments.pop(0))
 while segments:
  candidates=[(np.linalg.norm(chain[-1]-s[j]),k,j) for k,s in enumerate(segments) for j in [0,-1]]
  distance,k,j=min(candidates);assert distance<.02,distance
  s=segments.pop(k);chain.extend(s[1:] if j==0 else s[-2::-1])
 assert np.linalg.norm(chain[0]-chain[-1])<.02
 return np.array(chain[:-1])

def panel(n,mat,path):
 v=vals(n);xy=poly(v['Contour']);pts=np.array([(mat@[*p,z,1])[:3] for p in xy for z in [0,v['Thick']]])
 bounds=points_bound(pts);size=bounds['size'];lo=bounds['lo'];thick_axis=int(np.argmax(np.abs(mat[:3,2])));axes=[int(np.argmax(np.abs(mat[:3,0]))),int(np.argmax(np.abs(mat[:3,1]))),thick_axis]
 ret=dict(name=v['Name'],lo=lo,size=size,center=[round(lo[i]+size[i]/2-[300,0,255][i],4) for i in range(3)],axes=axes,thickness=v['Thick'],source_path=path,source_id=v['ID'])
 if 'Боковая -' in v['Name']:
  ret['contour_yz']=r(np.array([(mat@[*p,0,1])[1:3] for p in xy]))
 return ret

def purchase(t):
 counts=collections.Counter();fn={vals(n).get('FastID'):n for n in child(t,'FurnList')['children']}
 def visit(n):
  v=vals(n);ty=v.get('Type')
  if ty==4001:counts[v.get('Name','')]+=1;return
  if ty==3001:
   e=fn.get(v.get('FastID'));els=child(child(e,'ParData'),'Elements')['children'] if e else []
   for name in [x['value'] for x in els] or [v.get('Name','')]:
    if name and not re.fullmatch(r'[\d.,]+[xх×][\d.,]+',name):counts[name]+=1
  for c in n['children']:visit(c)
 visit(child(t,'Model'))
 return [dict(key='gola-hw-'+str(i+1),name=k.split('\r')[0],article=k.split('\r')[-1] if '\r' in k else None,quantity=v,unit='pcs') for i,(k,v) in enumerate(counts.items())]

def slot_data(n,system):
 f=frame(n);hs=[]
 if system!='ball':
  for ch in child(n,'Objs')['children']:
   sc=scheme(ch)
   if sc and vals(sc).get('MountDir')==1:
    hs.append({'rules':rules(sc),'lengths':length_options(child(cached(sc),'Model'))})
 if not hs:hs=[{'rules':[{'Count':1,'Length':2000}], 'lengths':length_options(n)}]
 out=[]
 for h in hs:
  lengths=[]
  for l in h['lengths']:
   name=l['name'];length=int(re.search(r'(?:NL=|L-)(\d+)',name)[1]);hhmatch=re.search(r'H\s*=\s*(\d+)',name);hh=int(hhmatch[1]) if hhmatch else None
   hw=next((x for x in l['hardware'] if x['name'].startswith('Система ящиков')),None)
   article=name.split('\r')[1] if '\r' in name else hw['article'] if hw else None
   display=name.split('\r')[0] if system=='aq' else hw['name'] if hw else name
   error='Во фрагменте нет встроенной геометрии этого комплекта' if not l['panels'] else ''
   if hw and hh and int(re.search(r'H\s*=\s*(\d+)',hw['name'])[1])!=hh:error='В исходном фрагменте не совпадают высота комплекта и спецификация'
   boards={}
   if not error and system!='ball':
    for p in l['panels']:
     key='bottom' if 'Дно' in p['name'] else 'rear';assert key not in boards
     size=[round(p['size'][0]+564-l['frame']['size'][0],4),*p['size'][1:]];lo=p['lo'].copy();lo[2]-=l['frame']['size'][2]
     boards[key]=dict(size=size,center=[round(lo[j]+size[j]/2,4) for j in range(3)])
   lengths.append(dict(rules=l['rules'],length_mm=length,height_mm=hh,name=display,article=article,boards=boards,hardware=l['hardware'],**({'error':error} if error else {})))
  out.append(dict(rules=h['rules'],lengths=lengths))
 return dict(y=f['origin'][1],height=round(f['size'][1],6),depth=f['size'][2],heights=out)

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('sources',type=Path);args=ap.parse_args();rows=[]
 for source in sorted(args.sources.glob('*.fr3d')):
  if 'Gola' not in source.name:continue
  # The user replaced AQ three-drawer revision (1) with revision (2).
  if source.name=='НМРШ3-600.З.С 3мм Гвозди. Ящик AQ LineBox.Gola II(1).fr3d':continue
  t=load(source);m=child(t,'Model');sha=hashlib.sha256(source.read_bytes()).hexdigest();isdrawer=source.name.startswith('НМРШ');system=('ball' if 'Шариковые' in source.name else 'aq' if 'AQ' in source.name else 'slimbox') if isdrawer else None
  layout='inner' if 'Внутренний' in source.name else 'three' if source.name.startswith('НМРШ3') else 'two' if isdrawer else None
  v=dict(id='bazis.'+sha[:12],source_file=source.name,source_sha256=sha,execution='gola',kind='drawers' if isdrawer else 'doors',system=system,layout=layout,opening='soft',manufacturer='Westline' if system=='aq' else 'AKS',series={'ball':'Обычные шариковые','aq':'AQ LineBox','slimbox':'Slimbox Evolution'}.get(system,''),drawer_count=(3 if layout in ['inner','three'] else 2) if isdrawer else 0,door_count=0 if isdrawer else 2 if source.name.startswith('НМД2') else 1,side='double' if source.name.startswith('НМД2') else 'left' if 'Отк L' in source.name else 'right',purpose='sink' if 'Мойка' in source.name else 'shelf',model_elastic=planeinfo(child(child(t,'ModelParams'),'Params')),panels=[],profiles=[],hardware_items=purchase(t),elastic_drawers=[],warnings=[])
  slots=[n for n in m['children'] if vals(n).get('Name','').startswith(('Направляющие','Мульти ящик'))]
  slots=sorted(slots,key=lambda n:frame(n)['origin'][1]);slot_ids={vals(n).get('ID'):i+1 for i,n in enumerate(slots)}
  def visit(n,mat=np.eye(4),path='',drawer_index=None):
   mat=tran(mat,n);x=vals(n);name=x.get('Name','');path+='/'+name if n['key']=='Obj' else ''
   drawer_index=slot_ids.get(x.get('ID'),drawer_index)
   if x.get('Type')==4002 and x.get('Thick',0)>=1:
    p=panel(n,mat,path);p['role']='drawer' if drawer_index else 'front' if name=='Фасад' else 'back' if name=='З.С' else 'shelf' if name=='Полка' else 'body'
    if drawer_index:p['drawer_index']=drawer_index
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
  assert len({p['key'] for p in v['panels']})==len(v['panels'])
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
  rows.append(v)
  print(source.name,'panels',len(v['panels']),'fronts',v['front_heights'],'profiles',[(p['article'],p['bounds']) for p in v['profiles']],'slots',len(slots))
 assert len(rows)==13
 (OUT/'gola-variants.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
 (OUT/'gola-variants.js').write_text('/* Generated by scripts/build-gola-variants.py. */\nglobalThis.MF_GOLA_VARIANTS = '+json.dumps(rows,ensure_ascii=False,separators=(',',':'))+';\n')
