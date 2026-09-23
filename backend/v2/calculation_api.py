"""Stage 4 structured API. No PDF, production transport, final price or new UI."""
from uuid import UUID,uuid4
from fastapi import APIRouter,Request
from psycopg.errors import UniqueViolation
from .db import transaction
from .security import identity,verified,error
from .domain_api import require,admin
from .calculation_models import (RevisionRequest,CalculationRequest,RecalculateRequest,ReasonRequest,ProductionProfile,
    TariffBook,PriceBook,DiscountProfile,Defaults,DiscountAssignment,OrderContext)
from . import order_revisions as revisions,calculation_service as calculations,financial_profiles as profiles
from .calculation_math import plain
from .events import record_event


def router(settings,policy):
    api=APIRouter(prefix='/api/v2')

    @api.post('/orders/{order_id}/revisions',status_code=201)
    def revision(order_id:str,body:RevisionRequest,request:Request):
        with transaction(settings) as c:
            user=identity(c,request);require(c,user,'orders.revision.create',order_id=order_id)
            order=revisions.locked(c,order_id,request.headers.get('if-match',''))
            manager=order['workflow_status']!='draft'
            if manager:
                if not user['roles'] & {'admin','manager'}: error(403,'MANAGER_REVISION_REQUIRED')
                verified(user)
            if body.production_profile_id:
                require(c,user,'financial.profiles.manage');verified(user)
            return revisions.create(c,settings,user['user_id'],order,body,manager)

    @api.get('/orders/{order_id}/revisions')
    def history(order_id:str,request:Request):
        with transaction(settings) as c:
            user=identity(c,request);require(c,user,'orders.read',order_id=order_id)
            if not user['roles'] & {'client','manager','admin'}: error(403,'PERMISSION_DENIED')
            return {'items':c.execute('''SELECT revision_id,revision_number,parent_revision_id,lifecycle,content_hash,catalogue_release_id,
                production_profile_id,created_at,submitted_at FROM mf_order_revisions WHERE order_id=%s ORDER BY revision_number''',(order_id,)).fetchall()}

    @api.get('/orders/{order_id}/revisions/{revision_id}')
    def revision_read(order_id:str,revision_id:UUID,request:Request):
        with transaction(settings) as c:
            user=identity(c,request);require(c,user,'orders.read',order_id=order_id)
            if not user['roles'] & {'client','manager','admin'}: error(403,'PERMISSION_DENIED')
            r=revisions.get(c,order_id,revision_id)
            return plain({**{k:r[k] for k in ('revision_id','order_id','revision_number','parent_revision_id','content_hash','lifecycle','catalogue_release_id','production_profile_id','created_at','submitted_at')},
                'details':r['content'].get('details',[]),'issues':r['content'].get('issues',[])})

    @api.post('/orders/{order_id}/calculations',status_code=201)
    def calculation(order_id:str,body:CalculationRequest,request:Request):
        with transaction(settings) as c:
            user=identity(c,request);require(c,user,'calculations.create',order_id=order_id)
            return calculations.create(c,settings,user['user_id'],order_id,body.revision_id)

    @api.get('/calculations/{calculation_id}')
    def calculation_read(calculation_id:UUID,request:Request):
        with transaction(settings) as c:
            user=identity(c,request);r=calculations.get(c,calculation_id);require(c,user,'calculations.read',order_id=r['order_id'])
            return calculations.dto(r['result'])

    @api.get('/orders/{order_id}/calculations')
    def calculation_history(order_id:str,request:Request):
        with transaction(settings) as c:
            user=identity(c,request);require(c,user,'calculations.read',order_id=order_id)
            return {'items':c.execute('''SELECT calculation_id,revision_id,parent_calculation_id,type,completeness,input_hash,engine_version,created_at
                FROM mf_calculations WHERE order_id=%s ORDER BY created_at,calculation_id''',(order_id,)).fetchall()}

    @api.post('/calculations/{calculation_id}/recalculate',status_code=201)
    def recalculate(calculation_id:UUID,body:RecalculateRequest,request:Request):
        with transaction(settings) as c:
            user=identity(c,request);r=calculations.get(c,calculation_id);require(c,user,'calculations.create',order_id=r['order_id'])
            return calculations.create(c,settings,user['user_id'],r['order_id'],r['revision_id'],r['calculation_id'],body.reason)

    @api.post('/calculations/{calculation_id}/fix')
    def fix(calculation_id:UUID,body:ReasonRequest,request:Request):
        with transaction(settings) as c:
            user=identity(c,request);r=calculations.get(c,calculation_id);require(c,user,'calculations.fix',order_id=r['order_id']);verified(user)
            error(409,'BAZIS_RUN_REQUIRED')

    @api.post('/orders/{order_id}/review')
    def review(order_id:str,body:ReasonRequest,request:Request):
        with transaction(settings) as c:
            user=identity(c,request);require(c,user,'orders.review',order_id=order_id);verified(user)
            order=revisions.locked(c,order_id,request.headers.get('if-match',''))
            if order['workflow_status']!='submitted': error(409,'SUBMITTED_REQUIRED')
            row=c.execute("UPDATE mf_orders SET workflow_status='review',optimistic_lock_version=optimistic_lock_version+1,updated_at=now() WHERE order_id=%s RETURNING workflow_status,optimistic_lock_version",(order_id,)).fetchone()
            record_event(c,settings,actor=user['user_id'],action='order.review.started',object_type='order',object_id=order_id,reason=body.reason)
            return row

    def publish(kind,body,request):
        try:
            with transaction(settings) as c:
                user=admin(c,request,'financial.profiles.manage')
                return profiles.publish(c,settings,user['user_id'],kind,body)
        except UniqueViolation: error(409,'FINANCIAL_VERSION_CONFLICT')

    @api.post('/financial/production-profiles',status_code=201)
    def production_profile(body:ProductionProfile,request:Request): return publish('production',body,request)
    @api.post('/financial/tariff-books',status_code=201)
    def tariff_book(body:TariffBook,request:Request): return publish('tariff',body,request)
    @api.post('/financial/price-books',status_code=201)
    def price_book(body:PriceBook,request:Request): return publish('price',body,request)
    @api.post('/financial/discount-profiles',status_code=201)
    def discount_profile(body:DiscountProfile,request:Request): return publish('discount',body,request)

    @api.get('/financial/defaults')
    def defaults_read(request:Request):
        with transaction(settings) as c:
            admin(c,request,'financial.profiles.manage');return plain(profiles.current(c))
    @api.post('/financial/defaults')
    def defaults(body:Defaults,request:Request):
        with transaction(settings) as c:
            user=admin(c,request,'financial.profiles.manage');return profiles.activate(c,settings,user['user_id'],body)
    @api.get('/financial/versions/{kind}/{version_id}')
    def financial_version(kind:str,version_id:UUID,request:Request):
        with transaction(settings) as c:
            admin(c,request,'financial.profiles.manage')
            if kind not in profiles.TABLES: error(404,'VERSION_KIND_NOT_FOUND')
            r=profiles.get(c,kind,version_id)
            if kind in {'price','tariff'}:
                table='mf_sale_price_entries' if kind=='price' else 'mf_tariff_entries'
                r['entries']=c.execute(f'SELECT * FROM {table} WHERE book_id=%s ORDER BY entry_id',(version_id,)).fetchall()
            return plain(r)

    @api.post('/orders/{order_id}/financial-context',status_code=201)
    def financial_context(order_id:str,body:OrderContext,request:Request):
        with transaction(settings) as c:
            user=admin(c,request,'financial.profiles.manage');require(c,user,'orders.read',order_id=order_id)
            revisions.locked(c,order_id,request.headers.get('if-match',''))
            for kind,ident in [('production',body.production_profile_id),('tariff',body.tariff_book_id),('price',body.price_book_id),('discount',body.discount_profile_id)]:
                if ident: profiles.get(c,kind,ident)
            cid=uuid4()
            c.execute('INSERT INTO mf_order_financial_contexts VALUES(%s,%s,%s,%s,%s,%s,%s,%s,now())',
                (cid,order_id,body.production_profile_id,body.tariff_book_id,body.price_book_id,body.discount_profile_id,user['user_id'],body.reason))
            record_event(c,settings,actor=user['user_id'],action='order.financial.context.created',object_type='order',object_id=order_id,reason=body.reason)
            return {'context_id':str(cid),'applies_to':'new calculations; production profile requires a new revision'}

    @api.post('/orders/{order_id}/discount-overrides',status_code=201)
    def discount_override(order_id:str,body:DiscountAssignment,request:Request):
        with transaction(settings) as c:
            user=identity(c,request);require(c,user,'discounts.override',order_id=order_id);verified(user)
            revisions.locked(c,order_id,request.headers.get('if-match',''));profiles.get(c,'discount',body.profile_id)
            oid=uuid4()
            c.execute('INSERT INTO mf_order_discount_overrides VALUES(%s,%s,%s,%s,%s,now())',(oid,order_id,body.profile_id,user['user_id'],body.reason))
            record_event(c,settings,actor=user['user_id'],action='order.discount.overridden',object_type='order',object_id=order_id,reason=body.reason)
            return {'override_id':str(oid),'applies_to':'new calculations only'}

    @api.post('/financial/customers/{customer_id}/discount',status_code=201)
    def customer_discount(customer_id:UUID,body:DiscountAssignment,request:Request):
        with transaction(settings) as c:
            user=admin(c,request,'financial.profiles.manage');profiles.get(c,'discount',body.profile_id)
            if not c.execute("SELECT 1 FROM mf_user_roles WHERE user_id=%s AND role='client'",(customer_id,)).fetchone(): error(422,'CLIENT_REQUIRED')
            aid=uuid4()
            c.execute('INSERT INTO mf_customer_discount_assignments VALUES(%s,%s,%s,%s,%s,now())',(aid,customer_id,body.profile_id,user['user_id'],body.reason))
            record_event(c,settings,actor=user['user_id'],action='customer.discount.assigned',object_type='user',object_id=customer_id,reason=body.reason)
            return {'assignment_id':str(aid),'applies_to':'new calculations only'}
    return api
