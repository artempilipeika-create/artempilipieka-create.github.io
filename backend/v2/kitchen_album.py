"""Four-page client presentation, version mf-kitchen-album-v1.

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

VERSION = 'mf-kitchen-album-v1'
W, H = landscape(A4)
M = 36
INK = HexColor('#19382e')
MUTED = HexColor('#647168')
PAPER = HexColor('#f6f3ed')


def render(name, scene, materials, hero, detail=None, photo=True, *, material_visuals=None):
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

    def picture(data, x, y, width, height):
        c.setFillColor(white)
        c.rect(x, y, width, height, fill=1, stroke=0)
        c.drawImage(ImageReader(BytesIO(data)), x, y, width, height,
                    preserveAspectRatio=True, anchor='c', mask='auto')

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

    top = page(1, name[:70])
    picture(hero, M, 108, W-2*M, top-108)
    text('Ваш будущий интерьер', M, 94, 470, 17, True)
    text('Визуализация проекта' if photo else 'Вид из конструктора', W-270, 91, 234, 10, color=MUTED)
    c.showPage()

    page(2, 'Продумано для вашей кухни')
    picture(detail or hero, M, 139, W-2*M, H-260)
    text('Второй ракурс из конструктора' if detail else 'Общий вид проекта', M, 123, W-2*M, 14, True)
    text('Расположение и состав мебели — по сохранённому проекту. Фоторендер помогает представить интерьер; перед заказом сверяем его с конструкцией.', M, 96, W-2*M, 10, color=MUTED)
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
    text('Для самостоятельной сборки', M, H-132, W-2*M, 20, True)
    text(f"В проекте: {len(scene['items'])} модулей. Комплект деталей по согласованной спецификации. Состав фурнитуры, обработку и комплектность подтверждаем перед заказом.", M, H-176, 440, 12)
    c.setFillColor(INK)
    c.roundRect(M, 156, W-2*M, 140, 9, fill=1, stroke=0)
    text('СТОИМОСТЬ КОМПЛЕКТА', M+24, 276, W-2*M-48, 9, True, white)
    text('После расчёта', M+24, 248, W-2*M-48, 26, True, white)
    text('Доставка рассчитывается отдельно. Сборка и установка не включены.', M+24, 198, W-2*M-48, 11, color=white)
    text('Следующий шаг', M, 135, 220, 13, True)
    text('Согласовать размеры, материалы и комплектацию. Затем получить расчёт и подтвердить заказ. Техника и декор на изображении не означают включение в поставку.', M+210, 135, W-2*M-210, 10, color=MUTED)
    c.showPage()
    c.save()
    return out.getvalue()
