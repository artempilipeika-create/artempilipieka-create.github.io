"""Keyboard layout and touch-release contracts; disposable test app only."""
from playwright.sync_api import expect
from tests.webgl.browser_checks import page,api,settings,admin_user,open_planner,point

def test_undo_redo_with_russian_keyboard_layout(page,api,settings,admin_user):
    open_planner(page,api)
    page.locator('[data-template="base.drawers_3"]').click()
    expect(page.locator('#item-badge')).to_have_text('1 модуль')
    page.keyboard.press('Control+z')
    assert page.evaluate('MF_PLANNER.adapter.items.length')==0
    page.keyboard.press('Control+y')
    assert page.evaluate('MF_PLANNER.adapter.items.length')==1
    page.evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'я',code:'KeyZ',ctrlKey:true,bubbles:true,cancelable:true}))")
    assert page.evaluate('MF_PLANNER.adapter.items.length')==0
    page.evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Я',code:'KeyZ',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}))")
    assert page.evaluate('MF_PLANNER.adapter.items.length')==1

def test_touch_release_outside_canvas_clears_multitouch_guard(page,api,settings,admin_user):
    open_planner(page,api)
    page.evaluate("MF_PLANNER.interaction.touches.add(91);MF_PLANNER.interaction.touchBlocked=true;document.dispatchEvent(new PointerEvent('pointerup',{pointerId:91,pointerType:'touch',bubbles:true}))")
    assert page.evaluate('MF_PLANNER.interaction.touches.size')==0
    assert page.evaluate('MF_PLANNER.interaction.touchBlocked') is False
    page.evaluate("MF_PLANNER.interaction.touches.add(92);MF_PLANNER.interaction.touchBlocked=true;window.dispatchEvent(new Event('blur'))")
    assert page.evaluate('MF_PLANNER.interaction.touches.size')==0
    assert page.evaluate('MF_PLANNER.interaction.touchBlocked') is False

def test_clicking_cabinet_after_catalogue_moves_focus_for_delete(page,api,settings,admin_user):
    open_planner(page,api)
    card=page.locator('[data-template="base.drawers_3"]');card.click();card.focus()
    hit=point(page)
    page.mouse.click(hit['x'],hit['y'])
    expect(page.locator('#scene')).to_be_focused()
    page.keyboard.press('Delete')
    assert page.evaluate('MF_PLANNER.adapter.items.length')==0
    page.keyboard.press('Control+z')
    assert page.evaluate('MF_PLANNER.adapter.items.length')==1

def test_zero_gap_guide_marks_sidewall_not_center_for_all_rotations(page,api,settings,admin_user):
    open_planner(page,api)
    results=page.evaluate('''async()=>{const {snapItem}=await import('/account/planner/placement.mjs');const p=MF_PLANNER,result=[];for(const rotation of [0,90,180,270])for(const sign of [-1,1]){const peer={...p.adapter.createDraft({template:'base.drawers_3'}),rotation,x:0,z:0};const axis=rotation%180?'z':'x';const draft={...peer,item_id:'guide-test', [axis]:sign*615};const r=snapItem(draft,[peer],p.adapter.room,{threshold:45,allowElevation:false});result.push({error:r.error,center:r.item[axis],guide:r.guides.find(g=>g.text.includes('0 мм')).value,sign});}return result;}''')
    for r in results:
        assert r['error']==''
        assert r['center']==r['sign']*600
        assert r['guide']==r['sign']*300
