"""Production-oriented PDF specification for a saved 3D project."""
from io import BytesIO
from pathlib import Path
from html import escape
from collections import OrderedDict
import hashlib
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4,landscape
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate,Paragraph,Table,TableStyle,Spacer,PageBreak,KeepTogether
from .document_renderer import FONTS

FOREST=colors.HexColor('#153d2d');INK=colors.HexColor('#20382c');MUTED=colors.HexColor('#68736b');RULE=colors.HexColor('#d9ddd2');MINT=colors.HexColor('#e8efe9');PALE=colors.HexColor('#f7f9f5')
PAGE=landscape(A4);WIDTH=PAGE[0]-16*mm
MODULES={'chest':'Комод','base_cabinet':'Кухня · нижний','wall_cabinet':'Кухня · верхний','tall_cabinet':'Пенал','wardrobe':'Шкаф','vanity':'Тумба'}
D1={'bazis.0211e4f77fc4','bazis.784bf9af84f8'}
D2={'bazis.3079d0656398'}
DRAWERS={'bazis.39f282e08f0c':2,'bazis.5f5697e39e27':3}
WALL_D1={'bazis.858266606bc5','bazis.2175c60e84a6'}
WALL_D2={'bazis.877ba2f68d92'}
DRYER_D1={'bazis.b89bf9852860','bazis.60f79b573cd1'}
DRYER_D2={'bazis.1ac4fadd97b7'}

def _row(name,qty,unit='pcs',article=''):
    return {'name':name,'qty':qty,'unit':unit,'article':article}

LOWER_COMMON=[
    _row('База для пластиковой ножки с упором под саморез',2,'pcs','05.0360'),
    _row('Ножка пластиковая без базы, высота 100 мм',2,'pcs','05.0360'),
    _row('Клипса усиленная',2,'pcs','06.152'),
    _row('Опора регулируемая H100 мм, черная',2,'pcs','415 10 P2 0Z 02'),
    _row('Основание для кухонной опоры H5',2,'pcs','840 00 P2 H5 00'),
    _row('Площадка клипсы усиленной',2,'pcs','06.080'),
    _row('Конфермат 7x50 мм, Zn',12),
    _row('Гвозди 1,4x25 РМЗ',51,'pcs','16181'),
    _row('Саморез универсальный 5,0x30, желтый цинк AKS',4,'pcs','12867'),
]
UPPER_COMMON=[
    _row('Конфермат 7x50 мм, Zn',8),
    _row('Навес простой, белый',2),
    _row('Шуруп 3x30 мм, Zn',4),
    _row('Гвозди 1,4x25 РМЗ',52),
]

def drawer_slide_length(depth):
    d=int(depth or 0)
    if d==510:return 500
    if d>=1000:return 600
    if d>=600:return 550
    if d>=550:return 500
    if d>=500:return 450
    if d>=450:return 400
    if d>=400:return 350
    if d>=350:return 300
    if d>=300:return 250
    return None

def drawer_hardware(count,depth):
    guide=drawer_slide_length(depth)
    rows=[
      _row('Конфермат 7x50 мм, Zn',24),
      _row('Основание для кухонной опоры крепление H5 под саморезы',2),
      _row('Опора регулируемая H100 мм без основания, регулировка -5 +20 мм, черная',2),
      _row('1031 Ножка пластиковая без базы, высота 100 мм',2),
      _row('1031 База для пластиковой ножки с упором под саморез',2),
      _row('Площадка клипсы усиленной (06.152)',2),
      _row('Клипса усиленная',2),
      _row('Гвозди 1,4x25 РМЗ',51),
      _row('Саморез универсальный 5,0x30 желтый цинк AKS',10 if count==2 else 13),
      _row('Шурупы 3.5x16 д5',count*3),
    ]
    rows.append(_row(f'Направляющая шариковая L-{guide} h=45 PRIME by AKS SOFT CLOSE' if guide else 'Направляющая шариковая PRIME by AKS SOFT CLOSE - длина не определена',count,'set'))
    rows.append(_row('Шуруп 3.5x16 мм, Zn',count*18))
    return rows

