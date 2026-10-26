"""Every native catalogue draft and client-accepted resize must be saveable.
Uses the actual browser catalogue, scene normalizer and StateAdapter in Node,
then the server model; no synthetic reimplementation of either contract.
"""
import json
import subprocess
from pathlib import Path
import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import FurnitureItem

ROOT = Path(__file__).resolve().parents[1]

@pytest.fixture(scope='module')
def catalogue_contract():
    run = subprocess.run(['node', 'tests/webgl/catalogue-contract.mjs'], cwd=ROOT,
                         capture_output=True, text=True, check=True, timeout=60)
    return json.loads(run.stdout)

def test_every_catalogue_module_creates_and_all_accepted_resizes_save(catalogue_contract):
    data = catalogue_contract
    assert len(data['modules']) >= 137
    assert {row['mode'] for row in data['accepted']} == {'new', 'opened', 'legacy'}
    for item in data['defaults']:
        FurnitureItem(**item)
    errors = []
    for row in data['accepted']:
        try:
            saved = FurnitureItem(**row['item']).model_dump(mode='json')
            FurnitureItem(**saved)
            for key in ('bazis_id', 'bazis_file', 'bazis_sha256', 'width', 'height', 'depth',
                        'body_variant_id', 'front_variant_id', 'plinthMaterialId'):
                assert saved.get(key) == row['item'].get(key), (row['id'], key)
        except ValidationError as error:
            errors.append((row['id'], row['mode'], row['axis'], row['value'], str(error)))
    assert not errors, errors

def test_native_source_identity_takes_precedence_over_old_generic_template(catalogue_contract):
    item = next(x for x in catalogue_contract['defaults'] if x['bazis_id']=='bazis.3079d0656398')
    item.update(width=800, template_id='base.one_door')
    assert FurnitureItem(**item).width == 800
    item.update(bazis_id=None, bazis_file=None, bazis_sha256=None)
    with pytest.raises(ValidationError, match='одной дверью'):
        FurnitureItem(**item)
    single = next(x for x in catalogue_contract['defaults'] if x['bazis_id']=='bazis.0211e4f77fc4')
    with pytest.raises(ValidationError, match='одной дверью'):
        FurnitureItem(**dict(single, width=800, template_id='base.two_door'))

def test_incompatible_worktop_depth_is_blocked_before_save(catalogue_contract):
    rows = [r for r in catalogue_contract['rejected']
            if r['id']=='bazis.39f282e08f0c' and r['axis']=='depth' and r['value']==1000]
    assert {r['mode'] for r in rows} == {'new', 'opened', 'legacy'}
    assert all('750 мм' in r['error'] for r in rows)
