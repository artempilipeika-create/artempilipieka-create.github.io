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
  if path=='auth/me':data={'user_id':'synthetic-cargo'}
  elif path=='3d-sales-capabilities':data={'automatic_render':False,'max_pages':5}
  elif path=='3d-projects' and req.method=='POST':data={**json.loads(req.post_data),'project_id':'synthetic-cargo','version':1}
  elif path=='3d-projects/synthetic-cargo' and req.method=='PATCH':data={**json.loads(req.post_data),'project_id':'synthetic-cargo','version':2}
  elif path=='catalogue/materials' or path=='3d-projects':data={'items':[]}
  elif path=='3d-projects/undefined' and req.method=='PATCH':data={**json.loads(req.post_data),'project_id':'synthetic-cargo','version':1}
  elif path=='catalogue/releases':data={'active_release':None}
  elif path.startswith('catalogue/materials/'):data={'variant_id':path.split('/')[-1],'name':'Проверочный материал','thickness':18}
  else:blocked.append(req.method+' '+path);route.abort();return
  route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
 page.route('**/*',gate);page.goto(base+'/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=40000)

 assert page.locator('#module-catalogue button').filter(has_text='Карго').count()==1
 page.evaluate("""async()=>{const p=MF_PLANNER;
 const it={...p.adapter.createDraft({bazis:MF_CARGO.family.default_id}),item_id:'cargo',x:0,z:0};
 if(it.width!==200)throw new Error('Cargo default width');
 const room={width:5000,depth:4000,height:3000,setup_complete:true,features:[]};
 await p.bridge.loadSnapshot({name:'Проверка карго',scene:{schema_version:2,room,items:[it],plinths:[],selected_item_id:'cargo',view_mode:'3d'},selectedId:'cargo'},null);
 p.roomSetup.projectChanged();p.history.reset();p.scene.fit('kitchen');}""")
 if not page.locator('#cargo-controls').is_visible():page.locator('#studio-toggle-inspector').click()
 expect(page.locator('#cargo-controls')).to_be_visible()
 assert page.locator('#cargo-controls [data-cargo-option=brand]').input_value()=='focus'
 initial=page.evaluate('MF_PLANNER.adapter.selected')
 for brand in ['focus','icon','norwing']:
  page.locator('[data-cargo-option=brand]').select_option(brand)
  for execution in ['standard','gola']:
   page.locator('[data-cargo-option=execution]').select_option(execution)
   widths=[200,300,400] if brand=='norwing' else [150,200,300,400]
   for width in widths:
    page.locator('[data-cargo-option=width]').select_option(str(width))
    result=page.evaluate("""()=>{const p=MF_PLANNER,it=p.adapter.selected,c=MF_CARGO,k=c.kit(it),v=c.info(it),hw=MF_FURNITURE_CORE.productionHardware(it).items;return {brand:v.brand,execution:v.execution,width:it.width,kit:k.article,qty:hw.find(h=>h.key==='cargo-kit').quantity,error:p.adapter.validate(it),base:p.bridge.catalogue.bazisModules.find(t=>t.id===it.bazis_id).production.native_defaults.width,handles:it.handles}}""")
    assert result['brand']==brand and result['execution']==execution and result['width']==width and result['qty']==1 and result['base']==150 and not result['error'],result
   page.locator('[data-cargo-option=width]').select_option('200')
 # Invalid arbitrary width must not mutate the selected kit.
 page.locator('#width').fill('250');page.locator('#width').press('Tab')
 assert page.evaluate('MF_PLANNER.adapter.selected.width')==200
 assert page.locator('[data-cargo-option=width] option[value="150"]').evaluate('(o)=>o.disabled')
 page.locator('[data-cargo-option=brand]').select_option('icon')
 page.locator('[data-cargo-option=width]').select_option('300')
 before_undo=page.evaluate('MF_PLANNER.adapter.selected.bazis_id')
 page.locator('[data-cargo-option=brand]').select_option('focus')
 page.locator('#planner-undo').click()
 assert page.evaluate('MF_PLANNER.adapter.selected.bazis_id')==before_undo
 # Height and depth preserve profile section and the basket does not stretch.
 page.locator('#height').fill('900');page.locator('#height').press('Tab')
 page.locator('#depth').fill('600');page.locator('#depth').press('Tab')
 assert page.evaluate('MF_PLANNER.adapter.selected.depth')==600
 page.locator('#save-project').click();page.wait_for_function('!MF_PROJECT_SAFETY.engine.dirty && !MF_PROJECT_SAFETY.engine.busy')
 assert saved_responses;stored=saved_responses[-1].json()
 page.evaluate("""async stored=>{await MF_PLANNER.bridge.loadSnapshot({...stored,selectedId:'cargo'},stored);MF_PLANNER.bridge.refresh()}""",stored)
 assert page.locator('[data-cargo-option=brand]').input_value()=='icon'
 assert page.locator('[data-cargo-option=width]').input_value()=='300'
 assert page.locator('[data-cargo-option=execution]').input_value()=='gola'
 with page.expect_download() as download:page.evaluate("document.getElementById('export-bazis').click()")
 native=json.loads(Path(download.value.path()).read_text());cargo=next(i for i in native['items'] if i.get('construction',{}).get('cargo'))
 assert cargo['source_default']['width']==150 and cargo['target']['width']==300
 assert cargo['construction']['cargo']['kit']['article']=='112521'
 assert cargo['construction']['gola_variant']['profiles'][0]['article']=='60965'
 assert 'задняя царга сохраняет 80 мм' in cargo['construction']['native_adjustment']['note']
 assert len(cargo['construction']['parts'])==7
 if not page.locator('#height').is_visible():page.locator('#studio-toggle-inspector').click()
 page.locator('#height').fill('820');page.locator('#height').press('Tab')
 page.locator('#depth').fill('510');page.locator('#depth').press('Tab')
 page.evaluate("MF_PLANNER.scene.fit('kitchen')")
 page.locator('#cargo-controls').scroll_into_view_if_needed()
 page.screenshot(path='/tmp/cargo-ui.png')
 Path('/tmp/cargo-saved.json').write_text(json.dumps(stored['scene']));Path('/tmp/cargo-native.json').write_text(json.dumps(native))
 assert not errors and not blocked,dict(errors=errors,blocked=blocked)
 print(json.dumps({'ok':True,'one_card':True,'six_variants':True,'width_kit_match':True,'invalid_width_rejected':True,'norwing150_blocked':True,'undo':True,'save_reopen':True,'native_export':True,'errors':errors}),flush=True)
 browser.close()
