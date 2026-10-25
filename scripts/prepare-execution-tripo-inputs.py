"""Local synthetic UI test; all API calls are mocked, with no order submission."""
import json,os,sys,threading,time,urllib.request,base64,hashlib
from pathlib import Path
from fastapi import FastAPI
from playwright.sync_api import sync_playwright,expect
import uvicorn
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from backend.v2.cabinet_ui import router
app=FastAPI();app.include_router(router());base='http://127.0.0.1:8090'
threading.Thread(target=lambda:uvicorn.run(app,host='127.0.0.1',port=8090,log_level='error'),daemon=True).start()
for _ in range(40):
 try:urllib.request.urlopen(base+'/constructor');break
 except OSError:time.sleep(.1)
errors=[];blocked=[];saved_responses=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('MF_TEST_BROWSER'),args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1700,'height':1100});page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:saved_responses.append(r) if '/api/v2/3d-projects' in r.url and r.request.method in ('POST','PATCH') else None)
 def gate(route):
  req=route.request
  if '/api/v2/' not in req.url:
   if req.method=='GET' and req.url.startswith(base+'/'):route.continue_();return
   blocked.append(req.url);route.abort();return
  path=req.url.split('/api/v2/')[1].split('?')[0]
  if path=='auth/me':data={'user_id':'synthetic-open-tall'}
  elif path=='3d-sales-capabilities':data={'automatic_render':False,'max_pages':5}
  elif path=='3d-projects' and req.method=='POST':data={**json.loads(req.post_data),'project_id':'synthetic-open-tall','version':1}
  elif path=='3d-projects/synthetic-open-tall' and req.method=='PATCH':data={**json.loads(req.post_data),'project_id':'synthetic-open-tall','version':2}
  elif path=='catalogue/materials' or path=='3d-projects':data={'items':[]}
  elif path=='3d-projects/undefined' and req.method=='PATCH':data={**json.loads(req.post_data),'project_id':'synthetic-open-tall','version':1}
  elif path=='catalogue/releases':data={'active_release':None}
  elif path.startswith('catalogue/materials/'):data={'variant_id':path.split('/')[-1],'name':'Проверочный материал','thickness':18}
  else:blocked.append(req.method+' '+path);route.abort();return
  route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
 page.route('**/*',gate);page.goto(base+'/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=40000)


 out=Path(os.environ.get('MF_TEST_OUTPUT',str(ROOT/'docs/tripo-executions-20261026/input')));out.mkdir(parents=True,exist_ok=True)
 page.set_viewport_size({'width':1680,'height':1100})
 page.evaluate("""async()=>{const p=MF_PLANNER;await p.bridge.loadSnapshot({name:'Исполнения модулей',scene:{schema_version:2,room:{width:6000,depth:5000,height:3000,setup_complete:true,features:[]},items:[],plinths:[],selected_item_id:null,view_mode:'3d'},selectedId:null},null);p.roomSetup.projectChanged();p.history.reset();}""")
 families=[('base','bazis.0211e4f77fc4'),('base-double','bazis.3079d0656398'),('drawer','bazis.39f282e08f0c'),('oven','bazis.9e77f4333545'),('corner','bazis.a310afbf587f'),('cargo','bazis.0ac4e1b6b2d3'),('dryer','bazis.85c150c30ea5'),('dishwasher','bazis.300138dc82b5'),('upper','bazis.858266606bc5'),('upper-double','bazis.6c187245284a')]
 more=page.evaluate("""()=>Object.entries(MF_CATALOGUE_ARTWORK).filter(([id,v])=>['open-tall-none','tall-vitrine','tall-storage','tall-appliance'].includes(v.file)).map(([id,v])=>[v.file,id])""");families+=more
 report=[]
 def load_module(id):
  page.evaluate("""id=>{const p=MF_PLANNER,it=p.adapter.createDraft({bazis:id});it.x=1000;it.z=1000;p.adapter.state.items=[it];p.adapter.select(it.item_id);p.bridge.refresh();p.history.reset();p.workspace.panel('right',true);}""",id)
  expect(page.locator('#module-execution-preview')).to_be_visible()
  page.locator('#module-execution-preview').scroll_into_view_if_needed()
  expect(page.locator('#module-execution-preview canvas')).to_have_attribute('data-preview-ready','true',timeout=30000)
 def ready_cards(root):
  for c in page.locator(root+' .execution-choice:visible:enabled canvas').all():
   if c.is_visible():c.scroll_into_view_if_needed();expect(c).to_have_attribute('data-preview-ready','true',timeout=30000)
 def shot(root,name):
  ready_cards(root)
  for index,group in enumerate(page.locator(root+' .execution-grid:visible').all()):
   group.scroll_into_view_if_needed();group.screenshot(path=str(out/(name+'-group-'+str(index)+'.png')))
 rows=[]
 for category,id in families:
  load_module(id)
  if category=='drawer':page.locator('[data-drawer-option=system][data-drawer-value=slimbox]').click()
  if category=='open-tall-none':page.locator('[data-open-tall-option=light_system][data-open-tall-value="aq-4x8"]').click()
  result=page.evaluate("""async category=>{
   const p=MF_PLANNER,u=p.executions,r=u.renderer,{optionDescriptor,previewVariant}=await import('/account/planner/execution-options.mjs');
   r.width=800;r.height=640;r.target.setSize(r.width,r.height);r.pixels=new Uint8Array(r.width*r.height*4);r.cache.clear();
   const buttons=[...document.querySelectorAll('.execution-family:not([hidden]) .execution-choice')].filter(b=>!b.hidden&&!b.disabled),result=[];
   for(const b of buttons){
    let family,key,value;
    if(b.dataset.executionProxy)[family,key,value]=b.dataset.executionProxy.split(':');
    else if(b.dataset.doorSide)[family,key,value]=['door','opening',b.dataset.doorSide];
    else if(b.dataset.variant)[family,key,value]=['dishwasher','execution',b.dataset.variant];
    else for(const f of ['base','upper','drawer','corner','tall','vitrine','open-tall'])if(b.hasAttribute('data-'+f+'-option')){family=f;key=b.getAttribute('data-'+f+'-option');value=b.getAttribute('data-'+f+'-value');break;}
    if(!family||['width','row_height'].includes(key))continue;
    const opt=optionDescriptor(family,key,value);if(opt.photo)continue;
    const it=previewVariant(p.adapter.selected,family,key,value,p.bridge.catalogue.bazisModules);
    Object.assign(it,{x:0,z:0,rotation:0,elevation_mm:0,doors_open:opt.view==='hinge',body_variant_id:null,front_variant_id:null,back_variant_id:null,drawer_variant_id:null,part_materials:{}});
    const canvas=document.createElement('canvas');canvas.width=r.width;canvas.height=r.height;canvas.getContext('2d').putImageData(r.paint(it,opt),0,0);
    result.push({category,family,key,value,title:opt.title,hint:opt.hint,options:opt,bazis_id:it.bazis_id,png:canvas.toDataURL().split(',')[1]});
   }return result;
  }""",category)
  for row in result:
   name='-'.join([category,row['family'],row['key'],row['value']]);data=base64.b64decode(row.pop('png'));row['file']=name+'.png';row['sha256']=hashlib.sha256(data).hexdigest();(out/row['file']).write_bytes(data);rows.append(row)
  print(category,len(result),flush=True)
 (out.parent/'inputs.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
 print(json.dumps({'ok':True,'inputs':len(rows),'errors':errors}))
 browser.close()
