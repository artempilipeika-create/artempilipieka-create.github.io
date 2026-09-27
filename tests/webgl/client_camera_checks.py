"""Presentation evidence on the accepted three donors; production stays exact."""
import json,os
import pytest
from playwright.sync_api import expect
from tests.webgl.client_scene_checks import page,api,settings,admin_user,row,IDENTITY
from tests.webgl.browser_checks import OUT
from tests.webgl.navigation import panel,close_panels
from tests.webgl.kitchen_journey import capture_viewport,choose

METRICS='''()=>{const p=MF_PLANNER,s=p.scene,b=s.cameraBox('kitchen'),points=[];for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z])points.push(s.projectPoint({x:x*1000,y:y*1000,z:z*1000}));const r=s.canvas.getBoundingClientRect(),v=s.clientFit?.viewport||{left:16,top:70,width:r.width-32,height:r.height-86};const left=Math.min(...points.map(p=>p.x))-r.left,right=Math.max(...points.map(p=>p.x))-r.left,top=Math.min(...points.map(p=>p.y))-r.top,bottom=Math.max(...points.map(p=>p.y))-r.top;return {fov:s.perspective.fov,viewport:v,canvas:{width:r.width,height:r.height},bounds:{left,right,top,bottom},widthFraction:(right-left)/v.width,heightFraction:(bottom-top)/v.height,centerError:Math.abs((left+right)/2-v.left-v.width/2),frame:s.clientFit||null};}'''

@pytest.mark.timeout(120)
def test_record_accepted_camera(page,api,settings,admin_user):
    row(page,api,admin_user);page.set_viewport_size({'width':1440,'height':900})
    page.evaluate('MF_PLANNER.scene.fit("room")');panel(page,'left','catalog')
    capture_viewport(page,OUT/'v3-before-room.png')
    before={'room':page.evaluate(METRICS)}
    page.locator('#planner-client').click();page.wait_for_function('MF_PLANNER.scene.client')
    page.locator('#reset-view').click();capture_viewport(page,OUT/'v3-before-client-3d.png')
    before['client']=page.evaluate(METRICS)
    (OUT/'v3-before-camera.json').write_text(json.dumps(before,indent=2))

