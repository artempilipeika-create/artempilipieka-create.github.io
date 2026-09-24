"""Exact grants AND current role ceiling/scope/state. Never a role-only bypass."""
CLIENT_READ = {'orders.read','files.source.read','files.preliminary_pdf.read','orders.prices.read','customers.pii.read','catalogue.read','calculations.read'}
CLIENT_WRITE = {'orders.draft.write','orders.submit','orders.revision.create','orders.approve','templates.own.manage','calculations.create','documents.generate'}
ADMIN_ONLY = {'users.staff.create','users.roles.write','roles.write','orders.assign_manager','audit.read',
              'catalogue.import','catalogue.publish','catalogue.mapping.manage','financial.profiles.manage',
              'production.agents.manage','production.jobs.reconcile'}


def allowed(conn, user_id, permission, *, order_id=None, job_id=None, file_kind=None):
    if '*' in permission:
        return False
    user = conn.execute('SELECT account_status FROM mf_users WHERE user_id=%s',(user_id,)).fetchone()
    if not user or user['account_status'] == 'disabled':
        return False
    roles = {r['role'] for r in conn.execute('SELECT role FROM mf_user_roles WHERE user_id=%s',(user_id,))}
    if not roles or 'service_agent' in roles:
        # Agent v2 uses separate credentials and leased job scope, never browser permissions.
        return False
    if permission in ADMIN_ONLY and roles != {'admin'}:
        return False
    if 'client' in roles and (permission not in CLIENT_READ | CLIENT_WRITE or file_kind in {'oblx','internal','test'}):
        return False
    if user['account_status'] == 'blocked' and (roles != {'client'} or permission not in CLIENT_READ):
        return False
    ceilings = {
        'manager': CLIENT_READ | CLIENT_WRITE | {'orders.oblx.read','templates.manage','orders.review','calculations.fix','discounts.override',
            'production.calculate.enqueue','production.jobs.read','production.jobs.cancel','production.final.create','production.final.review','files.attachments.read','files.attachments.upload','files.attachments.internal.read'},
        'production': {'orders.read','orders.oblx.read','files.source.read','production.jobs.read','production.release','files.attachments.read','files.attachments.internal.read'},
        'accounting': {'orders.read','orders.oblx.read','orders.prices.read','files.preliminary_pdf.read','customers.pii.read','production.jobs.read','files.attachments.read'},
        'viewer': {'orders.read','orders.oblx.read','files.preliminary_pdf.read','files.attachments.read'},
    }
    if any(role in ceilings and permission not in ceilings[role] for role in roles):
        return False
    order = None
    if order_id:
        order = conn.execute('SELECT * FROM mf_orders WHERE order_id=%s',(order_id,)).fetchone()
        if not order:
            return False
    if 'client' in roles and order and order['owner_user_id'] != user_id:
        return False
    if permission == 'orders.draft.write' and order and order['workflow_status'] != 'draft':
        return False
    job = None
    if job_id:
        job = conn.execute('SELECT * FROM mf_production_jobs WHERE job_id=%s AND order_id=%s',(job_id,order_id)).fetchone()
        if not job or job['status'] not in {'blocked','admitted','leased','running','result_uploaded','succeeded','failed','uncertain','cancelled'}:
            return False
    grants = conn.execute('''SELECT scope_type,scope_id FROM mf_permission_grants WHERE user_id=%s
        AND permission=%s AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())''',(user_id,permission))
    for g in grants:
        scope = g['scope_type']
        if 'client' in roles:
            if scope == 'own' and (order or permission in {'orders.draft.write','catalogue.read','templates.own.manage'}):
                return True
            continue
        if scope == 'all' and roles == {'admin'}:
            return True
        if scope == 'assigned' and roles == {'manager'} and order and order['assigned_manager_id'] == user_id:
            return True
        if scope == 'assigned' and roles == {'manager'} and permission == 'catalogue.read' and not order:
            if conn.execute('SELECT 1 FROM mf_orders WHERE assigned_manager_id=%s LIMIT 1',(user_id,)).fetchone():
                return True
        if scope == 'order' and order and g['scope_id'] == order_id:
            # Stage 2 production artifact review requires an explicit job grant, never execute rights.
            if 'production' not in roles or permission in {'production.release','files.attachments.read','files.attachments.internal.read'}:
                return True
        if scope == 'job' and roles == {'production'}:
            if job and g['scope_id'] == str(job_id):
                return True
            if not job_id and order and permission == 'orders.read':
                scoped = conn.execute("SELECT 1 FROM mf_production_jobs WHERE job_id::text=%s AND order_id=%s AND status='blocked'",
                                      (g['scope_id'],order_id)).fetchone()
                if scoped:
                    return True
    return False
