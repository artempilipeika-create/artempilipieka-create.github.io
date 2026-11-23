"""Create, edit, reopen and export standard kitchen cabinets in a synthetic project."""
import argparse
from collections import defaultdict
import json
import os
from time import monotonic
from pathlib import Path

from playwright.sync_api import expect
from wardrobe_niche_smoke import exercise, ORIGIN, ROOT

MODELS = ('base-swing', 'base-sink', 'base-vitrine', 'wall-swing', 'wall-vitrine')


def wait_for_state(page, expression, arg=None):
    deadline = monotonic() + 15
    while not page.evaluate(expression, arg):
        if monotonic() >= deadline:
            raise AssertionError(expression)
        page.wait_for_timeout(75)


def scenario(page, projects, pid):
    from backend.v2.three_d_api import Scene
    from backend.v2.assistant_api import LightingEstimate
    from backend.v2.wardrobe_lighting_kit import lighting_quote

    def estimate(route):
        body=LightingEstimate.model_validate(route.request.post_data_json)
        route.fulfill(json=lighting_quote([r.model_dump() for r in body.runs],body.settings.model_dump()))
    page.route('**/api/v2/3d-assistant/lighting-estimate',estimate)

    room=page.locator('#planner-room-settings')
    room.locator('summary').click()
    expect(room.locator('#room-floor')).to_have_value('concrete')
    room.get_by_role('button',name='Вернуть сцену «Молочный и дуб»').click()
    expect(room.locator('#room-floor')).to_have_value('palette')
    expect(room.locator('#room-lighting')).to_have_value('palette')
    page.evaluate('()=>MF_PLANNER.bridge.save()')
    page.evaluate('id=>MF_PLANNER.bridge.open(id)',pid)
    assert projects.projects[pid]['scene']['displaySettings']['renderRoomId']==1
    expect(room.locator('#room-floor option:checked')).to_contain_text('Дубовый пол')
    expect(room.locator('#room-lighting option:checked')).to_contain_text('Нейтральный')
    room.locator('summary').click()

    page.locator('#studio-toggle-library').click()
    page.locator('[data-studio-tab="catalog"]').click()
    page.locator('[data-module-filter="ai"]').click()
    assert page.locator('#module-catalogue .mf3d-module:visible').count()==len(MODELS)+4
    form=page.locator('#ai-kitchen-dialog')
    custom='91518079-f405-4256-984c-c6a256c16960'
    page.route('**/api/v2/catalogue/materials?*',lambda route:route.fulfill(json={'items':[{'name':'Дуб для теста','variant_id':custom,'thickness':18,'kind':'material'}]}))

    def tab(id):
        form.locator('[data-tab="'+id+'"]').click()
    def fixing(index,code):
        return form.locator(f'[data-shelf-index="{index}"][data-shelf-fixing="{code}"]')
    def installed_handle(view,door,article,angle):
        wait_for_state(page, """([view,door,article,angle])=>{
          const v=view==='preview'?MF_PLANNER.aiKitchen.preview:MF_PLANNER.scene;
          const mesh=v.entries.get(door)?.group.children.find(n=>n.isMesh&&n.userData.frontAccessory&&n.userData.article===article);
          return Boolean(mesh?.visible&&Math.abs(mesh.rotation.z*180/Math.PI-angle)<.01);
        }""",[view,door,article,angle])
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
        wait_for_state(page, 'key=>MF_PLANNER.adapter.items.some(p=>p.assistant_carcass?.spec.kitchenModel===key)',key)
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
    tab('inside')
    shelf_photo=form.locator('.kitchen-picture-choices').get_by_role('button',name='3',exact=True)
    assert shelf_photo.locator('img').evaluate('async i=>{await i.decode();return i.naturalWidth===800}')
    shelf_photo.click()
    expect(form.locator('[name=shelves]')).to_have_value('3')
    assert form.locator('[data-shelf-index="1"]').count()==3
    assert fixing(1,'cam_dowel').locator('img').count()==2
    viewport=page.viewport_size
    for size in (viewport,{'width':390,'height':760}):
        page.set_viewport_size(size)
        expect(form.get_by_role('navigation').get_by_role('button',name='Ручки',exact=True)).to_be_in_viewport()
        metrics=form.evaluate(r"""d=>{
           const b=d.querySelector('.ai-kitchen-body'),nav=d.querySelector('nav');
           b.scrollTop=0;const top=nav.getBoundingClientRect().top;b.scrollTop=b.scrollHeight;
           function lum(rgb){const [r,g,b]=rgb.match(/\d+/g).slice(0,3).map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b;}
           const ratios=Array.from(nav.children,n=>{const s=getComputedStyle(n),a=lum(s.color),b=lum(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
           return {shift:nav.getBoundingClientRect().top-top,ratios,scroll:b.scrollTop};
        }""")
        assert metrics['shift']==0 and min(metrics['ratios'])>=4.5,metrics
        if size['width']==390:assert metrics['scroll']>0
    page.set_viewport_size(viewport)
    form.locator('[name=fixingScope]').select_option('cabinet');fixing('all','95388').click()
    form.locator('[name=fixingScope]').select_option('one');fixing(1,'cam_dowel').click()
    expect(fixing(0,'95388')).to_have_attribute('aria-pressed','true')
    tab('hardware');form.get_by_text('Накладные под цоколь',exact=True).click()
    form.locator('[data-foot="107270"]').click()
    assert form.locator('[data-foot]').count()>30
    form.locator('summary').filter(has_text='Петли').click()
    hinge=form.locator('[data-hinge-article="71B3550"]')
    assert hinge.locator('img').get_attribute('src');hinge.click()
    form.get_by_role('button',name='Ручки на фасаде',exact=True).click()
    expect(form.get_by_role('button',name='Ручки',exact=True)).to_have_attribute('aria-current','step')
    expect(form.get_by_role('heading',name='Рейлинговые ручки AKS')).to_be_visible()
    form.get_by_label('Межосевое расстояние').select_option('320')
    rail=form.locator('[data-rail-article="89080"]')
    expect(rail).to_be_visible()
    assert rail.locator('img').evaluate('async i=>{await i.decode();return i.naturalWidth>0}')
    rail.click()
    installed_handle('preview','questionnaire-preview:door-left','89080',90)
    form.get_by_label('Положение ручки').select_option('horizontal')
    installed_handle('preview','questionnaire-preview:door-left','89080',0)
    tab('materials')
    form.get_by_role('button',name='Закрыть двери').click()
    wait_for_state(page, '()=>MF_PLANNER.aiKitchen.preview.motion.door < 0.01')
    part_point=page.evaluate("""()=>{const v=MF_PLANNER.aiKitchen.preview,r=v.canvas.getBoundingClientRect();
      const point=v.camera.position.clone().set(0,0.30,0.015);
      const g=v.entries.get('questionnaire-preview:door-left').group;
      point.applyMatrix4(g.matrixWorld).project(v.camera);
      return [r.left+(1+point.x)*r.width/2,r.top+(1-point.y)*r.height/2];}""")
    page.mouse.click(*part_point)
    expect(form.locator('[name=part]')).to_have_value('door-left')
    wait_for_state(page, '()=>MF_PLANNER.aiKitchen.preview.outline.visible')
    form.locator('[name=part]').select_option('left')
    form.get_by_label('Поиск · Боковина левая').fill('Дуб')
    form.get_by_role('button',name='Дуб для теста · 18 мм').click()
    scene=save()
    installed_handle('scene',cabinet('base-swing')+':door-left','89080',0)
    open_card('wall-vitrine');tab('handles');expect(form.get_by_text('Витрина Z1 открывается за алюминиевую рамку.')).to_be_visible()
    tab('light');expect(form.locator('[role=status]')).to_contain_text('711 мм')
    tab('inside');form.locator('[name=shelf-0]').select_option('board');fixing(0,'confirmat').click()
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
    open_card('wall-swing');tab('inside');form.locator('[name=fixingScope]').select_option('project')
    fixing('all','confirmat').click();scene=save()
    assert scene['kitchenShelfFixing']=='confirmat'
    boards=[it for it in scene['items'] if (it.get('blank_shelf') or '').startswith('board/')]
    assert len(boards)==6 and all(it['blank_shelf']=='board/confirmat' for it in boards)
    assert any(it.get('blank_shelf')=='8/48846' for it in scene['items'])
    page.evaluate('id=>MF_PLANNER.bridge.open(id)',pid)
    wait_for_state(page, "()=>MF_PLANNER.adapter.state.kitchenShelfFixing==='confirmat'")
    open_card('base-swing');tab('inside');expect(form.locator('[name=shelves]')).to_have_value('3')
    expect(fixing(1,'confirmat')).to_have_attribute('aria-pressed','true')
    tab('handles');expect(form.get_by_label('Положение ручки')).to_have_value('horizontal')
    expect(form.locator('[data-rail-article="89080"]')).to_have_attribute('aria-pressed','true')
    installed_handle('preview','questionnaire-preview:door-left','89080',0)
    form.get_by_role('button',name='Закрыть',exact=True).click()
    with page.expect_download() as event:page.locator('#export-bazis').click()
    export=json.loads(Path(event.value.path()).read_text());rows=export['items']
    if os.environ.get('MF_AI_KITCHEN_EXPORT'):Path(os.environ['MF_AI_KITCHEN_EXPORT']).write_text(json.dumps(export,ensure_ascii=False))
    assert sum(bool(r.get('wardrobe_lira')) and r.get('span_mm')==711 for r in rows)==2
    assert sum(bool(r.get('wardrobe_z1_front')) for r in rows)==4
    assert any(r.get('article')=='71B3550' and r.get('wardrobe_blum_part')=='hinge' for r in rows)
    assert any(r.get('wardrobe_catalogue_pull') and r['article']=='89080' and r['handle_roll_deg']==0 and r['host_blank_id']==cabinet('base-swing')+':door-left' for r in rows)
    assert any(p['size']=={'x':1800,'y':38,'z':600} for r in export['kitchen_production']['runs'] for p in r['parts'])
    page.goto(ORIGIN+'/constructor?catalog=ai',wait_until='domcontentloaded')
    page.locator('#ai-kitchen-dialog').wait_for(state='attached')
    page.evaluate('id=>MF_PLANNER.bridge.open(id)',pid)
    expect(page.locator('[data-module-filter="ai"]')).to_have_attribute('aria-pressed','true')
    open_card('base-swing');tab('handles')
    form.get_by_label('Тип ручки').select_option('monblan')
    form.locator('[data-rail-article="92253"]').click()
    tab('body');form.get_by_label('Задняя стенка',exact=True).select_option('quarter')
    form.get_by_label('Боковина с четвертью').select_option('both')
    scene=save()
    door=next(x for x in scene['items'] if x['item_id']==cabinet('base-swing')+':door-left')
    assert door['assistant_carcass']['spec']['front']['handles']['door-left']['article']=='92253'
    assert door['assistant_carcass']['spec']['backMount']['layout']=='both'
    open_card('base-swing');tab('handles');form.get_by_label('Тип ручки').select_option('gola')
    form.locator('[data-rail-article="118124"]').click();scene=save()
    assert next(x for x in scene['items'] if x['item_id']==door['item_id'])['assistant_carcass']['spec']['front']['topProfile']
    # Start a separate empty room to exercise actual native filling sources at 820 mm.
    page.evaluate("""async()=>{const a=MF_PLANNER,s=a.bridge.snapshot();s.scene.items=[];
      s.scene.selected_item_id=null;s.selectedId=null;await a.bridge.loadSnapshot(s,a.bridge.projectMeta());}""")
    page.evaluate("()=>MF_PLANNER.workspace.panel('left',true)")
    fill=page.locator('#kitchen-filling-dialog')
    def edit_filling(item):
        page.evaluate('id=>{MF_PLANNER.adapter.select(id);MF_PLANNER.workspace.panel("right",true)}',item)
        expect(fill).to_be_visible()
    def save_fill():
        fill.get_by_role('button',name='Применить изменения').click()
        expect(fill).to_be_hidden()
        page.evaluate('()=>MF_PLANNER.bridge.save()')
        Scene.model_validate(projects.projects[pid]['scene'])
    ids={}
    for kind in ['drawers-three','drawers-two','dryer','cargo']:
        page.evaluate("()=>MF_PLANNER.workspace.panel('left',true)")
        page.locator('[data-ai-kitchen="'+kind+'"]').click()
        wait_for_state(page, 'k=>MF_PLANNER.adapter.selected?.kitchenFilling?.kind===k',kind)
        ids[kind]=page.evaluate('MF_PLANNER.adapter.selected.item_id')
        edit_filling(ids[kind])
        if kind=='cargo':
            photo=fill.locator('.kitchen-picture-choices').get_by_role('button',name='NORWING',exact=True)
            assert photo.locator('img').evaluate('async i=>{await i.decode();return i.naturalWidth===800}')
            photo.click()
            expect(fill.get_by_label('Комплект карго',exact=True)).to_have_value('norwing')
        fill.locator('[data-tab=handles]').click()
        fill.locator('[data-pull="92253"]').click()
        if kind=='drawers-three':
            fill.locator('[data-tab=body]').click()
            fill.get_by_label('Задняя стенка',exact=True).select_option('quarter')
        save_fill()
        wait_for_state(page, 'id=>MF_PLANNER.scene.entries.get(id)?.group.children.some(m=>m.userData.article==="92253")',ids[kind])
    for kind in ['drawers-two','dryer','cargo']:
        edit_filling(ids[kind]);fill.locator('[data-tab=handles]').click();fill.locator('[data-pull=gola]').click()
        save_fill()
    page.evaluate('id=>MF_PLANNER.bridge.open(id)',pid)
    wait_for_state(page, 'id=>MF_PLANNER.adapter.items.some(x=>x.item_id===id&&x.kitchenFilling?.pull==="92253")',ids['drawers-three'])
    with page.expect_download() as downloaded:page.locator('#export-bazis').click()
    payload=json.loads(Path(downloaded.value.path()).read_text())
    expected={it['bazis_id'] for it in projects.projects[pid]['scene']['items'] if it.get('kitchenFilling')}
    assert len(expected)==4 and len([r for r in payload['items'] if r.get('bazis_id') in expected])==4
    custom=next(r for r in payload['items'] if (r.get('construction') or {}).get('kitchen_filling',{}).get('pull')=='92253')['construction']
    assert next(p for p in custom['hardware']['items'] if p.get('article')=='92253')['quantity']==3
    assert any(p['machining'] for p in custom['adjusted_panels'])
    assert any((r.get('construction') or {}).get('pullout_dryer') for r in payload['items'])
    assert any((r.get('construction') or {}).get('cargo') for r in payload['items'])
    print('PASS four native fillings, custom handles, Gola, rear fitting, persisted scene and native export')
    print('PASS five cabinets, physical click, row heights, shelf fixings, mixed materials, sink, saved project and Z1 export')



