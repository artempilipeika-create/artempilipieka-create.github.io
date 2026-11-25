"""A compact photographic list of fittings in the project, in the client album style."""
from itertools import batched
from reportlab.lib.colors import HexColor, white
from reportlab.lib.utils import ImageReader

from .customer_hardware import measured
from .customer_hardware_pdf import ASSETS, fitting_photos, paragraph, pictures
from .estimate_photos import pdf_image

MARGIN = 36
GUTTER = 20
HEADER = 137
BOTTOM = 53
THUMB = 47
QTY_WIDTH = 76
INK = HexColor('#19382e')
MUTED = HexColor('#617066')
RULE = HexColor('#d7ddd5')


def sheets(rows, width, height):
    col = (width - 2*MARGIN - GUTTER) / 2
    name_width = col - THUMB - QTY_WIDTH - 14
    available = height - HEADER - BOTTOM
    pages, bands, used = [], [], 0
    for pair in batched(rows, 2):
        cells = []
        row_height = 34
        for row in pair:
            title = paragraph(row['name'], 9.8, True, INK)
            sub = ' · '.join(filter(None, (row['detail'], row['article'])))
            detail = paragraph(sub, 8, color=MUTED)
            qty = paragraph(measured(row['qty'], row['unit']), 10, color=INK)
            qty.style.alignment = 2
            th = title.wrap(name_width, height)[1]
            dh = detail.wrap(name_width, height)[1] if sub else 0
            qh = qty.wrap(QTY_WIDTH-7, height)[1]
            row_height = max(row_height, th+dh+12, qh+10)
            cells.append((row, title, th, detail, dh, qty, qh))
        if bands and used + row_height > available:
            pages.append(bands)
            bands, used = [], 0
        bands.append((cells, row_height))
        used += row_height
    return [*pages, bands]


def image_for(article, path, series):
    source = pdf_image(ASSETS, path)
    if source is None:
        source = pictures()[0].get(article)
        series = bool(fitting_photos().get(article, {}).get('seriesPhoto'))
    return (ImageReader(source), series) if source else (None, False)


def photo(c, row, x, y, width, height):
    images = [image_for(*spec) for spec in row['images']]
    images = [(reader, series) for reader, series in images if reader is not None]
    if not images:
        c.setFillColor(RULE)
        c.setFont('Sales', 10)
        c.drawCentredString(x+width/2, y+height/2-3, '—')
        return
    label = any(series for _, series in images)
    bottom = y + (8 if label else 0)
    slot = width / len(images)
    for i, (reader, _) in enumerate(images):
        c.drawImage(reader, x+i*slot, bottom, slot-1, y+height-bottom,
                    preserveAspectRatio=True, anchor='c', mask='auto')
    if label:
        c.setFillColor(MUTED)
        c.setFont('Sales', 6.5)
        c.drawCentredString(x+width/2, y+1, 'Фото серии')


def draw(c, bands, size, amount, first):
    width, height = size
    col = (width - 2*MARGIN - GUTTER) / 2
    if first:
        c.setFillColor(MUTED)
        c.setFont('Sales', 9)
        c.drawRightString(width-MARGIN, height-76, 'Стоимость фурнитуры')
        c.setFillColor(INK)
        c.setFont('Sales', 16)
        c.drawRightString(width-MARGIN, height-97, amount)
    if not bands:
        c.setFillColor(MUTED)
        c.setFont('Sales', 11)
        c.drawString(MARGIN, height-HEADER-12, 'Состав фурнитуры уточняется.')
        return
    for x in (MARGIN, MARGIN+col+GUTTER):
        c.setFillColor(MUTED)
        c.setFont('Sales', 8.5)
        c.drawString(x+THUMB+6, height-HEADER+8, 'Наименование')
        c.drawRightString(x+col-7, height-HEADER+8, 'Количество')
    y = height-HEADER
    extra = min(23, max(0, (y-BOTTOM-sum(h for _, h in bands))/len(bands)))
    for cells, base in bands:
        h = base + extra
        for i, (row, title, th, detail, dh, qty, qh) in enumerate(cells):
            x = MARGIN+i*(col+GUTTER)
            c.setFillColor(white)
            c.rect(x, y-h, col, h, stroke=0, fill=1)
            c.setStrokeColor(RULE)
            c.setLineWidth(.45)
            c.line(x, y, x+col, y)
            photo(c, row, x+2, y-h+4, THUMB-2, h-8)
            tx = x+THUMB+6
            top = y-(h-th-dh-(2 if dh else 0))/2
            title.drawOn(c, tx, top-th)
            if dh:
                detail.drawOn(c, tx, top-th-2-dh)
            qty.drawOn(c, x+col-QTY_WIDTH, y-(h+qh)/2)
        y -= h
