"""Post-deploy staging frontend smoke.
All HTML/CSS/JS are fetched from the real staging /constructor. Auth and project
READ responses are synthetic for the interactive test; no live credentials,
project writes, orders, messages or database mutations are used. Backend
save/reopen coverage belongs to the separate real-ASGI/disposable-Postgres suite.
"""
from __future__ import annotations
import argparse,hashlib,json,sys
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright,expect

BASE='https://martin-forest-v2-staging-production.up.railway.app'
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from tests.webgl.navigation import panel,close_panels
OUT=ROOT/'qa-output/webgl-live'
CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--commit',required=True);args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    report={'expected_commit':args.commit,'base':BASE,'route':'/constructor','live_writes':0,
            'api_mode':'synthetic auth/project reads, actual deployed HTML/CSS/JS; no live backend save claim',
            'checks':[],'assets':[],'screenshots':[]}
    def check(label,condition):
        assert condition,label
        report['checks'].append(label);print('PASS:',label,flush=True)
    opener=build_opener(NoRedirect)
    def get(path):
        req=Request(BASE+path,headers={'Cache-Control':'no-cache','User-Agent':'MF-WebGL-staging-readonly-acceptance'},method='GET')
        with opener.open(req,timeout=30) as r:return r.status,r.headers,r.read(5000000)
    try:
        status,headers,body=get('/health');check('Live /health HTTP 200',status==200)
        report['health']={'status':status,'body':body.decode()[:3000]}
        try:
            status,_,_=get('/api/v2/auth/me')
        except HTTPError as e:status=e.code
        check('Unauthenticated live API remains protected',status in (401,403))
        files={'/constructor':'constructor-next.html','/account/app.css':'app.css','/account/3d.css':'3d.css',
               '/account/3d-studio.css':'3d-studio.css','/account/3d.js':'3d.js','/account/3d-studio.js':'3d-studio.js'}
        planner=ROOT/'backend/v2/cabinet_assets/planner'
        for p in planner.glob('*'):
            if p.suffix in ('.mjs','.js','.css'):files['/account/planner/'+p.name]='planner/'+p.name
        for name in ['three.module.js','three.core.min.js','OrbitControls.js','manifest.json']:
            files['/account/planner/vendor/'+name]='planner/vendor/'+name
        for path,relative in files.items():
            status,headers,body=get(path)
            check('Published bytes '+path,status==200 and body==(ROOT/'backend/v2/cabinet_assets'/relative).read_bytes())
            check('Strict CSP '+path,headers.get('Content-Security-Policy')==CSP)
            report['assets'].append({'path':path,'status':status,'sha256':hashlib.sha256(body).hexdigest()})
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            context=browser.new_context(viewport={'width':1600,'height':1000},accept_downloads=True)
            errors=[];unexpected=[];loaded=[]
            def request(route):
                req=route.request
                if not req.url.startswith(BASE+'/'):
                    unexpected.append('external request');route.abort();return
                path=urlparse(req.url).path
                if req.method!='GET':
                    unexpected.append(req.method+' '+path);route.abort();return
                if path=='/api/v2/auth/me':
                    route.fulfill(status=200,content_type='application/json',body='{"user_id":"synthetic-browser-only"}');return
                if path=='/api/v2/3d-projects':
                    route.fulfill(status=200,content_type='application/json',body='{"items":[]}');return
                if path.startswith('/api/'):
                    unexpected.append('unexpected API '+path);route.abort();return
                route.continue_()
            context.route('**/*',request)
            page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
            page.on('response',lambda r:loaded.append({'path':urlparse(r.url).path,'status':r.status}) if '/account/planner/' in r.url else None)
            page.on('dialog',lambda d:d.accept())
            page.goto(BASE+'/constructor',wait_until='networkidle')
            expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=25000)
            expect(page.locator('body')).to_have_attribute('data-planner-renderer','webgl')
            check('Real published /constructor opens WebGL',page.url==BASE+'/constructor')
            check('One renderer and no old pointer loop',page.evaluate('JSON.stringify(MF_PLANNER.bridge.rendererState())')=='{"legacyLoopEnabled":false,"legacyPointerEnabled":false}')
            panel(page,'left','catalog')
            check('Only three production modules in catalogue',page.locator('#module-catalogue .mf3d-module strong').all_text_contents()==['Д1 L','Д1 P','Д2'])
            page.locator('[data-bazis="bazis.3079d0656398"]').click()
            check('Click-add on published UI',page.evaluate('MF_PLANNER.adapter.items.length')==1)
            panel(page,'right')
            page.locator('#pos-z').fill('0');page.locator('#pos-z').press('Tab')
            page.locator('#width').fill('650');page.locator('#width').press('Tab')
            check('Published resize',page.evaluate('MF_PLANNER.adapter.selected.width')==650)
            page.locator('#planner-undo').click();check('Published undo',page.evaluate('MF_PLANNER.adapter.selected.width')==600)
            page.locator('#planner-redo').click();check('Published redo',page.evaluate('MF_PLANNER.adapter.selected.width')==650)
            page.locator('#studio-rotate').click();check('Published rotate',page.evaluate('MF_PLANNER.adapter.selected.rotation')==90)
            page.locator('#duplicate-item').click();check('Published copy',page.evaluate('MF_PLANNER.adapter.items.length')==2)
            page.locator('#scene').focus();page.keyboard.press('Delete');check('Published Delete',page.evaluate('MF_PLANNER.adapter.items.length')==1)
            close_panels(page)
            page.locator('#mode-2d').click()
            hit=page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.selected;return p.scene.projectPoint({x:it.x,y:it.height,z:it.z});}''')
            check('Published Raycaster hit',page.evaluate('(h)=>MF_PLANNER.scene.pick(h.x,h.y).id===MF_PLANNER.adapter.selected.item_id',hit))
            before=page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')
            page.mouse.move(hit['x'],hit['y']);page.mouse.down();page.mouse.move(hit['x']+45,hit['y']+15,steps=5)
            check('Published ghost',page.evaluate('Boolean(MF_PLANNER.scene.preview)'))
            page.keyboard.press('Escape');page.mouse.up()
            check('Published Escape preserves state',page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')==before)
            # Pilot acceptance uses the actual published catalogue, controls and export.
            # Scene changes stay inside this synthetic browser; the live API remains GET-only.
            for donor,sides,name in [('bazis.0211e4f77fc4',['left'],'D1-L'),('bazis.784bf9af84f8',['right'],'D1-P'),('bazis.3079d0656398',['left','right'],'D2')]:
                page.evaluate('''()=>{const p=MF_PLANNER,s=p.bridge.snapshot();s.scene.items=[];s.scene.selected_item_id=null;s.selectedId=null;p.bridge.restore(s);p.history.reset();}''')
                panel(page,'left','catalog');page.locator(f'[data-bazis="{donor}"]').click()
                panel(page,'right');page.locator('#toggle-doors').click()
                data=page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.selected,g=p.scene.entries.get(it.item_id).group,out={item:it,fronts:[],sides:[],angles:[],back:[],shelf:[],reveal:0};g.traverse(o=>{const r=o.userData?.role;if(r==='front')out.fronts.push(o.geometry.userData.envelopeMM);if(r==='door-pivot'){out.sides.push(o.userData.hingeSide);out.angles.push(Math.round(o.rotation.y*180/Math.PI));}if(r==='back'||r==='shelf')out[r].push(o.geometry.userData.envelopeMM);if(r==='reveal')out.reveal++;});return out;}''')
                check(name+' real back, shelf and facades',data['back']==[[596,716,3]] and data['shelf']==[[564,18,509]] and data['fronts']==[[600/len(sides)-3,717,18]]*len(sides))
                check(name+' opens correct sides and exposes interior',data['sides']==sides and data['angles']==[-105 if s=='left' else 105 for s in sides] and data['reveal']==0)
                page.locator('#shelf-position').fill('400');page.locator('#shelf-position').press('Tab')
                check(name+' shelf control',page.evaluate('MF_PLANNER.adapter.selected.shelves[0].offset_mm')==400)
                close_panels(page)
                with page.expect_download() as download:page.locator('#export-bazis').click()
                payload=json.loads(Path(download.value.path()).read_text());native=payload['items'][0]
                check(name+' existing native export contract',payload['format']=='martin-forest-bazis-native-v2' and native['target']=={'width':600,'height':820,'depth':510} and native['construction']['shelves'][0]['offset_mm']==400)
                page.evaluate('MF_PLANNER.setView("3d");MF_PLANNER.scene.fit("selected");MF_PLANNER.scene.render()')
                page.wait_for_timeout(200);screenshot='published-pilot-'+name+'.png';page.screenshot(path=str(OUT/screenshot));report['screenshots'].append(screenshot)
            page.evaluate('''()=>{const p=MF_PLANNER,items=[];for(let i=0;i<6;i++){const a=p.adapter.createDraft({template:i%2?'base.two_door':'base.drawers_3'});Object.assign(a,{width:600,x:-2100+i*600,z:-1500,name:'Нижний '+(i+1)});items.push(a);const u=p.adapter.createDraft({template:'wall.two_door'});Object.assign(u,{width:600,x:-2100+i*600,z:-1600,name:'Верхний '+(i+1)});items.push(u);}const t=p.adapter.createDraft({template:'tall.one_door'});Object.assign(t,{x:1650,z:-1500,name:'Пенал'});items.push(t);p.bridge.restore({name:'Кухня · 13 модулей',scene:{schema_version:2,room:{width:6200,depth:3600,height:2700},items,selected_item_id:items[0].item_id,view_mode:'3d'},selectedId:items[0].item_id});p.history.reset();}''')
            page.locator('#mode-3d').click()
            for width,height,name in [(1600,1000,'desktop'),(1024,768,'tablet'),(390,844,'mobile')]:
                page.set_viewport_size({'width':width,'height':height});page.locator('#reset-view').click()
                page.evaluate('MF_PLANNER.scene.resize();MF_PLANNER.scene.fit("kitchen");MF_PLANNER.scene.render()')
                page.wait_for_timeout(300)
                check('Bounded viewport '+name,page.evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1'))
                screenshot='published-constructor-'+name+'.png';page.screenshot(path=str(OUT/screenshot),full_page=True)
                report['screenshots'].append(screenshot)
            page.locator('#planner-mobile-catalog').click();expect(page.locator('.mf3d-left')).to_be_visible()
            page.locator('#planner-mobile-inspector').click();expect(page.locator('.mf3d-right')).to_be_visible();expect(page.locator('.mf3d-left')).to_be_hidden()
            check('Published mobile panels',True)
            before=page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')
            page.evaluate('MF_PLANNER.scene.renderer.forceContextLoss()')
            expect(page.locator('body')).to_have_attribute('data-planner-renderer','fallback')
            check('Published context-loss preserves unsaved kitchen',page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')==before)
            check('No live writes or unexpected requests',not unexpected)
            check('No JS/shader console errors',not errors)
            check('Browser received local Three and entry modules',all(any(x['path']==path and x['status']==200 for x in loaded) for path in ['/account/planner/entry.mjs','/account/planner/vendor/three.module.js','/account/planner/scene.mjs']))
            report['browser_assets']=loaded;report['browser_errors']=errors
            context.close();browser.close()
        report['success']=True
    finally:
        (OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
