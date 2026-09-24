"""Bounded passive attachment inspection. No conversion, execution, preview or archive extraction."""
from io import BytesIO
from pathlib import PurePosixPath
import re, unicodedata, zipfile, json
from xml.etree import ElementTree as ET
from PIL import Image

MAX_SIZE=10*1024*1024
FORMATS=['xlsx','xls','csv','pdf','oblx','png','jpg','jpeg','webp','txt','docx']

def filename(raw):
    if not raw or len(raw)>180 or raw!=raw.strip() or any(unicodedata.category(c).startswith('C') for c in raw):
        raise ValueError('UNSAFE_FILENAME')
    if any(c in raw for c in '/\\:<>|?*"') or raw.startswith('.') or raw.endswith('.'):
        raise ValueError('UNSAFE_FILENAME')
    if raw.split('.')[0].upper() in {'CON','PRN','AUX','NUL',*[f'COM{i}' for i in range(1,10)],*[f'LPT{i}' for i in range(1,10)]}:
        raise ValueError('UNSAFE_FILENAME')
    # Double executable extensions are never a way to present a safe filename.
    if any(x.lower() in {'exe','dll','msi','bat','cmd','ps1','js','vbs','hta','scr','com','lnk','sh','py','jar'} for x in raw.split('.')[1:]):
        raise ValueError('EXECUTABLE_FILE_DENIED')
    return raw

def decoded(data):
    try:
        if data.startswith((b'\xff\xfe',b'\xfe\xff')): return data.decode('utf-16')
        return data.decode('utf-8-sig')
    except UnicodeError: return None

