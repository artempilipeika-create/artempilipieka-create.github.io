"""The finish in the workshop's standard 38 mm BAZIS worktop fragments."""
from .catalogue_model import safe_item

WORKTOP = {
    'kind': 'material', 'family': 'Столешница', 'manufacturer': 'EGGER',
    'article': 'F243 ST76', 'name': 'Мрамор Кандела светло-серый', 'thickness': 38,
    'material_id': '4aba4766-d1ed-5bc6-8c32-55b3a7184934',
    'variant_id': '0cb4afc4-e60c-53fd-8409-24777829d031',
}
WORKTOP_ID = WORKTOP['variant_id']
WORKTOP_LABEL = ' · '.join([WORKTOP['manufacturer'], WORKTOP['article'], WORKTOP['name'], '38 мм'])


def catalogue_worktop():
    return {**safe_item(WORKTOP, None), 'catalogue_release': None}


def carries_worktop(item):
    if item.get('countertopEnabled') is False:
        return False
    if item.get('module_type') == 'base_cabinet':
        return item.get('depth', 510) <= 750 and item.get('worktop_thickness') != 0
    assembly = item.get('assistant_carcass') or {}
    model = (assembly.get('spec') or {}).get('kitchenModel') or ''
    return (item.get('module_type') == 'blank' and model.startswith('base-')
            and item.get('item_id') == str(assembly.get('group_id')) + ':bottom')


def with_default_worktops(scene):
    items = []
    uses_default = False
    for item in scene.get('items') or []:
        if carries_worktop(item) and not item.get('countertopMaterialId'):
            thickness = item.get('countertopThicknessMm')
            if thickness is None and item.get('module_type') == 'base_cabinet':
                thickness = item.get('worktop_thickness')
            item = {**item, 'countertopMaterialId': WORKTOP_ID, 'countertopThicknessMm': thickness or 38}
            if item['module_type'] == 'base_cabinet':
                item['worktop_thickness'] = item['countertopThicknessMm']
        items.append(item)
        if str(item.get('countertopMaterialId')) == WORKTOP_ID:
            uses_default = True
    if not uses_default:
        return scene
    identities = {**(scene.get('materialIdentities') or {}), WORKTOP_ID: {
        'materialId': WORKTOP['material_id'], 'article': WORKTOP['article'], 'manufacturer': WORKTOP['manufacturer'],
    }}
    return {**scene, 'items': items, 'materialIdentities': identities}


def render_data(scene, materials):
    scene = with_default_worktops(scene)
    if any(str(it.get('countertopMaterialId')) == WORKTOP_ID for it in scene.get('items') or []):
        materials = {**materials, WORKTOP_ID: WORKTOP_LABEL}
    return scene, materials
