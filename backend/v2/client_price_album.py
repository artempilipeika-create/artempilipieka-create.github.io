"""Two-page customer album. The PDF and the on-screen preview share one price summary."""
from io import BytesIO

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

from .kitchen_album import draw_cover
from .sales_album import client_title, fonts
from .wardrobe_estimate import GROUPS
from .wardrobe_estimate_pdf import money


def summary(price):
    price = price or {}
    total = price.get('total')
    partial = total is not None and not price.get('complete')

    def amount(value):
        return money(value) + ' BYN' if value is not None else 'Уточняется'

    return {
        'label': 'Рассчитанная часть заказа' if partial else 'Стоимость заказа',
        'total_label': 'Итого по рассчитанным позициям' if partial else 'Итого',
        'amount': amount(total),
        'groups': {key: amount(price.get('groups', {}).get(title)) for key, title in GROUPS.items()},
        'note': f"Позиций без цены: {price['missing']}." if price.get('missing') else '',
        'date': '.'.join(reversed(price.get('date', '').split('-'))),
    }


def render(name, scene, hero, price):
    if not scene.get('items') or not hero:
        raise ValueError('Добавьте мебель и вид проекта.')
    fonts()
    w, h = landscape(A4)
    out = BytesIO()
    c = Canvas(out, pagesize=(w, h), pageCompression=1)
    name = client_title(name)
    c.setTitle('Martin Forest | ' + name)
    c.setAuthor('Martin Forest')
    ink, muted, line = (HexColor(value) for value in ('#19382e', '#53675f', '#d1dbd4'))

    def text(x, y, value, size, *, bold=False, color=ink, right=False, width=None):
        font = 'SalesBold' if bold else 'Sales'
        if width:
            size = min(size, size * width / max(1, stringWidth(value, font, size)))
        c.setFillColor(color)
        c.setFont(font, size)
        (c.drawRightString if right else c.drawString)(x, y, value)

    order = draw_cover(c, name, scene, hero, price=price)
    c.showPage()

    margin = 53
    text(margin, h-49, 'MARTIN FOREST', 12, bold=True)
    if order:
        text(w-margin, h-49, 'Заказ № ' + order, 11, right=True, color=muted, width=w*.55)
    c.setStrokeColor(line)
    c.line(margin, h-63, w-margin, h-63)
    text(margin, h-134, 'Стоимость заказа', 32, bold=True)
    if price['date']:
        text(w-margin, h-132, price['date'], 11, right=True, color=muted)
    y = h-207
    for key, title in GROUPS.items():
        text(margin, y, title, 18)
        text(w-margin, y, price['groups'][key], 18, right=True, width=w*.40)
        c.line(margin, y-20, w-margin, y-20)
        y -= 67
    c.setFillColor(ink)
    c.roundRect(margin, y-38, w-2*margin, 74, 4, stroke=0, fill=1)
    text(margin+19, y-8, price['total_label'], 17, bold=True, color=white, width=w*.43)
    text(w-margin-19, y-9, price['amount'], 24, bold=True, right=True, color=white, width=w*.36)
    if price['note']:
        text(margin, y-64, price['note'], 11, color=muted)
    c.showPage()
    c.save()
    return out.getvalue()
