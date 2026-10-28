"""Client album with the approved cover and automatic material/list continuations.

Only the saved project's public materials, their samples and module count enter the album.
No procurement ledger, internal source IDs or invented quote is published.
"""
from io import BytesIO
from html import escape
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.utils import ImageReader
from .sales_album import fonts, client_title, material_name
from .three_d_open_tall import open_tall_variant
from .album_materials import sample
from .album_elevation import draw as draw_elevation
from .album_layout import schedule
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pathlib import Path
import hashlib
from PIL import Image, ImageStat

VERSION = 'mf-kitchen-album-v3-pagination'
W, H = landscape(A4)
M = 36
INK = HexColor('#19382e')
MUTED = HexColor('#647168')
PAPER = HexColor('#f6f3ed')


def material_pages(scene, materials, visuals):
    """Keep each sample with its complete name; overflow gets another card/page."""
    fields = [('КОРПУС', 'body_variant_id'), ('ФАСАДЫ', 'front_variant_id'),
              ('ЦОКОЛЬ', 'plinthMaterialId'), ('СТОЛЕШНИЦА', 'countertopMaterialId')]
    width=(W-2*M-24)/2
    available=H-126-118
    cards=[]
    for title,field in fields:
        relevant=[it for it in scene['items'] if not (
            field=='front_variant_id' and open_tall_variant(it)) and not (
            field in ('plinthMaterialId','countertopMaterialId') and it.get('module_type')=='wall_cabinet') and not (
            field=='countertopMaterialId' and not it.get('countertopEnabled',True))]
        ids=list(dict.fromkeys(str(it.get(field) or '') for it in relevant))
        swatch=72 if len(ids)==1 else 32
        label_width=width-40-swatch-14
        entries=[]
        for ident in ids:
            visual=sample(visuals.get(ident)) if ident in materials else sample()
            paragraph=Paragraph(escape(material_name(materials,ident)),ParagraphStyle(
                'material',fontName='Sales',fontSize=11,leading=14.5,textColor=INK))
            pending=[paragraph]
            while pending:
                part=pending.pop(0);_,name_height=part.wrap(label_width,H*100)
                if name_height+76>available:
                    # Very long catalogue names continue without truncation or tiny type.
                    pieces=part.split(label_width,available-76)
                    if len(pieces)<2:raise ValueError('Не удалось разместить название материала.')
                    pending=pieces+pending;continue
                entries.append((part,name_height,visual,max(swatch,name_height+16)))
        chunks=[];chunk=[];used=60
        for entry in entries:
            extra=entry[3]+(8 if chunk else 0)
            if chunk and used+extra>available:
                chunks.append(chunk);chunk=[];used=60;extra=entry[3]
            chunk.append(entry);used+=extra
        chunks.append(chunk)
        for n,chunk in enumerate(chunks):
            height=max(138,60+sum(e[3] for e in chunk)+max(0,len(chunk)-1)*8)
            cards.append((title+(' · ПРОДОЛЖЕНИЕ' if n else ''),chunk,swatch,height))
    pages=[];rows=[];used=0
    for start in range(0,len(cards),2):
        pair=cards[start:start+2];height=max(card[3] for card in pair)
        if rows and used+18+height>available:
            pages.append(rows);rows=[];used=0
        used+=height+(18 if rows else 0);rows.append((pair,height))
    if rows:pages.append(rows)
    return pages


def schedule_pages(items):
    """Balance two readable columns, then continue the complete list on another sheet."""
    column=(W-2*M-24)/2
    style=ParagraphStyle('schedule',fontName='Sales',fontSize=8.5,leading=11.5,textColor=INK)
    measured=[]
    for ids,label,dimensions in schedule(items):
        p=Paragraph(escape(ids+'. '+label)+'<br/>'+escape(dimensions+' мм'),style)
        _,height=p.wrap(column-16,H);measured.append((p,max(32,height+9)))
    def balance(rows):
        split=min(range(1,len(rows)+1),key=lambda k:max(sum(h for _,h in rows[:k]),sum(h for _,h in rows[k:])))
        return [rows[:split],rows[split:]]
    pages=[];rows=[]
    for row in measured:
        trial=balance(rows+[row])
        if rows and max(sum(h for _,h in col) for col in trial)>H-155-180:
            pages.append(balance(rows));rows=[]
        rows.append(row)
    if rows:pages.append(balance(rows))
    return pages


