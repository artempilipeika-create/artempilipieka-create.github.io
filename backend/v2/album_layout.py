"""Vector placement diagram and saved module schedule for the client album."""
from collections import OrderedDict
from html import escape
from math import cos, sin, radians, isfinite
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph

INK = HexColor('#19382e')
MUTED = HexColor('#647168')
LINE = HexColor('#d7ddd5')
TYPES = {'base_cabinet': 'Нижний шкаф', 'wall_cabinet': 'Верхний шкаф',
         'tall_cabinet': 'Пенал', 'wardrobe': 'Шкаф', 'vanity': 'Тумба', 'chest': 'Комод'}


def number(value):
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not isfinite(value) or value <= 0:
        return 'не задано'
    return f'{value:g}'.replace('.', ',')


def footprint(item):
    """Saved placement envelope; same rotation convention as furniture-core."""
    w, d = item.get('width'), item.get('depth')
    if number(w) == 'не задано' or number(d) == 'не задано':
        return None
    angle = radians(item.get('rotation', 0))
    c, s = cos(angle), sin(angle)
    return [(item.get('x', 0)+x*c-z*s, item.get('z', 0)+x*s+z*c)
            for x, z in [(-w/2, -d/2), (w/2, -d/2), (w/2, d/2), (-w/2, d/2)]]


def schedule(items):
    groups = OrderedDict()
    for n, item in enumerate(items, 1):
        name = item.get('name') or TYPES.get(item.get('module_type'), 'Модуль')
        dimensions = ' × '.join(number(item.get(k)) for k in ('width', 'height', 'depth'))
        groups.setdefault((name, dimensions), []).append(str(n))
    return [(', '.join(ids), name, dimensions) for (name, dimensions), ids in groups.items()]


def draw(c, scene, x, top, width, bottom):
    items = scene.get('items') or []
    uppers = [(n, it) for n, it in enumerate(items, 1) if it.get('module_type') == 'wall_cabinet']
    lowers = [(n, it) for n, it in enumerate(items, 1) if it.get('module_type') != 'wall_cabinet']
    tall = sum(it.get('module_type') == 'tall_cabinet' for it in items)
    left_width = width*.44
    table_x = x+left_width+20
    table_width = width-left_width-20
    body_top = top-33

    def para(value, px, py, pw, size=10, bold=False, color=INK):
        p = Paragraph(escape(str(value)), ParagraphStyle('layout', fontName='SalesBold' if bold else 'Sales',
                      fontSize=size, leading=size*1.35, textColor=color))
        _, height = p.wrap(pw, 1000)
        p.drawOn(c, px, py-height)
        return height

    para(f"Модулей: {len(items)}   /   Напольных: {len(lowers)-tall}   /   Верхних: {len(uppers)}   /   Пеналов: {tall}",
         x, top, width, 10, color=MUTED)
    c.setFillColor(white)
    c.roundRect(x, bottom, left_width, body_top-bottom, 8, fill=1, stroke=0)

    def plan(group, label, ptop, pbottom):
        para(label, x+16, ptop, left_width-32, 10, True)
        shapes = [(n, footprint(it)) for n, it in group]
        if not shapes:
            para('Не предусмотрены проектом', x+16, ptop-35, left_width-32, 10, color=MUTED)
            return
        if any(points is None for _, points in shapes):
            para('Для схемы нужно заполнить размеры модулей. Доступные данные приведены в списке.',
                 x+16, ptop-35, left_width-32, 10, color=MUTED)
            return
        points = [p for _, shape in shapes for p in shape]
        minx, maxx = min(p[0] for p in points), max(p[0] for p in points)
        minz, maxz = min(p[1] for p in points), max(p[1] for p in points)
        pw, ph = left_width-44, ptop-pbottom-36
        scale = min(pw/(maxx-minx), ph/(maxz-minz))
        ox = x+22+(pw-(maxx-minx)*scale)/2
        oy = pbottom+8+(ph-(maxz-minz)*scale)/2
        transform = lambda p: (ox+(p[0]-minx)*scale, oy+(maxz-p[1])*scale)
        for n, shape in shapes:
            poly = [transform(p) for p in shape]
            c.setFillColor(HexColor('#edf1eb')); c.setStrokeColor(HexColor('#9cae9f')); c.setLineWidth(.7)
            path = c.beginPath(); path.moveTo(*poly[0])
            for p in poly[1:]: path.lineTo(*p)
            path.close(); c.drawPath(path, fill=1, stroke=1)
            # Local +Z is the front in the saved constructor geometry.
            c.setStrokeColor(INK); c.setLineWidth(2.1); c.line(*poly[2], *poly[3])
            cx, cy = sum(p[0] for p in poly)/4, sum(p[1] for p in poly)/4
            c.setFillColor(white); c.circle(cx, cy, 8, fill=1, stroke=0)
            c.setFillColor(INK); c.setFont('SalesBold', 8); c.drawCentredString(cx, cy-2.8, str(n))

    usable_top, usable_bottom = body_top-16, bottom+40
    if uppers and lowers:
        middle = (usable_top+usable_bottom)/2
        plan(lowers, 'Напольные модули и пеналы · вид сверху', usable_top, middle+7)
        c.setStrokeColor(LINE); c.setLineWidth(.5); c.line(x+16, middle, x+left_width-16, middle)
        plan(uppers, 'Верхние шкафы · вид сверху', middle-12, usable_bottom)
    else:
        plan(uppers or lowers, 'Верхние шкафы · вид сверху' if uppers else 'Модули · вид сверху', usable_top, usable_bottom)
    para('Жирная линия — лицевая сторона. Номера соответствуют списку справа.',
         x+16, bottom+31, left_width-32, 8, color=MUTED)

    widths = [52, table_width-174, 122]
    style = ParagraphStyle('module', fontName='Sales', fontSize=9, leading=12, textColor=INK)
    rows = []
    for values in schedule(items):
        cells = [Paragraph(escape(value), style) for value in values]
        heights = [p.wrap(w-12, 1000)[1] for p, w in zip(cells, widths)]
        rows.append((cells, max(24, max(heights)+10)))
    if body_top-30-sum(h for _, h in rows) < bottom:
        raise ValueError('Список модулей не помещается на странице планировки. Разделите проект на помещения.')
    c.setFillColor(INK); c.roundRect(table_x, body_top-30, table_width, 30, 5, fill=1, stroke=0)
    px = table_x
    for label, w in zip(['№', 'Шкафчик', 'Ш × В × Г, мм'], widths):
        para(label, px+6, body_top-8, w-12, 9, True, white); px += w
    y = body_top-30
    for n, (cells, height) in enumerate(rows):
        c.setFillColor(white if n % 2 == 0 else HexColor('#edf1eb'))
        c.rect(table_x, y-height, table_width, height, fill=1, stroke=0)
        px = table_x
        for p, w in zip(cells, widths):
            _, h = p.wrap(w-12, 1000); p.drawOn(c, px+6, y-(height+h)/2); px += w
        y -= height
    para('Размеры модулей из сохранённого проекта. Высота — без столешницы. Схема показывает габариты и расположение, без деталировки корпуса.',
         x, bottom-15, width, 9, color=MUTED)
