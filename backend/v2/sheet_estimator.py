"""Deterministic guillotine estimate, not an optimal or actual BAZIS cut plan.

Sort: decreasing area/long side/short side, then detail ID and copy index.
Placement: earliest sheet, smallest fitting rectangle area, y/x, no-rotation tie.
Split: vertical full rectangle, then horizontal across the placed strip.
Only explicit grain=none permits rotation. Coordinates are usable-field coordinates.
"""
from decimal import Decimal
from .calculation_math import dec,plain,hash_value

VERSION='guillotine-vertical-first-decimal-v1'

class PlacementError(ValueError): pass

def estimate(sheet,parts,settings):
    k=dec(settings['kerf_mm']);sl=dec(sheet['length']);sw=dec(sheet['width'])
    ul=sl-dec(settings['trim_left_mm'])-dec(settings['trim_right_mm'])
    uw=sw-dec(settings['trim_top_mm'])-dec(settings['trim_bottom_mm'])
    if min(ul,uw)<=0: raise PlacementError('NONPOSITIVE_USABLE_FIELD')
    expanded=[]
    for p in parts:
        l,w=dec(p['length']),dec(p['width']);q=p['qty']
        if min(l,w)<=0 or type(q) is not int or not 1<=q<=5000: raise PlacementError('INVALID_DIMENSIONS_OR_QTY')
        if p['grain'] not in {'none','length','width'}: raise PlacementError('GRAIN_CONFIRMATION_REQUIRED')
        if p['grain']=='width':
            # Explicit model: width grain aligns W to the sheet length axis; never infer from rotation.
            if not p['rotation']: raise PlacementError('GRAIN_ROTATION_CONFLICT')
            l,w=w,l
        alternatives=[(l,w,p['grain']=='width')]
        if p['rotation'] and p['grain']=='none' and l!=w: alternatives.append((w,l,True))
        if not any(a<=ul and b<=uw for a,b,_ in alternatives): raise PlacementError('DETAIL_EXCEEDS_USABLE_FIELD')
        for copy in range(q): expanded.append((p['detail_id'],copy,l,w,alternatives))
    if not expanded: raise PlacementError('NO_PARTS')
    if len(expanded)>10000: raise PlacementError('ESTIMATE_LIMIT_EXCEEDED')
    expanded.sort(key=lambda p:(-p[2]*p[3],-max(p[2],p[3]),-min(p[2],p[3]),p[0],p[1]))
    sheets=[];segments=[]
    for ident,copy,l,w,orientations in expanded:
        options=[]
        for si,s in enumerate(sheets):
            for ri,r in enumerate(s['free']):
                x,y,a,b=r
                for pl,pw,rotated in orientations:
                    if pl<=a and pw<=b: options.append(((si,a*b,y,x,rotated,ri),ri,r,pl,pw,rotated))
        if not options:
            sheets.append({'free':[(Decimal(0),Decimal(0),ul,uw)],'placements':[]})
            si=len(sheets)-1
            pl,pw,rotated=next(o for o in orientations if o[0]<=ul and o[1]<=uw)
            options=[((si,ul*uw,Decimal(0),Decimal(0),rotated,0),0,(Decimal(0),Decimal(0),ul,uw),pl,pw,rotated)]
        key,ri,r,pl,pw,rotated=min(options,key=lambda o:o[0]);si=key[0];s=sheets[si]
        x,y,a,b=r;s['free'].pop(ri)
        s['placements'].append({'detail_id':ident,'copy':copy,'x':x,'y':y,'length':pl,'width':pw,'rotated':rotated})
        if pl<a:
            segments.append({'sheet':si+1,'axis':'Y','x':x+pl,'y':y,'length_mm':b,'kind':'nesting','kerf_mm':k})
            if a-pl-k>0: s['free'].append((x+pl+k,y,a-pl-k,b))
        if pw<b:
            segments.append({'sheet':si+1,'axis':'X','x':x,'y':y+pw,'length_mm':pl,'kind':'nesting','kerf_mm':k})
            if b-pw-k>0: s['free'].append((x,y+pw+k,pl,b-pw-k))
    area=sum((p[2]*p[3] for p in expanded),Decimal(0))
    plan=plain({'estimator_version':VERSION,'label':'Расчётное количество листов','optimality_proven':False,
        'sheet':sheet,'usable_length':ul,'usable_width':uw,'kerf_mm':k,'estimated_sheet_count':len(sheets),
        'area_lower_bound':int((area/(ul*uw)).to_integral_value(rounding='ROUND_CEILING')),
        'sheets':[{'sheet':i+1,'placements':s['placements']} for i,s in enumerate(sheets)],
        'cut_segments':segments,'cut_metres':sum((s['length_mm'] for s in segments),Decimal(0))/1000,
        'trim_billing':'excluded_from_nesting_segments; NC-09 until approved policy',
        'trim':{key:settings[key] for key in ('trim_left_mm','trim_right_mm','trim_top_mm','trim_bottom_mm')}})
    plan['plan_hash']=hash_value(plan);return plan
