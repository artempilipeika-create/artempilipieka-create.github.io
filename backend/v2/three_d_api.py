"""Authenticated user-owned 3D furniture projects. No production side effects."""
from typing import Literal
from uuid import UUID,uuid4
import hashlib,secrets
from pydantic import Field
from fastapi import APIRouter,Request,Response
from psycopg.types.json import Jsonb
from .auth_api import StrictModel
from .db import transaction
from .security import identity,error
from .domain_api import require
from .events import record_event
from . import catalogue
from .three_d_document import render as render_spec

class Room(StrictModel):
    width: int=Field(default=4200,ge=1500,le=12000)
    depth: int=Field(default=3200,ge=1500,le=12000)
    height: int=Field(default=2700,ge=2000,le=5000)

class FurnitureItem(StrictModel):
    item_id: str=Field(min_length=1,max_length=80)
    module_type: Literal['chest','base_cabinet','wall_cabinet','tall_cabinet','wardrobe','vanity']='chest'
    name: str=Field(min_length=1,max_length=120)
    x: int=Field(default=0,ge=-12000,le=12000)
    z: int=Field(default=0,ge=-12000,le=12000)
    rotation: Literal[0,90,180,270]=0
    width: int=Field(ge=300,le=3000)
    height: int=Field(ge=300,le=3000)
    depth: int=Field(ge=200,le=1200)
    layout: Literal['drawers','doors','combo','niche']='doors'
    drawers: int=Field(default=2,ge=0,le=8)
    base: Literal['plinth','legs','wall']='plinth'
    handles: Literal['handles','handleless']='handles'
    body_variant_id: UUID|None=None
    front_variant_id: UUID|None=None

class Scene(StrictModel):
    # Legacy single-module fields stay accepted so previously saved projects remain readable.
    module_type: Literal['chest','base_cabinet','wall_cabinet','tall_cabinet','wardrobe','vanity']='chest'
    width: int=Field(default=1000,ge=300,le=3000)
    height: int=Field(default=850,ge=300,le=3000)
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
    items: list[FurnitureItem]=Field(default_factory=list,max_length=100)
    selected_item_id: str|None=Field(default=None,max_length=80)

class Create(StrictModel):
    name: str=Field(min_length=1,max_length=200)
    scene: Scene

class Update(Create):
    version: int=Field(ge=1)

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

    @api.post('/3d-projects',status_code=201)
    def create_project(body:Create,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');pid=uuid4()
            row=conn.execute('''INSERT INTO mf_3d_projects(project_id,owner_user_id,name,module_type,scene)
                VALUES(%s,%s,%s,%s,%s) RETURNING *''',
                (pid,user['user_id'],body.name,body.scene.module_type,Jsonb(body.scene.model_dump(mode='json')))).fetchone()
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
                (body.name,body.scene.module_type,Jsonb(body.scene.model_dump(mode='json')),project_id)).fetchone()
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

    @api.get('/3d-projects/{project_id}/specification.pdf')
    def specification(project_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');row=own(conn,user,project_id)
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
            data=render_spec(row['name'],scene,materials)
            filename='Martin_Forest_3D_Project.pdf'
            return Response(data,media_type='application/pdf',headers={'Content-Disposition':'attachment; filename='+filename})

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
