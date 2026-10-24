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
errors=[];blocked=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('MF_TEST_BROWSER'),args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1700,'height':1100});page.on('pageerror',lambda e:errors.append(str(e)))
 def gate(route):
  req=route.request
  if '/api/v2/' not in req.url:
   if req.method=='GET' and req.url.startswith(base+'/'):route.continue_();return
   blocked.append(req.url);route.abort();return
  path=req.url.split('/api/v2/')[1].split('?')[0]
  if path=='auth/me':data={'user_id':'synthetic-dryer'}
  elif path=='3d-sales-capabilities':data={'automatic_render':False,'max_pages':5}
  elif path=='3d-projects' and req.method=='POST':data={**json.loads(req.post_data),'project_id':'synthetic-dryer','version':1}
  elif path=='3d-projects/synthetic-dryer' and req.method=='PATCH':data={**json.loads(req.post_data),'project_id':'synthetic-dryer','version':2}
  elif path=='catalogue/materials' or path=='3d-projects':data={'items':[]}
  elif path=='3d-projects/undefined' and req.method=='PATCH':data={**json.loads(req.post_data),'project_id':'synthetic-dryer','version':1}
  elif path=='catalogue/releases':data={'active_release':None}
  elif path.startswith('catalogue/materials/'):data={'variant_id':path.split('/')[-1],'name':'Проверочный материал','thickness':18}
  else:blocked.append(req.method+' '+path);route.abort();return
  route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
 page.route('**/*',gate);page.goto(base+'/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=40000)
 # Establish a synthetic scene; all subsequent edits use actual controls.
 page.evaluate('''async()=>{const p=MF_PLANNER,c=MF_FURNITURE_CORE,d=MF_PULLOUT_DRYERS;
 const corrected=d.variants.find(v=>v.previous_sources),old=corrected.previous_sources[0];
 const dryer={...p.adapter.createDraft({bazis:corrected.id}),item_id:'dryer',x:-900,z:0,bazis_sha256:old.source_sha256,bazis_file:old.source_file};
 const tall={...p.adapter.createDraft({bazis:c.APPLIANCE_TALL_FAMILY.default_id}),item_id:'tall',x:900,z:0};
 const shallow={...p.adapter.createDraft({bazis:c.TALL_FAMILY.default_id}),item_id:'shallow',x:1700,z:0};
 const upper={...p.adapter.createDraft({bazis:'bazis.877ba2f68d92'}),item_id:'upper',x:0,z:0,height:720};
 await p.bridge.loadSnapshot({name:'Проверка сушки',scene:{schema_version:2,room:{width:5000,depth:4000,height:3000,setup_complete:true,features:[]},items:[dryer,tall,shallow,upper],selected_item_id:'dryer',view_mode:'3d'},selectedId:'dryer'},null);p.roomSetup.projectChanged();p.history.reset();p.scene.fit('kitchen');}''')
 assert page.evaluate('MF_PLANNER.adapter.selected.bazis_sha256===MF_PULLOUT_DRYERS.variants.find(v=>v.previous_sources).source_sha256')
 page.locator('#studio-toggle-inspector').click()
 expect(page.locator('#pullout-dryer-note')).not_to_contain_text('вынесена')
 expect(page.locator('#pullout-dryer-controls')).to_be_visible();expect(page.locator('#drawer-options-controls')).to_be_hidden()
 assert page.locator('#pullout-dryer-controls [data-dryer-option="width"] option').all_text_contents()==['600 мм','700 мм','800 мм']
 page.locator('[data-dryer-option="dryer_brand"]').select_option('flat_line');page.locator('[data-dryer-option="width"]').select_option('900')
 expect(page.locator('[data-dryer-option="dryer_brand"] option[value="norwing"]')).to_have_attribute('disabled','')
 page.locator('[data-dryer-option="system"]').select_option('aq');page.locator('[data-dryer-option="execution"]').select_option('gola')
 expect(page.locator('#pullout-dryer-note')).to_contain_text('95551')
 assert page.evaluate('MF_PLANNER.adapter.selected.width')==900
 assert page.evaluate('MF_PLANNER.adapter.selected.z')==21.5
 expect(page.locator('#kitchen-summary')).to_contain_text('от фасада до края столешницы 0,5 мм')
 # Keep the worktop rear edge fixed through actual depth and execution controls.
 for depth,z in [(560,-3.5),(510,21.5)]:
  page.locator('#depth').fill(str(depth));page.locator('#depth').press('Tab')
  assert page.evaluate('MF_PLANNER.adapter.selected.z')==z
 for depth,z in [(650,71.5),(600,21.5)]:
  page.locator('#countertop-depth').fill(str(depth));page.locator('#countertop-depth').press('Tab')
  assert page.evaluate('MF_PLANNER.adapter.selected.z')==z
 page.locator('[data-dryer-option="execution"]').select_option('standard')
 assert page.evaluate('MF_PLANNER.adapter.selected.z')==0
 page.locator('[data-dryer-option="execution"]').select_option('gola')
 assert page.evaluate('MF_PLANNER.adapter.selected.z')==21.5
 page.screenshot(path='/tmp/dryer-ui.png')
 page.evaluate("MF_PLANNER.adapter.select('tall');MF_PLANNER.bridge.refresh()")
 expect(page.locator('#depth')).to_be_enabled();expect(page.locator('#depth')).to_have_attribute('min','500')
 page.locator('#depth').fill('500');page.locator('#depth').press('Tab')
 assert page.evaluate('MF_PLANNER.adapter.selected.depth')==500
 page.locator('#tall-align-top').click()
 assert page.evaluate('MF_PLANNER.adapter.selected.height')==2500
 # Undo alignment is available through the actual interaction history.
 page.locator('#planner-undo').click();assert page.evaluate('MF_PLANNER.adapter.selected.height')==2000
 page.screenshot(path='/tmp/tall-ui.png')
 page.evaluate("MF_PLANNER.adapter.select('shallow');MF_PLANNER.bridge.refresh()")
 expect(page.locator('#depth')).to_have_attribute('min','300')
 page.locator('#depth').fill('300');page.locator('#depth').press('Tab')
 assert page.evaluate('MF_PLANNER.adapter.selected.depth')==300
 # Editing an existing legacy upper fixes its bottom and grows upward.
 page.evaluate("MF_PLANNER.adapter.select('upper');MF_PLANNER.bridge.refresh()")
 assert page.evaluate('MF_FURNITURE_CORE.elevation(MF_PLANNER.adapter.selected,MF_PLANNER.adapter.room)')==1780
 page.locator('#height').fill('900');page.locator('#height').press('Tab')
 assert page.evaluate('MF_PLANNER.adapter.selected.elevation_mm')==1780
 assert page.evaluate('MF_PLANNER.adapter.selected.height')==900
 page.locator('#planner-undo').click();assert page.evaluate('MF_PLANNER.adapter.selected.height')==720
 page.locator('#planner-redo').click();assert page.evaluate('MF_PLANNER.adapter.selected.height')==900
 for height in [600,900]:
  page.locator('#height').fill(str(height));page.locator('#height').press('Tab')
  assert page.evaluate('MF_PLANNER.adapter.selected.elevation_mm')==1780
 # Above-ceiling growth must be rejected, never lowered to fit.
 page.locator('#height').fill('1300');page.locator('#height').press('Tab')
 assert page.evaluate('MF_PLANNER.adapter.selected.height')==900
 assert page.evaluate('MF_PLANNER.adapter.selected.elevation_mm')==1780
 with page.expect_response(lambda r:'/api/v2/3d-projects' in r.url and r.request.method in ('POST','PATCH')) as saved:
  page.locator('#save-project').click()
 stored=saved.value.json()
 dryer=next(it for it in stored['scene']['items'] if it['item_id']=='dryer')
 assert (dryer['z'],dryer['rearServiceGapMm'])==(21.5,71.5)
 assert next(it for it in stored['scene']['items'] if it['item_id']=='shallow')['depth']==300
 assert next(it for it in stored['scene']['items'] if it['item_id']=='tall')['depth']==500
 upper=next(it for it in stored['scene']['items'] if it['item_id']=='upper')
 assert (upper['height'],upper['elevation_mm'])==(900,1780)
 page.evaluate('''async stored=>{await MF_PLANNER.bridge.loadSnapshot({...stored,selectedId:'shallow'},stored);MF_PLANNER.adapter.select('shallow');MF_PLANNER.bridge.refresh()}''',stored)
 expect(page.locator('#depth')).to_have_value('300')
 assert page.evaluate("MF_PLANNER.adapter.items.find(it=>it.item_id==='dryer').z")==21.5
 assert page.evaluate("(()=>{const it=MF_PLANNER.adapter.selected,c=MF_FURNITURE_CORE;return c.productionParts(it,{production:c.PRODUCTION_MODELS[it.bazis_id]}).filter(p=>p.role==='body'||p.role==='shelf').every(p=>p.size.z===300)})()")
 assert page.evaluate("MF_PLANNER.adapter.items.find(it=>it.item_id==='upper').elevation_mm")==1780
 assert abs(page.evaluate("MF_PLANNER.scene.entries.get('upper').group.position.y")-1.780)<1e-6
 with page.expect_download() as downloaded:
  page.evaluate("document.getElementById('export-bazis').click()")
 native=json.loads(Path(downloaded.value.path()).read_text())
 exported_dryer=next(it for it in native['items'] if it['bazis_id']==dryer['bazis_id'])
 assert exported_dryer['position']['z']==21.5
 assert '0,5 мм' in exported_dryer['production_note']
 assert next(it for it in native['items'] if it['name']==next(it['name'] for it in stored['scene']['items'] if it['item_id']=='tall'))['target']['depth']==500
 exported_upper=next(it for it in native['items'] if it['bazis_id']==upper['bazis_id'])
 assert (exported_upper['target']['height'],exported_upper['position']['y'])==(900,1780)
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors and not blocked,dict(errors=errors,blocked=blocked)
 print(json.dumps({'ok':True,'dryer_width':900,'kit':'95551','tall_depth':500,'shallow_tall_depth':300,'upper_bottom':1780,'upper_top':2680,'ceiling_guard':True,'saved_and_reopened':True,'native_export':True,'aligned_height':2500,'undo':True,'errors':errors}))
 browser.close()
