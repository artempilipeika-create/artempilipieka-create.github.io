"""Chromium with the real application and disposable test Postgres; never live writes."""
from pathlib import Path
import json, os
import pytest
from playwright.sync_api import expect
from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui,searchable_catalogue_order

OUT=Path(os.environ.get('MF_TEST_EVIDENCE_DIR','qa-output/webgl'))

def open_planner(page,api):
    o,email,_=searchable_catalogue_order(api);login_ui(page,email)
    page.goto('https://testserver/constructor-next')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=20000)
    expect(page.locator('body')).to_have_attribute('data-planner-renderer','webgl')
    return o

def seed(page,count=13):
    page.evaluate('''n=>{
      const p=window.MF_PLANNER,b=p.bridge,items=[];
      let room={width:6200,depth:3600,height:2700};
      if(n===13){
        for(let i=0;i<6;i++){
          const a=p.adapter.createDraft({template:i%2?'base.two_door':'base.drawers_3'});
          Object.assign(a,{width:600,x:-2100+i*600,z:-1500,name:'Нижний '+(i+1)});items.push(a);
          const u=p.adapter.createDraft({template:'wall.two_door'});Object.assign(u,{width:600,x:-2100+i*600,z:-1600,name:'Верхний '+(i+1)});items.push(u);
        }
        const tall=p.adapter.createDraft({template:'tall.one_door'});Object.assign(tall,{x:1650,z:-1500,name:'Пенал'});items.push(tall);
      }else{
        room={width:12000,depth:12000,height:2700};
        for(let i=0;i<n;i++){const a=p.adapter.createDraft({template:'base.drawers_3'});Object.assign(a,{x:(i%10-4.5)*900,z:(Math.floor(i/10)-4.5)*900,name:'Модуль '+(i+1)});items.push(a);}
      }
      b.restore({name:'Кухня · проверка WebGL',scene:{schema_version:2,room,items,selected_item_id:items[0]?.item_id||null,view_mode:'3d'},selectedId:items[0]?.item_id||null});
      p.history.reset();p.scene.fit('kitchen');
    }''',count)

def point(page,item_index=0):
    return page.evaluate('''index=>{const p=MF_PLANNER,it=p.adapter.items[index];
      const y=it.module_type==='wall_cabinet'?p.adapter.room.height-it.height-500:0;
      return p.scene.projectPoint({x:it.x,y:y+it.height/2,z:it.z+it.depth/2+20});
    }''',item_index)

def screenshot(page,name):
    OUT.mkdir(parents=True,exist_ok=True);page.wait_for_timeout(200);page.screenshot(path=str(OUT/(name+'.png')),full_page=True)

def test_empty_webgl_route_and_static_boundary(page,api,settings,admin_user):
    open_planner(page,api)
    expect(page.locator('#studio-empty-scene')).to_be_visible()
    assert page.locator('.mf3d-canvas-wrap canvas').count()==1
    assert page.evaluate('MF_PLANNER_BRIDGE.rendererState()')=={'legacyLoopEnabled':False,'legacyPointerEnabled':False}
    assert page.evaluate("document.getElementById('scene').getContext('2d')===null")
    assert api.get('/account/planner/vendor/three.module.js').status_code==200
    assert api.get('/account/planner/vendor/OrbitControls.js').status_code==200
    assert api.get('/account/planner/not-allowed.mjs').status_code==404
    assert api.get('/account/planner/%2e%2e/%2e%2e/config.py').status_code==404
    assert api.get('/account/planner/vendor/package-lock.json').status_code==404
    assert api.get('/mf-private').status_code==404
    screenshot(page,'webgl-empty-desktop')

def test_add_pick_surface_resize_rotation_and_history(page,api,settings,admin_user):
    open_planner(page,api)
    page.locator('[data-template="base.drawers_3"]').click()
    expect(page.locator('#item-badge')).to_have_text('1 модуль')
    hit=point(page);page.mouse.click(hit['x'],hit['y'])
    assert page.evaluate('MF_PLANNER.adapter.selected.item_id===MF_PLANNER.adapter.items[0].item_id')
    camera=page.evaluate('MF_PLANNER.scene.camera.position.toArray()')
    page.locator('#width').fill('650');page.locator('#width').press('Tab')
    assert page.evaluate('MF_PLANNER.adapter.selected.width')==650
    assert page.evaluate('MF_PLANNER.scene.camera.position.toArray()')==camera
    page.locator('#planner-undo').click();expect(page.locator('#width')).to_have_value('600')
    page.locator('#planner-redo').click();expect(page.locator('#width')).to_have_value('650')
    # Move away from walls, then rotate using the actual inspector control.
    page.locator('#pos-z').fill('0');page.locator('#pos-z').press('Tab')
    for angle in (90,180,270,0):
        page.locator('#studio-rotate').click()
        assert page.evaluate('MF_PLANNER.adapter.selected.rotation')==angle
    page.locator('#duplicate-item').click();expect(page.locator('#item-badge')).to_have_text('2 модуля')
    page.locator('#remove-item').click();expect(page.locator('#item-badge')).to_have_text('1 модуль')
    page.locator('#planner-undo').click();expect(page.locator('#item-badge')).to_have_text('2 модуля')

