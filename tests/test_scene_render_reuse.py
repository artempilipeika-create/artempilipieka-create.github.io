"""Same saved kitchen must not create another charge from another tab/save."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import threading
from uuid import uuid4
import pytest
from backend.v2 import sales_render_store as store


def scene():
    return {'items': [{'width': 600, 'front_variant_id': 'oak', 'bazis_sha256': 'native'}],
            'room': {'width': 4200}, 'selected_item_id': None, 'view_mode': '3d'}


def test_reopen_resave_and_old_ui_style_reuse_the_same_photo(tmp_path):
    pid, rid = uuid4(), uuid4(); calls = []
    generate = lambda: calls.append(1) or 'paid-photo'
    first = store.for_scene(tmp_path, 'owner', pid, rid, 3, scene(), 'preview', generate)
    again = scene(); again.update(selected_item_id='unit', view_mode='plan')
    second = store.for_scene(tmp_path, 'owner', pid, uuid4(), 9, again, 'different capture', generate, 'catalog')
    assert second == first and calls == [1]
    assert store.current(tmp_path, 'owner', pid, again, 20)['image_data_url'] == 'paid-photo'
    assert store.current(tmp_path, 'other-owner', pid, again, 20) is None
    assert store.current(tmp_path, 'owner', uuid4(), again, 20) is None


@pytest.mark.parametrize('change', ['width', 'material', 'room', 'native'])
def test_real_kitchen_changes_do_not_reuse_old_images(tmp_path, change):
    pid = uuid4(); original = scene()
    store.for_scene(tmp_path, 'owner', pid, uuid4(), 1, original, 'preview', lambda: 'first')
    changed = deepcopy(original)
    if change == 'width': changed['items'][0]['width'] = 700
    if change == 'material': changed['items'][0]['front_variant_id'] = 'white'
    if change == 'room': changed['room']['width'] = 5000
    if change == 'native': changed['items'][0]['bazis_sha256'] = 'other-source'
    assert store.current(tmp_path, 'owner', pid, changed, 2) is None


def test_two_tabs_with_distinct_request_ids_call_provider_only_once(tmp_path):
    entered, release = threading.Event(), threading.Event(); calls = []; pid = uuid4()
    def generate():
        calls.append(1); entered.set(); assert release.wait(3); return 'paid-photo'
    with ThreadPoolExecutor() as executor:
        first = executor.submit(store.for_scene, tmp_path, 'owner', pid, uuid4(), 1, scene(), 'view A', generate)
        assert entered.wait(3)
        try:
            second = store.for_scene(tmp_path, 'owner', pid, uuid4(), 2, scene(), 'view B', generate)
            assert second['state'] == 'pending'
        finally:
            release.set()
        assert first.result()['state'] == 'ready'
    assert calls == [1]


def test_failed_or_interrupted_request_never_restarts_under_new_id(tmp_path):
    pid = uuid4(); calls = []
    def failed(): calls.append(1); raise ValueError('provider failure')
    store.for_scene(tmp_path, 'owner', pid, uuid4(), 1, scene(), 'view', failed)
    assert store.for_scene(tmp_path, 'owner', pid, uuid4(), 2, scene(), 'view', failed)['state'] == 'failed'
    assert calls == [1]
    pid = uuid4()
    index = store.location(tmp_path, 'owner', pid, uuid4()).parent / 'scenes' / store.scene_key(scene())
    index.mkdir(parents=True)
    assert store.for_scene(tmp_path, 'owner', pid, uuid4(), 1, scene(), 'view', failed)['state'] == 'pending'
    assert calls == [1]


def test_legacy_paid_result_is_recovered_using_exact_preview_then_survives_saves(tmp_path):
    pid, rid = uuid4(), uuid4()
    store.once(tmp_path, 'owner', pid, rid, 3, 'exact-preview', lambda: 'old-paid-photo', 'lived_in')
    assert store.current(tmp_path, 'owner', pid, scene(), 8, 'different-preview') is None
    found = store.current(tmp_path, 'owner', pid, scene(), 8, 'exact-preview')
    assert found['image_data_url'] == 'old-paid-photo' and found['request_id'] == str(rid)
    assert store.current(tmp_path, 'owner', pid, scene(), 9)['image_data_url'] == 'old-paid-photo'
    assert store.for_scene(tmp_path, 'owner', pid, uuid4(), 9, scene(), 'new-preview',
                           lambda: pytest.fail('Already paid')) == found


def test_an_index_cannot_serve_a_request_bound_to_another_scene(tmp_path):
    pid, rid = uuid4(), uuid4()
    store.for_scene(tmp_path, 'owner', pid, rid, 1, scene(), 'view', lambda: 'other-scene-photo')
    changed = scene(); changed['items'][0]['width'] = 800
    index = store.location(tmp_path, 'owner', pid, rid).parent / 'scenes' / store.scene_key(changed)
    # Simulate two overlapping submissions reusing one UUID for different versions.
    store._claim(index, rid)
    result = store.current(tmp_path, 'owner', pid, changed, 2)
    assert result['state'] == 'uncertain' and 'image_data_url' not in result
