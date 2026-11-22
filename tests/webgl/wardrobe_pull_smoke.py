"""Install different handles on two doors, save, reopen, edit and export both."""
import argparse
import json
from pathlib import Path

from playwright.sync_api import expect

from wardrobe_niche_smoke import exercise
from wardrobe_surround_smoke import button, field, finish, panels, reopen


def choose(form, article):
    card = form.locator(f'[data-pull-article="{article}"]')
    expect(card.locator('img')).to_have_attribute('src', f'/account/planner/door-photos/aks-{article}.webp')
    expect(card.locator('figcaption')).to_contain_text('AKS ' + article)
    card.click()
    expect(card).to_have_attribute('aria-pressed', 'true')
    assert card.locator('img').evaluate('async i => { await i.decode(); return i.naturalWidth > 0; }')


def installed(page, view, door, article, degrees):
    page.wait_for_function("""([view, door, article, degrees]) => {
        const app = window.MF_PLANNER;
        const cabinet = view === 'preview' ? app.assistant.livePreview : app.scene;
        if (view === 'preview' && cabinet.root.hidden) return false;
        const item = cabinet.adapter.items.find(it => it.item_id.endsWith(':' + door));
        const group = cabinet.entries.get(item?.item_id)?.group;
        const pull = group?.children.find(mesh => mesh.isMesh && mesh.userData.frontAccessory && mesh.userData.article === article);
        return Boolean(pull?.visible && group.visible && Math.abs(pull.rotation.z * 180 / Math.PI - degrees) < 0.01);
    }""", arg=[view, door, article, degrees])


def pulls(page, projects, project_id):
    page.locator('#planner-assistant').click()
    form = page.locator('#planner-assistant-dialog')
    field(form, 'Ширина, мм').fill('1000')
    button(form, '4. Фасады').click()
    field(form, 'Исполнение фасада').select_option('pair')
    picker = field(form, 'Выбранный фасад')
    picker.select_option('door-left')
    button(form, 'Рейлинговые ручки AKS').click()
    field(form, 'Межосевое расстояние').select_option('320')
    choose(form, '89080')
    expect(button(form, 'Модель БАЗИС')).to_have_count(0)
    expect(button(form, 'Фото АКС')).to_have_count(0)
    expect(form.locator('.wardrobe-live canvas')).to_be_visible()
    installed(page, 'preview', 'door-left', '89080', 90)
    button(form, 'Горизонтально').click()
    expect(button(form, 'Горизонтально')).to_have_attribute('aria-pressed', 'true')
    installed(page, 'preview', 'door-left', '89080', 0)
    picker.select_option('door-right')
    button(form, 'Скобы').click()
    field(form, 'Серия скобы').select_option('ps15')
    choose(form, '52188')
    expect(button(form, 'Вертикально')).to_have_attribute('aria-pressed', 'true')
    installed(page, 'preview', 'door-right', '52188', 90)
    finish(page, form)
    installed(page, 'scene', 'door-left', '89080', 0)
    installed(page, 'scene', 'door-right', '52188', 90)
    group, spec, _ = panels(projects, project_id)
    assert {k:v['article'] for k,v in spec['front']['handles'].items()} == {'door-left':'89080', 'door-right':'52188'}
    form = reopen(page, project_id)
    button(form, '4. Фасады').click()
    field(form, 'Выбранный фасад').select_option('door-left')
    expect(form.locator('[data-pull-article="89080"]')).to_have_attribute('aria-pressed', 'true')
    expect(button(form, 'Горизонтально')).to_have_attribute('aria-pressed', 'true')
    button(form, 'Вертикально').click()
    finish(page, form, update=True)
    installed(page, 'scene', 'door-left', '89080', 90)
    edited_group, spec, _ = panels(projects, project_id)
    assert edited_group == group
    assert spec['front']['handles']['door-right']['article'] == '52188'
    with page.expect_download() as event:
        page.locator('#export-bazis').click()
    payload = json.loads(Path(event.value.path()).read_text())
    assert payload['minimum_importer'] == '9.9.51'
    rows = [row for row in payload['items'] if row.get('wardrobe_catalogue_pull')]
    assert {(r['article'], r['handle_roll_deg'], r['host_blank_id'].rsplit(':',1)[-1]) for r in rows} == {
        ('89080', 90, 'door-left'), ('52188', 90, 'door-right')}
    print('PASS supplier photographs select mounted handles on both doors, with independent rotations, persistent project and native export', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', action='store_true')
    exercise(parser.parse_args().live, pulls)
