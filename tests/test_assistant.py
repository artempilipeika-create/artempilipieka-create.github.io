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

def generated_scene(spec=None):
    script="""import {prepareAssistantPlan} from './backend/v2/cabinet_assets/planner/assistant-model.mjs';
    import {StateAdapter} from './backend/v2/cabinet_assets/planner/state-adapter.mjs';
    const scene={room:{width:6000,depth:5000,height:2700,setup_complete:true},items:[]};
    const a=new StateAdapter({state:()=>scene,projectId:()=>null,selected:()=>null,material:()=>null});
    scene.items=prepareAssistantPlan(a,{action:'create',spec:JSON.parse(process.argv[1])}).items;
    console.log(JSON.stringify(scene));"""
    return json.loads(subprocess.check_output(['node','--input-type=module','-e',script,json.dumps(spec or SPEC)],cwd=Path(__file__).resolve().parents[1]))

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

def test_glass_and_board_answers_survive_storage_and_reject_incompatible_fittings():
    from backend.v2.assistant_model import CarcassDesign
    mixed={**SPEC,'sectionShelves':[4],'shelfChoices':[['board/95388','board/134286','4/48846','6/80936']]}
    assert CarcassDesign.model_validate(mixed).model_dump(mode='json')==mixed
    with pytest.raises(ValidationError):
        CarcassDesign.model_validate({**mixed,'shelfChoices':[['4/80936']*4]})


def test_fixed_shelves_validate_and_report_exact_fittings():
    from backend.v2.assistant_model import CarcassDesign
    from backend.v2.three_d_document import hardware_for
    spec = dict(SPEC, sectionShelves=[4], shelfChoices=[['board/confirmat','board/cam_dowel','board/134286','6/80936']])
    assert CarcassDesign.model_validate(spec).shelfChoices == spec['shelfChoices']
    for change in ({'depth':220}, {'thickness':16}):
        with pytest.raises(ValidationError):
            CarcassDesign.model_validate(dict(spec, **change))
    for value, expected in zip(spec['shelfChoices'][0], ([4],[4,4],[4],[4])):
        rows,_ = hardware_for(dict(item_id='q:shelf-0',module_type='blank',blank_axis='horizontal',blank_binding={'mounting':'none'},blank_shelf=value))
        assert [row['qty'] for row in rows] == expected


def test_divider_bom_counts_both_ends_and_defaults_to_confirmats():
    from backend.v2.three_d_document import hardware_for
    divider=dict(item_id='q:divider-0', module_type='blank', blank_axis='side',width=18)
    assert [r['qty'] for r in hardware_for(divider)[0]]==[4]
    divider['assistant_carcass']={'spec':{'joints':{'top':'cam_dowel','bottom':'confirmat'}}}
    assert [r['qty'] for r in hardware_for(divider)[0]]==[2,2,2]


def test_custom_divider_choices_round_trip_and_count_only_selected_ends():
    from backend.v2.assistant_model import CarcassDesign
    from backend.v2.three_d_document import hardware_for
    settings=[dict(top='none',bottom='cam_dowel'),dict(top='none',bottom='none')]
    spec=dict(SPEC,recipe='divided',sections=3,sectionShelves=[4]*3,dividerJoints=settings)
    assert CarcassDesign.model_validate(spec).model_dump(mode='json')['dividerJoints']==settings
    for change in ({'sections':2},{'thickness':16},{'depth':210}):
        with pytest.raises(ValidationError):
            CarcassDesign.model_validate(dict(spec,**change))
    for index,expected in enumerate(([2,2],[])):
        divider=dict(item_id=f'q:divider-{index}',module_type='blank',blank_axis='side',width=18,assistant_carcass={'spec':spec})
        assert [r['qty'] for r in hardware_for(divider)[0]]==expected


