"""Save, reopen, edit and export two wardrobes through the manager's real form.

Run with Playwright Chromium and the backend dependencies installed. Add --live
to check the published assets; both modes intercept project writes in memory.
"""
import argparse
import json
import re
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

from playwright.sync_api import expect

from wardrobe_niche_smoke import ORIGIN, ROOT, exercise


def field(container, name):
    return container.get_by_label(name, exact=True)


def button(container, name):
    return container.get_by_role('button', name=name, exact=True)


def finish(page, form, update=False):
    button(form, '5. Материалы').click()
    button(form, 'Проверить по размерам').click()
    action = button(form, 'Применить изменения' if update else 'Добавить в проект')
    if not action.is_visible():
        raise AssertionError(form.locator(':scope > [role="status"]').inner_text())
    action.click()
    expect(form).not_to_be_visible()
    page.evaluate('() => MF_PLANNER.bridge.save()')


def reopen(page, project_id):
    # A new document discards in-memory form and model state.
    page.reload(wait_until='domcontentloaded')
    page.locator('#planner-assistant').wait_for(state='attached')
    page.evaluate('id => MF_PLANNER.bridge.open(id)', project_id)
    page.locator('#planner-assistant').click()
    form = page.locator('#planner-assistant-dialog')
    field(form, 'Действие со шкафом').select_option('update')
    return form


def panels(projects, project_id):
    boards = projects.projects[project_id]['scene']['items']
    groups = {b['assistant_carcass']['group_id'] for b in boards}
    assert len(groups) == 1, groups
    by_key = {b['item_id'].rsplit(':', 1)[1]: b for b in boards}
    assert len(by_key) == len(boards)
    return groups.pop(), boards[0]['assistant_carcass']['spec'], by_key


def front(board):
    return board['z'] + board['depth'] / 2


def verify_assembly(parts, upper_height, projection, end_side, doors, divider):
    roof = parts['top']
    upper_floor = parts['mezz-bottom']
    y = roof['elevation_mm'] + roof['height']
    assert upper_floor['height'] == parts['mezz-top']['height'] == 18
    assert upper_floor['elevation_mm'] == y
    assert parts['mezz-top']['elevation_mm'] + 18 == y + upper_height
    assert parts['mezz-left']['width'] == parts['mezz-right']['width'] == 18
    assert parts['mezz-left']['height'] == parts['mezz-right']['height'] == upper_height
    assert ('mezz-divider' in parts) is divider
    assert {k for k in parts if k.startswith('mezz-door-')} == set(doors)
    for key in doors:
        door = parts[key]
        assert door['z'] - door['depth'] / 2 - front(parts['mezz-left']) == 2
        assert front(door) == front(parts['trim-cap-face'])
    assert parts['trim-cap-face']['elevation_mm'] == y + upper_height
    assert front(parts['trim-' + end_side + '-end']) - front(parts[end_side]) == projection


def native_export(page, trims, doors, article, lift):
    with page.expect_download() as event:
        page.locator('#export-bazis').click()
    export = json.loads(Path(event.value.path()).read_text())
    assert tuple(map(int, export['minimum_importer'].split('.'))) >= (9, 9, 42)
    rows = export['items']
    assert {r['source_file'] for r in rows if r.get('wardrobe_trim')} == set(trims)
    upper = [r for r in rows if r.get('cabinet_block', {}).get('module_key') == 'mezzanine']
    assert {r['cabinet_block']['module_name'] for r in upper} == {'Антресоль'}
    pushes = [r for r in upper if r.get('push_part') == 'body']
    assert {r['joined_panel_id'].rsplit(':', 1)[1] for r in pushes} == set(doors)
    assert all(r['article'] == article for r in pushes)
    hinges = [r for r in upper if r.get('door_side') and not r.get('push_part')]
    if lift:
        assert all(r['host_blank_id'].endswith(':mezz-bottom') for r in pushes)
        assert not hinges
    else:
        catalog = ROOT / 'backend/v2/cabinet_assets/planner/wardrobe-prime-hinges.json'
        closing = {hinge['article']: hinge['closing'] for hinge in json.loads(catalog.read_text())}
        assert all(closing.get(r['article']) == 'springless' for r in hinges)


