from uuid import uuid4
import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import Scene

def test_display_appearance_roundtrip_is_separate_from_material_identity_and_parts():
    uid=str(uuid4())
    payload=dict(items=[dict(item_id='a',name='Шкаф',width=600,height=820,depth=510,front_variant_id=uid)],
                 materialIdentities={uid:dict(article='Exact article')},
                 displaySettings=dict(materialAppearance={uid:dict(scale=1.4,rotation=90,finish='satin')}))
    saved=Scene(**payload).model_dump(mode='json')
    assert saved['displaySettings']['materialAppearance'][uid]==dict(scale=1.4,rotation=90,finish='satin')
    assert Scene(**saved).model_dump(mode='json')==saved
    assert saved['items'][0]['front_variant_id']==uid and saved['materialIdentities'][uid]['article']=='Exact article'
    assert 'materialAppearance' not in saved['items'][0]
    assert Scene().displaySettings.materialAppearance=={}

@pytest.mark.parametrize('patch',[dict(scale=0),dict(scale=5),dict(scale=float('nan')),dict(scale=float('inf')),dict(rotation=45),dict(finish='metal'),dict(texture_url='https://other.test/wood.jpg')])
def test_invalid_appearance_cannot_rewrite_catalogue_or_add_arbitrary_textures(patch):
    with pytest.raises(ValidationError):Scene(displaySettings=dict(materialAppearance={str(uuid4()):patch}))

def test_new_display_assets_are_served_from_fixed_allowlist():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.v2.cabinet_ui import router
    app=FastAPI();app.include_router(router());client=TestClient(app)
    for path in ['material-appearance-ui.mjs','material-appearance.css']:
        r=client.get('/account/planner/'+path);assert r.status_code==200
    assert client.get('/account/planner/material-appearance-secret.json').status_code==404

def test_verified_pg_finish_changes_only_optics_of_exact_existing_variants():
    from backend.v2.material_visuals import user_textures,surface_finishes,exact_user_texture
    records=user_textures()['variants'];finishes=surface_finishes()['variants']
    assert len(finishes)==7
    for uid,finish in finishes.items():
        original=records[uid];item={**original,'variant_id':uid}
        visual=exact_user_texture(item)
        assert visual['roughness']==.18 and original['roughness']==.85
        for key in ['texture_url','visual_status','texture_size_mm','scale_confirmed']:
            assert visual[key]==original[key]
        assert exact_user_texture({**item,'article':finish['article'].replace('PG','PM')}) is None
        assert exact_user_texture({**item,'material_id':str(uuid4())}) is None
    uid=next(k for k,v in records.items() if v['article']=='F812 PM')
    assert exact_user_texture({**records[uid],'variant_id':uid})['roughness']==.85
