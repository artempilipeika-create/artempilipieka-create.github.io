"""Create, edit, reopen and export standard kitchen cabinets in a synthetic project."""
import argparse
from collections import defaultdict
import json
import os
from pathlib import Path

from playwright.sync_api import expect
from wardrobe_niche_smoke import exercise, ORIGIN, ROOT

MODELS = ('base-swing', 'base-sink', 'base-vitrine', 'wall-swing', 'wall-vitrine')


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
    page.locator('[data-module-filter="ai"]').click()
    assert page.locator('#module-catalogue .mf3d-module:visible').count()==len(MODELS)
    form=page.locator('#ai-kitchen-dialog')
    custom='91518079-f405-4256-984c-c6a256c16960'
    page.route('**/api/v2/catalogue/materials?*',lambda route:route.fulfill(json={'items':[{'name':'Дуб для теста','variant_id':custom,'thickness':18,'kind':'material'}]}))
    def tab(id):
        form.locator('[data-tab="'+id+'"]').click()
    def cabinet(model):
        return page.evaluate('id=>MF_PLANNER.adapter.items.find(p=>p.assistant_carcass?.spec.kitchenModel===id).assistant_carcass.group_id',model)
    def open_card(model):
        gid=cabinet(model)
        page.evaluate('id=>{const a=MF_PLANNER;a.adapter.select(id+":left");a.scene.cabinetSelection=id;a.sync()}',gid)
        page.locator('#studio-toggle-inspector').click()
        expect(form).to_be_visible()
    def save():
        form.get_by_role('button',name='Применить изменения').click()
        expect(form).to_be_hidden()
        page.evaluate('()=>MF_PLANNER.bridge.save()')
        scene=projects.projects[pid]['scene'];Scene.model_validate(scene)
        return scene
    for key in MODELS:
        page.locator('[data-ai-kitchen="'+key+'"]').click()
        expect(form).to_be_hidden()
        page.wait_for_function('key=>MF_PLANNER.adapter.items.some(p=>p.assistant_carcass?.spec.kitchenModel===key)',arg=key,timeout=4500)
    page.evaluate("()=>MF_PLANNER.workspace.panel('left',false)")
    # Use the actual scene raycast and a physical click. Sidebar and popup must not compete.
    point=page.evaluate("""()=>{const view=MF_PLANNER.scene,r=view.canvas.getBoundingClientRect();
      for(let y=r.top+40;y<r.bottom-30;y+=12)for(let x=r.left+90;x<r.right-90;x+=12){
        const id=view.pick(x,y)?.id;
        if(id&&MF_PLANNER.adapter.items.some(i=>i.item_id===id&&i.assistant_carcass?.spec.kitchenModel)&&document.elementFromPoint(x,y)===view.canvas)return {x,y};}
      throw Error('No visible cabinet in the technical view');}""")
    page.mouse.click(point['x'],point['y']);expect(form).to_be_visible()
    assert not page.evaluate('MF_PLANNER.workspace.right')
    form.get_by_role('button',name='Закрыть',exact=True).click()
    open_card('base-swing')
    form.get_by_label('Ширина корпуса').fill('750')
    expect(form.get_by_role('button',name='Применить изменения')).to_be_disabled()
    form.get_by_label('Ширина корпуса').fill('600')
    form.get_by_role('button',name='900 мм').click()
    form.locator('[name=heightScope]').select_option('row')
    tab('inside');form.locator('[name=shelves]').select_option('3');form.locator('[name=fix-1]').select_option('cam_dowel')
    tab('hardware');form.get_by_text('Накладные под цоколь',exact=True).click()
    form.locator('[data-foot="107270"]').click()
    assert form.locator('[data-foot]').count()>30
    form.locator('summary').filter(has_text='Петли').click()
    hinge=form.locator('[data-hinge-article="71B3550"]')
    assert hinge.locator('img').get_attribute('src');hinge.click()
    form.get_by_label('Положение ручки').select_option('horizontal')
    tab('materials')
    form.get_by_role('button',name='Закрыть двери').click()
    page.wait_for_function('MF_PLANNER.aiKitchen.preview.motion.door < 0.01')
    part_point=page.evaluate("""()=>{const v=MF_PLANNER.aiKitchen.preview,r=v.canvas.getBoundingClientRect();
      const point=v.camera.position.clone().set(0,0.30,0.015);
      const g=v.entries.get('questionnaire-preview:door-left').group;
      point.applyMatrix4(g.matrixWorld).project(v.camera);
      return [r.left+(1+point.x)*r.width/2,r.top+(1-point.y)*r.height/2];}""")
    page.mouse.click(*part_point)
    expect(form.locator('[name=part]')).to_have_value('door-left')
    page.wait_for_function('MF_PLANNER.aiKitchen.preview.outline.visible')
    form.locator('[name=part]').select_option('left')
    form.get_by_label('Поиск · Боковина левая').fill('Дуб')
    form.get_by_role('button',name='Дуб для теста · 18 мм').click()
    scene=save()
    open_card('wall-vitrine');tab('light');expect(form.locator('[role=status]')).to_contain_text('711 мм')
    tab('inside');form.locator('[name=shelf-0]').select_option('board');form.locator('[name=fix-0]').select_option('confirmat')
    form.locator('[name=shelf-1]').select_option('8');scene=save()
    open_card('base-vitrine');tab('inside');form.locator('[name=shelf-0]').select_option('board');save()
    open_card('base-sink');tab('inside');expect(form.get_by_label('Ширина мойки')).to_have_value('500')
    form.get_by_label('Исполнение мойки').select_option('black');scene=save()
    groups=defaultdict(list)
    for p in scene['items']:groups[p['assistant_carcass']['spec']['kitchenModel']].append(p)
    assert set(groups)==set(MODELS)
    for model in MODELS[:3]:
        first=groups[model][0];s=first['assistant_carcass']['spec']
        bottom=next(i for i in groups[model] if i['item_id'].endswith(':bottom'))
        assert s['height']+bottom['elevation_mm']==900
    assert next(i for i in groups['base-swing'] if i['item_id'].endswith(':left'))['body_variant_id']==custom
    assert not any(i['item_id'].endswith(':back') for i in groups['base-sink'])
    assert next(i for i in groups['base-sink'] if i['item_id'].endswith(':bottom'))['worktop_fixture']['finish']=='black'
    page.evaluate('id=>MF_PLANNER.bridge.open(id)',pid)
    open_card('base-swing');tab('inside');expect(form.locator('[name=shelves]')).to_have_value('3')
    tab('hardware');expect(form.get_by_label('Положение ручки')).to_have_value('horizontal')
    form.get_by_role('button',name='Закрыть',exact=True).click()
    with page.expect_download() as event:page.locator('#export-bazis').click()
    export=json.loads(Path(event.value.path()).read_text());rows=export['items']
    if os.environ.get('MF_AI_KITCHEN_EXPORT'):Path(os.environ['MF_AI_KITCHEN_EXPORT']).write_text(json.dumps(export,ensure_ascii=False))
    assert sum(bool(r.get('wardrobe_lira')) and r.get('span_mm')==711 for r in rows)==2
    assert sum(bool(r.get('wardrobe_z1_front')) for r in rows)==4
    assert any(r.get('article')=='71B3550' and r.get('wardrobe_blum_part')=='hinge' for r in rows)
    assert any(p['size']=={'x':1800,'y':38,'z':600} for r in export['kitchen_production']['runs'] for p in r['parts'])
    page.goto(ORIGIN+'/constructor?catalog=ai',wait_until='domcontentloaded')
    page.locator('#ai-kitchen-dialog').wait_for(state='attached')
    page.evaluate('id=>MF_PLANNER.bridge.open(id)',pid)
    expect(page.locator('[data-module-filter="ai"]')).to_have_attribute('aria-pressed','true')
    print('PASS five cabinets, physical click, row heights, shelf fixings, mixed materials, sink, saved project and Z1 export')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--live',action='store_true')
    a=p.parse_args()
    def check(page,projects,pid):
        if a.live:
            for name in ['ai-kitchen.mjs','ai-kitchen-project.mjs','ai-kitchen-ui.mjs','ai-kitchen.css']+['module-card-images/ai-'+key+'.webp' for key in MODELS]:
                asset=page.request.get(ORIGIN+'/account/planner/'+name)
                assert asset.ok and asset.body()==(ROOT/'backend/v2/cabinet_assets/planner'/name).read_bytes(),name
        scenario(page,projects,pid)
    exercise(a.live,check)
