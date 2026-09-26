"""Height persistence and native export regression against real ASGI/Postgres."""
import json
from pathlib import Path
import pytest
from playwright.sync_api import expect
from tests.webgl.browser_checks import page,settings,api,admin_user,open_planner,screenshot
from tests.webgl.navigation import panel,close_panels,add_legacy

def test_only_three_real_modules_are_available_in_catalogue(page,api,settings,admin_user):
    open_planner(page,api);panel(page,'left','catalog')
    assert page.locator('#module-catalogue .mf3d-module strong').all_text_contents()==['Д1 L','Д1 P','Д2']
    assert page.locator('#module-catalogue [data-template],#module-catalogue [data-module]').count()==0
    page.locator('#module-search').fill('Д1 P')
    expect(page.locator('#module-catalogue .mf3d-module:visible')).to_have_count(1)
    page.locator('#module-search').fill('')
    expect(page.locator('#module-catalogue .mf3d-module:visible')).to_have_count(3)


def edit(page,key,value):
    panel(page,'right');page.locator('#'+key).fill(str(value));page.locator('#'+key).press('Tab')

def state(page):
    return page.evaluate('''()=>({item:MF_PLANNER.adapter.selected,
      heights:MF_FURNITURE_CORE.heights(MF_PLANNER.adapter.selected),
      fronts:MF_PLANNER.scene.entries.get(MF_PLANNER.adapter.selected.item_id).group.children.filter(x=>x.userData.facade).map(x=>x.userData.facade)})''')

@pytest.mark.parametrize('width',[1440,390])
def test_separate_heights_save_close_reopen_no_mobile_jump(page,api,settings,admin_user,width):
    page.set_viewport_size({'width':width,'height':900});open_planner(page,api)
    panel(page,'left','catalog');add_legacy(page,{'template':'base.two_door'})
    assert state(page)['heights']==dict(body_height=720,base_height=100,module_height=820,worktop_thickness=38,overall_height_with_worktop=858)
    edit(page,'base-height',120);edit(page,'body-height',750);edit(page,'worktop-thickness',40)
    before=state(page);assert before['item']['height']==870
    assert before['heights']['overall_height_with_worktop']==910
    close_panels(page);page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId')
    assert api.get('/api/v2/3d-projects/'+pid).json()['scene']['items'][0]['body_height']==750
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    expect(page.locator('#height')).to_have_value('870')
    after=state(page)
    for key in ['height','body_height','base_height','worktop_thickness','x','z','rotation']:assert after['item'][key]==before['item'][key]
    assert after['fronts']==before['fronts']
    panel(page,'right');close_panels(page);panel(page,'right');assert state(page)==after
    assert page.evaluate("MF_PLANNER.scene.dressing.children.flatMap(g=>g.children.filter(x=>x.userData.role==='counter')).length")==1
    edit(page,'worktop-thickness',50);assert state(page)['item']['height']==870
    page.locator('#planner-undo').click();assert state(page)['item']['worktop_thickness']==40
    page.locator('#planner-redo').click();assert state(page)['item']['worktop_thickness']==50

def export_payload(page):
    close_panels(page)
    with page.expect_download() as download:page.locator('#export-bazis').click()
    return json.loads(Path(download.value.path()).read_text())

def export(page):
    return export_payload(page)['items']

def test_native_export_unchanged_when_worktop_changes_and_project_reopens(page,api,settings,admin_user):
    open_planner(page,api);panel(page,'left','catalog');page.locator('[data-bazis="bazis.3079d0656398"]').click()
    before=export(page);assert before[0]['target']==dict(width=600,height=820,depth=510)
    assert before[0]['source_default']==dict(width=600,height=820,depth=510)
    assert before[0]['construction']['base_height']==100 and before[0]['construction']['worktop_thickness']==38
    edit(page,'worktop-thickness',50)
    after=export(page);assert after[0]['target']==before[0]['target']
    assert after[0]['construction']['worktop_thickness']==50
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    expect(page.locator('#height')).to_have_value('820');assert export(page)[0]['target']==before[0]['target']
    assert state(page)['heights']==dict(body_height=720,base_height=100,module_height=820,worktop_thickness=50,overall_height_with_worktop=870)

