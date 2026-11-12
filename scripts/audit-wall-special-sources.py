"""Static FR3D audit only: no embedded native script is executed."""
from pathlib import Path
import sys, json, hashlib, collections, re
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from fr3d_reader import *
ROOT=Path(__file__).resolve().parents[1]
SRC=Path(sys.argv[1]);OUTPUT=Path(sys.argv[2])
def clean(n):
 out={}
 for c in n['children']:
  v=clean(c) if c['children'] else c['value']
  if isinstance(v,dict) and 'hex' in v: v={'bytes':v['bytes'],'sha256':hashlib.sha256(bytes.fromhex(v['hex'])).hexdigest()}
  if c['key'] in out:
   if not isinstance(out[c['key']],list):out[c['key']]=[out[c['key']]]
   out[c['key']].append(v)
  else:out[c['key']]=v
 return out

def loops(lines):
 seg=[np.array(x['points']) for x in lines];left=list(range(len(seg)));result=[]
 while left:
  first=left.pop(0);out=[seg[first][0],seg[first][1]]
  while left and np.linalg.norm(out[-1]-out[0])>=1e-3:
   hit=None
   for i in left:
    if np.linalg.norm(seg[i][0]-out[-1])<1e-3:hit=(i,seg[i][1]);break
    if np.linalg.norm(seg[i][1]-out[-1])<1e-3:hit=(i,seg[i][0]);break
   if hit is None:raise ValueError('disconnected contour')
   left.remove(hit[0]);out.append(hit[1])
  if np.linalg.norm(out[-1]-out[0])<1e-3:out.pop()
  result.append(r(np.array(out)))
 def area(v):return abs(sum(v[i][0]*v[(i+1)%len(v)][1]-v[(i+1)%len(v)][0]*v[i][1] for i in range(len(v))))
 return sorted(result,key=area,reverse=True)
def purchase(t):
 counts=collections.Counter();fn={vals(n).get('FastID'):n for n in child(t,'FurnList')['children']}
 def visit(n):
  v=vals(n);ty=v.get('Type')
  if ty==4001:counts[v.get('Name','')]+=1;return
  if ty==3001:
   e=fn.get(v.get('FastID'));els=child(child(e,'ParData'),'Elements')['children'] if e else []
   for name in [x['value'] for x in els] or [v.get('Name','')]:
    if name and not re.fullmatch(r'[\d.,]+[xх×][\d.,]+',name) and not name.startswith('Отверстие') and not name.endswith('\r-Отв.'):counts[name]+=1
  for c in n['children']:visit(c)
 visit(child(t,'Model'))
 return [dict(name=k.split('\r')[0],article=k.split('\r')[-1] if '\r' in k else None,quantity=v) for k,v in counts.items()]

def geom(n,mat,path,profile=False):
 v=vals(n);lines=contour(v['Contour']);ll=loops(lines);vv=ll[0];thick=v['Thickness' if profile else 'Thick'];pts=[(mat@[*xy,z,1])[:3] for xy in vv for z in (0,thick)]
 if profile:p={'name':v.get('Name'),'id':v.get('ID'),'material':v.get('Mat'),'thickness':thick,'path':path,'matrix':r(mat),'bounds':points_bound(pts),'local_bounds':points_bound(vv),'local_size':r(np.ptp(vv,axis=0))}
 else:p=panelinfo(n,mat,path)
 p.update(local_contour=lines,local_loops=ll,local_vertices=vv,world_vertices_front=r(np.array([(mat@[*xy,0,1])[:3] for xy in vv])),world_vertices_back=r(np.array([(mat@[*xy,thick,1])[:3] for xy in vv])),axes=r(mat[:3,:3].T),butts=[clean(c) for c in child(n,'Butts')['children']],clip_planes=clean(child(n,'ClipPlanes')),tex_dir=v.get('TexDir'),native_type=v.get('Type'))
 if profile:p['extrusion_length_mm']=thick;p['bounds_note']='Unclipped extrusion bounds; clip_planes retain native miter cuts.'
 return p
