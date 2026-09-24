"""Compact read-only PDF specification for a saved 3D project."""
from io import BytesIO
from pathlib import Path
from html import escape
import hashlib
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4,landscape
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate,Paragraph,Table,TableStyle,KeepInFrame
from .document_renderer import FONTS

FOREST=colors.HexColor('#153d2d');INK=colors.HexColor('#20382c');MUTED=colors.HexColor('#68736b');RULE=colors.HexColor('#d9ddd2');MINT=colors.HexColor('#e8efe9')
PAGE=landscape(A4);WIDTH=PAGE[0]-16*mm;HEIGHT=PAGE[1]-18*mm
MODULES={'chest':'Комод','base_cabinet':'Кухня · нижний','wall_cabinet':'Кухня · верхний','tall_cabinet':'Пенал','wardrobe':'Шкаф','vanity':'Тумба'}

def render(name,scene,materials):
    root=Path(__file__).parent/'document_assets'
    for file,expected in FONTS.items():
        path=root/file
        if hashlib.sha256(path.read_bytes()).hexdigest()!=expected: raise ValueError('Font integrity')
        pdfmetrics.registerFont(TTFont('MF-Bold' if 'Bold' in file else 'MF',str(path)))
    styles={
      'title':ParagraphStyle('t',fontName='MF-Bold',fontSize=15,leading=17,textColor=FOREST),
      'head':ParagraphStyle('h',fontName='MF-Bold',fontSize=7,leading=8,textColor=FOREST),
      'body':ParagraphStyle('b',fontName='MF',fontSize=6.6,leading=7.8,textColor=INK),
      'small':ParagraphStyle('s',fontName='MF',fontSize=6,leading=7,textColor=MUTED)}
    p=lambda x,s='body':Paragraph(escape(str(x)),styles[s])
    room=scene.get('room') or {'width':4200,'depth':3200,'height':2700}
    items=scene.get('items') or [{'module_type':scene.get('module_type','chest'),'name':MODULES.get(scene.get('module_type','chest'),'Модуль'),
        'width':scene.get('width',1000),'height':scene.get('height',850),'depth':scene.get('depth',450),'x':0,'z':0,'rotation':0,
        'body_variant_id':scene.get('body_variant_id'),'front_variant_id':scene.get('front_variant_id')}]
    rows=[]
    for i,it in enumerate(items,1):
        body=materials.get(str(it.get('body_variant_id')),'Не выбран')
        front=materials.get(str(it.get('front_variant_id')),'Не выбран')
        rows.append([p(i),p(it.get('name') or MODULES.get(it.get('module_type'),'Модуль')),
            p(f"{it.get('width')} × {it.get('height')} × {it.get('depth')}"),p(f"X {it.get('x',0)} · Z {it.get('z',0)} · {it.get('rotation',0)}°"),
            p(body,'small'),p(front,'small')])
    story=[p('Martin Forest · 3D-проект','title'),p(name,'head'),
      p(f"Помещение: {room.get('width')} × {room.get('depth')} × {room.get('height')} мм · Модулей: {len(items)}",'body')]
    table=Table([[p(x,'head') for x in ['№','Модуль','Ш × В × Г, мм','Положение','Корпус','Фасад']]]+rows,
      colWidths=[WIDTH*.04,WIDTH*.17,WIDTH*.14,WIDTH*.16,WIDTH*.245,WIDTH*.245],repeatRows=1)
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),MINT),('LINEBELOW',(0,0),(-1,-1),.3,RULE),
      ('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),3),('RIGHTPADDING',(0,0),(-1,-1),3),
      ('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]))
    story.append(table);story.append(p('Предварительная 3D-спецификация. Производственная деталировка, кромка, склейка и стоимость подтверждаются в редакторе заказа.','small'))
    buf=BytesIO();doc=SimpleDocTemplate(buf,pagesize=PAGE,leftMargin=8*mm,rightMargin=8*mm,topMargin=8*mm,bottomMargin=8*mm)
    doc.build([KeepInFrame(WIDTH,HEIGHT,story,mode='shrink')])
    return buf.getvalue()
