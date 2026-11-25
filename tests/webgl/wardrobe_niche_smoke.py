"""Exercise the manager's questionnaire with an isolated browser project and local or published assets."""
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4
import argparse
import json
from time import monotonic
import hashlib
from io import BytesIO
from zipfile import ZipFile
import os
import sys

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tests.webgl.synthetic_projects import SyntheticProjects

ORIGIN = 'https://martin-forest-v2-staging-production.up.railway.app'


def exercise(live=False, scenario=None):
    if not live:
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from backend.v2.cabinet_ui import router
        from backend.v2.presentation_ui import router as presentation_router
        service=FastAPI()
        service.include_router(router())
        service.include_router(presentation_router())
        files=TestClient(service)
    projects=SyntheticProjects()
    pid=str(uuid4())
    projects.projects[pid]={'project_id':pid,'name':'QA · ниши шкафа','version':1,
        'scene':{'schema_version':2,'room':{'width':5000,'height':2700,'depth':3600,'setup_complete':True},'items':[]}}
    projects.projects[pid]['scene']['displaySettings']={'environmentPreset':'showroom','wallColor':'#eeeae2','floorMaterial':'concrete','lightingPreset':'neutral'}
    account={'user_id':str(uuid4()),'account_status':'active','roles':['manager'],'email_verified':True,'capabilities':{'draft_create':True}}
    errors=[]
    def request(route):
        req=route.request
        path=urlparse(req.url).path
        if not req.url.startswith(ORIGIN+'/'):
            route.abort();return
        if projects.route(route,path):return
        if path=='/api/v2/auth/me' and req.method=='GET':route.fulfill(json=account);return
        if path=='/api/v2/3d-assistant/status' and req.method=='GET':route.fulfill(json={'available':False,'remaining':0});return
        if path.startswith('/api/v2/catalogue/materials/') and req.method=='GET':
            key=path.rsplit('/',1)[1]
            from backend.v2.kitchen_worktop import WORKTOP_ID, catalogue_worktop
            if key==WORKTOP_ID:
                route.fulfill(json=catalogue_worktop());return
            route.fulfill(json={'variant_id':key,'name':'QA материал','thickness':3 if key=='fb7b270e-66ad-5411-affc-5717b1adf0d6' else 18,'kind':'material'});return
        if path.startswith('/api/') or req.method!='GET':
            errors.append('Unexpected API '+req.method+' '+path);route.abort();return
        if live:
            route.continue_();return
        response=files.get(path)
        route.fulfill(status=response.status_code,headers=dict(response.headers),body=response.content)

    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.getenv('MF_QA_CHROME') or None,
            args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
            context=browser.new_context(service_workers='block',viewport={'width':int(os.getenv('MF_QA_WIDTH','1440')),'height':int(os.getenv('MF_QA_HEIGHT','1000'))})
            context.route('**/*',request)
            page=context.new_page()
            page.set_default_timeout(45000)
            page.on('pageerror',lambda exc:errors.append(str(exc)))
            if scenario:
                page.on('console',lambda message:errors.append(message.text) if message.type=='error' else None)
            page.goto(ORIGIN+'/constructor',wait_until='domcontentloaded')
            page.locator('#planner-assistant').wait_for(state='attached',timeout=45000)
            page.evaluate('id=>MF_PLANNER.bridge.open(id)',pid)
            if scenario:
                scenario(page, projects, pid)
                assert not errors, errors
                return
            room=page.locator('#planner-room-settings')
            room.locator('summary').click()
            expect(room.locator('#room-floor')).to_have_value('concrete')
            room.get_by_role('button',name='Применить «Дневной шоурум»').click()
            expect(room.locator('#room-floor')).to_have_value('oak')
            expect(room.locator('#room-preset-apply')).to_be_hidden()
            room.locator('summary').click()
            page.locator('#planner-assistant').click()
            form=page.locator('#planner-assistant-dialog')
            def button(label):return form.get_by_role('button',name=label,exact=True)
            def step(n):form.locator('.assistant-steps button').nth(n-1).click()
            def choose(section,level,attr):
                selector='.niche-target' if attr=='data-niche' else '.shelf-target'
                target=form.locator(f'.wardrobe-figure {selector}[data-section="{section}"][{attr}="{level}"]').first
                target.focus();target.press('Enter')
            def add_four_shelves(section):
                choose(section,0,'data-niche')
                form.get_by_label('Добавить полок в нишу').select_option('4')
                button('Добавить полки').click()
            step(2);form.get_by_text('Деление и ширина секций',exact=True).click();button('Две секции').click()
            choose(0,0,'data-niche')
            form.get_by_label('Ширина в свету, мм',exact=True).fill('360')
            button('Применить ширину').click()
            choose(1,0,'data-niche')
            assert form.get_by_label('Ширина в свету, мм',exact=True).input_value()=='386'
            add_four_shelves(0);add_four_shelves(1)
            step(4);form.get_by_label('Исполнение фасада',exact=True).select_option('pair')
            step(3)
            choose(1,0,'data-shelf-index');button('Полки').click()
            form.get_by_text('Монтажная отметка от пола',exact=True).click()
            form.get_by_label('От пола до низа полки, мм',exact=True).fill('650')
            choose(0,0,'data-niche');button('Добавить шуфляды').click()
            gap=form.get_by_label('Зазор между фасадами, мм',exact=True)
            gap.fill('30')
            source=form.locator('[data-bank-result]').inner_text()
            form.get_by_text('Скопировать в другую секцию',exact=True).click()
            button('Скопировать шуфляды').click()
            assert form.get_by_label('Количество шуфляд',exact=True).input_value()=='3'
            assert form.locator('[data-bank-result]').inner_text()!=source
            assert gap.input_value()=='30'
            gap.fill('20');gap.press('Enter')
            choose(0,0,'data-niche');assert gap.input_value()=='30'
            button('Разные').click()
            bottom=form.get_by_label('Высота фасада 1 снизу, мм',exact=True)
            bottom.fill('112');bottom.press('Enter')
            expect(form.locator('[data-bank-result]')).to_contain_text('по остатку')
            step(5);button('Проверить по размерам').click();button('Добавить в проект').click()
            page.evaluate('()=>MF_PLANNER.bridge.save()')
            assert projects.writes>0
            page.evaluate('id=>MF_PLANNER.bridge.open(id)',pid)
            page.locator('#planner-assistant').click()
            form.get_by_label('Действие со шкафом').select_option('update')
            step(3);choose(0,0,'data-niche')
            assert gap.input_value()=='30' and bottom.input_value()=='112'
            gap.fill('25');gap.press('Enter');step(5)
            button('Проверить по размерам').click();button('Применить изменения').click()
            page.evaluate('()=>MF_PLANNER.bridge.save()')
            groups=projects.projects[pid]['scene']['items']
            spec=groups[0]['assistant_carcass']['spec']
            assert [b['gap'] for b in spec['drawerBanks']]==[25,20]
            assert spec['front']['autoHinges'] is True
            # Reproduce the reported 800 × 2200 wardrobe using the manager's entry points.
            case=str(uuid4())
            projects.projects[case]={'project_id':case,'name':'QA AKS 19 mm','version':1,
                'scene':{'schema_version':2,'room':{'width':5000,'height':2700,'depth':3600,'setup_complete':True},'items':[]}}
            page.evaluate('id=>MF_PLANNER.bridge.open(id)',case)
            page.locator('#planner-assistant').click();add_four_shelves(0)
            step(4);form.get_by_label('Исполнение фасада',exact=True).select_option('pair')
            step(3);choose(0,0,'data-niche');button('Добавить шуфляды').click()
            assert gap.input_value()=='30'
            count=form.get_by_label('Количество шуфляд',exact=True)
            count.fill('2')
            outline=form.locator('[data-selected-niche="0-0"]')
            outline.evaluate('n=>{window.qaOutline=n}')
            def stable():
                assert outline.evaluate('n=>n===window.qaOutline && getComputedStyle(n).stroke!=="none"')
            summary=form.get_by_text('Ширина фасадов',exact=True)
            settings=summary.locator('..')
            summary.click()
            kind=form.get_by_label('Исполнение шуфляд',exact=True)
            kind.focus();kind.select_option('external');stable()
            kind.select_option('internal');stable()
            assert settings.evaluate('n=>n.open') and kind.evaluate('n=>n===document.activeElement')
            gap.fill('400');stable()
            expect(form.locator('[data-bank-result]')).to_contain_text('100 до 3000')
            gap.fill('30');stable()
            form.get_by_text('Крепёж полок, корпуса и стоек',exact=True).click()
            fixing=form.get_by_label('Крепёж полок у шуфляд и заднего ребра',exact=True)
            assert fixing.input_value()=='cam_dowel'
            fixing.select_option('confirmat');stable();fixing.select_option('cam_dowel')
            expect(form.locator('[data-bank-result]')).to_contain_text('178,25')
            for key in ['cover','between']:
                assert form.locator(f'[data-drawer-dimension="{key}"]').get_attribute('data-mm')=='30'
            step(5);button('Проверить по размерам').click();button('Добавить в проект').click()
            page.evaluate('()=>MF_PLANNER.bridge.save()')
            page.evaluate('id=>MF_PLANNER.bridge.open(id)',case)
            with page.expect_download(timeout=30000) as event:
                page.locator('#export-bazis').click()
            payload=json.loads(Path(event.value.path()).read_text())
            assert payload['minimum_importer']=='9.9.30'
            panels={it['blank_item_id'].split(':')[-1]:it for it in payload['items'] if 'blank_item_id' in it}
            low,high=(panels[f'drawer-0-{n}-face'] for n in range(2))
            for face in (low,high):
                assert face['target']['height']==178.25 and face['target']['width']==725
                assert sum(it.get('aks_kind')=='face' and it['joined_panel_id']==face['blank_item_id'] for it in payload['items'])==3
            assert high['position']['y']-low['position']['y']-low['target']['height']==30
            shelf=panels['shelf-0-0']
            assert shelf['position']['y']-high['position']['y']-high['target']['height']==30
            assert sorted(it['joint_part'] for it in payload['items'] if it.get('joined_panel_id')==shelf['blank_item_id'])==['cam']*4+['dowel']*4
            for side in ('left','right'):
                screws=[it for it in payload['items'] if it.get('aks_kind')=='spacer' and it['joined_panel_id']==panels[side]['blank_item_id']]
                assert screws and all(it['source_file']==f'MF_AKS_spacer{side.title()}_19.fr3d' for it in screws)
            from backend.v2.wardrobe_aks import kit_bytes
            with ZipFile(BytesIO(kit_bytes())) as kit:
                for name,digest in {(it['source_file'],it['source_sha256']) for it in payload['items']}:
                    assert hashlib.sha256(kit.read('Martin Forest AKS/'+name)).hexdigest()==digest,name
            print('PASS 800 × 2200, niche 418, two 725 × 178.25 fronts, 30 mm gaps, six front screws, both 19 mm spacer donors; download',len(payload['items']),'items',flush=True)
            layout_id=str(uuid4())
            projects.projects[layout_id]={'project_id':layout_id,'name':'QA · повторное редактирование','version':1,
                'scene':{'schema_version':2,'room':{'width':5000,'height':2700,'depth':3600,'setup_complete':True},'items':[]}}
            page.evaluate('id=>MF_PLANNER.bridge.open(id)',layout_id)
            page.locator('#planner-assistant').click()
            form.get_by_label('Ширина, мм',exact=True).fill('1000')
            form.get_by_label('Общая высота шкафа от пола, мм',exact=True).fill('2400')
            form.get_by_label('Конструкция дна').select_option('none')
            step(4);form.get_by_label('Исполнение фасада',exact=True).select_option('pair')
            step(3);button('Полки').click()
            form.get_by_label('Полок в секции 1').select_option('1')
            form.get_by_text('Монтажная отметка от пола',exact=True).click()
            form.get_by_label('От пола до низа полки, мм').fill('764')
            button('Шуфляды').click();button('Добавить шуфляды').click()
            form.get_by_label('Количество шуфляд',exact=True).fill('2')
            form.get_by_text('Крепёж полок, корпуса и стоек',exact=True).click()
            form.get_by_label('Крепёж полок у шуфляд и заднего ребра').select_option('confirmat')
            button('Перегородка').click();button('Разделить шуфляды на левый и правый блок').click()
            form.get_by_label('Передний торец общей стойки').select_option('overlay')
            form.get_by_label('Ниша для перегородки').select_option('1')
            button('Добавить перегородку для полок').click()
            form.get_by_label('Полок в выбранной колонке').select_option('2')
            form.get_by_label('Нижний проём, мм',exact=True).fill('500')
            form.get_by_label('Нижний проём, мм',exact=True).press('Tab')
            button('Зафиксировать размер').click();button('Расставить полки равномерно').click()
            expect(form.get_by_text('Проёмы снизу вверх · 500 / 532 / 532 мм')).to_be_visible()
            button('Правая').click()
            form.get_by_label('Полок в выбранной колонке').select_option('2')
            form.get_by_label('Нижний проём, мм',exact=True).fill('500')
            form.get_by_label('Нижний проём, мм',exact=True).press('Tab')
            measure=form.locator('.wardrobe-figure [data-split-section="1"][data-column="1"][data-clear-level="1"]')
            measure.focus();measure.press('Enter')
            clear=form.get_by_label('Высота в свету, мм',exact=True);clear.fill('600');clear.press('Enter')
            expect(form.locator('.wardrobe-figure [data-split-section="1"][data-column="1"][data-clear-level="2"] text')).to_have_text('464')
            step(5);button('Проверить по размерам').click();button('Добавить в проект').click()
            page.evaluate('()=>MF_PLANNER.bridge.save()')
            page.evaluate('id=>MF_PLANNER.bridge.open(id)',layout_id)
            group=page.evaluate("""()=>{const it=MF_PLANNER.adapter.items.find(i=>i.item_id.endsWith(':drawer-33-0-face'));MF_PLANNER.adapter.select(it.item_id);MF_PLANNER.sync();return it.assistant_carcass.group_id;}""")
            edit=page.locator('#cabinet-edit')
            expect(edit).to_be_visible();edit.click()
            assert form.get_by_label('Действие со шкафом').input_value()=='update'
            assert form.get_by_label('Конструкция дна').input_value()=='none'
            form.get_by_label('Ширина, мм',exact=True).fill('1050')
            step(5);button('Проверить по размерам').click();button('Применить изменения').click()
            page.evaluate('()=>MF_PLANNER.bridge.save()');page.evaluate('id=>MF_PLANNER.bridge.open(id)',layout_id)
            items=projects.projects[layout_id]['scene']['items']
            assert {i['assistant_carcass']['group_id'] for i in items}=={group}
            assert items[0]['assistant_carcass']['spec']['width']==1050
            from backend.v2.three_d_api import Scene
            Scene.model_validate(projects.projects[layout_id]['scene'])
            with page.expect_download(timeout=30000) as event:page.locator('#export-bazis').click()
            result=json.loads(Path(event.value.path()).read_text())
            assert result['minimum_importer']=='9.9.31'
            assert any(i.get('source_file','').endswith('_shared18.fr3d') for i in result['items'])
            assert any(i.get('blank_item_id','').endswith(':rear-brace') for i in result['items'])
            assert not any(i.get('blank_item_id','').endswith(':bottom') for i in result['items'])
            print('PASS bottomless split wardrobe created, saved, reopened, edited to 1050 mm and exported',len(result['items']),'items',flush=True)
            # The same real parts are pickable in both cameras; viewing must never edit the order.
            page.emulate_media(reduced_motion='reduce')
            def wait_state(expression):
                expires=monotonic()+15
                while not page.evaluate(expression):
                    if monotonic()>=expires:
                        detail=page.evaluate("""()=>{const p=MF_PLANNER.assistant.livePreview;return {motion:p.motion,active:p.owner!=null,
                            pending:p.reading,queued:p.frame,hidden:p.root.hidden,width:p.canvas.clientWidth,height:p.canvas.clientHeight,selected:p.select.value}}""")
                        raise AssertionError((expression,detail))
                    page.wait_for_timeout(80)
            original=page.evaluate("JSON.stringify(MF_PLANNER.adapter.items)")
            page.evaluate("""()=>{const a=MF_PLANNER.adapter;a.select(a.items.find(i=>i.item_id.endsWith(':left')).item_id);MF_PLANNER.sync()}""")
            drawers=page.locator('#cabinet-drawers')
            expect(drawers).to_have_text('Шуфляды')
            drawers.click()
            wait_state("MF_PLANNER.scene.wardrobeMotion.door===1")
            def click_face(view,suffix):
                point=page.evaluate("""([name,suffix])=>{
                  const view=name==='scene'?MF_PLANNER.scene:MF_PLANNER.assistant.livePreview;
                  const it=view.adapter.items.find(it=>it.item_id.endsWith(suffix)),g=view.entries.get(it.item_id).group;
                  const point=view.camera.position.clone().set(0,it.height/2000,it.depth/2000).applyMatrix4(g.matrixWorld).project(view.camera);
                  const r=view.canvas.getBoundingClientRect();
                  return [r.left+(1+point.x)*r.width/2,r.top+(1-point.y)*r.height/2];
                }""",[view,suffix])
                element=page.evaluate("([x,y])=>document.elementFromPoint(x,y)?.tagName",point)
                assert element=='CANVAS',(view,suffix,point,element)
                if view=='scene':
                    picked=page.evaluate("([x,y])=>MF_PLANNER.scene.pick(x,y)?.id",point)
                    assert picked and picked.endswith(suffix),(picked,suffix)
                page.mouse.click(*point)
            if page.viewport_size['width']<761:page.evaluate("MF_PLANNER.workspace.closePanels();MF_PLANNER.scene.fit('wardrobe')")
            click_face('scene',':drawer-33-0-face')
            wait_state("MF_PLANNER.scene.wardrobeMotion.shown==='33-0'&&MF_PLANNER.scene.wardrobeMotion.extension===1")
            drawers.click()
            wait_state("!MF_PLANNER.scene.wardrobeMotion.id")
            assert page.evaluate("JSON.stringify(MF_PLANNER.adapter.items)")==original
            edit.click();step(3);button('Шуфляды').click()
            preview_card=form.locator('.wardrobe-live')
            expect(preview_card).to_be_visible()
            chooser=preview_card.get_by_label('Шуфляда для просмотра')
            chooser.select_option('0-1')
            wait_state("MF_PLANNER.assistant.livePreview.motion.extension===1")
            preview_card.locator('canvas').scroll_into_view_if_needed()
            click_face('preview',':drawer-0-1-face')
            wait_state("MF_PLANNER.assistant.livePreview.motion.extension===0")
            assert chooser.input_value()==''
            assert page.evaluate("JSON.stringify(MF_PLANNER.adapter.items)")==original
            print('PASS main scene and form: open both doors, pick one drawer in either camera, close, order intact',flush=True)
            assert not errors,errors
            print('PASS published assets' if live else 'PASS checkout assets','· pick, size, copy, edit, save, reopen ·',len(groups),'panels')
        except Exception:
            if 'form' in locals() and form.is_visible():
                print(form.inner_text()[-2500:],flush=True)
            print('Browser errors',errors,flush=True)
            raise
        finally:browser.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--live',action='store_true')
    exercise(parser.parse_args().live)