def open_surround(form):
    button(form, 'Фальшпланки и антресоль').click()
    return (form.get_by_role('group', name='Слева', exact=True),
            form.get_by_role('group', name='Справа', exact=True))


def open_upper_fronts(form):
    button(form, '4. Фасады').click()
    button(form, 'Антресоль').click()
    return form.get_by_role('group', name='Фасады антресоли', exact=True)


def picture(upper, article):
    card = upper.locator(f'button[data-push-article="{article}"]')
    expect(card).to_have_attribute('aria-pressed', 'true')
    expect(card.locator('figcaption')).to_contain_text(article)
    assert card.locator('img').evaluate('async img => {await img.decode(); return img.naturalWidth > 0;}')


def surround_scenarios(page, projects, first_id):
    expect(page.locator('body')).to_have_attribute('data-planner-renderer', 'webgl')
    second_id = str(uuid4())
    projects.projects[second_id] = {
        **deepcopy(projects.projects[first_id]), 'project_id': second_id, 'name': 'QA · один подъёмный фасад'}

    page.locator('#planner-assistant').click()
    form = page.locator('#planner-assistant-dialog')
    field(form, 'Ширина, мм').fill('1000')
    field(form, 'Высота корпуса, мм').fill('2100')
    field(form, 'Глубина ЛДСП, мм').fill('600')
    left, right = open_surround(form)
    field(left, 'Исполнение слева').select_option('filler')
    field(left, 'Ширина лица, мм').fill('100')
    field(left, 'Высота детали, мм').fill('2000')
    field(left, 'Низ детали от пола, мм').fill('20')
    field(right, 'Исполнение справа').select_option('end')
    expect(field(right, 'Выступ от переднего торца боковины, мм')).to_have_value('20')
    field(right, 'Низ детали от пола, мм').fill('40')
    field(form, 'Добавить отдельный модуль антресоли').check()
    field(form, 'Перегородка').select_option('yes')
    field(form, 'Высота модуля, мм').fill('480')
    field(right, 'Высота боковой детали').select_option('custom')
    expect(field(right, 'Высота детали, мм')).to_have_value('2540')
    field(right, 'Высота боковой детали').select_option('full')
    field(form, 'Добавить потолочную закладную').check()
    drawing = form.locator('.wardrobe-figure svg[data-view="surround"]')
    expect(drawing).to_contain_text('1118 мм')
    expect(drawing).to_contain_text('2660 мм')
    button(form, '4. Фасады').click()
    field(form, 'Исполнение фасада').select_option('pair')
    button(form, 'Антресоль').click()
    upper = form.get_by_role('group', name='Фасады антресоли', exact=True)
    expect(field(upper, 'Количество створок')).to_have_value('2')
    expect(upper).to_contain_text('беспружинные петли')
    picture(upper, '70787')
    upper.get_by_role('button', name=re.compile('Усиленный')).click()
    field(upper, 'Монтаж типона').select_option('bored')
    field(upper, 'Цвет типона').select_option('черный')
    picture(upper, '72257')
    field(upper, 'Цвет типона').select_option('серый')
    picture(upper, '72258')
    finish(page, form)
    first_group, spec, parts = panels(projects, first_id)
    assert spec['width'] == 1000 and spec['surround']['left']['height'] == 2000
    assert parts['trim-left-face']['elevation_mm'] == 20
    pair = ['mezz-door-left', 'mezz-door-right']
    verify_assembly(parts, 480, 20, 'right', pair, True)

    form = reopen(page, first_id)
    left, right = open_surround(form)
    expect(field(left, 'Ширина лица, мм')).to_have_value('100')
    expect(field(right, 'Высота боковой детали')).to_have_value('full')
    field(left, 'Ширина лица, мм').fill('125')
    expect(drawing).to_contain_text('1143 мм')
    upper = open_upper_fronts(form)
    expect(field(upper, 'Монтаж типона')).to_have_value('bored')
    picture(upper, '72258')
    finish(page, form, update=True)
    group, spec, parts = panels(projects, first_id)
    assert group == first_group and spec['surround']['left']['width'] == 125
    assert spec['width'] == 1000 and parts['trim-left-face']['width'] == 125
    native_export(page, ['MF_Trim_Left.fr3d', 'MF_Trim_End.fr3d', 'MF_Trim_Ceiling.fr3d'],
                  pair, '72258', lift=False)
    print('PASS two swing doors, 2 mm action gap, 20 mm end projection, updated left filler and native export')

    page.evaluate('id => MF_PLANNER.bridge.open(id)', second_id)
    page.locator('#planner-assistant').click()
    field(form, 'Ширина, мм').fill('600')
    field(form, 'Высота корпуса, мм').fill('2000')
    field(form, 'Глубина ЛДСП, мм').fill('600')
    left, right = open_surround(form)
    field(left, 'Исполнение слева').select_option('end')
    field(left, 'Глубина торцевой стойки, мм').fill('120')
    field(left, 'Выступ от переднего торца боковины, мм').fill('35')
    field(right, 'Исполнение справа').select_option('filler')
    field(right, 'Ширина лица, мм').fill('80')
    field(right, 'Высота боковой детали').select_option('body')
    field(right, 'Низ детали от пола, мм').fill('50')
    field(form, 'Добавить отдельный модуль антресоли').check()
    field(form, 'Высота модуля, мм').fill('360')
    field(form, 'Добавить потолочную закладную').check()
    field(form, 'Высота закладной, мм').fill('60')
    field(form, 'Длина закладной').select_option('custom')
    field(form, 'Длина по центру шкафа, мм').fill('720')
    expect(drawing).to_contain_text('740 мм')
    expect(drawing).to_contain_text('2420 мм')
    upper = open_upper_fronts(form)
    field(upper, 'Количество створок').select_option('1')
    field(upper, 'Петли').select_option('right')
    finish(page, form)
    second_group, spec, parts = panels(projects, second_id)
    single = ['mezz-door-right']
    verify_assembly(parts, 360, 35, 'left', single, False)
    assert parts['trim-right-face']['height'] == 1950 and parts['trim-cap-face']['width'] == 720

    form = reopen(page, second_id)
    upper = open_upper_fronts(form)
    expect(field(upper, 'Петли')).to_have_value('right')
    field(upper, 'Как открываются').select_option('lift')
    expect(upper).to_contain_text('газлифта')
    field(upper, 'Монтаж типона').select_option('surface')
    field(upper, 'Наконечник').select_option('rubber')
    picture(upper, '115823')
    finish(page, form, update=True)
    group, spec, parts = panels(projects, second_id)
    assert group == second_group
    assert spec['surround']['upper']['opening'] == 'lift'
    assert spec['surround']['upper']['push']['article'] == '115823'
    verify_assembly(parts, 360, 35, 'left', single, False)
    native_export(page, ['MF_Trim_Right.fr3d', 'MF_Trim_End.fr3d', 'MF_Trim_Ceiling.fr3d'],
                  single, '115823', lift=True)
    assert projects.writes >= 4
    print('PASS single door, right-mounted swing updated to lift, bottom-mounted TIP-ON, native export')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true')
    args = parser.parse_args()

    def run(page, projects, first_id):
        if args.live:
            for name in ('assistant-ui.mjs', 'wardrobe-surround-ui.mjs', 'wardrobe-surround.mjs',
                         'wardrobe-surround-drawing.mjs', 'wardrobe-push-product-ui.mjs'):
                asset = page.request.get(ORIGIN + '/account/planner/' + name, max_redirects=0)
                assert asset.status == 200 and asset.body() == (ROOT / 'backend/v2/cabinet_assets/planner' / name).read_bytes(), name
        surround_scenarios(page, projects, first_id)

    exercise(args.live, run)
