"""Actual workspace screenshots; live mode reads deployed assets, never remote project writes."""
from pathlib import Path
from urllib.parse import urlparse
import argparse,json,os,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from playwright.sync_api import sync_playwright,expect
from tests.webgl.visual_capture import BASE,CSP,SEED
from tests.webgl.navigation import panel,close_panels


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--out',type=Path,required=True);parser.add_argument('--live',action='store_true');args=parser.parse_args()
    out=args.out;out.mkdir(parents=True,exist_ok=True);assets=Path(__file__).resolve().parents[2]/'backend/v2/cabinet_assets';base=BASE if args.live else 'https://testserver'
    report={'commit':os.environ.get('GITHUB_SHA'),'url':base+('/constructor' if args.live else '/constructor-next'),'live_assets':args.live,'data':'Synthetic browser-only project and authorization reads; no remote writes','errors':[],'blocked':[],'screenshots':{}}
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        context=browser.new_context(viewport={'width':1920,'height':1080},device_scale_factor=1)
        def gate(route):
            req=route.request;path=urlparse(req.url).path
            if not req.url.startswith(base+'/') or req.method!='GET':report['blocked'].append(req.method+' '+req.url);route.abort();return
            if path=='/api/v2/auth/me':body=b'{"user_id":"workspace-synthetic"}';mime='application/json'
            elif path=='/api/v2/3d-projects':body=b'{"items":[]}';mime='application/json'
            elif path.startswith('/api/'):report['blocked'].append(path);route.abort();return
            elif args.live:route.continue_();return
            elif path in ['/constructor','/constructor-next']:body=(assets/'constructor-next.html').read_bytes();mime='text/html'
            elif path.startswith('/account/'):
                f=assets/path.removeprefix('/account/')
                if not f.is_file():route.fulfill(status=404,body='');return
                body=f.read_bytes();mime='text/css' if f.suffix=='.css' else 'application/javascript'
            elif path=='/ui/favicon.svg':body=b'<svg xmlns="http://www.w3.org/2000/svg"/>';mime='image/svg+xml'
            else:route.fulfill(status=404,body='');return
            route.fulfill(status=200,body=body,headers={'Content-Type':mime,'Content-Security-Policy':CSP})
        context.route('**/*',gate);page=context.new_page()
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
        def shot(name):
            page.wait_for_timeout(350)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.screenshot(path=str(out/(name+'.png')),full_page=False)
            report['screenshots'][name]=page.evaluate('''()=>({viewport:[innerWidth,innerHeight],canvas:(()=>{const r=document.getElementById('scene').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})(),panels:[document.getElementById('planner-workspace').dataset.leftOpen,document.getElementById('planner-workspace').dataset.rightOpen],fullscreen:document.fullscreenElement?.id||null,client:document.body.classList.contains('planner-client'),renderer:document.body.dataset.plannerRenderer})''')
        try:
            page.goto(report['url']);expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=30000)
            expect(page.locator('#planner-workspace')).to_have_attribute('data-workspace-ready','true')
            expect(page.locator('body')).to_have_attribute('data-planner-renderer','webgl')
            fixture=page.evaluate(SEED,13);(out/'project.json').write_text(json.dumps(fixture,ensure_ascii=False,indent=2))
            initial=page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())');page.wait_for_timeout(1000)
            shot('01-desktop-scene-1920')
            panel(page,'left','catalog');shot('02-desktop-catalogue');close_panels(page)
            panel(page,'right');shot('03-desktop-parameters');close_panels(page)
            page.locator('#planner-fullscreen').click();expect(page.locator('#planner-fullscreen')).to_have_attribute('aria-pressed','true')
            assert page.evaluate('document.fullscreenElement.id')=='planner-workspace';shot('04-fullscreen-editing')
            page.keyboard.press('Escape');expect(page.locator('#planner-fullscreen')).to_have_attribute('aria-pressed','false')
            page.locator('#planner-client').click();shot('05-client-mode');page.locator('#planner-client').click()
            page.set_viewport_size({'width':1024,'height':768});page.locator('#reset-view').click();shot('06-tablet-scene')
            panel(page,'left');shot('06-tablet-catalogue');close_panels(page)
            page.set_viewport_size({'width':390,'height':844});page.locator('#reset-view').click();shot('07-mobile-scene')
            panel(page,'left','catalog');shot('08-mobile-catalogue-sheet');close_panels(page)
            panel(page,'right');shot('09-mobile-parameters-sheet');close_panels(page)
            page.locator('#planner-client').click();shot('10-mobile-client-mode')
            assert page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')==initial
            assert not report['errors'] and not report['blocked'],report
            report['success']=True
        except Exception:
            page.screenshot(path=str(out/'failure.png'));raise
        finally:
            (out/'workspace-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));context.close();browser.close()
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
