"""Client Scene Polish v2: real catalogue, WebGL and disposable ASGI persistence.
Presentation checks never replace production dimensions, materials or export.
"""
import io,json,math,os,statistics
from pathlib import Path
from PIL import Image,ImageStat
import pytest
from playwright.sync_api import expect
from tests.webgl.browser_checks import page,settings,api,admin_user,open_planner,OUT
from tests.webgl.navigation import panel,close_panels
from tests.webgl.kitchen_journey import choose,capture_viewport
from tests.webgl.polish_checks import export_payload
from tests.stage03.test_api import publish,login
from tests.stage03.support import master

DONORS=['bazis.0211e4f77fc4','bazis.3079d0656398','bazis.784bf9af84f8']
ARTICLES=['W1000 ST9','H1180 ST37','U999 ST7','F186 ST9','U708 ST9']

def row(page,api,admin_user):
    open_planner(page,api);owner=api.get('/api/v2/auth/me').json()['email'];login(api,admin_user['email'])
    publish(api,master([[a,'ЛДСП EGGER 18мм '+a,'кв.м',0,2800,2070,18,a.split()[1],'','M1','false',''] for a in ARTICLES]),namespace='test.client.polish')
    login(api,owner);panel(page,'left','catalog')
    for donor in DONORS:page.locator('[data-bazis="'+donor+'"]').click()
    panel(page,'right');page.locator('#material-scope').select_option('kitchen')
    for kind,article in [('body','W1000 ST9'),('front','H1180 ST37'),('plinth','U999 ST7'),('countertop','F186 ST9')]:choose(page,kind,article)
    page.locator('#material-scope').select_option('module');close_panels(page)
    page.locator('#mode-3d').click();page.locator('#reset-view').click()
    page.evaluate('MF_PLANNER.scene.render();MF_PLANNER.scene.renderer.getContext().finish()')

IDENTITY='''()=>{const p=MF_PLANNER;return {items:p.adapter.items,parts:p.adapter.items.map(it=>MF_FURNITURE_CORE.productionParts(it,p.adapter.template(it))),
  meshes:[...p.scene.entries.values()].flatMap(e=>{const a=[];e.group.traverse(m=>{if(m.isMesh)a.push([m.uuid,m.geometry.uuid,m.material.uuid,m.material.map?.uuid||null,m.material.userData.variantId,m.material.roughness,m.material.metalness])});return a}),
  runs:MF_FURNITURE_CORE.kitchenRuns(p.adapter.items,p.adapter.room),undo:p.history.undoStack.length};}'''

