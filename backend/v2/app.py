"""Isolated Stage 2 API. Legacy frontend/router and public storage are never mounted."""
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse, JSONResponse, HTMLResponse
from fastapi.exceptions import RequestValidationError
from .security import WebPolicy
from . import auth_api, domain_api, catalogue_api, calculation_api, document_api, cabinet_ui, production_api
import secrets
import os
from .config import Settings
from .db import connect, check_identity
from .storage import VolumeStore
from .migrate import MIGRATIONS
import hashlib


def readiness(settings):
    with connect(settings) as conn:
        check_identity(conn, settings)
        applied = {r['version']:r['sha256'] for r in conn.execute('SELECT * FROM mf_schema_migrations')}
        expected = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in MIGRATIONS.glob('*.sql')}
        if applied != expected:
            raise ValueError('Migration version mismatch')


def create_app(settings=None, policy=None):
    settings = settings or Settings.from_env()
    enabled = os.environ.get('MF_SECURITY_API','enabled') == 'enabled'
    policy = (policy or WebPolicy.from_env()) if enabled else None

    @asynccontextmanager
    async def lifespan(app):
        readiness(settings)
        VolumeStore(settings.storage_root)
        yield

    app = FastAPI(title='Martin Forest staging foundation', docs_url=None, redoc_url=None,
                  openapi_url=None, lifespan=lifespan)

    @app.middleware('http')
    async def staging_headers(request, call_next):
        if not enabled and request.url.path not in {'/health','/robots.txt'}:
            return JSONResponse({'detail':{'code':'STAGING_API_DISABLED'}},status_code=404,
                                headers={'X-Robots-Tag':'noindex, nofollow','Cache-Control':'no-store'})
        agent_request=request.url.path.startswith('/api/v2/agent/')
        if agent_request and os.environ.get('MF_STAGING_AGENT_API','disabled')!='enabled':
            return JSONResponse({'detail':{'code':'STAGING_AGENT_API_DISABLED'}},status_code=503,
                                headers={'X-Robots-Tag':'noindex, nofollow','Cache-Control':'no-store'})
        if agent_request:
            if request.headers.get('cookie') or request.headers.get('origin'):
                return JSONResponse({'detail':{'code':'AGENT_BROWSER_AUTH_DENIED'}},status_code=403)
            if request.method=='POST':
                if request.headers.get('content-type','').split(';')[0]!='application/json':
                    return JSONResponse({'detail':{'code':'JSON_REQUIRED'}},status_code=415)
                size=0;chunks=[]
                async for chunk in request.stream():
                    size+=len(chunk)
                    if size>5*1024*1024: return JSONResponse({'detail':{'code':'AGENT_BODY_LIMIT'}},status_code=413)
                    chunks.append(chunk)
                request._body=b''.join(chunks)
        if not agent_request and request.method in {'POST','PUT','PATCH','DELETE'} and request.url.path.startswith('/api/v2/'):
            if request.headers.get('origin') != policy.origin:
                return JSONResponse({'detail':{'code':'ORIGIN_DENIED'}},status_code=403,
                                    headers={'X-Robots-Tag':'noindex, nofollow','Cache-Control':'no-store'})
            if request.method != 'DELETE' and request.headers.get('content-type','').split(';')[0] != 'application/json':
                return JSONResponse({'detail':{'code':'JSON_REQUIRED'}},status_code=415)
        response = await call_next(request)
        response.headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive'
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['X-Frame-Options'] = 'DENY'
        return response

    @app.get('/robots.txt', response_class=PlainTextResponse)
    def robots():
        return 'User-agent: *\nDisallow: /\n'

    @app.get('/health')
    def health():
        try:
            readiness(settings)
        except Exception:
            raise HTTPException(503, 'Staging database is not ready') from None
        return {'ok': True, 'environment': 'staging', 'stage': '6', 'agent_transport': 'disabled',
                'staging_agent_api':os.environ.get('MF_STAGING_AGENT_API','disabled'),'native_execution':'calibration_required'}

    if not enabled:
        return app

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # FastAPI's default error echoes submitted fields, including passwords/tokens.
        return JSONResponse({'detail':{'code':'VALIDATION_ERROR'}},status_code=422)

    @app.get('/verify-email',response_class=HTMLResponse)
    def verification_page():
        nonce = secrets.token_urlsafe(24)
        html = """<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="robots" content="noindex">
        <meta name="referrer" content="no-referrer"><title>Подтверждение email</title>
        <h1>Подтверждение email</h1><button id="confirm" type="button">Подтвердить адрес</button><p id="state"></p>
        <script nonce="NONCE">const token=new URLSearchParams(location.hash.slice(1)).get('token');
        history.replaceState(null,'','/verify-email');
        document.getElementById('confirm').onclick=async()=>{
          const response=await fetch('/api/v2/auth/email-verification/confirm',{method:'POST',credentials:'same-origin',
            headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
          document.getElementById('state').textContent=response.ok?'Адрес подтверждён.':'Ссылка недействительна или истекла. Запросите новую.';
        };</script></html>""".replace('NONCE',nonce)
        return HTMLResponse(html,headers={'Content-Security-Policy':
            f"default-src 'none'; script-src 'nonce-{nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"})

    app.include_router(auth_api.router(settings,policy))
    app.include_router(domain_api.router(settings,policy))
    app.include_router(catalogue_api.router(settings,policy))
    app.include_router(calculation_api.router(settings,policy))
    app.include_router(document_api.router(settings,policy))
    app.include_router(production_api.router(settings,policy))
    app.include_router(cabinet_ui.router())
    return app
