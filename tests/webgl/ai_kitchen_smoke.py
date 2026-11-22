"""Create, edit, reopen and export the three independent kitchen cabinets in a synthetic project."""
import argparse
from collections import defaultdict
import json
import os
from pathlib import Path

from playwright.sync_api import expect
from wardrobe_niche_smoke import exercise, ORIGIN, ROOT

MODELS = ('base-swing', 'wall-swing', 'wall-vitrine')


def scenario(page, projects, pid):
    from backend.v2.three_d_api import Scene
    from backend.v2.assistant_api import LightingEstimate
    from backend.v2.wardrobe_lighting_kit import lighting_quote

    def estimate(route):
        body=LightingEstimate.model_validate(route.request.post_data_json)
        route.fulfill(json=lighting_quote([r.model_dump() for r in body.runs],body.settings.model_dump()))
    page.route('**/api/v2/3d-assistant/lighting-estimate',estimate)

    page.locator('#studio-toggle-library').click()
    page.locator('[data-studio-tab="catalog"]').click()
    tab = page.locator('[data-module-filter="ai"]')
    assert page.locator('[data-ai-kitchen]:visible').count() == 0
    tab.click()
    assert page.locator('#module-catalogue .mf3d-module:visible').count() == 3
    form = page.locator('#ai-kitchen-dialog')
    shelves = form.get_by_label('Количество полок')
    def start(key):
        page.locator('[data-ai-kitchen="'+key+'"]').click()
        expect(form).to_be_visible()

    def save(label):
        form.get_by_role('button', name=label).click()
        expect(form).to_be_hidden()
        page.evaluate('()=>MF_PLANNER.bridge.save()')
        scene = projects.projects[pid]['scene']
        Scene.model_validate(scene)
        return scene

    for index, key in enumerate(MODELS):
        start(key)
        expect(form.get_by_role('button',name='Добавить в проект')).to_be_enabled()
        if index==0:
            form.get_by_label('Ширина корпуса').fill('750')
            expect(form.get_by_role('button',name='Добавить в проект')).to_be_disabled()
            form.get_by_label('Ширина корпуса').fill('600')
            shelves.select_option('3')
            form.locator('summary').first.click()
            hinge=form.locator('[data-hinge-article="71B3550"]')
            assert hinge.locator('img').count() >= 1
            hinge.click()
            form.get_by_label('Положение ручки').select_option('horizontal')
            form.locator('summary').nth(1).click()
            pull=form.locator('[data-rail-article="79080"]')
            assert pull.locator('img').count()==1
            pull.click()
        if index==1:
            form.get_by_label('Свет над столешницей').select_option('true')
        if index==2:
            form.get_by_label('Стеклянные полки').select_option('8')
            form.get_by_label('Открывание').select_option('pair')
            form.get_by_label('Ширина корпуса').fill('800')
        scene=save('Добавить в проект')
    page.evaluate('id=>MF_PLANNER.bridge.open(id)',pid)
    groups=defaultdict(list)
    for part in scene['items']:
        meta=part['assistant_carcass'];groups[meta['spec']['kitchenModel']].append(part)
    assert set(groups)==set(MODELS)
    for parts in groups.values():
        assert all(p['module_type']=='blank' and not p.get('bazis_file') for p in parts)
    base,upper,vitrine=(groups[k] for k in MODELS)
    assert sum(':shelf-' in p['item_id'] for p in base)==3
    assert all(p['blank_shelf']=='8/48846' for p in vitrine if ':shelf-' in p['item_id'])
    assert len({p['assistant_carcass']['group_id'] for p in scene['items']})==3
    # Edit through the ordinary selected cabinet controls after reopening.
    gid=base[0]['assistant_carcass']['group_id']
    page.evaluate('id=>{MF_PLANNER.adapter.select(id);MF_PLANNER.scene.cabinetSelection=id.split(":")[0];MF_PLANNER.sync()}',base[0]['item_id'])
    page.get_by_role('button',name='Редактировать в конструкторе').click()
    expect(shelves).to_have_value('3')
    expect(form.get_by_label('Положение ручки')).to_have_value('horizontal')
    expect(form.locator('summary').first).to_contain_text('71B3550')
    shelves.select_option('2')
    form.get_by_label('Открывание').select_option('right')
    scene=save('Применить изменения')
    updated=[p for p in scene['items'] if p['assistant_carcass']['group_id']==gid]
    assert sum(':shelf-' in p['item_id'] for p in updated)==2
    assert any(p['item_id']==gid+':door-right' for p in updated)
    page.evaluate('id=>MF_PLANNER.bridge.open(id)',pid)
    with page.expect_download() as event:
        page.locator('#export-bazis').click()
    export=json.loads(Path(event.value.path()).read_text())
    rows=export['items']
    if os.environ.get('MF_AI_KITCHEN_EXPORT'):
        Path(os.environ['MF_AI_KITCHEN_EXPORT']).write_text(json.dumps(export,ensure_ascii=False))
    assert sum(bool(r.get('wardrobe_lira')) for r in rows)==3
    assert export['kitchen_production']['runs'][0]['parts'][0]['size']=={'x':600,'y':38,'z':600}
    assert sum(bool(r.get('wardrobe_z1_front')) for r in rows)==2
    assert sum(bool(r.get('wardrobe_z1_hinge')) for r in rows)==4
    assert sum(r.get('article')=='71B3550' and r.get('wardrobe_blum_part')=='hinge' for r in rows)==2
    assert set(p['item_id'] for p in upper)=={p['item_id'] for p in scene['items'] if p['assistant_carcass']['spec']['kitchenModel']=='wall-swing'}
    page.goto(ORIGIN+'/constructor?catalog=ai',wait_until='domcontentloaded')
    page.locator('#ai-kitchen-dialog').wait_for(state='attached')
    page.evaluate('id=>MF_PLANNER.bridge.open(id)',pid)
    expect(page.locator('[data-module-filter="ai"]')).to_have_attribute('aria-pressed','true')
    page.locator('[data-ai-kitchen="wall-vitrine"]').click()
    expect(page.locator('#ai-kitchen-dialog')).to_be_visible()
    print('PASS three original kitchen cards, protected source catalogue, schema, supplier photos, saved and edited shelves, real hardware and Z1 export')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--live',action='store_true')
    a=p.parse_args()
    def check(page,projects,pid):
        if a.live:
            for name in ['ai-kitchen.mjs','ai-kitchen-ui.mjs','ai-kitchen.css']+['module-card-images/ai-'+key+'.webp' for key in MODELS]:
                asset=page.request.get(ORIGIN+'/account/planner/'+name)
                assert asset.ok and asset.body()==(ROOT/'backend/v2/cabinet_assets/planner'/name).read_bytes(),name
        scenario(page,projects,pid)
    exercise(a.live,check)
