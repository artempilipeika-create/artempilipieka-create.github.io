"""Personal design workspace. Manager order assignments stay scoped to their orders."""
from .rbac import allowed
from .security import error


def manager_grant(conn,user,permission):
    if user['roles']!={'manager'} or user['account_status']!='active':
        return False
    return bool(conn.execute('''SELECT 1 FROM mf_permission_grants WHERE user_id=%s AND permission=%s
        AND scope_type IN ('own','assigned') AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())
        LIMIT 1''',(user['user_id'],permission)).fetchone())


def can_design(conn,user):
    return allowed(conn,user['user_id'],'orders.draft.write') or manager_grant(conn,user,'orders.draft.write')


def require_design(conn,user):
    if not can_design(conn,user):
        error(403,'PERMISSION_DENIED')
