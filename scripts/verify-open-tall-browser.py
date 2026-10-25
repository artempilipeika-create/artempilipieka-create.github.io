"""Local synthetic UI test; all API calls are mocked, with no order submission."""
import json,os,sys,threading,time,urllib.request
from pathlib import Path
from fastapi import FastAPI
from playwright.sync_api import sync_playwright,expect
import uvicorn
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from backend.v2.cabinet_ui import router
app=FastAPI();app.include_router(router());base='http://127.0.0.1:8086'
threading.Thread(target=lambda:uvicorn.run(app,host='127.0.0.1',port=8086,log_level='error'),daemon=True).start()
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

 assert page.locator('#module-catalogue button').filter(has_text='Открытый пенал').count()==1
 # All new catalogue families must serve their reviewed Tripo photographs.
 cards=page.locator('#module-catalogue [data-card-artwork=tripo]')
 assert cards.count()==3
 for image in cards.locator('img').all():
  response=page.request.get(base+image.get_attribute('src'))
  assert response.status==200 and response.headers['content-type'].startswith('image/webp')

 page.evaluate("""async()=>{const p=MF_PLANNER;
 const it={...p.adapter.createDraft({bazis:MF_OPEN_TALL.family.default_id}),item_id:'open',x:0,z:0};
 if(it.front_variant_id!==null||it.handles!=='handleless')throw new Error('Facadeless defaults');
 const room={width:5000,depth:4000,height:3000,setup_complete:true,features:[]};
 await p.bridge.loadSnapshot({name:'Проверка открытого пенала',scene:{schema_version:2,room,items:[it],plinths:[],selected_item_id:'open',view_mode:'3d'},selectedId:'open'},null);
 p.roomSetup.projectChanged();p.history.reset();p.scene.fit('kitchen');}""")
 if not page.locator('#open-tall-controls').is_visible():page.locator('#studio-toggle-inspector').click()
 expect(page.locator('#open-tall-controls')).to_be_visible()
 for image in page.locator('#open-tall-controls .ot-option-image img').all():
  image.scroll_into_view_if_needed()
  expect(image).to_be_visible()
  page.wait_for_function('(src)=>[...document.images].some(i=>i.src===src&&i.complete&&i.naturalWidth>0)',arg=image.get_attribute('src') if image.get_attribute('src').startswith('http') else base+image.get_attribute('src'))
 assert page.locator('#open-tall-controls .ot-option-image img').count()==3

 assert page.locator('[data-open-tall-option=light_system][data-open-tall-value=none]').get_attribute('aria-pressed')=='true'
 assert not page.locator('#open-tall-lighting-choices').is_visible()
 for system in ['aq-4x8','lira-17.5x6.5']:
  page.locator(f'[data-open-tall-option=light_system][data-open-tall-value="{system}"]').click()
  for side in ['left','right','both']:
   page.locator(f'[data-open-tall-option=lighting][data-open-tall-value="{side}"]').click()
   data=page.evaluate("""()=>{const p=MF_PLANNER,it=p.adapter.selected,v=MF_OPEN_TALL.info(it),m=MF_OPEN_TALL.metrics(it);return {system:v.light_system,side:v.lighting,error:p.adapter.validate(it),parts:MF_FURNITURE_CORE.productionParts(it,p.adapter.template(it)).length,facades:MF_FURNITURE_CORE.facadeCells(it,p.adapter.template(it)).length,caps:m.light_profile_end_caps}}""")
   assert data['system']==system and data['side']==side and not data['error'] and data['parts']==6 and data['facades']==0,data
   if system=='lira-17.5x6.5':assert data['caps']==(8 if side=='both' else 4)
 # Added shelf changes both the fasteners and illumination segments in one undo step.
 page.locator('#open-tall-shelf-plus').click()
 assert page.evaluate('MF_PLANNER.adapter.selected.upper_shelf_count')==2
 assert page.evaluate('MF_OPEN_TALL.metrics(MF_PLANNER.adapter.selected).light_profile_end_caps')==12
 page.locator('#planner-undo').click()
 assert page.evaluate('MF_PLANNER.adapter.selected.upper_shelf_count??null') is None
 page.locator('#open-tall-shelf-plus').click()
 page.locator('#depth').fill('300');page.locator('#depth').press('Tab')
 assert page.evaluate('MF_PLANNER.adapter.selected.depth')==300
 page.locator('#depth').fill('299');page.locator('#depth').press('Tab')
 assert page.evaluate('MF_PLANNER.adapter.selected.depth')==300
 page.locator('#height').fill('2400');page.locator('#height').press('Tab')
 assert page.evaluate('MF_PLANNER.adapter.selected.height')==2400
 page.locator('[data-open-tall-option=light_system][data-open-tall-value="none"]').click()
 assert page.evaluate('MF_OPEN_TALL.metrics(MF_PLANNER.adapter.selected).led_order_length_m')==0
 page.locator('[data-open-tall-option=light_system][data-open-tall-value="lira-17.5x6.5"]').click()
 page.locator('[data-open-tall-option=lighting][data-open-tall-value="both"]').click()
 page.locator('#save-project').click()
 for _ in range(100):
  if page.evaluate('!MF_PROJECT_SAFETY.engine.dirty && !MF_PROJECT_SAFETY.engine.busy'):break
  page.wait_for_timeout(100)
 else:raise AssertionError('Save did not settle')
 assert saved_responses;stored=saved_responses[-1].json()
 page.evaluate("""async stored=>{await MF_PLANNER.bridge.loadSnapshot({...stored,selectedId:'open'},stored);MF_PLANNER.bridge.refresh()}""",stored)
 assert page.locator('[data-open-tall-option=light_system][data-open-tall-value="lira-17.5x6.5"]').get_attribute('aria-pressed')=='true'
 assert page.locator('[data-open-tall-option=lighting][data-open-tall-value="both"]').get_attribute('aria-pressed')=='true'
 assert page.locator('#open-tall-shelf-count').inner_text()=='2'
 with page.expect_download() as download:page.evaluate("document.getElementById('export-bazis').click()")
 native=json.loads(Path(download.value.path()).read_text());opened=next(i for i in native['items'] if i.get('construction',{}).get('open_tall'))
 assert opened['source_default']==dict(width=600,height=2000,depth=600)
 assert opened['target']['depth']==300 and opened['target']['height']==2400
 assert len(opened['construction']['parts'])==7 and not opened['construction']['facade']
 assert opened['construction']['native_adjustment']['count']==2
 assert opened['construction']['open_tall']['light_profile_end_caps']==12
 # Reload with adjacent lower and upper cabinets, exercise the existing alignment UI.
 page.evaluate("""async()=>{const p=MF_PLANNER,C=MF_FURNITURE_CORE;
 const open={...p.adapter.selected,upper_shelf_count:null,x:-1200,z:-1000};
 const base={...p.adapter.createDraft({bazis:'bazis.3079d0656398'}),item_id:'lower',x:-1800,z:-1695};
 const wallSource=p.bridge.catalogue.bazisModules.find(t=>t.module_type==='wall_cabinet');
 const wall={...p.adapter.createDraft({bazis:wallSource.id}),item_id:'upper',x:-1800,z:-1800};
 const scene={...p.adapter.state,items:[open,base,wall],plinths:[{id:'shared',automatic:true,members:[],shape:'straight',excluded_members:[]}],selected_item_id:'open'};
 await p.bridge.loadSnapshot({name:'Проверка выравнивания',scene,selectedId:'open'},null);p.bridge.refresh();p.scene.fit('kitchen');}""")
 if not page.locator('#tall-align-front').is_visible():page.locator('#studio-toggle-inspector').click()
 assert not page.locator('#tall-align-front').is_disabled()
 page.locator('#tall-align-front').click()
 aligned=page.evaluate("""()=>{const p=MF_PLANNER,it=p.adapter.selected,base=p.adapter.items.find(i=>i.item_id==='lower'),C=MF_FURNITURE_CORE;return {wall:it.z-it.depth/2,front:C.cabinetFrontDatum(it),basefront:C.cabinetFrontDatum(base),error:p.adapter.validate(it),plans:MF_ACCESSORIES.plans(p.adapter.state,()=>null).map(p=>({members:p.members,parts:p.parts.filter(x=>x.role==='plinth')}))}}""")
 assert aligned['wall']==-2000 and aligned['front']==aligned['basefront'] and not aligned['error'],aligned
 assert not page.locator('#tall-align-top').is_disabled()
 page.locator('#tall-align-top').click()
 assert page.evaluate("(()=>{const p=MF_PLANNER,it=p.adapter.selected,upper=p.adapter.items.find(i=>i.item_id==='upper');return it.height===MF_FURNITURE_CORE.elevation(upper,p.adapter.room)+upper.height})()")
 page.locator('#open-tall-controls').scroll_into_view_if_needed()
 page.screenshot(path='/tmp/open-tall-ui.png')
 Path('/tmp/open-tall-saved.json').write_text(json.dumps(stored['scene']));Path('/tmp/open-tall-native.json').write_text(json.dumps(native))
 assert not errors and not blocked,dict(errors=errors,blocked=blocked)
 print(json.dumps({'ok':True,'one_card':True,'seven_configurations':True,'depth300':True,'undo':True,'save_reopen':True,'native_export':True,'front_alignment':True,'top_alignment':True,'errors':errors}),flush=True)
 browser.close()
