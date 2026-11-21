"""Authenticated user-owned 3D furniture projects. No production side effects."""
from typing import Literal,Annotated
from uuid import UUID,uuid4,uuid5
import base64,binascii,hashlib,secrets,json,logging,re
from fastapi.encoders import jsonable_encoder
from pydantic import Field,model_validator
from fastapi import APIRouter,Request,Response
from psycopg.types.json import Jsonb
from .auth_api import StrictModel
from .assistant_model import AssistantCarcass, Z1_HINGES, DOOR_HARDWARE, InsetEdgeGrip, PanelCutList, ShelfValue, shelf_valid
from .db import transaction
from .security import identity,error
from .domain_api import require,create_draft
from .events import record_event
from . import catalogue
from .three_d_document import render as render_spec
from .sales_album import render as render_sales, image_bytes as sales_image
from . import sales_render, sales_render_store, kitchen_album, customer_hardware, customer_hardware_pdf
from .material_visuals import visual_metadata
from .three_d_corner import corner_variant
from .three_d_tall import tall_variant, GOLA_VARIANTS as TALL_GOLA_VARIANTS
from .three_d_drawers import drawer_variant, drawer_configuration, BY_ID as DRAWER_BY_ID
from .three_d_vitrine import vitrine_variant, BY_ID as VITRINE_BY_ID
from .three_d_modern import modern_variant, modern_error, BY_ID as MODERN_BY_ID
from .three_d_upper import upper_variant, upper_error, BY_ID as UPPER_BY_ID
from .three_d_accessories import dishwasher, dishwasher_error, BY_ID as DISHWASHER_BY_ID
from .three_d_gola import gola_variant, gola_error, BY_ID as GOLA_BY_ID
from .three_d_room import Room
from .three_d_cargo import cargo_variant, cargo_error, BY_ID as CARGO_BY_ID
from .three_d_wall_special import wall_special_variant, wall_special_error, BY_ID as WALL_SPECIAL_BY_ID
from .three_d_open_tall import open_tall_variant, open_tall_error, BY_ID as OPEN_TALL_BY_ID
from .three_d_pullout_dryers import dryer_variant, dryer_error, BY_ID as PULLOUT_DRYER_BY_ID

class ShelfState(StrictModel):
    id: str=Field(min_length=1,max_length=80)
    enabled: bool=True
    offset_mm: float=Field(ge=0,le=3000,multiple_of=0.5)
    thickness: int=Field(default=18,ge=3,le=60)
    width_clearance: int=Field(default=36,ge=0,le=300)
    depth_clearance: int=Field(default=1,ge=0,le=300)
    source_component: str|None=Field(default=None,max_length=500)
    material_variant_id: UUID|None=None

class ApplianceReference(StrictModel):
    mode: Literal['standard','model']='standard'
    manufacturer: str=Field(default='',max_length=160)
    model: str=Field(default='',max_length=200)
    article: str=Field(default='',max_length=200)
    documentation_url: str=Field(default='',max_length=500)

class ApplianceDetails(StrictModel):
    oven: ApplianceReference=Field(default_factory=ApplianceReference)
    microwave: ApplianceReference=Field(default_factory=ApplianceReference)
    remarks: str=Field(default='',max_length=1500)

class WorktopFixture(StrictModel):
    kind: Literal['sink','hob']
    width: int=Field(ge=300,le=1000,strict=True)
    depth: int=Field(ge=300,le=700,strict=True)
    offset_x: int=Field(default=0,ge=-1500,le=1500,strict=True)
    front_offset: int=Field(default=50,ge=20,le=880,strict=True)
    finish: Literal['steel','black']='steel'
    faucet: Literal['arch','angled','compact']='arch'
    faucet_finish: Literal['chrome','black']='chrome'
    hood: Literal['none','chimney']='none'
    hood_gap: int=Field(default=650,ge=400,le=1200,strict=True)
    hood_width: int=Field(default=600,ge=400,le=1200,strict=True)

    @model_validator(mode='after')
    def hood_requires_hob(self):
        if self.hood!='none' and self.kind!='hob':
            raise ValueError('Вытяжка доступна над варочной панелью.')
        return self

class BlankHook(StrictModel):
    count: int=Field(default=1,ge=1,le=4,strict=True)
    article: Literal['68416']
    face: Literal['positive','negative']
    along_mm: float|None=Field(default=None,ge=0,le=3000,multiple_of=0.5,allow_inf_nan=False)
    height_mm: float|None=Field(default=None,ge=0,le=3000,multiple_of=0.5,allow_inf_nan=False)

class BlankBinding(StrictModel):
    gola_flush: Literal[True]|None=Field(default=None,exclude_if=lambda v:v is None)
    mounting: Literal['sekura-95388','none']|None=None
    left_id: str=Field(min_length=1,max_length=80)
    right_id: str=Field(min_length=1,max_length=80)
    gap_left_mm: int=Field(default=0,ge=0,le=100,strict=True)
    gap_right_mm: int=Field(default=0,ge=0,le=100,strict=True)
    depth_offset_mm: float=Field(default=0,ge=-1200,le=1200,multiple_of=0.25,allow_inf_nan=False)

# Bounds include the existing cargo-150 and horizontal-250 catalogue templates.
class GolaCutLength(StrictModel):
    article: Literal['118124','118129']
    length_mm: float = Field(ge=94,le=2400,multiple_of=0.5,allow_inf_nan=False)

