"""Real ASGI/catalogue/project persistence plus actual WebGL material rendering."""
import pytest
from playwright.sync_api import expect
from tests.webgl.browser_checks import page,settings,api,admin_user,open_planner,screenshot
from tests.webgl.navigation import panel,close_panels
from tests.webgl.polish_checks import export_payload
from tests.stage03.test_api import publish,login
from tests.stage03.support import master

ARTICLES=['W1000 ST9','U999 ST7','U708 ST9','H1180 ST37']
NAMES=['Белый премиум','Чёрный','Светло-серый','Дуб Галифакс натуральный']

def choose(page,kind,article):
    panel(page,'right');page.locator('#'+kind+'-search').fill(article)
    page.locator('#'+kind+'-results button').filter(has_text=article).first.click()
    page.wait_for_function('kind=>{const p=MF_PLANNER,id=p.adapter.selected[kind+"_variant_id"],ms=[];p.scene.entries.get(p.adapter.selected.item_id).group.traverse(m=>{if(m.isMesh&&m.material.userData.variantId===id)ms.push(m)});return ms.length&&ms.every(m=>m.material.map?.image?.complete)}',arg=kind)

def render_state(page):
    return page.evaluate('''()=>{const p=MF_PLANNER,g=p.scene.entries.get(p.adapter.selected.item_id).group,parts={};g.traverse(m=>{if(m.userData.part){const a=m.userData.part;parts[a.key]={geometry:m.geometry.uuid,variant:m.material.userData.variantId,article:a.material.article,url:m.material.map?.image?.getAttribute('src')||null,srgb:m.material.map?.colorSpace,opacity:m.material.opacity,visible:m.visible,metalness:m.material.metalness};}});return {uuid:g.uuid,parts,undo:p.history.undoStack.length,payload:p.bridge.payload(),mode:p.scene.displayMode};}''')

@pytest.mark.parametrize('donor',['bazis.0211e4f77fc4','bazis.784bf9af84f8','bazis.3079d0656398'],ids=['D1-L','D1-P','D2'])
def test_materials_modes_history_save_load_native_export(page,api,settings,admin_user,donor):
    open_planner(page,api);owner_email=api.get('/api/v2/auth/me').json()['email'];login(api,admin_user['email'])
    publish(api,master([[a,'ЛДСП EGGER 18мм '+n+' '+a,'кв.м',0,2800,2070,18,a.split()[1],'','M1','false',''] for a,n in zip(ARTICLES,NAMES)]),namespace='test.pilot.visuals')
    login(api,owner_email)
    panel(page,'left','catalog');page.locator(f'[data-bazis="{donor}"]').click()
    original=render_state(page);choose(page,'body',ARTICLES[0])
    body=page.evaluate('MF_PLANNER.adapter.selected.body_variant_id')
    for article in ARTICLES:
        choose(page,'front',article);state=render_state(page)
        assert state['uuid']==original['uuid']
        assert {k:v['geometry'] for k,v in state['parts'].items()}=={k:v['geometry'] for k,v in original['parts'].items()}
        assert state['parts']['door-1']['article']==article and state['parts']['door-1']['srgb']=='srgb'
        assert state['parts']['bottom']['variant']==body and state['parts']['bottom']['article']==ARTICLES[0]
        assert all(v['metalness']==0 for v in state['parts'].values())
        close_panels(page);page.evaluate('MF_PLANNER.scene.fit("selected");MF_PLANNER.scene.render()');screenshot(page,donor+'-'+article.replace(' ','-'))
    before=render_state(page);front=page.evaluate('MF_PLANNER.adapter.selected.front_variant_id')
    page.locator('#planner-undo').click()
    assert render_state(page)['parts']['door-1']['article']==ARTICLES[2]
    page.locator('#planner-redo').click()
    assert render_state(page)['parts']['door-1']['article']==ARTICLES[3]
    native=export_payload(page)['items'][0]
    assert native['construction']['parts'][-1]['material']['article']==ARTICLES[3]
    assert native['construction']['parts'][0]['material']['variant_id']==body
    for mode in ['inspection','facadesHidden','normal']:
        panel(page,'right');page.locator('#module-display').select_option(mode)
        state=render_state(page);assert state['payload']==before['payload'] and state['undo']==before['undo']
        assert state['parts']['shelf-1']['opacity']==1 and state['parts']['back']['opacity']==1
        assert state['parts']['side-L']['opacity']==(.16 if mode=='inspection' else 1)
        assert state['parts']['door-1']['visible']==(mode!='facadesHidden')
        assert export_payload(page)['items'][0]==native
        close_panels(page);screenshot(page,donor+'-'+mode)
    panel(page,'right');page.locator('#module-display').select_option('facadesHidden')
    page.evaluate('MF_PLANNER.setView("front");MF_PLANNER.scene.fit("selected");MF_PLANNER.scene.render()')
    hit=page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.selected,h=p.scene.projectPoint({x:it.x,y:280,z:it.z+it.depth/2+20}),r=p.scene.pick(h.x,h.y);return {id:r?.id,z:r?.point.z,expected:(it.z-it.depth/2)/1000};}''')
    assert hit['id']==page.evaluate('MF_PLANNER.adapter.selected.item_id') and abs(hit['z']-hit['expected'])<.005
    page.locator('#toggle-doors').click()
    for mode in ['inspection','facadesHidden','normal']:
        page.locator('#module-display').select_option(mode)
        assert page.evaluate('MF_PLANNER.adapter.selected.doors_open') is True
        assert page.evaluate('MF_FURNITURE_CORE.placementError(MF_PLANNER.adapter.selected,MF_PLANNER.adapter.items,MF_PLANNER.adapter.room)')==''
    page.locator('#module-display').select_option('inspection')
    close_panels(page);page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId');response=api.get('/api/v2/3d-projects/'+pid)
    assert response.status_code==200,response.text
    saved=response.json()['scene']['items'][0]
    assert saved['body_variant_id']==body and saved['front_variant_id']==front
    assert 'display_mode' not in saved and 'visual' not in saved
    native=export_payload(page)['items'][0]
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    page.wait_for_function('id=>MF_PLANNER.adapter.selected?.front_variant_id===id',arg=front)
    page.wait_for_function('()=>{const p=MF_PLANNER,ms=[];p.scene.entries.get(p.adapter.selected.item_id).group.traverse(m=>{if(m.userData.role==="front")ms.push(m)});return ms.every(m=>m.material.map?.image?.complete)}')
    assert render_state(page)['mode']=='normal' and render_state(page)['parts']['door-1']['article']==ARTICLES[3]
    assert export_payload(page)['items'][0]==native
    # Cache stability in the actual renderer, while repeatedly changing both materials and modes.
    result=page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.selected,f=p.scene.factory,group=p.scene.entries.get(it.item_id).group,ids=[it.body_variant_id,it.front_variant_id],before=p.scene.renderer.info.memory.geometries;for(let i=0;i<100;i++){it.front_variant_id=ids[i%2];p.scene.setDisplayMode(['normal','inspection','facadesHidden'][i%3]);p.scene.render();}it.front_variant_id=ids[1];p.scene.setDisplayMode('normal');p.scene.render();return {before,after:p.scene.renderer.info.memory.geometries,materials:f.materials.size,textures:f.textures.size,same:group===p.scene.entries.get(it.item_id).group};}''')
    assert result['before']==result['after'] and result['same'] and result['materials']<=64 and result['textures']<=16
