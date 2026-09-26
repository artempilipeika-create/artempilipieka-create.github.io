"""Real UI navigation for collapsible panels. No state or visibility overrides.
All regression actions open the actual drawer before editing its existing controls.
"""
def panel(page,side,tab=None):
    if not page.locator('#planner-workspace').count():return
    target=page.locator('.mf3d-left' if side=='left' else '.mf3d-right')
    if not target.is_visible():
        mobile=page.viewport_size['width']<=760
        selector=('#planner-mobile-catalog' if side=='left' else '#planner-mobile-inspector') if mobile else ('#studio-toggle-library' if side=='left' else '#studio-toggle-inspector')
        page.locator(selector).click()
    if side=='left' and tab and page.locator('#tab-'+tab).get_attribute('aria-selected')!='true':page.locator('#tab-'+tab).click()

def close_panels(page):
    if not page.locator('#planner-workspace').count():return
    for side in ['left','right']:
        button=page.locator('#workspace-close-'+side)
        if button.is_visible():button.click()
