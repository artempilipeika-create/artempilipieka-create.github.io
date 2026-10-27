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
from .three_d_cargo import cargo_variant, cargo_hardware, cargo_contents, cargo_adjustment
from .three_d_open_tall import open_tall_variant, open_tall_hardware, open_tall_contents, open_tall_adjustment, open_tall_metrics
from .three_d_pullout_dryers import dryer_variant, dryer_hardware, dryer_contents, refresh_dryer_source
from .three_d_tall import tall_variant,tall_shelf_count,tall_hardware,tall_drawer_note
from .three_d_accessories import dishwasher, dishwasher_hardware, dishwasher_contents, plinth_summary
from .three_d_gola import gola_variant, gola_contents, gola_hardware, gola_note
from .three_d_drawers import drawer_variant, drawer_contents, drawer_hardware as metal_drawer_hardware
from .three_d_upper import upper_variant, upper_contents, upper_hardware, upper_adjustment_note
from .three_d_vitrine import vitrine_variant,vitrine_hardware,vitrine_contents

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
    it=refresh_dryer_source(it)
    if open_tall_variant(it):return [_row(r['name'],r['quantity'],r['unit'],r.get('article') or '') for r in open_tall_hardware(it)],' '.join(filter(None,[open_tall_adjustment(it),open_tall_metrics(it)['lighting_note']])) or None
    if cargo_variant(it):return [_row(r['name'],r['quantity'],r['unit'],r.get('article') or '') for r in cargo_hardware(it)],cargo_adjustment(it)
    if dryer_variant(it):return [_row(r['name'],r['quantity'],r['unit'],r.get('article') or '') for r in dryer_hardware(it)],' '.join(dryer_variant(it)['warnings']) or None
    if dishwasher(it):return [_row(r['name'],r['quantity'],r['unit'],r.get('article') or '') for r in dishwasher_hardware(it)],None
    if gola_variant(it):return [_row(r['name'],r['quantity'],r['unit'],r.get('article') or '') for r in gola_hardware(it)],gola_note(it)
    upper=upper_variant(it)
    if upper and not upper['legacy']:
        return [_row(r['name'],r['quantity'],r['unit'],r.get('article') or '') for r in upper_hardware(it)],upper_adjustment_note(it)
    bid=it.get('bazis_id');h=int(it.get('height') or 0);w=int(it.get('width') or 0);rows=[]
    drawer=drawer_variant(it)
    if drawer:return [_row(r['name'],r['quantity'],r['unit'],r.get('article') or '') for r in metal_drawer_hardware(it)],('Опоры отличаются от исходных 100 мм; артикулы подобрать. В БАЗИС заменить опоры и выставить корпус на новую отметку без растяжения.' if (it.get('legHeightMm') or it.get('base_height') or 100)!=100 else None)
    if vitrine_variant(it):
        return [_row(r['name'],r['quantity'],r['unit'],r.get('article') or '') for r in vitrine_hardware(it)],None
    tall=tall_variant(it)
    if tall:
        return [_row(r['name'],r['quantity'],r['unit'],r.get('article','')) for r in tall_hardware(it)],tall_drawer_note(it)
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
    it=refresh_dryer_source(it)
    v=gola_variant(it) or dryer_variant(it) or cargo_variant(it);dish=dishwasher(it)
    gola_front=(v and v.get('execution')=='gola') or (dish and dish.get('variant')=='gola')
    alignment=' От лицевой поверхности закрытого фасада до переднего края столешницы 0,5 мм.' if gola_front else ''
    if open_tall_variant(it):return open_tall_contents(it)+alignment
    if cargo_variant(it):return cargo_contents(it)+alignment
    if dryer_variant(it):return dryer_contents(it)+alignment
    if dish:return dishwasher_contents(it)+alignment
    if gola_variant(it):return gola_contents(it)+alignment
    if upper_variant(it):return upper_contents(it)
    if drawer_variant(it):return drawer_contents(it)
    if vitrine_variant(it):return vitrine_contents(it)
    bid=it.get('bazis_id');h=int(it.get('height') or 0);w=int(it.get('width') or 0)
    tall=tall_variant(it)
    if tall:
        row=tall['row_height'];n=tall['doors_per_section'];fw=w/n-3
        opening={'left':'L, петли слева','right':'P, петли справа','double':'Д2, две створки в каждой секции'}[tall['opening']]
        if tall.get('execution')=='gola':
            fronts=[p for p in tall['panels'] if p['role']=='front']
            sizes=', '.join(f"{p['size'][1]+(h-tall['native_height'] if p['stretch']=='height' else 0):g} × {p['size'][0]+(w-600)/n:g}" for p in fronts)
            return (f"Gola L; база {row} мм, цоколь 100 мм; {opening}; "
                    +('полки' if tall['layout']=='storage' else ('ящик' if tall['drawer'] else 'дверь')+' + духовка'+(' + СВЧ' if tall['microwave'] else ''))
                    +(f"; ниша духовки 564 × 595 мм на отметке {tall['oven_bottom']:g} мм" if tall['family']=='appliance' else '')
                    +('; ниша СВЧ 564 × 380 мм' if tall['microwave'] else '')
                    +f"; фасады {sizes} мм; {tall_shelf_count(it)} съёмн. полк. сверху; профиль AKS 89731, отрезок {w} мм"
                    +('; '+tall_drawer_note(it) if tall_drawer_note(it) else ''))
        if tall.get('family')=='appliance':
            lower=next(p for p in tall['panels'] if p['key']=='front-lower')
            upper=next(p for p in tall['panels'] if p['key']=='door-upper')
            return (f"база нижнего ряда {row} мм, цоколь 100 мм; {opening}; "
                    +('шуфляда' if tall['drawer'] else 'дверь')+' + духовка'+(' + микроволновка' if tall['microwave'] else '')
                    +f"; ниша духовки 564 × 595 мм на отметке {tall['oven_bottom']:g} мм от пола"
                    +('; ниша СВЧ 564 × 380 мм' if tall['microwave'] else '')
                    +f"; фасады {lower['size'][1]:g} × 597 и {upper['size'][1]+h-tall['native_height']:g} × 597 мм; "
                    +f"{tall_shelf_count(it)} съёмн. полк. сверху; задние стенки 3 мм в пазу; за техникой открытый проём"
                    +('; '+tall_drawer_note(it) if tall_drawer_note(it) else ''))
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

