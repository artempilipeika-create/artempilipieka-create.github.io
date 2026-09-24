from uuid import UUID
from fastapi import APIRouter,Request
from pydantic import Field
from .auth_api import StrictModel
from .db import transaction
from .security import identity,error
from .events import record_event
from .calculation_service import get
from . import document_service as ds,cabinet_service as cs

class Generate(StrictModel): pass
class Profile(StrictModel):
    display_name:str=Field(max_length=200)
    company_name:str=Field(max_length=200)


def router(settings,policy):
    api=APIRouter(prefix='/api/v2')
    @api.post('/calculations/{calculation_id}/documents/preliminary',status_code=201)
    def generate(calculation_id:UUID,body:Generate,request:Request): return ds.generate(settings,request,calculation_id)
    @api.get('/calculations/{calculation_id}/documents')
    def documents(calculation_id:UUID,request:Request):
        with transaction(settings) as c:
            user=identity(c,request);calc=get(c,calculation_id);ds.authorize(c,user,calc['order_id'])
            if 'client' in user['roles'] and not cs.visible(c,calc['order_id'],direct=True): error(404,'ORDER_NOT_FOUND')
            return {'items':[ds.dto(r) for r in c.execute("SELECT d.* FROM mf_documents d JOIN mf_files f USING(file_id) WHERE calculation_id=%s AND f.status='ready' ORDER BY document_version",(calculation_id,))]}
    @api.get('/calculations/{calculation_id}/preview')
    def calculation_preview(calculation_id:UUID,request:Request):
        with transaction(settings) as c:
            user=identity(c,request);calc=get(c,calculation_id);ds.authorize(c,user,calc['order_id'],generate=True)
            if 'client' in user['roles'] and not cs.visible(c,calc['order_id'],direct=True): error(404,'ORDER_NOT_FOUND')
            return ds.presentation(c,calc)
    @api.api_route('/documents/{file_id}',methods=['GET','HEAD'])
    def download(file_id:UUID,request:Request,inline:bool=False):
        with transaction(settings) as c: return ds.download(c,settings,identity(c,request),file_id,request.method=='HEAD',inline)
    @api.get('/account/profile')
    def profile(request:Request):
        with transaction(settings) as c:
            u=identity(c,request);cs.client(u)
            return {k:u.get(k) or '' for k in ('display_name','company_name')}
    @api.patch('/account/profile')
    def save_profile(body:Profile,request:Request):
        with transaction(settings) as c:
            u=identity(c,request);cs.client(u)
            if u['account_status']!='active': error(403,'ACCOUNT_BLOCKED')
            c.execute('UPDATE mf_users SET display_name=%s,company_name=%s,updated_at=now() WHERE user_id=%s',(body.display_name,body.company_name,u['user_id']))
            record_event(c,settings,actor=u['user_id'],action='customer.profile.updated',object_type='user',object_id=u['user_id'],reason='Customer display profile changed')
            return body.model_dump()
    @api.get('/account/orders')
    def orders(request:Request,after:str=''):
        with transaction(settings) as c:
            u=identity(c,request);cs.client(u);items=[]
            for o in c.execute('SELECT * FROM mf_orders WHERE owner_user_id=%s AND order_id>%s ORDER BY order_id',(u['user_id'],after)):
                if cs.visible(c,o['order_id']):
                    cs.own(c,u,o['order_id']);items.append(cs.order_view(c,u,o))
                if len(items)==101: break
            return {'items':items[:100],'next':items[99]['order_id'] if len(items)>100 else None}
    @api.get('/account/orders/{order_id}')
    def detail(order_id:str,request:Request):
        with transaction(settings) as c:
            u=identity(c,request);return cs.order_view(c,u,cs.own(c,u,order_id),True)
    @api.get('/account/orders/{order_id}/timeline')
    def timeline(order_id:str,request:Request):
        with transaction(settings) as c:
            u=identity(c,request);cs.own(c,u,order_id);return {'items':cs.timeline(c,order_id)}
    @api.get('/account/orders/{order_id}/documents')
    def order_documents(order_id:str,request:Request):
        with transaction(settings) as c:
            u=identity(c,request);cs.own(c,u,order_id);return {'items':cs.file_list(c,u,order_id)}
    return api
