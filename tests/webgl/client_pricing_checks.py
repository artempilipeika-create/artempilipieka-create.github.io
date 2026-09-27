"""Client presentation and pricing against real persistence, canonical BOM and native export."""
from playwright.sync_api import expect
from tests.webgl.browser_checks import page,settings,api,admin_user,open_planner,screenshot
from tests.webgl.navigation import panel,close_panels
from tests.webgl.polish_checks import export_payload

def test_client_room_twenty_pilot_modules_render_budget(page,api,settings,admin_user):
    import json
    from tests.webgl.browser_checks import OUT
    open_planner(page,api)
    page.evaluate('''()=>{const p=MF_PLANNER,s=p.bridge.snapshot(),ids=['bazis.0211e4f77fc4','bazis.784bf9af84f8','bazis.3079d0656398'];s.scene.room={width:12000,depth:12000,height:2700};s.scene.items=Array.from({length:20},(_,i)=>Object.assign(p.adapter.createDraft({bazis:ids[i%3]}),{x:(i%5-2)*900,z:(Math.floor(i/5)-1.5)*1500}));s.selectedId=s.scene.items[0].item_id;s.scene.selected_item_id=s.selectedId;p.bridge.restore(s);p.scene.fit('kitchen')}''')
    measure='''()=>{const s=MF_PLANNER.scene,gl=s.renderer.getContext(),times=[],position=s.camera.position.clone(),rotation=s.camera.quaternion.clone();for(let i=0;i<8;i++){const start=performance.now();s.camera.position.x+=.005;s.camera.lookAt(s.controls.target);s.renderer.render(s.scene,s.camera);gl.finish();if(i>=2)times.push(performance.now()-start)}s.camera.position.copy(position);s.camera.quaternion.copy(rotation);s.camera.updateMatrixWorld();times.sort((a,b)=>a-b);return {medianMs:times[3],samples:times,drawCalls:s.renderer.info.render.calls,triangles:s.renderer.info.render.triangles,geometries:s.renderer.info.memory.geometries,renderer:gl.getParameter(gl.RENDERER)}}'''
    technical=page.evaluate(measure);page.locator('#planner-client').click();client=page.evaluate(measure)
    OUT.mkdir(parents=True,exist_ok=True);(OUT/'client-performance.json').write_text(json.dumps({'modules':20,'viewport':page.viewport_size,'technical':technical,'client':client},indent=2))
    assert technical['geometries']==client['geometries']
    assert client['medianMs']<technical['medianMs']*2+75
    screenshot(page,'client-twenty-modules')

def test_room_presets_pricing_history_save_load_and_native_isolation(page,api,settings,admin_user):
    open_planner(page,api);panel(page,'left','catalog')
    page.locator('[data-bazis="bazis.0211e4f77fc4"]').click();panel(page,'right')
    page.locator('#width').fill('320');page.locator('#width').press('Tab')
    expect(page.locator('#module-cost')).to_contain_text('Фактическая ширина: 320 мм')
    expect(page.locator('#module-cost')).to_contain_text('Ценовая категория: 350 мм')
    expect(page.locator('#module-cost')).to_have_attribute('data-price-status','PRICE_DATA_MISSING')
    native=export_payload(page)['items'];before=page.evaluate('JSON.stringify(MF_PLANNER.adapter.items)')
    geometry=page.evaluate('[...MF_PLANNER.scene.entries.values()].map(e=>e.group.uuid)')
    close_panels(page)
    room=page.locator('#planner-room-settings summary').bounding_box();toolbar=page.locator('.mf3d-stagebar').bounding_box()
    assert room['y']>=toolbar['y']+toolbar['height'], 'Room controls must stay below the toolbar'
    page.locator('#planner-room-settings summary').click()
    page.locator('#room-preset').select_option('warm')
    expect(page.locator('#room-floor')).to_have_value('oak');expect(page.locator('#room-lighting')).to_have_value('warm')
    page.locator('#planner-undo').click();expect(page.locator('#room-preset')).to_have_value('showroom')
    page.locator('#planner-redo').click();expect(page.locator('#room-preset')).to_have_value('warm')
    page.locator('#planner-client').click()
    assert page.evaluate('MF_PLANNER.scene.client') is True
    expect(page.locator('#planner-undo')).to_be_hidden()
    for preset in ['studio','warm','showroom']:
        page.locator('#room-preset').select_option(preset)
        assert page.evaluate('JSON.stringify(MF_PLANNER.adapter.items)')==before
        assert page.evaluate('[...MF_PLANNER.scene.entries.values()].map(e=>e.group.uuid)')==geometry
        screenshot(page,'client-'+preset)
        page.locator('#planner-client').click();assert export_payload(page)['items']==native;page.locator('#planner-client').click()
    page.locator('#room-wall-color').evaluate("e=>{e.value='#bbccdd';e.dispatchEvent(new Event('change',{bubbles:true}))}")
    page.locator('#room-floor').select_option('oak');page.locator('#room-lighting').select_option('warm')
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId');saved=api.get('/api/v2/3d-projects/'+pid).json()['scene']
    expected={'environmentPreset':'showroom','wallColor':'#bbccdd','floorMaterial':'oak','lightingPreset':'warm'}
    assert saved['displaySettings']==expected and saved['items'][0]['width']==320
    assert 'pricingWidthMm' not in saved['items'][0] and 'displaySettings' not in saved['items'][0]
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    page.wait_for_function('id=>MF_PLANNER.adapter.projectId===id',arg=pid)
    assert page.evaluate('MF_PLANNER.adapter.state.displaySettings')==expected
    assert export_payload(page)['items']==native
    panel(page,'left','items');expect(page.locator('#kitchen-cost')).to_contain_text('Расчёт цены требует прайс-листа')

