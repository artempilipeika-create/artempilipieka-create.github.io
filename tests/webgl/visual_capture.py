"""Furniture-only before/after evidence. Synthetic project reads; never live writes.
The optional --live mode fetches real deployed assets, as in live_smoke.py.
"""
from pathlib import Path
from urllib.parse import urlparse
import argparse,json,time
from playwright.sync_api import sync_playwright,expect
BASE='https://martin-forest-v2-staging-production.up.railway.app'
CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
SEED='''n=>{const p=MF_PLANNER,items=[];let room={width:6200,depth:3600,height:2700};
if(n===13){for(let i=0;i<6;i++){const a=p.adapter.createDraft({template:i%2?'base.two_door':'base.drawers_3'});Object.assign(a,{item_id:'visual-base-'+i,width:600,x:-2100+i*600,z:-1500,name:'Нижний '+(i+1)});items.push(a);const u=p.adapter.createDraft({template:'wall.two_door'});Object.assign(u,{item_id:'visual-wall-'+i,width:600,x:-2100+i*600,z:-1600,name:'Верхний '+(i+1)});items.push(u);}const t=p.adapter.createDraft({template:'tall.one_door'});Object.assign(t,{item_id:'visual-tall',x:1650,z:-1500,name:'Пенал'});items.push(t);}else{room={width:12000,depth:12000,height:2700};for(let i=0;i<n;i++){const a=p.adapter.createDraft({template:i%3===1?'base.two_door':'base.drawers_3'});Object.assign(a,{item_id:'perf-'+i,x:(i%10-4.5)*900,z:(Math.floor(i/10)-2)*900,name:'Модуль '+i});items.push(a);}}
p.bridge.restore({name:'Кухня · Martin Forest',scene:{schema_version:2,room,items,selected_item_id:items[0].item_id,view_mode:'3d'},selectedId:items[0].item_id});p.history.reset();p.setView('3d');return p.bridge.snapshot();}'''

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);parser.add_argument('--out',type=Path,required=True);parser.add_argument('--live',action='store_true');args=parser.parse_args()
    out=args.out;out.mkdir(parents=True,exist_ok=True);root=args.root/'backend/v2/cabinet_assets';base=BASE if args.live else 'https://testserver'
    report={'live_assets':args.live,'api':'synthetic auth/project reads; zero live writes','errors':[],'unexpected_requests':[],'performance':{}}
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        context=browser.new_context(viewport={'width':1600,'height':1000})
        def route_request(route):
            req=route.request;path=urlparse(req.url).path
            if not req.url.startswith(base+'/') or req.method!='GET':report['unexpected_requests'].append(req.method+' '+req.url);route.abort();return
            if path=='/api/v2/auth/me':body=b'{"user_id":"visual-synthetic"}';mime='application/json'
            elif path=='/api/v2/3d-projects':body=b'{"items":[]}';mime='application/json'
            elif path.startswith('/api/'):report['unexpected_requests'].append(path);route.abort();return
            elif args.live:route.continue_();return
            elif path in ['/constructor','/constructor-next']:body=(root/'constructor-next.html').read_bytes();mime='text/html'
            elif path.startswith('/account/'):
                f=root/path.removeprefix('/account/')
                if not f.is_file():route.fulfill(status=404,body='');return
                body=f.read_bytes();mime='text/css' if f.suffix=='.css' else 'application/javascript'
            elif path=='/ui/favicon.svg':body=b'<svg xmlns="http://www.w3.org/2000/svg"/>';mime='image/svg+xml'
            else:route.fulfill(status=404,body='');return
            route.fulfill(status=200,body=body,headers={'Content-Type':mime,'Content-Security-Policy':CSP})
        context.route('**/*',route_request);page=context.new_page()
        page.on('pageerror',lambda e:report['errors'].append(str(e)));page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
        try:
            page.goto(base+('/constructor' if args.live else '/constructor-next'))
            expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=25000)
            expect(page.locator('body')).to_have_attribute('data-planner-renderer','webgl')
            fixture=page.evaluate(SEED,13);(out/'project.json').write_text(json.dumps(fixture,ensure_ascii=False,indent=2))
            page.wait_for_timeout(1200)
            for mode in ['3d','front','top']:
                page.evaluate('(m)=>{MF_PLANNER.setView(m);MF_PLANNER.scene.render()}',mode);page.wait_for_timeout(200);page.screenshot(path=str(out/(mode+'.png')))
            page.evaluate('MF_PLANNER.setView("3d")');page.locator('#planner-client').click();page.wait_for_timeout(350);page.screenshot(path=str(out/'client.png'))
            page.locator('#planner-client').click();page.set_viewport_size({'width':1024,'height':768});page.wait_for_timeout(200);page.evaluate('MF_PLANNER.scene.fit("kitchen")');page.wait_for_timeout(200);page.screenshot(path=str(out/'tablet.png'))
            page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200);page.evaluate('MF_PLANNER.scene.fit("kitchen")');page.wait_for_timeout(200);page.screenshot(path=str(out/'mobile.png'))
            page.locator('#planner-client').click();page.wait_for_timeout(250);page.screenshot(path=str(out/'mobile-client.png'));page.locator('#planner-client').click()
            page.set_viewport_size({'width':1600,'height':1000});page.wait_for_timeout(150);page.evaluate('MF_PLANNER.scene.fit("selected")');page.wait_for_timeout(250);page.screenshot(path=str(out/'selected.png'))
            if page.locator('#planner-workspace').count() and not page.locator('.mf3d-left').is_visible():page.locator('#studio-toggle-library').click()
            page.locator('#tab-catalog').click();page.locator('[data-module-filter="base"]').click();page.wait_for_timeout(1500);page.locator('.mf3d-left').screenshot(path=str(out/'catalog.png'))
            for n in [30,50]:
                page.evaluate(SEED,n);page.wait_for_timeout(500)
                # Capture the normal application frame before the deliberately
                # synchronous camera/GPU benchmark. Restore a complete camera
                # transform and schedule a normal application frame afterwards.
                page.evaluate('''()=>new Promise(resolve=>requestAnimationFrame(()=>{MF_PLANNER.scene.render();requestAnimationFrame(resolve);}))''')
                page.screenshot(path=str(out/('modules-'+str(n)+'.png')))
                report['performance'][str(n)]=page.evaluate('''()=>{const s=MF_PLANNER.scene,gl=s.renderer.getContext(),times=[],c=s.camera.position.clone(),q=s.camera.quaternion.clone();for(let i=0;i<14;i++){const t=performance.now();s.camera.position.x+=.005;s.camera.lookAt(s.controls.target);s.renderer.render(s.scene,s.camera);gl.finish();if(i>3)times.push(performance.now()-t);}s.camera.position.copy(c);s.camera.quaternion.copy(q);s.camera.updateMatrixWorld();s.invalidate();times.sort((a,b)=>a-b);return{samples:times,median_ms:times[Math.floor(times.length/2)],calls:s.renderer.info.render.calls,triangles:s.renderer.info.render.triangles,memory:s.renderer.info.memory,renderer:gl.getParameter(gl.RENDERER)};}''')
            assert not report['errors'],report['errors'];assert not report['unexpected_requests'],report['unexpected_requests']
            report['success']=True
        finally:
            (out/'metrics.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));context.close();browser.close()
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
