"""Collision blocking and whole/lower/upper material selection scopes."""
from playwright.sync_api import expect
from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui
from tests.webgl.navigation import panel,close_panels
from tests.stage03.test_api import publish,login
from tests.stage03.support import master

ROWS=[
 ['A100','Material A','кв.м',10,2800,2070,18,'A','','M1','false',''],
 ['B200','Material B','кв.м',11,2800,2070,18,'B','','M1','false',''],
 ['C300','Material C','кв.м',12,2800,2070,18,'C','','M1','false',''],
]

def open_verified(page,admin_user):
    login_ui(page,admin_user['email'])
    page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    page.wait_for_function('()=>window.MF_PLANNER&&window.MF_FURNITURE_CORE')

def choose_material(page,article):
    page.locator('#body-search').fill(article)
    button=page.locator('#body-results button').filter(has_text=article).first
    expect(button).to_be_visible();button.click()
    page.wait_for_function('()=>MF_PLANNER.adapter.items.every(x=>x.body_variant_id!==undefined)')

def test_whole_lower_upper_selection_and_material_replacement(page,api,settings,admin_user):
    login(api,admin_user['email']);publish(api,master(ROWS),namespace='test.scope.materials')
    open_verified(page,admin_user)
    panel(page,'left','catalog')
    for donor in ['bazis.0211e4f77fc4','bazis.39f282e08f0c','bazis.2175c60e84a6']:
        page.locator(f'[data-bazis="{donor}"]').click()
    panel(page,'right')
    scope=page.locator('#material-scope')
    assert scope.locator('option').all_text_contents()==['Выбранный модуль','Вся кухня','Низ','Верх']

    scope.select_option('kitchen')
    expect(page.locator('#status')).to_contain_text('вся кухня')
    assert page.evaluate('''()=>[...MF_PLANNER.scene.kitchenBoxes.values()].filter(x=>x.visible).length''')==3
    choose_material(page,'A100')
    ids=page.evaluate('MF_PLANNER.adapter.items.map(x=>x.body_variant_id)')
    assert len(set(ids))==1 and ids[0]

    scope.select_option('lower')
    assert page.evaluate('''()=>[...MF_PLANNER.scene.kitchenBoxes.values()].filter(x=>x.visible).length''')==2
    choose_material(page,'B200')
    ids=page.evaluate('MF_PLANNER.adapter.items.map(x=>x.body_variant_id)')
    assert ids[0]==ids[1] and ids[0]!=ids[2]

    scope.select_option('upper')
    assert page.evaluate('''()=>[...MF_PLANNER.scene.kitchenBoxes.values()].filter(x=>x.visible).length''')==1
    page.evaluate("MF_PLANNER.adapter.select(MF_PLANNER.adapter.items[2].item_id)")
    choose_material(page,'C300')
    ids2=page.evaluate('MF_PLANNER.adapter.items.map(x=>x.body_variant_id)')
    assert ids2[0]==ids[0] and ids2[1]==ids[1] and ids2[2]!=ids[2]

def test_resize_and_drag_never_overlap_adjacent_cabinet(page,api,settings,admin_user):
    open_verified(page,admin_user)
    panel(page,'left','catalog')
    page.locator('[data-bazis="bazis.0211e4f77fc4"]').click()
    page.locator('[data-bazis="bazis.3079d0656398"]').click()
    original=page.evaluate('MF_PLANNER.adapter.items.map(x=>({id:x.item_id,x:x.x,width:x.width,z:x.z}))')
    assert original[0]['x']<original[1]['x']

    # Width grows to the right, so 800 would intersect the adjacent 600 cabinet and must be rejected atomically.
    page.evaluate('MF_PLANNER.adapter.select(MF_PLANNER.adapter.items[0].item_id)')
    panel(page,'right')
    page.locator('#width').fill('800');page.locator('#width').press('Tab')
    assert page.evaluate('MF_PLANNER.adapter.items[0].width')==600
    expect(page.locator('#status')).to_contain_text('Пересечение')

    # During pointer movement, preview stops at the last legal point instead of drawing through its neighbour.
    close_panels(page);page.locator('#planner-front').click()
    page.evaluate('MF_PLANNER.scene.fit("kitchen");MF_PLANNER.scene.render()')
    pts=page.evaluate('''()=>{const p=MF_PLANNER,a=p.adapter.items[0],b=p.adapter.items[1];
      const A=p.scene.projectPoint({x:a.x,y:300,z:a.z+a.depth/2+20}),B=p.scene.projectPoint({x:b.x,y:300,z:b.z+b.depth/2+20});
      return {A,B,peerLeft:b.x-b.width/2,width:a.width};}''')
    page.mouse.move(pts['A']['x'],pts['A']['y']);page.mouse.down()
    page.mouse.move(pts['B']['x'],pts['B']['y'],steps=14)
    expect(page.locator('#planner-feedback')).to_contain_text('пересечение запрещено')
    preview=page.evaluate('''()=>({x:MF_PLANNER.scene.preview.position.x*1000})''')
    assert preview['x']+pts['width']/2 <= pts['peerLeft']+1
    page.mouse.up()
    assert page.evaluate('''()=>{const p=MF_PLANNER,a=p.adapter.items[0];return MF_FURNITURE_CORE.placementError(a,p.adapter.items,p.adapter.room)}''')==''