def hardware_for(it):
    bid=it.get('bazis_id');h=int(it.get('height') or 0);w=int(it.get('width') or 0);rows=[]
    if bid in D1|D2:
        rows=[dict(x) for x in LOWER_COMMON]
        rows.insert(6,_row('Петля накладная с доводчиком 48мм h2 clip-on PRIME',2 if bid in D1 else 4,'pcs','112602'))
        return rows,None
    if bid in DRAWERS:
        return drawer_hardware(DRAWERS[bid],int(it.get('depth') or 0)),None
    if bid in WALL_D1|WALL_D2|DRYER_D1|DRYER_D2:
        rows=[dict(x) for x in UPPER_COMMON]
        rows.append(_row('Петля накладная с доводчиком 48мм h2 clip-on PRIME',2 if bid in WALL_D1|DRYER_D1 else 4))
        if bid in DRYER_D1|DRYER_D2:
            rows.append(_row(f'Сушка для посуды {w} MOUNT, белый AKS',1))
            if h>850: rows.append(_row('Полкодержатель, Marcopol, оцинкованный',4))
        else:
            rows.append(_row('Полкодержатель, Marcopol, оцинкованный',8 if h>850 else 4))
        return rows,None
    return [],None

def module_contents(it):
    bid=it.get('bazis_id');h=int(it.get('height') or 0);w=int(it.get('width') or 0)
    if bid in DRAWERS:
        return f"корпус; фасады ящиков; {DRAWERS[bid]} ящика; задняя стенка; днища ящиков; направляющие"
    if bid in DRYER_D1|DRYER_D2:
        return f"корпус; {'1 фасад' if bid in DRYER_D1 else '2 фасада'}; задняя стенка; сушка {w} мм"+("; верхняя полка" if h>850 else "")
    if bid in WALL_D1|WALL_D2:
        return f"корпус; {'1 фасад' if bid in WALL_D1 else '2 фасада'}; задняя стенка; {2 if h>850 else 1} полк."
    if bid in D1|D2:
        return f"корпус; {'1 фасад' if bid in D1 else '2 фасада'}; задняя стенка; полка; основание/ножки"
    return 'состав определяется выбранным модулем'

