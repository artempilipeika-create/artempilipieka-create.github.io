"""Stage 7 presentation routes must not widen any private/business surface."""
from pathlib import Path
from html.parser import HTMLParser
import pytest
from tests.stage03.test_api import settings,api,admin_user,post,publish,PASSWORD
from tests.stage05.test_api import client_order
from backend.v2.presentation_ui import PAGES,ASSETS,ROOT
from backend.v2.db import connect

@pytest.mark.parametrize('path',list(PAGES))
def test_public_pages_are_explicit_noindex_csp(api,path):
    r=api.get(path)
    assert r.status_code==200
    assert 'noindex' in r.headers['x-robots-tag'] and "default-src 'none'" in r.headers['content-security-policy']
    assert 'Подготовить заказ' in r.text
    assert '/api/orders' not in r.text and 'scraps' not in r.text
    assert '<html lang="ru">' in r.text

@pytest.mark.parametrize('path',['/account','/account.html','/login','/login.html','/register','/register.html','/editor','/order.html','/staff','/admin.html','/constructor.html'])
def test_compatible_workspace_routes_contain_no_user_data(api,path):
    r=api.get(path)
    assert r.status_code==200 and 'aria-live="polite"' in r.text
    assert 'storage_key' not in r.text and 'lease_token' not in r.text
    assert 'backend.v2' not in r.text

@pytest.mark.parametrize('path',['/public/order.js','/static/order.js','/ui/../production_service.py','/ui/production_service.py','/ui/storage/test.oblx','/ui/test.zip','/ui/config.js','/scraps.html','/scraps/','/order.js','/auth.js'])
def test_no_wholesale_static_legacy_or_private_mount(api,path):
    for method in ('GET','HEAD'):
        assert api.request(method,path,headers={'Range':'bytes=0-20'}).status_code in (404,405)

def test_client_cannot_use_staff_or_production_data_through_ui_aliases(api,settings,admin_user):
    order,_,_,_=client_order(api,settings,admin_user,mode='manager_assisted')
    assert api.get('/api/v2/admin/staff').status_code==403
    assert api.get('/api/v2/admin/audit').status_code==403
    assert api.get('/api/v2/orders/'+order['order_id']+'/oblx').status_code==403
    assert api.get('/api/v2/account/orders/'+order['order_id']).status_code==200
    with connect(settings) as c:
        assert c.execute('SELECT count(*) n FROM mf_final_calculation_candidates').fetchone()['n']==0
        assert c.execute("SELECT count(*) n FROM mf_production_jobs WHERE purpose='produce'").fetchone()['n']==0

class Links(HTMLParser):
    def __init__(self):super().__init__();self.links=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        for k in ('src','href'):
            if k in d:self.links.append(d[k])

def test_public_links_resolve_to_explicit_routes():
    known=set(PAGES)|{'/ui/'+s for s in ASSETS}|{'/login','/account','/editor','/constructor.html'}
    for path in set(PAGES.values()):
        p=Links();p.feed((ROOT/path).read_text())
        for link in p.links:
            if link.startswith(('tel:','#')):continue
            assert link.split('?')[0] in known,(path,link)

def test_no_client_native_exports_or_unsafe_html():
    root=Path('backend/v2/cabinet_assets')
    for name in ('app.js','workspace.js'):
        code=(root/name).read_text()
        for forbidden in ('innerHTML','localStorage','AGENT_API_KEY','/agent/jobs','/production-jobs','createObjectURL'):
            assert forbidden not in code
    assert "BAZIS_RUN_REQUIRED:" in (root/'workspace.js').read_text()
    assert 'qty<1' in (root/'workspace.js').read_text()
    assert 'Idempotency-Key' in (root/'app.js').read_text()

def test_form_label_and_landmarks():
    text=Path('backend/v2/cabinet_assets/index.html').read_text()
    for name in ('email','password'):
        assert f'for="{name}"' in text and f'id="{name}"' in text
    assert 'href="#main"' in text and 'id="main"' in text
    assert 'aria-label="Навигация"' in text
