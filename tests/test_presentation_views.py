import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import Scene

def view(**patch):
    return dict(id='entrance',name='Вид от входа',position=[2,1,3],target=[0,1,0],**patch)

def test_presentation_views_round_trip_and_legacy_default():
    assert Scene().presentationViews==[]
    saved=Scene(presentationViews=[view()]).model_dump(mode='json')
    assert Scene(**saved).model_dump(mode='json')==saved
    assert saved['presentationViews'][0]['name']=='Вид от входа'

@pytest.mark.parametrize('patch',[
    dict(position=[float('nan'),1,3]),dict(position=[float('inf'),1,3]),
    dict(position=[0,1,0]),dict(up=[0,0,0]),dict(up=[0,2,0]),
    dict(position=[1,2]),dict(target=[1001,0,0]),dict(zoom=0),dict(fov=180),
    dict(orthoSpan=-1),dict(viewOffset=[3,0]),dict(mode='arbitrary'),dict(name=''),dict(name='x'*61),
])
def test_invalid_camera_cannot_enter_saved_scene(patch):
    data=view();data.update(patch)
    with pytest.raises(ValidationError):Scene(presentationViews=[data])

def test_saved_views_limit_and_unique_ids():
    with pytest.raises(ValidationError):Scene(presentationViews=[view(),view()])
    with pytest.raises(ValidationError):Scene(presentationViews=[dict(view(),id=str(i)) for i in range(7)])

def test_presentation_assets_served_under_existing_csp():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.v2.cabinet_ui import router,CSP
    app=FastAPI();app.include_router(router());client=TestClient(app)
    for name in ['presentation.mjs','presentation-capture.mjs','presentation-ui.mjs','presentation.css']:
        assert client.get('/account/planner/'+name).status_code==200
    assert client.get('/constructor.html').headers['Content-Security-Policy']==CSP
