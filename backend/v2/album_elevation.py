"""Vector front elevations; item placement is always taken from the saved scene."""
from math import isfinite
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase.pdfmetrics import stringWidth
from .album_layout import number, dimension_lanes
from .upper_mounting import local, worktop_top

INK=HexColor('#263b33'); LINE=HexColor('#a3b1a9'); MUTED=HexColor('#6c7972'); ACCENT=HexColor('#08745e')


def validate_geometry(items, geometry):
    if geometry is None: return {}
    if len(geometry)!=len(items) or len({g['item_id'] for g in geometry})!=len(items):
        raise ValueError('Чертёж не соответствует сохранённой кухне. Откройте альбом заново.')
    by_id={g['item_id']:g for g in geometry}
    for it in items:
        g=by_id.get(it.get('item_id'))
        if not g or any(g[k]!=it[k] for k in ('width','height','depth')) or g.get('source_sha256')!=(it.get('bazis_sha256') or None):
            raise ValueError('Размеры или исходный модуль изменились. Откройте альбом заново.')
        # Bounded local millimetres: no SVG, HTML, paths, URLs or executable input.
        for s in g['shapes']:
            if not all(isfinite(s[k]) for k in ('x','y','w','h')) or s['w']<=0 or s['h']<=0:
                raise ValueError('Некорректная геометрия чертежа')
            if s['x'] < -it['width']/2-100 or s['x']+s['w'] > it['width']/2+100 or s['y'] < -100 or s['y']+s['h'] > it['height']+150:
                raise ValueError('Деталь выходит за габарит модуля на чертеже')
    return by_id


def elevations(items):
    """Separate front directions and parallel runs, including islands."""
    groups=[]
    for n,it in enumerate(items,1):
        if any(not isinstance(it.get(k),(int,float)) or not isfinite(it[k]) or it[k]<=0 for k in ('width','height','depth')): continue
        rotation=it.get('rotation',0)%360
        if rotation not in (0,90,180,270): raise ValueError('Для чертежа нужен поворот модулей с шагом 90°.')
        x,z=local(it);back=z-it['depth']/2
        group=next((g for g in groups if g['rotation']==rotation and abs(g['back']-back)<=180),None)
        if group is None: group={'rotation':rotation,'back':back,'items':[]};groups.append(group)
        bottom=(it.get('elevation_mm') if it.get('elevation_mm') is not None else 1458) if it.get('module_type')=='wall_cabinet' else 0
        group['items'].append({'number':n,'item':it,'x':x,'bottom':bottom})
    return sorted(groups,key=lambda g:(g['rotation'],g['back']))