@pytest.mark.timeout(240)
def test_client_kitchen_composition_presets_selection_and_persistence(page,api,settings,admin_user):
    row(page,api,admin_user);before=page.evaluate(IDENTITY);native=export_payload(page)
    shot=lambda name:capture_viewport(page,OUT/('client-v2-'+name+'.png'))
    shot('01-technical-3d');technical=page.evaluate('MF_PLANNER.scene.captureView()')
    page.locator('#planner-client').click();expect(page.locator('#reset-view')).to_have_text('Показать всю кухню')
    page.locator('#planner-room-settings summary').click();expect(page.locator('#room-preset')).to_have_value('showroom')
    for preset,label in [('showroom','02-neutral-showroom'),('studio','03-light-studio'),('warm','04-warm-interior')]:
        page.locator('#room-preset').select_option(preset)
        page.locator('#planner-room-settings summary').click();page.locator('#reset-view').click()
        current=page.evaluate(IDENTITY)
        for key in ['items','parts','meshes','runs']:assert current[key]==before[key],key
        assert page.evaluate('MF_PLANNER.scene.renderer.shadowMap.autoUpdate') is False
        assert page.evaluate('MF_PLANNER.scene.scene.environment.isTexture')
        fit=page.evaluate('''()=>{const s=MF_PLANNER.scene,b=s.cameraBox('kitchen'),points=[];for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z])points.push(s.projectPoint({x:x*1000,y:y*1000,z:z*1000}));const r=s.canvas.getBoundingClientRect();return {points,r:{x:r.x,y:r.y,width:r.width,height:r.height},fov:s.perspective.fov};}''')
        assert fit['fov']==32
        assert all(fit['r']['x']+20<p['x']<fit['r']['x']+fit['r']['width']-20 and fit['r']['y']+40<p['y']<fit['r']['y']+fit['r']['height']-20 for p in fit['points'])
        if preset=='warm':
            floor=page.evaluate('''()=>{const s=MF_PLANNER.scene;return {planks:s.clientFloor.userData.plankSizeMm,scale:s.clientFloor.userData.scanSizeMm,anisotropy:s.floorTexture.anisotropy,max:s.renderer.capabilities.getMaxAnisotropy(),roughness:s.clientFloor.material.roughness};}''')
            assert floor['planks']==[190,1200] and floor['scale']==[1300,2800]
            assert 1<=floor['anisotropy']<=floor['max'] and floor['roughness']>=.8
        shot(label);page.locator('#planner-room-settings summary').click()
    page.locator('#room-preset').select_option('showroom');page.locator('#planner-room-settings summary').click()
    page.locator('#planner-front').click();shot('05-front')
    assert page.evaluate(IDENTITY)['items']==before['items']
    # Client click selects a real module, without a furniture drag/history command.
    p=page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.items[0];return p.scene.projectPoint({x:it.x,y:420,z:it.z+it.depth/2+20});}''')
    history=page.evaluate('MF_PLANNER.history.undoStack.length');page.mouse.click(p['x'],p['y'])
    assert page.evaluate('MF_PLANNER.adapter.selected.bazis_id')==DONORS[0]
    assert page.evaluate('MF_PLANNER.scene.selectedBox.visible')
    assert page.evaluate('MF_PLANNER.scene.selectedBox.material.opacity')<.4
    assert page.evaluate('MF_PLANNER.history.undoStack.length')==history
    assert page.evaluate(IDENTITY)['meshes']==before['meshes']
    page.locator('#mode-3d').click();pose=page.evaluate('MF_PLANNER.scene.camera.position.toArray()')
    box=page.locator('#scene').bounding_box();page.mouse.move(box['x']+box['width']*.8,box['y']+box['height']*.3);page.mouse.down();page.mouse.move(box['x']+box['width']*.75,box['y']+box['height']*.34,steps=8);page.mouse.up()
    assert page.evaluate('MF_PLANNER.scene.camera.position.toArray()')!=pose
    assert page.evaluate(IDENTITY)['items']==before['items']
    page.locator('#reset-view').click()
    # Changing the room never forces another camera fit after the user's orbit.
    page.locator('#planner-room-settings summary').click();pose=page.evaluate('MF_PLANNER.scene.camera.position.toArray()')
    page.locator('#room-wall-color').fill('#ddd6cc');page.locator('#room-floor').select_option('oak');page.locator('#room-lighting').select_option('neutral')
    assert page.evaluate('MF_PLANNER.scene.camera.position.toArray()')==pose
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId');saved=api.get('/api/v2/3d-projects/'+pid).json()['scene']
    assert saved['displaySettings']=={'environmentPreset':'showroom','wallColor':'#ddd6cc','floorMaterial':'oak','lightingPreset':'neutral'}
    page.locator('#planner-client').click();page.wait_for_function('MF_PLANNER.scene.mode==="3d"')
    restored=page.evaluate('MF_PLANNER.scene.captureView()')
    assert max(abs(a-b) for a,b in zip(restored['position'],technical['position']))<.001
    actual=export_payload(page)
    assert actual['items']==native['items'] and actual['kitchen_production']==native['kitchen_production']
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').filter(has_text=saved.get('name','Новый 3D-проект')).first.click()
    page.wait_for_function('id=>MF_PLANNER.adapter.projectId===id',arg=pid)
    assert page.evaluate('MF_PLANNER.adapter.state.displaySettings')==saved['displaySettings']
    assert export_payload(page)['items']==native['items']
    (OUT/'client-v2-acceptance.json').write_text(json.dumps({'success':True,'modules':DONORS,'screenshots':5,'furniture_identity_preserved':True,'native_export_preserved':True,'real_save_load':True,'settings':saved['displaySettings']},indent=2))

@pytest.mark.timeout(120)
def test_neutral_material_color_and_countertop_keep_real_article(page,api,settings,admin_user):
    row(page,api,admin_user);panel(page,'right');page.locator('#material-scope').select_option('kitchen');choose(page,'front','U708 ST9');close_panels(page)
    page.locator('#planner-client').click();page.locator('#planner-front').click()
    probes=page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.items[0],m=[];p.scene.entries.get(it.item_id).group.traverse(o=>{if(o.userData.part?.key==='door-1')m.push(o.material)});const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.drawImage(m[0].map.image,0,0,1,1);return {reference:[...ctx.getImageData(0,0,1,1).data].slice(0,3),points:[-.16,0,.16].map(dx=>p.scene.projectPoint({x:it.x+dx*1000,y:400,z:it.z+it.depth/2+20})),material:{source:m[0].map.image.getAttribute('src'),space:m[0].map.colorSpace,roughness:m[0].roughness,metalness:m[0].metalness},counter:p.scene.dressing.children.flatMap(g=>g.children.filter(m=>m.userData.role==='counter').map(m=>({article:m.userData.part.material.article,url:m.material.map?.image?.getAttribute('src')})))};}''')
    assert probes['material']['space']=='srgb' and probes['material']['metalness']==0 and probes['material']['roughness']>=.7
    assert probes['counter'] and all(c['article']=='F186 ST9' and c['url'].endswith('egger-f186-st9.jpg') for c in probes['counter'])
    result={'reference':probes['reference'],'material':probes['material']}
    for mode in ['NeutralToneMapping','ACESFilmicToneMapping']:
        page.evaluate('''async mode=>{const T=await import('/account/planner/vendor/three.module.js'),s=MF_PLANNER.scene;s.renderer.toneMapping=T[mode];s.render();s.renderer.getContext().finish();}''',mode)
        im=Image.open(io.BytesIO(page.screenshot())).convert('RGB');samples=[]
        for pt in probes['points']:
            x,y=round(pt['x']),round(pt['y']);samples.append(ImageStat.Stat(im.crop((x-3,y-3,x+4,y+4))).mean)
        mean=[statistics.mean(s[i] for s in samples) for i in range(3)]
        result[mode]={'renderedRGB':mean,'meanAbsoluteRGBError':statistics.mean(abs(a-b) for a,b in zip(mean,probes['reference']))}
    (OUT/'client-v2-color-comparison.json').write_text(json.dumps(result,indent=2))
    assert result['NeutralToneMapping']['meanAbsoluteRGBError']<=32,result
    assert result['NeutralToneMapping']['meanAbsoluteRGBError']<=result['ACESFilmicToneMapping']['meanAbsoluteRGBError']+2,result

