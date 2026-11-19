"""Bounded carcass plans. Geometry remains owned by the existing constructor."""
import json
from pathlib import Path
from typing import Literal, Annotated
from uuid import UUID
from pydantic import ConfigDict, Field, model_validator
from .auth_api import StrictModel


def niche_slot(section, level, column=0):
    # Preserve the part IDs of all wardrobes saved with up to three sections.
    return 66 + level + 11 * column if section == 3 else section + 3 * level + 33 * column


def niche_address(slot):
    if slot < 66:
        return slot % 3, (slot % 33) // 3, slot >= 33
    return 3, (slot - 66) % 11, slot >= 77


class CarcassSpec(StrictModel):
    recipe: Literal['shelves', 'divided', 'wall', 'base', 'sink', 'cap']
    width: int = Field(ge=200, le=2400, strict=True)
    height: int = Field(ge=200, le=3000, strict=True)
    depth: int = Field(ge=200, le=1200, strict=True)
    thickness: int = Field(ge=10, le=40, strict=True)
    shelves: int = Field(ge=0, le=10, strict=True)
    sections: int = Field(ge=1, le=4, strict=True)
    back: bool
    elevation: int = Field(ge=0, le=5000, strict=True)
    shelfSetback: int = Field(ge=0, le=100, strict=True)
    shelfGap: int = Field(ge=0, le=10, strict=True)
    edgeThickness: Literal[0.4, 0.8, 1, 2, 3]
    edgePolicy: Literal['front', 'all', 'none']

    @model_validator(mode='after')
    def construction(self):
        if self.recipe == 'sink' and (self.back or self.shelves or self.sections != 1):
            raise ValueError('Invalid sink construction')
        if self.recipe in ('base', 'cap') and self.sections != 1:
            raise ValueError('Single section required')
        if (self.width-(self.sections+1)*self.thickness)//self.sections-2*self.shelfGap < 100:
            raise ValueError('Sections too narrow')
        top = self.height-(80 if self.recipe == 'sink' else self.thickness)
        if top-self.thickness-self.shelves*self.thickness < (self.shelves+1)*60:
            raise ValueError('Shelves too close')
        return self


class CarcassPosition(StrictModel):
    x: float = Field(ge=-12000, le=12000, multiple_of=0.5, allow_inf_nan=False)
    z: float = Field(ge=-12000, le=12000, multiple_of=0.5, allow_inf_nan=False)
    elevation_mm: int = Field(ge=0, le=5000, strict=True)
    rotation: Literal[0, 90, 180, 270]


# Keys correspond to the shelf fragments available in the questionnaire.
GLASS_SUPPORTS = {
    **dict.fromkeys(('39543','48862','39544','48846','48848'), (4,6,8)),
    **dict.fromkeys(('80936','103819','103816','103817','103814'), (6,8)),
    **dict.fromkeys(('64145','103818'), (8,)),
}
def shelf_valid(value, thickness):
    size, sep, article = value.partition('/')
    if size == 'board':
        if article in ('cam_dowel','confirmat'): return thickness in (16,18,25)
        if article == '95388': return True
        if article == '134286': return thickness in (16,18)
        return article in ('60714','70245','134762','134763') and thickness in (16,18,25)
    return size in ('4','6','8') and int(size) in GLASS_SUPPORTS.get(article, ())

ShelfValue = Annotated[str, Field(max_length=15)]
class CarcassJoints(StrictModel):
    top: Literal['none','confirmat','cam_dowel']
    bottom: Literal['none','confirmat','cam_dowel']


PLINTH_FEET = {row['article']: row for row in json.loads(
    (Path(__file__).parent/'cabinet_assets/planner/plinth-feet.json').read_text()
)}

ASSETS=Path(__file__).parent/'cabinet_assets/planner'
DECOR_FEET={row['article']:row for row in json.loads((ASSETS/'decor-feet.json').read_text()) if not row.get('issue')}
DECOR_CENTRES=json.loads((ASSETS/'decor-centres.json').read_text())

class WardrobeFeet(StrictModel):
    layout: Literal['width'] | None = Field(default=None,exclude_if=lambda v:v is None)
    article: str
    left: Literal['side'] | None = Field(default=None,exclude_if=lambda v:v is None)
    right: Literal['side'] | None = Field(default=None,exclude_if=lambda v:v is None)

    @model_validator(mode='after')
    def supported(self):
        if self.article not in PLINTH_FEET and ((self.article!='118779' and self.article not in DECOR_FEET) or self.left or self.right):
            raise ValueError('Неизвестная опора или тип цоколя.')
        return self

    @property
    def height(self):
        return (PLINTH_FEET.get(self.article) or DECOR_FEET.get(self.article) or {'height':10})['height']
    front: int = Field(ge=10,le=1200,strict=True)
    rear: int = Field(ge=10,le=1200,strict=True)

def inner_foot_pairs(width, sections, layout):
    if layout == 'width':
        return int(width > 800)
    return sections - 1 or int(width > 900)


DOOR_HARDWARE = json.loads((ASSETS/'wardrobe-handle-catalogue.json').read_text())
LeafKey = Annotated[str, Field(pattern=r'^door-(?:(?:lower|upper)-)?(?:left|right)$')]
Swing = Literal['left','right','pair','open']

