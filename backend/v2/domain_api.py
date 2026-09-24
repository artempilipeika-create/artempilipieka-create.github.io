"""Scoped domain security. Stage 4 submission delegates to immutable revision service."""
from uuid import UUID, uuid4
from typing import Literal
from pydantic import Field
from fastapi import APIRouter, Request, Response
from psycopg.errors import UniqueViolation
from .auth_api import StrictModel, Credentials
from .db import transaction
from .events import record_event
from .security import STAFF_ROLES, error, grant, identity, password_hash, verified
from .rbac import allowed
from .storage import VolumeStore
from .files import read_verified
from .calculation_models import SubmitRequest
from . import order_revisions
from .production_models import OrderApproval

class Draft(StrictModel):
    business_name: str = Field(min_length=1,max_length=200)
    preparation_mode: Literal['manager_assisted','self_prepared'] = 'manager_assisted'

class Assignment(StrictModel):
    manager_id: UUID | None
    reason: str = Field(min_length=1,max_length=500)

class Staff(Credentials):
    role: Literal['manager','production','accounting','viewer','admin','service_agent']

class Role(StrictModel):
    role: Literal['manager','production','accounting','viewer','admin','service_agent']

class AccessGrant(StrictModel):
    permission: str = Field(min_length=1,max_length=80)
    scope_type: Literal['assigned','order','job','all']
    scope_id: str | None = Field(default=None,max_length=80)

class AccountState(StrictModel):
    status: Literal['active','blocked']


def require(conn,user,permission,**scope):
    if not allowed(conn,user['user_id'],permission,**scope):
        error(403,'PERMISSION_DENIED')


def admin(conn,request,permission):
    user = identity(conn,request)
    require(conn,user,permission)
    verified(user)
    return user


def staff_target(conn,user_id):
    row = conn.execute('SELECT * FROM mf_users WHERE user_id=%s FOR UPDATE',(user_id,)).fetchone()
    roles = {r['role'] for r in conn.execute('SELECT role FROM mf_user_roles WHERE user_id=%s',(user_id,))}
    if not row or not roles or 'client' in roles:
        error(404,'STAFF_NOT_FOUND')
    return row, roles


def projection(conn,user,order):
    # Allow-list only: never forward revision.content, arbitrary JSON, manifest or legacy payload.
    result = {key:order[key] for key in ('order_id','workflow_status','optimistic_lock_version','created_at')}
    roles = user['roles']
    if roles & {'client','manager','admin'}:
        result.update({key:order[key] for key in ('business_name','preparation_mode','active_revision_id')})
    if roles == {'production'}:
        result['projection'] = 'production'
        result['revision_id'] = order['active_revision_id']
    elif roles == {'accounting'}:
        result['projection'] = 'accounting'
        # No financial engine in Stage 2; do not invent prices or expose revision payloads.
        result['financial_state'] = 'not_available'
    elif roles == {'viewer'}:
        result['projection'] = 'viewer'
    if roles & {'manager','admin','client'} and allowed(conn,user['user_id'],'customers.pii.read',order_id=order['order_id']):
        owner = conn.execute('SELECT email FROM mf_users WHERE user_id=%s',(order['owner_user_id'],)).fetchone()
        result['customer'] = {'email':owner['email']}
    if roles & {'admin','manager'}:
        result['assigned_manager_id'] = order['assigned_manager_id']
    return result


