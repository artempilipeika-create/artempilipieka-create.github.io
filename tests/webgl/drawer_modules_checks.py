"""NMRSH2/NMRSH3 browser acceptance against isolated ASGI/Postgres.

Uses a directly-created verified admin fixture so the current public email-verification
contract is not bypassed or weakened just to exercise the furniture library.
"""
import json
from pathlib import Path

from playwright.sync_api import expect

from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui
from tests.webgl.navigation import panel,close_panels

DONORS={
    'bazis.39f282e08f0c':{
        'label':'Нижний 2 ящика · с доводчиком',
        'sha':'f5f5c16f716ba2716f829ba6860768ce09667e540a7135265dc6f182a7fc24b2',
        'file':'НМРШ2-600.З.С 3мм Гвозди Шариковые напр с довод.(1).fr3d',
        'fronts':[357,357],
        'boxes':[300,300],
    },
    'bazis.5f5697e39e27':{
        'label':'Нижний 3 ящика · с доводчиком',
        'sha':'f1db2bfd1400b00c073ec4fc3598412fbf4532bde75d11968ae1beabda6e1ac0',
        'file':'НМРШ3-600.З.С 3мм Гвозди Шариковые напр с довод.(1).fr3d',
        'fronts':[357,178,178],
        'boxes':[300,121,121],
    },
}

def open_verified_planner(page,admin_user):
    login_ui(page,admin_user['email'])
    page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    page.wait_for_function('()=>window.MF_PLANNER&&window.MF_FURNITURE_CORE&&MF_PLANNER.scene.entries')

def state(page):
    return page.evaluate("""()=>{const p=MF_PLANNER,it=p.adapter.selected,t=p.adapter.template(it),
      parts=MF_FURNITURE_CORE.productionParts(it,t),fronts=MF_FURNITURE_CORE.facadeCells(it,t),roles={};
      p.scene.entries.get(it.item_id).group.traverse(m=>{if(m.isMesh){const r=m.userData.role||'none';roles[r]=(roles[r]||0)+1;}});
      return {item:{id:it.item_id,bazis_id:it.bazis_id,bazis_sha256:it.bazis_sha256,width:it.width,height:it.height,depth:it.depth},
        label:t.label,hardware:MF_FURNITURE_CORE.productionHardware(it,t.production),fronts,roles,
        parts:parts.map(x=>({key:x.key,name:x.name,role:x.role,length:x.length,width:x.width,thickness:x.thickness,material:x.material?.name||null}))};}""")

def dims(parts,name):
    return [(p['length'],p['width'],p['thickness']) for p in parts if p['name']==name]

def export_payload(page):
    close_panels(page)
    with page.expect_download() as download:
        page.locator('#export-bazis').click()
    return json.loads(Path(download.value.path()).read_text())

