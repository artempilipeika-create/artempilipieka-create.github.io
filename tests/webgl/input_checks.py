"""Keyboard layout and touch-release contracts; disposable test app only."""
from playwright.sync_api import expect
from tests.webgl.browser_checks import page,api,settings,admin_user,open_planner

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
