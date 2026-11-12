import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import Scene
from tests.test_blanks import board
from tests.stage03.test_api import settings, api, admin_user


def bound_scene():
    left = board(item_id='left', name='Левая', x=-391, width=18, height=720,
                 body_height=720, blank_axis='side')
    right = {**left, 'item_id': 'right', 'x': 391}
    shelf = board(item_id='shelf', blank_length_mm=764, width=764, elevation_mm=300,
                  blank_binding=dict(left_id='left', right_id='right', gap_left_mm=0,
                                     gap_right_mm=0, depth_offset_mm=0))
    return dict(items=[left, right, shelf])


@pytest.mark.parametrize('rotation', [0, 90, 180, 270])
def test_binding_survives_server_roundtrip(rotation):
    data = bound_scene()
    for item in data['items']:
        x = item['x']
        item.update(rotation=rotation, x={0:x, 90:0, 180:-x, 270:0}[rotation],
                    z={0:0, 90:x, 180:0, 270:-x}[rotation])
    saved = Scene.model_validate(data).model_dump(mode='json')
    reopened = Scene.model_validate(saved)
    assert reopened.items[2].blank_binding.left_id == 'left'
    assert reopened.items[2].blank_length_mm == 764


@pytest.mark.parametrize('patch', [dict(left_id='missing'), dict(left_id='shelf'),
    dict(right_id='left'), dict(gap_left_mm=-1), dict(gap_right_mm=1),
    dict(gap_left_mm=0.5), dict(depth_offset_mm=float('nan'))])
def test_invalid_or_stale_relationship_is_rejected(patch):
    data = bound_scene()
    data['items'][2]['blank_binding'].update(patch)
    with pytest.raises(ValidationError):
        Scene.model_validate(data)


def test_support_deleted_or_rotated_or_shelf_too_high_is_rejected():
    for mutation in ('deleted', 'rotated', 'height', 'duplicate'):
        data = bound_scene()
        if mutation == 'deleted': data['items'].pop(0)
        if mutation == 'rotated': data['items'][0]['rotation'] = 90
        if mutation == 'height': data['items'][2]['elevation_mm'] = 710
        if mutation == 'duplicate': data['items'].append(data['items'][0].copy())
        with pytest.raises(ValidationError):
            Scene.model_validate(data)


def test_detached_shelf_keeps_geometry_without_references():
    data = bound_scene()
    data['items'] = [data['items'][2]]
    data['items'][0]['blank_binding'] = None
    assert Scene.model_validate(data).items[0].width == 764


def test_bound_shelf_database_save_reopen_edit_and_rejected_stale_save(api, admin_user):
    body = {'name': 'QA bound shelf', 'scene': bound_scene()}
    created = api.post('/api/v2/3d-projects', json=body)
    assert created.status_code == 201, created.text
    project = created.json()
    url = '/api/v2/3d-projects/' + project['project_id']
    reopened = api.get(url).json()
    assert reopened['scene']['items'][2]['blank_binding']['right_id'] == 'right'
    items = reopened['scene']['items']
    items[1]['x'] += 100
    stale = api.patch(url, json={'name': body['name'], 'scene': reopened['scene'], 'version': 1})
    assert stale.status_code == 422
    assert api.get(url).json()['version'] == 1
    items[2].update(x=50, width=864, blank_length_mm=864)
    saved = api.patch(url, json={'name': body['name'], 'scene': reopened['scene'], 'version': 1})
    assert saved.status_code == 200, saved.text
    final = api.get(url).json()['scene']['items'][2]
    assert final['width'] == 864 and final['blank_binding']['left_id'] == 'left'
