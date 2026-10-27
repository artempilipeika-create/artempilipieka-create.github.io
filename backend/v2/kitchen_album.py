"""Four-page client presentation, version mf-kitchen-album-v1.

Only the saved project's public material names and module count enter the album.
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

VERSION = 'mf-kitchen-album-v1'
W, H = landscape(A4)
M = 36
INK = HexColor('#19382e')
MUTED = HexColor('#647168')
PAPER = HexColor('#f6f3ed')


def render(name, scene, materials, hero, detail=None, photo=True):
    fonts()
    if not hero or not scene.get('items'):
        raise ValueError('Добавьте мебель и вид кухни.')
    name = client_title(name)
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
    for i, (title, field) in enumerate(fields):
        relevant = [it for it in scene['items'] if not (
            field == 'front_variant_id' and open_tall_variant(it)) and not (
            field in ('plinthMaterialId', 'countertopMaterialId') and it.get('module_type') == 'wall_cabinet') and not (
            field == 'countertopMaterialId' and not it.get('countertopEnabled', True))]
        values = list(dict.fromkeys(material_name(materials, it.get(field)) for it in relevant))
        value = '\n'.join(values) if values else 'Не предусмотрено проектом'
        x = M + (i % 2)*(width+gap)
        top = H-126 - (i//2)*168
        c.setFillColor(white)
        c.roundRect(x, top-150, width, 150, 8, fill=1, stroke=0)
        text(title, x+20, top-16, width-40, 9, True, MUTED)
        height = text(value, x+20, top-45, width-40, 12)
        if height > 90:
            raise ValueError('Слишком много материалов для четырёх страниц. Разделите проект на помещения.')
    text('Название декора берём из проекта. Оттенок на экране зависит от освещения; окончательный выбор — по образцу материала.', M, 100, W-2*M, 10, color=MUTED)
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