class FurnitureItem(StrictModel):
    item_id: str=Field(min_length=1,max_length=80)
    module_type: Literal['chest','base_cabinet','wall_cabinet','tall_cabinet','wardrobe','vanity','blank']='chest'
    template_id: str|None=Field(default=None,max_length=80)
    bazis_id: str|None=Field(default=None,max_length=80)
    bazis_file: str|None=Field(default=None,max_length=240)
    bazis_sha256: str|None=Field(default=None,min_length=64,max_length=64)
    bazis_resize: bool=False
    name: str=Field(min_length=1,max_length=160)
    x: float=Field(default=0,ge=-12000,le=12000,multiple_of=0.25)
    z: float=Field(default=0,ge=-12000,le=12000,multiple_of=0.25)
    upper_mount_offset_mm: int|None=Field(default=None,ge=-5000,le=5000,strict=True,exclude_if=lambda v:v is None)
    elevation_mm: Annotated[int,Field(strict=True)]|Annotated[float,Field(strict=True)]|None=Field(default=None,ge=0,le=5000)
    rotation: Literal[0,90,180,270]=0
    width: int|float=Field(ge=1,le=3000,multiple_of=0.5)
    height: int|float=Field(ge=1,le=3000)
    body_height: int|float|None=Field(default=None,ge=1,le=3000)
    base_height: int|None=Field(default=None,ge=0,le=300)
    worktop_thickness: int|None=Field(default=None,ge=0,le=100)
    legHeightMm: Literal[80,100,150]|None=None
    rearServiceGapMm: float|None=Field(default=None,ge=-1200,le=1200,multiple_of=0.5,allow_inf_nan=False)
    plinthMaterialId: UUID|None=None
    countertopDepthMm: int|None=Field(default=None,ge=300,le=1200)
    countertopStockLengthMm: Literal[4100]|None=None
    countertopThicknessMm: int|None=Field(default=None,ge=12,le=100)
    countertopMaterialId: UUID|None=None
    countertopEnabled: bool=True
    countertopJoint: Literal['standard','euro']='standard'
    depth: int|float=Field(ge=1,le=1200,multiple_of=0.5,allow_inf_nan=False)
    layout: Literal['drawers','doors','combo','niche']='doors'
    drawers: int=Field(default=2,ge=0,le=8)
    base: Literal['plinth','legs','wall']='plinth'
    handles: Literal['handles','handleless']='handles'
    body_variant_id: UUID|None=None
    front_variant_id: UUID|None=None
    back_variant_id: UUID|None=None
    # Individual rectangular board; no inferred cabinet or fabricated BAZIS geometry.
    blank_length_mm: int|float|None=Field(default=None,ge=40,le=3000)
    blank_width_mm: int|float|None=Field(default=None,ge=22,le=3000)
    blank_front_frame: Literal['Z1']|None=Field(default=None,exclude_if=lambda v:v is None)
    blank_thickness_mm: int|float|None=Field(default=None,ge=3,le=40)
    blank_edge_thickness_mm: float=Field(default=1,ge=0.4,le=3,allow_inf_nan=False)
    blank_axis: Literal['horizontal','side','back','front']|None=None
    blank_edge_code: str|None=Field(default=None,pattern=r'^[01]{4}$')
    blank_machining: PanelCutList|None=Field(default=None,exclude_if=lambda v:v is None)
    blank_edge_pull: InsetEdgeGrip|None=Field(default=None,exclude_if=lambda v:v is None)
    blank_binding: BlankBinding|None=None
    blank_hook: BlankHook|None=None
    blank_shelf: ShelfValue|None=None
    blank_gola_runs: list[GolaCutLength]|None=Field(default=None,min_length=1,max_length=4096,exclude_if=lambda v:v is None)
    blank_plinth_run: list[UUID]|None=Field(default=None,min_length=2,max_length=100,exclude_if=lambda v:v is None)
    assistant_carcass: AssistantCarcass|None=None
    part_materials: dict[str,UUID]=Field(default_factory=dict,max_length=32)
    shelves: list[ShelfState]=Field(default_factory=list,max_length=16)
    doors_open: bool=False
    glass_shelf_count: int|None=Field(default=None,ge=0,le=8,strict=True)
    upper_shelf_count: int|None=Field(default=None,ge=0,le=8,strict=True)
    production_note: str=Field(default='',max_length=2000)
    appliance_details: ApplianceDetails|None=None
    worktop_fixture: WorktopFixture|None=None

    @model_validator(mode='after')
    def separated_heights(self):
        group=self.assistant_carcass
        key=self.item_id.removeprefix(str(group.group_id)+':') if group else ''
        trim=re.fullmatch(r'trim-(left|right)(?:-([2-9]|[1-9][0-9]+))?-(face|return|end)',key)
        trim_side=getattr(group.spec.surround,trim[1],None) if trim and group and self.item_id.startswith(str(group.group_id)+':') else None
        split_trim=bool(trim_side and trim_side.split and self.module_type=='blank' and self.blank_thickness_mm==18 and (
            trim_side.kind=='filler' and (trim[3],self.blank_axis) in (('face','back'),('return','side')) or
            trim_side.kind=='end' and (trim[3],self.blank_axis)==('end','side')))
        if trim and (trim[2] or trim_side and trim_side.split) and not split_trim:
            raise ValueError('Часть боковой планки должна соответствовать делению выбранной стороны.')
        # In the back orientation the board's local width is its installed vertical length.
        # A custom start, height or finished external drawer can put either end on a thousandth.
        split_scale=1000
        def on_grid(value,scale):
            scaled=(value or 0)*scale
            return abs(scaled-round(scaled))<1e-6 if scale==1000 else scaled%1==0
        if not on_grid(self.blank_width_mm,split_scale if split_trim and self.blank_axis=='back' else 2):
            raise ValueError('Проверьте точность ширины заготовки.')
        if split_trim and (not 100<=self.height<=2780 or any(not on_grid(v,split_scale) for v in (self.height,self.body_height,self.blank_length_mm,self.elevation_mm))):
            raise ValueError('Проверьте точность раскроя и высоту каждой части боковой планки от 100 до 2780 мм.')
        mount=group.spec.backMount if group else None
        preset=bool(mount and mount.layout)
        back_key=key.removeprefix('mezz-') if group and group.spec.surround and group.spec.surround.upper else key
        hdf=bool(preset and back_key=='back' and self.blank_axis=='back')
        if self.blank_binding and not preset and self.blank_binding.depth_offset_mm%0.5:
            raise ValueError('Для этой привязки допустим шаг 0,5 мм.')
        face=re.fullmatch(r'drawer-(\d+)-(\d+)-face',key)
        banks=group.spec.drawerBanks if group and face else None
        slot,index=map(int,face.groups()) if face else (-1,-1)
        handles = (group.spec.front.handles or {}).values() if group and group.spec.front else ()
        individual = bool(group) and (bool(group.spec.front and group.spec.front.edgeProfiles) or any(h.article in ('118124','118129') for h in handles) or
                    any(f.handle and f.handle.article in ('118124','118129') for b in group.spec.drawerBanks or [] if b for f in b.faces))
        if self.blank_gola_runs and (key!='top' or not individual or self.blank_axis!='horizontal' or any(r.length_mm>group.spec.width for r in self.blank_gola_runs)):
            raise ValueError('Проверьте длины профилей Gola этого шкафа.')
        if individual and key=='top' and not self.blank_gola_runs:raise ValueError('В раскрое шкафа отсутствует выбранный профиль Gola.')
        if self.blank_machining:
            if self.module_type!='blank' or (self.blank_thickness_mm or 0)<10 or not self.blank_length_mm or not self.blank_width_mm or self.blank_shelf and not self.blank_shelf.startswith('board/'):
                raise ValueError('Обработка требует плиты с заданными размерами.')
            for op in self.blank_machining:
                op.check_board(self.blank_width_mm,self.blank_length_mm,self.blank_thickness_mm)
        if group and (group.spec.lighting or any(c.lightSystem for c in self.blank_machining or ())):
            lines=(group.spec.lighting or {}).get(key,[])
            lit=[c for c in self.blank_machining or () if c.lightSystem]
            if len(lines)!=len(lit):
                raise ValueError('Количество пазов подсветки должно совпадать с анкетой шкафа.')
            for setting,cut in zip(lines,lit):
                edge='x0' if setting.anchor=='back' else 'x1'
                offset=(self.blank_width_mm-cut.width)/2 if setting.anchor=='center' else setting.offset
                if (setting.system!=cut.lightSystem or setting.face!=cut.face or cut.edge!=edge or
                    cut.offset is None or abs(cut.offset-offset)>.00001):
                    raise ValueError('Положение паза подсветки должно совпадать с анкетой шкафа.')
        grip=self.blank_edge_pull
        required_edges=set()
        if self.module_type=='blank' and self.blank_edge_code is not None:
            if self.blank_axis=='horizontal' and self.blank_binding:
                holder = self.blank_shelf or self.blank_binding.mounting
                if holder is None and not re.search(r':(bottom|top|rail-[^:]+)$',self.item_id):
                    holder='sekura-95388'
                if holder=='sekura-95388' or holder and re.fullmatch(r'board/\d+',holder):
                    required_edges.update(range(4))
            if grip:
                required_edges.add({'right':0,'left':1,'bottom':2,'top':3}[grip.edge])
            for op in self.blank_machining or ():
                if op.kind in ('groove','rabbet'):
                    required_edges.add({'x1':0,'x0':1,'y0':2,'y1':3}[op.edge])
            self.blank_edge_code=''.join('1' if i in required_edges else bit for i,bit in enumerate(self.blank_edge_code))
        drawer_face=banks[slot].faces[index] if banks and slot<len(banks) and banks[slot] and index<len(banks[slot].faces) else None
        saved_handle=drawer_face.handle if drawer_face else (group.spec.front.handles or {}).get(key) if group and group.spec.front else None
        if group and (grip is not None or isinstance(saved_handle,InsetEdgeGrip)) and (
                not self.item_id.startswith(str(group.group_id)+':') or grip!=saved_handle):
            raise ValueError('Врезная ручка детали должна совпадать с ручкой этого фасада в анкете.')
        if grip and self.blank_axis!='front':
            raise ValueError('Врезная ручка устанавливается в торец фасада.')
        fitted=bool(self.blank_axis=='front' and drawer_face and (banks[slot].layout or individual or grip) or grip and not group)
        vertical=[self.height,self.body_height or 0,self.blank_length_mm or 0,self.elevation_mm or 0]
        if fitted and any(abs(v-round(v,3))>1e-8 for v in vertical):
            raise ValueError('Для фасада шуфляды допустима точность до 0,001 мм.')
        door=bool(self.blank_axis=='front' and group and group.spec.front and re.fullmatch(r'door-(?:(?:lower|upper)-)?(?:left|right)',key))
        if door and any(v*2%1 for v in vertical):raise ValueError('Шаг размеров створки 0,5 мм.')
        post=bool(self.blank_axis=='side' and group and re.fullmatch(r'niche-\d+-\d+-divider',key))
        flush=bool(self.blank_binding and self.blank_binding.gola_flush)
        if flush and (not key.startswith('shelf-') or not (individual or group.spec.front and (group.spec.front.topProfile or group.spec.front.division and group.spec.front.division.gola))):
            raise ValueError('Вынос полки относится к выбранному профилю Gola.')
        if post and any(v*2%1 for v in vertical):raise ValueError('Шаг размеров стойки 0,5 мм.')
        if hdf and any(v*2%1 for v in vertical):
            raise ValueError('Шаг размеров задней стенки 0,5 мм.')
        if not fitted and not door and not post and not hdf and not split_trim and (self.height%1 or (self.body_height or 0)%1 or (self.blank_length_mm or 0)%1 or ((self.elevation_mm or 0)*2)%1):
            raise ValueError('Проверьте точность размеров детали.')
        if self.upper_mount_offset_mm is not None and self.module_type!='wall_cabinet':
            raise ValueError('Отметка навески относится к верхнему шкафу.')
        upper=group.spec.surround.upper if group and group.spec.surround else None
        setup=(group.spec.front.hinges or {}).get(key) if door else None
        framed=bool(setup and setup.article in Z1_HINGES or upper and upper.frame and re.fullmatch(r'mezz-door-(left|right)',key))
        if bool(self.blank_front_frame)!=framed or self.blank_front_frame and (
                self.module_type!='blank' or self.blank_axis!='front' or self.blank_thickness_mm!=20.5 or self.blank_edge_code!='0000'
                or self.body_variant_id or self.blank_machining or grip):
            raise ValueError('Фасад витрины должен соответствовать рамке Z1 и петлям в анкете.')
        if self.blank_thickness_mm is not None and not framed and self.blank_thickness_mm%1:
            raise ValueError('Укажите толщину плиты в целых миллиметрах.')
        if self.blank_axis=='front':
            if not framed and (self.module_type!='blank' or self.blank_edge_code!='1111' or self.blank_edge_thickness_mm!=2 or self.blank_thickness_mm!=18):
                raise ValueError('Для фасада нужна плита 18 мм и кромка ПВХ 2 мм по всем четырём торцам.')
            if grip:
                grip.check_size(self.width,self.height,group.spec.front.hinge_side(key) if door else None)
        else:
            fitted_width=(preset and back_key in ('left','right','bottom','top','back')) or (back_key=='right' and mount and mount.kind=='rabbet')
            width_step=split_scale if split_trim and self.blank_axis=='back' else 2 if fitted_width else 1
            elevation_step=split_scale if split_trim else 2 if post or flush or hdf else 1
            if self.width*(2 if hdf else 1)%1 or not on_grid(self.blank_width_mm,width_step) or not on_grid(self.elevation_mm,elevation_step):
                raise ValueError('Проверьте точность размеров детали корпуса.')
        if self.assistant_carcass and self.assistant_carcass.spec.backThickness and self.item_id==str(self.assistant_carcass.group_id)+':back':
            expected_edges=''.join('1' if i in required_edges else '0' for i in range(4))
            if self.blank_axis!='back' or self.blank_edge_code!=expected_edges or self.blank_thickness_mm!=self.assistant_carcass.spec.backThickness:
                raise ValueError('Проверьте толщину вкладной задней стенки и кромку вдоль выборки.')
        if self.assistant_carcass and self.item_id==str(self.assistant_carcass.group_id)+':plinth':
            if self.blank_axis!='back' or self.blank_edge_code!='1111':
                raise ValueError('Цоколь шкафа должен иметь ПВХ по четырём торцам.')
        if self.blank_plinth_run and (not self.assistant_carcass or self.blank_plinth_run[0]!=self.assistant_carcass.group_id or
                                     self.item_id!=str(self.assistant_carcass.group_id)+':plinth' or len(set(self.blank_plinth_run))!=len(self.blank_plinth_run)):
            raise ValueError('Общий цоколь должен ссылаться на шкафы своего ряда.')
        if self.blank_hook:
            if self.module_type!='blank' or self.blank_axis not in ('back','side'):
                raise ValueError('Крючок доступен на вертикальной заготовке.')
            span=self.width if self.blank_axis=='back' else self.depth
            along=self.blank_hook.along_mm if self.blank_hook.along_mm is not None else span/2
            height=self.blank_hook.height_mm if self.blank_hook.height_mm is not None else self.height/2
            count=self.blank_hook.count
            half_row=(count-1)*span/(2*count)
            if along-half_row<15 or along+half_row+15>span or (count>1 and span/count<30) or height<27.592 or height+98.148>self.height:
                raise ValueError('Крючок выходит за край заготовки.')
        if self.blank_shelf and (self.module_type!='blank' or self.blank_axis!='horizontal' or not shelf_valid(self.blank_shelf,self.blank_thickness_mm)):
            raise ValueError('Проверьте фурнитуру полки.')
        if self.assistant_carcass and self.module_type!='blank':
            raise ValueError('Параметры корпуса помощника доступны только заготовкам.')
        if self.blank_binding and (self.module_type!='blank' or self.blank_axis!='horizontal'):
            raise ValueError('Привязка доступна только горизонтальной полке.')
        if self.module_type=='blank':
            if self.bazis_id or self.template_id or any(v is None for v in (
                self.blank_length_mm,self.blank_width_mm,self.blank_thickness_mm,self.blank_axis,self.blank_edge_code
            )):
                raise ValueError('У заготовки должны быть длина, ширина, толщина, ориентация и код ПВХ')
            l,w,t=self.blank_length_mm,self.blank_width_mm,self.blank_thickness_mm
            drawer=None
            if self.assistant_carcass and self.assistant_carcass.spec.drawerBanks:
                group_prefix=str(self.assistant_carcass.group_id)+':'
                drawer=re.fullmatch(r'drawer-(\d+)-(\d+)-(side-left|side-right|front|rear|face|bottom)',self.item_id[len(group_prefix):]) if self.item_id.startswith(group_prefix) else None
                if drawer:
                    section,index=map(int,drawer.group(1,2))
                    banks=self.assistant_carcass.spec.drawerBanks
                    if section>=len(banks) or not banks[section] or index>=len(banks[section].faces):
                        raise ValueError('Деталь шуфляды отсутствует в анкете шкафа.')
                    if banks[section].railFamily=='concealed' and t!=18:
                        raise ValueError('Для шуфляды PRIME нужна плита 18 мм.')
                    if banks[section].railFamily=='concealed' and drawer[3] in ('bottom','side-left','side-right') and w not in (290,340,390,440,490,540):
                        raise ValueError('Глубина детали PRIME должна соответствовать выбранной длине направляющей.')
            trim_face=group and group.spec.surround and (key in ('trim-left-face','trim-right-face') or split_trim and trim[3]=='face') and self.blank_axis=='back'
            cap_upright=group and group.spec.surround and group.spec.surround.cap and key=='trim-cap-upright' and self.blank_axis=='back'
            if w<40 and not cap_upright:
                raise ValueError('Ширина заготовки от 40 мм.')
            if l<100 and not trim_face and not grip and not (drawer and drawer[3].startswith('side-') and self.blank_axis=='side' and t==18):
                raise ValueError('Длина заготовки от 100 мм.')
            thin_bottom=drawer and drawer[3]=='bottom' and self.blank_axis=='horizontal' and self.blank_edge_code=='0000' and t==3
            if w>1200 and self.blank_axis!='back':
                raise ValueError('Ширина заготовки больше 1200 мм допустима только для задней панели')
            glass=bool(self.blank_shelf and not self.blank_shelf.startswith('board/'))
            if glass and (self.blank_edge_code!='0000' or self.body_variant_id or int(self.blank_shelf.split('/')[0])!=t):
                raise ValueError('Неверная толщина или материал стеклянной полки.')
            if t<10 and not glass and not thin_bottom and not (t in (3,4) and self.blank_axis=='back' and self.blank_edge_code=='0000'):
                raise ValueError('ХДФ 3/4 мм допустим только для задней панели без ПВХ')
            expected={'horizontal':(l,t,w),'side':(t,l,w),'back':(l,w,t),'front':(w,l,t)}[self.blank_axis]
            if (self.width,self.height,self.depth)!=expected:
                raise ValueError('Габариты заготовки не соответствуют ориентации')
            if self.base!='wall' or self.base_height not in (None,0) or self.worktop_thickness not in (None,0):
                raise ValueError('Заготовка не имеет цоколя и столешницы')
            if self.body_height not in (None,self.height):
                raise ValueError('Высота заготовки должна соответствовать её геометрии')
            if self.shelves or self.drawers or self.worktop_fixture or self.plinthMaterialId:
                raise ValueError('У отдельной детали нет корпусного наполнения')
            return self
        if self.width<150 or self.height<250 or self.depth<200 or (self.body_height is not None and self.body_height<150):
            raise ValueError('Размер меньше допустимого для модуля')
        if self.module_type!='wall_cabinet' and self.elevation_mm not in (None,0):
            raise ValueError('Высота навески доступна только для верхнего шкафа')
        if f:=self.worktop_fixture:
            if self.module_type!='base_cabinet' or not self.countertopEnabled:
                raise ValueError('Worktop fixture requires a lower cabinet with a worktop')
            if abs(f.offset_x)+f.width/2>self.width/2:
                raise ValueError('Worktop fixture exceeds cabinet width')
            if f.front_offset+f.depth>(self.countertopDepthMm or 600)-20:
                raise ValueError('Worktop fixture requires 20 mm front and rear margins')
        if self.module_type!='tall_cabinet' and (self.depth%1 or self.x%0.5 or self.z%0.5):
            raise ValueError('Дробная глубина с шагом 0,5 мм и координаты 0,25 мм доступны только пеналам')
        source={'bazis_id':self.bazis_id,'bazis_sha256':self.bazis_sha256,'bazis_file':self.bazis_file}
        v=gola_variant(source) or dryer_variant(source) or cargo_variant(source)
        dish=dishwasher(source)
        is_gola=(v and v.get('execution')=='gola') or (dish and dish.get('variant')=='gola')
        expected_gap=(self.countertopDepthMm or 600)-self.depth-18.5 if is_gola else 50
        if self.rearServiceGapMm is not None and self.rearServiceGapMm!=expected_gap:
            raise ValueError('Gola: от фасада до края столешницы должно быть 0,5 мм' if is_gola else 'Задний зазор обычного нижнего шкафа — 50 мм')
        if any(not key or len(key)>80 or not all(c.isalnum() or c in '-_' for c in key) for key in self.part_materials):
            raise ValueError('Invalid production part material key')
        if self.legHeightMm is not None:
            if self.module_type!='base_cabinet' or self.base=='wall':
                raise ValueError('Kitchen legs require a lower cabinet')
            if self.base_height is not None and self.base_height!=self.legHeightMm:
                raise ValueError('Leg height and legacy base height must agree')
            self.base_height=self.legHeightMm
        if self.countertopThicknessMm is not None:
            if self.worktop_thickness is not None and self.worktop_thickness!=self.countertopThicknessMm:
                raise ValueError('Countertop thickness aliases must agree')
            self.worktop_thickness=self.countertopThicknessMm
        # Additive JSON fields; no database migration or mass rewrite of projects.
        base=0 if self.base=='wall' else self.base_height if self.base_height is not None else 80 if self.base=='plinth' else 60
        if self.base=='wall' and self.base_height not in (None,0):
            raise ValueError('Suspended modules have no floor base')
        if self.height-base<150 or (self.body_height is not None and self.body_height+base!=self.height):
            raise ValueError('Module height must equal base plus body; worktop is separate')
        if self.worktop_thickness and (self.module_type!='base_cabinet' or self.depth>750):
            raise ValueError('Worktop is supported only for compatible lower modules')
        body=self.height-base
        single_door_ids={'bazis.0211e4f77fc4','bazis.784bf9af84f8','bazis.facfa0cd038b','bazis.b226370aab54',
                         'bazis.858266606bc5','bazis.2175c60e84a6','bazis.b89bf9852860','bazis.60f79b573cd1','bazis.460987c9a8e8'}
        if (self.bazis_id in single_door_ids or (not self.bazis_id and self.template_id in {'base.one_door','wall.one_door','tall.one_door','base.drawer_door','base.drawers2_door','wall.horizontal'})) and self.width>600:
            raise ValueError('Ширина модуля с одной дверью не должна превышать 600 мм')
        if self.bazis_id=='bazis.9e77f4333545':
            if self.width!=600:
                raise ValueError('Ширина НШД-600 всегда 600 мм')
            if self.bazis_sha256=='7de5d86b28ad697749e0e47f5f313da2df667817910500dfe4fd569641680206' and body<720:
                raise ValueError('Высота корпуса НШД с нишей 595 мм должна быть не меньше 720 мм')
        if self.bazis_id=='bazis.b4420a0b4bbc' and self.bazis_sha256=='e5145e6878304cde87b0344685ac309ed92302216394e01c6bb2fbdebb5b7b60':
            if not 800<=self.width<=1231:
                raise ValueError('Установочная ширина углового модуля 800–1231 мм; дверца не больше 600 мм')
            if not 450<=self.depth<=700 or not 600<=body<=1000:
                raise ValueError('Проверьте глубину и высоту корпуса углового модуля')
        corner=corner_variant({'bazis_id':self.bazis_id,'bazis_sha256':self.bazis_sha256})
        if corner:
            maximum=1231 if corner['door_count']==1 else 1834
            if not 800<=self.width<=maximum:
                raise ValueError(f'Установочная ширина углового модуля 800–{maximum} мм; каждая дверца не больше 600 мм')
            if not 450<=self.depth<=700 or not 600<=body<=1000:
                raise ValueError('Проверьте глубину и высоту корпуса углового модуля')
        upper=upper_variant({'bazis_id':self.bazis_id,'bazis_sha256':self.bazis_sha256})
        if self.bazis_id in UPPER_BY_ID:
            if not upper:raise ValueError('Фрагмент верхнего шкафа не совпадает с проверенным исходником')
            if self.module_type!='wall_cabinet' or self.base!='wall' or base!=0:
                raise ValueError('Верхний шкаф — навесной, без основания')
            error=upper_error(dict(width=self.width,height=self.height,depth=self.depth),upper)
            if error:raise ValueError(error)
            self.bazis_file=self.bazis_file or upper['source_file'];self.bazis_resize=True
            self.layout='doors';self.drawers=0
            if upper['execution']!='handles':self.handles='handleless'
        if self.bazis_id in DISHWASHER_BY_ID:
            error=dishwasher_error(self.model_dump())
            if error:raise ValueError(error)
            v=dishwasher(self.model_dump());self.bazis_file=self.bazis_file or v['source_file'];self.bazis_resize=True
            self.layout='doors';self.drawers=0;self.handles='handleless' if v['variant']=='gola' else self.handles
        if self.bazis_id in MODERN_BY_ID:
            error=modern_error(self.model_dump())
            if error:raise ValueError(error)
            v=modern_variant(self.model_dump());self.bazis_file=self.bazis_file or v['source_file'];self.bazis_resize=True
            self.layout='doors';self.drawers=0;self.shelves=[];self.handles='handles' if v['execution']=='handles' else 'handleless'
        if self.bazis_id in WALL_SPECIAL_BY_ID:
            error=wall_special_error(self.model_dump())
            if error:raise ValueError(error)
            v=wall_special_variant(self.model_dump());self.bazis_file=self.bazis_file or v['source_file'];self.bazis_resize=True
            self.layout='doors';self.drawers=0;self.shelves=[];self.handles='handles' if v['execution']=='handles' else 'handleless'
            if v['family']!='corner':self.front_variant_id=None
        if self.bazis_id in OPEN_TALL_BY_ID:
            error=open_tall_error(self.model_dump())
            if error:raise ValueError(error)
            v=open_tall_variant(self.model_dump());self.bazis_file=self.bazis_file or v['source_file'];self.bazis_resize=True
            self.layout='niche';self.drawers=0;self.shelves=[];self.handles='handleless';self.front_variant_id=None;self.doors_open=False
        if self.bazis_id in CARGO_BY_ID:
            error=cargo_error(self.model_dump())
            if error:raise ValueError(error)
            v=cargo_variant(self.model_dump());self.bazis_file=self.bazis_file or v['source_file'];self.bazis_resize=True
            self.layout='drawers';self.drawers=1;self.shelves=[]
            self.handles='handleless' if v['execution']=='gola' else 'handles'
        if self.bazis_id in PULLOUT_DRYER_BY_ID:
            error=dryer_error(self.model_dump())
            if error:raise ValueError(error)
            v=dryer_variant(self.model_dump());self.bazis_file=self.bazis_file or v['source_file'];self.bazis_resize=True
            self.layout='drawers';self.drawers=2;self.handles='handleless' if v['execution']=='gola' else 'handles'
        if self.bazis_id in GOLA_BY_ID:
            data=self.model_dump();error=gola_error(data)
            if error:raise ValueError(error)
            gola=gola_variant(data);self.bazis_file=self.bazis_file or gola['source_file'];self.bazis_resize=True;self.handles='handleless'
            self.layout=gola['kind'];self.drawers=gola['drawer_count']
        drawer=drawer_variant({'bazis_id':self.bazis_id,'bazis_sha256':self.bazis_sha256})
        if self.bazis_id in DRAWER_BY_ID:
            if not drawer:raise ValueError('Фрагмент ящиков не совпадает с проверенным исходником')
            if self.module_type!='base_cabinet' or self.base=='wall' or base not in (80,100,150):
                raise ValueError('Ящики: нижний модуль на ножках 80, 100 или 150 мм')
            if not 400<=self.width<=1200 or not 600<=body<=1000 or not 300<=self.depth<=700:
                raise ValueError('Размеры шкафа: корпус 600–1000 мм, глубина 300–700 мм, ширина 400–1200 мм.')
            _,error=drawer_configuration(dict(bazis_id=self.bazis_id,bazis_sha256=self.bazis_sha256,height=self.height,base_height=base,depth=self.depth))
            if error:raise ValueError(error)
            self.bazis_file=self.bazis_file or drawer['source_file'];self.bazis_resize=True
            self.layout='drawers';self.drawers=drawer['drawer_count']
            if drawer['opening']=='push':self.handles='handleless'
        vitrine=vitrine_variant({'bazis_id':self.bazis_id,'bazis_sha256':self.bazis_sha256})
        if self.bazis_id in VITRINE_BY_ID and not vitrine:
            raise ValueError('Исходный файл витрины не совпадает с проверенной моделью')
        if self.glass_shelf_count is not None and not vitrine:
            raise ValueError('Стеклянные полки доступны только для проверенной витрины')
        if vitrine:
            if self.module_type!='tall_cabinet' or base!=100 or self.base=='wall':
                raise ValueError('Витрина устанавливается на опоры 100 мм')
            if not 300<=self.width<=600 or not 1800<=self.height<=2800 or not 450<=self.depth<=700:
                raise ValueError('Проверьте размеры витрины: 300–600 × 1800–2800 × 450–700 мм')
            if not vitrine['global_elastic_defined'] and (self.width,self.height,self.depth)!=(600,2000,600):
                raise ValueError('Две стороны + L: исходная витрина имеет фиксированный размер 600 × 2000 × 600 мм')
            self.bazis_resize=vitrine['global_elastic_defined']
            self.bazis_file=self.bazis_file or vitrine['source_file']
            self.handles='handleless'
            self.front_variant_id=None
        tall=tall_variant({'bazis_id':self.bazis_id,'bazis_sha256':self.bazis_sha256})
        if self.bazis_id in {v['id'] for v in TALL_GOLA_VARIANTS} and not tall:
            raise ValueError('Пенал Gola не совпадает с проверенным исходником')
        if self.upper_shelf_count is not None and not tall and not open_tall_variant(self.model_dump()):
            raise ValueError('Количество верхних полок доступно только для проверенного пенала')
        if tall:
            if tall.get('execution')=='gola':
                self.handles='handleless'
                self.bazis_file=self.bazis_file or tall['source_file']
                self.bazis_resize=True
            if self.module_type!='tall_cabinet' or base!=100 or self.base=='wall':
                raise ValueError('Пенал устанавливается на цоколь 100 мм')
            if not 300<=self.width<=600*tall['doors_per_section'] or not 1800<=self.height<=2800 or not 300<=self.depth<=700:
                raise ValueError('Проверьте размеры пенала: глубина 300–700 мм, высота 1800–2800 мм; ширина одной створки не больше 600 мм')
            if tall.get('family')=='appliance':
                if self.width!=600 or not 500<=self.depth<=700 or self.height<tall['min_height']:
                    raise ValueError(f"Пенал под технику: ширина 600 мм, глубина 500–700 мм, высота от {tall['min_height']} мм")
                count=self.upper_shelf_count if self.upper_shelf_count is not None else len(tall['upper_shelves'])
                if self.height-18-tall['upper_bottom']-count*18<=0:
                    raise ValueError('Полки не помещаются в верхнем отделении')
        for shelf in self.shelves:
            if corner and corner['purpose']=='sink':continue
            if shelf.enabled and (shelf.offset_mm-shelf.thickness/2<0 or shelf.offset_mm+shelf.thickness/2>body):
                raise ValueError('Shelf position must stay inside the cabinet body')
        return self

