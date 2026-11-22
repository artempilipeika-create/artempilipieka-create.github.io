"""Drawer purchasing must follow the geometry saved by the questionnaire."""
import pytest

from backend.v2.customer_hardware import module_rows
from backend.v2.sales_hardware import ledger
from backend.v2.three_d_document import hardware_for, with_installed_drawer_depths


@pytest.mark.parametrize('side_depth,article', [(450, '114796'), (400, '114795')])
def test_installed_drawer_pair_in_both_purchasing_views(side_depth, article):
    spec = {'width': 700, 'height': 2200, 'depth': 480, 'thickness': 18, 'backThickness': 3,
            'sections': 1, 'backMount': {'kind': 'perimeter', 'offset': 480 - side_depth - 26},
            'drawerBanks': [{'kind': 'internal', 'faces': [{}, {}]}]}
    parts = []
    for n in range(2):
        for part, axis, width, depth in [('face', 'front', 550, 18), ('side-left', 'side', 18, side_depth)]:
            parts.append({'item_id': f'cabinet:drawer-0-{n}-{part}', 'module_type': 'blank',
                          'blank_axis': axis, 'width': width, 'height': 175, 'depth': depth,
                          'assistant_carcass': {'group_id': 'cabinet', 'spec': spec}})
    installed = [row for part in with_installed_drawer_depths(parts) for row in hardware_for(part)[0]
                 if row['article'] in ('114796', '114795')]
    assert [(r['article'], r['qty']) for r in installed] == [(article, 1), (article, 1)]
    rows, _ = ledger({'items': parts})
    assert [(r['article'], r['qty']) for r in rows if r['article'] in ('114796', '114795')] == [(article, 2)]
    customer = [r for r in module_rows(parts) if r['article'] in ('114796', '114795')]
    assert len(customer) == 1 and customer[0]['article'] == article
    assert customer[0]['installed'] == customer[0]['purchase'] and customer[0]['purchase'].startswith('2 ')
    assert all('installed_drawer_depth_mm' not in p for p in parts)
