"""Z1 render acceptance: intercepted local assets and synthetic API reads only.

No preview server, saved projects, orders or production API writes. --baseline
renders the pre-change mesh from the supplied Git ref for visual comparison.
"""
import argparse, json, os, subprocess, sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright, expect
from backend.v2.cabinet_ui import router
from backend.v2.material_visuals import user_textures
from backend.v2.catalogue_model import safe_item

parser=argparse.ArgumentParser()
parser.add_argument('--out',type=Path,required=True)
parser.add_argument('--baseline')
args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True)
app=FastAPI();app.include_router(router());client=TestClient(app)
base='https://vitrine.test'
materials=[{'variant_id':'qa-white','name':'Белый · тестовый образец','visual':{'render_color':'#edece6','roughness':.85}},
           {'variant_id':'qa-dark','name':'Графит · тестовый образец','visual':{'render_color':'#393d3b','roughness':.8}}]
uid,r=next((uid,r) for uid,r in user_textures()['variants'].items() if r['article']=='K009 PW(18)')
materials.append(safe_item({'kind':'material','variant_id':uid,**{k:r[k] for k in ('article','material_id','name','thickness','length','width')}},'synthetic'))
baseline=subprocess.check_output(['git','show',args.baseline+':backend/v2/cabinet_assets/planner/module-mesh.mjs'],cwd=ROOT) if args.baseline else None
report={'baseline':args.baseline,'errors':[],'blocked':[],'cases':[]}
SEED='''async opt=>{
  const p=MF_PLANNER,v=MF_FURNITURE_CORE.VITRINE_VARIANTS.find(v=>v.light_system===opt.system&&v.lighting===opt.side&&v.opening===opt.opening);
  const it=p.adapter.createDraft({bazis:v.id});
  Object.assign(it,{item_id:'z1-review',x:0,z:0,rotation:opt.rotation||0,width:opt.width||600,height:opt.height||2200,
    body_height:(opt.height||2200)-100,depth:opt.depth||600,glass_shelf_count:3,body_variant_id:opt.material,doors_open:opt.open||false});
  p.bridge.restore({name:'Витрина Z1',scene:{schema_version:2,room:{width:4200,depth:3600,height:3000,setup_complete:true},items:[it],selected_item_id:it.item_id,view_mode:'3d'},selectedId:it.item_id});
  for(let i=0;i<100&&!p.adapter.material(opt.material)?.visual;i++)await new Promise(resolve=>setTimeout(resolve,20));
  if(!p.adapter.material(opt.material)?.visual)throw Error('Review material did not load');
  p.history.reset();p.setView('3d');const s=p.scene;
  s.controls.enableDamping=false;
  s.camera.position.set(opt.opening==='left'?1.6:-1.6,it.height/2000+.4,5.1);
  s.controls.target.set(0,it.height/2000,0);s.controls.update();s.selectedBox.visible=false;
  await Promise.all([...s.factory.textures.values()].map(async t=>{
    for(let i=0;i<100&&!t.image;i++)await new Promise(resolve=>setTimeout(resolve,20));
    if(!t.image)throw Error('Texture did not load');await t.image.decode();
  }));
  s.render();return {item:it,parts:MF_FURNITURE_CORE.productionParts(it,p.adapter.template(it)),hardware:MF_FURNITURE_CORE.productionHardware(it)};
}'''
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('MF_TEST_BROWSER'),args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=browser.new_context(viewport={'width':1500,'height':1000})
    def gate(route):
        req=route.request;path=urlsplit(req.url).path
        if not req.url.startswith(base+'/') or req.method!='GET':
            report['blocked'].append(req.method+' '+req.url);route.abort();return
        if path.startswith('/api/v2/'):
            data={'user_id':'vitrine-qa'} if path=='/api/v2/auth/me' else {'items':materials} if path=='/api/v2/catalogue/materials' else {'items':[]} if path=='/api/v2/3d-projects' else {'active_release':None} if path=='/api/v2/catalogue/releases' else {}
            if path.startswith('/api/v2/catalogue/materials/'):
                data=next(m for m in materials if m['variant_id']==path.rsplit('/',1)[1])
            route.fulfill(status=200,content_type='application/json',body=json.dumps(data));return
        if baseline and path=='/account/planner/module-mesh.mjs':
            route.fulfill(status=200,content_type='application/javascript',body=baseline);return
        if path=='/ui/favicon.svg':route.fulfill(status=200,content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg"/>');return
        response=client.get(path)
        if response.status_code!=200:report['errors'].append(str(response.status_code)+' '+path)
        route.fulfill(status=response.status_code,headers=dict(response.headers),body=response.content)
    ctx.route('**/*',gate)
    page=ctx.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
    try:
        page.goto(base+'/constructor',wait_until='domcontentloaded')
        expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=30000)
        expect(page.locator('body')).to_have_attribute('data-planner-renderer','webgl')
        page.locator('#room-setup-close').click()
        cases=[{'name':'white-both','system':'lira-17.5x6.5','side':'both','opening':'left','material':'qa-white'},
               {'name':'wood-left-open','system':'lira-17.5x6.5','side':'left','opening':'left','material':uid,'open':True},
               {'name':'dark-right','system':'aq-4x8','side':'right','opening':'right','material':'qa-dark','width':450,'height':2600,'depth':500}]
        for opt in cases:
            production=page.evaluate(SEED,opt);page.wait_for_timeout(400)
            page.screenshot(path=str(args.out/(opt['name']+'.png')))
            state=page.evaluate('''()=>{
              const p=MF_PLANNER,s=p.scene,it=p.adapter.items[0],g=s.entries.get(it.item_id).group;
              const glass=[],lit=[];g.traverse(m=>{if(!m.isMesh)return;
                if(m.userData.role==='glass')glass.push({physical:Boolean(m.material.isMeshPhysicalMaterial),map:Boolean(m.material.map),opacity:m.material.opacity,part:m.userData.part.key});
                if(m.material.userData.vitrineLight)lit.push(m.material.userData.vitrineLight);
              });
              return {glass,lit,calls:s.renderer.info.render.calls,triangles:s.renderer.info.render.triangles};
            }''')
            if not baseline:
                assert len(state['lit'])==8,state
                assert all(g['physical'] and not g['map'] for g in state['glass']),state
                sides={'left':[1,0],'right':[0,1],'both':[1,1]}[opt['side']]
                assert all(x['sides']==sides for x in state['lit'])
            report['cases'].append({'name':opt['name'],**state,'production':production})
        if not baseline:
            # Same meshes in inspection and hidden-facade modes; no new geometry.
            for mode in ('inspection','facadesHidden','normal'):
                page.evaluate('(m)=>MF_PLANNER.scene.setDisplayMode(m)',mode);page.wait_for_timeout(100)
            page.evaluate(SEED,cases[0]);page.wait_for_timeout(200)
            page.evaluate('''()=>{const s=MF_PLANNER.scene;s.root.traverse(m=>{const u=m.material?.userData?.vitrineUniforms;if(u)u.mfVitrineStrength.value=0;});s.render();}''')
            page.screenshot(path=str(args.out/'white-light-off.png'))
            from PIL import Image
            import numpy as np
            on=np.asarray(Image.open(args.out/'white-both.png')).astype(float)
            off=np.asarray(Image.open(args.out/'white-light-off.png')).astype(float)
            delta=on[:,:,:3]-off[:,:,:3]
            report['light_pixels']=int(np.count_nonzero(np.max(np.abs(delta),axis=2)>3))
            report['outside_light_delta']=float(np.max(np.abs(delta[200:800,100:350])))
            assert report['light_pixels']>500,report['light_pixels']
            assert report['outside_light_delta']==0,report['outside_light_delta']
        assert not report['errors'],report['errors']
        assert not report['blocked'],report['blocked']
        report['ok']=True
    finally:
        (args.out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        browser.close()
print(json.dumps({'ok':report['ok'],'cases':len(report['cases']),'errors':report['errors'],'blocked':report['blocked']}))
