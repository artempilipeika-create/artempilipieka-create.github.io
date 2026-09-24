"""Authenticated user-owned 3D furniture projects. No production side effects."""
from typing import Literal
from uuid import UUID,uuid4
from pydantic import Field
from fastapi import APIRouter,Request
from psycopg.types.json import Jsonb
from .auth_api import StrictModel
from .db import transaction
from .security import identity,error
from .domain_api import require
from .events import record_event

class Scene(StrictModel):
    module_type: Literal['chest']='chest'
    width: int=Field(ge=400,le=3000)
    height: int=Field(ge=400,le=2400)
    depth: int=Field(ge=250,le=900)
    layout: Literal['drawers','doors','combo','niche']='combo'
    drawers: int=Field(ge=2,le=8)
    base: Literal['plinth','legs','wall']='plinth'
    handles: Literal['handles','handleless']='handles'
    body_variant_id: UUID|None=None
    front_variant_id: UUID|None=None
    view_mode: Literal['2d','3d']='3d'

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

    @api.delete('/3d-projects/{project_id}',status_code=204)
    def archive_project(project_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write');own(conn,user,project_id,True)
            conn.execute('UPDATE mf_3d_projects SET archived_at=now(),updated_at=now() WHERE project_id=%s',(project_id,))
            record_event(conn,settings,actor=user['user_id'],action='3d.project.archived',object_type='3d_project',object_id=project_id,reason='User archived 3D project')
    return api
