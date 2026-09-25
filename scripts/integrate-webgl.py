"""Apply reviewed integration once. Exact input hashes protect concurrent edits.
Runs on the review branch, then tests. No live service or database connections.
"""
from pathlib import Path
import hashlib
ROOT=Path(__file__).resolve().parents[1]
EXPECTED={
'backend/v2/cabinet_assets/3d.js':'1f906fba5efff663fd7f83e447e3560641e675b6799ccdce3404fd27300f7e73',
'backend/v2/cabinet_assets/3d-studio.js':'63c7d41ebc89bce5e5fb3162610c527500eed7efcb7390f95fc3c1ec08c7694a',
'backend/v2/cabinet_assets/constructor.html':'542d6ff1944e52812a35b1b7fc947bbc45a7ac50f5a7ae19d18ed1357045f476',
'backend/v2/cabinet_ui.py':'8fb8c483c464ecb2c94373ba78f99abb9e6139e27b69177c2bc339c23bd36826',
'backend/v2/cabinet_assets/planner/state-adapter.mjs':'f4f87000ab856159dbd53a8ecd0517df03a534ed1052ecae80f88f41088b2171',
'backend/v2/cabinet_assets/planner/placement.mjs':'9b7b05780a33526dc5eed2a9860847e3a2fafadae5038c32ecf4aa91a79e775a',
'backend/v2/cabinet_assets/planner/scene.mjs':'892e82d6689399c75a079ee329e333e0482733318b06aabda0a52505d816ed4d',
}
def once(s,a,b):
    assert s.count(a)==1,'Expected unique anchor: '+a[:90]
    return s.replace(a,b,1)
