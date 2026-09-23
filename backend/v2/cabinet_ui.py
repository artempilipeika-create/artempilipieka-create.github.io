"""Only three fixed UI assets, never a mount of public/ or private storage."""
from pathlib import Path
from fastapi import APIRouter,Response

CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"

def router():
    api=APIRouter();root=Path(__file__).parent/'cabinet_assets'
    @api.get('/account')
    @api.get('/account/')
    def account(): return Response((root/'index.html').read_bytes(),media_type='text/html',headers={'Content-Security-Policy':CSP})
    @api.get('/account/app.js')
    def script(): return Response((root/'app.js').read_bytes(),media_type='application/javascript',headers={'Content-Security-Policy':CSP})
    @api.get('/account/app.css')
    def style(): return Response((root/'app.css').read_bytes(),media_type='text/css',headers={'Content-Security-Policy':CSP})
    return api