def router(settings, policy):
    api = APIRouter(prefix='/api/v2')

    @api.post('/orders',status_code=201)
    def create_order(body: Draft, request: Request):
        with transaction(settings) as conn:
            user = identity(conn,request)
            require(conn,user,'orders.draft.write')
            order_id = str(uuid4())
            order = conn.execute('''INSERT INTO mf_orders(order_id,business_name,owner_user_id,preparation_mode)
                VALUES (%s,%s,%s,%s) RETURNING *''',(order_id,body.business_name,user['user_id'],body.preparation_mode)).fetchone()
            record_event(conn,settings,actor=user['user_id'],action='order.draft.created',object_type='order',object_id=order_id,reason='Draft security foundation')
            return projection(conn,user,order)

    @api.get('/orders')
    def orders(request: Request):
        with transaction(settings) as conn:
            user = identity(conn,request)
            # Iterate a server cursor until a page of AUTHORIZED rows is filled. A foreign row must
            # neither become a public cursor nor make a user's later orders unreachable.
            cursor = request.query_params.get('after','')
            visible = []
            with conn.cursor(name='visible_orders') as rows:
                rows.execute('SELECT * FROM mf_orders WHERE order_id>%s ORDER BY order_id',(cursor,))
                for item in rows:
                    if allowed(conn,user['user_id'],'orders.read',order_id=item['order_id']):
                        visible.append(projection(conn,user,item))
                    if len(visible)==101:
                        break
            return {'items':visible[:100], 'next':visible[99]['order_id'] if len(visible)>100 else None}

    @api.get('/orders/{order_id}')
    def order(order_id: str, request: Request):
        with transaction(settings) as conn:
            user = identity(conn,request)
            require(conn,user,'orders.read',order_id=order_id)
            return projection(conn,user,conn.execute('SELECT * FROM mf_orders WHERE order_id=%s',(order_id,)).fetchone())

    @api.patch('/orders/{order_id}/draft')
    def save_draft(order_id: str, body: Draft, request: Request):
        with transaction(settings) as conn:
            user = identity(conn,request)
            conn.execute('SELECT order_id FROM mf_orders WHERE order_id=%s FOR UPDATE',(order_id,))
            require(conn,user,'orders.draft.write',order_id=order_id)
            version = request.headers.get('if-match','').strip('"')
            if not version.isdigit():
                error(428,'VERSION_REQUIRED')
            order = conn.execute('''UPDATE mf_orders SET business_name=%s,preparation_mode=%s,
                optimistic_lock_version=optimistic_lock_version+1,updated_at=now()
                WHERE order_id=%s AND optimistic_lock_version=%s RETURNING *''',
                (body.business_name,body.preparation_mode,order_id,int(version))).fetchone()
            if not order:
                error(412,'REVISION_CONFLICT')
            record_event(conn,settings,actor=user['user_id'],action='order.draft.saved',object_type='order',object_id=order_id,
                         reason='Draft metadata saved',version=order['optimistic_lock_version'])
            return projection(conn,user,order)

    @api.post('/orders/{order_id}/submit')
    def submit(order_id: str, request: Request, body: SubmitRequest):
        with transaction(settings) as conn:
            user = identity(conn,request)
            require(conn,user,'orders.submit',order_id=order_id)
            verified(user)
            return order_revisions.submit(conn,settings,user['user_id'],order_id,body,request.headers.get('idempotency-key'),request.headers.get('if-match'))

    @api.post('/orders/{order_id}/approve')
    def approve(order_id: str, request: Request, body: OrderApproval):
        with transaction(settings) as conn:
            user = identity(conn,request)
            require(conn,user,'orders.approve',order_id=order_id)
            verified(user)
            from .production_final import approve as approve_exact
            return approve_exact(conn,settings,user,order_id,body)

    @api.get('/orders/{order_id}/history')
    def history(order_id: str, request: Request):
        with transaction(settings) as conn:
            user = identity(conn,request)
            require(conn,user,'orders.read',order_id=order_id)
            # Client history contains public event names/timestamps, never raw audit details or actor PII.
            rows = conn.execute('''SELECT action,created_at,object_version FROM mf_audit WHERE object_type='order'
                AND object_id=%s AND action IN ('order.draft.created','order.draft.saved') ORDER BY created_at''',(order_id,)).fetchall()
            return {'items':rows}

    @api.post('/orders/{order_id}/assign-manager')
    def assign(order_id: str, body: Assignment, request: Request):
        with transaction(settings) as conn:
            user = identity(conn,request)
            require(conn,user,'orders.assign_manager',order_id=order_id)
            verified(user)
            order = conn.execute('SELECT * FROM mf_orders WHERE order_id=%s FOR UPDATE',(order_id,)).fetchone()
            if body.manager_id:
                target, roles = staff_target(conn,body.manager_id)
                if roles != {'manager'} or target['account_status'] != 'active':
                    error(422,'ACTIVE_MANAGER_REQUIRED')
            assignment_id = uuid4()
            conn.execute('''INSERT INTO mf_manager_assignments(assignment_id,order_id,from_manager_id,to_manager_id,created_by,reason)
                VALUES (%s,%s,%s,%s,%s,%s)''',(assignment_id,order_id,order['assigned_manager_id'],body.manager_id,user['user_id'],body.reason))
            conn.execute('''UPDATE mf_orders SET assigned_manager_id=%s,optimistic_lock_version=optimistic_lock_version+1,
                updated_at=now() WHERE order_id=%s''',(body.manager_id,order_id))
            record_event(conn,settings,actor=user['user_id'],action='manager.reassigned' if order['assigned_manager_id'] else 'manager.assigned',
                         object_type='order',object_id=order_id,reason='Assignment history recorded')
            return {'assignment_id':assignment_id,'assigned_manager_id':body.manager_id}

    @api.get('/orders/{order_id}/assignments')
    def assignments(order_id: str, request: Request):
        with transaction(settings) as conn:
            user = identity(conn,request)
            require(conn,user,'orders.assign_manager',order_id=order_id)
            verified(user)
            return {'items':conn.execute('SELECT * FROM mf_manager_assignments WHERE order_id=%s ORDER BY created_at,assignment_id',(order_id,)).fetchall()}

    @api.post('/admin/staff',status_code=201)
    def create_staff(body: Staff, request: Request):
        encoded = password_hash(body.password)
        try:
            with transaction(settings) as conn:
                user = admin(conn,request,'users.staff.create')
                uid = uuid4()
                conn.execute('INSERT INTO mf_users(user_id,email,password_hash) VALUES (%s,%s,%s)',(uid,body.email,encoded))
                conn.execute('INSERT INTO mf_user_roles VALUES (%s,%s)',(uid,body.role))
                record_event(conn,settings,actor=user['user_id'],action='staff.created',object_type='user',object_id=uid,reason='Staff created without implicit grants')
                return {'user_id':uid,'role':body.role,'email_verified':False}
        except UniqueViolation:
            error(409,'STAFF_UNAVAILABLE')

    @api.get('/admin/staff')
    def staff(request: Request):
        with transaction(settings) as conn:
            admin(conn,request,'users.staff.create')
            return {'items':conn.execute('''SELECT u.user_id,u.email,u.account_status,r.role FROM mf_users u
                JOIN mf_user_roles r USING(user_id) WHERE r.role<>'client' ORDER BY u.created_at LIMIT 200''').fetchall()}

    @api.put('/admin/staff/{user_id}/role')
    def set_role(user_id: UUID, body: Role, request: Request):
        with transaction(settings) as conn:
            user = admin(conn,request,'users.roles.write')
            _, old_roles = staff_target(conn,user_id)
            conn.execute('DELETE FROM mf_user_roles WHERE user_id=%s',(user_id,))
            conn.execute('INSERT INTO mf_user_roles VALUES (%s,%s)',(user_id,body.role))
            # A role change must not carry old grants into a more privileged scope.
            conn.execute('UPDATE mf_permission_grants SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(user_id,))
            record_event(conn,settings,actor=user['user_id'],action='staff.role.changed',object_type='user',object_id=user_id,reason='Role '+','.join(sorted(old_roles))+' -> '+body.role+'; previous grants revoked')
            return {'role':body.role}

    @api.post('/admin/staff/{user_id}/grants',status_code=201)
    def add_grant(user_id: UUID, body: AccessGrant, request: Request):
        with transaction(settings) as conn:
            user = admin(conn,request,'users.roles.write')
            _, roles = staff_target(conn,user_id)
            if '*' in body.permission or not conn.execute('SELECT 1 FROM mf_permissions WHERE permission=%s',(body.permission,)).fetchone():
                error(422,'UNKNOWN_PERMISSION')
            if (body.scope_type=='all' and roles != {'admin'}) or ('service_agent' in roles):
                error(422,'INVALID_SCOPE')
            if (body.scope_type in {'order','job'}) != (body.scope_id is not None):
                error(422,'INVALID_SCOPE')
            if body.scope_type=='assigned' and roles != {'manager'}:
                error(422,'INVALID_SCOPE')
            if body.scope_type=='order' and not conn.execute('SELECT 1 FROM mf_orders WHERE order_id=%s',(body.scope_id,)).fetchone():
                error(422,'INVALID_SCOPE')
            if body.scope_type=='job':
                try:
                    job_id=UUID(body.scope_id)
                except ValueError:
                    error(422,'INVALID_SCOPE')
                if roles != {'production'} or not conn.execute('SELECT 1 FROM mf_production_jobs WHERE job_id=%s',(job_id,)).fetchone():
                    error(422,'INVALID_SCOPE')
            gid = grant(conn,user_id=user_id,permission=body.permission,scope=body.scope_type,scope_id=body.scope_id,actor=user['user_id'])
            record_event(conn,settings,actor=user['user_id'],action='permission.granted',object_type='grant',object_id=gid,reason='Explicit permission and scope')
            return {'grant_id':gid}

    @api.delete('/admin/staff/{user_id}/grants/{grant_id}',status_code=204)
    def revoke_grant(user_id: UUID, grant_id: UUID, request: Request):
        with transaction(settings) as conn:
            user = admin(conn,request,'users.roles.write')
            staff_target(conn,user_id)
            if not conn.execute('''UPDATE mf_permission_grants SET revoked_at=now() WHERE user_id=%s AND grant_id=%s
                AND revoked_at IS NULL RETURNING grant_id''',(user_id,grant_id)).fetchone():
                error(404,'GRANT_NOT_FOUND')
            record_event(conn,settings,actor=user['user_id'],action='permission.revoked',object_type='grant',object_id=grant_id,reason='Grant revoked')

    @api.put('/admin/staff/{user_id}/state')
    def state(user_id: UUID, body: AccountState, request: Request):
        with transaction(settings) as conn:
            user = admin(conn,request,'users.roles.write')
            staff_target(conn,user_id)
            conn.execute('UPDATE mf_users SET account_status=%s,updated_at=now() WHERE user_id=%s',(body.status,user_id))
            if body.status=='blocked':
                conn.execute('UPDATE mf_sessions SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(user_id,))
            record_event(conn,settings,actor=user['user_id'],action='staff.blocked' if body.status=='blocked' else 'staff.unblocked',
                         object_type='user',object_id=user_id,reason='Account state changed')
            return {'account_status':body.status}

    @api.get('/admin/audit')
    def audit(request: Request):
        with transaction(settings) as conn:
            admin(conn,request,'audit.read')
            return {'items':conn.execute('SELECT * FROM mf_audit ORDER BY created_at DESC LIMIT 200').fetchall()}

    def download(conn,user,file_id,head):
        row = conn.execute('SELECT * FROM mf_files WHERE file_id=%s',(file_id,)).fetchone()
        if not row:
            error(404,'FILE_NOT_FOUND')
        from .attachment_api import attachment,download as attachment_download
        if row['kind']=='attachment' or attachment(conn,file_id):
            return attachment_download(conn,settings,user,file_id,head)
        # Internal is a server-controlled classification, independent of name/MIME/URL query.
        if row['classification']=='internal' and 'client' in user['roles']:
            error(403,'PERMISSION_DENIED')
        permission = {'oblx':'orders.oblx.read','source':'files.source.read','preliminary_pdf':'files.preliminary_pdf.read'}.get(row['kind'])
        if not permission or row['status']!='ready' or not row['order_id']:
            error(403,'PERMISSION_DENIED')
        require(conn,user,permission,order_id=row['order_id'],job_id=row['job_id'],file_kind=row['kind'])
        if user['roles']=={'client'} and row['kind']=='source' and (row['created_by']!=user['user_id'] or row['job_id']):
            error(403,'PERMISSION_DENIED')
        if row['kind']=='preliminary_pdf':
            from .document_service import download as document_download
            # No legacy alias can bypass document binding or the current role/scope policy.
            return document_download(conn,settings,user,file_id,head)
        if row['kind']=='oblx':
            verified(user)
        data = read_verified(conn,VolumeStore(settings.storage_root),file_id)
        record_event(conn,settings,actor=user['user_id'],action='file.accessed',object_type='file',object_id=file_id,reason='Authorized private download')
        # Never inline active HTML/SVG or honor user-supplied MIME. Range returns full 200 after authorization.
        return Response(b'' if head else data,media_type='application/octet-stream',
                        headers={'Content-Disposition':'attachment; filename="private-artifact.bin"',
                                 'Content-Length':str(len(data)),'Accept-Ranges':'none'})

    @api.api_route('/files/{file_id}',methods=['GET','HEAD'])
    @api.api_route('/files/{file_id}/download',methods=['GET','HEAD'])
    @api.api_route('/files/{file_id}/preview',methods=['GET','HEAD'])
    def file(file_id: UUID, request: Request):
        with transaction(settings) as conn:
            return download(conn,identity(conn,request),file_id,request.method=='HEAD')

    @api.api_route('/orders/{order_id}/oblx',methods=['GET','HEAD'])
    def oblx(order_id: str, request: Request):
        with transaction(settings) as conn:
            user = identity(conn,request)
            if 'client' in user['roles']:
                error(403,'PERMISSION_DENIED')
            row = conn.execute("SELECT file_id FROM mf_files WHERE order_id=%s AND kind='oblx' AND status='ready' ORDER BY created_at DESC LIMIT 1",(order_id,)).fetchone()
            if not row:
                error(404,'FILE_NOT_FOUND')
            return download(conn,user,row['file_id'],request.method=='HEAD')
    return api
