"""Bounded workbook preview. Reuse the OOXML parser and the legacy upload validator."""
import hashlib
from .xlsx import read_workbook as read_xlsx


def read_workbook(data):
    if not data.startswith(bytes.fromhex('d0cf11e0a1b11ae1')):
        return read_xlsx(data)
    from .attachment_content import inspect
    def column(n):
        result=''
        while n:
            n,r=divmod(n-1,26);result=chr(65+r)+result
        return result
    import xlrd
    inspect(data,'source.xls')
    book=xlrd.open_workbook(file_contents=data,on_demand=True)
    try:
        if book.nsheets>50: raise ValueError('Worksheet limit')
        sheets=[];total=0
        for sheet in book.sheets():
            total+=sheet.nrows*sheet.ncols
            if total>200000 or sheet.nrows>10000 or sheet.ncols>256: raise ValueError('Worksheet limit')
            rows=[]
            for ri in range(sheet.nrows):
                cells={}
                for ci in range(sheet.ncols):
                    cell=sheet.cell(ri,ci)
                    if cell.ctype in (xlrd.XL_CELL_EMPTY,xlrd.XL_CELL_BLANK): continue
                    value=cell.value
                    if cell.ctype==xlrd.XL_CELL_BOOLEAN: value=bool(value)
                    cells[column(ci+1)]={'value':value,'type':'e' if cell.ctype==xlrd.XL_CELL_ERROR else 's','formula':None,'cached':None}
                rows.append({'row':ri+1,'cells':cells})
            sheets.append({'name':sheet.name,'rows':rows})
        return {'sha256':hashlib.sha256(data).hexdigest(),'sheets':sheets}
    finally: book.release_resources()
