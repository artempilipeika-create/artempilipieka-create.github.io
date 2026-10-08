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
from reportlab.lib.utils import ImageReader
from reportlab.platypus import SimpleDocTemplate,Paragraph,Table,TableStyle,Spacer,PageBreak,KeepTogether,Image as RLImage
from .document_renderer import FONTS
from .three_d_corner import corner_variant
from .three_d_tall import tall_variant,tall_shelf_count

FOREST=colors.HexColor('#153d2d');INK=colors.HexColor('#20382c');MUTED=colors.HexColor('#68736b');RULE=colors.HexColor('#d9ddd2');MINT=colors.HexColor('#e8efe9');PALE=colors.HexColor('#f7f9f5')
PAGE=landscape(A4);WIDTH=PAGE[0]-16*mm
MODULES={'chest':'Комод','base_cabinet':'Кухня · нижний','wall_cabinet':'Кухня · верхний','tall_cabinet':'Пенал','wardrobe':'Шкаф','vanity':'Тумба'}
D1={'bazis.0211e4f77fc4','bazis.784bf9af84f8'}
D2={'bazis.3079d0656398'}
SINK_D1={'bazis.facfa0cd038b','bazis.b226370aab54'}
SINK_D2={'bazis.5731630ddd87'}
OVEN={'bazis.9e77f4333545'}
CORNER={'bazis.b4420a0b4bbc'}
CORNER_SHA='e5145e6878304cde87b0344685ac309ed92302216394e01c6bb2fbdebb5b7b60'
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
    tall=tall_variant(it)
    if tall:
        return [_row(r['name'],tall_shelf_count(it)*4 if r['key']=='shelf-support-marcopol' else r['quantity'],r['unit'],r.get('article','')) for r in tall['hardware_items']],None
    corner=corner_variant(it)
    if corner:
        return [_row(r['name'],r['quantity'],r['unit'],r.get('article','')) for r in corner['hardware_items']],None
    if bid in CORNER and it.get('bazis_sha256')==CORNER_SHA:
        return [_row('Уголок №1 (литой)',6),_row('Шуруп 3.5х16 мм,Zn',12),_row('Конфермат 7х50 мм,Zn',10),
                _row('Основание для кухонной опоры крепление Н5 под саморезы',3),
                _row('Опора регулируемая Н100 мм без основания регулировка -5 +20 мм - черная',3),
                _row('1031 Ножка пластиковая без базы, высота 100 мм',3),
                _row('1031 База для пластиковой ножки с упором под саморез',3),
                _row('Площадка клипсы усиленной (06.152)',3),_row('Клипса усиленная',3),
                _row('Стяжка-евровинт с потайной головкой под шестигранник, оцинкованный, Marcopol',5),
                _row('Шуруп 4х16',4),_row('Петля гидравлическая HCKT под фальшпанель с эксцентриком, Clip-On H=0',2)],None
    if bid in SINK_D1|SINK_D2:
        rows=[_row('1031 База для пластиковой ножки с упором под саморез',2),
              _row('1031 Ножка пластиковая без базы, высота 100 мм',2),_row('Клипса усиленная',2),
              _row('Конфермат 7х50 мм,Zn',10),
              _row('Опора регулируемая Н100 мм без основания регулировка -5 +20 мм - черная',2),
              _row('Основание для кухонной опоры крепление Н5 под саморезы',2),
              _row('Петля накладная с доводчиком 48мм h2 clip-on PRIME (саморезы, заглушки) (упак.-2шт.)',2 if bid in SINK_D1 else 4),
              _row('Площадка клипсы усиленной (06.152)',2),_row('Уголок №1 (литой)',4),_row('Шуруп 3.5х16 мм,Zn',8)]
        return rows,None
    if bid in OVEN:
        return [_row('Основание для кухонной опоры крепление Н5 под саморезы',4),
                _row('Опора регулируемая Н100 мм без основания регулировка -5 +20 мм - черная',4),
                _row('Крепление клипсы к цоколю из ДСП',2),_row('Клипса к пластиковой ножке (универсальная, без крепления)',2),
                _row('Конфермат 7х50 мм,Zn',12),_row('Саморез универсальный 5,0*30 желтый цинк (уп/0,5тыс.шт) AKS',2),
                _row('Шурупы 3.5х16 д5',2),_row('Направляющая шариковая h=45 L-500 AKS PLUS',1),
                _row('Шуруп 3.5х16 мм,Zn',16)],None
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
    tall=tall_variant(it)
    if tall:
        row=tall['row_height'];n=tall['doors_per_section'];fw=w/n-3
        opening={'left':'L, петли слева','right':'P, петли справа','double':'Д2, две створки в каждой секции'}[tall['opening']]
        return (f'база нижнего ряда {row} мм = корпус {row-100} + цоколь 100 мм, без столешницы; '
                f'{opening}; {n*2} фасадов: нижние {row-103:g} × {fw:g} мм, верхние {h-row-1.5:g} × {fw:g} мм; '
                f'горизонтальный зазор 1,5 мм; нижняя полка на конфирматах; {tall_shelf_count(it)} съёмн. полк. сверху; задняя стенка 3 мм')
    corner=corner_variant(it)
    if corner:
        n=corner['door_count'];door_width=(w-631-3*(n-1))/n
        side='левый' if corner['side']=='left' else 'правый'
        fill='три вертикальные царги, нижняя сзади над дном' if corner['purpose']=='sink' else 'полка; задняя стенка 3 мм; две горизонтальные царги'
        return f'{side} угол; установочная ширина {w} мм = корпус {w-50} мм + отступ 50 мм; фальшпанель 120 мм (фасад) + 458 мм (корпус); {n} дверц. шириной {door_width:g} мм; бленда 50 мм; {fill}; шесть ножек'
    if bid in CORNER and it.get('bazis_sha256')==CORNER_SHA:
        return f'установочная ширина {w} мм = корпус {w-50} мм + отступ 50 мм; фальшпанель 578 мм; дверца {w-631} мм; три бленды 50 мм; три вертикальные царги; шесть ножек'
    if bid in SINK_D1|SINK_D2:
        return 'корпус; '+('1 фасад' if bid in SINK_D1 else '2 фасада')+'; 3 вертикальные царги (2 сверху, 1 сзади над дном); ножки'
    if bid in OVEN:
        return 'корпус шириной 600 мм; верхняя ниша 595 мм; перегородка; нижняя шуфляда; направляющие; ножки'
    if bid in DRAWERS:
        return f"корпус; фасады ящиков; {DRAWERS[bid]} ящика; задняя стенка; днища ящиков; направляющие"
    if bid in DRYER_D1|DRYER_D2:
        return f"корпус; {'1 фасад' if bid in DRYER_D1 else '2 фасада'}; задняя стенка; сушка {w} мм"+("; верхняя полка" if h>850 else "")
    if bid in WALL_D1|WALL_D2:
        return f"корпус; {'1 фасад' if bid in WALL_D1 else '2 фасада'}; задняя стенка; {2 if h>850 else 1} полк."
    if bid in D1|D2:
        return f"корпус; {'1 фасад' if bid in D1 else '2 фасада'}; задняя стенка; полка; основание/ножки"
    return 'состав определяется выбранным модулем'

