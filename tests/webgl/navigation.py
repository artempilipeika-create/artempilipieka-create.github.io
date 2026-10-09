"""Real UI navigation for collapsible panels. No state or visibility overrides.
All regression actions open the actual drawer before editing its existing controls.
"""
def complete_room_setup(page):
    """Confirm measured synthetic fixture dimensions through the real new-project flow."""
    dialog=page.locator('#room-setup')
    if not dialog.count() or not dialog.is_visible():return
    for key,value in [('width',4200),('depth',3200),('height',2700)]:
        page.locator('#room-setup-'+key).fill(str(value))
    page.locator('#room-setup-apply').click()

def panel(page,side,tab=None):
    if not page.locator('#planner-workspace').count():return
    if page.locator('#room-setup').is_visible():
        if side=='left' and tab=='projects':page.locator('#room-setup-projects').click()
        else:complete_room_setup(page)
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


DOOR_PAIRS={
    'bazis.784bf9af84f8':'bazis.0211e4f77fc4',
    'bazis.b226370aab54':'bazis.facfa0cd038b',
    'bazis.2175c60e84a6':'bazis.858266606bc5',
    'bazis.60f79b573cd1':'bazis.b89bf9852860',
}
CATALOGUE_LABELS=[
    'Нижний шкаф · 1 дверь','Д2','Нижний 2 ящика · с доводчиком','Нижний 3 ящика · с доводчиком',
    'Нижний под мойку · 1 дверь','НМД2 · Мойка','НШД-600 · ниша 595','Нижний угловой шкаф',
    'Верхний шкаф · 1 дверь','ВМД2','Верхний с сушкой · 1 дверь','ВМД2 · Сушка','Пенал с полками ПН-600',
]

def add_production_variant(page,bazis_id):
    """Use the family card and real opening control to choose an exact donor."""
    if bazis_id=='bazis.b4420a0b4bbc':
        add_legacy(page,{'bazis':bazis_id});return
    panel(page,'left','catalog')
    card=DOOR_PAIRS.get(bazis_id,bazis_id)
    page.locator(f'[data-bazis="{card}"]').click()
    if card!=bazis_id:
        panel(page,'right')
        page.locator('[data-door-side="right"]').click()


def add_legacy(page,options):
    """Load a retained legacy definition through the planner for compatibility tests.
    It is deliberately absent from the active customer catalogue.
    """
    page.wait_for_function('Boolean(window.MF_PLANNER?.interaction)')
    complete_room_setup(page)
    assert page.evaluate('(options)=>MF_PLANNER.interaction.add(options)',options)
