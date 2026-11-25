"""Short client estimate. Only the selling amounts enter the printed pages."""
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

from .album_wardrobe import profile
from .sales_album import fonts
from .estimate_photos import pdf_image

W, H = landscape(A3)
M = 56
INK, GREEN, GRAY, PAPER, BORDER, WHITE = '#142e25', '#176148', '#556b5f', '#f4f4ed', '#d6dfd7', '#ffffff'
ASSETS = Path(__file__).with_name('cabinet_assets') / 'planner'


def money(value, digits=2):
    if value is None:
        return 'Уточняется'
    return f'{value:,.{digits}f}'.replace(',', ' ').replace('.', ',')


def number(value, places=3):
    return '—' if value is None else f'{value:.{places}f}'.rstrip('0').rstrip('.').replace('.', ',')


def render(name, scene, quote, hero=None):
    fonts()
    stream = BytesIO()
    c = Canvas(stream, pagesize=(W,H), pageCompression=1)
    c.setTitle('Смета · '+name)
    c.setAuthor('Martin Forest')
    date = '.'.join(reversed(quote['date'].split('-')))
    groups = quote['groups']
    columns = W-2*M
    limit = 11
    page_counts = {k:1 for k in groups}
    # Allocate the five additional sheets first to the sections with longest remaining lists.
    for _ in range(5):
        key = max(groups,key=lambda k:len(groups[k]['rows'])-page_counts[k]*limit)
        if len(groups[key]['rows'])<=page_counts[key]*limit:
            break
        page_counts[key] += 1
    pages = 2+sum(page_counts.values())
    page_no = 0

    def text(x,y,value,size=14,color=INK,bold=False,right=False):
        c.setFillColor(HexColor(color))
        c.setFont('SalesBold' if bold else 'Sales',size)
        (c.drawRightString if right else c.drawString)(x,y,str(value))

    def rect(x,y,w,h,color):
        c.setFillColor(HexColor(color)); c.rect(x,y,w,h,fill=1,stroke=0)

    def words(value, maximum, size, bold=False, lines=2):
        font = 'SalesBold' if bold else 'Sales'
        parts = str(value).split()
        result, current = [], ''
        for word in parts:
            new = (current+' '+word).strip()
            if current and stringWidth(new,font,size)>maximum:
                result.append(current)
                current = word
            else:
                current = new
        if current:
            result.append(current)
        shown = result[:lines]
        if shown and (len(result)>lines or stringWidth(shown[-1],font,size)>maximum):
            end = shown[-1]
            while end and stringWidth(end+'…',font,size)>maximum:
                end = end[:-1]
            shown[-1] = end+'…'
        return shown

    def photo(path,x,y,w,h):
        c.drawImage(ImageReader(path),x,y,w,h,preserveAspectRatio=True,anchor='c',mask='auto')

    def start(section):
        nonlocal page_no
        page_no += 1
        rect(0,0,W,H,WHITE)
        text(M,H-47,'MARTIN FOREST',17,GREEN,True)
        text(W-M,H-47,date+'  /  '+section,12,GRAY,right=True)
        rect(M,H-65,columns,1,BORDER)
        rect(M,49,columns,1,BORDER)
        text(M,28,'Смета  /  '+words(name,650,11,lines=1)[0],11,GRAY)
        text(W-M,28,f'{page_no:02d}  /  {pages:02d}',11,GRAY,right=True)

    def line_art(x,y,w,h):
        blocks,_ = profile(scene['items'])
        blocks.sort(key=lambda p:p[1]+p[4])
        polygons = []
        for bx,bz,by,bw,bd,bh,axis in blocks:
            def point(i,j,k):
                return (bx+i*bw+.40*(bz+j*bd), by+k*bh-.23*(bz+j*bd))
            for pts,shade in [([(0,1,0),(1,1,0),(1,1,1),(0,1,1)],'#e6e3d6' if axis!='front' else '#d4dbce'),
                              ([(1,1,0),(1,0,0),(1,0,1),(1,1,1)],'#b1bbab'),
                              ([(0,0,1),(1,0,1),(1,1,1),(0,1,1)],'#eff0e7')]:
                polygons.append(([point(*p) for p in pts],shade))
        xx = [p[0] for pts,_ in polygons for p in pts]; yy = [p[1] for pts,_ in polygons for p in pts]
        scale = min(w/max(1,max(xx)-min(xx)),h/max(1,max(yy)-min(yy)))
        ox=x+(w-(max(xx)-min(xx))*scale)/2-min(xx)*scale
        oy=y+(h-(max(yy)-min(yy))*scale)/2-min(yy)*scale
        c.setStrokeColor(HexColor('#748578')); c.setLineWidth(.65)
        for pts,shade in polygons:
            pts=[(ox+px*scale,oy+py*scale) for px,py in pts]
            path=c.beginPath(); path.moveTo(*pts[0])
            for p in pts[1:]:
                path.lineTo(*p)
            path.close(); c.setFillColor(HexColor(shade)); c.drawPath(path,fill=1,stroke=1)

    start('Стоимость проекта')
    for i,title in enumerate(words(name,columns,37,True,2)):
        text(M,H-122-44*i,title,37,bold=True)
    top, bottom = H-218, 181
    visual_w = columns*.58
    rect(M,bottom,visual_w,top-bottom,PAPER)
    if hero:
        photo(BytesIO(hero),M,bottom,visual_w,top-bottom)
    elif scene.get('items'):
        line_art(M+36,bottom+25,visual_w-72,top-bottom-50)
    x=M+visual_w+34
    text(x,top-48,'СТОИМОСТЬ ПРОЕКТА' if quote['complete'] else 'РАССЧИТАНО ПО ЧАСТИ ПОЗИЦИЙ',14,GREEN,True)
    amount=money(quote['total'])+' BYN'
    size=42
    while stringWidth(amount,'SalesBold',size)>W-M-x and size>20:
        size-=1
    text(x,top-116,amount,size,bold=True)
    y=top-192
    for group in groups.values():
        text(x,y,group['title'],16)
        text(W-M,y,money(group['total']),18,bold=True,right=True)
        rect(x,y-17,W-M-x,1,BORDER); y-=58
    if quote['missing']:
        text(x,bottom+4,'Требуют уточнения: '+str(quote['missing'])+' поз.',13,GRAY)
    c.showPage()

    start('Комплектация')
    text(M,H-130,'Фурнитура проекта',34,bold=True)
    chosen=[]
    for row in groups['hardware']['rows']:
        path=pdf_image(ASSETS,row.get('photo'))
        if path is not None:
            chosen.append((row,path))
    chosen.sort(key=lambda r:(any(w in r[0]['name'].lower() for w in ('саморез','шкант','конфирмат','шуруп')), -(r[0]['amount'] or 0)))
    card_w=(columns-36)/3; card_h=253
    for i,(row,path) in enumerate(chosen[:6]):
        x=M+(i%3)*(card_w+18); y=H-424-(i//3)*(card_h+18)
        rect(x,y,card_w,card_h,PAPER)
        photo(path,x+20,y+98,card_w-40,145)
        for j,t in enumerate(words(row['name'],card_w-26,12,True,2)):
            text(x+13,y+76-16*j,t,12,bold=True)
        text(x+13,y+37,'Арт. '+str(row['article'] or '—')+(' · фото серии' if row.get('photoSeries') else ''),10,GRAY)
        if row['qty'] is not None and row['unitPrice'] is not None:
            text(x+13,y+15,number(row['qty'])+' '+row['unit']+' × '+number(row['unitPrice'],5)+' BYN',10,GRAY)
        text(x+card_w-13,y+13,money(row['amount'])+(' BYN' if row['amount'] is not None else ''),14,GREEN,True,True)
    if not chosen:
        text(M,H-204,'Для выбранной комплектации нет фотографий.',16,GRAY)
    c.showPage()

    for key,group in groups.items():
        all_rows=group['rows']
        count=page_counts[key]
        for idx in range(count):
            start(group['title'])
            text(M,H-131,group['title'],34,bold=True)
            text(W-M,H-128,money(group['total'])+' BYN',27,GREEN,True,True)
            if group['missing']:
                text(W-M,H-154,'Сумма известных позиций · уточнить '+str(group['missing']),12,GRAY,right=True)
            labels=[(M+13,'Наименование / артикул'),(W*.64,'Количество'),(W*.79,'Цена, BYN'),(W-M-10,'Сумма, BYN')]
            rect(M,H-210,columns,34,INK)
            for j,(tx,label) in enumerate(labels):
                text(tx,H-198,label,12,WHITE,True,j>0)
            rows=all_rows[idx*limit:(idx+1)*limit]
            if idx==count-1 and len(all_rows)>(idx+1)*limit:
                tail=all_rows[idx*limit+limit-1:]
                subtotal=sum((Decimal(str(r['amount'])) for r in tail if r['amount'] is not None),Decimal(0))
                rows=rows[:-1]+[dict(name=f'Прочие позиции ({len(tail)})',article=None,unit='',qty=None,
                    unitPrice=None,amount=float(subtotal),reason='Включены рассчитанные позиции' if any(r['amount'] is None for r in tail) else None)]
            for j,row in enumerate(rows):
                y=H-236-j*46
                if j%2==0:
                    rect(M,y-18,columns,45,PAPER)
                display=row['name']+(' · '+str(row['article']) if row['article'] else '')
                for n,t in enumerate(words(display,W*.51,12,False,2)):
                    text(M+13,y+3-n*14,t,12)
                text(labels[1][0],y,number(row['qty'])+' '+row['unit'],12,right=True)
                unit=row['unitPrice']
                text(labels[2][0],y,number(unit,5) if unit is not None else '—',12,right=True)
                text(labels[3][0],y,money(row['amount']),13,GREEN,True,True)
            if not rows:
                text(M+13,H-247,'В проекте нет позиций этой группы.',15,GRAY)
            c.showPage()
    c.save()
    return stream.getvalue()