def test_real_drag_is_preview_then_one_undo_and_invalid_drop_keeps_position(page,api,settings,admin_user):
    open_planner(page,api)
    page.evaluate('''()=>{const p=MF_PLANNER,s=p.bridge.snapshot();s.scene.items=[0,1300].map((x,i)=>Object.assign(p.adapter.createDraft({template:'base.drawers_3'}),{x,z:0,name:'Шкаф '+i}));s.selectedId=s.scene.items[1].item_id;s.scene.selected_item_id=s.selectedId;p.bridge.restore(s);p.history.reset();}''')
    page.locator('#mode-2d').click()
    start=point(page,1)
    target=page.evaluate("MF_PLANNER.scene.projectPoint({x:620,y:360,z:300})")
    before=page.evaluate('JSON.stringify(MF_PLANNER.adapter.state.items)')
    page.mouse.move(start['x'],start['y']);page.mouse.down();page.mouse.move(target['x'],target['y'],steps=8)
    assert page.evaluate('JSON.stringify(MF_PLANNER.adapter.state.items)')==before
    assert page.evaluate('Boolean(MF_PLANNER.scene.preview)')
    expect(page.locator('#planner-feedback')).to_contain_text('0 мм')
    page.mouse.up()
    assert page.evaluate('MF_PLANNER.adapter.items[1].x')==600
    assert page.evaluate('MF_PLANNER.history.undoStack.length')==1
    page.locator('#planner-undo').click();assert page.evaluate('MF_PLANNER.adapter.items[1].x')==1300
    page.locator('#planner-redo').click();assert page.evaluate('MF_PLANNER.adapter.items[1].x')==600
    start=point(page,1);target=point(page,0)
    page.mouse.move(start['x'],start['y']);page.mouse.down();page.mouse.move(target['x'],target['y'],steps=8)
    expect(page.locator('#planner-feedback')).to_contain_text('Пересечение')
    page.mouse.up();assert page.evaluate('MF_PLANNER.adapter.items[1].x')==600
    start=point(page,1);page.mouse.move(start['x'],start['y']);page.mouse.down();page.mouse.move(start['x']+50,start['y']+30,steps=5);page.keyboard.press('Escape');page.mouse.up()
    assert page.evaluate('MF_PLANNER.adapter.items[1].x')==600
    assert page.evaluate('MF_PLANNER.scene.controls.enabled') is True

def test_native_catalogue_drag_and_cancel(page,api,settings,admin_user):
    open_planner(page,api)
    card=page.locator('[data-template="base.drawers_3"]');card.scroll_into_view_if_needed()
    data=page.evaluate_handle('new DataTransfer()')
    card.dispatch_event('dragstart',{'dataTransfer':data})
    box=page.locator('#scene').bounding_box();event={'dataTransfer':data,'clientX':box['x']+box['width']/2,'clientY':box['y']+box['height']*.60}
    page.locator('#scene').dispatch_event('dragover',event)
    assert page.evaluate('MF_PLANNER.adapter.items.length')==0
    assert page.evaluate('Boolean(MF_PLANNER.scene.preview)')
    page.locator('#scene').dispatch_event('drop',event)
    assert page.evaluate('MF_PLANNER.adapter.items.length')==1
    card.dispatch_event('dragstart',{'dataTransfer':data});page.locator('#scene').dispatch_event('dragover',event)
    page.keyboard.press('Escape')
    assert page.evaluate('MF_PLANNER.adapter.items.length')==1
    assert page.evaluate('MF_PLANNER.scene.controls.enabled') is True
    data.dispose()

def test_native_export_and_real_save_reopen_duplicate_share(page,api,settings,admin_user):
    open_planner(page,api)
    page.locator('[data-bazis="bazis.460987c9a8e8"]').click()
    page.locator('#width').fill('150');page.locator('#width').press('Tab')
    page.locator('#body-search').fill('QA621 PO');page.locator('#body-results button').first.click()
    page.locator('#front-search').fill('621 PE');page.locator('#front-results button').first.click()
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId');saved=api.get('/api/v2/3d-projects/'+pid).json()
    it=saved['scene']['items'][0];assert it['width']==150 and 'elevation_mm' not in it
    assert it['bazis_file']=='НМД1-200. Карго.fr3d'
    page.locator('#tab-projects').click();page.locator('#projects .mf3d-project').first.click();expect(page.locator('#width')).to_have_value('150')
    with page.expect_download() as download:page.locator('#export-bazis').click()
    payload=json.loads(Path(download.value.path()).read_text());native=payload['items'][0]
    assert payload['format']=='martin-forest-bazis-native-v2' and payload['facade_gap_mm']==1.5
    assert native['source_file']==it['bazis_file'] and native['source_sha256']==it['bazis_sha256']
    assert native['position']['x']==it['x'] and native['position']['z']==it['z'] and native['rotation']==it['rotation']
    assert native['target']=={'width':150,'height':720,'depth':560}
    page.locator('#duplicate-project').click();expect(page.locator('#projects .mf3d-project')).to_have_count(2)
    page.locator('#share-project').click();expect(page.locator('#share-panel')).to_be_visible()
    url=page.locator('#share-url').input_value();page.goto(url)
    expect(page.locator('#readonly-label')).to_contain_text('Только просмотр')
    assert api.get('/api/v2/3d-projects/'+pid+'/specification.pdf').content.startswith(b'%PDF-')

