"""Vector placement diagram and saved module schedule for the client album."""
from collections import OrderedDict
from html import escape
from math import cos, sin, radians, isfinite
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase.pdfmetrics import stringWidth

INK = HexColor('#19382e')
MUTED = HexColor('#647168')
LINE = HexColor('#d7ddd5')
TYPES = {'base_cabinet': 'Нижний шкаф', 'wall_cabinet': 'Верхний шкаф',
         'tall_cabinet': 'Пенал', 'wardrobe': 'Шкаф', 'vanity': 'Тумба', 'chest': 'Комод'}


def number(value):
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not isfinite(value) or value <= 0:
        return 'не задано'
    return f'{value:.3f}'.rstrip('0').rstrip('.').replace('.', ',')


def footprint(item):
    """Saved placement envelope; same rotation convention as furniture-core."""
    w, d = item.get('width'), item.get('depth')
    if number(w) == 'не задано' or number(d) == 'не задано':
        return None
    angle = radians(item.get('rotation', 0))
    c, s = cos(angle), sin(angle)
    return [(item.get('x', 0)+x*c-z*s, item.get('z', 0)+x*s+z*c)
            for x, z in [(-w/2, -d/2), (w/2, -d/2), (w/2, d/2), (-w/2, d/2)]]


def number_ranges(ids):
    values = [int(value) for value in ids]
    runs = []
    for value in values:
        if runs and value == runs[-1][-1]+1: runs[-1].append(value)
        else: runs.append([value])
    return ', '.join(f'{run[0]}-{run[-1]}' if len(run) >= 3 else ', '.join(map(str, run)) for run in runs)


def schedule(items):
    groups = OrderedDict()
    for n, item in enumerate(items, 1):
        name = item.get('name') or TYPES.get(item.get('module_type'), 'Модуль')
        dimensions = ' × '.join(number(item.get(k)) for k in ('width', 'height', 'depth'))
        groups.setdefault((name, dimensions), []).append(str(n))
    return [(number_ranges(ids), name, dimensions) for (name, dimensions), ids in groups.items()]


def dimension_geometry(group):
    """Projection dimensions use actual rotated envelopes, including any gaps."""
    shapes = [(n, it, footprint(it)) for n, it in group]
    if not shapes or any(points is None for _, _, points in shapes):
        return None
    xs, zs = set(), set()
    for _, _, points in shapes:
        xs.add((round(min(p[0] for p in points), 3), round(max(p[0] for p in points), 3)))
        zs.add((round(min(p[1] for p in points), 3), round(max(p[1] for p in points), 3)))
    bounds = (min(a for a, _ in xs), max(b for _, b in xs),
              min(a for a, _ in zs), max(b for _, b in zs))
    def gaps(spans):
        result = set(); end = None
        for a, b in sorted(spans):
            if end is not None and a > end: result.add((end, a))
            end = max(end, b) if end is not None else b
        return result
    # If a cabinet dimension equals the overall extent, show that line only once.
    return {'shapes': shapes, 'bounds': bounds,
            'horizontal': sorted((xs | gaps(xs))-{bounds[:2]}),
            'vertical': sorted((zs | gaps(zs))-{bounds[2:]})}


def dimension_lanes(spans, scale):
    """Separate overlapping spans and text; adjacent dimension chains share a lane."""
    lanes, result = [], []
    for a, b in sorted(spans):
        middle = (a+b)*scale/2
        label_width = len(number(b-a))*7.5*.67+5
        start, end = min(a*scale, middle-label_width/2), max(b*scale, middle+label_width/2)
        lane = next((n for n, occupied in enumerate(lanes) if start >= occupied-.01), len(lanes))
        if lane == len(lanes): lanes.append(end)
        else: lanes[lane] = end
        result.append((a, b, lane))
    return result


