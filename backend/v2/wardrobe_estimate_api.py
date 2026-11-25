"""Personal selling terms and immutable, owner-scoped client estimate documents."""
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import Request, Response
from pydantic import Field

from .auth_api import StrictModel
from .db import transaction
from .constructor_access import require_design
from .sales_album import image_bytes
from .security import error, identity
from .wardrobe_estimate import calculate
from .wardrobe_estimate_pdf import issued_price, render


class Terms(StrictModel):
    markup: Decimal = Field(ge=0,le=Decimal('999999.99'),decimal_places=2,allow_inf_nan=False)


class Issue(StrictModel):
    version: int = Field(ge=1)
    fingerprint: str = Field(pattern=r'^[0-9a-f]{64}$')
    preview_data_url: str | None = Field(default=None,max_length=11_000_000)


def can_price(user):
    return user['account_status'] == 'active' and bool(user['roles'] & {'admin', 'manager'})


def markup(conn, user):
    row = conn.execute('SELECT markup_bp FROM mf_estimate_preferences WHERE user_id=%s',
                       (user['user_id'],)).fetchone()
    return Decimal(row['markup_bp'] if row else 0) / 100


def issued_album_price(conn, project_id, version):
    row = conn.execute("""SELECT cost_date, amount, complete, pdf FROM mf_3d_estimates
        WHERE project_id=%s AND project_version=%s ORDER BY created_at DESC, estimate_id DESC LIMIT 1""",
        (project_id, version)).fetchone()
    if row:
        return issued_price(row['pdf'], row['cost_date'].isoformat(), row['amount'], row['complete'])


def register(api, settings, own):
    from .three_d_api import Scene

    def owner(conn,request):
        user=identity(conn,request)
        if not can_price(user):
            error(403,'MANAGER_ESTIMATE_REQUIRED')
        require_design(conn,user)
        return user

    @api.get('/account/estimate-settings')
    def get_terms(request:Request):
        with transaction(settings) as conn:
            return {'markup':float(markup(conn,owner(conn,request)))}

    @api.put('/account/estimate-settings')
    def set_terms(body:Terms,request:Request):
        with transaction(settings) as conn:
            user=owner(conn,request)
            conn.execute('''INSERT INTO mf_estimate_preferences(user_id,markup_bp) VALUES (%s,%s)
                ON CONFLICT (user_id) DO UPDATE SET markup_bp=EXCLUDED.markup_bp''',(user['user_id'],int(body.markup*100)))
            return {'markup':float(body.markup)}

    @api.post('/3d-estimates/preview')
    def preview(body:Scene,request:Request):
        with transaction(settings) as conn:
            percent=markup(conn,owner(conn,request))
        return calculate(body.model_dump(mode='json'),percent)

    @api.post('/3d-projects/{project_id}/estimates',status_code=201)
    def issue(project_id:UUID,body:Issue,request:Request):
        with transaction(settings) as conn:
            user=owner(conn,request)
            row=own(conn,user,project_id,True)
            if row['version']!=body.version:
                error(409,'PROJECT_3D_VERSION_CONFLICT')
            if not row['scene'].get('items'):
                error(422,'ESTIMATE_EMPTY')
            quote=calculate(row['scene'],markup(conn,user))
            if quote['fingerprint']!=body.fingerprint:
                error(409,'ESTIMATE_CHANGED')
            result=conn.execute('''SELECT estimate_id FROM mf_3d_estimates
                WHERE project_id=%s AND project_version=%s AND fingerprint=%s''',
                (project_id,body.version,body.fingerprint)).fetchone()
            if result:
                return result
            try:
                image=image_bytes(body.preview_data_url)
            except ValueError:
                error(422,'INVALID_3D_PREVIEW')
            pdf=render(row['name'],row['scene'],quote,image)
            ident=uuid4()
            conn.execute('''INSERT INTO mf_3d_estimates
                (estimate_id,project_id,project_version,cost_date,fingerprint,amount,complete,pdf)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)''',
                (ident,project_id,body.version,quote['date'],body.fingerprint,quote['total'],quote['complete'],pdf))
            return {'estimate_id':ident}

    @api.get('/3d-projects/{project_id}/estimates')
    def previous(project_id:UUID,request:Request):
        with transaction(settings) as conn:
            own(conn,owner(conn,request),project_id)
            return {'items':conn.execute('''SELECT estimate_id,project_version,cost_date,amount,complete
                FROM mf_3d_estimates WHERE project_id=%s ORDER BY created_at DESC''',(project_id,)).fetchall()}

    @api.get('/3d-projects/{project_id}/estimates/{estimate_id}.pdf')
    def download(project_id:UUID,estimate_id:UUID,request:Request):
        with transaction(settings) as conn:
            own(conn,owner(conn,request),project_id)
            row=conn.execute('SELECT cost_date,pdf FROM mf_3d_estimates WHERE project_id=%s AND estimate_id=%s',
                             (project_id,estimate_id)).fetchone()
            if not row:
                error(404,'ESTIMATE_NOT_FOUND')
            return Response(bytes(row['pdf']),media_type='application/pdf',
                headers={'Content-Disposition':f'attachment; filename="Martin_Forest_{row["cost_date"]}_{str(estimate_id)[:8]}.pdf"',
                         'Cache-Control':'private, no-store'})
