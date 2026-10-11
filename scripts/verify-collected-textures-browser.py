"""Read-only browser acceptance with synthetic API responses and real image assets."""
import json, os, sys, threading, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from fastapi import FastAPI
from backend.v2.cabinet_ui import router
from backend.v2.material_visuals import user_textures
from backend.v2.catalogue_model import safe_item
import uvicorn

base='http://127.0.0.1:8081'
app=FastAPI();app.include_router(router())
threading.Thread(target=lambda:uvicorn.run(app,host='127.0.0.1',port=8081,log_level='error'),daemon=True).start()
for _ in range(40):
    try:urllib.request.urlopen(base+'/constructor');break
    except OSError:time.sleep(.1)
records=user_textures()['variants']
materials=[safe_item({'kind':'material','variant_id':uid,**{k:r[k] for k in ('article','material_id','name','thickness','length','width')}},'synthetic') for uid,r in records.items() if r['article'] in ('LNEDS18D.302.W04','816 PO','LNEDS18M.100.S02','1982 TopX')]
if len(materials)<2:
    uid,r=next((uid,r) for uid,r in records.items() if r['texture_url']!=materials[0]['visual']['texture_url'])
    materials.append(safe_item({'kind':'material','variant_id':uid,**{k:r[k] for k in ('article','material_id','name','thickness','length','width')}},'synthetic'))
errors=[];blocked=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('MF_TEST_BROWSER'),args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1600,'height':1000})
    def gate(route):
        req=route.request
        if '/api/v2/' in req.url:
            if req.method!='GET':blocked.append(req.method+' '+req.url);route.abort();return
            path=req.url.split('/api/v2/',1)[1].split('?',1)[0]
            data={'user_id':'texture-qa'} if path=='auth/me' else {'items':materials} if path=='catalogue/materials' else {'items':[]} if path=='3d-projects' else {'active_release':None} if path=='catalogue/releases' else {}
            route.fulfill(status=200,content_type='application/json',body=json.dumps(data));return
        if req.method=='GET' and req.url.startswith(base+'/'):route.continue_();return
        blocked.append(req.method+' '+req.url);route.abort()
    context.route('**/*',gate)
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base+'/constructor',wait_until='domcontentloaded')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=30000)
    expect(page.locator('body')).to_have_attribute('data-planner-renderer','webgl')
    result=page.evaluate('''async materials=>{
      const {MeshFactory}=await import('/account/planner/module-mesh.mjs');
      const {RoomPricingUI}=await import('/account/planner/room-pricing-ui.mjs');
      const c=MF_FURNITURE_CORE,p=MF_PLANNER;
      const it=p.adapter.createDraft({bazis:c.VITRINE_VARIANTS[0].id});
      it.body_variant_id=materials[0].variant_id;
      const adapter={room:p.adapter.room,items:[it],template:x=>p.adapter.template(x),material:id=>materials.find(m=>m.variant_id===id)};
      const f=new MeshFactory(adapter,()=>{}),g=f.build(it),all=[];g.traverse(m=>{if(m.isMesh&&m.userData.part)all.push(m)});
      const optical=all.filter(m=>m.userData.part.optical_material),saved=optical.map(m=>m.material.uuid);
      if(!optical.length)throw Error('No optical parts');
      const images=[];
      for(const mat of materials){
        it.body_variant_id=mat.variant_id;f.updateAppearance(g,it);
        const body=all.filter(m=>m.userData.part.role==='body'&&!m.userData.part.optical_material);
        if(!body.length||!body.every(m=>m.material.userData.variantId===mat.variant_id))throw Error('Body material not assigned');
        if(mat.visual.visual_status==='USER_PREVIEW'){
          if(body.some(m=>m.material.map))throw Error('Sample photo tiled onto surface');
          if(body[0].material.color.getHexString()!==mat.visual.render_color.slice(1))throw Error('Wrong sample color');
          const sample=new Image();sample.src=mat.visual.preview_url;await sample.decode();
          if(!sample.naturalWidth)throw Error('Sample preview not decoded');
          images.push({article:mat.article,sampleOnly:true,width:sample.naturalWidth,height:sample.naturalHeight});
          if(!optical.every((m,i)=>m.material.uuid===saved[i]))throw Error('Glass/profile replaced by sample');
          continue;
        }
        if(!body.every(m=>m.material.map))throw Error('Body texture not assigned');
        for(let i=0;i<250&&!body[0].material.map?.image;i++)await new Promise(resolve=>setTimeout(resolve,20));
        const image=body[0].material.map?.image;
        if(!image)throw Error('Texture load failed');
        if(!image.complete)await new Promise((resolve,reject)=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',reject,{once:true})});
        await image.decode();if(!image.naturalWidth)throw Error('Image not decoded');
        images.push({article:mat.article,width:image.naturalWidth,height:image.naturalHeight});
        if(!optical.every((m,i)=>m.material.uuid===saved[i]))throw Error('Glass/profile replaced');
      }
      const notice=document.createElement('div');
      RoomPricingUI.prototype.syncVisualNotice.call({app:{adapter,scene:{root:g}},visualNotice:notice});
      if(notice.hidden||!notice.textContent.includes('приблизительный'))throw Error('Missing scale notice');
      f.dispose();return {images,opticalParts:optical.length,notice:notice.textContent};
    }''',materials)
    assert not errors and not blocked,{'errors':errors,'blocked':blocked}
    print(json.dumps({'ok':True,'renderer':'webgl',**result,'errors':errors,'blocked':blocked},ensure_ascii=False))
    browser.close()