@pytest.mark.timeout(180)
def test_client_v3_presentation_occupancy_views_and_panels(page,api,settings,admin_user):
    row(page,api,admin_user);page.set_viewport_size({'width':1440,'height':900})
    page.locator('#reset-view').click();capture_viewport(page,OUT/'client-v3-A-technical.png')
    original=page.evaluate(IDENTITY);technical=page.evaluate('MF_PLANNER.scene.captureView()')
    # Start from the user's problematic room composition with the catalogue open.
    page.evaluate('MF_PLANNER.scene.fit("room")');panel(page,'left','catalog')
    page.locator('#planner-client').click()
    expect(page.locator('#mode-3d')).to_have_text('Клиентский 3D')
    expect(page.locator('#planner-front')).to_have_text('Фасадный')
    expect(page.locator('#workspace-library')).not_to_be_visible()
    page.wait_for_function('MF_PLANNER.scene.clientFit?.view==="threeQuarter"')
    evidence={}
    def frame(name):
        page.evaluate('MF_PLANNER.scene.render()');m=page.evaluate(METRICS)
        assert m['fov']==36 and .65<=m['widthFraction']<=.80,m
        assert m['heightFraction']<=.825 and m['centerError']<1,m
        v,b=m['viewport'],m['bounds']
        assert v['left']<=b['left']<b['right']<=v['left']+v['width'],m
        assert v['top']<=b['top']<b['bottom']<=v['top']+v['height'],m
        evidence[name]=m;capture_viewport(page,OUT/('client-v3-'+name+'.png'))
    frame('B-client-3d')
    depth=page.evaluate('''()=>{const s=MF_PLANNER.scene,c=s.dressing.children.flatMap(g=>g.children).find(m=>m.userData.role==='counter'),b=c.geometry.boundingBox,front=b.max.clone(),back=b.max.clone();front.x=back.x=0;back.z=b.min.z;const project=v=>{c.localToWorld(v);return s.projectPoint({x:v.x*1000,y:v.y*1000,z:v.z*1000});};return project(front).y-project(back).y;}''')
    assert depth>25,depth
    evidence['B-client-3d']['countertopDepthPx']=depth
    page.locator('#planner-front').click();frame('C-client-front')
    expect(page.locator('#planner-front')).to_have_attribute('aria-pressed','true')
    page.locator('#mode-3d').click();frame('D-wood-facades')
    assert page.evaluate(IDENTITY)['items']==original['items']
    assert page.evaluate(IDENTITY)['parts']==original['parts']
    assert page.evaluate(IDENTITY)['meshes']==original['meshes']
    for width,height in [(1366,768),(1920,1080)]:
        page.set_viewport_size({'width':width,'height':height});page.locator('#reset-view').click();frame(str(width)+'-laptop')
    page.set_viewport_size({'width':1440,'height':900})
    # The room panel really covers canvas pixels. Fit uses its uncovered area.
    page.locator('#planner-room-settings summary').click();page.locator('#reset-view').click();frame('room-panel')
    assert evidence['room-panel']['viewport']['left']>200
    pose=page.evaluate('MF_PLANNER.scene.camera.position.toArray()')
    page.locator('#room-wall-color').fill('#ddd6cc')
    assert page.evaluate('MF_PLANNER.scene.camera.position.toArray()')==pose
    page.locator('#planner-room-settings summary').click()
    # Raycaster must follow the off-centre perspective too.
    target=page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.items[0];return p.scene.projectPoint({x:it.x,y:420,z:it.z+it.depth/2+20});}''')
    page.mouse.click(target['x'],target['y']);assert page.evaluate('MF_PLANNER.adapter.selected.bazis_id')=='bazis.0211e4f77fc4'
    page.locator('#planner-client').click();panel(page,'right');page.locator('#material-scope').select_option('kitchen');choose(page,'front','W1000 ST9');close_panels(page)
    page.locator('#planner-room-settings summary').click();page.locator('#room-preset').select_option('showroom');page.locator('#planner-room-settings summary').click()
    page.locator('#planner-client').click();page.locator('#reset-view').click();frame('E-light-facades')
    # Different room dimensions cannot determine a kitchen camera distance.
    distance=page.evaluate('MF_PLANNER.scene.clientFit.distance')
    page.evaluate('''()=>{const p=MF_PLANNER,s=p.bridge.snapshot();s.scene.room={width:8000,depth:8000,height:3600};p.bridge.restore(s);p.scene.fitKitchenForClient();}''')
    assert abs(page.evaluate('MF_PLANNER.scene.clientFit.distance')-distance)<.001
    # Opposite wall orientations still face the same production fronts.
    for rotation in [90,180,270]:
        page.evaluate('''r=>{const p=MF_PLANNER,s=p.bridge.snapshot();for(let i=0;i<s.scene.items.length;i++){const v=MF_FURNITURE_CORE.rotateXZ(i*600,0,r);Object.assign(s.scene.items[i],{x:v.x,z:v.z,rotation:r});}p.bridge.restore(s);p.scene.fitKitchenForClient();}''',rotation)
        frame('rotation-'+str(rotation))
    # A new room is applied before old meshes are pruned. Bulk outlines must
    # tolerate that short transition, including undo/restore to an empty room.
    assert page.evaluate('MF_PLANNER.scene.selectionScope')=='kitchen'
    page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.createDraft({bazis:'bazis.3079d0656398'});p.bridge.restore({name:'Fresh room',scene:{schema_version:2,room:{width:4200,depth:3200,height:2700},items:[it],selected_item_id:it.item_id,view_mode:'3d'},selectedId:it.item_id});}''')
    assert page.evaluate('''()=>{const p=MF_PLANNER;return p.scene.entries.size===1&&p.scene.entries.has(p.adapter.items[0].item_id)&&[...p.scene.kitchenBoxes.values()].filter(b=>b.visible).length===1;}''')
    page.evaluate('''()=>{const p=MF_PLANNER,s=p.bridge.snapshot();s.scene.room.width=4600;s.scene.items=[];s.scene.selected_item_id=s.selectedId=null;p.bridge.restore(s);}''')
    assert page.evaluate('MF_PLANNER.scene.entries.size===0&&MF_PLANNER.scene.kitchenBoxes.size===0')
    (OUT/'client-v3-camera.json').write_text(json.dumps({'success':True,'commit':os.environ.get('GITHUB_SHA'),'measurements':evidence},indent=2))
