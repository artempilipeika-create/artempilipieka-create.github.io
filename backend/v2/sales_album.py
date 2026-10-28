"""Five-page client album. All quantities/materials come from the saved scene."""
from io import BytesIO
from html import escape
from pathlib import Path
import base64, binascii, hashlib, warnings, re
from PIL import Image, ImageOps
from reportlab.pdfgen.canvas import Canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph
from .document_renderer import FONTS
from .sales_hardware import ledger
from .three_d_open_tall import open_tall_variant

PAGE = landscape(A3); W,H = PAGE
INK=HexColor('#19382e'); MUTED=HexColor('#6c756e'); PAPER=HexColor('#f6f3ed'); LINE=HexColor('#d9dfd7'); ACCENT=HexColor('#a88959')
M=48; CW=W-M*2
UNITS={'pcs':'шт.','pair':'пар','set':'компл.','m':'м','m2':'м²','kg':'кг'}


def image_bytes(value):
    if not value: return None
    prefix, sep, payload=value.partition(',')
    if not sep or prefix not in ('data:image/png;base64','data:image/jpeg;base64','data:image/webp;base64'):
        raise ValueError('Нужна картинка PNG, JPEG или WebP')
    try:
        data=base64.b64decode(payload,validate=True)
        if len(data)>8_000_000: raise ValueError('Картинка должна быть меньше 8 МБ')
        with warnings.catch_warnings():
            warnings.simplefilter('error',Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as im:
                if im.width*im.height>16_000_000: raise ValueError('Картинка слишком большая: максимум 16 мегапикселей')
                im.load()
                # The paid JPEG is embedded directly in the PDF: no repeated lossy encode.
                if im.format == 'JPEG' and im.mode == 'RGB' and im.getexif().get(274, 1) == 1:
                    return data
                im=ImageOps.exif_transpose(im).convert('RGB')
                out=BytesIO(); im.save(out,'JPEG',quality=98,subsampling=0)
        return out.getvalue()
    except (binascii.Error,OSError,Image.DecompressionBombError,Image.DecompressionBombWarning) as exc:
        raise ValueError('Не удалось прочитать изображение') from exc


def fonts():
    for file,digest in FONTS.items():
        path=Path(__file__).with_name('document_assets')/file
        if hashlib.sha256(path.read_bytes()).hexdigest()!=digest: raise ValueError('Font integrity failure')
        name='SalesBold' if 'Bold' in file else 'Sales'
        if name not in pdfmetrics.getRegisteredFontNames(): pdfmetrics.registerFont(TTFont(name,str(path)))


def material_name(materials,ident):
    return materials.get(str(ident),'Материал требует выбора') if ident else 'Материал требует выбора'


def client_title(name):
    value = str(name or '').strip()
    if not value or re.match(r'^(qa|test|synthetic|debug)(?:[_\s-]|$)', value, re.I):
        return 'Кухня · индивидуальный проект'
    return value


def visualization_notes(scene, materials):
    notes = []
    bases = [it for it in scene.get('items', []) if it.get('module_type') == 'base_cabinet'
             and it.get('countertopEnabled', True)]
    if any(not it.get('countertopMaterialId') or str(it['countertopMaterialId']) not in materials for it in bases):
        notes.append('Столешница не согласована: материал и окончательный вид рабочей поверхности требуют выбора.')
    if not scene.get('wallLights'):
        notes.append('Подсветка на визуализации, если показана, является предложением и в комплектацию не включена.')
    notes.append('Декор и интерьерное окружение показаны для иллюстрации. Состав поставки определяется спецификацией.')
    return ' '.join(notes)


def render(name,scene,materials,hero,detail=None,module_images=None,photo=True,version=1):
    fonts()
    name = client_title(name)
    if not hero: raise ValueError('Добавьте визуализацию проекта')
    items=scene.get('items') or []
    hardware,notes=ledger(scene)
    module_images=module_images or {}
    out=BytesIO(); c=Canvas(out,pagesize=PAGE,pageCompression=1)
    c.setTitle('MARTIN FOREST | '+name); c.setAuthor('MARTIN FOREST')
    def text(value,x,y,size=12,color=INK,bold=False):
        c.setFillColor(color); c.setFont('SalesBold' if bold else 'Sales',size); c.drawString(x,y,str(value))
    def para(value,x,top,width,size=11,color=INK,bold=False):
        p=Paragraph(escape(str(value)).replace('\n','<br/>'),ParagraphStyle('s',fontName='SalesBold' if bold else 'Sales',fontSize=size,leading=size*1.38,textColor=color))
        _,h=p.wrap(width,10000); p.drawOn(c,x,top-h); return h
    def pic(data,x,y,w,h):
        if data:
            c.drawImage(ImageReader(BytesIO(data)),x,y,w,h,preserveAspectRatio=True,anchor='c',mask='auto')
    def page(number,title,sub=''):
        c.setFillColor(PAPER);c.rect(0,0,W,H,fill=1,stroke=0)
        text('MARTIN FOREST',M,H-43,16,bold=True)
        text('МЕБЕЛЬ ПО ВАШЕМУ ПРОЕКТУ',M+210,H-41,9,MUTED)
        c.setStrokeColor(LINE);c.line(M,H-59,W-M,H-59)
        text(title,M,H-108,30,bold=True)
        if sub:para(sub,M,H-126,CW,11,MUTED)
        c.setStrokeColor(LINE);c.line(M,41,W-M,41)
        para(name[:150],M,29,CW-130,8.5,MUTED)
        text(f'{number:02d} / 05',W-M-65,20,10,MUTED)
    def table(headers,rows,widths,top,bottom=75,thumbs=None):
        # Measure first: overflow must fail the export, never omit a row or shrink the text.
        heights=[]
        style=ParagraphStyle('cell',fontName='Sales',fontSize=10,leading=13,textColor=INK)
        parsed=[]
        for n,row in enumerate(rows):
            ps=[Paragraph(escape(str(v)).replace('\n','<br/>'),style) for v in row]
            hs=[p.wrap(w-20,2000)[1] for p,w in zip(ps,widths)]
            heights.append(max([30 if not thumbs else min(65,max(40,(top-35-bottom)/max(1,len(rows))))]+[h+12 for h in hs]));parsed.append(ps)
        if top-35-sum(heights)<bottom: raise ValueError('Этот проект не помещается на 5 читаемых листах. Разделите его на отдельные помещения.')
        c.setFillColor(INK);c.rect(M,top-35,CW,35,fill=1,stroke=0)
        x=M
        for h,w in zip(headers,widths):text(h,x+10,top-23,10,white,True);x+=w
        y=top-35
        for i,(ps,height) in enumerate(zip(parsed,heights)):
            c.setFillColor(white if i%2==0 else HexColor('#edf0e9'));c.rect(M,y-height,CW,height,fill=1,stroke=0)
            x=M
            for j,(p,w) in enumerate(zip(ps,widths)):
                if thumbs is not None and j==1 and thumbs[i]:pic(thumbs[i],x+5,y-height+4,w-10,height-8)
                else:
                    _,ph=p.wrap(w-20,2000);p.drawOn(c,x+10,y-(height-ph)/2-ph)
                x+=w
            y-=height
        return y
    page(1,'Ваш будущий интерьер','Индивидуальный проект / '+('фотореалистичная визуализация' if photo else 'вид из конструктора'))
    pic(hero,M,110,CW,H-285)
    text(f'{len(items):02d}',M,76,25,bold=True);text('шкафчиков в проекте',M+54,81,11,MUTED)
    text('Клиентский альбом',W-M-218,81,14,bold=True)
    c.showPage()

    page(2,'Материалы и настроение','Отделка и состав мебели привязаны к проекту. Освещение влияет на восприятие оттенков.')
    pic(detail or hero,M,185,CW*.64,440)
    x=M+CW*.69; w=CW*.31; y=H-192
    for title,field in [('КОРПУС','body_variant_id'),('ФАСАДЫ','front_variant_id'),('ЦОКОЛЬ','plinthMaterialId'),('СТОЛЕШНИЦА','countertopMaterialId')]:
        values=list(dict.fromkeys(material_name(materials,it.get(field)) for it in items if (field not in ('plinthMaterialId','countertopMaterialId') or it.get('module_type')!='wall_cabinet') and not (field=='front_variant_id' and open_tall_variant(it))))
        if not values:continue
        text(title,x,y,10,ACCENT,True);y-=17
        y-=para('\n'.join(values),x,y,w,12);y-=25
    if y<105:raise ValueError('Слишком много материалов для компактного альбома: разделите проект на помещения')
    para(visualization_notes(scene, materials) if photo else 'Размеры и состав шкафчиков приведены на следующем листе. Невыбранные материалы согласовываются отдельно.',M,150,CW*.64,10,MUTED)
    c.showPage()

    page(3,'Состав проекта','Размеры указаны в миллиметрах: ширина × высота × глубина. Количество каждого шкафа - 1 шт.')
    rows=[]; thumbs=[]
    for i,it in enumerate(items,1):
        rows.append([f'М{i}','',it.get('name') or it.get('module_type'),f"{it['width']} × {it['height']} × {it['depth']}",'Без фасада' if open_tall_variant(it) else material_name(materials,it.get('front_variant_id'))])
        thumbs.append(module_images.get(str(it.get('item_id'))))
    table(['№','Вид','Шкафчик','Ш × В × Г','Материал фасада'],rows,[45,100,320,190,CW-655],H-172,thumbs=thumbs)
    c.showPage()

    # Two sheets of the full ledger, including zeros and unresolved articles.
    split=(len(hardware)+1)//2
    for number,part in [(4,hardware[:split]),(5,hardware[split:])]:
        page(number,'Фурнитура / '+('01' if number==4 else '02'),'Количество по шкафчикам суммируется в итог. Комплект шариковых направляющих = пара; петли - штуками.')
        rows=[[r['name'],r['article'] or 'Уточнить','Уточнить' if r['qty'] is None else f"{r['qty']:g}",UNITS.get(r['unit'],r['unit']),'; '.join(r['modules']) or '0'] for r in part]
        note_text='; '.join(notes)
        note_height=0
        if number==5 and note_text:
            p=Paragraph(escape('Проверить перед закупкой: '+note_text),ParagraphStyle('note',fontName='Sales',fontSize=10,leading=14))
            note_height=p.wrap(CW,2000)[1]+20
        table(['Наименование','Артикул','Итого','Ед.','По шкафчикам'],rows,[CW*.43,CW*.14,62,60,CW*.43-122],H-172,bottom=95+note_height)
        if number==5:
            if note_text:para('Проверить перед закупкой: '+note_text,M,85+note_height,CW,10,MUTED)
            para('Позиции «Уточнить» требуют подбора артикула или уточнения количества. Цены, техника, декоративные аксессуары и монтажные расходники в расчёт не включены.',M,73,CW,9,MUTED)
        c.showPage()
    c.save();return out.getvalue()
