"""Reviewed refinements after the guarded integration; no live connections."""
from pathlib import Path
import hashlib
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'backend/v2/cabinet_assets/planner'
HASHES={
'bridge.js':'10aafc8084fe00114c44d99e01eb439821a309da2014f27138f8c56650d8a81c',
'entry.mjs':'21578201422550ab513d4f70bd742a0334d4afc377aa1deb4038555e008e7f95',
'placement.mjs':'7d10844bf18101e72752fdd06b7d2d8b8efdbb526de048b152c4d01734c550c6',
'scene.mjs':'9c0c11850e1d67dfc4caa231f50f795316f6b996c1fc7f30ede1cec5b12d15e8',
'module-mesh.mjs':'157de012f4a9a0ef5b65f684ac35d5a39cb166824f4dbc469285f262b253c994',
'planner.css':'0fa21706aa9d87e6ee919ba73dee2637aa2e4fc28f0edbebb0321ec902b6e1ee',
}
def once(s,a,b):
    assert s.count(a)==1,'Changed refinement anchor: '+a[:70]
    return s.replace(a,b,1)
def main():
    if 'before-project' in (BASE/'bridge.js').read_text():
        print('Refinements already applied.');return
    for name,sha in HASHES.items():assert hashlib.sha256((BASE/name).read_bytes()).hexdigest()==sha,name+' changed; review required'
    data={name:(BASE/name).read_text() for name in HASHES}
    s=data['bridge.js']
    s=once(s,'newProject=async function(...args){const result=await oldNew(...args);',"newProject=async function(...args){emit('before-project');const result=await oldNew(...args);")
    s=once(s,'openProject=async function(...args){const result=await oldOpen(...args);',"openProject=async function(...args){emit('before-project');const result=await oldOpen(...args);")
    assert s.count('Promise.resolve(syncControls()).catch')==3
    s=s.replace('Promise.resolve(syncControls()).catch',"Promise.resolve(syncControls()).then(()=>emit('state')).catch")
    data['bridge.js']=s
    s=data['entry.mjs']
    s=once(s,"this.unsubscribe=this.bridge.subscribe(reason=>{","this.unsubscribe=this.bridge.subscribe(reason=>{\n      if(reason==='before-project'){this.interaction?.cancel();return;}")
    s=once(s,"client.textContent=on?'Редактировать':'Просмотр';", "client.textContent=on?'Редактировать':'Просмотр';this.scene.highlight();this.scene.hover(null);")
    data['entry.mjs']=s
    s=data['placement.mjs']
    s=once(s,"const verticalPeers=(a,b,room)=>Math.abs(elevation(a,room)-elevation(b,room))<180&&((tier(a)==='wall')===(tier(b)==='wall'));", "const verticalPeers=(a,b,room)=>{\n  const aw=tier(a)==='wall',bw=tier(b)==='wall';if(aw!==bw)return false;\n  const ay=elevation(a,room),by=elevation(b,room);\n  return Math.abs(ay-by)<180||(aw&&Math.abs(ay+a.height-by-b.height)<180);\n};")
    data['placement.mjs']=s
    s=data['scene.mjs']
    s=once(s,'this.renderer.toneMappingExposure=1.15','this.renderer.toneMappingExposure=1.0')
    s=once(s,"new THREE.HemisphereLight('#ffffff','#b5b7a9',2.25)","new THREE.HemisphereLight('#ffffff','#b5b7a9',1.65)")
    s=once(s,"new THREE.DirectionalLight('#fffaf0',3.1)","new THREE.DirectionalLight('#fffaf0',2.7)")
    s=once(s,'this.controls.maxDistance=28','this.controls.maxDistance=80')
    s=once(s,'this.selectedBox.visible=Boolean(entry?.group.visible&&!this.preview);',"this.selectedBox.visible=Boolean(entry?.group.visible&&!this.preview&&!document.body.classList.contains('planner-client'));")
    data['scene.mjs']=s
    s=data['module-mesh.mjs']
    s=once(s,'this.geometry=new THREE.BoxGeometry(1,1,1);',"this.geometry=new THREE.BoxGeometry(1,1,1);\n    this.facadeEdges=new THREE.EdgesGeometry(this.geometry);\n    this.edgeMaterial=new THREE.LineBasicMaterial({color:0x9ba393,transparent:true,opacity:.34});")
    s=once(s,"this.box(group,'front',f.w,f.h,18,f.cx,f.cy,D/2+11,front,ghost);", "const panel=this.box(group,'front',f.w,f.h,18,f.cx,f.cy,D/2+11,front,ghost);\n      if(panel&&!ghost){const outline=new THREE.LineSegments(this.facadeEdges,this.edgeMaterial);outline.scale.copy(panel.scale);outline.position.copy(panel.position);group.add(outline);}")
    s=once(s,'dispose(){this.geometry.dispose();','dispose(){this.facadeEdges.dispose();this.edgeMaterial.dispose();this.geometry.dispose();')
    data['module-mesh.mjs']=s
    data['planner.css']+='''\n/* Full-screen studio must not inherit account-page scroll space. */
html:has(body.mf-webgl){height:100%;overflow:hidden}
body.mf-webgl{height:100dvh;overflow:hidden}
.mf-webgl .mf3d-cutlist{margin:0}
.mf-webgl .mf3d-cutlist>summary{padding:0;background:transparent}
.mf-webgl #planner-mobile-nav{margin:0;flex-wrap:nowrap}
'''
    for name,s in data.items():(BASE/name).write_text(s)
    p=ROOT/'tests/webgl/core.test.mjs'
    p.write_text(p.read_text()+'''

test('Different-height upper cabinets align without changing legacy height',()=>{
 const upper=item({module_type:'wall_cabinet',height:720,depth:320,base:'wall'});
 const shorter=item({item_id:'b',module_type:'wall_cabinet',height:360,depth:320,base:'wall',x:615,z:0});
 const result=snapItem(shorter,[upper],room,{threshold:45,allowElevation:false});
 assert.equal(result.error,'');assert.equal(result.item.x,600);
 assert.equal(elevation(result.item,room),room.height-shorter.height-500);
});
''')
    p=ROOT/'tests/webgl/browser_checks.py'
    p.write_text(p.read_text()+'''

def test_top_controls_survive_async_inspector_refresh(page,api,settings,admin_user):
    open_planner(page,api);seed(page,13)
    page.locator('#mode-2d').click()
    page.evaluate('MF_PLANNER.bridge.refresh()')
    expect(page.locator('#studio-zoom-in')).to_be_enabled()
    expect(page.locator('#studio-zoom-out')).to_be_enabled()
    expect(page.locator('#mode-2d')).to_have_attribute('aria-pressed','true')
    page.locator('#planner-front').click();page.evaluate('MF_PLANNER.bridge.refresh()')
    expect(page.locator('#planner-front')).to_have_attribute('aria-pressed','true')
    expect(page.locator('#mode-3d')).to_have_attribute('aria-pressed','false')


def test_new_project_cancels_active_drag_without_resurrecting_old_scene(page,api,settings,admin_user):
    open_planner(page,api);seed(page,13);page.locator('#mode-2d').click()
    start=point(page,0);page.mouse.move(start['x'],start['y']);page.mouse.down()
    page.mouse.move(start['x']+35,start['y']+20,steps=5)
    assert page.evaluate('Boolean(MF_PLANNER.interaction.gesture)')
    page.evaluate('MF_PLANNER.bridge.newProject()');page.mouse.up()
    expect(page.locator('#studio-empty-scene')).to_be_visible()
    assert page.evaluate('MF_PLANNER.adapter.items.length')==0
    assert page.evaluate('MF_PLANNER.history.undoStack.length')==0
    assert page.evaluate('MF_PLANNER.scene.controls.enabled') is True
''')
    print('Applied lifecycle, upper-row and visual refinements with regression tests.')
if __name__=='__main__':main()
