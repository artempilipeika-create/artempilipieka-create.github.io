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
        'open-tall-variants.js','open-tall-variants.json','open-tall-model.js','open-tall-ui.js',
        'cargo-variants.js','cargo-variants.json','cargo-model.js','cargo-ui.js',
        'pullout-dryer-variants.js','pullout-dryer-variants.json','pullout-dryer-model.js','pullout-dryer-ui.js',
        'worktop-fixtures.mjs','worktop-fixture-mesh.mjs','worktop-fixture-ui.mjs','worktop-fixtures.css',
        'material-appearance-ui.mjs','material-appearance.css',
        'showroom.css','finish-catalogue.mjs','execution-artwork.mjs','execution-image-index.mjs','hardware-photos.mjs','execution-ui.mjs','execution-options.mjs','execution-previews.mjs','execution-cards.css','choice-card-ui.js','catalogue-artwork.js','surface-cards.css','appliance-assets.mjs','appliance-finish.mjs','shaft-editor.mjs','room-equipment.mjs','room-equipment-mesh.mjs','equipment-controls.mjs','equipment-placement.mjs','window-preview.svg','socket-editor.mjs','socket-asset.mjs',
        'room-assets/socket-tripo.json','room-assets/socket-tripo.bin','room-assets/socket-tripo-color.webp','room-assets/socket-tripo-rm.webp','room-assets/socket-tripo-normal.webp','room-assets/socket-tripo-preview.webp',
        'accessory-variants.js','accessory-variants.json','accessories.js','accessory-ui.mjs','accessories.css',
        'upper-variants.js','upper-variants.json','upper-model.js','upper-ui.js','upper.css',
        'gola-variants.js','gola-variants.json','gola-model.js','gola-ui.js','gola.css','drawer-variants.js','drawer-variants.json','drawer-model.js','drawer-ui.js','drawer.css','bazis-drawers-import.js',
        'dimensions.mjs','dimension-geometry.mjs','room-dimensions.mjs','dimensions.css',
        'project-autosave.mjs','project-safety.mjs','project-checks.mjs','project-safety.css',
        'automatic-finishes.mjs','wall-finishes.mjs','wall-finish-mesh.mjs','wall-finish-ui.mjs','wall-finishes.css','wall-panel-sources.json',
        'presentation.mjs','presentation-capture.mjs','presentation-ui.mjs','presentation.css',
        'countertop-variants.js','countertop-variants.json','countertops.js','countertop-ui.mjs','countertop.css',
        'vitrine-model.js','vitrine-ui.js','vitrine.css','appliance-tall-ui.js','appliance-tall.css','production-notes.js','production-notes.css','entry.mjs','bridge.js','fallback.mjs','furniture-core.js','furniture-core.mjs','corner-variants.js','tall-variants.js',
        'studio-environment.mjs','studio-render.mjs','state-adapter.mjs','history.mjs','scene.mjs','client-camera.mjs','module-mesh.mjs','vitrine-visuals.mjs','countertop-visuals.mjs','placement.mjs','mobility.mjs','mobility-ui.mjs',
        'interaction.mjs','material-visuals.mjs','room-state.mjs','room-pricing-ui.mjs','room-plan.mjs','room-setup.mjs','room-mesh.mjs','room-setup.css','pricing.mjs','workspace.mjs','workspace.css','planner.css','vendor/three.module.js','vendor/three.core.min.js',
        'vendor/OrbitControls.js','vendor/THREE-LICENSE.txt','vendor/manifest.json',
    }
    planner_files.update('appliance-assets/'+kind+'-tripo'+suffix for kind in ('oven','microwave','sink','faucet','hood','gas_cooker','radiator','gas_boiler','water_heater','window') for suffix in ('.json','.bin','-color.webp','-rm.webp','-normal.webp','-preview.webp'))
    planner_files.update('hardware-photos/'+name for name in (
        '114064.webp',
        '115622.webp',
        '114066.webp',
        '36028.webp',
        '112512.webp',
        '112521.webp',
        '36029.webp',
        '105174.webp',
        '105175.webp',
        '90619.webp',
        '95550.webp',
        '90620.webp',
        '114797.webp',
        '112519.webp',
        '112513.webp',
        '112522.webp',
        '72261.webp',
        '117352.webp',
        '12-0068.webp',
        '15-0341.webp',
        '89609.webp',
        '113285.webp',
        '95551.webp',
        '113272.webp',
    ))
    planner_files.update('execution-card-images/'+name for name in (
        'base-base-execution-gola.webp',
        'base-base-execution-standard.webp',
        'base-base-purpose-shelf.webp',
        'base-base-purpose-sink.webp',
        'base-base-side-left.webp',
        'base-base-side-right.webp',
        'base-double-base-execution-gola.webp',
        'base-double-base-execution-standard.webp',
        'base-double-base-purpose-shelf.webp',
        'cargo-cargo-brand-focus.webp',
        'cargo-cargo-brand-icon.webp',
        'cargo-cargo-brand-norwing.webp',
        'cargo-cargo-execution-gola.webp',
        'cargo-cargo-execution-standard.webp',
        'corner-corner-door_count-1.webp',
        'corner-corner-door_count-2.webp',
        'corner-corner-purpose-shelf.webp',
        'corner-corner-purpose-sink.webp',
        'corner-corner-side-left.webp',
        'corner-corner-side-right.webp',
        'corner-generic-handles-handleless.webp',
        'corner-generic-handles-handles.webp',
        'dishwasher-dishwasher-execution-gola.webp',
        'dishwasher-dishwasher-execution-standard.webp',
        'drawer-drawer-execution-gola.webp',
        'drawer-drawer-execution-standard.webp',
        'drawer-drawer-layout-inner.webp',
        'drawer-drawer-layout-three.webp',
        'drawer-drawer-layout-two.webp',
        'drawer-drawer-opening-push.webp',
        'drawer-drawer-opening-soft.webp',
        'drawer-drawer-system-aq.webp',
        'drawer-drawer-system-ball.webp',
        'drawer-drawer-system-slimbox.webp',
        'dryer-dryer-dryer_brand-flat_line.webp',
        'dryer-dryer-dryer_brand-norwing.webp',
        'dryer-dryer-execution-gola.webp',
        'dryer-dryer-execution-standard.webp',
        'dryer-dryer-system-ball.webp',
        'open-tall-none-open-tall-light_system-none.webp',
        'open-tall-none-open-tall-lighting-both.webp',
        'open-tall-none-open-tall-lighting-left.webp',
        'open-tall-none-open-tall-lighting-right.webp',
        'oven-generic-handles-handleless.webp',
        'oven-generic-handles-handles.webp',
        'tall-appliance-generic-handles-handleless.webp',
        'tall-appliance-generic-handles-handles.webp',
        'tall-appliance-tall-layout-door_oven.webp',
        'tall-appliance-tall-layout-door_oven_micro.webp',
        'tall-appliance-tall-layout-drawer_oven.webp',
        'tall-appliance-tall-layout-drawer_oven_micro.webp',
        'tall-appliance-tall-opening-left.webp',
        'tall-appliance-tall-opening-right.webp',
        'tall-storage-generic-handles-handleless.webp',
        'tall-storage-generic-handles-handles.webp',
        'tall-storage-tall-opening-double.webp',
        'tall-storage-tall-opening-left.webp',
        'tall-storage-tall-opening-right.webp',
        'tall-vitrine-vitrine-lighting-both.webp',
        'tall-vitrine-vitrine-lighting-left.webp',
        'tall-vitrine-vitrine-lighting-right.webp',
        'tall-vitrine-vitrine-opening-left.webp',
        'tall-vitrine-vitrine-opening-right.webp',
        'upper-double-upper-execution-handleless.webp',
        'upper-double-upper-execution-handles.webp',
        'upper-double-upper-execution-push.webp',
        'upper-double-upper-filling-shelves.webp',
        'upper-upper-execution-handleless.webp',
        'upper-upper-execution-handles.webp',
        'upper-upper-execution-push.webp',
        'upper-upper-filling-dryer.webp',
        'upper-upper-filling-shelves.webp',
        'upper-upper-side-left.webp',
        'upper-upper-side-right.webp',
    ))
    planner_files.update('module-card-images/'+name+'.webp' for name in ('open-tall-none','cargo','pullout-dryer','aq-profile','lira-profile','base-single','base-double','base-drawers','base-oven','base-corner','wall-single','wall-double','dishwasher','tall-storage','tall-appliance','tall-vitrine','countertop-standard','countertop-euro','backsplash-glass','backsplash-ldsp','backsplash-tile','plinth'))
    planner_files.update('module-card-images/'+name+'.webp' for name in ('open-wall-278a6a830b87','open-wall-13a68b19bc93','open-wall-52b413624202','open-wall-934509b39a14','open-wall-d8f4b928da18','open-wall-70c93db0d0b6','open-wall-1b01967daa24','waste-standard','waste-gola'))
    planner_files.update('module-card-images/'+name+'.webp' for name in ['backsplash-panel','backsplash-straight','backsplash-left','backsplash-right','backsplash-u']+[f'corner-{side}-{purpose}-{doors}' for side in ('left','right') for purpose in ('sink','shelf') for doors in (1,2)])
    from .material_visuals import manifest,user_textures,user_texture_bytes
    material_assets={'materials/'+r['asset'] for r in manifest()['decors'].values()}
    planner_files.update(material_assets)
    planner_files.update('materials/'+asset for asset in user_textures()['assets'])
    import json
    panels=json.loads((root/'planner/wall-panel-sources.json').read_text())
    planner_files.update('wall-panel-sources/'+v['source_file'] for v in panels)
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
                mime='image/png' if asset.endswith('.png') else 'image/svg+xml' if asset.endswith('.svg') else 'image/webp' if asset.endswith('.webp') else 'image/jpeg'
                return Response(image,media_type=mime,headers={'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'})
        file=root/'planner'/asset
        if not file.is_file():return Response(status_code=404)
        mime='application/octet-stream' if asset.endswith(('.fr3d','.bin')) else 'image/svg+xml' if asset.endswith('.svg') else 'image/webp' if asset.endswith('.webp') else 'image/jpeg' if asset.endswith('.jpg') else 'image/png' if asset.endswith('.png') else 'text/css' if asset.endswith('.css') else 'application/json' if asset.endswith('.json') else 'text/plain' if asset.endswith('.txt') else 'application/javascript'
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
