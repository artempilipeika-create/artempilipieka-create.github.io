"""Persistence, geometry and order handoff for the protected dresser planner."""
from math import floor
from uuid import uuid4
from psycopg.types.json import Jsonb
from .events import record_event
from .security import error
from . import catalogue,order_revisions
from .calculation_models import RevisionRequest,Detail
from .planner3d_common import DresserState,validate_state

def project(conn,user,project_id,lock=False):
    sql='SELECT * FROM mf_3d_projects WHERE project_id=%s AND owner_user_id=%s'+(' FOR UPDATE' if lock else '')
    row=conn.execute(sql,(project_id,user['user_id'])).fetchone()
    if not row:error(404,'3D_PROJECT_NOT_FOUND')
    if row['status']=='archived':error(409,'3D_PROJECT_ARCHIVED')
    return row
def latest(conn,project_id):
    row=conn.execute('SELECT * FROM mf_3d_project_revisions WHERE project_id=%s ORDER BY version DESC LIMIT 1',(project_id,)).fetchone()
    if not row:error(409,'3D_PROJECT_EMPTY')
    return row
def projection(conn,row,revision=None):
    revision=revision or latest(conn,row['project_id']);state=revision['state']
    def selected(key):
        ident=state.get(key);return catalogue.get_item(conn,row['catalogue_release_id'],ident,'material') if ident else None
    return {'project_id':row['project_id'],'name':row['name'],'kind':row['kind'],'status':row['status'],
      'catalogue_release_id':row['catalogue_release_id'],'linked_order_id':row['linked_order_id'],
      'optimistic_lock_version':row['optimistic_lock_version'],'created_at':row['created_at'],'updated_at':row['updated_at'],
      'revision_version':revision['version'],'state':state,'body_material':selected('body_variant_id'),'front_material':selected('front_variant_id')}
def insert_revision(conn,user_id,project_id,version,state):
    rid=uuid4();conn.execute('INSERT INTO mf_3d_project_revisions(revision_id,project_id,version,state,created_by) VALUES(%s,%s,%s,%s,%s)',
      (rid,project_id,version,Jsonb(state.model_dump(mode='json')),user_id));return rid
def create_project(conn,settings,user,name,state,release=None):
    release=release or catalogue.active(conn)
    if not release:error(409,'CATALOGUE_NOT_PUBLISHED')
    if not conn.execute('SELECT 1 FROM mf_catalogue_release_seals WHERE release_id=%s',(release,)).fetchone():error(409,'SEALED_CATALOGUE_REQUIRED')
    validate_state(conn,release,state);pid=uuid4()
    conn.execute("INSERT INTO mf_3d_projects(project_id,owner_user_id,name,kind,catalogue_release_id) VALUES(%s,%s,%s,'dresser',%s)",(pid,user['user_id'],name,release))
    insert_revision(conn,user['user_id'],pid,1,state)
    record_event(conn,settings,actor=user['user_id'],action='3d.project.created',object_type='3d_project',object_id=pid,reason='Protected dresser project created')
    return projection(conn,conn.execute('SELECT * FROM mf_3d_projects WHERE project_id=%s',(pid,)).fetchone())
def cutlist(state):
    w,h,d=state.width,state.height,state.depth;t=18;gap=3;base_h=80 if state.base_type=='plinth' else 0;inner=w-2*t
    if inner<=0 or h-base_h-2*t<=0:error(422,'3D_GEOMETRY_INVALID')
    rows=[('Боковина',h-base_h,d,2,'body'),('Крышка/дно',inner,d,2,'body')]
    if state.base_type=='plinth':rows.append(('Цоколь',w,int(round(d*.78)),1,'body'))
    inner_h=h-base_h-2*t
    if state.layout=='drawers':
        n=state.drawer_count;rows.append(('Фасад ящика',w-6,floor((inner_h-(n+1)*gap)/n),n,'front'))
    elif state.layout=='doors': rows.append(('Фасад двери',floor(w/2)-3,inner_h-6,2,'front'))
    elif state.layout=='combo':
        top=floor(inner_h*.42);n=max(2,min(3,state.drawer_count));rows.append(('Фасад ящика',w-6,floor((top-(n+1)*gap)/n),n,'front'));rows.append(('Фасад двери',floor(w/2)-3,inner_h-top-6,2,'front'))
    else:
        niche_h=floor(inner_h*.35);n=max(2,state.drawer_count);rows.append(('Полка ниши',inner,d,1,'body'));rows.append(('Фасад ящика',w-6,floor((inner_h-niche_h-(n+1)*gap)/n),n,'front'))
    if any(a<=0 or b<=0 or q<=0 for _,a,b,q,_ in rows):error(422,'3D_GEOMETRY_INVALID')
    return rows
def detail_models(state):
    if not state.body_variant_id or not state.front_variant_id:error(409,'3D_MATERIALS_REQUIRED')
    out=[]
    for i,(name,length,width,qty,group) in enumerate(cutlist(state),1):
        out.append(Detail(detail_id='3d-'+str(i),name=name,comments='Из 3D-конструктора комода',length=length,width=width,qty=qty,
          variant_id=state.body_variant_id if group=='body' else state.front_variant_id,supply_source='company',rotation=False,grain='unknown',route='solid',packaging=False,edges={}))
    return out
def to_order(conn,settings,user,row):
    rev=latest(conn,row['project_id']);state=DresserState(**rev['state']);validate_state(conn,row['catalogue_release_id'],state);details=detail_models(state)
    if row['linked_order_id']:
        order=conn.execute('SELECT * FROM mf_orders WHERE order_id=%s AND owner_user_id=%s FOR UPDATE',(row['linked_order_id'],user['user_id'])).fetchone()
        if not order or order['workflow_status']!='draft':error(409,'LINKED_ORDER_NOT_DRAFT')
    else:
        oid=str(uuid4());order=conn.execute("INSERT INTO mf_orders(order_id,business_name,owner_user_id,preparation_mode) VALUES(%s,%s,%s,'self_prepared') RETURNING *",(oid,row['name'],user['user_id'])).fetchone()
        record_event(conn,settings,actor=user['user_id'],action='order.draft.created',object_type='order',object_id=oid,reason='Draft created from protected 3D project')
    body=RevisionRequest(parent_revision_id=order['active_revision_id'],catalogue_release_id=row['catalogue_release_id'],reason='Перенос из 3D-конструктора',comment='Исходный 3D-проект: '+str(row['project_id']),details=details)
    made=order_revisions.create(conn,settings,user['user_id'],order,body)
    updated=conn.execute("UPDATE mf_3d_projects SET linked_order_id=%s,status='converted',optimistic_lock_version=optimistic_lock_version+1,updated_at=now() WHERE project_id=%s RETURNING *",(order['order_id'],row['project_id'])).fetchone()
    record_event(conn,settings,actor=user['user_id'],action='3d.project.transferred',object_type='3d_project',object_id=row['project_id'],reason='3D dresser geometry transferred to editable order revision',version=rev['version'])
    return {'project':projection(conn,updated),'order_id':order['order_id'],'revision_id':made['revision_id'],'editor_url':'/editor?order='+order['order_id']}