class FacadeHandle(StrictModel):
    model_config = ConfigDict(serialize_by_alias=True)
    article: str = Field(min_length=5,max_length=6,pattern=r'^[0-9]+$')
    edge: Literal['left','right','top','bottom']
    along: Literal['center','start','end'] = Field(alias='from')
    offset: float = Field(ge=0,le=3000)
    inset: float = Field(ge=0,le=3000)

    def check_size(self,width,height):
        product=DOOR_HARDWARE.get(self.article,{})
        if product.get('family') not in ('ak700','monblan'):
            raise ValueError('Проверьте артикул ручки фасада.')
        vertical=self.edge in ('left','right')
        span,other=(height,width) if vertical else (width,height)
        pull=product['family']=='ak700'
        half=(product['pitch'] if pull else product['length'])/2
        center=span/2 if self.along=='center' else self.offset+half
        if center<product['length']/2 or center+product['length']/2>span or pull and not 6<=self.inset<=other-6:
            raise ValueError('Ручка выходит за край фасада.')

    def bounds(self,left,bottom,width,height):
        product=DOOR_HARDWARE[self.article]
        vertical=self.edge in ('left','right')
        pull=product['family']=='ak700'
        span=height if vertical else width
        along=span/2 if self.along=='center' else self.offset+(product['pitch'] if pull else product['length'])/2
        if self.along=='end':along=span-along
        inset=self.inset if pull else 0
        x=left+(inset if self.edge=='left' else width-inset) if vertical else left+along
        y=bottom+along if vertical else bottom+(inset if self.edge=='bottom' else height-inset)
        half=product['length']/2
        cross=6 if pull else 16.9
        dx,dy=(cross,half) if vertical else (half,cross)
        return x-dx,x+dx,y-dy,y+dy

class FacadeProfile(StrictModel):
    article: Literal['118124','118129']
    edge: Literal['top','bottom']
    cutHeight: Literal[73,74] | None = Field(default=None,exclude_if=lambda v:v is None)

    @model_validator(mode='after')
    def mounting_edge(self):
        if self.article=='118124' and (self.edge!='top' or self.cutHeight is not None):
            raise ValueError('У верхнего профиля Gola L один монтажный вырез 27 × 57 мм.')
        return self

class InsetEdgeGrip(StrictModel):
    article: Literal['67698','75975']
    edge: Literal['left','right','top','bottom']
    grooveWidth: float | None = Field(default=None,gt=0,lt=18,strict=True,allow_inf_nan=False,exclude_if=lambda v:v is None)
    grooveDepth: float | None = Field(default=None,gt=0,strict=True,allow_inf_nan=False,exclude_if=lambda v:v is None)

    @model_validator(mode='after')
    def groove(self):
        if (self.grooveWidth is None) != (self.grooveDepth is None):
            raise ValueError('Для фрезеровки укажите и ширину, и глубину паза.')
        if self.grooveDepth is not None and self.grooveDepth < DOOR_HARDWARE[self.article]['shankDepth']:
            raise ValueError('Глубина паза меньше длины шипа выбранной ручки.')
        return self

    @property
    def edge_code(self):
        return {'right':'0111','left':'1011','bottom':'1101','top':'1110'}[self.edge]

    def check_size(self,width,height,hinge_side=None,*,finished=False):
        product=DOOR_HARDWARE[self.article]
        if self.edge==hinge_side:
            raise ValueError('На этом торце установлены петли. Выберите свободный торец фасада.')
        span,across=(height,width) if self.edge in ('left','right') else (width,height)
        if finished:
            across-=product['edgeRise']
        # The opposite edge retains its 2 mm PVC. The groove must end inside the board.
        if across<40 or span>product['usableLength'] or self.grooveDepth is not None and self.grooveDepth>=across-2:
            raise ValueError('Проверьте длину врезной ручки и глубину паза в плите фасада.')

FacadeFitting = InsetEdgeGrip | FacadeProfile | FacadeHandle

class FacadeDivision(StrictModel):
    section: int = Field(ge=0,le=3,strict=True)
    shelf: int = Field(ge=0,le=9,strict=True)
    scope: Literal['all','left','right']
    above: Swing
    below: Swing
    cutHeight: Literal[73,74] | None = Field(default=None,exclude_if=lambda v:v is None)
    gola: Literal[True] | None = Field(default=None,exclude_if=lambda v:v is None)

class OverlayFront(StrictModel):
    division: FacadeDivision | None = Field(default=None,exclude_if=lambda v:v is None)
    edgeProfiles: dict[LeafKey,Annotated[list[FacadeProfile],Field(min_length=1,max_length=2)]] | None = Field(default=None,max_length=5,exclude_if=lambda v:v is None)
    handles: dict[LeafKey,FacadeFitting] | None = Field(default=None,max_length=5,exclude_if=lambda v:v is None)
    topProfile: Literal[True] | None = Field(default=None,exclude_if=lambda v:v is None)
    swing: Literal['left','right','pair']
    offset: Literal[90,130]
    autoHinges: Literal[True] | None = Field(default=None,exclude_if=lambda v:v is None)
    massKg: float | None = Field(default=None,gt=0,le=22,exclude_if=lambda v:v is None)


class ShelfLevel(StrictModel):
    mode: Literal['floor','gap']
    mm: int = Field(ge=0, le=5000, strict=True)


DrawerMillimetres = Annotated[int, Field(strict=True)] | Annotated[float, Field(strict=True)]

class DrawerFace(StrictModel):
    handle: FacadeFitting | None = Field(default=None,exclude_if=lambda v:v is None)
    height: DrawerMillimetres | None = Field(ge=100,le=3000)
    width: float | None = Field(default=None,ge=40,le=1200,multiple_of=.5,exclude_if=lambda v:v is None)