def camera_views(page, projects, pid):
    """Exercise the real toolbar with GPU loss, recovery and a cold start without WebGL."""
    def ready():
        expect(page.locator('body')).to_have_attribute('data-planner-renderer', 'fallback', timeout=20000)
        assert page.evaluate('MF_PLANNER.scene.softwareRendering === true')
        expect(page.get_by_role('button', name='WebGL')).to_have_count(0)
        expect(page.locator('#planner-fallback, #planner-renderer-note')).to_have_count(0)

    def choose(selector, mode):
        button = page.locator(selector)
        button.click()
        expect(button).to_have_attribute('aria-pressed', 'true')
        assert page.evaluate('MF_PLANNER.scene.mode') == mode
        return page.locator('#scene').screenshot()

    assert page.evaluate('()=>MF_PLANNER.interaction.add({bazis:"bazis.3079d0656398"})')
    page.evaluate('()=>MF_PLANNER.bridge.save()')
    page.evaluate('id=>MF_PLANNER.bridge.open(id)', pid)
    items = page.evaluate('MF_PLANNER.adapter.items')
    assert len(items) == 1
    choose('#planner-front', 'front')
    page.evaluate('MF_PLANNER.scene.renderer.forceContextLoss()')
    ready()
    expect(page.locator('#planner-front')).to_have_attribute('aria-pressed', 'true')
    front = choose('#planner-front', 'front')
    top = choose('#mode-2d', 'top')
    angle = choose('#mode-3d', '3d')
    wait_for_state(page, """() => {
        const scene=MF_PLANNER.scene, canvas=scene.canvas;
        return canvas.width>=canvas.clientWidth && scene.factory.boardRelief.image?.naturalWidth===512;
    }""")
    assert len({front, top, angle}) == 3
    assert page.evaluate('MF_PLANNER.scene.controls.enableRotate')
    assert page.evaluate('MF_PLANNER.adapter.items') == items
    page.locator('#planner-client').click()
    page.locator('#planner-front').click()
    expect(page.locator('#planner-front')).to_have_attribute('aria-pressed', 'true')
    assert page.evaluate('MF_PLANNER.scene.clientView') == 'front'
    page.locator('#planner-client').click()
    choose('#mode-2d', 'top')
    page.evaluate('()=>MF_PLANNER.bridge.save()')
    page.reload(wait_until='domcontentloaded')
    page.locator('#planner-assistant').wait_for(state='attached')
    page.evaluate('id=>MF_PLANNER.bridge.open(id)', pid)
    expect(page.locator('body')).to_have_attribute('data-planner-renderer', 'webgl')
    expect(page.locator('#mode-2d')).to_have_attribute('aria-pressed', 'true')
    assert page.evaluate('MF_PLANNER.adapter.items') == items

    page.add_init_script("""const getContext=HTMLCanvasElement.prototype.getContext; let probes=0;
      HTMLCanvasElement.prototype.getContext=function(type,...args){
        if(type!=='webgl2')return getContext.call(this,type,...args);
        if(probes++===0)return null;
        throw new DOMException('WebGL disabled','SecurityError');
      };""")
    page.reload(wait_until='domcontentloaded')
    page.locator('#planner-assistant').wait_for(state='attached')
    page.evaluate('id=>MF_PLANNER.bridge.open(id)', pid)
    ready()
    choose('#mode-2d', 'top')
    choose('#planner-front', 'front')
    old_canvas = page.locator('#scene').element_handle()
    page.evaluate('()=>MF_PLANNER.startRenderer()')
    assert page.evaluate('old=>!old.isConnected', old_canvas)
    ready()
    expect(page.locator('#planner-front')).to_have_attribute('aria-pressed', 'true')
    choose('#mode-3d', '3d')
    assert page.locator('.mf3d-canvas-wrap canvas').count() == 1
    assert page.evaluate('MF_PLANNER.adapter.items') == items
    page.evaluate('()=>MF_PLANNER.bridge.save()')
    assert projects.projects[pid]['scene']['view_mode'] == '3d'
    print('PASS top/front/3D, client front, context loss and recovery, disabled WebGL at startup')


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
    exercise(a.live,camera_views)
    exercise(a.live,check)
