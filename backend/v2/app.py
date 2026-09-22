"""Infrastructure-only staging surface. No legacy router, frontend or file mount."""
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
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


def create_app(settings=None):
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app):
        readiness(settings)
        VolumeStore(settings.storage_root)
        yield

    app = FastAPI(title='Martin Forest staging foundation', docs_url=None, redoc_url=None,
                  openapi_url=None, lifespan=lifespan)

    @app.middleware('http')
    async def staging_headers(request, call_next):
        response = await call_next(request)
        response.headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive'
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
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
        return {'ok': True, 'environment': 'staging', 'stage': '0-1', 'agent_transport': 'disabled'}

    return app