class DrawerBank(StrictModel):
    layout: Literal['equal','manual'] | None = Field(default=None,exclude_if=lambda v:v is None)
    gap: DrawerMillimetres | None = Field(default=None,ge=0,le=3000,exclude_if=lambda v:v is None)
    coverFixing: Literal['cam_dowel','confirmat'] | None = Field(default=None,exclude_if=lambda v:v is None)
    shelvesBelow: int | None = Field(default=None,ge=0,le=10,strict=True,exclude_if=lambda v:v is None)
    bottomOffset: int | None = Field(default=None,ge=0,le=3000,strict=True,exclude_if=lambda v:v is None)
    kind: Literal['internal','external']
    faces: list[DrawerFace] = Field(min_length=1,max_length=24)
    height: int | None = Field(default=None,ge=103,le=3000,strict=True,exclude_if=lambda v:v is None)

    def span(self):
        count = sum(f.height is None for f in self.faces)
        if self.coverFixing and (self.kind != 'internal' or not self.layout):
            raise ValueError('Крепление верхней полки относится к внутренней нише шуфляд.')
        if self.layout:
            if self.height is None or self.gap is None or self.shelvesBelow is not None:
                raise ValueError('Проверьте границы ниши и зазор шуфляд.')
            if any(abs(v-round(v,3))>1e-8 for v in [self.gap,*[f.height for f in self.faces if f.height is not None]]):
                raise ValueError('Допустима точность до 0,001 мм.')
            available = round(self.height-1.5-(30 if self.coverFixing else 1.5)-self.gap*(len(self.faces)-1),3)
            if self.layout=='equal':
                valid=count==len(self.faces) and available>=100*count
            else:
                valid=count==1 and 100<=round(available-sum(f.height or 0 for f in self.faces),3)<=3000
            if not valid:
                raise ValueError('Высоты фасадов с заданными зазорами не помещаются в нише.')
            return self.height
        if self.gap is not None or any(f.height is not None and f.height%1 for f in self.faces):
            raise ValueError('Проверьте размеры свободного блока шуфляд.')
        fixed = sum(f.height or 0 for f in self.faces) + 3*len(self.faces)
        if count:
            if count != 1 or self.height is None or not 100 <= self.height-fixed <= 3000:
                raise ValueError('Проверьте общую высоту и фасад по остатку.')
            return self.height
        return fixed


Gap = Annotated[int, Field(ge=60, le=3000, strict=True)]

LockIndex = Annotated[int, Field(ge=0,le=10,strict=True)]

class ShelfColumn(StrictModel):
    locks: list[LockIndex] | None = Field(default=None,max_length=11,exclude_if=lambda v:v is None)
    choices: list[ShelfValue] | None = Field(default=None,max_length=10,exclude_if=lambda v:v is None)
    gaps: list[Gap | None] = Field(min_length=1,max_length=11)

class NicheSplit(StrictModel):
    section: int = Field(ge=0,le=3,strict=True)
    level: int = Field(ge=0,le=10,strict=True)
    kind: Literal['drawers','shelves']
    leftWidth: int | None = Field(default=None,ge=100,le=2200,strict=True,exclude_if=lambda v:v is None)
    edge: Literal['open','overlay'] | None = Field(default=None,exclude_if=lambda v:v is None)
    columns: list[ShelfColumn] | None = Field(default=None,min_length=2,max_length=2,exclude_if=lambda v:v is None)


ROD_CATALOGUE = json.loads((ASSETS/'wardrobe-rods.json').read_text())


class WardrobeRod(StrictModel):
    id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')
    article: str = Field(min_length=1,max_length=12)
    section: int = Field(ge=0,le=3,strict=True)
    level: LockIndex
    column: Literal[0,1] | None = Field(default=None,exclude_if=lambda v:v is None)
    opening: LockIndex | None = Field(default=None,exclude_if=lambda v:v is None)
    anchor: Literal['top','bottom']
    offset: int = Field(ge=0,le=3000,strict=True)
    fromBack: int | None = Field(default=None,ge=0,le=1200,strict=True,exclude_if=lambda v:v is None)


