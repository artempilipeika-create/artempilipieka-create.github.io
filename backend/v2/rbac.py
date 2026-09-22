"""Foundation only: exact grants + current object scope; roles never imply permissions."""


def allowed(conn, user_id, permission, *, order_id=None, job_id=None, file_kind=None):
    if '*' in permission:
        return False
    user = conn.execute('SELECT account_status FROM mf_users WHERE user_id=%s', (user_id,)).fetchone()
    if not user or user['account_status'] == 'disabled':
        return False
    roles = {r['role'] for r in conn.execute('SELECT role FROM mf_user_roles WHERE user_id=%s', (user_id,))}
    if not roles:
        return False
    if file_kind == 'oblx' or permission == 'orders.oblx.read':
        if 'client' in roles or permission != 'orders.oblx.read':
            return False
    if user['account_status'] == 'blocked':
        if roles != {'client'} or permission not in {'orders.read','files.source.read','files.preliminary_pdf.read'}:
            return False
    # Agent scope remains closed while all jobs are blocked. Stage 6 will introduce leases.
    if 'service_agent' in roles:
        return False
    order = None
    if order_id:
        order = conn.execute('SELECT owner_user_id,assigned_manager_id FROM mf_orders WHERE order_id=%s', (order_id,)).fetchone()
        if not order:
            return False
    grants = conn.execute('''SELECT scope_type,scope_id FROM mf_permission_grants
        WHERE user_id=%s AND permission=%s AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())''', (user_id,permission))
    for grant in grants:
        scope = grant['scope_type']
        if scope == 'all' and 'admin' in roles:
            return True
        if scope == 'own' and order and str(order['owner_user_id']) == str(user_id):
            return True
        if scope == 'assigned' and order and str(order['assigned_manager_id']) == str(user_id):
            return True
        if scope == 'order' and order and grant['scope_id'] == order_id:
            return True
        # job scopes intentionally deny until the transport/lease gate is implemented.
    return False