class MaterialAppearance(StrictModel):
    scale: float=Field(default=1,ge=.25,le=4,allow_inf_nan=False)
    rotation: Literal[0,90,180,270]=0
    finish: Literal['auto','matte','satin','gloss']='auto'

class DisplaySettings(StrictModel):
    renderRoomId: int | None=Field(default=None,ge=1,le=15,strict=True)
    environmentPreset: Literal['graphite','warm-oak','classic','studio','warm','showroom']='graphite'
    wallColor: str=Field(default='#878e90',pattern=r'^#[0-9a-fA-F]{6}$')
    floorMaterial: Literal['oak','marble','light-stone','concrete']='oak'
    lightingPreset: Literal['daylight','warm','neutral']='neutral'
    usePaletteFloor: bool=False
    usePaletteLight: bool=False
    wallFinishes: dict[Literal['a','b','c','d'],Literal['porcelain','chalk','pearl','linen','limestone','sand','mushroom','sage','clay','sageDark','slate','graphite','basalt']]=Field(default_factory=dict,max_length=4)
    materialAppearance: dict[UUID,MaterialAppearance]=Field(default_factory=dict,max_length=500)

    @model_validator(mode='before')
    @classmethod
    def complete_room_preset(cls,value):
        if not isinstance(value,dict) or not isinstance(value.get('environmentPreset'),str):
            return value
        defaults={
            'graphite':('#878e90','oak','neutral'),'warm-oak':('#c9c1b1','oak','neutral'),
            'classic':('#bbc1bb','oak','neutral'),'studio':('#f0ede6','light-stone','daylight'),
            'warm':('#e5dccf','oak','warm'),'showroom':('#d3ddd4','oak','neutral'),
        }
        preset=defaults.get(value['environmentPreset'])
        if preset is None:return value
        return dict(zip(('wallColor','floorMaterial','lightingPreset'),preset))|value

