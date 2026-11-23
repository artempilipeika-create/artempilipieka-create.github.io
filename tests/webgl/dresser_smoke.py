"""Build a floor dresser, convert it to a floating media cabinet and check its native parts."""
import argparse
import json
from pathlib import Path

from playwright.sync_api import expect
from wardrobe_niche_smoke import exercise, ORIGIN, ROOT
from wardrobe_surround_smoke import button, field, finish, panels
from backend.v2.three_d_api import Scene
from backend.v2.sales_hardware import ledger


def open_saved(page, project_id):
    page.reload(wait_until='domcontentloaded')
    page.locator('#planner-dresser').wait_for(state='attached')
    page.evaluate('id=>MF_PLANNER.bridge.open(id)', project_id)
    page.locator('#cabinet-edit').click()
    form=page.locator('#planner-assistant-dialog')
    expect(form.get_by_role('heading', name='Комод', exact=True)).to_be_visible()
    expect(field(form, 'Действие с комодом')).to_have_value('update')
    return form


def check_preview_layout(page, form):
    picture = form.locator('.wardrobe-figure .questionnaire-studio')
    diagram = form.locator('.dresser-front-view svg')
    dimensions = form.locator('.assistant-drawing p').first
    original = page.viewport_size
    try:
        for width, height in ((1440, 900), (390, 844)):
            page.set_viewport_size({'width': width, 'height': height})
            expect(picture).to_be_visible()
            expect(diagram).to_be_visible()
            expect(dimensions).to_contain_text('Корпус')
            photo, scheme, caption = [element.bounding_box() for element in (picture, diagram, dimensions)]
            assert photo and scheme and caption, (width, photo, scheme, caption)
            for visual in (photo, scheme):
                assert visual['y'] + visual['height'] <= caption['y'] + 1, (width, visual, caption)
            if width == 390:
                assert photo['y'] + photo['height'] <= scheme['y'] + 1, (photo, scheme)
            button(form, 'Развернуть схему').click()
            expanded = diagram.bounding_box()
            assert expanded and expanded['height'] > scheme['height'] + 25, (width, scheme, expanded)
            button(form, 'Вернуться к анкете').click()
    finally:
        page.set_viewport_size(original)


