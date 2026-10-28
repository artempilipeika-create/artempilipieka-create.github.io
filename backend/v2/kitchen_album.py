"""Four-page client album with the approved full-bleed cover and vector elevations.

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

VERSION = 'mf-kitchen-album-v2-cover-elevation'
W, H = landscape(A4)
M = 36
INK = HexColor('#19382e')
MUTED = HexColor('#647168')
PAPER = HexColor('#f6f3ed')


def render(name, scene, materials, hero, detail=None, photo=True, *, material_visuals=None, elevation_geometry=None):
    fonts()
    if not hero or not scene.get('items'):
        raise ValueError('Добавьте мебель и вид кухни.')
    name = client_title(name)
    out = BytesIO()
    c = Canvas(out, pagesize=(W, H), pageCompression=1)
    c.setTitle('MARTIN FOREST | ' + name)
    c.setAuthor('MARTIN FOREST')
    material_visuals = material_visuals or {}

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
        text(f'{number:02d} / 04', W-90, 30, 54, 8, color=MUTED)
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
    text('Фасады условно сняты. Номера модулей соответствуют составу на листе 4. Размеры в мм.',32,H-83,W-64,8,color=MUTED)
    draw_elevation(c,scene,32,H-103,W-64,69,elevation_geometry)
    c.setStrokeColor(HexColor('#d7ddd5'));c.line(32,48,W-32,48)
    text(name,32,36,W-115,8,color=MUTED);text('02 / 04',W-80,36,48,8,color=MUTED)
    c.showPage()

    page(3, 'Материалы и характер')
    fields = [('КОРПУС', 'body_variant_id'), ('ФАСАДЫ', 'front_variant_id'),
              ('ЦОКОЛЬ', 'plinthMaterialId'), ('СТОЛЕШНИЦА', 'countertopMaterialId')]
    gap = 24
    width = (W-2*M-gap)/2
    cards = []
    for title, field in fields:
        relevant = [it for it in scene['items'] if not (
            field == 'front_variant_id' and open_tall_variant(it)) and not (
            field in ('plinthMaterialId', 'countertopMaterialId') and it.get('module_type') == 'wall_cabinet') and not (
            field == 'countertopMaterialId' and not it.get('countertopEnabled', True))]
        ids = list(dict.fromkeys(str(it.get(field) or '') for it in relevant))
        entries = []
        swatch = 72 if len(ids) == 1 else 32
        label_width = width-40-swatch-14
        for ident in ids:
            value = material_name(materials, ident)
            visual = sample(material_visuals.get(ident)) if ident in materials else sample()
            paragraph = Paragraph(escape(value), ParagraphStyle(
                'material', fontName='Sales', fontSize=11, leading=14.5, textColor=INK))
            _, name_height = paragraph.wrap(label_width, H)
            # A real sample and its exact name stay together, even with mixed decors.
            height = max(swatch, name_height+16)
            entries.append((paragraph, name_height, visual, height))
        content_height = sum(entry[3] for entry in entries) + max(0, len(entries)-1)*8
        cards.append((title, entries, swatch, max(138, content_height+60)))
    row_heights = [max(card[3] for card in cards[n:n+2]) for n in (0, 2)]
    if sum(row_heights)+18 > H-126-118:
        raise ValueError('Слишком много материалов для четырёх страниц. Разделите проект на помещения.')
    for i, (title, entries, swatch, _) in enumerate(cards):
        x = M + (i % 2)*(width+gap)
        top = H-126 - (row_heights[0]+18 if i >= 2 else 0)
        card_height = row_heights[i//2]
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
    text('Декоры и образцы привязаны к выбранным материалам. Цвет и масштаб рисунка на экране условны; окончательный выбор - по физическому образцу.', M, 100, W-2*M, 10, color=MUTED)
    c.showPage()

    page(4, 'Ваша кухня. Ваш комплект.')
    text('Состав кухни',M,H-125,W-2*M,15,True)
    entries=schedule(scene['items']);column=(W-2*M-24)/2
    style=ParagraphStyle('schedule',fontName='Sales',fontSize=8.5,leading=11.5,textColor=INK)
    measured=[]
    for ids,label,dimensions in entries:
        p=Paragraph(escape(ids+'. '+label)+'<br/>'+escape(dimensions+' мм'),style)
        _,height=p.wrap(column-16,H);measured.append((p,max(32,height+9)))
    split=min(range(1,len(measured)+1),key=lambda k:max(sum(h for _,h in measured[:k]),sum(h for _,h in measured[k:])))
    columns=[measured[:split],measured[split:]]
    if max(sum(h for _,h in part) for part in columns)>H-155-250:
        raise ValueError('Список модулей не помещается на странице. Разделите проект на помещения.')
    for col,part in enumerate(columns):
        cursor=H-155;px=M+col*(column+24)
        for p,height in part:
            c.setFillColor(white);c.roundRect(px,cursor-height,column,height-4,4,fill=1,stroke=0)
            _,ph=p.wrap(column-16,H);p.drawOn(c,px+8,cursor-6-ph);cursor-=height
    c.setFillColor(INK);c.roundRect(M,140,W-2*M,96,9,fill=1,stroke=0)
    text('СТОИМОСТЬ КОМПЛЕКТА',M+22,218,W-2*M-44,9,True,white)
    text('После расчёта',M+22,196,W-2*M-44,24,True,white)
    text('Для самостоятельной сборки. Доставка рассчитывается отдельно.',M+22,158,W-2*M-44,9,color=white)
    text('Согласуйте размеры, материалы и комплектацию. Состав фурнитуры, обработку и комплектность подтверждаем перед заказом. Техника и декор на изображении не означают включение в поставку.',M,120,W-2*M,10,color=MUTED)
    c.showPage()
    c.save()
    return out.getvalue()
