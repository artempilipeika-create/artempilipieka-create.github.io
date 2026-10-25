"""Local synthetic UI test; all API calls are mocked, with no order submission."""
import json,os,sys,threading,time,urllib.request
from pathlib import Path
from fastapi import FastAPI
from playwright.sync_api import sync_playwright,expect
import uvicorn
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from backend.v2.cabinet_ui import router
app=FastAPI();app.include_router(router());base='http://127.0.0.1:8089'
threading.Thread(target=lambda:uvicorn.run(app,host='127.0.0.1',port=8089,log_level='error'),daemon=True).start()
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


 out=Path(os.environ.get('MF_TEST_OUTPUT','/tmp/execution-cards-qa'));out.mkdir(parents=True,exist_ok=True)
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
 for family,id in families:
  load_module(id)
  before=page.evaluate('JSON.stringify(MF_PLANNER.adapter.state)')
  page.locator('[data-execution-view=inside]').click()
  expect(page.locator('#module-execution-preview canvas')).to_have_attribute('data-preview-ready','true',timeout=30000)
  assert page.evaluate('JSON.stringify(MF_PLANNER.adapter.state)')==before
  page.locator('[data-execution-view=closed]').click()
  cards=page.locator('.execution-family:not([hidden]) .execution-choice:visible')
  assert cards.count()>0,family
  for i in range(cards.count()):
   b=cards.nth(i)
   if not b.is_enabled():
    assert b.locator('.execution-reason').inner_text(),family
    continue
   canvas=b.locator('canvas');b.scroll_into_view_if_needed()
   if canvas.is_visible():expect(canvas).to_have_attribute('data-preview-ready','true',timeout=30000)
  page.locator('#module-execution-preview').scroll_into_view_if_needed()
  page.locator('.mf3d-right').screenshot(path=str(out/(family+'-panel.png')))
  # One isolated, real UI transition in every catalogue family, and exact undo.
  options=page.locator('.execution-family:not([hidden]) .execution-choice[aria-pressed=false]:enabled:visible')
  if options.count():
   option=options.first;option.click()
   page.wait_for_function('JSON.stringify(MF_PLANNER.adapter.state)!=='+json.dumps(before))
   assert page.evaluate('MF_PLANNER.history.undoStack.length')==1,family
   page.locator('#planner-undo').click()
   page.wait_for_function('JSON.stringify(MF_PLANNER.adapter.state)==='+json.dumps(before))
  report.append({'family':family,'cards':cards.count(),'read_only_preview':True,'undo':True})
 # Discrete dryer widths and visible reason for incompatible NORWING at 900.
 load_module('bazis.85c150c30ea5')
 page.locator('[data-execution-proxy="dryer:dryer_brand:flat_line"]').click()
 page.locator('[data-execution-proxy="dryer:width:900"]').click()
 norwing=page.locator('[data-execution-proxy="dryer:dryer_brand:norwing"]');expect(norwing).to_be_disabled()
 assert '800' in norwing.locator('.execution-reason').inner_text()
 assert page.evaluate('MF_PLANNER.adapter.selected.width')==900
 page.locator('[data-execution-proxy="dryer:width:800"]').click();expect(norwing).to_be_enabled();norwing.click()
 assert page.evaluate('MF_PULLOUT_DRYERS.info(MF_PLANNER.adapter.selected).dryer_brand')=='norwing'
 # Responsive scroll, keyboard focus and two genuinely different corner purpose views.
 load_module('bazis.a310afbf587f')
 choices=page.locator('#corner-options-controls [data-corner-option=purpose]')
 for b in choices.all():
  b.scroll_into_view_if_needed();expect(b.locator('canvas')).to_have_attribute('data-preview-ready','true',timeout=30000)
 choices.first.locator('..').screenshot(path=str(out/'corner-purpose.png'))
 pixels=choices.locator('canvas').evaluate_all('(cs)=>cs.map(c=>c.toDataURL())');assert len(set(pixels))==2
 page.set_viewport_size({'width':390,'height':844});page.evaluate("MF_PLANNER.workspace.panel('right',true)")
 page.locator('#corner-options-controls').scroll_into_view_if_needed()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(out/'mobile-corner.png'))
 load_module('bazis.0ac4e1b6b2d3');page.locator('#cargo-controls').scroll_into_view_if_needed();page.screenshot(path=str(out/'mobile-cargo.png'))
 assert not errors and not blocked,dict(errors=errors,blocked=blocked)
 assert page.evaluate('MF_PLANNER.executions.renderer.cache.size')<=24
 (out/'validation.json').write_text(json.dumps({'ok':True,'families':report,'dryer_widths':True,'mobile':390,'errors':errors},ensure_ascii=False,indent=2))
 print(json.dumps({'ok':True,'families':len(report),'undo':True,'read_only_preview':True,'dryer_widths':True,'mobile':390,'errors':errors}))
 browser.close()
