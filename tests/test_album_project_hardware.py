from decimal import Decimal
from io import BytesIO

from pypdf import PdfReader

from backend.v2 import album_hardware, album_hardware_pdf, customer_hardware, customer_hardware_pdf, kitchen_album
from backend.v2.sales_album import fonts
from backend.v2.three_d_wall_special import VARIANTS
from backend.v2.wardrobe_estimate import calculate, customer_totals
from backend.v2.wardrobe_estimate_pdf import money
from tests.test_kitchen_album import image
from tests.test_kitchen_estimate import cabinet
from tests.test_wardrobe_lighting_kit import items


def door(owner, article, plate=None, push=False):
    setting = dict(article=article)
    if plate:
        setting['plate'] = plate
    if push:
        setting['push'] = True
    return dict(item_id=owner+':door-right', module_type='blank', blank_axis='front', width=480, depth=18, height=1811,
                assistant_carcass={'group_id':owner, 'spec':{'front':{'hinges':{'door-right':setting}}}})


def test_fitted_hinge_and_plate_stay_together_across_doors():
    rows = album_hardware.project_rows({'items':[
        door('a','71B3550','173H7100'), door('b','71B3550','173H7100'),
        door('c','71B3550','175H3100'), door('d','71B3550-ONS','173H7100'),
        door('e','112712',push=True), door('f','112712',push=True)]})
    by_sku = {r['article']:r for r in rows}
    assert {r['article']:r['qty'] for r in rows if r['unit'] == 'set'} == {
        '71B3550 + 173H7100':8, '71B3550 + 175H3100':4, '71B3550-ONS + 173H7100-ONS':4}
    assert all(len(r['images']) == 2 for r in rows if r['unit'] == 'set')
    assert 'оникс' in by_sku['71B3550-ONS + 173H7100-ONS']['detail']
    assert '173H7100' not in by_sku and '175H3100' not in by_sku
    assert by_sku['112712']['qty'] == 8 and by_sku['09.0021']['qty'] == 2

    source = next(v for v in VARIANTS if v['family'] == 'corner')
    unit = dict(module_type='wall_cabinet', width=1000, height=720, depth=317, bazis_id=source['id'],
                bazis_sha256=source['source_sha256'])
    native = album_hardware.project_rows({'items':[{**unit,'item_id':'L'}, {**unit,'item_id':'R'}]})
    gtv = [r for r in native if 'GTV' in r['name'] and r['role'] == 'hinge']
    assert len(gtv) == 1 and gtv[0]['qty'] == 4 and gtv[0]['unit'] == 'set'
    assert any(r['article'] == 'ZM-HCKT90-3DBEO-S' and r['qty'] == 4 for r in native)


def test_installed_lighting_in_metres_and_not_in_purchase_packs():
    rows = album_hardware.project_rows({'items':items([1400,1400],group='a')+items([1011],group='b')})
    assert [(r['qty'], r['unit']) for r in rows if r['article']=='75069'] == [(Decimal('3.8'), 'm')]
    assert [(r['qty'], r['unit']) for r in rows if r['article']=='81771'] == [(2, 'pcs')]


def test_project_hardware_replaces_fourteen_module_sheets_with_one():
    fronts = [{**cabinet(), 'item_id':f'base-{i}', 'name':f'Тумба {i+1}', 'x':i*357} for i in range(7)]
    scene = {'items':fronts, 'albumSettings':{'order_number':'А-18'}}
    fonts()
    assert len(customer_hardware_pdf.pages(customer_hardware.build('Кухня', scene))) == 14
    rows = album_hardware.project_rows(scene)
    assert [(r['qty'],r['unit']) for r in rows if r['article']=='12.0095'] == [(14,'set')]
    assert len([r for r in rows if r['article']=='05.0360']) == 2
    price = customer_totals(calculate(scene, 17.5))
    info = {}
    pdf = PdfReader(BytesIO(kitchen_album.render('Кухня', scene, {}, image(), include_hardware=True, price=price, page_info=info)))
    pages = [p.extract_text() for p in pdf.pages]
    assert info == {'pages':5, 'hardwarePages':1} and len(pdf.pages) == info['pages']
    hardware = pages[2]
    assert 'Фурнитура в проекте' in hardware and '14 компл.' in hardware and 'Фото серии' in hardware
    assert money(price['groups']['Фурнитура'])+' BYN' in hardware and money(price['groups']['Фурнитура'])+' BYN' in pages[-1]
    assert 'Вид спереди' in pages[1] and 'Материалы и характер' in pages[3] and 'Тумба 7' in pages[-1]
    assert len(pdf.pages[2].images) >= 7 and 'К закупке' not in hardware and 'Модуль 01' not in hardware


def test_all_distinct_fittings_fit_on_continuations_without_covering_footer():
    fonts()
    part = album_hardware.project_rows({'items':[cabinet()]})[0]
    rows = [{**part, 'name':f'Комплект {i} с направляющими полного выдвижения и доводчиками для мебели',
             'article':f'X-{i}'} for i in range(79)]
    w, h = kitchen_album.W, kitchen_album.H
    pages = album_hardware_pdf.sheets(rows, w, h)
    assert len(pages) > 1
    assert [cell[0] for page in pages for cells,_ in page for cell in cells] == rows
    assert all(sum(height for _,height in sheet) <= h - album_hardware_pdf.HEADER - album_hardware_pdf.BOTTOM for sheet in pages)
