"""Catalogue rendering regression with synthetic API reads; never writes remote data."""
from pathlib import Path
from urllib.parse import urlparse
import argparse, json, mimetypes, sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from playwright.sync_api import sync_playwright, expect
from tests.webgl.visual_capture import CSP, SEED
from tests.webgl.navigation import panel, close_panels


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    assets = Path(__file__).resolve().parents[2] / 'backend/v2/cabinet_assets'
    report = {'errors': [], 'blocked': [], 'previews': {}, 'screenshots': []}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1600, 'height': 1000})

        def gate(route):
            req = route.request
            path = urlparse(req.url).path
            if not req.url.startswith('https://testserver/') or req.method != 'GET':
                report['blocked'].append(req.method + ' ' + req.url)
                route.abort()
                return
            if path == '/api/v2/auth/me':
                body, mime = b'{"user_id":"catalogue-synthetic"}', 'application/json'
            elif path == '/api/v2/3d-projects':
                body, mime = b'{"items":[]}', 'application/json'
            elif path.startswith('/api/'):
                report['blocked'].append(path)
                route.abort()
                return
            elif path == '/constructor':
                body, mime = (assets / 'constructor-next.html').read_bytes(), 'text/html'
            elif path.startswith('/account/'):
                file = assets / path.removeprefix('/account/')
                if not file.is_file():
                    route.fulfill(status=404, body='')
                    return
                body = file.read_bytes()
                mime = 'application/javascript' if file.suffix in ['.mjs', '.js'] else mimetypes.guess_type(file)[0] or 'application/octet-stream'
            elif path == '/ui/favicon.svg':
                body, mime = b'<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml'
            else:
                route.fulfill(status=404, body='')
                return
            route.fulfill(status=200, body=body, headers={'Content-Type': mime, 'Content-Security-Policy': CSP})

        context.route('**/*', gate)
        page = context.new_page()
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)

        def shot(name):
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=str(args.out / (name + '.png')))
            report['screenshots'].append(name)

        try:
            page.goto('https://testserver/constructor')
            expect(page.locator('body')).to_have_attribute('data-planner-ready', 'true', timeout=30000)
            expect(page.locator('body')).to_have_attribute('data-planner-renderer', 'webgl')
            panel(page, 'left', 'catalog')
            page.evaluate(SEED, 13)
            before = page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')
            expect(page.locator('canvas[data-model-preview="mesh-v2"]').first).to_be_visible(timeout=20000)
            page.wait_for_timeout(1500)
            shot('desktop-catalogue')
            report['previews'] = page.evaluate('''()=>[...document.querySelectorAll('canvas[data-model-preview="mesh-v2"]')].map(c=>({width:c.width,height:c.height,name:c.closest('button')?.innerText}))''')
            assert report['previews'] and all(p['width'] == 480 and p['height'] == 352 for p in report['previews'])
            # The shared renderer must keep the editor's render target, exposure and shadow flags.
            report['stateRestored'] = page.evaluate('''()=>{
                const s=MF_PLANNER.scene,c=document.querySelector('canvas[data-model-preview="mesh-v2"]'),b=c.closest('button');
                const old=s.renderer.toneMappingExposure;s.renderer.toneMappingExposure=.77;
                s.renderer.shadowMap.needsUpdate=false;
                const start=performance.now();s.previews.paint(c,{template:b.dataset.template,bazis:b.dataset.bazis,module:b.dataset.module});
                const result={elapsedMs:performance.now()-start,exposure:s.renderer.toneMappingExposure,target:s.renderer.getRenderTarget(),shadowUpdate:s.renderer.shadowMap.needsUpdate,shadows:s.renderer.shadowMap.enabled,studioChildren:s.previews.scene.children.length};
                s.renderer.toneMappingExposure=old;return result;
            }''')
            assert report['stateRestored']['exposure'] == .77
            assert report['stateRestored']['target'] is None
            assert report['stateRestored']['shadowUpdate'] is False
            assert report['stateRestored']['shadows'] is True
            assert report['stateRestored']['studioChildren'] == 6
            assert page.locator('.mf3d-canvas-wrap canvas').count() == 1
            assert page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())') == before
            close_panels(page)
            for view in ['front', 'top', '3d']:
                page.evaluate('(mode)=>MF_PLANNER.setView(mode)', view)
                page.wait_for_timeout(150)
            page.locator('#planner-client').click()
            page.wait_for_timeout(300)
            shot('client-scene')
            page.locator('#planner-client').click()
            for width, height, name in [(1024, 768, 'tablet-catalogue'), (390, 844, 'mobile-catalogue')]:
                page.set_viewport_size({'width': width, 'height': height})
                panel(page, 'left', 'catalog')
                page.wait_for_timeout(600)
                shot(name)
                close_panels(page)
            assert page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())') == before
            assert not report['errors'] and not report['blocked'], report
            report['success'] = True
        except Exception:
            page.screenshot(path=str(args.out / 'failure.png'))
            raise
        finally:
            (args.out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
            browser.close()
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