def draw(c,scene,x,top,width,bottom,geometry=None):
    items=scene.get('items') or []
    details=validate_geometry(items,geometry)
    groups=elevations(items)
    if not groups:
        c.setFont('Sales',11);c.drawString(x,top-25,'Для схемы нужно заполнить размеры модулей.');return
    if len(groups)>4: raise ValueError('Больше четырёх отдельных рядов: разделите проект на помещения для читаемого чертежа.')
    cols=2 if len(groups)>1 else 1; rows=(len(groups)+cols-1)//cols
    gap=24;cell_w=(width-gap*(cols-1))/cols;cell_h=(top-bottom-gap*(rows-1))/rows
    for i,g in enumerate(groups):
        gx=x+(i%cols)*(cell_w+gap);gt=top-(i//cols)*(cell_h+gap)
        _view(c,g,details,gx,gt,cell_w,cell_h,letter=chr(65+i),single=len(groups)==1)


def _view(c,group,details,x,top,width,height,letter,single):
    entries=group['items'];left=min(e['x']-e['item']['width']/2 for e in entries);right=max(e['x']+e['item']['width']/2 for e in entries)
    overall=max(e['bottom']+e['item']['height']+(worktop_top(e['item'])-e['item']['height'] if e['item'].get('module_type')=='base_cabinet' else 0) for e in entries)
    scale=min((width-102)/(right-left),(height-100)/overall)
    if scale<=0: raise ValueError('Кухня слишком велика для читаемого чертежа на одном листе.')
    font=8 if single else 7
    lower=[e for e in entries if e['item'].get('module_type')!='wall_cabinet']
    upper=[e for e in entries if e['item'].get('module_type')=='wall_cabinet']
    def chain(rows):
        spans=sorted(set((e['x']-e['item']['width']/2,e['x']+e['item']['width']/2) for e in rows))
        gaps=[];edge=None
        for a,b in spans:
            if edge is not None and a>edge: gaps.append((edge,a))
            edge=max(edge,b) if edge is not None else b
        return dimension_lanes(sorted(spans+gaps),scale)
    low_lanes=chain(lower);high_lanes=chain(upper)
    low_count=max((n for _,_,n in low_lanes),default=0)+1
    high_count=max((n for _,_,n in high_lanes),default=0)+1
    if max(low_count,high_count)>3: raise ValueError('Размерные линии не помещаются. Разделите сложную расстановку на отдельные проекты.')
    scale=min(scale,(height-100-(low_count+high_count-2)*12)/overall)
    ox=x+58+(width-102-(right-left)*scale)/2;oy=top-height+54+(low_count-1)*12
    def point(xx,yy):return ox+(xx-left)*scale,oy+yy*scale
    def txt(value,px,py,size=font,color=INK,bold=False,align='center'):
        c.setFont('SalesBold' if bold else 'Sales',size);c.setFillColor(color)
        getattr(c,{'center':'drawCentredString','left':'drawString','right':'drawRightString'}[align])(px,py,str(value))
    def line(a,b,color=LINE,lw=.4):c.setStrokeColor(color);c.setLineWidth(lw);c.line(*a,*b)
    def tick(xx,yy,color=LINE):line((xx-2,yy-2),(xx+2,yy+2),color)
    def dh(a,b,yy,value,origin=0):
        ax,base=point(a,origin);bx,_=point(b,origin)
        line((ax,base-3),(ax,yy-4));line((bx,base-3),(bx,yy-4));line((ax,yy),(bx,yy));tick(ax,yy);tick(bx,yy)
        txt(value,(ax+bx)/2,yy+4)
    def dv(a,b,xx,value,color=INK,bold=False):
        edge,y1=point(left,a);_,y2=point(left,b)
        line((edge-3,y1),(xx-4,y1));line((edge-3,y2),(xx-4,y2));line((xx,y1),(xx,y2),color);tick(xx,y1,color);tick(xx,y2,color)
        c.saveState();c.translate(xx-4,(y1+y2)/2);c.rotate(90);txt(value,0,0,color=color,bold=bold);c.restoreState()
    txt('Вид '+letter if not single else 'Внутреннее наполнение',x,top-8,8,MUTED,align='left')
    for e in entries:
        it=e['item'];px=e['x'];by=e['bottom'];w=it['width'];h=it['height'];g=details.get(it.get('item_id'))
        a,b=point(px-w/2,by);c.setStrokeColor(INK);c.setLineWidth(.65);c.rect(a,b,w*scale,h*scale,fill=0,stroke=1)
        if g and g.get('detail')!='outline':
            for s in sorted(g['shapes'],key=lambda s:s['role']=='front'):
                role=s['role'];sx,sy=point(px+s['x'],by+s['y']);sw,sh=s['w']*scale,s['h']*scale
                c.setStrokeColor(LINE if role=='front' else MUTED if role in ('hardware','appliance') else INK)
                c.setLineWidth(.28 if role=='front' else .4)
                c.setDash([2,2] if role=='front' else [])
                if role!='label':c.rect(sx,sy,sw,sh,fill=0,stroke=1)
                c.setDash([])
                if s.get('label') and sw>24:txt(s['label'],sx+sw/2,sy+sh/2-2,min(font,7),MUTED)
        else:
            # Old clients can still export; do not invent unavailable internal parts.
            txt('Контур',a+w*scale/2,b+h*scale/2,7,MUTED)
        # Module numbers use positions in the saved project, including split wall views.
        stacked=any(other is not e and abs(other['x']-px)<w/2 and 0<=other['bottom']-by-h<=50 for other in entries)
        label_y=b+h*scale+(-12 if stacked else 7) if it.get('module_type')=='wall_cabinet' else b-13
        txt(str(e['number']),a+w*scale/2,label_y,font,INK,True)
    for a,b,lane in low_lanes:dh(a,b,oy-26-lane*12,number(b-a))
    for a,b,lane in high_lanes:dh(a,b,oy+overall*scale+22+lane*12,number(b-a),overall)
    dh(left,right,oy-26-low_count*12,number(right-left))
    dv(0,overall,ox-43,number(overall))
    lower=[e for e in entries if e['item'].get('module_type')=='base_cabinet']
    upper=[e for e in entries if e['item'].get('module_type')=='wall_cabinet']
    if lower and upper:
        levels={worktop_top(e['item']) for e in lower};bottoms={e['bottom'] for e in upper}
        if len(levels)==1:
            surface=next(iter(levels));upper_bottom=min(bottoms);clearance=upper_bottom-surface
            if clearance>0:
                dv(0,surface,ox-19,number(surface));dv(surface,upper_bottom,ox-19,number(clearance),ACCENT,True)
                upper_tops={e['bottom']+e['item']['height'] for e in upper if e['bottom']==upper_bottom}
                if len(upper_tops)==1:dv(upper_bottom,next(iter(upper_tops)),ox-19,number(next(iter(upper_tops))-upper_bottom))
                if single:
                    fx,fy=point((left+max(e['x']+e['item']['width']/2 for e in lower))/2,(surface+upper_bottom)/2)
                    txt('ФАРТУК '+number(clearance)+' мм',fx,fy,10,ACCENT,True)
    # Small actual-height callouts remain useful for uppers of different heights.
    if len({e['item']['height'] for e in upper})>1:
        for e in upper:
            px,py=point(e['x'],e['bottom']+e['item']['height']-70)
            txt('H '+number(e['item']['height']),px,py,7,MUTED)
