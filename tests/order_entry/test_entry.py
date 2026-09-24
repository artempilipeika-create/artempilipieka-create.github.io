"""Order entry acceptance through real ASGI/Postgres; no production connections."""
import base64
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from pypdf import PdfReader
from backend.v2.db import transaction
from backend.v2.identity import search_candidates,resolve
from backend.v2.client_workbook import read_workbook
from tests.stage03.test_api import settings,api,admin_user,post,publish,login,PASSWORD,payload
from tests.stage03.support import xlsx
from tests.stage04.test_api import order,item,configure,revision,request_detail,calc
from tests.stage05.test_api import client_order,staff


def test_search_formatting_and_distinct_decor():
    items=[{'variant_id':'po','article':'621 PO','name':'Белый','thickness':18},
           {'variant_id':'pe','article':'621 PE','name':'Белый','thickness':18},
           {'variant_id':'oak','article':'H1180 ST37','name':'Дуб Галифакс','thickness':18},
           {'variant_id':'long','article':'H11800 ST37','name':'Другой дуб','thickness':18}]
    for raw,expected in [({'raw_article':' 621\u00a0РО '},['po']),({'raw_material_name':'ЛДСП H1180 ST37 Дуб Галифакс 18 мм'},['oak']),({'raw_material_name':'Дуб Галифакс'},['oak']),({'raw_article':'621 PE'},['pe'])]:
        assert [i['variant_id'] for i in search_candidates(raw,items)]==expected
        assert resolve(raw,items,'r')['selected'] is None # Suggestions still require explicit confirmation.
    assert search_candidates({'raw_article':'UNKNOWN'},items)==[]
    assert search_candidates({'raw_article':'621 PO','raw_thickness':16},items)==[]


def test_real_legacy_xls_reader():
    data=base64.b64decode(Path('tests/stage84/fixtures/plain.xls.b64').read_text())
    book=read_workbook(data)
    assert book['sheets'] and book['sheets'][0]['rows']


def test_manual_five_rows_reload_preview_pdf_before_submit(api,settings,admin_user):
    _,release=publish(api);o=order(api);m=item(api,release);configure(api,o,release,m)
    details=[request_detail(m,detail_id='part-'+str(i),name='Полка '+str(i),comments='Примечание '+str(i),length=str(600+i),qty=i+1) for i in range(5)]
    r=revision(api,o,release,details);read=api.get('/api/v2/orders/'+o['order_id']+'/revisions/'+r['revision_id']).json()
    assert len(read['details'])==5 and read['details'][3]['name']=='Полка 3' and read['details'][4]['qty']==5
    details.pop(1);details.append({**details[0],'detail_id':'copy'});details[0]['width']='444'
    newer=revision(api,o,release,details,r['optimistic_lock_version'],r['revision_id']);c=calc(api,o,newer)
    assert c['completeness']=='complete'
    view=api.get('/api/v2/calculations/'+c['calculation_id']+'/preview').json()
    assert len(view['details'])==5 and view['details'][0]['width']=='444'
    d=post(api,'/calculations/'+c['calculation_id']+'/documents/preliminary',{},status=201)
    download=api.get('/api/v2/documents/'+d['file_id']);inline=api.get('/api/v2/documents/'+d['file_id']+'?inline=true')
    assert download.content==inline.content and inline.headers['content-disposition'].startswith('inline;')
    text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(download.content)).pages)
    assert 'Деталировка' in text and 'Полка 0' in text and 'Примечание 0' in text and view['amount']+' BYN' in text
    assert api.get('/api/v2/orders/'+o['order_id']).json()['workflow_status']=='draft'


