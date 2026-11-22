"""Printable customer hardware sheets, shared by the order, constructor and album."""
from functools import lru_cache
from html import escape
from io import BytesIO
import json
from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph
from .sales_album import fonts
from .wardrobe_lighting_kit import catalogue

W, H = landscape(A3)
M = 44
TOP = H - 205
BOTTOM = 130
INK = HexColor('#173b32')
TEXT = HexColor('#263631')
MUTED = HexColor('#50645b')
LINE = HexColor('#d5ded7')
PALE = HexColor('#edf2ef')
ASSETS = Path(__file__).with_name('cabinet_assets') / 'planner'
# Absolute column coordinates on the A3 master.
EDGES = [M, 150, 532, 657, 823, 993, 1065, W - M]


@lru_cache(maxsize=1)
def fitting_photos():
    products = json.loads((ASSETS / 'wardrobe-fittings.json').read_bytes())
    return {part.get('article') or part['sku']:part for p in products.values()
            for part in (p,*p.get('components',[])) if part.get('photo')}


@lru_cache(maxsize=1)
def pictures():
    from_catalogue = catalogue()['products']
    images = {}
    for folder in ('shelf-images', 'rod-photos', 'hardware-photos', 'light-kit-photos'):
        for file in (ASSETS / folder).glob('*.webp'):
            sku = {'12-0068':'12.0068', '15-0341':'15.0341'}.get(file.stem, file.stem)
            if sku not in ('cam', 'dowel', 'confirmat'):
                images[sku] = file
    doors = json.loads((ASSETS / 'door-photos' / 'sources.json').read_bytes())
    sources = {v['pictured_article']:v['source_url'] for v in doors.values()}
    images.update({v['pictured_article']:ASSETS / 'door-photos' / v['file'] for v in doors.values()})
    sources.update({sku:prod['url'] for sku,prod in from_catalogue.items()})
    push = json.loads((ASSETS / 'wardrobe-push-open.json').read_bytes())
    sources.update({sku:product['url'] for sku,product in push['products'].items()})
    aks_push = json.loads((ASSETS / 'wardrobe-aks-push.json').read_bytes())
    sources.update({sku:product['url'] for sku,product in aks_push.items()})
    hinges = json.loads((ASSETS / 'wardrobe-prime-hinges.json').read_bytes())
    sources.update({p['article']:p['url'] for p in hinges if p.get('url')})
    rods = json.loads((ASSETS / 'rod-photos' / 'sources.json').read_bytes())
    sources.update({sku:r['source'] for sku,r in rods.items() if r.get('source')})
    for article,part in fitting_photos().items():
        images[article]=ASSETS / 'wardrobe-fitting-photos' / (part['photo']+'.webp')
        sources[article]=part['photoSource']
    return images, sources


def paragraph(value, size=15, bold=False, color=TEXT):
    return Paragraph(escape(str(value)), ParagraphStyle('hardware', fontName='SalesBold' if bold else 'Sales',
                     fontSize=size, leading=size*1.23, textColor=color, splitLongWords=1))


def write(c, value, x, top, width, size=15, bold=False, color=TEXT):
    para = paragraph(value, size, bold, color)
    _, height = para.wrap(width, H)
    para.drawOn(c, x, top-height)
    return height


def cells(row):
    return [(row['name'],15,False), (row['article'] or '—',13,False), (row['installed'],15,True),
            (row['purchase'],14,False), (row.get('price','—'),13,False), (row.get('amount','—'),15,True)]


def table_rows(rows):
    for row in rows:
        sizes = [paragraph(value,size,bold).wrap(EDGES[i+1]-EDGES[i]-16,H)[1]
                 for i,(value,size,bold) in enumerate(cells(row),1)]
        yield row, max(61, max(sizes)+16)


def pages(report):
    fonts()
    result = []
    for n,module in enumerate(report['modules'],1):
        chunk, space = [], TOP-BOTTOM
        for row,height in table_rows(module['rows']):
            if chunk and height>space:
                result.append((n,module,chunk,False));chunk=[];space=TOP-BOTTOM
            chunk.append((row,height));space-=height
        result.append((n,module,chunk,True))
    return result