@pytest.mark.parametrize('bazis_id,label,sides,source_sha',[
    ('bazis.0211e4f77fc4','Д1 L',['left'],'7d029606fafc89c7a7f060106a3f2d30a8c4224a304a904bbfeffe3675645d64'),
    ('bazis.784bf9af84f8','Д1 P',['right'],'5ffe31ba623db8b5cdc3d7e65811d6b162da40ef96f30554e9030b2d764c7eeb'),
    ('bazis.3079d0656398','Д2',['left','right'],'7d6feef0bc55a52460670eaa9f738c2e9764edd947d52ca4269053fd5fed6d29'),
],ids=['D1-L','D1-P','D2'])
def test_d1_d2_pilot_back_shelf_doors_save_and_native_export(page,api,settings,admin_user,bazis_id,label,sides,source_sha):
    open_planner(page,api);panel(page,'left','catalog');page.locator(f'[data-bazis="{bazis_id}"]').click()
    item=page.evaluate('({...MF_PLANNER.adapter.selected})')
    assert item['height']==820 and item['body_height']==720 and item['base_height']==100 and item['depth']==510
    assert item['shelves'][0]['offset_mm']==360
    panel(page,'right');expect(page.locator('#production-controls')).to_be_visible()
    expect(page.locator('#production-back-summary')).to_contain_text('3 мм')
    meshes=page.evaluate('''()=>{const g=MF_PLANNER.scene.entries.get(MF_PLANNER.adapter.selected.item_id).group,out={};g.traverse(o=>{const r=o.userData?.role;if(['back','shelf','front','door-pivot'].includes(r)){(out[r]??=[]).push({env:o.geometry?.userData?.envelopeMM||null,y:o.position.y,hinge:o.userData?.hingeSide||null,rot:o.rotation?.y||0});}});return out;}''')
    assert meshes['back'][0]['env']==[596,716,3]
    assert meshes['shelf'][0]['env']==[564,18,509]
    assert round(meshes['shelf'][0]['y']*1000)==460
    assert [m['env'] for m in meshes['front']]==[[600/len(sides)-3,717,18]]*len(sides)
    assert [m['hinge'] for m in meshes['door-pivot']]==sides
    rows=page.evaluate("()=>[...document.querySelectorAll('#cutlist tbody tr')].map(tr=>[...tr.cells].map(td=>td.textContent))")
    assert [r[:3] for r in rows[:7]]==[
        [label+' · Дно','600×510','1'],
        [label+' · Боковина L','702×510','1'],
        [label+' · Боковина P','702×510','1'],
        [label+' · Царга задняя','80×564','1'],
        [label+' · Царга передняя','80×564','1'],
        [label+' · Полка','564×509','1'],
        [label+' · Задняя стенка','716×596','1'],
    ]
    page.locator('#shelf-position').fill('400');page.locator('#shelf-position').press('Tab')
    assert page.evaluate('MF_PLANNER.adapter.selected.shelves[0].offset_mm')==400
    page.locator('#toggle-doors').click()
    assert page.evaluate('MF_PLANNER.adapter.selected.doors_open') is True
    assert page.evaluate('''()=>{const g=MF_PLANNER.scene.entries.get(MF_PLANNER.adapter.selected.item_id).group;return g.children.filter(x=>x.userData.role==='door-pivot').map(x=>Math.round(x.rotation.y*180/Math.PI));}''')==[-105 if side=='left' else 105 for side in sides]
    assert page.evaluate("MF_PLANNER.scene.entries.get(MF_PLANNER.adapter.selected.item_id).group.children.some(x=>x.userData.role==='reveal')") is False
    # Three independent dimensions rebuild every manufactured panel, including open doors.
    edit(page,'width',800);edit(page,'body-height',820);edit(page,'depth',610)
    assert page.evaluate('MF_PLANNER.adapter.selected.height')==920
    expected=page.evaluate('()=>MF_FURNITURE_CORE.productionParts(MF_PLANNER.adapter.selected,MF_PLANNER.adapter.template(MF_PLANNER.adapter.selected))')
    by_key={p['key']:p for p in expected}
    assert by_key['bottom']['size']==dict(x=800,y=18,z=610)
    assert by_key['side-L']['size']==dict(x=18,y=802,z=610)
    assert by_key['back']['size']==dict(x=796,y=816,z=3)
    assert by_key['shelf-1']['size']==dict(x=764,y=18,z=609)
    assert by_key['rail-front']['size']==dict(x=764,y=80,z=18)
    assert by_key['door-1']['size']==dict(x=800/len(sides)-3,y=817,z=18)
    rendered=page.evaluate("()=>{const out=[];MF_PLANNER.scene.entries.get(MF_PLANNER.adapter.selected.item_id).group.traverse(m=>{if(m.userData.part)out.push(m.userData.part)});return out;}")
    assert rendered==expected
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId')
    saved=api.get('/api/v2/3d-projects/'+pid).json()['scene']['items'][0]
    assert saved['shelves'][0]['offset_mm']==400 and saved['body_height']==820 and saved['base_height']==100
    assert saved['doors_open'] is True and saved['bazis_id']==bazis_id
    payload=export_payload(page);native=payload['items'][0]
    assert payload['production_schema']==1
    assert payload['format']=='martin-forest-bazis-native-v2'
    assert native['target']==dict(width=800,height=920,depth=610)
    assert native['construction']['parts']==expected
    assert native['construction']['back']['type']=='overlay_nails'
    assert native['construction']['shelves'][0]['offset_mm']==400
    assert native['construction']['doors']==[dict(side=side,hinge_count=2,open_angle=105) for side in sides]
    assert native['source_sha256']==source_sha

    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    # Opening a project fetches its scene asynchronously; wait for this exact saved module.
    page.wait_for_function('id=>MF_PLANNER.adapter.selected?.item_id===id',arg=item['item_id'])
    assert page.evaluate('MF_PLANNER.adapter.selected.shelves[0].offset_mm')==400
    assert page.evaluate('MF_PLANNER.adapter.selected.doors_open') is True
    assert export(page)[0]==native
    panel(page,'right');page.locator('#shelf-enabled').uncheck()
    assert page.evaluate("MF_PLANNER.scene.entries.get(MF_PLANNER.adapter.selected.item_id).group.children.filter(x=>x.userData.role==='shelf').length")==0
    page.locator('#planner-undo').click()
    assert page.evaluate("MF_PLANNER.scene.entries.get(MF_PLANNER.adapter.selected.item_id).group.children.filter(x=>x.userData.role==='shelf').length")==1
    close_panels(page);page.evaluate('MF_PLANNER.scene.fit("selected");MF_PLANNER.scene.render()')
    screenshot(page,'pilot-'+bazis_id+'-open')