def module_materials(it,body,front,materials=None):
    it=refresh_dryer_source(it)
    if dishwasher(it):
        profiles=dishwasher(it)['profiles']
        profile=profiles[0].get('documentation_profile',profiles[0]) if profiles else None
        return [('Фасад 18 мм',front if front and front!='Не выбран' else 'Evagloss P004')]+([('Профиль',profile['material_name'])] if profile else [])
    if open_tall_variant(it):return [('Корпус и полки 18 мм',body if body and body!='Не выбран' else 'ЛДСП- БЕЛЫЙ'),('Задняя стенка ЛДСП 18 мм',(materials or {}).get(str(it.get('back_variant_id')),body if body and body!='Не выбран' else 'ЛДСП- БЕЛЫЙ'))]
    cargo=cargo_variant(it)
    if cargo:
        return [('Корпус 18 мм',body if body and body!='Не выбран' else 'ЛДСП- БЕЛЫЙ'),('Фасад 18 мм',front if front and front!='Не выбран' else 'Evagloss P004'),('Задняя стенка 3 мм',(materials or {}).get(str(it.get('back_variant_id')),'ЛХДФ 3ММ Белый'))]+([('Профиль',cargo['profiles'][0]['material_name'])] if cargo['profiles'] else [])
    gola=gola_variant(it)
    if gola and not drawer_variant(it):
        materials=materials or {}
        rows=[('Корпус 18 мм',body or 'ЛДСП- БЕЛЫЙ'),('Фасады 18 мм',front or 'Evagloss P004'),('Профиль','Gola AKS, чёрный')]
        if gola['purpose']!='sink':rows.append(('ЛХДФ 3 мм',materials.get(str(it.get('back_variant_id')),'ЛХДФ 3ММ Белый')))
        if gola['system']=='ball':rows.append(('Стенки ящиков 18 мм',body or 'ЛДСП- БЕЛЫЙ'))
        return rows
    if upper_variant(it):
        materials=materials or {}
        return [('Корпус 18 мм',body if body and body!='Не выбран' else 'ЛДСП- БЕЛЫЙ'),
                ('Фасады 18 мм',front if front and front!='Не выбран' else 'Evagloss P004'),
                ('Задняя стенка 3 мм',materials.get(str(it.get('back_variant_id')),'ЛХДФ 3ММ Белый'))]
    if drawer_variant(it):
        materials=materials or {}
        ids={str(v) for k,v in it.get('part_materials',{}).items() if k.startswith('drawer-')}
        drawer_names='; '.join(sorted({materials.get(v,'Материал '+v) for v in ids})) if ids else 'Не выбран · требуется ЛДСП 16 мм; цвет в 3D — по корпусу'
        return [('Корпус 18 мм',body or 'ЛДСП- БЕЛЫЙ'),('Фасады 18 мм',front or 'Evagloss P004'),('Днища и задние стенки ящиков 16 мм',drawer_names),('Фурнитура','Белая'),('Задник корпуса 3 мм',materials.get(str(it.get('back_variant_id')),'ЛХДФ 3ММ Белый'))]
    if vitrine_variant(it):
        return [('Корпус и задняя стенка 18 мм',body if body and body!='Не выбран' else 'ЛДСП- БЕЛЫЙ'),('Фасад и полки','Стекло 4 мм'),('Рамка','Z1, чёрный'),('Уплотнитель','Уплотнитель Z1, совместимость уточнить у поставщика')]
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
        front='Без фасада' if open_tall_variant(it) else 'Стекло 4 мм / Z1 чёрный' if vitrine_variant(it) else materials.get(str(it.get('front_variant_id')),'Не выбран')
        position=f"X {it.get('x',0)} · Z {it.get('z',0)} · {it.get('rotation',0)}°"
        if it.get('module_type')=='wall_cabinet':
            bottom=it.get('elevation_mm')
            if bottom is None:bottom=max(0,room.get('height',2700)-it['height']-500)
            position+=f" · низ {bottom:g} мм · верх {bottom+it['height']:g} мм"
        summary.append([p(i),p(it.get('name') or MODULES.get(it.get('module_type'),'Модуль')),
            p(f"{it.get('width')} x {it.get('height')} x {it.get('depth')}"),p(position),
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
        body=materials.get(str(it.get('body_variant_id')),'Не выбран');front='Без фасада' if open_tall_variant(it) else 'Стекло 4 мм / Z1 чёрный' if vitrine_variant(it) else materials.get(str(it.get('front_variant_id')),'Не выбран')
        hardware,note=hardware_for(it)
        rows=[[p(x,'head') for x in ['№','Наименование','Артикул / тип','Кол-во','Ед.','Цена BYN','Сумма BYN','Компл.']]]
        for n,r in enumerate(hardware,1):
            qty=r.get('qty');unit={'pcs':'шт.','set':'компл.','m':'м'}.get(r.get('unit'),r.get('unit',''))
            rows.append([p(n),p(r['name']),p(r.get('article') or '', 'small'),p(qty if qty is not None else ''),p(unit),p(''),p(''),p('[ ]')])
            k=(r['name'],r.get('article') or '',unit)
            if k not in aggregate: aggregate[k]=0
            aggregate[k]=round(aggregate[k]+qty,6) if isinstance(qty,(int,float)) and aggregate[k] is not None else None
        if not hardware:
            rows.append([p(''),p('Фурнитура для этого модуля не описана подтверждённой спецификацией.'),p(''),p(''),p(''),p(''),p(''),p('')])
        hwtable=Table(rows,colWidths=[WIDTH*.035,WIDTH*.35,WIDTH*.15,WIDTH*.075,WIDTH*.07,WIDTH*.10,WIDTH*.11,WIDTH*.07],repeatRows=1)
        hwtable.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),MINT),('BACKGROUND',(0,1),(-1,-1),PALE),
          ('GRID',(0,0),(-1,-1),.3,RULE),('VALIGN',(0,0),(-1,-1),'TOP'),
          ('LEFTPADDING',(0,0),(-1,-1),3),('RIGHTPADDING',(0,0),(-1,-1),3),('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]))
        material_rows=[[p('Материал','head'),p('Значение','head')]]
        material_rows.extend([[p(kind),p(value)] for kind,value in module_materials(it,body,front,materials)])
        module_image=preview_image(module_previews.get(str(it.get('item_id'))),110*mm,38*mm)
        side_preview=bool(vitrine_variant(it) and module_image)
        material_table=Table(material_rows,colWidths=[WIDTH*(.20 if side_preview else .22),WIDTH*(.31 if side_preview else .72)])
        material_table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),MINT),('GRID',(0,0),(-1,-1),.3,RULE),
          ('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),3),('RIGHTPADDING',(0,0),(-1,-1),3),
          ('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]))
        countertop=''
        if it.get('module_type')=='base_cabinet':
            thickness=it.get('countertopThicknessMm') or it.get('worktop_thickness') or 38
            countertop=(' Столешница над модулем отключена.' if it.get('countertopEnabled') is False else
                f" Столешница {thickness} мм, глубина {it.get('countertopDepthMm') or 600} мм; "+
                ('еврозапил на угловых стыках' if it.get('countertopJoint')=='euro' else 'обычное соединение')+
                f". Высота со столешницей: {it['height']+thickness} мм.")
        block=[p(title,'module'),p('Состав: '+module_contents(it)+countertop,'body'),Spacer(1,1.5*mm),p('Фурнитура','section'),hwtable]
        if note:block.extend([Spacer(1,1*mm),p(note,'small')])
        if side_preview:
            footer=Table([[[p('Материалы','section'),material_table],[p('Вид модуля','section'),module_image]]],colWidths=[WIDTH*.54,WIDTH*.46])
            footer.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0)]))
            block.extend([Spacer(1,2*mm),footer])
        else:
            block.extend([Spacer(1,2*mm),p('Материалы','section'),material_table])
            if module_image:block.extend([Spacer(1,2*mm),p('Вид модуля','section'),module_image])
        block.append(Spacer(1,2*mm))
        story.append(KeepTogether(block))
    if scene.get('plinths'):
        story.extend([PageBreak(),p('Цоколи по рядам','title')])
        for i,entry in enumerate(scene['plinths'],1):
            material_id=entry.get('material_id') or next((it.get('plinthMaterialId') for it in items if it['item_id'] in entry['members']),None)
            story.extend([p(f'Цоколь ряда {i}','module'),p(plinth_summary(scene,entry),'body'),p('Материал: '+str('по модулям; см. экспорт БАЗИС' if entry.get('automatic') and not material_id else materials.get(str(material_id),'Evagloss P004 · из исходного FR3D')),'small'),Spacer(1,3*mm)])
    story.extend([PageBreak(),p('Сводная закупка фурнитуры','title'),p('Количество суммируется по модулям. Цена и сумма оставлены пустыми до подключения/ввода актуального прайса.','small')])
    rows=[[p(x,'head') for x in ['№','Наименование','Артикул / тип','Всего','Ед.','Цена BYN','Сумма BYN','Компл.']]]
    for n,((label,article,unit),qty) in enumerate(aggregate.items(),1):
        rows.append([p(n),p(label),p(article,'small'),p(qty if qty is not None else 'Уточнить'),p(unit),p(''),p(''),p('[ ]')])
    if len(rows)==1: rows.append([p(''),p('Нет подтверждённых строк фурнитуры для суммирования.'),p(''),p(''),p(''),p(''),p(''),p('')])
    total=Table(rows,colWidths=[WIDTH*.035,WIDTH*.35,WIDTH*.15,WIDTH*.075,WIDTH*.07,WIDTH*.10,WIDTH*.11,WIDTH*.07],repeatRows=1)
    total.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),MINT),('GRID',(0,0),(-1,-1),.3,RULE),('VALIGN',(0,0),(-1,-1),'TOP'),
      ('LEFTPADDING',(0,0),(-1,-1),3),('RIGHTPADDING',(0,0),(-1,-1),3),('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]))
    story.append(total)
    story.extend([Spacer(1,3*mm),p('Производственная деталировка, кромка, склейка и окончательная стоимость подтверждаются в редакторе заказа. Фурнитура без подтверждённой спецификации не додумывается.','small')])
    buf=BytesIO();doc=SimpleDocTemplate(buf,pagesize=PAGE,leftMargin=8*mm,rightMargin=8*mm,topMargin=8*mm,bottomMargin=8*mm)
    doc.build(story)
    return buf.getvalue()