def draw(c, report, sheet, page_number, total, page_size=(W,H)):
    n,module,rows,last = sheet
    c.saveState()
    c.scale(page_size[0]/W,page_size[1]/H)
    c.setFillColor(white);c.rect(0,0,W,H,fill=1,stroke=0)
    write(c,'Martin Forest',M,H-24,300,17,True,INK)
    heading='Заказ № '+report['order'] if report.get('order') else 'Комплектация заказа'
    if 'light_total' in module:
        heading+='  ·  Цены в BYN'
    write(c,heading,W-345,H-27,301,13,False,MUTED)
    c.setStrokeColor(LINE);c.line(M,H-58,W-M,H-58)
    write(c,'Фурнитура по модулям',M,H-76,790,32,True,INK)
    module_text=f'Модуль {n:02d}  /  '+module['name']
    write(c,module_text,M,H-127,W-2*M,15,True,INK)
    c.setFillColor(PALE);c.roundRect(M,TOP,W-2*M,36,5,fill=1,stroke=0)
    for index,label in enumerate(('Фото','Комплектующая','Артикул','В модуле','К закупке','Цена','Сумма')):
        write(c,label,EDGES[index]+7,TOP+25,EDGES[index+1]-EDGES[index]-14,11.5,True,MUTED)
    y=TOP
    images,links=pictures()
    for row,height in rows:
        article=row['article']
        if path:=images.get(article):
            series=fitting_photos().get(article,{}).get('seriesPhoto')
            caption=10 if series else 0
            c.drawImage(ImageReader(str(path)),M+8,y-height+6+caption,EDGES[1]-M-20,height-12-caption,
                        preserveAspectRatio=True,anchor='c',mask='auto')
            if series:
                write(c,'Фото серии',M+8,y-height+12,EDGES[1]-M-16,9,False,MUTED)
        else:
            write(c,'Фото уточняется',M+8,y-height/2+8,EDGES[1]-M-16,10,False,MUTED)
        for i,(value,size,bold) in enumerate(cells(row),1):
            width=EDGES[i+1]-EDGES[i]-16
            p=paragraph(value,size,bold,INK if bold or i==2 else TEXT)
            _,h=p.wrap(width,H)
            p.drawOn(c,EDGES[i]+7,y-(height+h)/2)
        if article in links:
            c.linkURL(links[article],(EDGES[2]+3,y-height+3,EDGES[3]-5,y-3),relative=1,thickness=0)
        y-=height
        c.setStrokeColor(LINE);c.setLineWidth(.55);c.line(M,y,W-M,y)
    if not rows:
        write(c,'Комплектация этого модуля уточняется.',M+8,TOP-20,W-2*M-16,16,False,MUTED)
    if last and 'light_total' in module:
        # The hardware quote covers lighting only. Other module components may have no client price.
        c.setFillColor(PALE);c.roundRect(W-326,57,282,61,5,fill=1,stroke=0)
        write(c,'Подсветка' if module['complete'] else 'Подсветка · позиции с ценой',W-310,108,250,12,False,MUTED)
        write(c,module['light_total']+' BYN',W-310,87,250,21,True,INK)
        write(c,module['lighting'],M,114,W-2*M-320,13,True,INK)
        note='Держатели рассчитаны предварительно. ' if module.get('estimate_holders') else ''
        install = 'Врезка датчика и подключение рассчитываются отдельно.' if module.get('sensor') else 'Подключение рассчитывается отдельно.'
        write(c,note+install,M,86,W-2*M-320,12,False,MUTED)
    elif not last:
        write(c,'Комплектация модуля продолжается на следующем листе.',M,98,W-2*M,13,False,MUTED)
    c.setStrokeColor(LINE);c.line(M,44,W-M,44)
    write(c,report['name'],M,35,W-2*M-230,11,False,MUTED)
    c.setFillColor(MUTED);c.setFont('Sales',11);c.drawRightString(W-M,23,f'{page_number:02d} / {total:02d}')
    c.restoreState()
    c.showPage()


def render(report):
    sheets=pages(report)
    out=BytesIO()
    c=Canvas(out,pagesize=(W,H),pageCompression=1)
    c.setTitle('Комплектация заказа · '+report['name']);c.setAuthor('Martin Forest')
    for i,sheet in enumerate(sheets,1):
        if i==1 or sheet[0]!=sheets[i-2][0]:
            key='module-'+str(sheet[0])
            c.bookmarkPage(key);c.addOutlineEntry(sheet[1]['name'],key)
        draw(c,report,sheet,i,len(sheets))
    c.save()
    return out.getvalue()
