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
    @api.get('/account')
    @api.get('/account/')
    def account(): return Response((root/'index.html').read_bytes(),media_type='text/html',headers={'Content-Security-Policy':CSP})
    @api.get('/constructor.html')
    @api.get('/constructor')
    def constructor(): return Response((root/'constructor-next.html').read_bytes(),media_type='text/html',headers={'Content-Security-Policy':CSP})
    # Mounted only by the isolated, identity-checked staging v2 application.
    @api.get('/constructor-next')
    def constructor_next(): return Response((root/'constructor-next.html').read_bytes(),media_type='text/html',headers={'Content-Security-Policy':CSP})
    @api.get('/constructor-legacy')
    def constructor_legacy(): return Response((root/'constructor.html').read_bytes(),media_type='text/html',headers={'Content-Security-Policy':CSP})
    planner_files={
        'showroom.css','shaft-editor.mjs','socket-editor.mjs','socket-asset.mjs',
        'room-assets/socket-tripo.json','room-assets/socket-tripo.bin','room-assets/socket-tripo-color.webp','room-assets/socket-tripo-rm.webp','room-assets/socket-tripo-normal.webp','room-assets/socket-tripo-preview.webp',
        'accessory-variants.js','accessory-variants.json','accessories.js','accessory-ui.mjs','accessories.css',
        'upper-variants.js','upper-variants.json','upper-model.js','upper-ui.js','upper.css',
        'gola-variants.js','gola-variants.json','gola-model.js','gola-ui.js','gola.css','drawer-variants.js','drawer-variants.json','drawer-model.js','drawer-ui.js','drawer.css','bazis-drawers-import.js',
        'dimensions.mjs','dimension-geometry.mjs','room-dimensions.mjs','dimensions.css',
        'project-autosave.mjs','project-safety.mjs','project-checks.mjs','project-safety.css',
        'countertop-variants.js','countertop-variants.json','countertops.js','countertop-ui.mjs','countertop.css',
        'vitrine-model.js','vitrine-ui.js','vitrine.css','appliance-tall-ui.js','appliance-tall.css','production-notes.js','production-notes.css','entry.mjs','bridge.js','fallback.mjs','furniture-core.js','furniture-core.mjs','corner-variants.js','tall-variants.js',
        'studio-environment.mjs','studio-render.mjs','state-adapter.mjs','history.mjs','scene.mjs','client-camera.mjs','module-mesh.mjs','vitrine-visuals.mjs','placement.mjs','mobility.mjs','mobility-ui.mjs',
        'interaction.mjs','material-visuals.mjs','room-state.mjs','room-pricing-ui.mjs','room-plan.mjs','room-setup.mjs','room-mesh.mjs','room-setup.css','pricing.mjs','workspace.mjs','workspace.css','planner.css','vendor/three.module.js','vendor/three.core.min.js',
        'vendor/OrbitControls.js','vendor/THREE-LICENSE.txt','vendor/manifest.json',
    }
    from .material_visuals import manifest,user_textures,user_texture_bytes
    material_assets={'materials/'+r['asset'] for r in manifest()['decors'].values()}
    planner_files.update(material_assets)
    planner_files.update('materials/'+asset for asset in user_textures()['assets'])
    import json
    accessories=json.loads((root/'planner/accessory-variants.json').read_text())
    planner_files.update('accessory-sources/'+v['source_file'] for v in accessories)
    countertops=json.loads((root/'planner/countertop-variants.json').read_text())
    planner_files.update('countertop-sources/'+v['source_file'] for v in countertops)
    planner_files.update('countertop-sources/'+v['joint']+'-'+v['shape']+'.png' for v in countertops)
    @api.get('/account/planner/{asset:path}')
    def planner_asset(asset:str):
        if asset not in planner_files:return Response(status_code=404)
        if asset.startswith('materials/user-'):
            image=user_texture_bytes(asset.removeprefix('materials/'))
            if image is not None:
                mime='image/png' if asset.endswith('.png') else 'image/webp' if asset.endswith('.webp') else 'image/jpeg'
                return Response(image,media_type=mime,headers={'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'})
        file=root/'planner'/asset
        if not file.is_file():return Response(status_code=404)
        mime='application/octet-stream' if asset.endswith(('.fr3d','.bin')) else 'image/webp' if asset.endswith('.webp') else 'image/jpeg' if asset.endswith('.jpg') else 'image/png' if asset.endswith('.png') else 'text/css' if asset.endswith('.css') else 'application/json' if asset.endswith('.json') else 'text/plain' if asset.endswith('.txt') else 'application/javascript'
        return Response(file.read_bytes(),media_type=mime,headers={'Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff'})
    @api.get('/3d-view')
    @api.get('/3d-view.html')
    def three_d_view(): return Response((root/'3d_view.html').read_bytes(),media_type='text/html',headers={'Content-Security-Policy':CSP})
    @api.get('/account/3d.js')
    def three_d_script(): return Response((root/'3d.js').read_bytes(),media_type='application/javascript',headers={'Content-Security-Policy':CSP})
    @api.get('/account/3d-studio.js')
    def studio_script(): return Response((root/'3d-studio.js').read_bytes(),media_type='application/javascript',headers={'Content-Security-Policy':CSP})
    @api.get('/account/3d-studio.css')
    def studio_style(): return Response((root/'3d-studio.css').read_bytes(),media_type='text/css',headers={'Content-Security-Policy':CSP})
    @api.get('/account/3d-view.js')
    def three_d_view_script(): return Response((root/'3d_view.js').read_bytes(),media_type='application/javascript',headers={'Content-Security-Policy':CSP})
    @api.get('/account/3d.css')
    def three_d_style(): return Response((root/'3d.css').read_bytes(),media_type='text/css',headers={'Content-Security-Policy':CSP})
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
