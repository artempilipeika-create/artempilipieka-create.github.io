"""Release gates on actual committed UI + real isolated ASGI/Postgres, no live writes."""
from pathlib import Path
import json
import pytest
from playwright.sync_api import expect
from tests.webgl.browser_checks import page,api,settings,admin_user,open_planner,seed,point,screenshot


def restore_items(page,items):
    page.evaluate('''specs=>{const p=MF_PLANNER,s=p.bridge.snapshot();s.scene.items=specs.map(spec=>Object.assign(p.adapter.createDraft({template:spec.template}),spec));s.selectedId=s.scene.items.at(-1).item_id;s.scene.selected_item_id=s.selectedId;p.bridge.restore(s);p.history.reset();}''',items)


def test_public_constructor_is_same_webgl_and_has_no_shader_or_script_errors(page,api,settings,admin_user):
    errors=[]
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' or 'VALIDATE_STATUS' in m.text or 'GL_INVALID' in m.text else None)
    open_planner(page,api)
    page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-renderer','webgl',timeout=20000)
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    seed(page,13)
    for selector in ['#mode-2d','#planner-front','#mode-3d']:
        page.locator(selector).click()
        page.evaluate('MF_PLANNER.scene.render()')
    assert page.evaluate('MF_PLANNER.scene.renderer.getContext().getError()')==0
    assert not errors,errors
    assert api.get('/constructor').content==api.get('/constructor-next').content
    assert page.evaluate('MF_PLANNER.bridge.rendererState()')=={'legacyLoopEnabled':False,'legacyPointerEnabled':False}


def test_raycaster_selects_visible_front_surface_not_the_hidden_module(page,api,settings,admin_user):
    open_planner(page,api)
    restore_items(page,[{'template':'base.two_door','x':0,'z':-500,'name':'Сзади'}, {'template':'base.two_door','x':0,'z':500,'name':'Спереди'}])
    page.locator('#planner-front').click()
    page.evaluate('MF_PLANNER.adapter.select(MF_PLANNER.adapter.items[0].item_id)')
    hit=point(page,1)
    assert page.evaluate('(p)=>MF_PLANNER.scene.pick(p.x,p.y).id===MF_PLANNER.adapter.items[1].item_id',hit)
    page.mouse.click(hit['x'],hit['y'])
    assert page.evaluate('MF_PLANNER.adapter.selected.name')=='Спереди'
    page.locator('#scene').focus();page.keyboard.press('Delete')
    assert page.evaluate('MF_PLANNER.adapter.items.length')==1
    page.keyboard.press('Control+z');assert page.evaluate('MF_PLANNER.adapter.items.length')==2
    page.keyboard.press('Control+Shift+z');assert page.evaluate('MF_PLANNER.adapter.items.length')==1


def test_installed_cabinet_wall_snap_ghost_and_stationary_camera(page,api,settings,admin_user):
    open_planner(page,api)
    restore_items(page,[{'template':'base.drawers_3','x':0,'z':0}])
    page.locator('#mode-2d').click();page.locator('#planner-fit-room').click()
    start=point(page)
    target=page.evaluate('MF_PLANNER.scene.projectPoint({x:0,y:720,z:-1302})')
    camera=page.evaluate('MF_PLANNER.scene.camera.position.toArray()')
    page.mouse.move(start['x'],start['y']);page.mouse.down();page.mouse.move(target['x'],target['y'],steps=10)
    assert page.evaluate('MF_PLANNER.adapter.items[0].z')==0
    assert page.evaluate('Boolean(MF_PLANNER.scene.preview)')
    expect(page.locator('#planner-feedback')).to_contain_text('К стене')
    assert page.evaluate('MF_PLANNER.scene.camera.position.toArray()')==camera
    screenshot(page,'webgl-wall-snap-ghost')
    page.mouse.up()
    assert page.evaluate('MF_PLANNER.adapter.items[0].z')==-1320
    assert page.evaluate('MF_PLANNER.adapter.items[0].rotation')==0
    assert page.evaluate('MF_PLANNER.history.undoStack.length')==1


def test_vertical_and_hidden_collisions_are_checked_in_browser(page,api,settings,admin_user):
    open_planner(page,api)
    restore_items(page,[{'template':'base.two_door','x':0,'z':0}, {'template':'wall.two_door','x':0,'z':0}])
    assert page.evaluate('MF_PLANNER.adapter.validate(MF_PLANNER.adapter.items[1])')==''
    restore_items(page,[{'template':'tall.one_door','x':0,'z':0}, {'template':'wall.two_door','x':1300,'z':0}])
    page.locator('#planner-layer').select_option('wall')
    assert page.evaluate('MF_PLANNER.scene.entries.get(MF_PLANNER.adapter.items[0].item_id).group.visible') is False
    page.locator('#pos-x').fill('0');page.locator('#pos-x').press('Tab')
    expect(page.locator('#status')).to_contain_text('Пересечение')
    assert page.evaluate('MF_PLANNER.adapter.items[1].x')==1300
    assert page.evaluate('MF_PLANNER.adapter.items.length')==2