class MaterialIdentity(StrictModel):
    materialId: UUID|None=None
    article: str|None=Field(default=None,max_length=500)
    manufacturer: str|None=Field(default=None,max_length=200)

class CountertopSettings(StrictModel):
    joint: Literal['standard','euro']='standard'

class RowPlinth(StrictModel):
    id: str=Field(min_length=1,max_length=80)
    members: list[str]=Field(default_factory=list,max_length=100)
    automatic: bool=False
    excluded_members: list[str]=Field(default_factory=list,max_length=100)
    shape: Literal['straight','left','right','u']='straight'
    width: int|None=Field(default=None,ge=100,le=6000)
    height: int|None=Field(default=None,ge=40,le=300)
    depth: int|None=Field(default=None,ge=40,le=1200)
    inset: int=Field(default=40,ge=0,le=300)
    material_id: UUID|None=None

    @model_validator(mode='after')
    def manual_members(self):
        if not self.automatic and not self.members:
            raise ValueError('Manual plinth requires row members')
        return self

class WallPanel(StrictModel):
    automatic: bool=False
    excluded_members: list[str]=Field(default_factory=list,max_length=100)
    id: str=Field(min_length=1,max_length=80)
    kind: Literal['skinali','ldsp','tile']='skinali'
    shape: Literal['straight','left','right','u']='straight'
    wall: Literal['a','b','c','d']='a'
    offset: int=Field(default=0,ge=0,le=12000)
    width: int=Field(default=2000,ge=100,le=6000)
    height: int=Field(default=600,ge=100,le=2000)
    elevation: int=Field(default=858,ge=0,le=4900)
    depth: int=Field(default=400,ge=50,le=6000)
    thickness: int=Field(default=6,ge=3,le=40)
    color: str=Field(default='#e7e3da',pattern=r'^#[0-9a-fA-F]{6}$')
    material_id: UUID|None=None
    tile_width: int=Field(default=600,ge=100,le=1200)
    tile_height: int=Field(default=300,ge=100,le=1200)
    grout: int=Field(default=2,ge=1,le=10)
    grout_color: str=Field(default='#bcb8af',pattern=r'^#[0-9a-fA-F]{6}$')

    @model_validator(mode='after')
    def finish_thickness(self):
        if self.thickness not in {'skinali':(6,),'ldsp':(16,18),'tile':(8,10,12)}[self.kind]:
            raise ValueError('Thickness does not match wall panel kind')
        if self.kind!='ldsp' and self.material_id is not None:
            raise ValueError('Catalogue sheet material is only supported for LDSP backsplash')
        return self