def draw(c, scene, x, top, width, bottom):
    items = scene.get('items') or []
    uppers = [(n, it) for n, it in enumerate(items, 1) if it.get('module_type') == 'wall_cabinet']
    lowers = [(n, it) for n, it in enumerate(items, 1) if it.get('module_type') != 'wall_cabinet']
    tall = sum(it.get('module_type') == 'tall_cabinet' for it in items)
    body_top = top-31

    def para(value, px, py, pw, size=10, bold=False, color=INK):
        p = Paragraph(escape(str(value)), ParagraphStyle('layout', fontName='SalesBold' if bold else 'Sales',
                      fontSize=size, leading=size*1.35, textColor=color))
        _, height = p.wrap(pw, 1000)
        p.drawOn(c, px, py-height)
        return height

    para(f"Модулей: {len(items)}   /   Напольных: {len(lowers)-tall}   /   Верхних: {len(uppers)}   /   Пеналов: {tall}   /   Размеры в мм",
         x, top, width, 9, color=MUTED)

    # Keep names and full W/H/D below the drawings, in two balanced columns.
    column_width = (width-16)/2
    widths = [42, column_width-160, 118]
    style = ParagraphStyle('module', fontName='Sales', fontSize=8.5, leading=11.5, textColor=INK)
    rows = []
    for values in schedule(items):
        cells = [Paragraph(escape(value), style) for value in values]
        heights = [p.wrap(w-10, 1000)[1] for p, w in zip(cells, widths)]
        rows.append((cells, max(18, max(heights)+6)))
    split = min(range(1, len(rows)+1), key=lambda k: max(sum(h for _, h in rows[:k]), sum(h for _, h in rows[k:])))
    columns = [rows[:split], rows[split:]]
    legend_height = 24+max(sum(h for _, h in part) for part in columns)
    if body_top-bottom-legend_height-16 < 125:
        raise ValueError('Список модулей не помещается на странице планировки. Разделите проект на помещения.')
    legend_top = bottom+legend_height
    for column, part in enumerate(columns):
        if not part: continue
        px = x+column*(column_width+16)
        c.setFillColor(INK); c.roundRect(px, legend_top-24, column_width, 24, 4, fill=1, stroke=0)
        tx = px
        for label, w in zip(['№', 'Шкафчик', 'Ш × В × Г, мм'], widths):
            para(label, tx+5, legend_top-6, w-10, 8.5, True, white); tx += w
        y = legend_top-24
        for n, (cells, height) in enumerate(part):
            c.setFillColor(white if n % 2 == 0 else HexColor('#edf1eb'))
            c.rect(px, y-height, column_width, height, fill=1, stroke=0)
            tx = px
            for p, w in zip(cells, widths):
                _, h = p.wrap(w-10, 1000); p.drawOn(c, tx+5, y-(height+h)/2); tx += w
            y -= height

    def tick(px, py):
        c.line(px-2, py-2, px+2, py+2)

    def horizontal(a, b, base, at, value):
        c.setStrokeColor(MUTED); c.setFillColor(INK); c.setLineWidth(.45)
        side = 1 if at > base else -1
        c.line(a, base+side*2, a, at+side*3); c.line(b, base+side*2, b, at+side*3)
        c.line(a, at, b, at); tick(a, at); tick(b, at)
        c.setFont('Sales', 7.5); c.drawCentredString((a+b)/2, at+3, number(value))

    def vertical(a, b, base, at, value):
        c.setStrokeColor(MUTED); c.setFillColor(INK); c.setLineWidth(.45)
        side = 1 if at > base else -1
        c.line(base+side*2, a, at+side*3, a); c.line(base+side*2, b, at+side*3, b)
        c.line(at, a, at, b); tick(at, a); tick(at, b)
        c.saveState(); c.translate(at-3, (a+b)/2); c.rotate(90)
        c.setFont('Sales', 7.5); c.drawCentredString(0, 0, number(value)); c.restoreState()

    def plan(group, label, px, ptop, pw, pbottom):
        c.setFillColor(white); c.roundRect(px, pbottom, pw, ptop-pbottom, 8, fill=1, stroke=0)
        heading = para(label, px+12, ptop-12, pw-24, 10, True)
        geometry = dimension_geometry(group)
        if not geometry:
            para('Для схемы нужно заполнить размеры модулей. Доступные данные приведены в списке.',
                 px+12, ptop-heading-28, pw-24, 9, color=MUTED)
            return
        minx, maxx, minz, maxz = geometry['bounds']
        region_top, region_bottom = ptop-heading-25, pbottom+8
        nh, nv = 0, 0
        for _ in range(12):
            ml, mr, mt, mb = (14+12*(nv-1)+6 if nv else 8), 23, 27, (14+12*(nh-1)+5 if nh else 8)
            available_w, available_h = pw-20-ml-mr, region_top-region_bottom-mt-mb
            if min(available_w, available_h) < 20:
                raise ValueError('Размерные линии не помещаются на листе. Разделите проект на помещения.')
            scale = min(available_w/(maxx-minx), available_h/(maxz-minz))
            hs = dimension_lanes(geometry['horizontal'], scale)
            # Screen Y runs opposite to saved Z; sort in screen coordinates.
            vs = dimension_lanes([(-b, -a) for a, b in geometry['vertical']], scale)
            new_nh = max(nh, max((lane+1 for _, _, lane in hs), default=0))
            new_nv = max(nv, max((lane+1 for _, _, lane in vs), default=0))
            if (nh, nv) == (new_nh, new_nv): break
            nh, nv = new_nh, new_nv
        else:
            raise ValueError('Размерные линии не помещаются на листе. Разделите проект на помещения.')
        ox = px+10+ml+(available_w-(maxx-minx)*scale)/2
        oy = region_bottom+mb+(available_h-(maxz-minz)*scale)/2
        sx = lambda v: ox+(v-minx)*scale
        sy = lambda v: oy+(maxz-v)*scale
        visible = OrderedDict()
        for n, it, shape in geometry['shapes']:
            key = tuple((round(a, 3), round(b, 3)) for a, b in shape)
            visible.setdefault(key, []).append((n, it))
        for shape, members in visible.items():
            label = number_ranges([str(n) for n, _ in members])
            poly = [(sx(a), sy(b)) for a, b in shape]
            c.setFillColor(HexColor('#edf1eb')); c.setStrokeColor(HexColor('#9cae9f')); c.setLineWidth(.7)
            path = c.beginPath(); path.moveTo(*poly[0])
            for p in poly[1:]: path.lineTo(*p)
            path.close(); c.drawPath(path, fill=1, stroke=1)
            c.setStrokeColor(INK); c.setLineWidth(2); c.line(*poly[2], *poly[3])
            cx, cy = sum(p[0] for p in poly)/4, sum(p[1] for p in poly)/4
            cell_w = max(p[0] for p in poly)-min(p[0] for p in poly)
            cell_h = max(p[1] for p in poly)-min(p[1] for p in poly)
            height_text = 'H '+' / '.join(dict.fromkeys(number(it.get('height')) for _, it in members))
            show_height = cell_h >= 24 and cell_w >= stringWidth(height_text, 'Sales', 7)+5
            c.setFillColor(INK); c.setFont('SalesBold', 8)
            c.drawCentredString(cx, cy+(2 if show_height else -2.8), label)
            if show_height:
                c.setFont('Sales', 7); c.drawCentredString(cx, cy-9, height_text)
        for a, b, lane in hs:
            horizontal(sx(a), sx(b), oy, oy-14-lane*12, b-a)
        for a, b, lane in vs:
            vertical(sy(-b), sy(-a), ox, ox-14-lane*12, b-a)
        horizontal(sx(minx), sx(maxx), sy(minz), sy(minz)+14, maxx-minx)
        vertical(sy(maxz), sy(minz), sx(maxx), sx(maxx)+14, maxz-minz)

    panels = [(lowers, 'Напольные модули и пеналы · 2D-план'), (uppers, 'Верхние шкафы · 2D-план')]
    panels = [(group, label) for group, label in panels if group]
    panel_width = (width-16*(len(panels)-1))/len(panels)
    for n, (group, label) in enumerate(panels):
        plan(group, label, x+n*(panel_width+16), body_top, panel_width, legend_top+16)
    para('Размеры по габаритам модулей, с учётом поворотов и промежутков. H - высота без столешницы; все высоты есть в списке. Жирная линия - лицевая сторона.',
         x, bottom-15, width, 8.5, color=MUTED)