def module_materials(it,body,front):
    bid=it.get('bazis_id');corner=corner_variant(it);tall=tall_variant(it);known=bool(corner or tall) or bid in set(DRAWERS)|WALL_D1|WALL_D2|DRYER_D1|DRYER_D2|SINK_D1|SINK_D2|OVEN or (bid in CORNER and it.get('bazis_sha256')==CORNER_SHA)
    if known and (not body or body=='Не выбран'):body='ЛДСП- БЕЛЫЙ'
    if known and (not front or front=='Не выбран'):front='Evagloss P004'
    rows=[('Корпус',body or 'Не выбран'),('Фасад',front or 'Не выбран')]
    if tall or (corner and corner['purpose']=='shelf') or bid in D1|D2|set(DRAWERS)|WALL_D1|WALL_D2|DRYER_D1|DRYER_D2:rows.append(('Задняя стенка','ЛХДФ 3ММ Белый'))
    if bid in set(DRAWERS)|OVEN:
        rows.extend([('Короба ящиков','ЛДСП- БЕЛЫЙ'),('Днища ящиков','ЛХДФ 3ММ Белый')])
    return rows

def preview_image(raw,max_w=WIDTH,max_h=92*mm):
    if not raw:return None
    reader=ImageReader(BytesIO(raw));w,h=reader.getSize()
    scale=min(max_w/w,max_h/h)
    image=RLImage(BytesIO(raw),width=w*scale,height=h*scale)
    image.hAlign='CENTER'
    return image

def render(name,scene,materials,preview_png=None,module_previews=None):
    module_previews=module_previews or {}
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
    hero=preview_image(preview_png)
    if hero:story.extend([Spacer(1,2*mm),hero,Spacer(1,2*mm)])
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
        material_rows=[[p('Материал','head'),p('Значение','head')]]
        material_rows.extend([[p(kind),p(value)] for kind,value in module_materials(it,body,front)])
        material_table=Table(material_rows,colWidths=[WIDTH*.22,WIDTH*.72])
        material_table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),MINT),('GRID',(0,0),(-1,-1),.3,RULE),
          ('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),3),('RIGHTPADDING',(0,0),(-1,-1),3),
          ('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]))
        block=[p(title,'module'),p('Состав: '+module_contents(it),'body'),Spacer(1,1.5*mm),p('Фурнитура','section'),hwtable]
        if note:block.extend([Spacer(1,1*mm),p(note,'small')])
        block.extend([Spacer(1,2*mm),p('Материалы','section'),material_table])
        module_image=preview_image(module_previews.get(str(it.get('item_id'))),110*mm,38*mm)
        if module_image:block.extend([Spacer(1,2*mm),p('Вид модуля','section'),module_image])
        block.append(Spacer(1,2*mm))
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