class WallLight(StrictModel):
    id: str=Field(min_length=1,max_length=80)
    wall: Literal['a','b','c','d']='a'
    offset: int=Field(default=0,ge=0,le=12000)
    width: int=Field(default=2000,ge=100,le=6000)
    elevation: int=Field(default=1444,ge=30,le=4900)
    enabled: bool=True
    brightness: int=Field(default=80,ge=0,le=100)
    temperature: Literal[2700,3000,4000]=3000
    finish: Literal['aluminium','black']='aluminium'

CameraNumber=Annotated[float,Field(ge=-1000,le=1000,allow_inf_nan=False)]
class PresentationView(StrictModel):
    aspect: float | None=Field(default=None,gt=0,allow_inf_nan=False)
    id: str=Field(min_length=1,max_length=80)
    name: str=Field(min_length=1,max_length=60)
    mode: Literal['3d','top','front','left','right']='3d'
    position: tuple[CameraNumber,CameraNumber,CameraNumber]
    target: tuple[CameraNumber,CameraNumber,CameraNumber]
    up: tuple[CameraNumber,CameraNumber,CameraNumber]=(0,1,0)
    zoom: float=Field(default=1,ge=.01,le=100,allow_inf_nan=False)
    orthoSpan: float=Field(default=3,gt=0,le=1000,allow_inf_nan=False)
    fov: float=Field(default=32,ge=10,le=100,allow_inf_nan=False)
    viewOffset: tuple[Annotated[float,Field(ge=-2,le=2,allow_inf_nan=False)],Annotated[float,Field(ge=-2,le=2,allow_inf_nan=False)]]=(0,0)

    @model_validator(mode='after')
    def valid_camera(self):
        if sum((a-b)**2 for a,b in zip(self.position,self.target))<.0001 or not .99<=sum(v*v for v in self.up)<=1.01:
            raise ValueError('Camera needs a direction and a unit up vector')
        return self

class AlbumSettings(StrictModel):
    order_number: str=Field(default='',max_length=60)

def _validate_trim_facade_levels(items):
    """The first side segment must reach the lowest finished exterior front on that side."""
    from .blank_bindings import local_point
    groups={}
    for panel in items:
        meta=panel.assistant_carcass
        surround=meta and meta.spec.surround
        if not surround or not any(s and s.start=='facade' for s in (surround.left,surround.right)):
            continue
        prefix=str(meta.group_id)+':'
        if panel.item_id.startswith(prefix):
            groups.setdefault(meta.group_id,{})[panel.item_id[len(prefix):]]=panel
    for parts in groups.values():
        meta=next(iter(parts.values())).assistant_carcass
        spec=meta.spec
        widths=spec.clear_widths()
        fronts=[]
        for key,panel in parts.items():
            if panel.blank_axis!='front':
                continue
            drawer=re.fullmatch(r'drawer-(\d+)-\d+-face',key)
            if drawer:
                banks=spec.drawerBanks or []
                slot=int(drawer[1])
                if slot>=len(banks) or not banks[slot] or banks[slot].kind!='external':
                    continue
            elif not re.fullmatch(r'door-(?:(?:lower|upper)-)?(?:left|right)',key):
                continue
            x,_=local_point(panel,panel.rotation)
            grip=panel.blank_edge_pull
            rise=DOOR_HARDWARE[grip.article]['edgeRise'] if grip else 0
            edge=grip.edge if grip else None
            fronts.append((x-panel.width/2-(rise if edge=='left' else 0),
                           x+panel.width/2+(rise if edge=='right' else 0),
                           (panel.elevation_mm or 0)-(rise if edge=='bottom' else 0)))
        for side,sign,span in [('left',1,widths[0]),('right',-1,widths[-1])]:
            setting=getattr(spec.surround,side)
            if not setting or setting.start!='facade' or side not in parts:
                continue
            outer=parts[side]
            first=parts.get(f'trim-{side}-'+('end' if setting.kind=='end' else 'face'))
            if not first:
                continue
            x,_=local_point(outer,outer.rotation)
            probe=x+sign*(outer.width/2+span/4)
            floors=[y for lo,hi,y in fronts if lo<=probe<=hi]
            if not floors:
                raise ValueError('У выбранной боковины отсутствует наружный фасад нижнего корпуса.')
            floor=min(floors)
            if abs((first.elevation_mm or 0)-floor)>.00001:
                raise ValueError('Низ боковой детали должен совпадать с готовым фасадом у выбранной боковины.')
            spec.check_side_limits(setting,*spec.side_limits(setting,facade_floor=floor))


