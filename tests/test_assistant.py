import json
import subprocess
from pathlib import Path
from uuid import uuid4
import pytest
from pydantic import ValidationError
from backend.v2 import assistant_api as assistant
from backend.v2.assistant_model import AssistantPlan
from backend.v2.three_d_api import Scene
from backend.v2.db import transaction
from backend.v2.security import grant
from tests.stage03.test_api import settings, api, admin_user

SPEC = dict(recipe='shelves', width=800, height=2200, depth=577, thickness=18,
            shelves=4, sections=1, back=True, elevation=0, shelfSetback=20,
            shelfGap=0, edgeThickness=1, edgePolicy='front')

def request(**patch):
    return assistant.PlanRequest(request_id=uuid4(), message='Шкаф 800 2200 577', room_height=2700, **patch)

def test_receipts_never_retry_or_exceed_persistent_trial_cap(tmp_path, monkeypatch):
    monkeypatch.setattr(assistant, 'TRIAL_REQUESTS', 2)
    calls=[]
    def generate(body):
        calls.append(body.request_id)
        return {'action':'create','message':'Корпус','spec':SPEC}
    body=request()
    first=assistant.once(tmp_path,'owner',body,generate)
    assert first==assistant.once(tmp_path,'owner',body,generate)
    assert len(calls)==1
    with pytest.raises(ValueError):
        assistant.once(tmp_path,'owner',body.model_copy(update={'message':'другое'}),generate)
    def failed(body):
        calls.append(body.request_id)
        raise RuntimeError('secret provider response')
    failed_body=request()
    failure=assistant.once(tmp_path,'owner',failed_body,failed)
    assert 'secret' not in json.dumps(failure)
    assert failure==assistant.once(tmp_path,'owner',failed_body,generate)
    assert len(calls)==2
    with pytest.raises(ValueError,match='закончились'):
        assistant.once(tmp_path,'other-owner',request(),generate)

