"""Protected 3D dresser API: access, projects, catalogue search and order handoff."""
from datetime import timedelta
from uuid import UUID
from fastapi import APIRouter,Request,Query
from .db import transaction
from .events import record_event
from .security import identity,verified,error
from .domain_api import require
from . import catalogue
from .catalogue_model import matches,safe_item
from .planner3d_common import TRIAL_DAYS,DresserState,ProjectCreate,ProjectSave,ProjectCopy,AccessChange,now,access_row,access_projection,require_3d,decimal,validate_state
from .planner3d_service import project,latest,projection,insert_revision,create_project,to_order

def router(settings,policy):
    api=APIRouter(prefix='/api/v2')
    @api.get('/3d/access')
    def access(request:Request):
        with transaction(settings) as c:return access_projection(c,identity(c,request))
    @api.post('/3d/access/activate',status_code=201)
    def activate(request:Request):
        with transaction(settings) as c:
            user=identity(c,request)
            if user['roles']!={'client'} or user['account_status']!='active':error(403,'PERMISSION_DENIED')
            verified(user);current=access_row(c,user['user_id'])
            if current:return access_projection(c,user)
            until=now()+timedelta(days=TRIAL_DAYS);c.execute('INSERT INTO mf_3d_access(user_id,access_until,granted_by,reason) VALUES(%s,%s,%s,%s)',(user['user_id'],until,user['user_id'],'30-day 3D access activated by client'))
            record_event(c,settings,actor=user['user_id'],action='3d.access.activated',object_type='user',object_id=user['user_id'],reason='30-day 3D access activated')
            return access_projection(c,user)
    @api.get('/admin/3d-access')
    def admin_access(request:Request,q:str=Query(default='',max_length=100)):
        with transaction(settings) as c:
            user=identity(c,request);require(c,user,'users.roles.write');verified(user);pattern='%'+q.strip().lower()+'%'
            rows=c.execute("SELECT u.user_id,u.email,u.account_status,a.access_until FROM mf_users u JOIN mf_user_roles r USING(user_id) LEFT JOIN mf_3d_access a USING(user_id) WHERE r.role='client' AND (%s='' OR lower(u.email) LIKE %s) ORDER BY u.created_at DESC LIMIT 100",(q.strip(),pattern)).fetchall();t=now()
            return {'items':[{**r,'allowed':bool(r['access_until'] and r['access_until']>t and r['account_status']=='active')} for r in rows]}
    @api.put('/admin/3d-access/{user_id}')
    def change_access(user_id:UUID,body:AccessChange,request:Request):
        with transaction(settings) as c:
            actor=identity(c,request);require(c,actor,'users.roles.write');verified(actor)
            target=c.execute("SELECT u.* FROM mf_users u JOIN mf_user_roles r USING(user_id) WHERE u.user_id=%s AND r.role='client' FOR UPDATE",(user_id,)).fetchone()
            if not target:error(404,'CLIENT_NOT_FOUND')
            current=access_row(c,user_id);t=now()
            if body.days==0:until=t;action='3d.access.revoked'
            else:until=(max(t,current['access_until']) if current else t)+timedelta(days=body.days);action='3d.access.extended' if current else '3d.access.granted'
            c.execute("INSERT INTO mf_3d_access(user_id,access_until,granted_by,reason) VALUES(%s,%s,%s,%s) ON CONFLICT(user_id) DO UPDATE SET access_until=EXCLUDED.access_until,granted_by=EXCLUDED.granted_by,reason=EXCLUDED.reason,updated_at=now()",(user_id,until,actor['user_id'],body.reason))
            record_event(c,settings,actor=actor['user_id'],action=action,object_type='user',object_id=user_id,reason=body.reason);return {'user_id':user_id,'access_until':until,'allowed':until>t}
    @api.get('/3d/projects')
    def projects(request:Request):
        with transaction(settings) as c:
            user=require_3d(c,request);rows=c.execute("SELECT * FROM mf_3d_projects WHERE owner_user_id=%s AND status<>'archived' ORDER BY updated_at DESC LIMIT 100",(user['user_id'],)).fetchall();return {'items':[projection(c,r) for r in rows]}
    @api.post('/3d/projects',status_code=201)
    def create(body:ProjectCreate,request:Request):
        with transaction(settings) as c:return create_project(c,settings,require_3d(c,request),body.name,body.state)
    @api.get('/3d/projects/{project_id}')
    def read(project_id:UUID,request:Request):
        with transaction(settings) as c:
            user=require_3d(c,request);return projection(c,project(c,user,project_id))
    @api.post('/3d/projects/{project_id}/revisions')
    def save(project_id:UUID,body:ProjectSave,request:Request):
        with transaction(settings) as c:
            user=require_3d(c,request);row=project(c,user,project_id,True);expected=request.headers.get('if-match','').strip('"')
            if not expected.isdigit():error(428,'VERSION_REQUIRED')
            if int(expected)!=row['optimistic_lock_version']:error(412,'REVISION_CONFLICT')
            validate_state(c,row['catalogue_release_id'],body.state);lr=latest(c,project_id);insert_revision(c,user['user_id'],project_id,lr['version']+1,body.state)
            row=c.execute("UPDATE mf_3d_projects SET name=coalesce(%s,name),optimistic_lock_version=optimistic_lock_version+1,updated_at=now() WHERE project_id=%s RETURNING *",(body.name,project_id)).fetchone()
            record_event(c,settings,actor=user['user_id'],action='3d.project.saved',object_type='3d_project',object_id=project_id,reason='3D project revision saved',version=lr['version']+1);return projection(c,row)
    @api.post('/3d/projects/{project_id}/copy',status_code=201)
    def copy(project_id:UUID,body:ProjectCopy,request:Request):
        with transaction(settings) as c:
            user=require_3d(c,request);row=project(c,user,project_id);return create_project(c,settings,user,body.name,DresserState(**latest(c,project_id)['state']),row['catalogue_release_id'])
    @api.delete('/3d/projects/{project_id}',status_code=204)
    def archive(project_id:UUID,request:Request):
        with transaction(settings) as c:
            user=require_3d(c,request);project(c,user,project_id,True);c.execute("UPDATE mf_3d_projects SET status='archived',optimistic_lock_version=optimistic_lock_version+1,updated_at=now() WHERE project_id=%s",(project_id,));record_event(c,settings,actor=user['user_id'],action='3d.project.archived',object_type='3d_project',object_id=project_id,reason='3D project archived by owner')
    @api.get('/3d/projects/{project_id}/materials')
    def materials(project_id:UUID,request:Request,q:str=Query(default='',max_length=100)):
        with transaction(settings) as c:
            user=require_3d(c,request);row=project(c,user,project_id);found=[]
            for item in catalogue.items(c,row['catalogue_release_id'],'material'):
                if decimal(item.get('thickness'))!=18 or q and not matches(item,q):continue
                found.append(safe_item(item,row['catalogue_release_id']))
                if len(found)>=20:break
            return {'items':found,'catalogue_release_id':row['catalogue_release_id']}
    @api.post('/3d/projects/{project_id}/to-order')
    def handoff(project_id:UUID,request:Request):
        with transaction(settings) as c:
            user=require_3d(c,request);return to_order(c,settings,user,project(c,user,project_id,True))
    return api
