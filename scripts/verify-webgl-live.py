"""Public staging GET verification. Browser project/API are synthetic, never written remotely."""
import hashlib,json,sys,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE='https://martin-forest-v2-staging-production.up.railway.app'
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'qa-output/webgl-live';OUT.mkdir(parents=True,exist_ok=True)
CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NoRedirect)
def get(path):
    req=urllib.request.Request(BASE+path,headers={'Cache-Control':'no-cache','User-Agent':'MF-WebGL-ReadOnly-Acceptance'},method='GET')
    with opener.open(req,timeout=25) as response:return response.status,response.headers,response.read(2000000)
result={'expected_commit':sys.argv[1],'deployment':sys.argv[2],'public_requests':'GET only','browser_data':'Synthetic project; all API calls intercepted. No staging login or database writes.','endpoints':[]}
status,headers,body=get('/health');health=json.loads(body)
assert status==200 and health.get('ok') and health.get('environment')=='staging'
result['health']=health;result['health_http_status']=status
files={'/constructor':'backend/v2/cabinet_assets/constructor-next.html','/constructor-next':'backend/v2/cabinet_assets/constructor-next.html','/account/3d.js':'backend/v2/cabinet_assets/3d.js','/account/3d-studio.js':'backend/v2/cabinet_assets/3d-studio.js'}
for f in (ROOT/'backend/v2/cabinet_assets/planner').rglob('*'):
    if f.suffix in ('.js','.mjs','.css') or f.name=='manifest.json':files['/account/planner/'+f.relative_to(ROOT/'backend/v2/cabinet_assets/planner').as_posix()]=f.relative_to(ROOT).as_posix()
for path,source in files.items():
    status,headers,body=get(path)
    assert status==200 and body==(ROOT/source).read_bytes(),path
    assert headers.get('Content-Security-Policy')==CSP,path
    result['endpoints'].append({'path':path,'status':status,'matches_accepted_source':True,'sha256':hashlib.sha256(body).hexdigest(),'strict_csp':True})
errors=[];console=[];blocked=[];seen=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1600,'height':1000},device_scale_factor=1)
    def gate(route):
        req=route.request
        if req.url.startswith(BASE+'/api/v2/'):
            path=req.url.split('/api/v2/',1)[1].split('?',1)[0]
            if req.method!='GET':blocked.append({'method':req.method,'url':req.url});route.abort();return
            data={'user_id':'synthetic-live-visual-review'} if path=='auth/me' else {'items':[]} if path in ('3d-projects','catalogue/materials') else {'active_release':None} if path=='catalogue/releases' else {}
            route.fulfill(status=200,content_type='application/json',body=json.dumps(data));return
        if req.method=='GET' and req.url.startswith(BASE+'/'):seen.append(req.url);route.continue_();return
        blocked.append({'method':req.method,'url':req.url});route.abort()
    context.route('**/*',gate)
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda e:console.append(e.text) if e.type=='error' else None)
    page.goto(BASE+'/constructor',wait_until='domcontentloaded')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=30000)
    expect(page.locator('body')).to_have_attribute('data-planner-renderer','webgl')
    assert page.locator('.mf3d-canvas-wrap canvas').count()==1
    page.evaluate('''()=>{
      const p=MF_PLANNER,items=[],room={width:6200,depth:3600,height:2700};
      for(let i=0;i<6;i++){
        const a=p.adapter.createDraft({template:i%2?'base.two_door':'base.drawers_3'});Object.assign(a,{width:600,x:-2100+i*600,z:-1500,name:'Нижний '+(i+1)});items.push(a);
        const u=p.adapter.createDraft({template:'wall.two_door'});Object.assign(u,{width:600,x:-2100+i*600,z:-1600,name:'Верхний '+(i+1)});items.push(u);
      }
      const tall=p.adapter.createDraft({template:'tall.one_door'});Object.assign(tall,{x:1650,z:-1500,name:'Пенал'});items.push(tall);
      p.bridge.restore({name:'Кухня · Martin Forest',scene:{schema_version:2,room,items,selected_item_id:items[4].item_id,view_mode:'3d'},selectedId:items[4].item_id});p.history.reset();p.scene.fit('kitchen');
    }''')
    page.wait_for_timeout(350)
    assert page.evaluate('MF_PLANNER.adapter.items.length')==13
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(OUT/'Martin_Forest_WebGL_desktop.png'),full_page=False)
    page.locator('#planner-front').click();page.wait_for_timeout(150)
    page.screenshot(path=str(OUT/'Martin_Forest_WebGL_front.png'),full_page=False)
    page.locator('#mode-3d').click();page.locator('#planner-client').click();page.wait_for_timeout(200)
    page.screenshot(path=str(OUT/'Martin_Forest_WebGL_client.png'),full_page=False)
    page.locator('#planner-client').click()
    page.set_viewport_size({'width':390,'height':844});page.locator('#reset-view').click();page.wait_for_timeout(250)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(OUT/'Martin_Forest_WebGL_mobile.png'),full_page=False)
    page.locator('#planner-mobile-inspector').click();expect(page.locator('.mf3d-right')).to_be_visible()
    page.screenshot(path=str(OUT/'Martin_Forest_WebGL_mobile_parameters.png'),full_page=False)
    result.update(browser_errors=errors,console_errors=console,blocked_requests=blocked,real_static_get_requests=len(seen),renderer=page.evaluate('document.body.dataset.plannerRenderer'),module_count=13)
    assert not errors and not console and not blocked,result
    browser.close()
result['success']=True
(OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