def test_provider_is_fixed_bounded_and_checks_structured_output(monkeypatch):
    monkeypatch.setenv('MF_IMAGE_API_KEY','synthetic-secret')
    monkeypatch.setenv('MF_AI_OPENAI_ORGANIZATION','synthetic-org')
    captured={}
    class Response:
        status_code=200
        def json(self): return {'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps({'action':'create','message':'Корпус','spec':SPEC})}]}]}
    class Client:
        def __init__(self,**kwargs): assert kwargs=={'timeout':16,'follow_redirects':False}
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def post(self,url,headers,content):
            captured.update(url=url,headers=headers,payload=json.loads(content))
            assert len(content)<=32000
            return Response()
    monkeypatch.setattr(assistant.httpx,'Client',Client)
    assert assistant.generate(request())['spec']==SPEC
    assert captured['url']=='https://api.openai.com/v1/responses'
    assert captured['headers']['OpenAI-Organization']=='synthetic-org'
    assert captured['payload']['store'] is False
    assert captured['payload']['max_output_tokens']==2000
    assert captured['payload']['service_tier']=='default'
    assert 'synthetic-secret' not in json.dumps(captured['payload'])

@pytest.mark.parametrize('patch', [dict(width=150),dict(shelves=11),dict(sections=3,width=200),dict(recipe='sink')])
def test_invalid_model_plans_are_rejected(patch):
    with pytest.raises(ValidationError):
        AssistantPlan.model_validate(dict(action='create',message='x',spec={**SPEC,**patch}))

def generated_scene():
    script="""import {prepareAssistantPlan} from './backend/v2/cabinet_assets/planner/assistant-model.mjs';
    import {StateAdapter} from './backend/v2/cabinet_assets/planner/state-adapter.mjs';
    const scene={room:{width:6000,depth:5000,height:2700,setup_complete:true},items:[]};
    const a=new StateAdapter({state:()=>scene,projectId:()=>null,selected:()=>null,material:()=>null});
    scene.items=prepareAssistantPlan(a,{action:'create',spec:JSON.parse(process.argv[1])}).items;
    console.log(JSON.stringify(scene));"""
    return json.loads(subprocess.check_output(['node','--input-type=module','-e',script,json.dumps(SPEC)],cwd=Path(__file__).resolve().parents[1]))

def test_generated_scene_metadata_survives_validation_and_assets_are_served():
    before=generated_scene()
    saved=Scene.model_validate(before).model_dump(mode='json')
    assert saved['items'][0]['assistant_carcass']==before['items'][0]['assistant_carcass']
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.v2.cabinet_ui import router
    app=FastAPI();app.include_router(router())
    with TestClient(app) as client:
        for name in ('assistant-model.mjs','assistant-ui.mjs','assistant.css','wardrobe-questionnaire.mjs'):
            assert client.get('/account/planner/'+name).status_code==200

def test_questionnaire_ai_cannot_change_form_parameters(monkeypatch):
    from backend.v2.assistant_model import CarcassDesign
    spec={**SPEC,'recipe':'divided','width':1200,'sections':3,'shelves':5,'sectionShelves':[2,0,5]}
    body=assistant.QuestionnaireRequest(request_id=uuid4(),action='create',spec=spec,fronts='none',body_material_id=uuid4(),back_material_id=uuid4(),room_height=2700)
    monkeypatch.setattr(assistant,'provider_text',lambda payload:json.dumps({'approved':True,'message':'Параметры совместимы'}))
    result=assistant.review_questionnaire(body)
    assert result['spec']==spec
    assert result['action']=='create'
    with pytest.raises(ValidationError): CarcassDesign.model_validate({**spec,'sectionShelves':[2,0]})
    with pytest.raises(ValidationError): assistant.QuestionnaireRequest.model_validate({**body.model_dump(),'fronts':'doors'})
    monkeypatch.setattr(assistant,'provider_text',lambda payload:json.dumps({'approved':True,'message':'OK','spec':{**spec,'width':1800}}))
    with pytest.raises(ValueError,match='проверить анкету'):assistant.review_questionnaire(body)

def test_questionnaire_section_metadata_roundtrip():
    data=generated_scene()
    # A real three-section scene is generated by JS, not a test-only geometry.
    script="""import {buildCarcass,placeCarcass} from './backend/v2/cabinet_assets/planner/carcass-model.mjs';
    const spec=JSON.parse(process.argv[1]),group=crypto.randomUUID(),position={x:0,z:0,elevation_mm:0,rotation:0};
    const b=buildCarcass(spec,{idPrefix:group});console.log(JSON.stringify({items:placeCarcass(b,position).map(i=>({...i,assistant_carcass:{group_id:group,spec,position}}))}));"""
    spec={**SPEC,'recipe':'divided','width':1200,'sections':3,'shelves':5,'sectionShelves':[2,0,5]}
    data=json.loads(subprocess.check_output(['node','--input-type=module','-e',script,json.dumps(spec)],cwd=Path(__file__).resolve().parents[1]))
    saved=Scene.model_validate(data).model_dump(mode='json')
    assert saved['items'][0]['assistant_carcass']['spec']==spec
    assert len([i for i in saved['items'] if ':shelf-' in i['item_id']])==7

def test_api_private_and_project_save_reopen(api,admin_user,settings,monkeypatch):
    monkeypatch.setenv('MF_AI_ASSISTANT','enabled')
    monkeypatch.setenv('MF_IMAGE_API_KEY','fake')
    monkeypatch.setenv('MF_AI_OPENAI_ORGANIZATION','fake')
    calls=[]
    def once(*args):
        calls.append(True)
        return {'state':'ready','plan':{'action':'create','message':'Корпус','spec':SPEC}}
    monkeypatch.setattr(assistant,'once',once)
    assert api.get('/api/v2/3d-assistant/status').json()['available']
    assert api.post('/api/v2/3d-assistant/plan',json=request().model_dump(mode='json')).status_code==200
    scene=generated_scene()
    made=api.post('/api/v2/3d-projects',json={'name':'QA assistant','scene':scene})
    assert made.status_code==201,made.text
    url='/api/v2/3d-projects/'+made.json()['project_id']
    saved=api.get(url).json()
    assert saved['scene']['items'][0]['assistant_carcass']==scene['items'][0]['assistant_carcass']
    saved['scene']['items'][0]['production_note']='Ручная пометка'
    assert api.patch(url,json={'name':saved['name'],'version':saved['version'],'scene':saved['scene']}).status_code==200
    assert api.get(url).json()['scene']['items'][0]['production_note']=='Ручная пометка'
    with transaction(settings) as conn:
        conn.execute("UPDATE mf_user_roles SET role='manager' WHERE user_id=%s",(admin_user['user_id'],))
    assert api.get('/api/v2/3d-assistant/status').status_code==403
    assert api.post('/api/v2/3d-assistant/plan',json=request().model_dump(mode='json')).status_code==403
    assert len(calls)==1
    # A real client must receive an own-scope grant; staff's all-scope grant
    # cannot accidentally make a client eligible.
    with transaction(settings) as conn:
        conn.execute("UPDATE mf_user_roles SET role='client' WHERE user_id=%s",(admin_user['user_id'],))
        grant(conn,user_id=admin_user['user_id'],permission='orders.draft.write',scope='own',actor=admin_user['user_id'])
    assert api.get('/api/v2/3d-assistant/status').json()['available'] is True
    assert api.post('/api/v2/3d-assistant/plan',json=request().model_dump(mode='json')).status_code==200
    assert len(calls)==2
    material_id=uuid4()
    monkeypatch.setattr(assistant.catalogue,'active',lambda conn:uuid4())
    monkeypatch.setattr(assistant.catalogue,'get_item',lambda conn,release,variant,kind:{'variant_id':str(material_id),'thickness':18 if variant==material_id else 3})
    form={'request_id':str(uuid4()),'action':'create','spec':{**SPEC,'sectionShelves':[4]},'fronts':'none','body_material_id':str(material_id),'back_material_id':str(uuid4()),'room_height':2700}
    assert api.post('/api/v2/3d-assistant/questionnaire',json=form).status_code==200
    assert len(calls)==3
    assert api.post('/api/v2/3d-assistant/questionnaire',json={**form,'body_material_id':str(uuid4())}).status_code==422
    assert len(calls)==3
    with transaction(settings) as conn:
        conn.execute("UPDATE mf_users SET account_status='blocked' WHERE user_id=%s",(admin_user['user_id'],))
    assert api.post('/api/v2/3d-assistant/plan',json=request().model_dump(mode='json')).status_code==403
    assert len(calls)==3
    api.cookies.clear()
    assert api.get('/api/v2/3d-assistant/status').status_code==401