def test_context_recovery_preserves_unsaved_history_and_original_project_ids(page,api,settings,admin_user):
    open_planner(page,api)
    page.locator('[data-template="base.drawers_3"]').click()
    page.locator('#width').fill('650');page.locator('#width').press('Tab')
    before=page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')
    page.evaluate('MF_PLANNER.scene.renderer.forceContextLoss()')
    expect(page.locator('body')).to_have_attribute('data-planner-renderer','fallback')
    assert page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')==before
    page.locator('#planner-undo').click();expect(page.locator('#width')).to_have_value('600')
    page.locator('#planner-redo').click();expect(page.locator('#width')).to_have_value('650')
    page.locator('#planner-retry').click()
    expect(page.locator('body')).to_have_attribute('data-planner-renderer','webgl',timeout=20000)
    assert page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')==before
    assert page.locator('.mf3d-canvas-wrap canvas').count()==1
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    page.locator('#tab-projects').click();page.locator('#projects .mf3d-project').first.click()
    expect(page.locator('#width')).to_have_value('650')


def test_initial_webgl_unavailable_keeps_edit_save_and_undo_available(page,api,settings,admin_user):
    page.add_init_script('''(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return ['webgl','webgl2','experimental-webgl'].includes(type)?null:original.call(this,type,...args);};})();''')
    from tests.stage07.browser_checks import searchable_catalogue_order,login_ui
    _,email,_=searchable_catalogue_order(api);login_ui(page,email)
    page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-renderer','fallback',timeout=20000)
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    page.locator('[data-template="base.drawers_3"]').click()
    page.locator('#width').fill('650');page.locator('#width').press('Tab')
    page.locator('#planner-undo').click();expect(page.locator('#width')).to_have_value('600')
    page.locator('#planner-redo').click();expect(page.locator('#width')).to_have_value('650')
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    assert page.locator('.mf3d-canvas-wrap canvas').count()==1
    assert page.evaluate('MF_PLANNER.adapter.items.length')==1


@pytest.mark.parametrize('width,height,label',[(1600,1000,'desktop'),(1024,768,'tablet'),(390,844,'mobile')])
def test_bounded_release_viewport_and_large_kitchen_framing(page,api,settings,admin_user,width,height,label):
    open_planner(page,api);seed(page,13)
    page.set_viewport_size({'width':width,'height':height})
    page.locator('#reset-view').click()
    page.evaluate('MF_PLANNER.scene.resize();MF_PLANNER.scene.fit("kitchen");MF_PLANNER.scene.render()')
    assert page.evaluate('document.documentElement.scrollHeight<=innerHeight+1')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    occupied=page.evaluate('''()=>{const p=MF_PLANNER,b=p.scene.cameraBox('kitchen'),xs=[],ys=[],S=1000;for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z]){const s=p.scene.projectPoint({x:x*S,y:y*S,z:z*S});xs.push(s.x);ys.push(s.y);}return {x:(Math.max(...xs)-Math.min(...xs))/p.scene.width,y:(Math.max(...ys)-Math.min(...ys))/p.scene.height};}''')
    assert .55<max(occupied.values())<.98,occupied
    screenshot(page,'webgl-release-'+label)


def test_facade_and_native_metadata_survive_nonzero_placement(page,api,settings,admin_user):
    open_planner(page,api)
    page.locator('[data-template="base.two_door"]').click()
    assert page.evaluate('MF_PLANNER.adapter.facades(MF_PLANNER.adapter.selected).every(f=>f.w===397)')
    page.locator('#remove-item').click()
    page.locator('[data-bazis="bazis.460987c9a8e8"]').click()
    for selector,value in [('#pos-z','100'),('#pos-x','350')]:
        page.locator(selector).fill(value);page.locator(selector).press('Tab')
    page.locator('#rotation').select_option('90')
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    it=page.evaluate('({...MF_PLANNER.adapter.selected})')
    with page.expect_download() as d:page.locator('#export-bazis').click()
    payload=json.loads(Path(d.value.path()).read_text());native=payload['items'][0]
    assert native['bazis_id']==it['bazis_id']
    assert native['source_file']==it['bazis_file']
    assert native['source_sha256']==it['bazis_sha256']
    assert native['elastic_resize']==it['bazis_resize']
    assert native['target']=={k:it[k] for k in ['width','height','depth']}
    assert native['position']['x']==350 and native['position']['z']==100 and native['rotation']==90
    assert payload['format']=='martin-forest-bazis-native-v2' and payload['facade_gap_mm']==1.5
