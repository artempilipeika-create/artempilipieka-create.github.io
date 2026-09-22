"""Isolated visual-review deployment around the unchanged v9 application.

No production Bridge, Postgres or Agent credentials are read or configured.
The administrator is only bootstrapped when credentials are explicitly supplied.
"""
import os
from fastapi.responses import HTMLResponse, RedirectResponse
from . import app as legacy

app = legacy.app
app.router.on_startup.remove(legacy.bootstrap_admin)

@app.on_event('startup')
def preview_admin():
    # Never publish the legacy application's well-known default administrator.
    if os.getenv('ADMIN_EMAIL') and os.getenv('ADMIN_PASSWORD'):
        with legacy.SessionLocal() as db:
            email = os.environ['ADMIN_EMAIL'].strip().lower()
            if not db.scalar(legacy.select(legacy.User).where(legacy.User.email == email)):
                db.add(legacy.User(name='Администратор preview', email=email, phone='',
                    password_hash=legacy.hash_password(os.environ['ADMIN_PASSWORD']),
                    role='admin', permissions_json='["*"]'))
                db.commit()

@app.middleware('http')
async def preview_boundaries(request, call_next):
    # The old scraps UI is preserved, but it is an internal staff resource.
    if request.url.path.rstrip('/') in {'/scraps.html','/scraps'}:
        token=request.cookies.get('mf_session')
        user=None
        if token:
            with legacy.SessionLocal() as db:
                session=db.scalar(legacy.select(legacy.SessionToken).where(legacy.SessionToken.token_hash == legacy.token_digest(token)))
                if session and legacy.ensure_aware(session.expires_at)>legacy.utcnow():
                    user=db.get(legacy.User,session.user_id)
        if not user:
            return RedirectResponse('/login.html?next=scraps.html',status_code=303)
        if user.role not in legacy.STAFF_ROLES or user.is_blocked:
            return HTMLResponse('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Внутренний раздел — Martin Forest</title><body style="font:18px/1.7 Arial;background:#f6f3eb;color:#153d2d;padding:10vw"><h1>Раздел для сотрудников</h1><p>Обрезки учитываются во внутреннем производственном разделе.</p><a href="/account.html">В личный кабинет</a></body></html>',status_code=403)
    response=await call_next(request)
    response.headers['X-Robots-Tag']='noindex, nofollow'
    return response
