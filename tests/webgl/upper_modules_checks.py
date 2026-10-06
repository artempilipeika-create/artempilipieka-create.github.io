"""VMD1/VMD2 upper-cabinet browser acceptance against isolated ASGI/Postgres."""
import json
from pathlib import Path

from playwright.sync_api import expect

from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui
from tests.webgl.navigation import panel,close_panels

DONORS={
    'bazis.858266606bc5':{
        'label':'ВМД1 L','file':'ВМД1-600. отк L.fr3d',
        'sha':'858266606bc5e6f36a96635c155beb8f86161ce869956a8f961f27406db7ebc2',
        'fronts':[(717,597)],'hinges':2,'sides':['left'],
    },
    'bazis.2175c60e84a6':{
        'label':'ВМД1 P','file':'ВМД1-600. отк P.fr3d',
        'sha':'2175c60e84a6eb6eeefa62eaddc611f2180b6a3060a0ea3aa1b5305ffbcc6ed5',
        'fronts':[(717,597)],'hinges':2,'sides':['right'],
    },
    'bazis.877ba2f68d92':{
        'label':'ВМД2','file':'ВМД2-600..fr3d',
        'sha':'877ba2f68d92a70a6eab2c792300e3fea8cc126ab9fbc8966f36b6f2d52ffad3',
        'fronts':[(717,297),(717,297)],'hinges':4,'sides':['left','right'],
    },
}
CATALOGUE=['Д1 L','Д1 P','Д2','Нижний 2 ящика · с доводчиком','Нижний 3 ящика · с доводчиком','ВМД1 L','ВМД1 P','ВМД2','ВМД1 L · Сушка','ВМД1 P · Сушка','ВМД2 · Сушка']

def open_verified_planner(page,admin_user):
    login_ui(page,admin_user['email'])
    page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    page.wait_for_function('()=>window.MF_PLANNER&&window.MF_FURNITURE_CORE&&MF_PLANNER.scene.entries')

def state(page):
    return page.evaluate("""()=>{const p=MF_PLANNER,it=p.adapter.selected,t=p.adapter.template(it),
      parts=MF_FURNITURE_CORE.productionParts(it,t),cells=MF_FURNITURE_CORE.facadeCells(it,t),roles={},pivots=[],handles=[];
      p.scene.entries.get(it.item_id).group.traverse(m=>{
        if(m.isMesh){const r=m.userData.role||'none';roles[r]=(roles[r]||0)+1;if(r==='handle')handles.push(Math.round(m.position.y*10000)/10);}
        if(m.userData?.role==='door-pivot')pivots.push(m.userData.hingeSide);
      });
      return {item:{id:it.item_id,bazis_id:it.bazis_id,bazis_file:it.bazis_file,bazis_sha256:it.bazis_sha256,module_type:it.module_type,
        width:it.width,height:it.height,depth:it.depth,base:it.base,body_height:it.body_height,base_height:it.base_height,worktop_thickness:it.worktop_thickness},
        label:t.label,hardware:MF_FURNITURE_CORE.productionHardware(it,t.production),cells,roles,pivots,handles,elevation:MF_FURNITURE_CORE.elevation(it,p.adapter.room),
        kitchen:MF_FURNITURE_CORE.kitchenSettings(it),legs:MF_FURNITURE_CORE.kitchenLegs(it),
        parts:parts.map(x=>({key:x.key,name:x.name,role:x.role,length:x.length,width:x.width,thickness:x.thickness,material:x.material?.name||null}))};}""")

def dims(parts,name):
    return [(p['length'],p['width'],p['thickness']) for p in parts if p['name']==name]

def export_payload(page):
    close_panels(page)
    with page.expect_download() as download:
        page.locator('#export-bazis').click()
    return json.loads(Path(download.value.path()).read_text())

def test_vmd_upper_modules_exact_render_save_load_and_native_export(page,api,settings,admin_user):
    open_verified_planner(page,admin_user)
    panel(page,'left','catalog')
    expect(page.locator('#module-catalogue [data-bazis]')).to_have_count(16)
    assert page.locator('#module-catalogue .mf3d-module strong').all_text_contents()==CATALOGUE+['НМД1 L · Мойка','НМД1 P · Мойка','НМД2 · Мойка','НШД-600 · ниша 595','НМУ-1000 Д1 L · Мойка']
    for bazis_id,expected in DONORS.items():
        page.locator(f'[data-bazis="{bazis_id}"]').click()
        actual=state(page);parts=actual['parts']
        assert actual['label']==expected['label']
        assert actual['item']=={
            'id':actual['item']['id'],'bazis_id':bazis_id,'bazis_file':expected['file'],'bazis_sha256':expected['sha'],
            'module_type':'wall_cabinet','width':600,'height':720,'depth':317,'base':'wall',
            'body_height':720,'base_height':0,'worktop_thickness':0,
        }
        assert actual['kitchen'] is None and actual['legs'] is None
        assert actual['elevation']==1480
        assert dims(parts,'Левая Боковая')==[(720,317,18)]
        assert dims(parts,'Правая Боковая')==[(720,317,18)]
        assert dims(parts,'Крыша')==[(564,317,18)]
        assert dims(parts,'Дно')==[(564,317,18)]
        assert dims(parts,'Полка')==[(562,317,18)]
        assert dims(parts,'З.С')==[(716,596,3)]
        assert [(p['length'],p['width']) for p in parts if p['role']=='front']==expected['fronts']
        assert [(c['h'],c['w']) for c in actual['cells']]==expected['fronts']
        assert actual['pivots']==expected['sides']
        assert actual['handles']==[51.5]*len(expected['fronts'])
        assert actual['hardware']['hinge_count']==expected['hinges']
        assert actual['hardware']['hinge_name'].startswith('Петля накладная с доводчиком 48мм h2 clip-on PRIME')
        assert {x['key']:x['quantity'] for x in actual['hardware']['items']}=={
            'confirmat-7x50':8,'hanger-white':2,'screw-3x30':4,'nails-1.4x25':52,'shelf-support-marcopol':4
        }
        assert all(p['material']=='ЛДСП- БЕЛЫЙ' for p in parts if p['role'] in {'body','shelf'})
        assert all(p['material']=='Evagloss P004' for p in parts if p['role']=='front')
        assert all(p['material']=='ЛХДФ 3ММ Белый' for p in parts if p['role']=='back')
        assert actual['roles']['body']==4 and actual['roles']['shelf']==1 and actual['roles']['back']==1
        assert actual['roles']['front']==len(expected['fronts'])

    assert page.evaluate("MF_PLANNER.scene.dressing.children.flatMap(g=>g.children.filter(x=>x.userData.role==='counter')).length")==0
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
        assert item['source_file']==expected['file']
        assert item['source_sha256']==expected['sha']
        assert item['source_default']=={'width':600,'height':720,'depth':317}
        assert item['target']=={'width':600,'height':720,'depth':317}
        assert item['position']['y']==1480
        assert item['construction']['hardware']['hinge_count']==expected['hinges']
        assert item['construction']['hardware']['hinge_name'].startswith('Петля накладная с доводчиком 48мм h2 clip-on PRIME')
        assert item['construction']['legs'] is None

    page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects')
    page.locator('#projects .mf3d-project').first.click()
    page.wait_for_function('()=>MF_PLANNER.adapter.items.length===3')
    assert page.evaluate('MF_PLANNER.adapter.items.map(x=>x.bazis_id)')==list(DONORS)
    assert export_payload(page)['items']==native['items']