def scenario(page, projects, project_id):
    page.locator('#planner-dresser').click()
    form=page.locator('#planner-assistant-dialog')
    expect(field(form, 'Название изделия')).to_have_value('Комод 01')
    button(form,'Собрать самому').click()
    expect(field(form,'Количество секций')).to_have_value('1')
    button(form,'1. Корпус').click()
    button(form,'Пройти опрос').click()
    field(form,'Сколько нужно шуфляд?').select_option('3')
    button(form,'Применить результат опроса').click()
    expect(field(form,'Наполнение секции')).to_have_value('drawers')
    button(form,'Секция 2').click()
    expect(field(form,'Наполнение секции')).to_have_value('shelves')
    portrait=form.locator('.wardrobe-figure .questionnaire-studio')
    expect(portrait).to_be_visible()
    closed=portrait.evaluate('(canvas) => canvas.toDataURL()')
    button(form,'Вид наполнения').click()
    expect(portrait).to_have_attribute('aria-label','Комод · вид наполнения')
    expect(portrait).to_be_visible()
    assert portrait.evaluate('(canvas) => canvas.toDataURL()') != closed
    check_preview_layout(page, form)
    finish(page,form)
    group,spec,parts=panels(projects,project_id)
    assert spec['dresser']['installation']=='floor' and parts['plinth']['height']==97
    assert 'door-section-1-right' in parts and 'drawer-0-2-face' in parts
    Scene.model_validate(projects.projects[project_id]['scene'])
    print('PASS manual entry, questionnaire, floor plinth, exterior drawers and automatic doors',flush=True)

    form=open_saved(page,project_id)
    field(form,'Тип установки').select_option('wall')
    expect(form.get_by_text('Накладные под цоколь',exact=True)).to_have_count(0)
    field(form,'Ширина, мм').fill('1600')
    field(form,'Высота корпуса, мм').fill('600')
    field(form,'Глубина корпуса, мм').fill('480')
    field(form,'От пола до низа корпуса, мм').fill('330')
    field(form,'Задняя стенка').select_option('perimeter')
    button(form,'Выбрать готовое наполнение').click()
    expect(form.locator('.dresser-presets img[src*="-wall-"]')).to_have_count(6)
    expect(form.locator('.wardrobe-figure svg')).to_contain_text('От пола 330 мм')
    button(form,'Комод с нишей для техники').click()
    button(form,'Применить наполнение').click()
    button(form,'Скрытые PRIME · с доводчиком').click()
    form.get_by_text('Высоты фасадов шуфляд',exact=True).click()
    height=field(form,'Фасад 3 снизу, мм')
    height.fill('140')
    height.press('Tab')
    button(form,'Секция 2').click()
    field(form,'Вывод кабелей в задней стенке').select_option('center')
    height=field(form,'Высота открытой ниши в свету, мм')
    height.fill('220')
    height.press('Tab')
    button(form,'Секция 3').click()
    field(form,'Дверцы секции').select_option('left')
    button(form,'4. Фасады и ручки').click()
    form.locator('[data-dresser-pull="116550"]').click()
    button(form,'Секция 1').click()
    form.locator('[data-dresser-pull="127170"]').click()
    button(form,'1. Корпус').click()
    field(form,'Глубина корпуса, мм').fill('430')
    expect(form.locator('[data-rail-change]')).to_contain_text('450 → 400 мм')
    finish(page,form,update=True)
    final,spec,parts=panels(projects,project_id)
    assert final==group and spec['dresser']['installation']=='wall' and spec['backMount']['layout']=='perimeter'
    assert 'feet' not in spec and 'plinth' not in parts and parts['left']['elevation_mm']==330
    assert spec['dresser']['bays'][0]['heights']==[None,None,140]
    assert [parts[f'drawer-0-{j}-face']['height'] for j in range(3)]==[225.5,225.5,140]
    assert [k for k in parts if k.startswith('door-section-')]==['door-section-2-left']
    scene=projects.projects[project_id]['scene']
    Scene.model_validate(scene)
    rows,_=ledger(scene)
    qty={r['article']:r['qty'] for r in rows}
    assert [qty[a] for a in ('113645','127170','112644','116550')]==[3,3,2,1],qty
    with page.expect_download() as download:
        page.locator('#export-bazis').click()
    rows=json.loads(Path(download.value.path()).read_text())['items']
    hinges=[r for r in rows if r.get('joined_panel_id')==group+':door-section-2-left' and r.get('article')=='112644']
    assert len(hinges)==2 and all(r['host_blank_id']==group+':divider-1' for r in hinges)
    rear=next(r for r in rows if r.get('blank_item_id')==group+':back')
    assert '800.5 мм, от низа корпуса 128 мм' in rear['production_note']
    print('PASS floating conversion, 3 bays, custom drawer height, rail refit, purchase list, cable mark and native divider hinges',flush=True)
    form=open_saved(page,project_id)
    expect(field(form,'Тип установки')).to_have_value('wall')
    expect(field(form,'От пола до низа корпуса, мм')).to_have_value('330')
    button(form,'3. Наполнение').click()
    form.locator('[data-dresser-section="1"]').focus()
    form.locator('[data-dresser-section="1"]').press('Enter')
    expect(field(form,'Вывод кабелей в задней стенке')).to_have_value('center')
    field(form,'Вывод кабелей в задней стенке').select_option('right')
    finish(page,form,update=True)
    after,spec,_=panels(projects,project_id)
    assert after==group and spec['dresser']['bays'][1]['cable']=='right'
    Scene.model_validate(projects.projects[project_id]['scene'])
    print('PASS reopen saved dresser, select a bay on the drawing, edit and save the same group',flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live',action='store_true')
    args=parser.parse_args()
    def run(page, projects, project_id):
        if args.live:
            for name in ('dresser-layout.mjs','dresser-ui.mjs','assistant-ui.mjs','assistant.css'):
                asset=page.request.get(ORIGIN+'/account/planner/'+name,max_redirects=0)
                assert asset.status==200 and asset.body()==(ROOT/'backend/v2/cabinet_assets/planner'/name).read_bytes(),name
        scenario(page,projects,project_id)
    exercise(args.live,run)
