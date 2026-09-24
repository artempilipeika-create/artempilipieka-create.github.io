"""Fixed UI assets and compatible presentation aliases, never a mount of public/ or private storage."""
from pathlib import Path
from fastapi import APIRouter,Response

CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"

def router():
    api=APIRouter();root=Path(__file__).parent/'cabinet_assets'
    @api.get('/account.html')
    @api.get('/login')
    @api.get('/login.html')
    @api.get('/register')
    @api.get('/register.html')
    @api.get('/editor')
    @api.get('/order.html')
    @api.get('/staff')
    @api.get('/admin.html')
    @api.get('/constructor.html')
    @api.get('/account')
    @api.get('/account/')
    def account(): return Response((root/'index.html').read_bytes(),media_type='text/html',headers={'Content-Security-Policy':CSP})
    @api.get('/account/app.js')
    def script(): return Response((root/'app.js').read_bytes(),media_type='application/javascript',headers={'Content-Security-Policy':CSP})
    @api.get('/account/app.css')
    def style(): return Response((root/'app.css').read_bytes(),media_type='text/css',headers={'Content-Security-Policy':CSP})
    @api.get('/account/workspace.js')
    def workspace(): return Response((root/'workspace.js').read_bytes(),media_type='application/javascript',headers={'Content-Security-Policy':CSP})
    @api.get('/account/attachments.js')
    def attachments(): return Response((root/'attachments.js').read_bytes(),media_type='application/javascript',headers={'Content-Security-Policy':CSP})
    @api.get('/account/legacy_v9_edges.js')
    def legacy_v9_edges(): return Response((root/'legacy_v9_edges.js').read_bytes(),media_type='application/javascript',headers={'Content-Security-Policy':CSP})
    @api.get('/account/entry_helpers.js')
    def entry_helpers(): return Response((root/'entry_helpers.js').read_bytes(),media_type='application/javascript',headers={'Content-Security-Policy':CSP})
    @api.get('/account/excel_entry.js')
    def excel_entry(): return Response((root/'excel_entry.js').read_bytes(),media_type='application/javascript',headers={'Content-Security-Policy':CSP})
    return api