class CarcassDesign(CarcassSpec):
    rods: list[WardrobeRod] | None = Field(default=None,min_length=1,max_length=128,exclude_if=lambda v:v is None)
    gapLocks: list[Annotated[list[LockIndex],Field(max_length=11)]] | None = Field(default=None,max_length=4,exclude_if=lambda v:v is None)
    clearLayout: Literal[True] | None = Field(default=None,exclude_if=lambda v:v is None)
    drawerFixing: Literal['cam_dowel','confirmat'] | None = Field(default=None,exclude_if=lambda v:v is None)
    braceOffset: int | None = Field(default=None,ge=0,le=2900,strict=True,exclude_if=lambda v:v is None)
    topGaps: list[Gap | None] | None = Field(default=None,min_length=1,max_length=4,exclude_if=lambda v:v is None)
    nicheSplits: list[NicheSplit] | None = Field(default=None,min_length=1,max_length=44,exclude_if=lambda v:v is None)
    drawerBanks: list[DrawerBank | None] | None = Field(default=None,min_length=1,max_length=88,exclude_if=lambda v:v is None)
    shelfLevels: list[Annotated[list[ShelfLevel | None], Field(max_length=10)]] | None = Field(default=None, max_length=4, exclude_if=lambda v:v is None)
    front: OverlayFront | None = Field(default=None,exclude_if=lambda v:v is None)
    backThickness: Literal[16,18] | None = Field(default=None,exclude_if=lambda v:v is None)
    topFit: Literal['overlay'] | None = Field(default=None,exclude_if=lambda v:v is None)
    bottomFit: Literal['overlay','none'] | None = Field(default=None,exclude_if=lambda v:v is None)
    feet: WardrobeFeet | None = Field(default=None,exclude_if=lambda v:v is None)
    joints: CarcassJoints | None = Field(default=None,exclude_if=lambda v:v is None)
    dividerSetback: Literal[1] | None = Field(default=None,exclude_if=lambda v:v is None)
    dividerPositions: list[Annotated[int, Field(ge=0,le=2400,strict=True)]] | None = Field(default=None,min_length=1,max_length=3,exclude_if=lambda v:v is None)
    dividerJoints: list[CarcassJoints] | None = Field(default=None,min_length=1,max_length=3,exclude_if=lambda v:v is None)
    shelfChoices: list[Annotated[list[ShelfValue], Field(max_length=10)]] | None = Field(default=None,max_length=4,exclude_if=lambda v:v is None)

    sectionShelves: list[Annotated[int, Field(ge=0, le=10, strict=True)]] | None = Field(default=None, min_length=1, max_length=4)

    def clear_widths(self):
        inner=self.width-2*self.thickness
        if self.dividerPositions:
            starts=[0,*[x+self.thickness for x in self.dividerPositions]]
            return [end-start for start,end in zip(starts,[*self.dividerPositions,inner])]
        width,extra=divmod(inner-self.thickness*(self.sections-1),self.sections)
        return [width+int(i<extra) for i in range(self.sections)]

    def niche_bounds(self, section, inside):
        count=self.sectionShelves[section] if self.sectionShelves and section<len(self.sectionShelves) else self.shelves
        t=self.thickness
        choices=self.shelfChoices[section] if self.shelfChoices and section<len(self.shelfChoices) else ['board/95388']*count
        levels=self.shelfLevels[section] if self.shelfLevels and section<len(self.shelfLevels) else [None]*count
        if len(choices)!=count or len(levels)!=count or any(not shelf_valid(c,t) for c in choices):
            raise ValueError('Проверьте настройки полок выбранной секции.')
        sizes=[t if c.startswith('board/') else int(c.split('/')[0]) for c in choices]
        floor=self.elevation+(self.feet.height if self.feet else 0)
        ceiling=self.height-t
        # Match the positive-position rounding and anchored runs in shelf-levels.mjs.
        nearest=lambda value: int(value+.5)
        base=(100+(self.braceOffset or 0)+t if self.drawerBanks and niche_slot(section,0)<len(self.drawerBanks) and self.drawerBanks[niche_slot(section,0)] else 0) if self.bottomFit=='none' else t
        if not any(levels) and not self.clearLayout:
            free=ceiling-t-count*t
            if free<(count+1)*60: raise ValueError('Для полок недостаточно высоты.')
            ys=[t+nearest((i+1)*free/(count+1))+(i+1)*t-sizes[i] for i in range(count)]
        else:
            ys=[]; top=base; i=0
            while i<count:
                if levels[i] and levels[i].mode=='floor':
                    y=levels[i].mm-floor
                    if y-top<60 or y+sizes[i]>ceiling-60: raise ValueError('Проверьте высоту полки.')
                    ys.append(y); top=y+sizes[i]; i+=1
                    continue
                end=i
                while end<count and (not levels[end] or levels[end].mode!='floor'): end+=1
                boundary=levels[end].mm-floor if end<count else ceiling
                free=boundary-top-sum(sizes[i:end])-sum(v.mm for v in levels[i:end] if v)
                slots=1+sum(v is None for v in levels[i:end])
                tail=self.topGaps[section] if end==count and self.topGaps and section<len(self.topGaps) else None
                if tail is not None: free-=tail; slots-=1
                if slots==0 and free!=0: raise ValueError('Освободите один проём для остатка.')
                if free<60*slots: raise ValueError('Для заданных полок недостаточно высоты.')
                used=0
                while i<end:
                    gap=levels[i].mm if levels[i] else nearest((used+1)*free/slots)-nearest(used*free/slots)
                    if levels[i] is None: used+=1
                    if gap<60: raise ValueError('Проверьте проём под полкой.')
                    y=top+gap; ys.append(y); top=y+sizes[i]; i+=1
        if self.topGaps and section<len(self.topGaps) and self.topGaps[section] is not None and ceiling-(ys[-1]+sizes[-1] if ys else base)!=self.topGaps[section]:
            raise ValueError('Проверьте верхний проём.')
        if inside:
            return list(zip([base,*[y+h for y,h in zip(ys,sizes)]],[*ys,ceiling]))
        centres=[nearest(y+h/2) for y,h in zip(ys,sizes)]
        return list(zip([max(0,base-t),*centres],[*centres,self.height]))

    def facade_anchor(self):
        d=self.front.division
        if d.section>=self.sections:
            raise ValueError('Перегородка для фасадов отсутствует.')
        widths=self.clear_widths()
        middle=widths[0]+1.5*self.thickness if self.sections==2 else self.width/2
        left=middle if d.scope=='right' else 0
        right=middle if d.scope=='left' else self.width
        rooms=self.niche_bounds(d.section,True)
        if d.shelf>=len(rooms)-1: raise ValueError('Выберите перегородку для фасадов.')
        y=rooms[d.shelf][1]
        x=0
        divider_axes=[]
        for sec,w in enumerate(widths):
            start=x
            x+=w+self.thickness*(1+.5*(sec==0)+.5*(sec==self.sections-1))
            if sec<self.sections-1:divider_axes.append(x)
            if sec==d.section and (start>=right or x<=left):raise ValueError('Перегородка находится за границей выбранных дверей.')
            if start>=right or x<=left:continue
            row=self.shelfChoices[sec] if self.shelfChoices and sec<len(self.shelfChoices) else []
            if not any(high==y and i<len(row) and row[i] in ('board/confirmat','board/cam_dowel') for i,(_,high) in enumerate(self.niche_bounds(sec,True)[:-1])):
                raise ValueError('Закрепите перегородку на стыке фасадов в каждой секции.')
        if d.above==d.below=='open' and d.scope=='all' or d.scope!='all' and any(m not in (d.scope,'open') for m in (d.below,d.above)):
            raise ValueError('Проверьте створки по обе стороны перегородки.')
        if d.gola and ('open' in (d.below,d.above) or d.scope!='all' and middle not in divider_axes):
            raise ValueError('Для среднего профиля S нужны фасады и две опоры.')
        return left,right,y

    def validate_door_layout(self,zones,drawer_pulls):
        f=self.front;d=f.division;handles=f.handles or {}
        if self.recipe not in ('shelves','divided'):raise ValueError('Фасады задаются для шкафа.')
        def torc(key,edge):
            h=handles.get(key)
            return h and h.edge==edge and DOOR_HARDWARE.get(h.article,{}).get('family')=='monblan'
        middle=self.width/2
        if self.sections==2 and (d or any(not z[2] for z in zones)):middle=self.clear_widths()[0]+1.5*self.thickness
        def band(row,mode,a,b,low,high):
            if mode=='open':return []
            prefix='door-'+(row+'-' if row else '')
            if mode!='pair':return [[prefix+mode,a,b,low,high]]
            gap=4 if torc(prefix+'left','right') and torc(prefix+'right','left') else 3
            return [[prefix+'left',a,middle-gap/2,low,high],[prefix+'right',middle+gap/2,b,low,high]]
        roof=self.height-(30 if f.topProfile else 1.5)
        if d:
            left,right,y=self.facade_anchor();mid=y+self.thickness/2
            lo=band('lower',d.below,left+1.5,right-1.5,1.5,mid)
            hi=band('upper',d.above,left+1.5,right-1.5,mid,roof)
            for group,other,edge,opposite in ((lo,hi,'top','bottom'),(hi,lo,'bottom','top')):
                for leaf in group:
                    matches=[q for q in other if leaf[1]<q[2] and q[1]<leaf[2]]
                    both=torc(leaf[0],edge) and any(torc(q[0],opposite) for q in matches)
                    gap=15 if d.gola else (2 if both else 1.5) if matches else 1.5-self.thickness/2
                    if edge=='top':leaf[4]=mid-gap
                    else:leaf[3]=mid+gap
            leaves=lo+hi
            if d.scope!='all':
                side='right' if d.scope=='left' else 'left'
                tall=band('',side,1.5 if side=='left' else middle+1.5,middle-1.5 if side=='left' else self.width-1.5,1.5,roof)[0]
                if torc(tall[0],d.scope) and any(torc(p[0],side) for p in leaves):
                    if side=='left':tall[2]-=.5
                    else:tall[1]+=.5
                    for leaf in leaves:
                        if side=='left':leaf[1]+=.5
                        else:leaf[2]-=.5
                leaves.append(tall)
        else:leaves=band('',f.swing,1.5,self.width-1.5,1.5,roof)
        for key,left,right,bottom,top in leaves:
            for a,b,inside,end,start in zones:
                if not inside and a<right and b>left and start<top and end>bottom:bottom=max(bottom,end+1.5)
            h=top-bottom
            if h<=0:continue
            if right-left>600 or not (126 if f.autoHinges else 2*f.offset+64)<=h<=2400:
                raise ValueError('Проверьте размеры выбранной створки и отступ петель.')
            if key in handles:
                handle=handles[key]
                if isinstance(handle,InsetEdgeGrip):
                    handle.check_size(right-left,h,key.rsplit('-',1)[1],finished=True)
                    profiles=(f.edgeProfiles or {}).get(key) or []
                    shared=any(p.edge==handle.edge for p in profiles)
                    if (shared or f.topProfile and not key.startswith('door-lower-') and handle.edge=='top' or
                            d and d.gola and (key.startswith('door-lower-') and handle.edge=='top' or
                                              key.startswith('door-upper-') and handle.edge=='bottom')):
                        raise ValueError('Врезную ручку и профиль Gola на одном торце совместить нельзя.')
                if (f.topProfile and not key.startswith('door-lower-') and torc(key,'top') or
                        d and d.gola and (key.startswith('door-lower-') and torc(key,'top') or key.startswith('door-upper-') and torc(key,'bottom'))):
                    raise ValueError('Кромку с профилем Gola оставьте свободной от торцевой ручки.')
                if isinstance(handle,FacadeHandle):handle.check_size(right-left,h)
            if any(a<right and b>left and lo<top and hi>bottom for a,b,lo,hi in drawer_pulls):
                raise ValueError('Ручка внутренней шуфляды упирается в закрытую дверь.')

    def has_grip_at_shelf(self):
        front=self.front
        return bool(front and (front.edgeProfiles or front.division and front.division.gola or
                               any(isinstance(h,FacadeProfile) for h in (front.handles or {}).values())) or
                    any(isinstance(f.handle,FacadeProfile) for b in self.drawerBanks or [] if b for f in b.faces))

    def validate_rods(self,zones):
        if not self.rods:
            return
        if self.recipe not in ('shelves','divided') or len({r.id for r in self.rods})!=len(self.rods):
            raise ValueError('Проверьте штанги в шкафу.')
        banks=self.drawerBanks or []
        for r in self.rods:
            profile=ROD_CATALOGUE.get(r.article)
            if not profile or r.section>=self.sections:
                raise ValueError('Проверьте артикул и секцию штанги.')
            rooms=self.niche_bounds(r.section,True)
            slot=niche_slot(r.section,r.level)
            old=banks[niche_slot(r.section,0)] if len(banks)>niche_slot(r.section,0) else None
            if r.level>=len(rooms) or (slot<len(banks) and banks[slot]) or (old and not old.layout):
                raise ValueError('Для штанги нужна свободная ниша.')
            low,high=rooms[r.level]
            zone=zones.get(slot)
            if zone:
                if zone.kind!='shelves' or r.column is None or r.opening is None:
                    raise ValueError('Укажите проём перегородки для штанги.')
                col=zone.columns[r.column]
                if r.opening>=len(col.gaps):
                    raise ValueError('Проверьте проём штанги.')
                choices=col.choices or ['board/95388']*(len(col.gaps)-1)
                boards=sum(self.thickness if c.startswith('board/') else int(c.split('/')[0]) for c in choices)
                remaining=high-low-boards-sum(v or 0 for v in col.gaps)
                free=col.gaps.count(None)
                height=col.gaps[r.opening]
                if height is None:
                    i=col.gaps[:r.opening].count(None)
                    height=int((i+1)*remaining/free+.5)-int(i*remaining/free+.5)
            else:
                if r.column is not None or r.opening is not None:
                    raise ValueError('Для штанги указан отсутствующий проём.')
                height=high-low
            # A grip can raise the upper boundary by at most one extrusion height.
            # The saved scene below checks the actual room between the installed panels.
            if self.has_grip_at_shelf():
                height+=73
            y=height-r.offset if r.anchor=='top' else r.offset
            min_y,max_y,min_z,max_z=profile['bounds']
            back=(self.backThickness or 0)+(self.thickness if self.bottomFit=='none' and self.sections>1 else 0)
            front=self.shelfSetback if zone else (self.dividerSetback or 1) if self.sections>1 else 0
            usable=self.depth-back-front
            z=usable/2 if r.fromBack is None else r.fromBack
            if y+min_y<0 or y+max_y>height or z+min_z<0 or z+max_z>usable:
                raise ValueError('Держатель штанги выходит за внутренние границы ниши.')

    @model_validator(mode='after')
    def section_layout(self):
        if self.braceOffset is not None and (self.bottomFit!='none' or self.braceOffset+100>self.height-self.thickness):
            raise ValueError('Проверьте положение заднего ребра.')
        if self.gapLocks and (len(self.gapLocks)!=self.sections or not self.sectionShelves or any(i>self.sectionShelves[j] for j,row in enumerate(self.gapLocks) for i in row)):
            raise ValueError('Проверьте закреплённые проёмы секции.')
        if self.topGaps and len(self.topGaps)!=self.sections:
            raise ValueError('Проверьте верхние проёмы секций.')
        if self.sectionShelves and len(self.sectionShelves)!=self.sections:
            raise ValueError('Проверьте число секций.')
        if self.bottomFit=='none' and self.feet and (self.feet.article!='118779' or self.width>800 and self.width/2 not in [
                self.thickness+x+self.thickness/2 for x in (self.dividerPositions or [sum(self.clear_widths()[:i+1])+i*self.thickness for i in range(self.sections-1)])]):
            raise ValueError('Для выбранных опор требуется дно.')
        zones_by_slot={}
        widths=self.clear_widths()
        for zone in self.nicheSplits or []:
            slot=niche_slot(zone.section,zone.level)
            right_slot=niche_slot(zone.section,zone.level,1)
            if slot in zones_by_slot or zone.section>=self.sections or not self.sectionShelves or zone.level>self.sectionShelves[zone.section]:
                raise ValueError('Неверная или повторяющаяся перегородка.')
            zones_by_slot[slot]=zone
            left=zone.leftWidth or (widths[zone.section]-18+1)//2
            if min(left,widths[zone.section]-18-left)<100: raise ValueError('Проверьте чистые ширины ниш.')
            low,high=self.niche_bounds(zone.section,True)[zone.level]
            if zone.kind=='shelves':
                if not zone.columns or zone.edge or (self.drawerBanks and slot<len(self.drawerBanks) and self.drawerBanks[slot]):
                    raise ValueError('Проверьте полки в разделённой нише.')
                for col in zone.columns:
                    choices=col.choices if col.choices is not None else ['board/95388']*(len(col.gaps)-1)
                    if len(choices)!=len(col.gaps)-1 or any(not shelf_valid(v,self.thickness) for v in choices):
                        raise ValueError('Проверьте материал полок колонки.')
                    if any(i>=len(col.gaps) for i in col.locks or []):raise ValueError('Проверьте закреплённые проёмы колонки.')
                    total=sum(self.thickness if v.startswith('board/') else int(v.split('/')[0]) for v in choices)
                    free=high-low-total-sum(g or 0 for g in col.gaps)
                    n=col.gaps.count(None)
                    if free<60*n or not n and free!=0:raise ValueError('Проверьте чистую высоту полок в колонке.')
            elif zone.columns or not self.drawerBanks or len(self.drawerBanks)<=right_slot or not self.drawerBanks[slot] or not self.drawerBanks[right_slot]:
                raise ValueError('Для общей стойки нужны два блока шуфляд.')
        if self.clearLayout:
            for section in range(self.sections):self.niche_bounds(section,True)
        self.validate_rods(zones_by_slot)
        zones=[]
        drawer_pulls=[]
        if self.drawerBanks:
            if self.recipe not in ('shelves','divided') or len(self.drawerBanks)<self.sections:
                raise ValueError('Проверьте секции с шуфлядами.')
            for slot,bank in enumerate(self.drawerBanks):
                if bank is None: continue
                i,level,right_bank=niche_address(slot)
                if i>=self.sections or i>=len(widths):
                    raise ValueError('Ниша с шуфлядами выходит за секции шкафа.')
                w=widths[i]
                start=sum(widths[:i])+(i+1)*self.thickness
                end=start+w
                if bank:
                    zone=zones_by_slot.get(niche_slot(i,level))
                    shared=zone is not None and zone.kind=='drawers'
                    if right_bank and not shared:raise ValueError('Для правого блока нужна перегородка.')
                    if shared:
                        left_width=zone.leftWidth or (w-18+1)//2
                        if right_bank:start+=left_width+18
                        else:end=start+left_width
                        w=end-start
                    if level and (not bank.layout or self.drawerBanks[niche_slot(i,0)] and not self.drawerBanks[niche_slot(i,0)].layout):
                        raise ValueError('Свободное положение блока несовместимо с дополнительной нишей.')
                    if bank.layout:
                        bounds=self.niche_bounds(i,bank.kind=='internal')
                        if level>=len(bounds):
                            raise ValueError('Выбранная ниша отсутствует.')
                        if bank.coverFixing:
                            row=self.shelfChoices[i] if self.shelfChoices and i<len(self.shelfChoices) else []
                            if level>=len(row) or row[level]!='board/'+bank.coverFixing:
                                raise ValueError('Над шуфлядами нужна закреплённая полка с выбранной присадкой.')
                        low,high=bounds[level]
                        if bank.height!=high-low or (bank.bottomOffset or 0)!=low-(self.thickness if bank.kind=='internal' else 0):
                            raise ValueError('Размеры блока не совпадают с геометрией ниши.')
                    if (bank.shelvesBelow or 0)>(self.sectionShelves[i] if self.sectionShelves and i<len(self.sectionShelves) else self.shelves):
                        raise ValueError('Полок под блоком больше, чем полок в секции.')
                    inside=bank.kind=='internal'
                    swing=self.front.swing if self.front else None
                    left_swing=right_swing=swing
                    if self.front and self.front.division:
                        d=self.front.division
                        y=self.facade_anchor()[2]
                        mode=d.above if (self.thickness if inside else 0)+(bank.bottomOffset or 0)>=y else d.below
                        if d.scope in ('all','left'):left_swing=mode
                        if d.scope in ('all','right'):right_swing=mode
                    left=18 if inside and not right_bank and i==0 and left_swing in ('left','pair') else 0
                    right=18 if inside and (not shared or right_bank) and i==self.sections-1 and right_swing in ('right','pair') else 0
                    max_width=(w-left-right if inside else w+self.thickness*(1+(i==0)/2+(i==self.sections-1)/2))-3
                    if shared:
                        outer=0 if inside else self.thickness*(1 if (not right_bank and i==0 or right_bank and i==self.sections-1) else .5)
                        max_width=w-left-right+outer+(9 if zone.edge=='overlay' else 0)-3
                    if self.drawerFixing and bank.layout:
                        row=self.shelfChoices[i] if self.shelfChoices and i<len(self.shelfChoices) else []
                        for index in [level,*([level-1] if level else [])]:
                            if index>=len(row) or row[index]!='board/'+self.drawerFixing:raise ValueError('Закрепите ограничивающие полки шуфляд.')
                    depth=self.depth-(self.backThickness or 0)-(21 if inside else 0)
                    top=(bank.bottomOffset or 0)+bank.span()+(self.thickness if inside else 0)
                    if top>self.height-(self.thickness if inside else 0) or w-left-right<163 or depth<255:
                        raise ValueError(f'Секция {i+1}: блоку AKS недостаточно места.')
                    if any(f.width is not None and f.width>max_width for f in bank.faces):
                        raise ValueError(f'Секция {i+1}: фасад шире проёма.')
                    if any(face.handle for face in bank.faces):
                        total=bank.span()
                        if bank.layout:
                            remaining=round(total-1.5-(30 if bank.coverFixing else 1.5)-(bank.gap or 0)*(len(bank.faces)-1),3)
                            automatic=(int(remaining*1000/len(bank.faces)+1e-6)/1000 if bank.layout=='equal' else round(remaining-sum(face.height or 0 for face in bank.faces),3))
                        else:
                            automatic=total-3*len(bank.faces)-sum(face.height or 0 for face in bank.faces)
                        heights=[face.height if face.height is not None else automatic for face in bank.faces]
                        rounding=round(remaining-sum(heights),3) if bank.coverFixing else 0
                        y=top-total+1.5+rounding
                        for face,height in zip(bank.faces,heights):
                            if isinstance(face.handle,InsetEdgeGrip):
                                face.handle.check_size(face.width or max_width,height,finished=True)
                            if isinstance(face.handle,FacadeHandle):
                                face_width=face.width or max_width
                                face.handle.check_size(face_width,height)
                                if inside and self.front:
                                    cx=(start+left+end-right)/2
                                    if shared:cx+=(9 if zone.edge=='overlay' else 0)*(-.5 if right_bank else .5)
                                    drawer_pulls.append(face.handle.bounds(cx-face_width/2,y,face_width,height))
                            y+=height+(bank.gap if bank.layout else 3)
                    zones.append((start,end,inside,top,top-bank.span()))
            if self.front and not self.front.division and any(not z[2] for z in zones):
                pair=self.front.swing=='pair'
                seam=(self.thickness*1.5+widths[0] if pair and self.sections==2 else self.width/2)
                spans=[(1.5,seam-1.5),(seam+1.5,self.width-1.5)] if pair else [(1.5,self.width-1.5)]
                for left,right in spans:
                    covered=[z for z in zones if min(right,z[1])>max(left,z[0])]
                    bottom=max((z[3] for z in covered if not z[2]),default=0)
                    height=self.height-3-bottom
                    if bottom and any(z[2] and z[4]<bottom for z in covered):
                        raise ValueError('Разделите створки по секциям шуфляд.')
                    if height>0 and (right-left>600 or not (126 if self.front.autoHinges else 2*self.front.offset+64)<=height<=2400):
                        raise ValueError('Проверьте размеры створки над блоком шуфляд.')
        if self.front and (self.front.division or self.front.topProfile or self.front.handles or drawer_pulls):
            self.validate_door_layout(zones,drawer_pulls)
        elif self.front and not any(b and b.kind=='external' for b in self.drawerBanks or []):
            count = 2 if self.front.swing=='pair' else 1
            width = (self.width-3*count)/count
            if self.recipe not in ('shelves','divided') or width>600 or self.height-3>2400 or self.height-3<(126 if self.front.autoHinges else 2*self.front.offset+64):
                raise ValueError('Проверьте габариты створки и отступ петель.')
        if self.backThickness and (not self.back or self.recipe not in ('shelves','divided') or (self.backThickness>=16 and self.thickness<16)):
            raise ValueError('Проверьте конструкцию и толщины панелей вкладной задней стенки.')
        if (self.feet or self.topFit or self.bottomFit) and self.recipe not in ('shelves','divided'):
            raise ValueError('Опоры и конструкция панелей задаются для шкафа.')
        if self.feet:
            if self.depth-self.feet.front-self.feet.rear<20:
                raise ValueError('Не помещаются два ряда опор.')
            if self.feet.article in PLINTH_FEET:
                if (self.feet.front<30+self.thickness or self.feet.rear<30 or self.depth-self.feet.front-self.feet.rear<60 or
                    (self.bottomFit and (self.feet.left or self.feet.right))):
                    raise ValueError('Проверьте отступы, дно и примыкания цоколя.')
            elif self.feet.article=='118779' and (self.bottomFit or inner_foot_pairs(self.width,self.sections,self.feet.layout)) and self.thickness<=16:
                raise ValueError('Дно должно быть толще 16 мм для выбранной муфты.')
        if self.joints:
            if self.thickness != 18 or self.recipe not in ('shelves','divided'):
                raise ValueError('Для крепежа нужны вкладные детали 18 мм.')
            if 'cam_dowel' in (self.joints.top,self.joints.bottom) and self.depth < 276:
                raise ValueError('Глубина для эксцентриков со шкантами от 276 мм.')
        if self.dividerSetback is not None and (self.shelfSetback!=1 or self.recipe not in ('shelves','divided')):
            raise ValueError('Отступ полки и внутренней стойки шкафа равен 1 мм.')
        if self.dividerPositions is not None:
            if self.recipe!='divided' or len(self.dividerPositions)!=self.sections-1:
                raise ValueError('Задайте положение каждой внутренней стойки.')
            start=0
            for end in [*self.dividerPositions,self.width-2*self.thickness]:
                if end-start-2*self.shelfGap < 100:
                    raise ValueError('Секция слишком узкая. Измените положение стойки.')
                start=end+self.thickness
        if self.dividerJoints is not None:
            if self.thickness != 18 or self.recipe != 'divided' or len(self.dividerJoints) != self.sections - 1:
                raise ValueError('Проверьте количество и толщину внутренних стоек.')
            if self.depth-(self.backThickness or 0)-(self.dividerSetback or 0) < 216 and any('cam_dowel' in (row.top,row.bottom) for row in self.dividerJoints):
                raise ValueError('Для эксцентрика со шкантом в стойке нужна глубина от 216 мм.')
        if self.shelfLevels is not None:
            if not self.sectionShelves or [len(row) for row in self.shelfLevels] != self.sectionShelves:
                raise ValueError('Проверьте число высот полок по секциям.')
            for row in self.shelfLevels:
                if any(level and level.mode=='gap' and level.mm<60 for level in row):
                    raise ValueError('Чистый проём под полкой должен быть от 60 мм.')
        if self.shelfChoices is not None:
            if not self.sectionShelves or [len(row) for row in self.shelfChoices] != self.sectionShelves:
                raise ValueError('Проверьте выбор полок по секциям.')
            if any(not shelf_valid(value,self.thickness) for row in self.shelfChoices for value in row):
                raise ValueError('Держатель не подходит к полке.')
            if self.thickness != 18:
                for section,row in enumerate(self.shelfChoices):
                    for level,value in enumerate(row):
                        slot=niche_slot(section,level)
                        bank=(self.drawerBanks or [])[slot] if slot<len(self.drawerBanks or []) else None
                        if value in ('board/cam_dowel','board/confirmat') and not (bank and bank.coverFixing or self.drawerFixing and any(k<len(self.drawerBanks or []) and self.drawerBanks[k] and self.drawerBanks[k].layout for k in (slot,niche_slot(section,level+1)))):
                            raise ValueError('Для этой толщины фиксированный крепёж задаётся в нише шуфляд.')
            depth = self.depth - self.shelfSetback - (self.backThickness or 0)
            for row in self.shelfChoices:
                if ('board/cam_dowel' in row and depth < 216) or ('board/confirmat' in row and depth < 152):
                    raise ValueError('Для крепежа недостаточно глубины самой полки.')
        if self.sectionShelves is not None:
            if self.recipe not in ('shelves', 'divided') or len(self.sectionShelves) != self.sections or max(self.sectionShelves) != self.shelves:
                raise ValueError('Invalid section layout')
        return self


class AssistantCarcass(StrictModel):
    name: str | None = Field(default=None,min_length=1,max_length=120,exclude_if=lambda v:v is None)
    group_id: UUID
    spec: CarcassDesign
    position: CarcassPosition


class AssistantPlan(StrictModel):
    action: Literal['create', 'update', 'clarify']
    message: str = Field(min_length=1, max_length=1200)
    spec: CarcassSpec | None

    @model_validator(mode='after')
    def complete(self):
        if (self.action == 'clarify') != (self.spec is None):
            raise ValueError('Incomplete plan')
        return self
