"""Wardrobe projections and finished shelf levels from the saved scene, in millimetres."""
import re
from collections import OrderedDict

from reportlab.lib.colors import HexColor, white

from .album_layout import number
from .upper_mounting import local


def drawing_sets(items):
    """One detail sheet per wardrobe. Ordinary furniture retains its layout sheet."""
    cabinets = OrderedDict()
    other = False
    manual_groups = {it.get('item_id', '').rpartition(':')[0] for it in items
                     if it.get('module_type')=='blank' and
                     it.get('name','').startswith(('Шкаф с полками ', 'Шкаф с перегородкой '))}
    for i, it in enumerate(items):
        kind = it.get('module_type')
        meta = it.get('assistant_carcass') or {}
        key = it.get('item_id', '').rpartition(':')[0]
        if kind == 'wardrobe':
            key = ('wardrobe', i)
        elif kind == 'blank' and (meta.get('spec') or {}).get('recipe') in ('shelves', 'divided'):
            key = ('assistant', meta['group_id'])
        elif kind == 'blank' and key and key in manual_groups:
            key = ('recipe', key)
        else:
            other = True
            continue
        cabinets.setdefault(key, []).append(it)
    return ([None] if other or not cabinets else []) + list(cabinets.values())


def profile(parts):
    blocks = []
    levels = {}
    sections = 1
    for p in parts:
        x,z = local(p)
        y = p.get('elevation_mm') or 0
        w,h,d = (p[k] for k in ('width','height','depth'))
        axis = p.get('blank_axis') or 'envelope'
        blocks.append((x-w/2,z-d/2,y,w,d,h,axis))
        if p.get('module_type') == 'wardrobe':
            base = p.get('base_height')
            if base is None:
                base = {'wall':0,'legs':60,'plinth':80}.get(p.get('base','plinth'),0)
            for s in p.get('shelves') or []:
                if not s.get('enabled',True):
                    continue
                t = s['thickness']
                level = y+base+s['offset_mm']+t/2
                inset = s.get('depth_clearance',1)
                sw = w-s.get('width_clearance',36)
                levels.setdefault(1,[]).append(level)
                blocks.append((x-sw/2,z-d/2+inset,level-t,sw,d-inset,t,'horizontal'))
        else:
            sections=max(sections, ((p.get('assistant_carcass') or {}).get('spec') or {}).get('sections',1))
            suffix=p.get('item_id','').rpartition(':')[2]
            shelf=re.fullmatch(r'shelf-(\d+)-(\d+)',suffix)
            divider=re.fullmatch(r'divider-(\d+)',suffix)
            if divider:
                sections=max(sections,int(divider[1])+2)
            if shelf and axis=='horizontal':
                section=int(shelf[1])+1
                sections=max(sections,section)
                levels.setdefault(section,[]).append(y+h)
    return blocks,[sorted(levels.get(s,[])) for s in range(1,sections+1)]


