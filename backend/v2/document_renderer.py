"""Offline deterministic ReportLab renderer. No HTML, URLs, external fonts or finance formulas."""
from io import BytesIO
from pathlib import Path
from html import escape
import hashlib,json,sys,subprocess,resource
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,KeepTogether
from .document_projection import UNITS

VERSION='mf-preliminary-a4-v2'
RENDERER='reportlab-4.4.9-mf-v2'
FONTS={'DejaVuSans.ttf':'ae7b7855e115a5966d8b1b3f80f254ccc117ec86f9965e202ee2940453837280',
 'DejaVuSans-Bold.ttf':'5c1247acef7f2b8522a31742c76d6adcb5569bacc0be7ceaa4dc39dd252ce895'}
ASSET_HASH=hashlib.sha256(Path(__file__).read_bytes()+Path(__file__).with_name('document_projection.py').read_bytes()+json.dumps(FONTS,sort_keys=True).encode()).hexdigest()
FOREST=colors.HexColor('#153d2d');INK=colors.HexColor('#20382c');MUTED=colors.HexColor('#68736b');RULE=colors.HexColor('#d9ddd2');PAPER=colors.HexColor('#f6f3eb')
WIDTH=A4[0]-32*mm

def n(value):
    return 'Уточняется' if value is None else str(value)

def validate(data):
    if len(json.dumps(data,ensure_ascii=False).encode())>500_000: raise ValueError('Document size limit')
    if sum(len(data[k]) for k in ('materials','edges','services'))>500: raise ValueError('Document row limit')
    def walk(v):
        if isinstance(v,str) and (len(v)>2000 or any(ord(c)<32 and c not in '\n\t' for c in v)): raise ValueError('Document text limit')
        if isinstance(v,dict):
            for x in v.values(): walk(x)
        if isinstance(v,list):
            for x in v: walk(x)
    walk(data)


