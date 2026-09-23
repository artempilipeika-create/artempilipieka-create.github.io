"""Bounded, read-only OOXML reader. Never evaluates formulae, links or macros."""
from io import BytesIO
import hashlib
import posixpath
import re
from zipfile import ZipFile, BadZipFile
from xml.etree import ElementTree as ET

NS = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def xml(data):
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('XML entities are forbidden')
    return ET.fromstring(data)


def read_workbook(data):
    if not data or len(data)>20*1024*1024:
        raise ValueError('XLSX size exceeds 20 MiB')
    try:
        with ZipFile(BytesIO(data)) as z:
            entries=z.infolist()
            if len(entries)>2000 or sum(i.file_size for i in entries)>100*1024*1024:
                raise ValueError('XLSX expansion limit')
            if len({i.filename for i in entries})!=len(entries):
                raise ValueError('Duplicate ZIP paths')
            if any('vbaProject' in i.filename or '..' in i.filename.split('/') for i in entries):
                raise ValueError('Macros or unsafe ZIP paths are forbidden')
            strings=[]
            if 'xl/sharedStrings.xml' in z.namelist():
                strings=[''.join(t.text or '' for t in si.findall('.//s:t',NS))
                         for si in xml(z.read('xl/sharedStrings.xml')).findall('s:si',NS)]
            rels={e.get('Id'):e for e in xml(z.read('xl/_rels/workbook.xml.rels'))}
            sheets=[]; total=0; count=0
            for sheet in xml(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',NS):
                rel=rels[sheet.get(REL)]
                if rel.get('TargetMode')=='External':
                    raise ValueError('External worksheet forbidden')
                path=posixpath.normpath(posixpath.join('xl',rel.get('Target',''))).lstrip('/')
                if not path.startswith('xl/'):
                    raise ValueError('Worksheet outside workbook')
                doc=xml(z.read(path)); physical={}
                for row in doc.findall('s:sheetData/s:row',NS):
                    number=int(row.get('r','0'))
                    if number<1 or number>50000 or number in physical:
                        raise ValueError('Invalid or duplicate row coordinate')
                    cells={}
                    for c in row.findall('s:c',NS):
                        coord=c.get('r',''); match=re.fullmatch(r'([A-Z]{1,3})([1-9][0-9]*)',coord)
                        if not match or int(match[2])!=number or match[1] in cells:
                            raise ValueError('Invalid or duplicate cell coordinate')
                        typ=c.get('t','n'); v=c.find('s:v',NS); formula=c.find('s:f',NS)
                        value=v.text if v is not None else None
                        if typ=='s' and value is not None: value=strings[int(value)]
                        if typ=='inlineStr': value=''.join(t.text or '' for t in c.findall('s:is//s:t',NS))
                        cells[match[1]]={'cell':coord,'type':typ,'value':value,
                            'formula':None if formula is None else (formula.text or ''),
                            'formula_attributes':None if formula is None else dict(formula.attrib),
                            'cached':None if formula is None else value}
                        count+=1
                        if count>750000: raise ValueError('Cell limit exceeded')
                    physical[number]=cells
                last=max(physical,default=0); total+=last
                if total>50000: raise ValueError('Workbook row limit exceeded')
                # Gaps are explicit blank rows; dimensions cannot manufacture millions of rows.
                sheets.append({'name':sheet.get('name'),'rows':[{'row':n,'cells':physical.get(n,{})}
                              for n in range(1,last+1)]})
            if not sheets or len(sheets)>50: raise ValueError('Invalid worksheet count')
            return {'sha256':hashlib.sha256(data).hexdigest(),'sheets':sheets}
    except (BadZipFile,KeyError,IndexError,ET.ParseError) as exc:
        raise ValueError('Invalid XLSX structure') from exc


def raw_value(cells,column):
    return cells.get(column,{}).get('value')
