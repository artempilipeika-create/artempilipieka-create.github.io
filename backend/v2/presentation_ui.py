"""Stage 7 presentation only: fixed public pages/assets, never a static directory mount."""
from pathlib import Path
from fastapi import APIRouter,Response
from .cabinet_ui import CSP

ROOT=Path(__file__).parent/'ui_assets'
PAGES={'/':'index.html','/index.html':'index.html','/about/':'about/index.html',
       '/services/':'services/index.html','/services/raspil/':'services/raspil/index.html',
       '/services/kromka/':'services/kromka/index.html','/how-it-works/':'how-it-works/index.html',
       '/contacts/':'contacts/index.html','/order/':'order/index.html','/3d/':'3d/index.html'}
ASSETS={'site-v2.css':'text/css','site-nav.js':'application/javascript','favicon.svg':'image/svg+xml','panels.webp':'image/webp'}

def router():
    api=APIRouter()
    def endpoint(path,mime):
        def read(): return Response((ROOT/path).read_bytes(),media_type=mime,headers={'Content-Security-Policy':CSP})
        return read
    for url,path in PAGES.items():
        api.add_api_route(url,endpoint(path,'text/html'),methods=['GET','HEAD'])
    for name,mime in ASSETS.items():
        api.add_api_route('/ui/'+name,endpoint(name,mime),methods=['GET','HEAD'])
    return api