class Scene(StrictModel):
    # Legacy single-module fields stay accepted so previously saved projects remain readable.
    module_type: Literal['chest','base_cabinet','wall_cabinet','tall_cabinet','wardrobe','vanity','blank']='chest'
    width: int=Field(default=1000,ge=1,le=3000)
    height: int=Field(default=850,ge=1,le=3000)
    depth: int=Field(default=450,ge=1,le=1200)
    layout: Literal['drawers','doors','combo','niche']='combo'
    drawers: int=Field(default=3,ge=0,le=8)
    base: Literal['plinth','legs','wall']='plinth'
    handles: Literal['handles','handleless']='handles'
    body_variant_id: UUID|None=None
    front_variant_id: UUID|None=None
    view_mode: Literal['2d','3d']='3d'
    schema_version: Literal[1,2]=2
    room: Room=Field(default_factory=Room)
    displaySettings: DisplaySettings=Field(default_factory=DisplaySettings)
    materialIdentities: dict[UUID,MaterialIdentity]=Field(default_factory=dict,max_length=500)
    items: list[FurnitureItem]=Field(default_factory=list,max_length=100)
    selected_item_id: str|None=Field(default=None,max_length=80)
    production_note: str=Field(default='',max_length=2500)
    countertopSettings: CountertopSettings=Field(default_factory=CountertopSettings)
    plinths: list[RowPlinth]=Field(default_factory=list,max_length=100)
    wallPanels: list[WallPanel]=Field(default_factory=list,max_length=16)
    wallLights: list[WallLight]=Field(default_factory=list,max_length=4)
    presentationViews: list[PresentationView]=Field(default_factory=list,max_length=6)
    albumSettings: AlbumSettings=Field(default_factory=AlbumSettings)
    upperMountingRule: Literal['worktop600']|None=None

    @model_validator(mode='after')
    def wall_finish_placement(self):
        from .blank_bindings import validate_bindings
        validate_bindings(self.items)
        _validate_trim_facade_levels(self.items)
        if self.module_type!='blank' and (self.width<150 or self.height<250 or self.depth<200):
            raise ValueError('Размер меньше допустимого для модуля')
        if self.upperMountingRule == 'worktop600':
            from .upper_mounting import mounted_items
            mounted = mounted_items([it.model_dump() for it in self.items])
            for item, placed in zip(self.items, mounted):
                if item.module_type == 'wall_cabinet': item.elevation_mm = placed['elevation_mm']
        for item in self.items:
            if item.module_type=='blank' and (item.elevation_mm or 0)+item.height>self.room.height:
                raise ValueError('Верх заготовки выходит выше потолка.')
            if item.module_type=='wall_cabinet' and item.elevation_mm is not None and item.elevation_mm+item.height>self.room.height:
                raise ValueError('Верх шкафа выходит выше потолка. Уменьшите высоту шкафа.')
        if len({v.id for v in self.presentationViews})!=len(self.presentationViews):
            raise ValueError('Presentation view IDs must be unique')
        for collection in (self.plinths,self.wallPanels):
            if sum(p.automatic for p in collection)>1:
                raise ValueError('Only one automatic finish per kind')
        for collection in (self.wallPanels,self.wallLights):
            if len({p.id for p in collection})!=len(collection):
                raise ValueError('Wall finish IDs must be unique')
            for p in collection:
                if isinstance(p,WallPanel) and p.automatic:continue
                length=self.room.width if p.wall in ('a','c') else self.room.depth
                if p.offset+p.width>length or p.elevation+(p.height if isinstance(p,WallPanel) else 14)>self.room.height:
                    raise ValueError('Wall finish extends outside room')
                if isinstance(p,WallPanel) and p.shape!='straight' and p.depth>(self.room.depth if p.wall in ('a','c') else self.room.width):
                    raise ValueError('Wall panel return extends outside room')
        return self

class Create(StrictModel):
    name: str=Field(min_length=1,max_length=200)
    scene: Scene
    request_id: UUID|None=None

class Update(Create):
    version: int=Field(ge=1)

class Checkpoint(StrictModel):
    label: str=Field(min_length=1,max_length=120,pattern=r'\S')
    version: int=Field(ge=1)
    request_id: UUID

class HardwareDraft(StrictModel):
    version: int=Field(ge=1)
    comment: str=Field(default='',max_length=4000)

class RestoreCheckpoint(StrictModel):
    version: int=Field(ge=1)
    request_id: UUID

def request_receipt(conn,user,body,operation):
    if not body.request_id:return None,None
    digest=hashlib.sha256(json.dumps([operation,body.model_dump(mode='json')],sort_keys=True,separators=(',',':')).encode()).hexdigest()
    # Same lock order for all mutations; lock is released with the transaction.
    conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',(str(user['user_id'])+str(body.request_id),))
    found=conn.execute('SELECT * FROM mf_3d_project_requests WHERE owner_user_id=%s AND request_id=%s',
                       (user['user_id'],body.request_id)).fetchone()
    if found and found['request_hash']!=digest:error(409,'PROJECT_3D_REQUEST_REUSED')
    return digest,found['result'] if found else None

def save_receipt(conn,user,body,digest,result):
    if digest:
        metadata={k:v for k,v in result.items() if k!='scene'}
        conn.execute('INSERT INTO mf_3d_project_requests(owner_user_id,request_id,request_hash,result) VALUES(%s,%s,%s,%s)',
                     (user['user_id'],body.request_id,digest,Jsonb(jsonable_encoder(metadata))))
    return result

def checkpoint_projection(row):
    return {k:row[k] for k in ('version_id','label','kind','project_version','name','created_at')}

class SpecificationRender(StrictModel):
    preview_data_url: str|None=Field(default=None,max_length=6_000_000)
    module_preview_data_urls: dict[str,str]=Field(default_factory=dict,max_length=40)

class AlbumShape(StrictModel):
    x: float=Field(ge=-6000,le=6000,allow_inf_nan=False)
    y: float=Field(ge=-100,le=6000,allow_inf_nan=False)
    w: float=Field(gt=0,le=6000,allow_inf_nan=False)
    h: float=Field(gt=0,le=6000,allow_inf_nan=False)
    role: Literal['panel','front','hardware','counter','appliance','label']='panel'
    label: Literal['','Сушка','ДШ','СВЧ','ПММ']=''

class AlbumModuleGeometry(StrictModel):
    item_id: str=Field(min_length=1,max_length=80)
    width: float=Field(gt=0,le=6000,allow_inf_nan=False)
    height: float=Field(gt=0,le=6000,allow_inf_nan=False)
    depth: float=Field(gt=0,le=6000,allow_inf_nan=False)
    source_sha256: str|None=Field(default=None,max_length=64)
    detail: Literal['native','parametric','outline']
    shapes: list[AlbumShape]=Field(max_length=600)

class SalesAlbumPreflight(StrictModel):
    include_hardware: bool=False
    version: int=Field(ge=1)
    elevation_geometry: list[AlbumModuleGeometry]|None=Field(default=None,max_length=100)

class SalesAlbumRender(SalesAlbumPreflight):
    hero_data_url: str=Field(max_length=11_000_000)
    detail_data_url: str|None=Field(default=None,max_length=11_000_000)
    module_preview_data_urls: dict[str,str]=Field(default_factory=dict,max_length=40)
    photo: bool=True
    layout: Literal['technical','client']='technical'

class SalesPhotoRender(StrictModel):
    version: int=Field(ge=1)
    preview_data_url: str=Field(max_length=11_000_000)
    request_id: UUID
    paid_confirmed: Literal[True]
    render_style: Literal['catalog','lived_in']='catalog'

class SalesPhotoLookup(StrictModel):
    version: int=Field(ge=1)
    preview_data_url: str=Field(max_length=11_000_000)

def _preview_png(value,max_bytes=4_000_000):
    if not value:return None
    prefix='data:image/png;base64,'
    if not value.startswith(prefix):error(400,'INVALID_3D_PREVIEW')
    try:data=base64.b64decode(value[len(prefix):],validate=True)
    except (binascii.Error,ValueError):error(400,'INVALID_3D_PREVIEW')
    if not data or len(data)>max_bytes or not data.startswith(b'\x89PNG\r\n\x1a\n'):error(400,'INVALID_3D_PREVIEW')
    return data

def _module_previews(scene,values):
    allowed={str(x.get('item_id')) for x in scene.get('items',[]) if x.get('item_id')}
    result={};total=0
    for key,value in (values or {}).items():
        if key not in allowed:continue
        data=_preview_png(value,800_000)
        if data is None:error(400,'INVALID_3D_PREVIEW')
        total+=len(data)
        if total>12_000_000:error(400,'INVALID_3D_PREVIEW')
        result[key]=data
    return result