def test_excel_preview_template_reuse_rows_and_errors(api,settings,admin_user):
    _,release=publish(api);o=order(api)
    headers=['Материал','Длина','Ширина','Количество','L1','L2','W1','W2','Примечание','Лишнее']
    raw=xlsx({'Детали':[headers,['621 PO',600,400,2,'0','0','0','0','Полка','ignore'],['UNKNOWN','',400,'ошибка','0','0','0','0','','ignored']]})
    inspect=post(api,'/imports/workbook',payload(raw,order_id=o['order_id']))
    assert inspect['sheets'][0]['rows'][1]['cells']['A']['value']=='621 PO'
    definition={'headers':{chr(65+i):x for i,x in enumerate(headers)},'sheet_policy':{'mode':'named','sheets':['Детали'],'header_row':1},
        'mapping':dict(zip(['material','length','width','qty','L1','L2','W1','W2','comments'],list('ABCDEFGHI'))),
        'inheritance':{'enabled':False,'blank_resets':True},'edge_dictionary':{'0':'none','':'none'},'units':{'length':'mm','width':'mm'}}
    t=post(api,'/import-templates',{'name':'Мой Excel','order_id':o['order_id'],'definition':definition},status=201)
    listed=api.get('/api/v2/import-templates',params={'order_id':o['order_id']}).json()['items']
    assert any(x['template_revision_id']==t['template_revision_id'] for x in listed)
    body=payload(raw,order_id=o['order_id'],template_revision_id=t['template_revision_id'],selected_sheets=['Детали'])
    p=post(api,'/imports/preview',body,status=201);again=post(api,'/imports/preview',body,status=201)
    assert again['import_id']==p['import_id'] and again['reused']
    valid,bad=p['rows'][1:];assert valid['resolution']['candidates'] and not bad['resolution']['candidates']
    assert {(x['field'],x['raw']) for x in bad['original']['errors']} >= {('length',''),('qty','ошибка')}
    m=item(api,release)
    post(api,'/imports/'+p['import_id']+'/rows/'+valid['row_id']+'/resolution',{'variant_id':m['variant_id'],'reason':'Подтверждение из предпросмотра'})
    added=post(api,'/imports/'+p['import_id']+'/confirm',{'mode':'add'},1)
    rows=api.get('/api/v2/orders/'+o['order_id']+'/draft/rows').json()['rows'];assert len(rows)==2
    assert any(x['snapshot']['values']['qty']=='ошибка' for x in rows)
    assert any(x['snapshot']['resolution']['selected'] and x['snapshot']['resolution']['selected']['variant_id']==m['variant_id'] for x in rows)


def test_manager_source_without_mapping_optional_comment_and_scope(api,settings,admin_user):
    o,_,_,email=client_order(api,settings,admin_user,mode='manager_assisted')
    data=base64.b64decode(Path('tests/stage84/fixtures/plain.xls.b64').read_text())
    saved=post(api,'/orders/'+o['order_id']+'/source',payload(data,'original.xls'),status=201)
    assert api.get(saved['download_url']).content==data
    files=api.get('/api/v2/orders/'+o['order_id']+'/sources').json()['items'];assert len(files)==1 and files[0]['name']=='original.xls'
    version=api.get('/api/v2/orders/'+o['order_id']).json()['optimistic_lock_version']
    result=api.post('/api/v2/orders/'+o['order_id']+'/submit',json={'comment':''},headers={'If-Match':str(version),'Idempotency-Key':uuid4().hex})
    assert result.status_code==200,result.text
    with transaction(settings) as c:
        assert c.execute('SELECT count(*) n FROM mf_import_batches WHERE order_id=%s',(o['order_id'],)).fetchone()['n']==0
        assert c.execute('SELECT count(*) n FROM mf_calculations WHERE order_id=%s',(o['order_id'],)).fetchone()['n']==0
        assert c.execute('SELECT count(*) n FROM mf_production_jobs WHERE order_id=%s',(o['order_id'],)).fetchone()['n']==0
        assert c.execute("SELECT 1 FROM mf_audit a JOIN mf_outbox b USING(event_id) WHERE a.object_id=%s AND a.action='order.submitted'",(o['order_id'],)).fetchone()
    _,manager=staff(settings,'manager',o['order_id'],['orders.read','files.source.read'],assigned=True)
    login(api,manager);assert api.get(saved['download_url']).content==data
    post(api,'/auth/register',{'email':uuid4().hex+'@example.invalid','password':PASSWORD},status=201)
    assert api.get(saved['download_url']).status_code==403
    assert api.get('/api/v2/orders/'+o['order_id']+'/sources').status_code==403
    assert api.post('/api/v2/orders/'+o['order_id']+'/source',json=payload(data,'other.xls')).status_code==403

def test_3d_project_persistence_copy_and_owner_scope(api,settings,admin_user):
    _,_,_,email=client_order(api,settings,admin_user,mode='self_prepared')
    body={'name':'Комод гостиная','scene':{'module_type':'chest','width':1200,'height':900,'depth':450,'layout':'combo','drawers':3,'base':'plinth','handles':'handles','body_variant_id':None,'front_variant_id':None,'view_mode':'3d'}}
    created=post(api,'/3d-projects',body,status=201)
    assert created['name']=='Комод гостиная' and created['version']==1
    listed=api.get('/api/v2/3d-projects').json()['items']
    assert any(x['project_id']==created['project_id'] for x in listed)
    updated=api.patch('/api/v2/3d-projects/'+created['project_id'],json={**body,'name':'Комод вариант 2','version':1})
    assert updated.status_code==200 and updated.json()['version']==2
    assert api.patch('/api/v2/3d-projects/'+created['project_id'],json={**body,'version':1}).status_code==409
    copied=post(api,'/3d-projects/'+created['project_id']+'/duplicate',{},status=201)
    assert copied['project_id']!=created['project_id'] and 'копия' in copied['name']
    post(api,'/auth/register',{'email':uuid4().hex+'@example.invalid','password':PASSWORD},status=201)
    assert api.get('/api/v2/3d-projects/'+created['project_id']).status_code==404