def test_legacy_project_retains_module_height_on_read_and_save(page,api,settings,admin_user):
    open_planner(page,api)
    legacy={'item_id':'legacy-polish','name':'Legacy','module_type':'base_cabinet','template_id':'base.two_door','width':800,'height':720,'depth':560,'x':0,'z':0,'rotation':0,'base':'plinth','layout':'doors','drawers':0,'handles':'handles'}
    response=api.post('/api/v2/3d-projects',json={'name':'Legacy heights','scene':{'schema_version':2,'items':[legacy]}})
    assert response.status_code==201
    page.reload();expect(page.locator('body')).to_have_attribute('data-planner-ready','true');panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    expect(page.locator('#height')).to_have_value('720');assert state(page)['heights']['overall_height_with_worktop']==752
    assert state(page)['fronts'][0]['h']==637
    close_panels(page);page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    saved=api.get('/api/v2/3d-projects/'+response.json()['project_id']).json()['scene']['items'][0]
    assert saved['height']==720 and saved['worktop_thickness'] is None

def test_existing_bazis_donors_keep_original_geometry_and_export_on_reopen(page,api,settings,admin_user):
    open_planner(page,api)
    for donor,filename,sha in [
        ('bazis.0211e4f77fc4','НМД1-600. отк L.fr3d','cd5f119cec7467047cdac6ea1bc4aaafa95c4fa092cc92a101509003dbbd16b5'),
        ('bazis.784bf9af84f8','НМД1-600. отк P.fr3d','1ac5f7edba13c42c67007525a3b66738eb7937b4c6a35fb901d50144ad696df1'),
        ('bazis.3079d0656398','НМД2-600..fr3d','d79434c8d5e93744fcb37461491c9ec7560c1c78ad16d99a76ce7433fb9dfc80'),
    ]:
        legacy={'item_id':donor,'name':'Existing BAZIS donor','module_type':'base_cabinet','bazis_id':donor,'bazis_file':filename,'bazis_sha256':sha,'bazis_resize':True,'width':600,'height':720,'depth':560,'x':0,'z':0,'rotation':0,'base':'plinth','layout':'doors','drawers':0,'handles':'handles'}
        response=api.post('/api/v2/3d-projects',json={'name':'Existing '+donor,'scene':{'schema_version':2,'items':[legacy]}})
        assert response.status_code==201
        page.evaluate('(id)=>MF_PLANNER.bridge.open(id)',response.json()['project_id'])
        before=export(page)[0]
        assert before['source_default']==dict(width=600,height=720,depth=560)
        assert before['target']==before['source_default']
        assert before['source_file']==filename and before['source_sha256']==sha
        assert before['construction'] is None
        assert page.evaluate('MF_PLANNER.adapter.template(MF_PLANNER.adapter.selected).production===undefined') is True
        close_panels(page);page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
        page.evaluate('(id)=>MF_PLANNER.bridge.open(id)',response.json()['project_id'])
        assert export(page)[0]==before
