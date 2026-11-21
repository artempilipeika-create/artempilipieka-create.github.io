"""Save, reopen, edit and export wardrobes and restore an older manager form.

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


def check_trim(parts, side, roles, intervals):
    """Intervals are absolute bottom elevations and finished lengths, in mm."""
    for role in roles:
        keys = [f'trim-{side}-' + (f'{i + 1}-' if i else '') + role for i in range(len(intervals))]
        actual_keys = {key for key in parts if re.fullmatch(f'trim-{side}-(?:[0-9]+-)?{role}', key)}
        assert actual_keys == set(keys), (role, actual_keys, keys)
        for key, (bottom, length) in zip(keys, intervals, strict=True):
            panel = parts[key]
            assert (panel['elevation_mm'], panel['height']) == (bottom, length), (key, panel, intervals)
            assert 100 <= length <= 2780


def check_native_lengths(rows, source, expected):
    actual = sorted(row['target']['height'] for row in rows if row.get('source_file') == source)
    assert actual == sorted(expected), (source, actual, expected)


def native_export(page, trims, doors, article, lift):
    with page.expect_download() as event:
        page.locator('#export-bazis').click()
    export = json.loads(Path(event.value.path()).read_text())
    assert tuple(map(int, export['minimum_importer'].split('.'))) >= ((9, 9, 44) if trims else (9, 9, 42))
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
    return rows


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


TOTAL_HEIGHT = 'Общая высота шкафа от пола, мм'


def install_plinth_feet(form):
    button(form, 'Опоры').click()
    form.get_by_text('Накладные под цоколь', exact=True).click()
    field(form, 'Высота цокольных ножек, мм').select_option('100')
    form.locator('button[data-foot="86502"]').click()
    button(form, 'Цоколь').click()
    expect(form).to_contain_text('Опора 100 мм · цоколь с кромкой 97 мм')


def diagram_controls(page, form):
    drawing = form.locator('.wardrobe-figure svg[data-view="surround"]')
    original = page.viewport_size
    try:
        for width, height in [(1440, 1000), (390, 844)]:
            page.set_viewport_size({'width': width, 'height': height})
            frame = form.bounding_box()
            assert frame and frame['width'] >= width * .80 and frame['height'] >= height * .85, (width, height, frame)
            assert frame['x'] >= -1 and frame['x'] + frame['width'] <= width + 1, frame
            fields = form.locator('.assistant-fields').bounding_box()
            assert fields and fields['width'] >= width * (.37 if width > 800 else .82), (width, fields)
            before = drawing.bounding_box()
            button(form, 'Развернуть схему').click()
            restore = button(form, 'Вернуться к анкете')
            expect(restore).to_be_visible()
            assert restore.get_attribute('aria-expanded') == 'true'
            expect(field(form, TOTAL_HEIGHT)).not_to_be_visible()
            expect(button(form, '5. Материалы')).not_to_be_visible()
            after = drawing.bounding_box()
            assert before and after and after['height'] > before['height'] + 25, (width, before, after)
            restore.click()
            expect(field(form, TOTAL_HEIGHT)).to_be_visible()
            print(f'PASS {width}×{height}: dialog {frame["width"]:.0f}×{frame["height"]:.0f}, '
                  f'fields {fields["width"]:.0f}, diagram {before["width"]:.0f}×{before["height"]:.0f} → {after["width"]:.0f}×{after["height"]:.0f}')
    finally:
        page.set_viewport_size(original)


def legacy_copy(projects, source_id):
    # Pre-upgrade wardrobes stored a board height, not a total. An end post
    # could have a finished height and a bottom offset, with no dynamic datum.
    legacy_id = str(uuid4())
    project = deepcopy(projects.projects[source_id])
    project.update(project_id=legacy_id, name='QA · прежний шкаф с типоном', version=1)
    scene = project['scene']
    previous = scene['items'][0]['assistant_carcass']
    position = previous['position']
    # Removing the left filler moves the assembly centre half its width in
    # local +X. Each remaining panel keeps its original world coordinates.
    delta = previous['spec']['surround']['left']['width'] / 2
    dx, dz = {0: (delta, 0), 90: (0, delta), 180: (-delta, 0), 270: (0, -delta)}[position['rotation']]
    new_position = {**position, 'x': position['x'] + dx, 'z': position['z'] + dz}
    scene['items'] = [b for b in scene['items'] if ':trim-left-' not in b['item_id']]
    for b in scene['items']:
        b['assistant_carcass']['position'] = new_position.copy()
        spec = b['assistant_carcass']['spec']
        spec.pop('overallHeight', None)
        spec['surround'].pop('left', None)
        right = spec['surround']['right']
        right.update(heightMode='custom', height=2753, bottom=97)
        right.pop('split', None)
        right.pop('start', None)
    scene['selected_item_id'] = next(b['item_id'] for b in scene['items'] if b['item_id'].endswith(':left'))
    projects.projects[legacy_id] = project
    return legacy_id


def surround_scenarios(page, projects, first_id):
    expect(page.locator('body')).to_have_attribute('data-planner-renderer', 'webgl')
    projects.projects[first_id]['scene']['room']['height'] = 3200
    page.evaluate('id => MF_PLANNER.bridge.open(id)', first_id)
    second_id = str(uuid4())
    projects.projects[second_id] = {
        **deepcopy(projects.projects[first_id]), 'project_id': second_id, 'name': 'QA · один подъёмный фасад'}

    page.locator('#planner-assistant').click()
    form = page.locator('#planner-assistant-dialog')
    field(form, 'Ширина, мм').fill('1000')
    field(form, TOTAL_HEIGHT).fill('2850')
    field(form, 'Глубина ЛДСП, мм').fill('600')
    install_plinth_feet(form)
    left, right = open_surround(form)
    expect(field(form, TOTAL_HEIGHT)).to_have_value('2850')
    field(left, 'Исполнение слева').select_option('filler')
    field(left, 'Ширина лица, мм').fill('100')
    field(left, 'Высота боковой детали').select_option('assembly')
    field(left, 'Нижний край планки').select_option('floor')
    field(left, 'Стык планки').select_option('auto')
    field(right, 'Исполнение справа').select_option('end')
    expect(field(right, 'Выступ от переднего торца боковины, мм')).to_have_value('20')
    field(right, 'Высота боковой детали').select_option('assembly')
    field(right, 'Нижний край планки').select_option('plinth')
    field(right, 'Стык планки').select_option('auto')
    left_cuts = left.locator('[data-trim-result="left"]')
    expect(left_cuts).to_contain_text('в раскрой 1425 + 1425 мм')
    field(left, 'Высота боковой детали').select_option('custom')
    field(left, 'Высота детали, мм').fill('2780')
    expect(left_cuts).to_contain_text('в раскрой 2780 мм')
    field(left, 'Высота детали, мм').fill('2780.5')
    expect(left_cuts).to_contain_text('в раскрой 1390,25 + 1390,25 мм')
    field(left, 'Высота боковой детали').select_option('assembly')
    field(form, 'Добавить отдельный модуль антресоли').check()
    field(form, 'Перегородка').select_option('yes')
    field(form, 'Высота модуля, мм').fill('500')
    field(form, 'Добавить потолочную закладную').check()
    expect(field(form, 'Высота закладной, мм')).to_have_value('80')
    field(right, 'Высота боковой детали').select_option('custom')
    expect(field(right, 'Высота детали, мм')).to_have_value('2750')
    field(right, 'Высота боковой детали').select_option('assembly')
    expect(left_cuts).to_contain_text('в раскрой 2270 + 580 мм')
    expect(right.locator('[data-trim-result="right"]')).to_contain_text('в раскрой 2750 мм')
    drawing = form.locator('.wardrobe-figure svg[data-view="surround"]')
    expect(drawing).to_contain_text('1118 мм')
    expect(drawing).to_contain_text('2850 мм')
    diagram_controls(page, form)
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
    assert (spec['width'], spec['height'], spec['overallHeight'], spec['feet']['article']) == (1000, 2170, 2850, '86502')
    assert parts['plinth']['elevation_mm'] == 0 and parts['plinth']['height'] == 97
    assert parts['bottom']['elevation_mm'] == 100
    check_trim(parts, 'left', ['face', 'return'], [(0, 2270), (2270, 580)])
    check_trim(parts, 'right', ['end'], [(100, 2750)])
    pair = ['mezz-door-left', 'mezz-door-right']
    verify_assembly(parts, 500, 20, 'right', pair, True)

    form = reopen(page, first_id)
    expect(field(form, TOTAL_HEIGHT)).to_have_value('2850')
    left, right = open_surround(form)
    expect(field(left, 'Ширина лица, мм')).to_have_value('100')
    expect(field(right, 'Нижний край планки')).to_have_value('plinth')
    expect(field(left, 'Стык планки')).to_have_value('auto')
    field(right, 'Нижний край планки').select_option('plinthEdge')
    field(left, 'Ширина лица, мм').fill('125')
    expect(drawing).to_contain_text('1143 мм')
    upper = open_upper_fronts(form)
    expect(field(upper, 'Монтаж типона')).to_have_value('bored')
    picture(upper, '72258')
    finish(page, form, update=True)
    group, spec, parts = panels(projects, first_id)
    assert group == first_group and spec['surround']['left']['width'] == 125
    assert spec['height'] == 2170 and parts['trim-left-2-face']['width'] == 125
    check_trim(parts, 'left', ['face', 'return'], [(0, 2270), (2270, 580)])
    check_trim(parts, 'right', ['end'], [(97, 2753)])
    rows = native_export(page, ['MF_Trim_Left.fr3d', 'MF_Trim_End.fr3d', 'MF_Trim_Ceiling.fr3d'],
                         pair, '72258', lift=False)
    check_native_lengths(rows, 'MF_Trim_Left.fr3d', [2270, 580])
    check_native_lengths(rows, 'MF_Trim_End.fr3d', [2753])
    old_id = legacy_copy(projects, first_id)
    print('PASS total 2850; automatic 2270 + 580 at the module joint, 2750 from support or 2753 from finished plinth')

    page.evaluate('id => MF_PLANNER.bridge.open(id)', second_id)
    page.locator('#planner-assistant').click()
    field(form, 'Ширина, мм').fill('600')
    field(form, TOTAL_HEIGHT).fill('2600')
    field(form, 'Глубина ЛДСП, мм').fill('600')
    install_plinth_feet(form)
    left, right = open_surround(form)
    field(left, 'Исполнение слева').select_option('end')
    field(left, 'Глубина торцевой стойки, мм').fill('120')
    field(left, 'Выступ от переднего торца боковины, мм').fill('35')
    field(right, 'Исполнение справа').select_option('filler')
    field(right, 'Ширина лица, мм').fill('80')
    field(form, 'Добавить отдельный модуль антресоли').check()
    field(form, 'Высота модуля, мм').fill('500')
    field(form, 'Добавить потолочную закладную').check()
    field(form, 'Высота закладной, мм').fill('80')
    field(form, 'Длина закладной').select_option('custom')
    field(form, 'Длина по центру шкафа, мм').fill('560')
    field(left, 'Высота боковой детали').select_option('assembly')
    field(left, 'Нижний край планки').select_option('floor')
    field(left, 'Стык планки').select_option('joint')
    field(right, 'Высота боковой детали').select_option('assembly')
    field(right, 'Нижний край планки').select_option('floor')
    field(right, 'Стык планки').select_option('equal')
    expect(form.locator('[data-body-height]')).to_contain_text('2600 − 100 (опоры) − 500 (антресоль) − 80 (закладная) = 1920 мм')
    expect(left.locator('[data-trim-result="left"]')).to_contain_text('в раскрой 2020 + 580 мм')
    expect(right.locator('[data-trim-result="right"]')).to_contain_text('в раскрой 1300 + 1300 мм')
    expect(drawing).to_contain_text('698 мм')
    expect(drawing).to_contain_text('2600 мм')
    button(form, '4. Фасады').click()
    field(form, 'Исполнение фасада').select_option('right')
    button(form, 'Антресоль').click()
    upper = form.get_by_role('group', name='Фасады антресоли', exact=True)
    field(upper, 'Количество створок').select_option('1')
    field(upper, 'Петли').select_option('right')
    finish(page, form)
    second_group, spec, parts = panels(projects, second_id)
    single = ['mezz-door-right']
    verify_assembly(parts, 500, 35, 'left', single, False)
    assert spec['height'] == 2600 - 100 - 500 - 80 == 1920
    assert parts['bottom']['elevation_mm'] == 100 and parts['trim-cap-face']['width'] == 560
    check_trim(parts, 'left', ['end'], [(0, 2020), (2020, 580)])
    check_trim(parts, 'right', ['face', 'return'], [(0, 1300), (1300, 1300)])

    form = reopen(page, second_id)
    expect(field(form, TOTAL_HEIGHT)).to_have_value('2600')
    left, right = open_surround(form)
    expect(field(left, 'Стык планки')).to_have_value('joint')
    expect(field(right, 'Стык планки')).to_have_value('equal')
    field(left, 'Нижний край планки').select_option('custom')
    field(left, 'Нижняя отметка от пола, мм').fill('50')
    field(right, 'Нижний край планки').select_option('facade')
    field(right, 'Стык планки').select_option('auto')
    field(form, 'Длина закладной').select_option('over')
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
    assert spec['height'] == 1920
    assert spec['surround']['upper']['opening'] == 'lift'
    assert spec['surround']['upper']['push']['article'] == '115823'
    verify_assembly(parts, 500, 35, 'left', single, False)
    lower_edge = parts['door-right']['elevation_mm']
    # The cap covers the unequal 18/80 mm trims, both meeting its underside.
    cap = parts['trim-cap-face']
    left_edge = parts['trim-left-end']['x'] - 9
    right_edge = parts['trim-right-face']['x'] + 40
    assert cap['width'] == right_edge - left_edge == 698
    assert cap['x'] == (left_edge + right_edge) / 2
    assert spec['surround']['cap']['fit'] == 'over'
    check_trim(parts, 'left', ['end'], [(50, 1970), (2020, 500)])
    check_trim(parts, 'right', ['face', 'return'], [(lower_edge, 2520 - lower_edge)])
    rows = native_export(page, ['MF_Trim_Right.fr3d', 'MF_Trim_End.fr3d', 'MF_Trim_Ceiling.fr3d'],
                         single, '115823', lift=True)
    check_native_lengths(rows, 'MF_Trim_End.fr3d', [1970, 500])
    check_native_lengths(rows, 'MF_Trim_Right.fr3d', [2520 - lower_edge])
    assert projects.writes >= 4
    print('PASS total 2600; 1920 body, forced module/equal joints, custom and door-edge datums, bottom-mounted lift TIP-ON')

    writes = projects.writes
    form = reopen(page, old_id)
    expect(field(form, TOTAL_HEIGHT)).to_have_value('2850')
    assert projects.writes == writes
    field(form, TOTAL_HEIGHT).fill('2860')
    left, right = open_surround(form)
    expect(field(left, 'Исполнение слева')).to_have_value('none')
    expect(field(right, 'Высота детали, мм')).to_have_value('2753')
    field(form, 'Высота модуля, мм').fill('520')
    expect(field(form, TOTAL_HEIGHT)).to_have_value('2860')
    upper = open_upper_fronts(form)
    picture(upper, '72258')
    finish(page, form, update=True)
    group, spec, parts = panels(projects, old_id)
    assert group == first_group and (spec['overallHeight'], spec['height']) == (2860, 2160)
    check_trim(parts, 'right', ['end'], [(97, 2753)])
    assert parts['trim-cap-face']['elevation_mm'] == 2780
    rows = native_export(page, ['MF_Trim_End.fr3d', 'MF_Trim_Ceiling.fr3d'], pair, '72258', lift=False)
    check_native_lengths(rows, 'MF_Trim_End.fr3d', [2753])
    print('PASS legacy 2170 mm carcass reopened as 2850 total; changed total/upper retain 97 mm datum and 72258 hardware')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true')
    args = parser.parse_args()

    def run(page, projects, first_id):
        if args.live:
            for name in ('assistant-ui.mjs', 'assistant.css', 'wardrobe-questionnaire.mjs',
                         'wardrobe-surround-ui.mjs', 'wardrobe-surround.mjs', 'wardrobe-trim-layout.mjs',
                         'wardrobe-trim-native.mjs', 'wardrobe-surround-drawing.mjs', 'wardrobe-push-product-ui.mjs'):
                asset = page.request.get(ORIGIN + '/account/planner/' + name, max_redirects=0)
                assert asset.status == 200 and asset.body() == (ROOT / 'backend/v2/cabinet_assets/planner' / name).read_bytes(), name
        surround_scenarios(page, projects, first_id)

    exercise(args.live, run)
