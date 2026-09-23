"""Client account is a projection of canonical orders/revisions/calculations, never a second model."""
from datetime import datetime,timezone,timedelta
from .security import error
from .domain_api import require
from .rbac import allowed
from .calculation_math import plain
from . import document_service as documents

STATUS={'draft':'Черновик','submitted':'Передан на обработку','review':'На проверке у менеджера',
 'approved':'Согласован','completed':'Завершён','cancelled':'Отменён'}
MODE={'manager_assisted':'С помощью менеджера','self_prepared':'Самостоятельная подготовка'}


def client(user):
    if user['roles']!={'client'}: error(403,'CLIENT_ACCOUNT_REQUIRED')


def visible(conn,order_id,direct=False):
    policy=conn.execute('SELECT * FROM mf_history_policy WHERE singleton').fetchone()
    if direct and policy['direct_history_access']: return True
    days=policy['completed_visibility_days']
    if days is None: return True
    # Legacy completion timestamp only. NC-08 does not invent a new completion event or delete anything.
    row=conn.execute('SELECT to_jsonb(o) data FROM mf_orders o WHERE order_id=%s',(order_id,)).fetchone()
    completed=row['data'].get('completed_at')
    return not completed or datetime.fromisoformat(completed)>datetime.now(timezone.utc)-timedelta(days=days)


def own(conn,user,order_id):
    client(user);require(conn,user,'orders.read',order_id=order_id)
    row=conn.execute('SELECT * FROM mf_orders WHERE order_id=%s AND owner_user_id=%s',(order_id,user['user_id'])).fetchone()
    if not row or not visible(conn,order_id,direct=True): error(404,'ORDER_NOT_FOUND')
    return row


def file_list(conn,user,order_id):
    items=[]
    for f in conn.execute("SELECT * FROM mf_files WHERE order_id=%s AND classification='private' AND kind IN ('source','preliminary_pdf') AND status='ready' AND job_id IS NULL ORDER BY created_at",(order_id,)):
        permission='files.source.read' if f['kind']=='source' else 'files.preliminary_pdf.read'
        if not allowed(conn,user['user_id'],permission,order_id=order_id,file_kind=f['kind']): continue
        if f['kind']=='source':
            if f['created_by']!=user['user_id']: continue
            items.append({'file_id':f['file_id'],'kind':'source','name':'Исходный файл заказа','created_at':f['created_at'],'download_url':'/api/v2/files/'+str(f['file_id'])+'/download'})
        else:
            d=conn.execute('SELECT * FROM mf_documents WHERE file_id=%s',(f['file_id'],)).fetchone()
            if d: items.append({**documents.dto(d),'kind':'preliminary_pdf','name':'Предварительный расчёт','download_url':'/api/v2/documents/'+str(f['file_id'])})
    return plain(items)


def order_view(conn,user,o,detail=False):
    rev=conn.execute('SELECT * FROM mf_order_revisions WHERE revision_id=%s',(o['active_revision_id'],)).fetchone() if o['active_revision_id'] else None
    c=conn.execute('SELECT * FROM mf_calculations WHERE order_id=%s AND revision_id=%s ORDER BY created_at DESC,calculation_id DESC LIMIT 1',
        (o['order_id'],o['active_revision_id'])).fetchone() if rev else None
    can_price=allowed(conn,user['user_id'],'orders.prices.read',order_id=o['order_id']) and allowed(conn,user['user_id'],'calculations.read',order_id=o['order_id'])
    if not can_price: c=None
    state=c['completeness'] if c else 'not_available'
    state_label=('Предварительный расчёт подготовлен' if state=='complete' else 'Требует уточнения стоимости') if c else ('Расчёт после обработки менеджером' if o['preparation_mode']=='manager_assisted' else 'Предварительный расчёт ещё не подготовлен')
    out={'order_id':o['order_id'],'number':o['display_number'],'name':o['business_name'],'created_at':o['created_at'],
      'preparation_mode':o['preparation_mode'],'preparation_label':MODE[o['preparation_mode']],
      'status':o['workflow_status'],'status_label':STATUS.get(o['workflow_status'],'В обработке'),
      'revision_number':rev['revision_number'] if rev else None,'revision_id':rev['revision_id'] if rev else None,
      'optimistic_lock_version':o['optimistic_lock_version'],'calculation_state':state,'calculation_label':state_label,
      'calculation_id':c['calculation_id'] if c else None,'amount':c['result']['total'] if c and state=='complete' else None,
      'documents':file_list(conn,user,o['order_id']),
      'next_step':'Заказ проверит менеджер. Ожидайте согласования.' if o['workflow_status']!='draft' else 'Проверьте расчёт и передайте заказ на обработку.',
      'can_submit':o['workflow_status']=='draft' and bool(user['email_verified_at']) and allowed(conn,user['user_id'],'orders.submit',order_id=o['order_id']),
      'can_generate':bool(c) and allowed(conn,user['user_id'],'documents.generate',order_id=o['order_id'])}
    if detail:
        out['calculation']=documents.presentation(conn,c) if c else None
        out['revisions']=[{'number':r['revision_number'],'created_at':r['created_at'],'status_label':STATUS.get(r['lifecycle'],'Редакция сохранена')} for r in conn.execute('SELECT revision_number,created_at,lifecycle FROM mf_order_revisions WHERE order_id=%s ORDER BY revision_number',(o['order_id'],))]
        out['calculations']=[{'calculation_id':r['calculation_id'],'revision_number':r['revision_number'],'created_at':r['created_at'],'state':r['completeness'],'amount':r['result']['total'],
           'can_generate':allowed(conn,user['user_id'],'documents.generate',order_id=o['order_id'])} for r in conn.execute('SELECT c.*,v.revision_number FROM mf_calculations c JOIN mf_order_revisions v USING(revision_id) WHERE c.order_id=%s ORDER BY c.created_at',(o['order_id'],))] if can_price else []
        from .document_projection import material
        out['materials']=[material(d['material']) for d in (rev['content'].get('details',[]) if rev else []) if d.get('material')]
        out['problem_message']='Параметры заказа требуют проверки специалистом' if rev and rev['content'].get('issues') else None
    return plain(out)


def timeline(conn,order_id):
    rows=[]
    actions={'order.draft.created':'Черновик создан','order.draft.saved':'Черновик обновлён','order.submitted':'Заказ передан на обработку','order.review.started':'Менеджер начал проверку'}
    for r in conn.execute("SELECT action,created_at FROM mf_audit WHERE object_type='order' AND object_id=%s AND action=ANY(%s)",(order_id,list(actions))):
        rows.append({'date':r['created_at'],'label':actions[r['action']]})
    for r in conn.execute('SELECT revision_number,created_at,parent_revision_id,lifecycle FROM mf_order_revisions WHERE order_id=%s',(order_id,)):
        rows.append({'date':r['created_at'],'label':('Редакция менеджера' if r['lifecycle']=='review' else 'Редакция сохранена')+' · '+str(r['revision_number'])})
    for r in conn.execute('SELECT created_at FROM mf_calculations WHERE order_id=%s',(order_id,)): rows.append({'date':r['created_at'],'label':'Предварительный расчёт подготовлен'})
    for r in conn.execute('SELECT created_at,document_version FROM mf_documents WHERE order_id=%s',(order_id,)): rows.append({'date':r['created_at'],'label':'Документ сформирован · версия '+str(r['document_version'])})
    return plain(sorted(rows,key=lambda r:r['date']))