rows=[]
for source in sorted(SRC.glob('*.fr3d')):
 t=load(source);m=child(t,'Model');sha=hashlib.sha256(source.read_bytes()).hexdigest();row=dict(id='bazis.'+sha[:12],source_file=source.name,source_sha256=sha,native_frame=frame(m),global_elastic=clean(child(child(child(t,'ModelParams'),'Params'),'Elastic')),panels=[],profiles=[],frames=[],elastic_groups=[],shelf_rules=[],door_groups=[],hardware_items=purchase(t),warnings=[],skipped_profile_geometry=[],hinge_instances=[],animation_points=[])
 row['global_planes']=planeinfo(child(child(t,'ModelParams'),'Params'))
 row['family']='upper_corner' if source.name.startswith('ВМУ') else 'upper_vitrine'
 row['door_count']=2 if source.name.startswith('ВМД2') else 1
 row['door_side']='double' if row['door_count']==2 else 'left' if re.search(r'Отк[._ ]*L',source.name) else 'right'
 row['execution']='handleless' if 'Без ручек' in source.name else 'handles' if row['family']=='upper_corner' else 'push'
 row['groove_width_mm']=17.5 if '17.5мм' in source.name else 4 if row['family']=='upper_vitrine' else None
 row['groove_side']='both' if 'две Стороны' in source.name else 'left' if re.search(r'мм_L',source.name) else 'right' if row['family']=='upper_vitrine' else None
 for n,mat,path in walk(m):
  v=vals(n);typ=v.get('Type');name=v.get('Name','')
  if n['key']=='Obj':
   elastic=child(child(n,'Params'),'Elastic')
   if elastic['children']:row['elastic_groups'].append(dict(name=name,path=path,matrix=r(mat),planes=planeinfo(child(n,'Params')),area_step=clean(child(elastic,'AreaStep'))))
  if typ==8100 and name.startswith('Точка анимации'):row['animation_points'].append(dict(name=name,id=v.get('ID'),path=path,origin=r(mat[:3,3]),matrix=r(mat),parameters=clean(child(n,'Params'))))
  if (typ==4001 and 'петля' in name.lower()) or (typ==3001 and 'Петля гидравлическая HCKT' in name):row['hinge_instances'].append(dict(name=name,id=v.get('ID'),path=path,origin=r(mat[:3,3]),matrix=r(mat)))
  if typ==1001 and 'Width' in v:row['frames'].append(dict(name=name,path=path,origin=r(mat[:3,3]),size=[v.get(k,0) for k in ('Width','Height','Depth')],matrix=r(mat)))
  if typ==1005 and (v.get('FurnType')=='Фасад' or name.startswith('Фасад. За ФП')):row['door_groups'].append(dict(name=name,path=path,origin=r(mat[:3,3]),matrix=r(mat),parameters=clean(child(n,'Params'))))
  if typ==4002 and v.get('Thick',0)>=1:
   try:row['panels'].append(geom(n,mat,path))
   except Exception as e:row['warnings'].append('PANEL EXTRACTION ERROR: '+name+': '+str(e))
  if typ==2004 and v.get('Mat','').startswith('Профиль фасадный Z1'):
   try:row['profiles'].append(geom(n,mat,path,True))
   except Exception as e:row['warnings'].append('PROFILE EXTRACTION ERROR: '+name+': '+str(e))
  sc=scheme(n)
  if sc:
   try:k=kit(sc)
   except Exception as e:k={'error':str(e)}
   sv=vals(sc);row['shelf_rules'].append(dict(name=name,path=path,matrix=r(mat),rules=rules(sc),mount_direction=sv.get('MountDir',0),parameters={k:x for k,x in sv.items() if k in ['StartIndent','EndIndent','PrimStep','SizeParam','AroundStep']},cached=k))
   if k.get('missing_cache'):row['warnings'].append('Native parametric shelf references an external FR3D without ObjectCache; existing measured shelves are available, automatic native regeneration requires '+str(k.get('file')))
 row['resize_recommendation']={
  'native_exact_geometry_supported':True,
  'verified_numeric_size_limits':None,
  'width':{'policy':'supported with component-aware deformation','corner_transform':'shift coordinates above source global X plane by deltaW; keep blind block width371 and exposed leaf width W-374' if row['family']=='upper_corner' else 'single leaf widthW-4; double leaves W/2-3 with equal half-delta distribution across facade X243/511 planes; keep rail section19x20.5, preserve individual edge clearances'},
  'height':{'policy':'supported with body/facade deformation plus shelf recomputation','shelf_count':2 if row['family']=='upper_vitrine' else 1,'shelf_section_bottom_mm':18,'shelf_section_height_formula':'H-36','shelf_instance_frame_height_mm':18,'shelf_bottom_formula':'18 + (i+1)*(H-36-N*18)/(N+1) + i*18; i=0..N-1; glass actual thickness4, corner shelf18'},
  'depth':{'policy':'lock at source depth until native regeneration validated','native_depth_mm':row['native_frame']['size'][2],'reason':'Vitrine groove position follows nested body elastic planes; global Z plane alone disagrees. Corner blind block dimensions also encode source-depth relationship.'},
  'scope':'Preview resizing inferred from measured native parts and serialized elastic rules; not a native regeneration or load-bearing certification.'}
 if row['family']=='upper_vitrine':
  row['warnings'].append('Depth resize locked: global Z210 and body Z80/115 do not imply the same centered-groove movement; source groove center z161.5 is preserved.')
  row['front_leaves']=[]
  glass=sorted([p for p in row['panels'] if p['name']=='Стекло'],key=lambda p:p['bounds']['lo'][0])
  for i,g in enumerate(glass):
   rails=[p for p in row['profiles'] if (p['bounds']['lo'][0]+p['bounds']['hi'][0])/2 < 300] if row['door_count']==2 and i==0 else [p for p in row['profiles'] if (p['bounds']['lo'][0]+p['bounds']['hi'][0])/2 > 300] if row['door_count']==2 else row['profiles']
   bounds=points_bound([q for p in rails for q in [p['bounds']['lo'],p['bounds']['hi']]])
   row['front_leaves'].append(dict(index=i,side='left' if row['door_count']==2 and i==0 else 'right' if row['door_count']==2 else row['door_side'],glass_id=g['id'],profile_ids=[p['id'] for p in rails],bounds=bounds,glass_bounds=g['bounds'],frame_border_mm=19,hinge_pivot_note='Use hinge_instances for measured hardware position; preview outer-edge pivot is an approximation, not decoded native JointData.'))
  if row['door_count']==2:row['warnings'].append('Source hardware pairs springless Blum70T950A hinges with rubber-tip09.0022 pushers; confirm retention/closing choice. D1 source instead uses magnetic09.0016.')
 else:
  fp=next(p for p in row['panels'] if p['name']=='Фасад')
  row['front_leaves']=[dict(index=0,side=row['door_side'],panel_id=fp['id'],bounds=fp['bounds'],hinge_pivot_note='Hinged against blind filler using GTV HCKT hinge; no diagonal facade.')]
  row['warnings'].append('Native exposed facade width626mm at module width1000; preserve source size and flag any application600mm facade limit instead of silently shrinking it.')
  row['warnings'].append('Native file name says nails for rear panel, but nail quantities are absent from extracted purchase hardware.')
  if row['execution']=='handleless':row['warnings'].append('Handleless source has bottom notch and ordinary hydraulic hinges; no push-to-open item exists in extracted purchase hardware. Opening solution needs confirmation.')
  if row['door_side']=='right':row['warnings'].append('Right corner source has no 6.3x13 confirmats in purchase hardware while corresponding left donor has4; preserve source difference pending confirmation.')
 row['glass_thicknesses_mm']=sorted(set(p['thickness'] for p in row['panels'] if 'стекло' in str(p['material']).lower()))
 row['shape_panels']=[p['id'] for p in row['panels'] if len(p['local_vertices'])!=4]
 row['material_counts']=dict(collections.Counter(p['material'] for p in row['panels']))
 row['solid_geometry_bounds']=points_bound([q for p in row['panels']+row['profiles'] for q in [p['bounds']['lo'],p['bounds']['hi']]])
 rows.append(row)
assert len(rows)==22,len(rows)
assert not any('EXTRACTION ERROR' in w for x in rows for w in x['warnings'])
out=dict(schema_version=1,units='mm',native_axes=dict(x='width, increasing left to right in front view',y='vertical, increasing up',z='depth, increasing from back toward front'),notes=['FR3D parsed as static serialized data. Native scripts are never executed.','Panel local_vertices are boundary ordered; use matrix to place extruded polygon, do not replace shape panels with AABB.','Profile thickness means extrusion length, not section thickness; section is local_contour.','Hardware items are native purchase leaf/kit quantities, excluding drill-only entries; inherited nested kits are not double counted.','Global planes come from ModelParams/Params/Elastic and are in native frame axes. Group planes use each recorded matrix.','Global stretch alone does not regenerate repeated shelves: shelf_rules and existing geometry must both be respected.'],variants=rows)
OUTPUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print('Wrote',len(rows),'rows')
for x in rows:print(x['id'],x['source_file'],'frame',x['native_frame']['size'],'panels',len(x['panels']),'profiles',len(x['profiles']),'shapes',x['shape_panels'],'warnings',len(x['warnings']))