def inspect(data,name):
    name=filename(name); ext=name.rsplit('.',1)[-1].lower()
    if ext not in FORMATS: raise ValueError('UNSUPPORTED_FILE_FORMAT')
    if not data or len(data)>MAX_SIZE: raise ValueError('ATTACHMENT_SIZE_LIMIT')
    if data.startswith((b'MZ',b'\x7fELF',b'#!')): raise ValueError('EXECUTABLE_FILE_DENIED')
    text=decoded(data)
    # Recognize native XML independently of supplied extension/MIME/category. Never parse entities.
    if text is not None and text.lstrip().startswith('<'):
        if re.search(r'<!\s*(DOCTYPE|ENTITY)',text,re.I): raise ValueError('UNSAFE_XML')
        try: root=ET.fromstring(text)
        except ET.ParseError: raise ValueError('UNSUPPORTED_FILE_CONTENT') from None
        if root.tag=='Root' and root.find('Materials') is not None and (root.get('Programm') or root.find('NumberOfSets') is not None):
            return 'oblx','application/xml'
        raise ValueError('UNSUPPORTED_FILE_CONTENT')
    if ext=='oblx': raise ValueError('INVALID_OBLX')
    if ext=='pdf':
        if not data.startswith(b'%PDF-') or b'%%EOF' not in data[-2048:]: raise ValueError('INVALID_PDF')
        names=re.sub(rb'#([0-9a-fA-F]{2})',lambda m:bytes([int(m[1],16)]),data)
        if re.search(rb'/(JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile|RichMedia|XFA|Encrypt|ObjStm)\b',names,re.I):
            raise ValueError('ACTIVE_DOCUMENT_DENIED')
        return 'pdf','application/pdf'
    if ext in {'png','jpg','jpeg','webp'}:
        try:
            with Image.open(BytesIO(data)) as image:
                if image.width*image.height>25_000_000: raise ValueError('IMAGE_LIMIT')
                actual=image.format; image.verify()
            if actual!={'png':'PNG','jpg':'JPEG','jpeg':'JPEG','webp':'WEBP'}[ext]: raise ValueError('IMAGE_FORMAT_MISMATCH')
        except Exception: raise ValueError('INVALID_IMAGE') from None
        return ext,{'PNG':'image/png','JPEG':'image/jpeg','WEBP':'image/webp'}[actual]
    if ext in {'xlsx','docx'}:
        try:
            with zipfile.ZipFile(BytesIO(data)) as z:
                items=z.infolist(); names=[i.filename for i in items]
                if len(items)>2000 or len(set(names))!=len(names) or sum(i.file_size for i in items)>50*1024*1024: raise ValueError()
                if any(i.flag_bits&1 or i.file_size>10*1024*1024 or i.file_size/max(i.compress_size,1)>200 for i in items): raise ValueError()
                if any(n.startswith('/') or '\\' in n or '..' in PurePosixPath(n).parts or ':' in n for n in names): raise ValueError()
                if any(re.search(r'vba|macros?|activex|embeddings|externallinks|customui',n,re.I) for n in names): raise ValueError()
                expected='xl/workbook.xml' if ext=='xlsx' else 'word/document.xml'
                if expected not in names or '[Content_Types].xml' not in names: raise ValueError()
                for n in names:
                    if n.endswith(('.xml','.rels')):
                        t=decoded(z.read(n))
                        if t is None or re.search(r'<!\s*(DOCTYPE|ENTITY)|macroEnabled|oleObject|altChunk',t,re.I): raise ValueError()
                        doc=ET.fromstring(t)
                        if n.endswith('.rels') and any(e.get('TargetMode')=='External' for e in doc): raise ValueError()
                    elif not (n.endswith('/') or re.search(r'\.(png|jpe?g|webp|gif|bin)$',n,re.I)): raise ValueError()
                    elif n.lower().endswith('.bin'): raise ValueError()
        except Exception: raise ValueError('UNSAFE_OFFICE_DOCUMENT') from None
        return ext,('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' if ext=='xlsx' else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    if ext=='xls':
        try:
            import olefile
            with olefile.OleFileIO(BytesIO(data),raise_defects=olefile.DEFECT_INCORRECT) as ole:
                streams=ole.listdir()
                if len(streams)>100 or not any(s in (['Workbook'],['Book']) for s in streams): raise ValueError()
                if any(re.search(r'VBA|Macros|_VBA_PROJECT|ObjectPool|Ole10Native', '/'.join(s),re.I) for s in streams): raise ValueError()
                # BIFF FILEPASS, OBPROJ and macro sheet records are not allowed in manual XLS.
                b=ole.openstream('Workbook' if ole.exists('Workbook') else 'Book').read()
                at=0
                while at<len(b):
                    if at+4>len(b): raise ValueError()
                    tag=int.from_bytes(b[at:at+2],'little'); size=int.from_bytes(b[at+2:at+4],'little'); at+=4
                    if at+size>len(b) or tag in {0x2f,0xd3}: raise ValueError()
                    if tag==0x85 and size>=6 and b[at+5] in {1,6}: raise ValueError()
                    at+=size
        except Exception: raise ValueError('UNSAFE_XLS') from None
        return ext,'application/vnd.ms-excel'
    if ext in {'txt','csv'} and text is not None:
        if re.search(r'(?i)\b(lease_token|agent_api_key|access_token|database_url)\b',text): raise ValueError('SENSITIVE_ARTIFACT_DENIED')
        if re.search(r'(?i)\b(job_id|run_id|manifest_hash|fencing|native_signature|storage_key)\b|[A-Za-z]:[\\/]',text):
            return 'production_internal','text/plain; charset=utf-8'
        if any(ord(c)<32 and c not in '\r\n\t' for c in text): raise ValueError('UNSAFE_TEXT')
        if re.search(r'(?im)^\s*(#!|<script|<\?php|@echo|powershell\b|import\s+os\b|function\s+\w+\s*\(|const\s+\w+\s*=|\$\w+\s*=)',text): raise ValueError('EXECUTABLE_FILE_DENIED')
        return ext,'text/plain; charset=utf-8' if ext=='txt' else 'text/csv; charset=utf-8'
    raise ValueError('UNSUPPORTED_FILE_CONTENT')
