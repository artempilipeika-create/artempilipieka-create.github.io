"""Kitchen foundation through actual catalogue, browser, ASGI and disposable Postgres."""
import pytest
from playwright.sync_api import expect
from tests.webgl.browser_checks import page,settings,api,admin_user,open_planner,screenshot
from tests.webgl.navigation import panel,close_panels
from tests.webgl.polish_checks import export_payload
from tests.webgl.material_checks import ARTICLES,NAMES
from tests.webgl.kitchen_journey import journey,row_data
from tests.stage03.test_api import publish,login
from tests.stage03.support import master

@pytest.mark.timeout(240)
def test_kitchen_row_materials_history_geometry_save_load_and_native_export(page,api,settings,admin_user):
    open_planner(page,api);owner=api.get('/api/v2/auth/me').json()['email'];login(api,admin_user['email'])
    publish(api,master([[a,'ЛДСП EGGER 18мм '+n+' '+a,'кв.м',0,2800,2070,18,a.split()[1],'','M1','false',''] for a,n in zip(ARTICLES,NAMES)]),namespace='test.kitchen.visuals')
    login(api,owner)
    checks=[]
    def check(label,result):
        assert result,label
        checks.append(label)
    before=journey(page,check,lambda name:screenshot(page,name))
    native=export_payload(page)
    assert native['format']=='martin-forest-bazis-native-v2' and native['production_schema']==1
    assert len(native['items'])==3 and not native['skipped_non_bazis']
    assert native['kitchen_production']['native_accessories_supported'] is False
    assert native['kitchen_production']['runs'][0]['countertopActualLengthMm']==1800
    for it in native['items']:
        assert it['source_file'].endswith('.fr3d') and len(it['source_sha256'])==64
        assert it['construction']['carcass']['rail_orientation']=='horizontal'
        assert it['construction']['kitchen']['legHeightMm']==150
        assert it['target']['height']==820 and it['construction']['native_base_height_mm']==100
        assert len(it['construction']['legs'])==4
        assert all(p['size']['y']==18 and p['size']['z']==80 for p in it['construction']['parts'] if p['key'].startswith('rail-'))
    close_panels(page);page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId');saved=api.get('/api/v2/3d-projects/'+pid)
    assert saved.status_code==200,saved.text
    fields=['legHeightMm','rearServiceGapMm','plinthMaterialId','countertopDepthMm','countertopStockLengthMm','countertopThicknessMm','countertopMaterialId','body_variant_id','front_variant_id']
    for a,b in zip(saved.json()['scene']['items'],before['items']):assert {k:a[k] for k in fields}=={k:b[k] for k in fields}
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    page.wait_for_function('id=>MF_PLANNER.adapter.projectId===id&&MF_PLANNER.scene.entries.size===3',arg=pid)
    page.wait_for_function('''()=>{const p=MF_PLANNER,ms=[];p.scene.root.traverse(m=>{if(m.isMesh&&m.material.userData.variantId)ms.push(m)});p.scene.dressing.traverse(m=>{if(m.isMesh&&m.material.userData.variantId)ms.push(m)});return ms.length>10&&ms.every(m=>m.material.map?.image?.complete)}''')
    after=row_data(page)
    assert after['runs']==before['runs'] and after['parts']==before['parts'] and after['counters']==before['counters']
    assert export_payload(page)['items']==native['items']
    close_panels(page);page.evaluate('MF_PLANNER.scene.fit("kitchen");MF_PLANNER.scene.render()');screenshot(page,'kitchen-reloaded')
    print('Kitchen UI checks:',len(checks),*checks,sep='\n')
