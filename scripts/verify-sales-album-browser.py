"""Synthetic sales workflow: intercept every API call; never write accounts/orders."""
import argparse,base64,json,os,sys,threading,time,urllib.request
from pathlib import Path
from io import BytesIO
from fastapi import FastAPI
from playwright.sync_api import sync_playwright,expect
from pypdf import PdfReader
import uvicorn
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from backend.v2.cabinet_ui import router
from backend.v2.sales_album import render,image_bytes
parser=argparse.ArgumentParser();parser.add_argument('--base',default='http://127.0.0.1:8084');parser.add_argument('--hero',required=True);parser.add_argument('--out',default='/tmp/sales-browser');args=parser.parse_args()
OUT=Path(args.out);OUT.mkdir(parents=True,exist_ok=True)
if args.base.startswith('http://127.0.0.1'):
 app=FastAPI();app.include_router(router())
 threading.Thread(target=lambda:uvicorn.run(app,host='127.0.0.1',port=8084,log_level='error'),daemon=True).start()
 for _ in range(40):
  try:urllib.request.urlopen(args.base+'/constructor');break
  except OSError:time.sleep(.1)
mat={'71118e45-0ce3-534b-ad68-db1238304f18':dict(manufacturer='BYSPAN',article='605 PO',name='Белый',thickness=18),'389a2abc-c6e2-5214-a41b-60054320d0ff':dict(manufacturer='BYSPAN',article='890 PO',name='Персидский жемчуг',thickness=18)}
saved={};exports=[];errors=[];blocked=[];writes=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('MF_TEST_BROWSER'),args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(viewport={'width':1700,'height':1100})
 def gate(route):
  req=route.request
  if '/api/v2/' not in req.url:
   if req.method=='GET' and req.url.startswith(args.base+'/'):route.continue_();return
   blocked.append(req.url);route.abort();return
  path=req.url.split('/api/v2/',1)[1].split('?',1)[0];body=json.loads(req.post_data or '{}');data={}
  if req.method!='GET':writes.append((req.method,path))
  if path=='auth/me':data={'user_id':'synthetic-sales'}
  elif path=='3d-sales-capabilities':data={'automatic_render':False,'max_pages':5}
  elif path=='catalogue/materials':data={'items':[]}
  elif path=='catalogue/releases':data={'active_release':None}
  elif path.startswith('catalogue/materials/'):
   ident=path.split('/')[-1];data={**mat.get(ident,{}),'variant_id':ident}
  elif path=='3d-projects' and req.method=='GET':data={'items':[saved] if saved else []}
  elif path in ('3d-projects','3d-projects/synthetic-project') and req.method in ('POST','PATCH'):
   saved.update({**body,'project_id':'synthetic-project','version':saved.get('version',0)+1,'updated_at':'2026-10-24T12:00:00Z'});data=saved
  elif path=='3d-projects/synthetic-project/sales-album.pdf':
   assert body['version']==saved['version'];exports.append(body)
   materials={k:' · '.join([v['manufacturer'],v['article'],v['name'],'18 мм']) for k,v in mat.items()}
   previews={k:image_bytes(v) for k,v in body['module_preview_data_urls'].items()}
   data=render(saved['name'],saved['scene'],materials,image_bytes(body['hero_data_url']),image_bytes(body.get('detail_data_url')),previews,body['photo'],body['version'])
   route.fulfill(status=200,content_type='application/pdf',body=data);return
  elif path=='3d-projects/synthetic-project' and req.method=='GET':data=saved
  else:blocked.append(req.method+' '+path);route.abort();return
  route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
 ctx.route('**/*',gate);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(args.base+'/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=40000)
 page.evaluate('''()=>{const p=MF_PLANNER,c=MF_FURNITURE_CORE;
 const ids=['bazis.5731630ddd87','bazis.39f282e08f0c','bazis.9e77f4333545','bazis.784bf9af84f8','bazis.877ba2f68d92','bazis.877ba2f68d92','bazis.2175c60e84a6'];
 const items=ids.map((id,i)=>{const it=p.adapter.createDraft({bazis:id}),up=i>=4;return {...it,item_id:'M'+(i+1),width:600,height:up?720:820,depth:up?317:510,x:(up?[0,1,3][i-4]:i)*600-900,z:up?-143.5:0,elevation_mm:up?1458:0};});
 p.bridge.restore({name:'Кухня 2400 · демонстрационный проект',scene:{schema_version:2,room:{width:3600,depth:3000,height:2700,setup_complete:true,features:[]},items,selected_item_id:'M1',view_mode:'3d'},selectedId:'M1'});p.roomSetup.projectChanged();p.history.reset();p.scene.fit('kitchen');}''')
 page.locator('.studio-menu > summary').click();page.locator('#download-spec').click()
 dialog=page.locator('#sales-album-dialog');expect(dialog).to_be_visible();expect(dialog.locator('[data-message]')).to_contain_text('Автоматический фоторендер пока не подключён',timeout=30000)
 expect(dialog.locator('[data-generate]')).to_be_disabled();expect(dialog.locator('[data-download]')).to_be_disabled()
 dialog.locator('[data-hero]').set_input_files(args.hero);expect(dialog.locator('[data-message]')).to_contain_text('Проверьте шкафчики',timeout=10000)
 expect(dialog.locator('[data-download]')).to_be_disabled();dialog.locator('[data-reviewed]').check()
 page.screenshot(path=str(OUT/'desktop.png'))
 with page.expect_download() as dl:dialog.locator('[data-download]').click()
 dl.value.save_as(OUT/'MartinForest_Sales_Album.pdf')
 expect(dialog.locator('[data-message]')).to_contain_text('Альбом готов')
 assert len(exports)==1 and len(exports[0]['module_preview_data_urls'])==7
 pdf=PdfReader(OUT/'MartinForest_Sales_Album.pdf');assert len(pdf.pages)==5
 assert len(pdf.pages[2].images)==7
 # The modal remains usable and entirely on screen on a phone.
 page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'mobile.png'))
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 # Changes made elsewhere must invalidate this snapshot before an export request.
 page.evaluate('MF_PLANNER.adapter.items[0].width=601');dialog.locator('[data-download]').click()
 expect(dialog.locator('[data-message]')).to_contain_text('Проект изменился');assert len(exports)==1
 assert not errors and not blocked,dict(errors=errors,blocked=blocked)
 assert all('orders' not in p for _,p in writes)
 (OUT/'payload.json').write_text(json.dumps({'saved':saved,'export':exports[0]},ensure_ascii=False))
 print(json.dumps({'ok':True,'pages':5,'module_images':7,'exports':len(exports),'writes':writes,'errors':errors},ensure_ascii=False))
 browser.close()
