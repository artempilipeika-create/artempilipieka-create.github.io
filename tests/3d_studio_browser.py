"""Real constructor + Studio UI; synthetic loopback API, never staging/production data."""
from __future__ import annotations
import hashlib
import json
import mimetypes
import os
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from threading import Thread
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'backend/v2/cabinet_assets'
OUT = ROOT / 'qa-output/studio'
OUT.mkdir(parents=True, exist_ok=True)
CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
DATABASE: dict = {'projects': {}, 'revision': None, 'fail_save': False, 'posts': []}
MATERIALS = [dict(variant_id='test-body',manufacturer='Тест',article='W1000',name='Белый',thickness=18,length=2800,width=2070),dict(variant_id='test-front',manufacturer='Тест',article='H1180',name='Дуб',thickness=18,length=2800,width=2070)]
CHECKS=[]

def check(name, condition):
    assert condition, name
    CHECKS.append(name)
    print('PASS:', name, flush=True)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def send(self, data, code=200, kind='application/json'):
        body = json.dumps(data,ensure_ascii=False).encode() if kind=='application/json' else data
        self.send_response(code); self.send_header('Content-Type',kind); self.send_header('Content-Length',str(len(body))); self.send_header('Content-Security-Policy',CSP); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        p=urlparse(self.path).path
        if p=='/api/v2/auth/me': return self.send({'user_id':'synthetic-ui-test'})
        if p=='/api/v2/3d-projects': return self.send({'items':list(DATABASE['projects'].values())})
        if p.startswith('/api/v2/3d-projects/'):
            item=DATABASE['projects'].get(p.split('/')[-1]); return self.send(item or {},200 if item else 404)
        if p=='/api/v2/catalogue/materials': return self.send({'items':MATERIALS})
        if p.startswith('/api/v2/catalogue/materials/'):
            return self.send(next((m for m in MATERIALS if m['variant_id']==p.split('/')[-1]),MATERIALS[0]))
        if p=='/api/v2/catalogue/releases': return self.send({'active_release':'synthetic-release'})
        if p in ['/constructor','/constructor.html','/']:
            return self.send((ASSETS/'constructor.html').read_bytes(),kind='text/html;charset=utf-8')
        if p=='/editor': return self.send(b'<!doctype html><html><body>Local synthetic order editor</body></html>',kind='text/html')
        if p=='/ui/favicon.svg': return self.send(b'<svg xmlns="http://www.w3.org/2000/svg"/>',kind='image/svg+xml')
        if p.startswith('/account/') and Path(p).name in {'app.css','3d.css','3d.js','3d-studio.css','3d-studio.js'}:
            file=ASSETS/Path(p).name
            return self.send(file.read_bytes(),kind='application/javascript' if file.suffix=='.js' else 'text/css')
        return self.send({},404)
    def write_request(self):
        p=urlparse(self.path).path
        data=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))) or b'{}')
        DATABASE['posts'].append({'path':p,'method':self.command,'body':data})
        if p.startswith('/api/v2/3d-projects'):
            parts=p.split('/')
            if self.command in ('POST','PATCH') and DATABASE['fail_save']:
                DATABASE['fail_save']=False;return self.send({'detail':{'code':'version_conflict'}},409)
            if parts[-1]=='shares': return self.send({'url':'/3d-view?token=synthetic-token'})
            if parts[-1]=='duplicate':
                old=DATABASE['projects'][parts[-2]];pid='test-'+str(len(DATABASE['projects'])+1)
                saved={**old,'project_id':pid,'name':old['name']+' — копия','version':1};DATABASE['projects'][pid]=saved;return self.send(saved)
            pid=parts[-1] if self.command=='PATCH' else 'test-'+str(len(DATABASE['projects'])+1)
            saved={**data,'project_id':pid,'version':DATABASE['projects'].get(pid,{}).get('version',0)+1,'updated_at':'2026-09-25T12:00:00Z'}
            DATABASE['projects'][pid]=saved;return self.send(saved)
        if p=='/api/v2/orders': return self.send({'order_id':'synthetic-order','optimistic_lock_version':1})
        if p.endswith('/revisions'): DATABASE['revision']=data;return self.send({'ok':True})
        return self.send({},404)
    do_POST=write_request
    do_PATCH=write_request
    def do_DELETE(self):
        DATABASE['projects'].pop(urlparse(self.path).path.split('/')[-1],None);self.send(None,204)