def draw(c,parts,x,top,width,bottom,details):
    blocks,levels=profile(parts)
    xmin=min(p[0] for p in blocks);xmax=max(p[0]+p[3] for p in blocks)
    zmin=min(p[1] for p in blocks);zmax=max(p[1]+p[4] for p in blocks)
    ymin=min(p[2] for p in blocks);ymax=max(p[2]+p[5] for p in blocks)
    ink=HexColor('#19382e'); muted=HexColor('#647168'); line=HexColor('#8c9e94')
    green=HexColor('#08745e')
    def text(px,py,value,size=9,bold=False,center=False,color=ink):
        c.setFillColor(color);c.setFont('SalesBold' if bold else 'Sales',size)
        (c.drawCentredString if center else c.drawString)(px,py,str(value))
    def stroke(x1,y1,x2,y2):
        c.setStrokeColor(line);c.setLineWidth(.55);c.line(x1,y1,x2,y2)
    table_w=170
    available=width-table_w-74
    scale=min(available/(xmax-xmin+zmax-zmin),(top-bottom-90)/(ymax-ymin))
    fw=(xmax-xmin)*scale;dw=(zmax-zmin)*scale
    front=x+35+(available-fw-dw)/2
    side=front+fw+31
    y0=bottom+46
    for xx,label in ((front,'Вид спереди'),(side,'Вид сбоку')):
        text(xx,top-12,label,9,True)
    for a,z,y,w,d,h,axis in sorted(blocks,key=lambda b:0 if b[6] in ('envelope','back') else 1 if b[6]=='side' else 2):
        for px,span,hidden in ((front+(a-xmin)*scale,w,False),(side+(z-zmin)*scale,d,axis=='horizontal')):
            c.setStrokeColor(muted);c.setLineWidth(.52)
            c.setFillColor(HexColor('#dcd7c9') if axis=='horizontal' else white)
            c.setDash([2,1] if hidden else [])
            c.rect(px,y0+(y-ymin)*scale,span*scale,h*scale,stroke=1,fill=int(not hidden))
            c.setDash([])
    if parts[0].get('module_type')=='wardrobe':
        p=parts[0];g=details.get(p.get('item_id')) or {}
        for s in g.get('shapes',[]):
            if s['role'] not in ('panel','hardware','appliance'):continue
            c.setStrokeColor(muted);c.setLineWidth(.4)
            c.rect(front+(s['x']+p['width']/2)*scale,y0+s['y']*scale,s['w']*scale,s['h']*scale,fill=0)
    # Place levels directly above the shelves when their projection has room.
    # The adjacent schedule also covers narrow sections and closely spaced shelves.
    upper_limit=y0+(ymax-ymin)*scale
    last_label={}
    for a,z,y,w,d,h,axis in sorted(blocks,key=lambda b:b[2]):
        level=y+h
        if axis!='horizontal' or not any(level in column for column in levels):
            continue
        section_x=round(a+w/2,1)
        py=y0+(level-ymin)*scale+2
        if w*scale>=31 and py-last_label.get(section_x,float('-inf'))>=11 and py+8<upper_limit:
            text(front+(section_x-xmin)*scale,py,number(level),7,False,True,green)
            last_label[section_x]=py
    for xx,span,mm in ((front,fw,xmax-xmin),(side,dw,zmax-zmin)):
        at=y0-15
        stroke(xx,at,xx+span,at)
        for end in (xx,xx+span):
            stroke(end,y0-2,end,at-3);stroke(end-2,at-2,end+2,at+2)
        text(xx+span/2,at-12,number(mm),10,True,True)
    xx=front-16;upper=y0+(ymax-ymin)*scale
    stroke(xx,y0,xx,upper)
    for at in (y0,upper):
        stroke(xx-3,at,front-2,at);stroke(xx-2,at-2,xx+2,at+2)
    c.saveState();c.translate(xx-4,(upper+y0)/2);c.rotate(90)
    text(0,0,number(ymax-ymin),10,True,True);c.restoreState()
    tx=x+width-table_w+7
    text(tx,top-12,'Высота полок, мм',12,True)
    text(tx,top-29,'От пола до верха полки',9,color=muted)
    text(tx,top-43,'Нумерация снизу вверх',8,color=muted)
    count=max(map(len,levels),default=0)
    if not count:
        text(tx,top-68,'Полок нет',9);return
    step=(table_w-30)/len(levels)
    text(tx,top-66,'№',8,True)
    for i in range(len(levels)):
        text(tx+21+(i+.5)*step,top-66,'Сек. '+str(i+1),8,True,True)
    stroke(tx,top-72,x+width,top-72)
    for row in range(count):
        py=top-86-row*16
        text(tx,py,str(row+1),9,color=muted)
        for i,section in enumerate(levels):
            val=number(section[row]) if row<len(section) else '—'
            text(tx+21+(i+.5)*step,py,val,9,False,True,green)
