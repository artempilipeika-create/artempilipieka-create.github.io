"""Authenticated user-owned 3D furniture projects. No production side effects."""
from typing import Literal
from uuid import UUID,uuid4
import base64,binascii,hashlib,secrets
from pydantic import Field,model_validator
from fastapi import APIRouter,Request,Response
from psycopg.types.json import Jsonb
from .auth_api import StrictModel
from .db import transaction
from .security import identity,error
from .domain_api import require
from .events import record_event
from . import catalogue
from .three_d_document import render as render_spec
from .three_d_corner import corner_variant
from .three_d_tall import tall_variant
from .three_d_vitrine import vitrine_variant, BY_ID as VITRINE_BY_ID
from .three_d_room import Room

class ShelfState(StrictModel):
    id: str=Field(min_length=1,max_length=80)
    enabled: bool=True
    offset_mm: int=Field(ge=0,le=3000)
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

# Bounds include the existing cargo-150 and horizontal-250 catalogue templates.
class FurnitureItem(StrictModel):
    item_id: str=Field(min_length=1,max_length=80)
    module_type: Literal['chest','base_cabinet','wall_cabinet','tall_cabinet','wardrobe','vanity']='chest'
    template_id: str|None=Field(default=None,max_length=80)
    bazis_id: str|None=Field(default=None,max_length=80)
    bazis_file: str|None=Field(default=None,max_length=240)
    bazis_sha256: str|None=Field(default=None,min_length=64,max_length=64)
    bazis_resize: bool=False
    name: str=Field(min_length=1,max_length=160)
    x: float=Field(default=0,ge=-12000,le=12000,multiple_of=0.5)
    z: float=Field(default=0,ge=-12000,le=12000,multiple_of=0.5)
    rotation: Literal[0,90,180,270]=0
    width: int=Field(ge=150,le=3000)
    height: int=Field(ge=250,le=3000)
    body_height: int|None=Field(default=None,ge=150,le=3000)
    base_height: int|None=Field(default=None,ge=0,le=300)
    worktop_thickness: int|None=Field(default=None,ge=0,le=100)
    legHeightMm: Literal[80,100,150]|None=None
    rearServiceGapMm: int|None=Field(default=None,ge=50,le=50)
    plinthMaterialId: UUID|None=None
    countertopDepthMm: int|None=Field(default=None,ge=300,le=1200)
    countertopStockLengthMm: Literal[4100]|None=None
    countertopThicknessMm: int|None=Field(default=None,ge=12,le=100)
    countertopMaterialId: UUID|None=None
    depth: int=Field(ge=200,le=1200)
    layout: Literal['drawers','doors','combo','niche']='doors'
    drawers: int=Field(default=2,ge=0,le=8)
    base: Literal['plinth','legs','wall']='plinth'
    handles: Literal['handles','handleless']='handles'
    body_variant_id: UUID|None=None
    front_variant_id: UUID|None=None
    back_variant_id: UUID|None=None
    part_materials: dict[str,UUID]=Field(default_factory=dict,max_length=32)
    shelves: list[ShelfState]=Field(default_factory=list,max_length=16)
    doors_open: bool=False
    glass_shelf_count: int|None=Field(default=None,ge=0,le=8,strict=True)
    upper_shelf_count: int|None=Field(default=None,ge=0,le=8,strict=True)
    production_note: str=Field(default='',max_length=2000)
    appliance_details: ApplianceDetails|None=None

    @model_validator(mode='after')
    def separated_heights(self):
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
        if (self.bazis_id in single_door_ids or self.template_id in {'base.one_door','wall.one_door','tall.one_door','base.drawer_door','base.drawers2_door','wall.horizontal'}) and self.width>600:
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
            self.handles='handleless'
            self.front_variant_id=None
        tall=tall_variant({'bazis_id':self.bazis_id,'bazis_sha256':self.bazis_sha256})
        if self.upper_shelf_count is not None and not tall:
            raise ValueError('Количество верхних полок доступно только для проверенного пенала')
        if tall:
            if self.module_type!='tall_cabinet' or base!=100 or self.base=='wall':
                raise ValueError('Пенал устанавливается на цоколь 100 мм')
            if not 300<=self.width<=600*tall['doors_per_section'] or not 1800<=self.height<=2800 or not 450<=self.depth<=700:
                raise ValueError('Проверьте размеры пенала; ширина одной створки не больше 600 мм')
            if tall.get('family')=='appliance':
                if self.width!=600 or self.depth!=600 or self.height<tall['min_height']:
                    raise ValueError(f"Пенал под технику: корпус 600 × 600 мм, высота от {tall['min_height']} мм")
                count=self.upper_shelf_count if self.upper_shelf_count is not None else len(tall['upper_shelves'])
                if self.height-18-tall['upper_bottom']-count*18<=0:
                    raise ValueError('Полки не помещаются в верхнем отделении')
        for shelf in self.shelves:
            if corner and corner['purpose']=='sink':continue
            if shelf.enabled and (shelf.offset_mm-shelf.thickness/2<0 or shelf.offset_mm+shelf.thickness/2>body):
                raise ValueError('Shelf position must stay inside the cabinet body')
        return self