def test_wardrobe_manual_openings_and_actual_divider_depth():
    from backend.v2.assistant_model import CarcassDesign
    valid=dict(SPEC,recipe='divided',width=1200,sections=3,sectionShelves=[4]*3,
               shelfSetback=1,dividerSetback=1,dividerPositions=[320,800],
               dividerJoints=[dict(top='cam_dowel',bottom='none')]*2)
    assert CarcassDesign.model_validate(valid).model_dump(mode='json')==valid
    for change in ({'dividerPositions':[320]}, {'dividerPositions':[320,418]},
                   {'dividerPositions':[320,1080]}, {'depth':216}):
        with pytest.raises(ValidationError):
            CarcassDesign.model_validate(dict(valid,**change))


def test_back_hardware_uses_panel_height_and_each_horizontal_length():
    from backend.v2.three_d_document import hardware_for
    for thickness in (16, 18):
        spec = {'backThickness': thickness, 'width': 836, 'bottomFit': 'overlay'}
        back = {'module_type': 'blank', 'item_id': 'g:back', 'width': 800,
                'assistant_carcass': {'group_id': 'g', 'spec': spec}}
        for height, per_side in [(120, 2), (600, 2), (601, 3), (1500, 5), (2200, 6), (2201, 7), (2980, 8)]:
            hardware, _ = hardware_for({**back, 'height': height})
            assert [r['qty'] for r in hardware] == [2 * per_side + 3] * 2

def test_aks_drawer_control_spec_roundtrip_and_hardware():
    from backend.v2.assistant_model import CarcassDesign
    from backend.v2.three_d_document import hardware_for
    spec={**SPEC,'width':600,'height':1600,'depth':600,'shelves':0,'sectionShelves':[0],
          'front':{'swing':'left','offset':90},'drawerBanks':[{'kind':'internal','height':400,
          'faces':[{'height':197},{'height':None,'width':450}]}]}
    design=CarcassDesign.model_validate(spec)
    assert design.drawerBanks[0].span()==400
    assert CarcassDesign.model_validate_json(design.model_dump_json())==design
    group=str(uuid4())
    meta={'group_id':group,'spec':spec,'position':{'x':300,'z':310,'rotation':0,'elevation_mm':0}}
    rows,_=hardware_for({'module_type':'blank','item_id':group+':drawer-0-0-face','blank_axis':'front',
                         'width':543,'height':197,'assistant_carcass':meta})
    assert [(r['article'],r['qty']) for r in rows if r['article'] in ('114798','81320','112595')]==[('114798',1),('81320',18)]
    for bank in ({'kind':'internal','faces':[{'height':197,'width':580}]},
                 {'kind':'internal','height':250,'faces':[{'height':197},{'height':None}]}):
        with pytest.raises(ValidationError):
            CarcassDesign.model_validate({**spec,'drawerBanks':[bank]})

def test_saved_wardrobe_drawers_reopen_with_exact_board_identity(api,admin_user):
    spec={**SPEC,'width':600,'depth':600,'height':1800,'shelves':1,'sectionShelves':[1],
          'shelfLevels':[[{'mode':'gap','mm':250}]],'front':{'swing':'left','offset':90},
          'drawerBanks':[{'kind':'internal','faces':[{'height':197},{'height':147}]}]}
    scene=generated_scene(spec)
    made=api.post('/api/v2/3d-projects',json={'name':'QA AKS 550','scene':scene})
    assert made.status_code==201,made.text
    url='/api/v2/3d-projects/'+made.json()['project_id']
    saved=api.get(url).json()
    before={i['item_id']:i for i in scene['items']}
    after={i['item_id']:i for i in saved['scene']['items']}
    assert set(before)==set(after)
    for key,item in before.items():
        assert after[key]['assistant_carcass']['spec']['drawerBanks']==spec['drawerBanks']
        for prop in ('width','height','depth','x','z','elevation_mm','body_variant_id'):
            assert after[key][prop]==item.get(prop)
    assert sum(k.endswith('spacer-left') for k in after)==1
    assert not any(k.endswith('spacer-right') for k in after)
    saved['scene']['items'][0]['production_note']='Контроль проёма 564 мм'
    change=api.patch(url,json={'name':saved['name'],'version':saved['version'],'scene':saved['scene']})
    assert change.status_code==200,change.text
    assert api.get(url).json()['scene']['items'][0]['production_note']=='Контроль проёма 564 мм'