def main():
    core=(ASSETS/'3d.js').read_bytes()
    check('Original 3d.js is byte-identical',hashlib.sha1(b'blob '+str(len(core)).encode()+b'\0'+core).hexdigest()=='dc1d0a45b6284ba6fa615c7bb2f5c2efdb4db773')
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
    base='http://127.0.0.1:'+str(server.server_port)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=os.environ.get('MF_STUDIO_CHROMIUM'),args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1440,'height':960},device_scale_factor=1,accept_downloads=True)
        page=context.new_page();errors=[];csp=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:csp.append(m.text) if 'Content Security Policy' in m.text or 'Refused to' in m.text else None)
        page.on('dialog',lambda d:d.accept())
        try:
            page.goto(base+'/constructor');page.wait_for_function("document.body.dataset.ready==='true'")
            check('Studio attaches to the actual engine',page.evaluate("document.body.dataset.studioVersion==='1.0'"))
            check('Empty scene guidance',page.locator('#studio-empty-scene').is_visible())
            check('All 10 catalogue filters',page.locator('#module-tabs button').count()==10)
            check('No page overflow desktop',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            page.screenshot(path=str(OUT/'01-empty-desktop.png'),full_page=True)
            page.locator('[data-module-filter="base"]').click()
            check('Base category includes BASIS modules',page.locator('#module-catalogue [data-bazis]:visible').count()>0)
            page.locator('[data-module-filter="cargo"]').click()
            check('Cargo category resolves actual BASIS module',page.locator('#module-catalogue .mf3d-module:visible').count()==1)
            page.locator('[data-module-filter="corner"]').click()
            check('Corner category',page.locator('#module-catalogue .mf3d-module:visible').count()>=4)
            page.locator('[data-module-filter="wall"]').click()
            check('Wall category',page.locator('#module-catalogue .mf3d-module:visible').count()==3)
            page.locator('#module-search').fill('not-a-module')
            check('Search empty state',page.locator('#studio-catalog-empty').is_visible())
            page.locator('#studio-clear-search').click()
            page.locator('#studio-sort').select_option('width')
            check('Sorting is usable',page.locator('#module-catalogue .mf3d-module:visible').count()>20)
            page.locator('[data-template="base.two_door"]').click()
            check('Real add-template handler',page.evaluate('state.items.length===1&&selected().width===800'))
            check('Gap remains 1.5 on four sides',page.evaluate("FACADE_GAP_MM===1.5&&facadeCells(selected()).every(f=>f.w===397&&f.h===637)"))
            page.locator('#width').fill('900')
            check('Resize uses actual facade calculator',page.evaluate('selected().width===900&&facadeCells(selected())[0].w===447'))
            page.locator('#studio-item-name').fill('Шкаф у окна');page.locator('#studio-item-name').press('Tab')
            check('Rename updates scene item',page.evaluate("selected().name==='Шкаф у окна'"))
            page.locator('#tab-items').click()
            check('Project module list selects current item',page.locator('#scene-items .mf3d-project.active').count()==1)
            page.locator('#duplicate-item').click()
            check('Original copy handler',page.evaluate('state.items.length===2&&state.items[0].item_id!==state.items[1].item_id'))
            page.locator('#remove-item').click()
            check('Original delete handler',page.evaluate('state.items.length===1'))
            x=page.evaluate('selected().x');page.locator('[data-nudge="right"]').click()
            check('Precise movement',page.evaluate('selected().x')==x+10)
            page.locator('#studio-rotate').click()
            check('Rotation delegates to existing control',page.evaluate('selected().rotation===90'))
            page.locator('#rotation').select_option('0')
            page.locator('#body-search').fill('бе');page.locator('#body-results button').first.click()
            page.locator('#front-search').fill('ду');page.locator('#front-results button').nth(1).click()
            check('Actual material search and binding',page.evaluate("selected().body_variant_id==='test-body'&&selected().front_variant_id==='test-front'"))
            page.locator('#mode-2d').click()
            pt=page.evaluate("""(()=>{const r=canvas.getBoundingClientRect(),m=room2dMetrics(),it=selected();return{x:r.left+m.ox+it.x*m.scale,y:r.top+m.oz+it.z*m.scale,before:it.x}})()""")
            page.mouse.move(pt['x'],pt['y']);page.mouse.down();page.mouse.move(pt['x']+30,pt['y']+20,steps=5);page.mouse.up()
            check('2D drag retains original interaction',page.evaluate('selected().x')!=pt['before'])
            page.locator('#studio-focus').click()
            check('Focus returns selected module to 3D',page.evaluate("viewMode==='3d'"))
            page.locator('#reset-view').click()
            check('Dirty state is honest',page.locator('#studio-save-state').get_attribute('data-dirty')=='true')
            page.locator('#save-project').click();page.wait_for_function("document.getElementById('studio-save-state').textContent==='Проект сохранён'")
            check('Save retains schema v2 and materials',page.evaluate("project.scene.schema_version===2&&project.scene.items[0].front_variant_id==='test-front'"))
            page.locator('#project-name').fill('Проверка ошибки сохранения');DATABASE['fail_save']=True
            page.locator('#save-project').click();page.wait_for_function("document.getElementById('status').textContent.includes('Проект изменился')")
            check('Failed save stays dirty',page.locator('#studio-save-state').get_attribute('data-dirty')=='true')
            page.locator('#save-project').click();page.wait_for_function("document.getElementById('studio-save-state').textContent==='Проект сохранён'")
            page.locator('#tab-catalog').click();page.locator('[data-module-filter="bazis"]').click();page.locator('#module-catalogue [data-bazis]:visible').first.click()
            before=page.evaluate('JSON.stringify(state)')
            with page.expect_download() as d: page.locator('#export-bazis').click()
            download=d.value;download.save_as(str(OUT/'native-export.mf-bazis.json'));payload=json.loads((OUT/'native-export.mf-bazis.json').read_text())
            check('Native BASIS format retained',payload['format']=='martin-forest-bazis-native-v2' and payload['facade_gap_mm']==1.5)
            check('Native export preserves source and target',payload['items'][0]['source_file'].endswith('.fr3d') and payload['items'][0]['target']['width']==200)
            check('Mixed project skip disclosure retained',len(payload['skipped_non_bazis'])==1)
            check('Export never mutates live project',page.evaluate('JSON.stringify(state)')==before)
            # Original to-order code exercised against a loopback synthetic API only.
            page.evaluate("state.items.forEach(it=>{it.body_variant_id='test-body';it.front_variant_id='test-front'});updateAll()")
            page.locator('#to-order').click();page.wait_for_url('**/editor?order=synthetic-order')
            check('Transfer to order retains all module details',DATABASE['revision'] is not None and len(DATABASE['revision']['details'])>=6)
            page.goto(base+'/constructor');page.wait_for_function("document.body.dataset.ready==='true'")
            page.locator('#tab-projects').click();page.locator('#projects .mf3d-project').last.click()
            page.wait_for_function('state.items.length===2')
            check('Reopen saved v2 project',page.evaluate("state.items.some(it=>it.bazis_id)&&state.items.some(it=>it.name==='Шкаф у окна')"))
            # Large synthetic kitchen: never persisted to a real service.
            page.evaluate("""async()=>{await newProject();state.room.width=6200;state.room.depth=3600;syncRoom();for(let i=0;i<6;i++){addTemplate(i%2?'base.two_door':'base.drawers_3',false);Object.assign(selected(),{width:600,x:-2100+i*600,z:-1380,name:'Нижний '+(i+1)});addTemplate('wall.two_door',false);Object.assign(selected(),{width:600,x:-2100+i*600,z:-1500,name:'Верхний '+(i+1)});}addTemplate('tall.one_door',false);Object.assign(selected(),{x:1650,z:-1380,name:'Пенал'});selectedId=state.items[4].item_id;state.selected_item_id=selectedId;syncControls();updateAll();}""")
            page.locator('#tab-items').click();page.locator('#reset-view').click()
            check('Grouped large kitchen list',page.locator('#scene-items .studio-items-group').count()==3)
            page.locator('#studio-item-search').fill('Верхний')
            check('Search project, not catalogue',page.locator('#scene-items .mf3d-project').count()==6)
            page.locator('#studio-item-search').fill('')
            page.locator('#scene-items .mf3d-project').nth(6).click()
            check('List and inspector selection stay synchronized',page.locator('#scene-items .mf3d-project.active').count()==1 and page.locator('#item-title').inner_text()==page.evaluate('selected().name'))
            page.locator('#tab-catalog').click();page.locator('[data-module-filter="base"]').click()
            page.set_viewport_size({'width':1600,'height':1000});page.wait_for_timeout(200)
            page.screenshot(path=str(OUT/'02-kitchen-desktop.png'),full_page=True)
            check('1600px no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            page.set_viewport_size({'width':1280,'height':800});page.wait_for_timeout(200);page.screenshot(path=str(OUT/'03-kitchen-laptop.png'),full_page=True)
            check('1280px no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            page.set_viewport_size({'width':1024,'height':768});page.locator('#studio-toggle-inspector').click()
            check('Tablet inspector opens',page.locator('.mf3d-right').is_visible());page.locator('#studio-toggle-inspector').click()
            page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(150)
            check('Mobile scene visible without overflow',page.locator('#scene').is_visible() and page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            page.screenshot(path=str(OUT/'04-kitchen-mobile.png'),full_page=True)
            page.locator('#studio-toggle-library').click()
            check('Mobile catalogue opens',page.locator('.mf3d-left').is_visible())
            page.screenshot(path=str(OUT/'05-catalog-mobile.png'),full_page=True)
            page.locator('#studio-toggle-inspector').click()
            check('Mobile inspector replaces catalogue',page.locator('.mf3d-right').is_visible() and not page.locator('.mf3d-left').is_visible())
            page.screenshot(path=str(OUT/'06-inspector-mobile.png'),full_page=True)
            page.locator('#studio-toggle-inspector').click();page.locator('.studio-menu summary').click();page.locator('#studio-help').click()
            check('Help dialog opens',page.locator('#studio-help-dialog').is_visible());page.locator('#studio-help-close').click()
            check('No browser runtime errors',not errors)
            check('Unchanged strict CSP; no data-image exceptions',not csp)
            print(json.dumps({'passed':len(CHECKS),'checks':CHECKS,'browser_errors':errors,'csp_errors':csp},ensure_ascii=False,indent=2))
            (OUT/'results.json').write_text(json.dumps({'passed':len(CHECKS),'checks':CHECKS,'browser_errors':errors,'csp_errors':csp},ensure_ascii=False,indent=2))
        except Exception:
            page.screenshot(path=str(OUT/'failure.png'),full_page=True)
            (OUT/'failure.json').write_text(json.dumps({'passed':CHECKS,'errors':errors,'csp':csp},ensure_ascii=False,indent=2))
            raise
        finally:
            context.close();browser.close();server.shutdown()

if __name__=='__main__': main()