class DisplaySettings(StrictModel):
    environmentPreset: Literal['studio','warm','showroom']='showroom'
    wallColor: str=Field(default='#eeeae2',pattern=r'^#[0-9a-fA-F]{6}$')
    floorMaterial: Literal['light-stone','oak','concrete']='concrete'
    lightingPreset: Literal['daylight','warm','neutral']='neutral'

class MaterialIdentity(StrictModel):
    materialId: UUID|None=None
    article: str|None=Field(default=None,max_length=500)
    manufacturer: str|None=Field(default=None,max_length=200)

class Scene(StrictModel):
    # Legacy single-module fields stay accepted so previously saved projects remain readable.
    module_type: Literal['chest','base_cabinet','wall_cabinet','tall_cabinet','wardrobe','vanity']='chest'
    width: int=Field(default=1000,ge=150,le=3000)
    height: int=Field(default=850,ge=250,le=3000)
    depth: int=Field(default=450,ge=200,le=1200)
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

class Create(StrictModel):
    name: str=Field(min_length=1,max_length=200)
    scene: Scene

class Update(Create):
    version: int=Field(ge=1)

class SpecificationRender(StrictModel):
    preview_data_url: str|None=Field(default=None,max_length=6_000_000)
    module_preview_data_urls: dict[str,str]=Field(default_factory=dict,max_length=40)

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
        data=_preview_png(value,800_000);total+=len(data)
        if total>12_000_000:error(400,'INVALID_3D_PREVIEW')
        result[key]=data
    return result

def projection(row):
    return {k:row[k] for k in ('project_id','name','module_type','scene','version','created_at','updated_at')}

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
            row=conn.execute('''INSERT INTO mf_3d_projects(project_id,owner_user_id,name,module_type,scene)
                VALUES(%s,%s,%s,%s,%s) RETURNING *''',
                (pid,user['user_id'],body.name,'chest',Jsonb(body.scene.model_dump(mode='json')))).fetchone()
            record_event(conn,settings,actor=user['user_id'],action='3d.project.created',object_type='3d_project',object_id=pid,reason='User created 3D project')
            return projection(row)

    @api.get('/3d-projects/{project_id}')
    def read_project(project_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');return projection(own(conn,user,project_id))

    @api.patch('/3d-projects/{project_id}')
    def update_project(project_id:UUID,body:Update,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');row=own(conn,user,project_id,True)
            if row['version']!=body.version: error(409,'PROJECT_3D_VERSION_CONFLICT')
            row=conn.execute('''UPDATE mf_3d_projects SET name=%s,module_type=%s,scene=%s,version=version+1,updated_at=now()
                WHERE project_id=%s RETURNING *''',
                (body.name,'chest',Jsonb(body.scene.model_dump(mode='json')),project_id)).fetchone()
            record_event(conn,settings,actor=user['user_id'],action='3d.project.updated',object_type='3d_project',object_id=project_id,reason='User updated 3D project',version=row['version'])
            return projection(row)

    @api.post('/3d-projects/{project_id}/duplicate',status_code=201)
    def duplicate_project(project_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');source=own(conn,user,project_id)
            pid=uuid4();name=(source['name']+' — копия')[:200]
            row=conn.execute('''INSERT INTO mf_3d_projects(project_id,owner_user_id,name,module_type,scene)
                VALUES(%s,%s,%s,%s,%s) RETURNING *''',(pid,user['user_id'],name,source['module_type'],Jsonb(source['scene']))).fetchone()
            record_event(conn,settings,actor=user['user_id'],action='3d.project.duplicated',object_type='3d_project',object_id=pid,reason='User duplicated 3D project')
            return projection(row)

    def specification_bytes(conn,row,preview_png=None,module_previews=None):
        scene=row['scene'];release=catalogue.active(conn);materials={}
        ids=set()
        if scene.get('items'):
            for item in scene['items']:
                ids.update(str(x) for x in (item.get('body_variant_id'),item.get('front_variant_id')) if x)
        else:
            ids.update(str(x) for x in (scene.get('body_variant_id'),scene.get('front_variant_id')) if x)
        if release:
            for ident in ids:
                found=conn.execute("SELECT snapshot FROM mf_catalogue_items WHERE release_id=%s AND item_id=%s AND kind='material'",(release,UUID(ident))).fetchone()
                if found:
                    m=found['snapshot'];materials[ident]=' · '.join(str(x) for x in (m.get('manufacturer'),m.get('article'),m.get('name')) if x)
        return render_spec(row['name'],scene,materials,preview_png,module_previews or {})

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