def projection(row):
    result={k:row[k] for k in ('project_id','name','module_type','scene','version','created_at','updated_at')}
    return result

def router(settings):
    api=APIRouter(prefix='/api/v2')

    def own(conn,user,project_id,lock=False):
        row=conn.execute('SELECT * FROM mf_3d_projects WHERE project_id=%s AND owner_user_id=%s AND archived_at IS NULL'+(' FOR UPDATE' if lock else ''),
                         (project_id,user['user_id'])).fetchone()
        if not row: error(404,'PROJECT_3D_NOT_FOUND')
        return row

    @api.get('/3d-projects')
    def list_projects(request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write')
            rows=conn.execute('SELECT * FROM mf_3d_projects WHERE owner_user_id=%s AND archived_at IS NULL ORDER BY updated_at DESC,project_id',
                              (user['user_id'],)).fetchall()
            return {'items':[projection(r) for r in rows]}

    # mf_3d_projects.module_type is a legacy storage discriminator (chest only).
    # Actual furniture types are preserved, unchanged, in the scene JSON.
    @api.post('/3d-projects',status_code=201)
    def create_project(body:Create,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');pid=uuid4()
            digest,replayed=request_receipt(conn,user,body,'create')
            if replayed:
                own(conn,user,replayed['project_id'])
                return {**replayed,'scene':body.scene.model_dump(mode='json')}
            row=conn.execute('''INSERT INTO mf_3d_projects(project_id,owner_user_id,name,module_type,scene)
                VALUES(%s,%s,%s,%s,%s) RETURNING *''',
                (pid,user['user_id'],body.name,'chest',Jsonb(body.scene.model_dump(mode='json')))).fetchone()
            record_event(conn,settings,actor=user['user_id'],action='3d.project.created',object_type='3d_project',object_id=pid,reason='User created 3D project')
            return save_receipt(conn,user,body,digest,projection(row))

    @api.get('/3d-projects/{project_id}')
    def read_project(project_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');return projection(own(conn,user,project_id))

    @api.patch('/3d-projects/{project_id}')
    def update_project(project_id:UUID,body:Update,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write')
            digest,replayed=request_receipt(conn,user,body,'update:'+str(project_id))
            row=own(conn,user,project_id,True)
            if replayed:return {**replayed,'scene':body.scene.model_dump(mode='json')}
            if row['version']!=body.version: error(409,'PROJECT_3D_VERSION_CONFLICT')
            row=conn.execute('''UPDATE mf_3d_projects SET name=%s,module_type=%s,scene=%s,version=version+1,updated_at=now()
                WHERE project_id=%s RETURNING *''',
                (body.name,'chest',Jsonb(body.scene.model_dump(mode='json')),project_id)).fetchone()
            record_event(conn,settings,actor=user['user_id'],action='3d.project.updated',object_type='3d_project',object_id=project_id,reason='User updated 3D project',version=row['version'])
            return save_receipt(conn,user,body,digest,projection(row))

    @api.get('/3d-projects/{project_id}/versions')
    def list_versions(project_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');own(conn,user,project_id)
            rows=conn.execute('SELECT version_id,label,kind,project_version,name,created_at FROM mf_3d_project_versions WHERE project_id=%s ORDER BY created_at DESC,version_id', (project_id,)).fetchall()
            return {'items':rows}

    @api.post('/3d-projects/{project_id}/versions',status_code=201)
    def create_version(project_id:UUID,body:Checkpoint,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write')
            digest,replayed=request_receipt(conn,user,body,'checkpoint:'+str(project_id))
            row=own(conn,user,project_id,True)
            if replayed:return replayed
            if row['version']!=body.version:error(409,'PROJECT_3D_VERSION_CONFLICT')
            saved=conn.execute('''INSERT INTO mf_3d_project_versions(version_id,project_id,label,kind,project_version,name,scene)
                VALUES(%s,%s,%s,'named',%s,%s,%s) RETURNING *''',
                (uuid4(),project_id,body.label.strip(),row['version'],row['name'],Jsonb(row['scene']))).fetchone()
            record_event(conn,settings,actor=user['user_id'],action='3d.project.version.created',object_type='3d_project',object_id=project_id,reason='User saved named project version',version=row['version'])
            return save_receipt(conn,user,body,digest,checkpoint_projection(saved))

    @api.post('/3d-projects/{project_id}/versions/{version_id}/restore')
    def restore_version(project_id:UUID,version_id:UUID,body:RestoreCheckpoint,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write')
            digest,replayed=request_receipt(conn,user,body,'restore:'+str(project_id)+':'+str(version_id))
            row=own(conn,user,project_id,True)
            target=conn.execute('SELECT * FROM mf_3d_project_versions WHERE project_id=%s AND version_id=%s',(project_id,version_id)).fetchone()
            if not target:error(404,'PROJECT_3D_VERSION_NOT_FOUND')
            if replayed:return {**replayed,'scene':target['scene']}
            if row['version']!=body.version:error(409,'PROJECT_3D_VERSION_CONFLICT')
            conn.execute('''INSERT INTO mf_3d_project_versions(version_id,project_id,label,kind,project_version,name,scene)
                VALUES(%s,%s,%s,'before_restore',%s,%s,%s)''',
                (uuid4(),project_id,'Перед восстановлением · '+target['label'][:90],row['version'],row['name'],Jsonb(row['scene'])))
            restored=conn.execute('''UPDATE mf_3d_projects SET name=%s,scene=%s,version=version+1,updated_at=now()
                WHERE project_id=%s RETURNING *''',(target['name'],Jsonb(target['scene']),project_id)).fetchone()
            record_event(conn,settings,actor=user['user_id'],action='3d.project.version.restored',object_type='3d_project',object_id=project_id,reason='User restored named version; previous state checkpointed',version=restored['version'])
            return save_receipt(conn,user,body,digest,projection(restored))

    @api.post('/3d-projects/{project_id}/duplicate',status_code=201)
    def duplicate_project(project_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');source=own(conn,user,project_id)
            pid=uuid4();name=(source['name']+' — копия')[:200]
            row=conn.execute('''INSERT INTO mf_3d_projects(project_id,owner_user_id,name,module_type,scene)
                VALUES(%s,%s,%s,%s,%s) RETURNING *''',(pid,user['user_id'],name,source['module_type'],Jsonb(source['scene']))).fetchone()
            record_event(conn,settings,actor=user['user_id'],action='3d.project.duplicated',object_type='3d_project',object_id=pid,reason='User duplicated 3D project')
            return projection(row)

    def project_materials(conn,scene,visuals=None):
        release=catalogue.active(conn);materials={}
        ids=set()
        if scene.get('items'):
            for item in scene['items']:
                ids.update(str(x) for x in (item.get('body_variant_id'),item.get('front_variant_id'),item.get('back_variant_id'),item.get('countertopMaterialId'),*item.get('part_materials',{}).values(),*(s.get('material_variant_id') for s in item.get('shelves') or [])) if x)
        else:
            ids.update(str(x) for x in (scene.get('body_variant_id'),scene.get('front_variant_id')) if x)
        ids.update(str(p['material_id']) for p in scene.get('plinths',[])+scene.get('wallPanels',[]) if p.get('material_id'))
        ids.update(str(it['plinthMaterialId']) for it in scene.get('items',[]) if it.get('plinthMaterialId'))
        if release:
            for ident in ids:
                found=conn.execute("SELECT snapshot FROM mf_catalogue_items WHERE release_id=%s AND item_id=%s AND kind='material'",(release,UUID(ident))).fetchone()
                if found:
                    m=found['snapshot'];materials[ident]=' · '.join(str(x) for x in (m.get('manufacturer'),m.get('article'),m.get('name')) if x)
                    if visuals is not None:visuals[ident]=visual_metadata(m)
        return materials

    def specification_bytes(conn,row,preview_png=None,module_previews=None):
        return render_spec(row['name'],row['scene'],project_materials(conn,row['scene']),preview_png,module_previews or {})

    def specification_response(data):
        filename='Martin_Forest_3D_Project.pdf'
        return Response(data,media_type='application/pdf',headers={'Content-Disposition':'attachment; filename='+filename})

    @api.get('/3d-projects/{project_id}/specification.pdf')
    def specification(project_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');row=own(conn,user,project_id)
            return specification_response(specification_bytes(conn,row))

    @api.post('/3d-projects/{project_id}/specification.pdf')
    def specification_with_preview(project_id:UUID,body:SpecificationRender,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');row=own(conn,user,project_id)
            preview=_preview_png(body.preview_data_url)
            module_previews=_module_previews(row['scene'],body.module_preview_data_urls)
            return specification_response(specification_bytes(conn,row,preview,module_previews))

    @api.get('/3d-projects/{project_id}/hardware.pdf')
    def project_hardware(project_id:UUID,version:int,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');row=own(conn,user,project_id)
            if row['version']!=version:error(409,'Проект изменился. Откройте комплектацию ещё раз.')
        try:
            data=customer_hardware_pdf.render(customer_hardware.build(row['name'],row['scene']))
        except ValueError as exc:
            error(422,str(exc))
        return Response(data,media_type='application/pdf',headers={'Content-Disposition':'attachment; filename=Martin_Forest_Komplektaciya.pdf','Cache-Control':'no-store'})

    @api.post('/3d-projects/{project_id}/hardware-draft',status_code=201)
    def hardware_draft(project_id:UUID,body:HardwareDraft,request:Request):
        from .calculation_models import ConstructorSource,RevisionRequest
        from .order_revisions import create as create_revision
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write')
            receipt=RestoreCheckpoint(version=body.version,request_id=uuid5(project_id,f'hardware-draft:{body.version}'))
            digest,found=request_receipt(conn,user,receipt,'hardware-draft:'+str(project_id)+':'+body.comment)
            row=own(conn,user,project_id,True)
            if found:
                require(conn,user,'orders.read',order_id=found['order_id'])
                return found
            if row['version']!=body.version:error(409,'Проект изменился. Откройте подготовку заказа заново.')
            if not row['scene'].get('items'):error(422,'Добавьте мебель в проект.')
            order=create_draft(conn,settings,user['user_id'],row['name'],'manager_assisted')
            require(conn,user,'orders.revision.create',order_id=order['order_id'])
            revision=RevisionRequest(reason='Комплектация из конструктора',comment=body.comment,details=[],
                                     constructor_source=ConstructorSource(project_id=project_id,version=body.version))
            result=create_revision(conn,settings,user['user_id'],order,revision)
            return save_receipt(conn,user,receipt,digest,{'order_id':order['order_id'],'revision_id':result['revision_id']})

    @api.get('/3d-sales-capabilities')
    def sales_capabilities(request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write')
        return {'automatic_render':sales_render.available(),'max_pages':5,'client_pages':4,'images_per_request':1}

    @api.post('/3d-projects/{project_id}/sales-album/preflight')
    def sales_album_preflight(project_id:UUID,body:SalesAlbumPreflight,request:Request):
        # Exercise the complete saved-project layout before offering a paid image.
        # The local neutral thumbnail is discarded with the probe PDF; no provider call.
        from io import BytesIO
        from PIL import Image
        visuals={}
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');row=own(conn,user,project_id)
            if row['version']!=body.version:error(409,'Проект изменился. Откройте альбом заново.')
            materials=project_materials(conn,row['scene'],visuals)
        probe=BytesIO();Image.new('RGB',(8,6),'#f6f3ed').save(probe,'JPEG')
        try:
            kitchen_album.render(row['name'],row['scene'],materials,probe.getvalue(),photo=False,include_hardware=body.include_hardware,
                material_visuals=visuals,elevation_geometry=[g.model_dump() for g in body.elevation_geometry] if body.elevation_geometry is not None else None)
        except ValueError as exc:
            logging.getLogger(__name__).warning('Client album preflight rejected: %s',str(exc))
            error(400,str(exc))
        return {'ok':True}

    @api.post('/3d-projects/{project_id}/sales-album.pdf')
    def sales_album(project_id:UUID,body:SalesAlbumRender,request:Request):
        visuals={}
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');row=own(conn,user,project_id)
            if row['version']!=body.version:error(409,'Проект изменился. Откройте альбом заново.')
            materials=project_materials(conn,row['scene'],visuals if body.layout=='client' else None)
        try:
            hero=sales_image(body.hero_data_url);detail=sales_image(body.detail_data_url)
            previews=_module_previews(row['scene'],body.module_preview_data_urls)
            previews={key:sales_image('data:image/png;base64,'+base64.b64encode(value).decode()) for key,value in previews.items()}
            data=(kitchen_album.render(row['name'],row['scene'],materials,hero,detail,body.photo,include_hardware=body.include_hardware,material_visuals=visuals,elevation_geometry=[g.model_dump() for g in body.elevation_geometry] if body.elevation_geometry is not None else None)
                  if body.layout=='client' else render_sales(row['name'],row['scene'],materials,hero,detail,previews,body.photo,body.version))
        except ValueError as exc:
            logging.getLogger(__name__).warning('Client album PDF rejected: %s',str(exc))
            error(400,str(exc))
        return Response(data,media_type='application/pdf',headers={'Content-Disposition':'attachment; filename=Martin_Forest_Sales_Album.pdf','Cache-Control':'no-store'})

    @api.post('/3d-projects/{project_id}/sales-photo')
    def sales_photo(project_id:UUID,body:SalesPhotoRender,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');row=own(conn,user,project_id)
            if row['version']!=body.version:error(409,'Проект изменился. Откройте альбом заново.')
            materials=project_materials(conn,row['scene'])
        try:
            sales_render.validate_render_scene(row['scene'],materials)
            if not sales_image(body.preview_data_url):raise ValueError('Не удалось получить вид кухни.')
            result=sales_render_store.for_scene(settings.storage_root,user['user_id'],project_id,body.request_id,
                body.version,row['scene'],body.preview_data_url,
                lambda:sales_render.generate(str(user['user_id']),row['scene'],materials,body.preview_data_url,body.render_style),
                render_style=body.render_style)
        except ValueError as exc:error(400,str(exc))
        with transaction(settings) as conn:
            current=own(conn,user,project_id)
            if current['version']!=body.version:error(409,'Проект изменился во время рендера. Сформируйте новый вид.')
        return result

    @api.post('/3d-projects/{project_id}/sales-photo/reuse')
    def sales_photo_reuse(project_id:UUID,body:SalesPhotoLookup,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');row=own(conn,user,project_id)
            if row['version']!=body.version:error(409,'Проект изменился. Откройте альбом заново.')
        return sales_render_store.current(settings.storage_root,user['user_id'],project_id,
                                          row['scene'],row['version'],body.preview_data_url) or {'state':'none'}

    @api.get('/3d-projects/{project_id}/sales-photo')
    def sales_photo_current(project_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');row=own(conn,user,project_id)
        return sales_render_store.current(settings.storage_root,user['user_id'],project_id,
                                          row['scene'],row['version']) or {'state':'none'}

    @api.get('/3d-projects/{project_id}/sales-photo/{request_id}')
    def sales_photo_status(project_id:UUID,request_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');row=own(conn,user,project_id)
        result=sales_render_store.read(settings.storage_root,user['user_id'],project_id,request_id)
        if result is None:error(404,'Запуск не найден.')
        if result.get('version',row['version'])!=row['version']:
            current=sales_render_store.current(settings.storage_root,user['user_id'],project_id,row['scene'],row['version'])
            if not current or current.get('request_id')!=str(request_id):error(409,'Проект изменился. Откройте альбом заново.')
        return result

    @api.post('/3d-projects/{project_id}/shares',status_code=201)
    def create_share(project_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');own(conn,user,project_id)
            token=secrets.token_urlsafe(32);digest=hashlib.sha256(token.encode()).hexdigest();sid=uuid4()
            conn.execute('INSERT INTO mf_3d_project_shares(share_id,project_id,token_hash,created_by) VALUES(%s,%s,%s,%s)',
                         (sid,project_id,digest,user['user_id']))
            record_event(conn,settings,actor=user['user_id'],action='3d.project.share.created',object_type='3d_project',object_id=project_id,reason='User created read-only 3D share')
            return {'share_id':sid,'url':'/3d-view?token='+token}

    @api.get('/3d-projects/{project_id}/shares')
    def list_shares(project_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');own(conn,user,project_id)
            return {'items':conn.execute('SELECT share_id,created_at,revoked_at FROM mf_3d_project_shares WHERE project_id=%s ORDER BY created_at DESC',(project_id,)).fetchall()}

    @api.delete('/3d-projects/{project_id}/shares/{share_id}',status_code=204)
    def revoke_share(project_id:UUID,share_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');own(conn,user,project_id)
            row=conn.execute('SELECT share_id FROM mf_3d_project_shares WHERE share_id=%s AND project_id=%s AND revoked_at IS NULL FOR UPDATE',(share_id,project_id)).fetchone()
            if not row: error(404,'PROJECT_3D_SHARE_NOT_FOUND')
            conn.execute('UPDATE mf_3d_project_shares SET revoked_at=now() WHERE share_id=%s',(share_id,))
            record_event(conn,settings,actor=user['user_id'],action='3d.project.share.revoked',object_type='3d_project',object_id=project_id,reason='User revoked read-only 3D share')

    @api.get('/3d-shares/{token}')
    def public_share(token:str):
        if len(token)<32 or len(token)>100: error(404,'PROJECT_3D_SHARE_NOT_FOUND')
        digest=hashlib.sha256(token.encode()).hexdigest()
        with transaction(settings) as conn:
            row=conn.execute('''SELECT p.name,p.scene,p.version,p.updated_at FROM mf_3d_project_shares s
                JOIN mf_3d_projects p ON p.project_id=s.project_id
                WHERE s.token_hash=%s AND s.revoked_at IS NULL AND p.archived_at IS NULL''',(digest,)).fetchone()
            if not row: error(404,'PROJECT_3D_SHARE_NOT_FOUND')
            return {'name':row['name'],'scene':row['scene'],'version':row['version'],'updated_at':row['updated_at'],'read_only':True}

    @api.delete('/3d-projects/{project_id}',status_code=204)
    def archive_project(project_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');own(conn,user,project_id,True)
            conn.execute('UPDATE mf_3d_projects SET archived_at=now(),updated_at=now() WHERE project_id=%s',(project_id,))
            record_event(conn,settings,actor=user['user_id'],action='3d.project.archived',object_type='3d_project',object_id=project_id,reason='User archived 3D project')
    return api