def render(name,scene,materials):
    root=Path(__file__).parent/'document_assets'
    for file,expected in FONTS.items():
        path=root/file
        if hashlib.sha256(path.read_bytes()).hexdigest()!=expected: raise ValueError('Font integrity')
        pdfmetrics.registerFont(TTFont('MF-Bold' if 'Bold' in file else 'MF',str(path)))
    styles={
      'title':ParagraphStyle('t',fontName='MF-Bold',fontSize=15,leading=17,textColor=FOREST,spaceAfter=1),
      'section':ParagraphStyle('sec',fontName='MF-Bold',fontSize=11,leading=13,textColor=FOREST,spaceBefore=2,spaceAfter=4),
      'module':ParagraphStyle('mod',fontName='MF-Bold',fontSize=8,leading=10,textColor=FOREST,spaceAfter=2),
      'head':ParagraphStyle('h',fontName='MF-Bold',fontSize=7,leading=8,textColor=FOREST),
      'body':ParagraphStyle('b',fontName='MF',fontSize=6.6,leading=7.8,textColor=INK),
      'small':ParagraphStyle('s',fontName='MF',fontSize=6,leading=7,textColor=MUTED)}
    p=lambda x,s='body':Paragraph(escape(str(x)),styles[s])
    room=scene.get('room') or {'width':4200,'depth':3200,'height':2700}
    items=scene.get('items') or [{'module_type':scene.get('module_type','chest'),'name':MODULES.get(scene.get('module_type','chest'),'Модуль'),
        'width':scene.get('width',1000),'height':scene.get('height',850),'depth':scene.get('depth',450),'x':0,'z':0,'rotation':0,
        'body_variant_id':scene.get('body_variant_id'),'front_variant_id':scene.get('front_variant_id')}]
    summary=[]
    for i,it in enumerate(items,1):
        body=materials.get(str(it.get('body_variant_id')),'Не выбран')
        front=materials.get(str(it.get('front_variant_id')),'Не выбран')
        summary.append([p(i),p(it.get('name') or MODULES.get(it.get('module_type'),'Модуль')),
            p(f"{it.get('width')} x {it.get('height')} x {it.get('depth')}"),p(f"X {it.get('x',0)} · Z {it.get('z',0)} · {it.get('rotation',0)}°"),
            p(body,'small'),p(front,'small')])
    story=[p('Martin Forest · 3D-проект','title'),p(name,'head'),
      p(f"Помещение: {room.get('width')} x {room.get('depth')} x {room.get('height')} мм · Модулей: {len(items)}",'body')]
    table=Table([[p(x,'head') for x in ['№','Модуль','Ш x В x Г, мм','Положение','Корпус','Фасад']]]+summary,
      colWidths=[WIDTH*.04,WIDTH*.17,WIDTH*.14,WIDTH*.16,WIDTH*.245,WIDTH*.245],repeatRows=1)
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),MINT),('LINEBELOW',(0,0),(-1,-1),.3,RULE),
      ('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),3),('RIGHTPADDING',(0,0),(-1,-1),3),
      ('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]))
    story.extend([table,Spacer(1,3*mm),p('Предварительная 3D-спецификация. Далее каждый модуль расположен на отдельном листе, затем идёт сводная закупка. Цены заполняются по фактическому прайсу.','small'),PageBreak()])
    aggregate=OrderedDict()
    for i,it in enumerate(items,1):
        if i>1: story.append(PageBreak())
        story.append(p('Комплектация по модулям','title'))
        title=f"{i}. {it.get('name') or MODULES.get(it.get('module_type'),'Модуль')} · {it.get('width')} x {it.get('height')} x {it.get('depth')} мм"
        body=materials.get(str(it.get('body_variant_id')),'Не выбран');front=materials.get(str(it.get('front_variant_id')),'Не выбран')
        hardware,note=hardware_for(it)
        rows=[[p(x,'head') for x in ['№','Наименование','Артикул / тип','Кол-во','Ед.','Цена BYN','Сумма BYN','Компл.']]]
        for n,r in enumerate(hardware,1):
            qty=r.get('qty');unit={'pcs':'шт.','set':'компл.'}.get(r.get('unit'),r.get('unit',''))
            rows.append([p(n),p(r['name']),p(r.get('article') or '', 'small'),p(qty if qty is not None else ''),p(unit),p(''),p(''),p('[ ]')])
            if isinstance(qty,(int,float)):
                k=(r['name'],r.get('article') or '',unit)
                if k not in aggregate: aggregate[k]=0
                aggregate[k]+=qty
        if not hardware:
            rows.append([p(''),p('Фурнитура для этого модуля не описана подтверждённой спецификацией.'),p(''),p(''),p(''),p(''),p(''),p('')])
        hwtable=Table(rows,colWidths=[WIDTH*.035,WIDTH*.35,WIDTH*.15,WIDTH*.075,WIDTH*.07,WIDTH*.10,WIDTH*.11,WIDTH*.07],repeatRows=1)
        hwtable.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),MINT),('BACKGROUND',(0,1),(-1,-1),PALE),
          ('GRID',(0,0),(-1,-1),.3,RULE),('VALIGN',(0,0),(-1,-1),'TOP'),
          ('LEFTPADDING',(0,0),(-1,-1),3),('RIGHTPADDING',(0,0),(-1,-1),3),('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]))
        block=[p(title,'module'),p('Состав: '+module_contents(it),'body'),p('Материалы: корпус - '+body+'; фасад - '+front,'small'),Spacer(1,1.5*mm),hwtable]
        if note:block.extend([Spacer(1,1*mm),p(note,'small')])
        block.append(Spacer(1,4*mm))
        story.append(KeepTogether(block))
    story.extend([PageBreak(),p('Сводная закупка фурнитуры','title'),p('Количество суммируется по модулям. Цена и сумма оставлены пустыми до подключения/ввода актуального прайса.','small')])
    rows=[[p(x,'head') for x in ['№','Наименование','Артикул / тип','Всего','Ед.','Цена BYN','Сумма BYN','Компл.']]]
    for n,((label,article,unit),qty) in enumerate(aggregate.items(),1):
        rows.append([p(n),p(label),p(article,'small'),p(qty),p(unit),p(''),p(''),p('[ ]')])
    if len(rows)==1: rows.append([p(''),p('Нет подтверждённых строк фурнитуры для суммирования.'),p(''),p(''),p(''),p(''),p(''),p('')])
    total=Table(rows,colWidths=[WIDTH*.035,WIDTH*.35,WIDTH*.15,WIDTH*.075,WIDTH*.07,WIDTH*.10,WIDTH*.11,WIDTH*.07],repeatRows=1)
    total.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),MINT),('GRID',(0,0),(-1,-1),.3,RULE),('VALIGN',(0,0),(-1,-1),'TOP'),
      ('LEFTPADDING',(0,0),(-1,-1),3),('RIGHTPADDING',(0,0),(-1,-1),3),('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]))
    story.append(total)
    story.extend([Spacer(1,3*mm),p('Производственная деталировка, кромка, склейка и окончательная стоимость подтверждаются в редакторе заказа. Фурнитура без подтверждённой спецификации не додумывается.','small')])
    buf=BytesIO();doc=SimpleDocTemplate(buf,pagesize=PAGE,leftMargin=8*mm,rightMargin=8*mm,topMargin=8*mm,bottomMargin=8*mm)
    doc.build(story)
    return buf.getvalue()
