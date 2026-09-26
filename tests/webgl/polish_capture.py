"""Real WebGL furniture captures. --live uses published staging assets, synthetic reads only."""
from pathlib import Path
from urllib.parse import urlparse
import argparse,json
from playwright.sync_api import sync_playwright,expect
from visual_capture import BASE,CSP,SEED

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--live',action='store_true');parser.add_argument('--out',type=Path,required=True);args=parser.parse_args()
    root=Path(__file__).resolve().parents[2]/'backend/v2/cabinet_assets';out=args.out;out.mkdir(parents=True,exist_ok=True)
    base=BASE if args.live else 'https://testserver';report={'published_assets':args.live,'project':'Synthetic demonstration, no live writes','errors':[],'modules':{}}
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        context=browser.new_context(viewport={'width':1520,'height':1000})
        def request(route):
            r=route.request;path=urlparse(r.url).path
            if not r.url.startswith(base+'/') or r.method!='GET':raise AssertionError('Unexpected request '+r.method+' '+path)
            if path=='/api/v2/auth/me':body=b'{"user_id":"polish-demo"}';mime='application/json'
            elif path=='/api/v2/3d-projects':body=b'{"items":[]}';mime='application/json'
            elif path.startswith('/api/'):raise AssertionError(path)
            elif args.live:route.continue_();return
            elif path=='/constructor':body=(root/'constructor-next.html').read_bytes();mime='text/html'
            elif path.startswith('/account/'):
                f=root/path.removeprefix('/account/')
                if not f.is_file():route.fulfill(status=404,body='');return
                body=f.read_bytes();mime='text/css' if f.suffix=='.css' else 'application/javascript'
            elif path=='/ui/favicon.svg':body=b'<svg xmlns="http://www.w3.org/2000/svg"/>';mime='image/svg+xml'
            else:route.fulfill(status=404,body='');return
            route.fulfill(status=200,body=body,headers={'Content-Type':mime,'Content-Security-Policy':CSP})
        context.route('**/*',request);page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.goto(base+'/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=30000)
        expect(page.locator('body')).to_have_attribute('data-planner-renderer','webgl')
        def shot(name):
            page.wait_for_timeout(500);page.screenshot(path=str(out/(name+'.png')))
        for name,template,title in [('base-doors','base.two_door','Нижний · две двери'),('base-drawers','base.drawers_3','Нижний · три ящика'),('tall','tall.one_door','Пенал'),('wall','wall.two_door','Верхний · две двери')]:
            report['modules'][name]=page.evaluate('''([template,title])=>{const p=MF_PLANNER,it=p.adapter.createDraft({template});Object.assign(it,{x:0,z:-1500,item_id:template,name:title});
            p.bridge.restore({name:title,scene:{schema_version:2,room:{width:4200,depth:3600,height:2700},items:[it],selected_item_id:it.item_id,view_mode:'3d'},selectedId:it.item_id});p.history.reset();p.setView('3d');p.scene.fit('selected');
            const g=p.scene.entries.get(it.item_id).group;return {heights:MF_FURNITURE_CORE.heights(it),facades:g.children.filter(x=>x.userData.facade).map(x=>x.userData.facade),handles:g.children.filter(x=>x.userData.role==='handle').map(x=>x.position.toArray().map(v=>v*1000))};}''',[template,title])
            if not page.locator('body').evaluate("e=>e.classList.contains('planner-client')"):page.locator('#planner-client').click()
            shot(name)
        page.evaluate(SEED,13);page.evaluate("MF_PLANNER.scene.fit('kitchen')");shot('kitchen')
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(150);page.evaluate("MF_PLANNER.scene.fit('kitchen')");shot('mobile')
        page.set_viewport_size({'width':1520,'height':1000})
        page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.createDraft({template:'base.two_door'});Object.assign(it,{base:'legs',x:0,z:0,item_id:'side',name:'Корпус и отдельное основание'});p.bridge.restore({name:'100 + 720 + 38 мм',scene:{schema_version:2,room:{width:4200,depth:3600,height:2700},items:[it],selected_item_id:it.item_id,view_mode:'3d'},selectedId:it.item_id});p.setView('right');p.scene.fit('selected');}''');shot('side')
        assert not report['errors'];report['success']=True
        (out/'measurements.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));browser.close()
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