@pytest.mark.parametrize('count',[13,30,100])
def test_kitchen_size_visibility_save_and_framing(page,api,settings,admin_user,count):
    open_planner(page,api);seed(page,count)
    assert page.evaluate('MF_PLANNER.scene.entries.size')==count
    assert page.evaluate('MF_PLANNER.scene.renderer.info.memory.geometries')<30
    page.locator('#planner-layer').select_option('wall')
    assert page.evaluate('MF_PLANNER.adapter.items.length')==count
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId');assert len(api.get('/api/v2/3d-projects/'+pid).json()['scene']['items'])==count
    page.locator('#planner-layer').select_option('all');page.locator('#planner-front').click()
    assert page.evaluate('MF_PLANNER.scene.camera.isOrthographicCamera') is True
    page.locator('#mode-3d').click();assert page.evaluate('MF_PLANNER.scene.camera.isPerspectiveCamera') is True
    if count==13:
        page.set_viewport_size({'width':1600,'height':1000});page.locator('#reset-view').click();screenshot(page,'webgl-kitchen-desktop')
        page.locator('#planner-client').click();screenshot(page,'webgl-client-view');page.locator('#planner-client').click()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')

def test_context_loss_keeps_unsaved_scene_and_undo(page,api,settings,admin_user):
    open_planner(page,api);seed(page,13)
    before=page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')
    page.evaluate('MF_PLANNER.scene.renderer.forceContextLoss()')
    expect(page.locator('body')).to_have_attribute('data-planner-renderer','fallback')
    assert page.locator('.mf3d-canvas-wrap canvas').count()==1
    assert page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')==before
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    screenshot(page,'webgl-context-loss-fallback')

def test_mobile_panels_selection_and_screenshot(page,api,settings,admin_user):
    open_planner(page,api);seed(page,13)
    page.set_viewport_size({'width':390,'height':844});page.locator('#reset-view').click()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    screenshot(page,'webgl-kitchen-mobile')
    page.locator('#planner-mobile-catalog').click();expect(page.locator('.mf3d-left')).to_be_visible()
    screenshot(page,'webgl-catalog-mobile')
    page.locator('#planner-mobile-inspector').click();expect(page.locator('.mf3d-right')).to_be_visible();expect(page.locator('.mf3d-left')).to_be_hidden()
    screenshot(page,'webgl-inspector-mobile')
    page.locator('#planner-mobile-inspector').click();expect(page.locator('.mf3d-right')).to_be_hidden()
    page.locator('#planner-mobile-items').click();expect(page.locator('#pane-items')).to_be_visible()
    page.locator('#scene-items .mf3d-project').first.click()
    page.locator('#planner-mobile-items').click()
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')


def test_top_controls_survive_async_inspector_refresh(page,api,settings,admin_user):
    open_planner(page,api);seed(page,13)
    page.locator('#mode-2d').click()
    page.evaluate('MF_PLANNER.bridge.refresh()')
    expect(page.locator('#studio-zoom-in')).to_be_enabled()
    expect(page.locator('#studio-zoom-out')).to_be_enabled()
    expect(page.locator('#mode-2d')).to_have_attribute('aria-pressed','true')
    page.locator('#planner-front').click();page.evaluate('MF_PLANNER.bridge.refresh()')
    expect(page.locator('#planner-front')).to_have_attribute('aria-pressed','true')
    expect(page.locator('#mode-3d')).to_have_attribute('aria-pressed','false')


def test_new_project_cancels_active_drag_without_resurrecting_old_scene(page,api,settings,admin_user):
    open_planner(page,api);seed(page,13);page.locator('#mode-2d').click()
    start=point(page,0);page.mouse.move(start['x'],start['y']);page.mouse.down()
    page.mouse.move(start['x']+35,start['y']+20,steps=5)
    assert page.evaluate('Boolean(MF_PLANNER.interaction.gesture)')
    page.evaluate('MF_PLANNER.bridge.newProject()');page.mouse.up()
    expect(page.locator('#studio-empty-scene')).to_be_visible()
    assert page.evaluate('MF_PLANNER.adapter.items.length')==0
    assert page.evaluate('MF_PLANNER.history.undoStack.length')==0
    assert page.evaluate('MF_PLANNER.scene.controls.enabled') is True
