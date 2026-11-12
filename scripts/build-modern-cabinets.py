"""Build the reviewed November FR3D package; preserve bytes and source pins."""
from fr3d_reader import *
import shutil,zipfile
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'backend/v2/cabinet_assets/planner'
a=argparse.ArgumentParser();a.add_argument('sources',type=Path);args=a.parse_args()
exclude={'09f5f653393afbd4d59ab07f6222852892fa42e957f76904946137497e766607','297e66ac9c5897f29fbe71721d24de8567f33215f065cc5650386d4378f91dd9'}
def clean(n):
 return {c['key']:clean(c) if c['children'] else c['value'] for c in n['children']}
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
 return [dict(key='native-hw-'+str(i),name=k.split('\r')[0],article=k.split('\r')[-1] if '\r' in k else None,quantity=v,unit='pcs') for i,(k,v) in enumerate(counts.items())]
rows=[];seen=set();files=[]
for source in sorted(args.sources.glob('*.fr3d')):
 sha=hashlib.sha256(source.read_bytes()).hexdigest()
 if sha in exclude or sha in seen:continue
 seen.add(sha);t=load(source);m=child(t,'Model');panels=[];shelf_rules=[];rails=[]
 for n,mat,path in walk(m):
  v=vals(n);name=v.get('Name','')
  if v.get('Type')==4002 and v.get('Thick',0)>=1:
   p=panelinfo(n,mat,path)
   role='front' if name=='Фасад' else 'back' if name=='З.С' else 'shelf' if name=='Полка' else 'body'
   axes=[int(np.argmax(np.abs(mat[:3,i]))) for i in range(3)]
   panels.append(dict(key='native-'+str(p['id']),name=name,role=role,lo=p['bounds']['lo'],size=p['bounds']['size'],thickness=p['thickness'],material_name=p['material'].split('\r')[0],axes=axes,cuts=p['cuts'],edges=[clean(c) for c in child(n,'Butts')['children']],texture_direction=v.get('TexDir')))
  if 'Шина для навесов' in path and v.get('Type')==2004:rails.append(dict(name=name,length=v.get('Thickness',0),matrix=r(mat)))
  if 'Параметрическая полка' in name:
   sc=scheme(n)
   if sc:shelf_rules.append(dict(name=name,rules=rules(sc),parameters={k:x for k,x in vals(sc).items() if k in ['StartIndent','EndIndent','PrimStep','SizeParam','AroundStep']},cached=kit(sc)))
 hw=purchase(t);fronts=[p for p in panels if p['role']=='front'];groove=any(p['cuts'] for p in panels);fridge=source.name.startswith('ПН');gas='Газ.' in source.name
 family='fridge' if fridge else 'gaslift' if gas else 'upper2' if len(fronts)==2 else 'upper1'
 execution='push' if 'tip-on' in source.name.lower() else 'handleless' if 'без ручек' in source.name.lower() else 'handles'
 dryer=next((h for h in hw if h['article'] in ['113272','38402']),None)
 row=dict(id='bazis.'+sha[:12],source_file=source.name,source_sha256=sha,family=family,side='up' if gas else 'left' if 'отк L' in source.name else 'right' if 'отк P' in source.name else 'double' if len(fronts)==2 else 'left',door_count=len(fronts),execution=execution,filling='dryer' if dryer else 'empty' if gas or fridge else 'shelves',dryer='inox' if dryer and dryer['article']=='38402' else 'mount' if dryer else 'none',back='none' if fridge else 'groove' if groove else 'overlay',fridge_layout='820' if '820' in source.name else '900' if '900' in source.name else 'single',native_frame=frame(m),panels=panels,hardware_items=hw,shelf_rules=shelf_rules,rails=rails,global_planes=planeinfo(child(child(t,'ModelParams'),'Params')))
 row['default_height']=450 if gas else row['native_frame']['size'][1]
 row['rear_inset_mm']=0 if groove or fridge else 3
 row['label']={'upper1':'ВМД1 · верхний шкаф','upper2':'ВМД2 · верхний шкаф','gaslift':'ВМД1 · газлифты','fridge':'ПН-600 · холодильник'}[family]
 rows.append(row);files.append(source)
assert len(rows)==39,len(rows)
assert len({(v['family'],v['side'],v['execution'],v['filling'],v['dryer'],v['back'],v['fridge_layout']) for v in rows})==len(rows)
for suffix,content in [('json',json.dumps(rows,ensure_ascii=False,indent=2)),('js','globalThis.MF_MODERN_CABINET_VARIANTS = '+json.dumps(rows,ensure_ascii=False,separators=(',',':'))+';')]:
 (OUT/('modern-cabinet-variants.'+suffix)).write_text(content+'\n')
source_dir=OUT/'modern-cabinet-sources';source_dir.mkdir(exist_ok=True)
for p in files:shutil.copy2(p,source_dir/p.name)
import sys
sys.path.insert(0,str(ROOT))
from backend.v2.modern_archive import build_archive
build_archive(OUT)
print('Prepared',len(rows),'unique verified sources:',dict(collections.Counter(v['family'] for v in rows)))
