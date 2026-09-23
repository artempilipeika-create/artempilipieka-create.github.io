"""Synthetic acceptance scenarios over existing HTTP contracts, not product code."""
import base64
from io import BytesIO
from uuid import uuid4
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED

from .excel_import import DEFAULT_EDGE_DICTIONARY

HEADERS = ['position','name','article','material','length','width','qty','texture','rotation','L1','L2','W1','W2']


def workbook(article):
    rows = [HEADERS, [1,'SYNTHETIC correction fixture',article,'Synthetic part',600,400,0,'none','false','0','0','0','0']]
    out = BytesIO()
    with ZipFile(out, 'w', ZIP_DEFLATED) as z:
        z.writestr('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Parts" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>')
        cells = ''.join('<row r="'+str(n)+'">'+''.join('<c r="'+chr(65+i)+str(n)+'" t="inlineStr"><is><t>'+escape(str(v))+'</t></is></c>' for i,v in enumerate(row))+'</row>' for n,row in enumerate(rows,1))
        z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+cells+'</sheetData></worksheet>')
    return out.getvalue()


def post(api, path, body, version=None, status=200, **headers):
    if version is not None: headers['If-Match'] = str(version)
    response = api.post('/api/v2'+path, json=body, headers=headers)
    if response.status_code != status:
        # Response has no auth header/body echo; do not include input credentials.
        raise AssertionError((path, response.status_code, response.text[:500]))
    return response.json()


def import_zero(api, order, article):
    definition = {'headers':{chr(65+i):h for i,h in enumerate(HEADERS)},
                  'sheet_policy':{'mode':'explicit','header_row':1},
                  'mapping':{h:chr(65+i) for i,h in enumerate(HEADERS)},
                  'inheritance':{'enabled':False,'header_marker':'MATERIAL','blank_resets':True,'service_markers':['TOTAL']},
                  'edge_dictionary':dict(DEFAULT_EDGE_DICTIONARY),'units':{'length':'mm','width':'mm','thickness':'mm'}}
    template = post(api,'/import-templates',{'name':'SYNTHETIC Stage 8','definition':definition},status=201)
    data = workbook(article)
    preview = post(api,'/imports/preview',{'filename':'synthetic-stage08.xlsx','content_base64':base64.b64encode(data).decode(),
                   'order_id':order['order_id'],'template_revision_id':template['template_revision_id'],'selected_sheets':['Parts']},status=201)
    applied = post(api,'/imports/'+preview['import_id']+'/confirm',{'mode':'add'},order['optimistic_lock_version'])
    rows = api.get('/api/v2/orders/'+order['order_id']+'/draft/rows').json()['rows']
    assert len(rows)==1 and rows[0]['snapshot']['values']['qty']==0 and rows[0]['snapshot']['errors']
    return preview, rows[0], applied


def corrected_detail(material, row):
    return {'detail_id':'corrected','draft_row_id':row['draft_row_id'],
            'resolution_reason':'SYNTHETIC operator confirms original qty=0 corrected to 3; source retained',
            'length':'600','width':'400','qty':3,'variant_id':material['variant_id'],
            'rotation':False,'grain':'none','route':'glued_18_18','packaging':True,'edges':{}}


def corrected_revision(api, order, release, material, row, version, parent=None, extra=None):
    return post(api,'/orders/'+order['order_id']+'/revisions',
                {'reason':'SYNTHETIC traceable correction of source quantity',
                 'catalogue_release_id':release,'parent_revision_id':parent,
                 'details':[corrected_detail(material,row),*(extra or [])]},version,status=201)


def submit(api, order, revision=None, calculation=None, version=None):
    body = {'comment':'SYNTHETIC Stage 8 manager review of retained source and explicit corrections'}
    if revision: body['revision_id']=revision['revision_id']
    if calculation: body['preliminary_calculation_id']=calculation['calculation_id']
    return post(api,'/orders/'+order['order_id']+'/submit',body,version,**{'Idempotency-Key':uuid4().hex})