def test_nmrsh2_nmrsh3_exact_library_render_save_load_and_native_export(page,api,settings,admin_user):
    open_verified_planner(page,admin_user)
    panel(page,'left','catalog')
    expect(page.locator('#module-catalogue [data-bazis]')).to_have_count(11)
    assert page.locator('#module-catalogue .mf3d-module strong').all_text_contents()==[
        'Д1 L','Д1 P','Д2',DONORS['bazis.39f282e08f0c']['label'],DONORS['bazis.5f5697e39e27']['label'],'ВМД1 L','ВМД1 P','ВМД2','ВМД1 L · Сушка','ВМД1 P · Сушка','ВМД2 · Сушка'
    ]

    item_ids=[]
    for bazis_id,expected in DONORS.items():
        page.locator(f'[data-bazis="{bazis_id}"]').click()
        actual=state(page);parts=actual['parts'];item_ids.append(actual['item']['id'])
        assert actual['label']==expected['label']
        assert actual['item']=={
            'id':actual['item']['id'],'bazis_id':bazis_id,'bazis_sha256':expected['sha'],
            'width':600,'height':820,'depth':510,
        }
        assert [(f['w'],f['h']) for f in actual['fronts']]==[(597,h) for h in expected['fronts']]
        assert [(p['length'],p['width']) for p in parts if p['role']=='front']==[(h,597) for h in expected['fronts']]
        assert dims(parts,'Дно')==[(600,510,18)]
        assert sorted(dims(parts,'Боковина L')+dims(parts,'Боковина P'))==[(702,510,18),(702,510,18)]
        assert sorted(dims(parts,'Царга задняя')+dims(parts,'Царга передняя'))==[(80,564,18),(80,564,18)]
        assert dims(parts,'Задняя стенка')==[(716,596,3)]
        assert dims(parts,'ЗАДНЯЯ ШУФ')==[(h,501,18) for h in expected['boxes']]
        assert dims(parts,'Фронтальная ШУФ')==[(h,501,18) for h in expected['boxes']]
        assert dims(parts,'Боковая напр.P')==[(h,500,18) for h in expected['boxes']]
        assert dims(parts,'Боковая напр.L')==[(h,500,18) for h in expected['boxes']]
        assert dims(parts,'З.С')==[(533,496,3) for _ in expected['boxes']]
        assert all(p['material']=='ЛДСП- БЕЛЫЙ' for p in parts if p['role']=='body')
        assert all(p['material']=='Evagloss P004' for p in parts if p['role']=='front')
        assert all(p['material']=='ЛДСП- БЕЛЫЙ' for p in parts if p['role']=='drawer')
        assert all(p['material']=='ЛХДФ 3ММ Белый' for p in parts if p['name'] in {'Задняя стенка','З.С'})
        assert actual['hardware']['drawer_system']=='AKS'
        assert actual['hardware']['slide_type']=='ball_bearing_soft_close'
        assert actual['hardware']['native_slide_length_mm']==500
        assert actual['hardware']['slide_length_mm']==500
        assert actual['hardware']['slide_selection']=='native_auto_by_depth'
        assert actual['hardware']['drawer_count']==len(expected['fronts'])
        assert actual['hardware']['slide_rule']['control_points']['250']==[[250,0],[300,1],[1000,0]]
        assert actual['hardware']['slide_rule']['control_points']['600']==[[600,0],[1000,1]]
        assert actual['roles']['front']==len(expected['fronts'])
        assert actual['roles']['drawer']==4*len(expected['fronts'])

        panel(page,'right')
        page.locator('#depth').fill('450');page.locator('#depth').press('Tab')
        resized=state(page)
        assert resized['item']['depth']==450
        assert resized['hardware']['slide_length_mm'] is None
        assert resized['hardware']['slide_selection']=='native_auto_by_depth'
        page.locator('#depth').fill('510');page.locator('#depth').press('Tab')
        assert state(page)['hardware']['slide_length_mm']==500
        panel(page,'left','catalog')

    close_panels(page)
    page.locator('#save-project').click()
    expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId')
    saved=api.get('/api/v2/3d-projects/'+pid)
    assert saved.status_code==200,saved.text
    assert [it['bazis_id'] for it in saved.json()['scene']['items']]==list(DONORS)

    native=export_payload(page)
    assert [it['bazis_id'] for it in native['items']]==list(DONORS)
    for item,(bazis_id,expected) in zip(native['items'],DONORS.items()):
        assert item['source_sha256']==expected['sha']
        assert item['source_file']==expected['file']
        assert item['construction']['hardware']['drawer_count']==len(expected['fronts'])
        assert item['construction']['hardware']['slide_type']=='ball_bearing_soft_close'

    page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects')
    page.locator('#projects .mf3d-project').first.click()
    page.wait_for_function('()=>MF_PLANNER.adapter.items.length===2')
    assert page.evaluate('MF_PLANNER.adapter.items.map(x=>x.bazis_id)')==list(DONORS)
    assert export_payload(page)['items']==native['items']