def render(data, template_version=VERSION):
    validate(data)
    root=Path(__file__).parent/'document_assets'
    for file,expected in FONTS.items():
        path=root/file
        if hashlib.sha256(path.read_bytes()).hexdigest()!=expected: raise ValueError('Font integrity')
        pdfmetrics.registerFont(TTFont('MF-Bold' if 'Bold' in file else 'MF',str(path)))
    pdfmetrics.registerFontFamily('MF',normal='MF',bold='MF-Bold',italic='MF',boldItalic='MF-Bold')
    font=pdfmetrics.getFont('MF').face.charToGlyph
    for c in json.dumps(data,ensure_ascii=False):
        if ord(c)>=32 and ord(c) not in font: raise ValueError('Unsupported glyph')
    styles={
      'body':ParagraphStyle('body',fontName='MF',fontSize=10,leading=13,textColor=INK,spaceAfter=3,splitLongWords=True),
      'small':ParagraphStyle('small',fontName='MF',fontSize=9,leading=12,textColor=MUTED,spaceAfter=3),
      'heading':ParagraphStyle('heading',fontName='MF-Bold',fontSize=12,leading=16,textColor=FOREST,spaceBefore=10,spaceAfter=6,keepWithNext=False),
      'title':ParagraphStyle('title',fontName='MF-Bold',fontSize=18,leading=23,textColor=FOREST,spaceAfter=10),
      'amount':ParagraphStyle('amount',fontName='MF-Bold',fontSize=24,leading=29,textColor=FOREST,spaceAfter=7),
      'tablehead':ParagraphStyle('tablehead',fontName='MF-Bold',fontSize=9,leading=12,textColor=FOREST),
    }
    def p(text,style='body'): return Paragraph(escape(str(text)).replace('\n','<br/>'),styles[style])
    def table(headers,rows,widths,title):
        t=Table([[p(title,'heading')]+['']*(len(headers)-1),[p(x,'tablehead') for x in headers]]+rows,colWidths=[WIDTH*w for w in widths],repeatRows=2,hAlign='LEFT',splitByRow=1)
        t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('SPAN',(0,0),(-1,0)),('BACKGROUND',(0,1),(-1,1),PAPER),
          ('LINEBELOW',(0,1),(-1,1),.6,RULE),('LINEBELOW',(0,1),(-1,-1),.3,RULE),
          ('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
        return t
    story=[p('Martin Forest','heading'),p(data['title'],'title'),p('Заказ '+data['order_number']+' · '+data['order_name']),
      p('Клиент / компания: '+data['customer']),p('Документ от '+data['date']+' · Редакция '+str(data['revision_number']),'small'),p(data['status_label'],'small')]
    if data['synthetic']: story.append(p('Тестовый пример: условные цены, не коммерческое предложение.','small'))
    if data['materials']:
        rows=[]
        for m in data['materials']:
            identity='\n'.join(str(v) for v in (m['manufacturer'],m['name'],('Артикул: '+m['article']) if m['article'] else None,('Структура: '+m['structure']) if m['structure'] else None) if v)
            dims=' · '.join([str(m['thickness'])+' мм' if m['thickness'] else '',str(m['length'])+' × '+str(m['width'])+' мм' if m['length'] and m['width'] else '']).strip(' ·')
            note=data['customer_material_notice'] if m['supply_source']=='customer' else ''
            info=[p(identity),p(dims,'small')]
            if note: info.append(p(note,'small'))
            price=n(m['unit_price'])+' / лист'
            if m.get('price_unit')=='m2': price+='\nЦена за м²: '+n(m['sale_price'])
            rows.append([info,p(n(m['quantity'])),p(price),p(n(m['amount']))])
        story.append(table(['Материал / формат','Расчётное количество листов','Цена, BYN','Сумма, BYN'],rows,[.49,.17,.18,.16],'Материалы'))
    if data['edges']:
        rows=[]
        for e in data['edges']:
            info='\n'.join(str(v) for v in (e.get('name') or e.get('designation'),e.get('article'),str(e.get('width') or '?')+' × '+str(e.get('thickness') or '?')+' мм') if v)
            metres='Чистовой: '+n(e['net_metres'])+' м'
            if e.get('policy'):
                metres+='\nЗакупочный: '+n(e['procurement_metres'])+' м\nОплачиваемый: '+n(e['billable_metres'])+' м'
                policy=e['policy'];metres+='\nПо чистовому метражу' if policy['basis']=='net' else '\nЗапас × '+n(policy.get('factor'))+'; шаг '+n(policy.get('step_m'))+' м'
            if e['supply_source']=='customer': info+='\nКромка заказчика'
            rows.append([p(info),p(metres,'small'),p(n(e['unit_price'])+' / м'),p(n(e['amount']))])
        story.append(table(['Кромка','Метраж','Цена, BYN','Сумма, BYN'],rows,[.38,.28,.18,.16],'Материал кромки'))
    if data['services']:
        story.append(table(['Операция','Объём','Тариф, BYN','Сумма, BYN'],[[p(s['name']),p(n(s['quantity'])+' '+UNITS.get(s['unit'],'')),p(n(s['unit_price'])),p(n(s['amount']))] for s in data['services']],[.49,.17,.18,.16],'Производственные услуги'))
    story.append(table(['Категория','До скидки','Скидка, %','Скидка, BYN','После, BYN'],[[p(d['name']),p(n(d['gross'])),p(n(d['percent']),'small' if d['percent'] is None else 'body'),p(n(d['discount'])),p(n(d['net']))] for d in data['discounts']],[.36,.16,.14,.17,.17],'Три независимые скидки'))
    if data['state']!='complete':
        story.append(p('Требует уточнения стоимости','heading'))
        for text in data['unresolved']: story.append(p(text,'small'))
        story.append(p('Указанные суммы включают только рассчитанные позиции.','small'))
    story.append(KeepTogether([Spacer(1,12),p(data['amount_label'],'heading'),p(n(data['amount'])+(' BYN' if data['amount'] is not None else ''),'amount'),p(data['disclaimer'],'small')]))
    def footer(canvas,doc):
        if doc.page>100: raise ValueError('Document page limit')
        canvas.saveState();canvas.setFont('MF',9);canvas.setFillColor(MUTED)
        canvas.drawString(16*mm,11*mm,'Martin Forest · Заказ '+data['order_number'])
        canvas.drawRightString(A4[0]-16*mm,11*mm,'Страница '+str(doc.page))
        if doc.page>1:
            canvas.drawString(16*mm,A4[1]-12*mm,'ПРЕДВАРИТЕЛЬНЫЙ РАСЧЁТ · '+data['order_number'])
        canvas.restoreState()
    buf=BytesIO();doc=SimpleDocTemplate(buf,pagesize=A4,leftMargin=16*mm,rightMargin=16*mm,topMargin=17*mm,bottomMargin=20*mm,
        title=data['title'],author='Martin Forest',subject='Предварительный расчёт · '+template_version)
    doc.build(story,onFirstPage=footer,onLaterPages=footer,canvasmaker=lambda *a,**kw:Canvas(*a,**{**kw,'invariant':1,'pageCompression':1}))
    return buf.getvalue()


def bounded_render(data):
    validate(data)
    proc=subprocess.run([sys.executable,'-m','backend.v2.document_renderer'],input=json.dumps({'view':data,'template':VERSION},ensure_ascii=False).encode(),
        stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30,check=False)
    if proc.returncode or not proc.stdout.startswith(b'%PDF-') or len(proc.stdout)>10_000_000: raise ValueError('Document render failed')
    return proc.stdout

if __name__=='__main__':
    resource.setrlimit(resource.RLIMIT_AS,(512*1024*1024,512*1024*1024))
    resource.setrlimit(resource.RLIMIT_CPU,(20,20))
    resource.setrlimit(resource.RLIMIT_NOFILE,(32,32))
    data=json.loads(sys.stdin.buffer.read(500_001));sys.stdout.buffer.write(render(data['view'],data['template']))