@pytest.mark.timeout(120)
def test_twenty_pilot_modules_same_benchmark_and_orbit_frame_budget(page,api,settings,admin_user):
    from tests.webgl.client_pricing_checks import test_client_room_twenty_pilot_modules_render_budget
    test_client_room_twenty_pilot_modules_render_budget(page,api,settings,admin_user)
    current=json.loads((OUT/'client-performance.json').read_text());baseline_file=OUT/'baseline/client-performance.json'
    baseline=json.loads(baseline_file.read_text()) if baseline_file.exists() else None
    if baseline:
        current['baseline']=baseline;current['clientRatio']=current['client']['medianMs']/baseline['client']['medianMs']
    # Measure GPU-completed orbit frames at the same viewport. This is a render
    # regression budget, not a claim about a user's monitor or device FPS.
    frames=page.evaluate('''async()=>{const s=MF_PLANNER.scene,gl=s.renderer.getContext(),times=[],v=s.camera.position.clone().sub(s.controls.target);for(let i=0;i<36;i++){await new Promise(requestAnimationFrame);const t=performance.now();const a=.0025;s.camera.position.copy(s.controls.target).add(v);const x=v.x;v.x=x*Math.cos(a)-v.z*Math.sin(a);v.z=x*Math.sin(a)+v.z*Math.cos(a);s.camera.lookAt(s.controls.target);s.renderer.render(s.scene,s.camera);gl.finish();if(i>=6)times.push(performance.now()-t);}return times.sort((a,b)=>a-b);}''')
    current['orbit']={'medianMs':statistics.median(frames),'p95Ms':frames[int(len(frames)*.95)],'samples':frames}
    (OUT/'client-v2-performance.json').write_text(json.dumps(current,indent=2))
    assert current['client']['medianMs']<12,current
    if baseline:assert current['client']['medianMs']<=max(baseline['client']['medianMs']*1.35,baseline['client']['medianMs']+1.5),current
    assert current['orbit']['p95Ms']<33.4,current
