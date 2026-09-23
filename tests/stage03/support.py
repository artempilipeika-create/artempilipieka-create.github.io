"""Synthetic OOXML fixtures only; never a copy of the private master."""
from io import BytesIO
from zipfile import ZipFile,ZIP_DEFLATED
from xml.sax.saxutils import escape,quoteattr
from backend.v2.catalogue_model import HEADERS
from backend.v2.excel_import import DEFAULT_EDGE_DICTIONARY


def xlsx(sheets):
    out=BytesIO()
    with ZipFile(out,'w',ZIP_DEFLATED) as z:
        names=[];rels=[]
        for i,(name,rows) in enumerate(sheets.items(),1):
            names.append(f'<sheet name={quoteattr(name)} sheetId="{i}" r:id="rId{i}"/>')
            rels.append(f'<Relationship Id="rId{i}" Target="worksheets/sheet{i}.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>')
            xml=[]
            for n,values in enumerate(rows,1):
                cells=[]
                for index,value in enumerate(values):
                    col=chr(65+index);coord=f'{col}{n}'
                    if value is None: continue
                    if isinstance(value,dict):
                        cached='' if value.get('cached') is None else '<v>'+escape(str(value['cached']))+'</v>'
                        cells.append(f'<c r="{coord}"><f>{escape(value["formula"])}</f>{cached}</c>')
                    else: cells.append(f'<c r="{coord}" t="inlineStr"><is><t xml:space="preserve">{escape(str(value))}</t></is></c>')
                xml.append(f'<row r="{n}">'+''.join(cells)+'</row>')
            z.writestr(f'xl/worksheets/sheet{i}.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+''.join(xml)+'</sheetData></worksheet>')
        z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join(names)+'</sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(rels)+'</Relationships>')
    return out.getvalue()


def master(rows=None):
    rows=rows if rows is not None else [
        ['621 PO','Board 621 PO','кв.м','999',2800,2070,18,'PO','','M1','false',''],
        ['621 PE','Board 621 PE','кв.м','1',2440,1220,18,'PE','','M1','false',''],
        [None,'ЛХДФ  Белый','кв.м',0,2800,2070,3,'3мм','','M1','false',''],
        ['E-22','Edge 22','м',0,0,22,.4,'621 POX','','M2','false',''],
        ['E-2','Edge 2','м',0,0,2,.4,'621 PO','','M2','false','']]
    return xlsx({'Sheet1':[HEADERS,*rows]})


PART_HEADERS=['kind','position','name','article','material','length','width','qty','texture','rotation','comments','X1','L1','X2','Y1','Y2','thickness','format_length','format_width']


def template():
    return {'headers':{chr(65+i):h for i,h in enumerate(PART_HEADERS)},
        'sheet_policy':{'mode':'explicit','header_row':1},
        'mapping':{h:chr(65+i) for i,h in enumerate(PART_HEADERS) if h!='kind'}|{'row_type':'A'},
        'inheritance':{'enabled':True,'header_marker':'MATERIAL','blank_resets':True,'service_markers':['TOTAL']},
        'edge_dictionary':dict(DEFAULT_EDGE_DICTIONARY),'units':{'length':'mm','width':'mm','thickness':'mm'}}


def part(qty=1,length=500,width=200,article='621 PO',material='Board',**kw):
    values={'position':1,'name':'Part','article':article,'material':material,'length':length,'width':width,'qty':qty,
            'X1':'*','X2':'*','Y1':'*','Y2':'*',**kw}
    return [values.get(k) for k in PART_HEADERS]


def parts(rows=None,sheets=None):
    return xlsx(sheets or {'Parts':[PART_HEADERS,*(rows if rows is not None else [part()])]})