def main():
    if 'const plannerRequested=' in (ROOT/'backend/v2/cabinet_assets/3d.js').read_text():
        print('Integration already applied; tests verify the resulting files.');return
    for path,sha in EXPECTED.items():assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==sha,path+' changed; review required'
    contents={path:(ROOT/path).read_text() for path in EXPECTED}
    path='backend/v2/cabinet_assets/3d.js';s=contents[path]
    s=once(s,"'use strict';","'use strict';\nconst plannerRequested=document.body.dataset.plannerRequested==='webgl';")
    a=s.index('function facadeCells(it){');b=s.index('\nfunction buildItem(it){',a)
    s=s[:a]+"function facadeCells(it){\n  return globalThis.MF_FURNITURE_CORE.facadeCells(it,templateFor(it));\n}\n"+s[b:]
    s=once(s,"const canvas=$('scene'),ctx=canvas.getContext('2d');","const canvas=$('scene'),ctx=plannerRequested?null:canvas.getContext('2d');")
    s=once(s,'function draw(){','function draw(){\n  if(plannerRequested)return;')
    s=once(s,"  document.body.dataset.ready='true';","  document.body.dataset.appReady='true';\n  if(!plannerRequested)document.body.dataset.ready='true';")
    s=once(s,'canvas.onpointerdown=e=>{','if(!plannerRequested){\ncanvas.onpointerdown=e=>{')
    s=once(s,"\n$('save-project').onclick", "\n}\n\n$('save-project').onclick")
    s=once(s,"window.addEventListener('keydown',e=>{","window.addEventListener('keydown',e=>{\n  if(plannerRequested)return;")
    contents[path]=s
    path='backend/v2/cabinet_assets/3d-studio.js';s=contents[path]
    s=once(s,'  function fitRoom(){',"  function fitRoom(){\n    if(document.body.dataset.plannerRequested==='webgl')return;")
    s=once(s,'  function focusItem(it){',"  function focusItem(it){\n    if(document.body.dataset.plannerRequested==='webgl'){if(it)document.dispatchEvent(new CustomEvent('mf:planner-focus',{detail:it.item_id}));return;}")
    s=once(s,"const errors={version_conflict:","const errors={PROJECT_3D_VERSION_CONFLICT:'Проект изменился на сервере. Откройте актуальную версию перед сохранением.',version_conflict:")
    contents[path]=s
    path='backend/v2/cabinet_assets/constructor.html';s=contents[path]
    s=once(s,'<script defer src="/account/3d.js">','<script defer src="/account/planner/furniture-core.js"></script>\n<script defer src="/account/3d.js">')
    contents[path]=s
    nxt=once(s,'<body class="mf-3d-page mf3d-studio">','<body class="mf-3d-page mf3d-studio" data-planner-requested="webgl">')
    nxt=once(nxt,'</head>','<link rel="stylesheet" href="/account/planner/planner.css">\n<script defer src="/account/planner/bridge.js"></script>\n<script type="module" src="/account/planner/entry.mjs"></script>\n</head>')
    contents['backend/v2/cabinet_assets/constructor-next.html']=nxt
    path='backend/v2/cabinet_ui.py';s=contents[path]
    s=once(s,"def constructor(): return Response((root/'constructor.html').read_bytes()", "def constructor(): return Response((root/'constructor-next.html').read_bytes()")
    routes='''    # Mounted only by the isolated, identity-checked staging v2 application.
    @api.get('/constructor-next')
    def constructor_next(): return Response((root/'constructor-next.html').read_bytes(),media_type='text/html',headers={'Content-Security-Policy':CSP})
    @api.get('/constructor-legacy')
    def constructor_legacy(): return Response((root/'constructor.html').read_bytes(),media_type='text/html',headers={'Content-Security-Policy':CSP})
    planner_files={
        'entry.mjs','bridge.js','fallback.mjs','furniture-core.js','furniture-core.mjs',
        'state-adapter.mjs','history.mjs','scene.mjs','module-mesh.mjs','placement.mjs',
        'interaction.mjs','planner.css','vendor/three.module.js','vendor/three.core.min.js',
        'vendor/OrbitControls.js','vendor/THREE-LICENSE.txt','vendor/manifest.json',
    }
    @api.get('/account/planner/{asset:path}')
    def planner_asset(asset:str):
        if asset not in planner_files:return Response(status_code=404)
        file=root/'planner'/asset
        if not file.is_file():return Response(status_code=404)
        mime='text/css' if asset.endswith('.css') else 'application/json' if asset.endswith('.json') else 'text/plain' if asset.endswith('.txt') else 'application/javascript'
        return Response(file.read_bytes(),media_type=mime,headers={'Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff'})
'''
    s=once(s,"    @api.get('/3d-view')",routes+"    @api.get('/3d-view')");contents[path]=s
    path='backend/v2/cabinet_assets/planner/state-adapter.mjs';s=contents[path]
    s=once(s,"body_variant_id:null,front_variant_id:null,elevation_mm:type==='wall_cabinet'?Math.max(0,Math.min(this.room.height-d.h,this.state.upper_row_elevation_mm??1500)):0",'body_variant_id:null,front_variant_id:null')
    s=once(s,'  insert(it){',"  persistent(it){const value=clone(it);if(!this.bridge.supportsElevation)delete value.elevation_mm;return value;}\n  insert(it){")
    s=s.replace('this.items.push(clone(it))','this.items.push(this.persistent(it))').replace('this.items[idx]=clone(it)','this.items[idx]=this.persistent(it)')
    s=once(s,'  validate(it){',"  validate(it){\n    if(!['x','z','width','height','depth'].every(k=>Number.isInteger(it[k])))return 'Размеры и координаты должны быть целыми миллиметрами';")
    s=once(s,"  setElevation(it,y){return {...it,elevation_mm:Math.round(y)};}","  setElevation(){throw new Error('Отдельная высота навески недоступна в совместимом формате v2');}")
    contents[path]=s
    path='backend/v2/cabinet_assets/planner/placement.mjs';contents[path]=once(contents[path],"  if(tier(it)==='wall'){","  if(tier(it)==='wall'&&options.allowElevation!==false){")
    path='backend/v2/cabinet_assets/planner/scene.mjs';s=contents[path]
    s=once(s,'radius/Math.sin(Math.min(vfov,hfov)/2)*1.1','radius/Math.sin(Math.min(vfov,hfov)/2)*1.02')
    s=once(s,'this.sun.shadow.normalBias=.012','this.sun.shadow.normalBias=.001');contents[path]=s
    path='backend/v2/cabinet_assets/planner/furniture-core.js';s=(ROOT/path).read_text()
    s=once(s,'return{x:x*c-z*s,z:x*s+z*c};','return{x:x*c-z*s||0,z:x*s+z*c||0};');contents[path]=s
    path='backend/v2/cabinet_assets/planner/entry.mjs';s=(ROOT/path).read_text()
    s=once(s,"document.body?.dataset.ready==='true'","(document.body?.dataset.appReady==='true'||document.body?.dataset.ready==='true')")
    s=once(s,"this.ready=true;document.body.dataset.plannerReady='true';","this.ready=true;document.body.dataset.ready='true';document.body.dataset.plannerReady='true';")
    s=once(s,"    if(!this.scene)return;const count=this.adapter.items.length;","    if(!this.scene)return;const count=this.adapter.items.length;\n    get('to-order').disabled=count===0;get('export-bazis').disabled=count===0;")
    contents[path]=s
    path='backend/v2/cabinet_assets/planner/interaction.mjs';s=(ROOT/path).read_text()
    old="return this.change(label,()=>{const it={...source,...patch},error=this.adapter.validate(it);if(error)throw new Error(error);this.adapter.replace(it);});"
    new='''return this.change(label,()=>{
      const it={...source,...patch};
      if(Number.isFinite(patch.depth)&&patch.depth!==source.depth){
        const r=this.adapter.room,delta=(patch.depth-source.depth)/2,clearance=this.options().wallOffset||0;
        if(source.rotation===0&&Math.abs(source.z-source.depth/2+r.depth/2-clearance)<1)it.z+=delta;
        if(source.rotation===180&&Math.abs(r.depth/2-source.z-source.depth/2-clearance)<1)it.z-=delta;
        if(source.rotation===90&&Math.abs(r.width/2-source.x-source.depth/2-clearance)<1)it.x-=delta;
        if(source.rotation===270&&Math.abs(source.x-source.depth/2+r.width/2-clearance)<1)it.x+=delta;
        it.x=Math.round(it.x);it.z=Math.round(it.z);
      }
      const error=this.adapter.validate(it);if(error)throw new Error(error);this.adapter.replace(it);
    });'''
    s=once(s,old,new);contents[path]=s
    path='tests/stage07/browser_checks.py';s=(ROOT/path).read_text()
    s=s.replace("page.get_by_role('button',name='2D',exact=True)","page.locator('#mode-2d')")
    s=once(s,'browser=p.chromium.launch(headless=True)',"browser=p.chromium.launch(headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])")
    contents[path]=s
    for path,text in contents.items():(ROOT/path).write_text(text)
    print('Integrated',len(contents),'files; no database migrations or service configuration changes.')
if __name__=='__main__':main()
