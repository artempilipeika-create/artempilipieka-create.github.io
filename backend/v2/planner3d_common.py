"""Shared security and validation for the protected Martin Forest 3D workspace."""
from datetime import datetime,timezone,timedelta
from decimal import Decimal,InvalidOperation
from typing import Literal
from uuid import UUID
from pydantic import Field
from .auth_api import StrictModel
from .security import identity,verified,error
from . import catalogue

TRIAL_DAYS=30
STAFF_3D={'admin','manager'}

class DresserState(StrictModel):
    width:int=Field(default=1000,ge=400,le=2000)
    height:int=Field(default=850,ge=400,le=1600)
    depth:int=Field(default=450,ge=300,le=700)
    layout:Literal['drawers','doors','combo','niche']='combo'
    drawer_count:int=Field(default=3,ge=2,le=6)
    base_type:Literal['plinth','legs','wall']='plinth'
    handle_type:Literal['handles','handleless']='handles'
    body_variant_id:UUID|None=None
    front_variant_id:UUID|None=None
    view_mode:Literal['3d','2d']='3d'
    note:str=Field(default='',max_length=1000)

class ProjectCreate(StrictModel):
    name:str=Field(min_length=1,max_length=200)
    state:DresserState=Field(default_factory=DresserState)
class ProjectSave(StrictModel):
    name:str|None=Field(default=None,min_length=1,max_length=200)
    state:DresserState
class ProjectCopy(StrictModel):
    name:str=Field(min_length=1,max_length=200)
class AccessChange(StrictModel):
    days:int=Field(ge=0,le=3650)
    reason:str=Field(min_length=3,max_length=500)

def now(): return datetime.now(timezone.utc)
def is_staff(user): return bool(user['roles']&STAFF_3D)
def access_row(conn,user_id): return conn.execute('SELECT * FROM mf_3d_access WHERE user_id=%s',(user_id,)).fetchone()
def access_projection(conn,user):
    if is_staff(user): return {'allowed':True,'staff_access':True,'trial_available':False,'access_until':None}
    if user['roles']!={'client'}: return {'allowed':False,'staff_access':False,'trial_available':False,'access_until':None}
    row=access_row(conn,user['user_id']);until=row['access_until'] if row else None
    return {'allowed':bool(row and until>now() and user['account_status']=='active'),'staff_access':False,
            'trial_available':row is None and user['account_status']=='active','access_until':until}
def require_3d(conn,request):
    user=identity(conn,request)
    if user['account_status']!='active': error(403,'ACCOUNT_BLOCKED')
    if is_staff(user): verified(user);return user
    if user['roles']!={'client'}: error(403,'PERMISSION_DENIED')
    verified(user);row=access_row(conn,user['user_id'])
    if not row or row['access_until']<=now(): error(403,'3D_ACCESS_REQUIRED')
    return user
def decimal(value):
    try:return Decimal(str(value))
    except (InvalidOperation,ValueError,TypeError):return None
def material(conn,release,variant):
    if not variant:return None
    item=catalogue.get_item(conn,release,variant,'material')
    if decimal(item.get('thickness'))!=Decimal('18'): error(422,'3D_REQUIRES_18MM_MATERIAL')
    return item
def validate_state(conn,release,state):
    material(conn,release,state.body_variant_id);material(conn,release,state.front_variant_id)