def test_preview_failure_clears_old_texture_and_identity_survives_save(page,api,settings,admin_user):
    from tests.stage03.test_api import publish,login
    from tests.stage03.support import master
    from tests.webgl.material_checks import choose,render_state
    open_planner(page,api);owner=api.get('/api/v2/auth/me').json()['email'];login(api,admin_user['email'])
    publish(api,master([[a,'ЛДСП EGGER 18мм '+a,'кв.м',0,2800,2070,18,a.split()[1],'','M1','false',''] for a in ['H1180 ST37','F186 ST9','AU999 ST7']]),namespace='test.coverage')
    login(api,owner);report=api.get('/api/v2/catalogue/visual-coverage');assert report.status_code==200
    # The active release retains the two original synthetic materials in another namespace.
    assert report.json()['counts']=={'EXACT_TEXTURE':1,'OFFICIAL_PREVIEW':1,'COLOR_ONLY':0,'MISSING_VISUAL':3}
    assert {r['article'] for r in report.json()['needs_source']}=={'QA621 PO','621 PE','AU999 ST7'}
    panel(page,'left','catalog');page.locator('[data-bazis="bazis.3079d0656398"]').click()
    choose(page,'front','H1180 ST37');old=render_state(page)['parts']['door-1']['url'];assert old
    panel(page,'right');page.locator('#front-search').fill('AU999 ST7');page.locator('#front-results button').filter(has_text='AU999 ST7').first.click()
    page.wait_for_function('()=>{const p=MF_PLANNER;let ok=false;p.scene.entries.get(p.adapter.selected.item_id).group.traverse(m=>{if(m.userData.part?.key==="door-1")ok=m.material.map===null&&m.material.userData.visualStatus==="MISSING_VISUAL"});return ok}')
    expect(page.locator('#room-visual-notice')).to_contain_text('Без точного изображения')
    page.route('**/materials/egger-f186-st9.jpg',lambda route:route.abort())
    page.locator('#front-search').fill('F186 ST9');page.locator('#front-results button').filter(has_text='F186 ST9').first.click()
    page.wait_for_function('()=>{const p=MF_PLANNER;let ok=false;p.scene.entries.get(p.adapter.selected.item_id).group.traverse(m=>{if(m.userData.part?.key==="door-1")ok=m.material.map===null&&m.material.userData.visualStatus==="MISSING_VISUAL"});return ok}')
    front=page.evaluate('MF_PLANNER.adapter.selected.front_variant_id');close_panels(page)
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    saved=api.get('/api/v2/3d-projects/'+page.evaluate('MF_PLANNER.adapter.projectId')).json()['scene']
    assert saved['materialIdentities'][front]['article']=='F186 ST9' and saved['materialIdentities'][front]['manufacturer']=='EGGER'
    assert saved['materialIdentities'][front]['materialId']