def render(name, scene, materials, hero, detail=None, photo=True, *, material_visuals=None, elevation_geometry=None):
    fonts()
    if not hero or not scene.get('items'):
        raise ValueError('Добавьте мебель и вид кухни.')
    name = client_title(name)
    material_visuals = material_visuals or {}
    material_sheets=material_pages(scene,materials,material_visuals)
    schedule_sheets=schedule_pages(scene['items'])
    schedule_start=3+len(material_sheets)
    page_count=2+len(material_sheets)+len(schedule_sheets)
    out = BytesIO()
    c = Canvas(out, pagesize=(W, H), pageCompression=1)
    c.setTitle('MARTIN FOREST | ' + name)
    c.setAuthor('MARTIN FOREST')

    def text(value, x, top, width, size=11, bold=False, color=INK):
        p = Paragraph(escape(str(value)).replace('\n', '<br/>'), ParagraphStyle(
            'album', fontName='SalesBold' if bold else 'Sales', fontSize=size,
            leading=size * 1.4, textColor=color))
        _, height = p.wrap(width, H)
        p.drawOn(c, x, top-height)
        return height

    def page(number, title):
        c.setFillColor(PAPER)
        c.rect(0, 0, W, H, fill=1, stroke=0)
        text('MARTIN FOREST', M, H-24, 240, 12, True)
        text('КУХНЯ ПО ВАШЕМУ ПРОЕКТУ', W-290, H-26, 254, 8, color=MUTED)
        title_height = text(title, M, H-66, W-2*M, 25, True)
        c.setStrokeColor(HexColor('#d7ddd5'))
        c.line(M, 40, W-M, 40)
        text(name[:100], M, 30, W-2*M-65, 8, color=MUTED)
        text(f'{number:02d} / {page_count:02d}', W-90, 30, 54, 8, color=MUTED)
        return H-66-title_height-18

    # Approved cover 2: original image to the page edges, brand above, order/title below.
    cover_font=Path(__file__).with_name('document_assets')/'DejaVuSerif.ttf'
    if hashlib.sha256(cover_font.read_bytes()).hexdigest()!='8f2c103bfa3fd5de71f1b92b18f21906b5a26871fb7e19a9a4c9af539c3cc7ab':
        raise ValueError('Font integrity failure')
    if 'SalesSerif' not in pdfmetrics.getRegisteredFontNames():pdfmetrics.registerFont(TTFont('SalesSerif',str(cover_font)))
    picture=ImageReader(BytesIO(hero));iw,ih=picture.getSize();factor=max(W/iw,H/ih)
    c.drawImage(picture,(W-iw*factor)/2,(H-ih*factor)/2,iw*factor,ih*factor)
    with Image.open(BytesIO(hero)) as im:
        # Select readable text colour without altering or recompressing the photo.
        grey=im.convert('L')
        top_luma=ImageStat.Stat(grey.crop((0,0,iw,max(1,int(ih*.08))))).mean[0]
        bottom_luma=ImageStat.Stat(grey.crop((0,int(ih*.80),iw,ih))).mean[0]
    top_ink=INK if top_luma>140 else white;bottom_ink=INK if bottom_luma>140 else white
    c.saveState()
    label='MARTIN FOREST';spacing=2.4;size=19
    brand_width=pdfmetrics.stringWidth(label,'SalesBold',size)+(len(label)-1)*spacing
    t=c.beginText((W-brand_width)/2,H-30);t.setFont('SalesBold',size);t.setCharSpace(spacing);t.setFillColor(top_ink);t.textLine(label);c.drawText(t)
    c.restoreState()
    order=str((scene.get('albumSettings') or {}).get('order_number') or '').strip()
    c.setFont('SalesBold',8.5);c.setFillColor(bottom_ink)
    c.drawString(32,91,'ЗАКАЗ № '+(order or 'не указан'))
    style=ParagraphStyle('cover-title',fontName='SalesSerif',fontSize=24,leading=28,textColor=bottom_ink)
    title=Paragraph(escape(name),style);_,th=title.wrap(W-64,90)
    if th>70:
        style.fontSize=18;style.leading=21;title=Paragraph(escape(name),style);_,th=title.wrap(W-64,90)
    if th>70:raise ValueError('Название слишком длинное для обложки. Сократите название проекта.')
    title.drawOn(c,32,79-th)
    c.showPage()

    c.setFillColor(white);c.rect(0,0,W,H,fill=1,stroke=0)
    text('MARTIN FOREST',32,H-20,240,12,True)
    text('ЗАКАЗ № '+(order or 'не указан'),W-250,H-22,218,8,True)
    text('Кухня. Вид спереди',32,H-50,W-64,22,True)
    reference=f'лист {schedule_start}' if len(schedule_sheets)==1 else f'листы {schedule_start}–{page_count}'
    text(f'Фасады условно сняты. Состав модулей — {reference}. Размеры в мм.',32,H-83,W-64,8,color=MUTED)
    draw_elevation(c,scene,32,H-103,W-64,69,elevation_geometry)
    c.setStrokeColor(HexColor('#d7ddd5'));c.line(32,48,W-32,48)
    text(name,32,36,W-115,8,color=MUTED);text(f'02 / {page_count:02d}',W-80,36,48,8,color=MUTED)
    c.showPage()

    gap = 24
    width = (W-2*M-gap)/2
    for sheet, rows in enumerate(material_sheets):
        page(3+sheet, 'Материалы и характер' if sheet == 0 else 'Материалы · продолжение')
        top = H-126
        for cards, card_height in rows:
            for col, (title, entries, swatch, _) in enumerate(cards):
                x = M + col*(width+gap)
                c.setFillColor(white)
                c.roundRect(x, top-card_height, width, card_height, 8, fill=1, stroke=0)
                text(title, x+20, top-16, width-40, 9, True, MUTED)
                cursor = top-44
                if not entries:
                    text('Не предусмотрено проектом', x+20, cursor, width-40, 11)
                for paragraph, name_height, visual, height in entries:
                    sy = cursor-(height-swatch)/2-swatch
                    c.setFillColor(HexColor(visual['color']) if visual['color'] else PAPER)
                    c.roundRect(x+20, sy, swatch, swatch, 3, fill=1, stroke=0)
                    if visual['image']:
                        c.drawImage(ImageReader(BytesIO(visual['image'])), x+20, sy, swatch, swatch,
                                    preserveAspectRatio=True, anchor='c', mask='auto')
                    elif not visual['color']:
                        c.setStrokeColor(HexColor('#c9d0c7'))
                        c.line(x+26, sy+6, x+swatch+14, sy+swatch-6)
                    c.setStrokeColor(HexColor('#d7ddd5'))
                    c.roundRect(x+20, sy, swatch, swatch, 3, fill=0, stroke=1)
                    tx = x+20+swatch+14
                    label_top = cursor-(height-name_height-16)/2
                    paragraph.drawOn(c, tx, label_top-name_height)
                    text(visual['label'], tx, label_top-name_height-4, width-40-swatch-14, 8, color=MUTED)
                    cursor -= height+8
            top -= card_height+18
        text('Декоры и образцы привязаны к выбранным материалам. Цвет и масштаб рисунка на экране условны; окончательный выбор - по физическому образцу.', M, 100, W-2*M, 10, color=MUTED)
        c.showPage()

    column=(W-2*M-24)/2
    for sheet, columns in enumerate(schedule_sheets):
        page(schedule_start+sheet, 'Ваша кухня. Ваш комплект.' if sheet == 0 else 'Комплект · продолжение')
        text('Состав кухни',M,H-125,W-2*M,15,True)
        schedule_height=max(sum(h for _,h in part) for part in columns)
        compact=schedule_height>H-155-250
        for col,part in enumerate(columns):
            cursor=H-155;px=M+col*(column+24)
            for p,height in part:
                c.setFillColor(white);c.roundRect(px,cursor-height,column,height-4,4,fill=1,stroke=0)
                _,ph=p.wrap(column-16,H);p.drawOn(c,px+8,cursor-6-ph);cursor-=height
        if sheet == len(schedule_sheets)-1:
            c.setFillColor(INK);c.roundRect(M,109 if compact else 140,W-2*M,58 if compact else 96,9,fill=1,stroke=0)
            text('СТОИМОСТЬ КОМПЛЕКТА',M+22,155 if compact else 218,W-2*M-44,8 if compact else 9,True,white)
            text('После расчёта',M+22,140 if compact else 196,W-2*M-44,18 if compact else 24,True,white)
            terms='Согласуйте размеры, материалы и комплектацию. Состав фурнитуры, обработку и комплектность подтверждаем перед заказом. Техника и декор на изображении не означают включение в поставку.'
            assembly='Для самостоятельной сборки. Доставка рассчитывается отдельно.'
            if compact:
                text(assembly+' '+terms,M,98,W-2*M,8.5,color=MUTED)
            else:
                text(assembly,M+22,158,W-2*M-44,9,color=white)
                text(terms,M,120,W-2*M,10,color=MUTED)
        else:
            text('Продолжение состава — на следующем листе.',M,120,W-2*M,10,color=MUTED)
        c.showPage()
    c.save()
    return out.getvalue()
