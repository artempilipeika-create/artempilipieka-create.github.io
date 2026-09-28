"""Same lifecycle journey on real ASGI persistence and published frontend assets."""
from playwright.sync_api import expect
from tests.webgl.navigation import panel,close_panels
from tests.webgl.kitchen_journey import choose

DONORS=['bazis.0211e4f77fc4','bazis.3079d0656398','bazis.784bf9af84f8']
IDENTITY='''()=>{const p=MF_PLANNER;return {
  // Compare manufacturing state, accounting for existing schema defaults and
  // the legacy template_id inferred by normalizeScene on load.
  items:p.adapter.items.map(({template_id,...it})=>({back_variant_id:null,part_materials:{},...it,
    shelves:(it.shelves||[]).map(s=>({material_variant_id:null,source_component:null,...s}))})),
  parts:p.adapter.items.map(it=>MF_FURNITURE_CORE.productionParts(it,p.adapter.template(it))),
  meshes:p.adapter.items.map(it=>{const a=[];p.scene.entries.get(it.item_id).group.traverse(m=>{
    if(m.isMesh)a.push({role:m.userData.role,envelope:m.geometry.userData.envelopeMM,
      position:m.position.toArray(),scale:m.scale.toArray(),variant:m.material.userData.variantId,
      color:m.material.color?.getHex(),roughness:m.material.roughness,metalness:m.material.metalness});
  });return a;})};}'''

def selection_journey(page,check):
    errors=[]
    def page_error(error):errors.append(str(error))
    def console(message):
        if message.type=='error':errors.append(message.text)
    page.on('pageerror',page_error);page.on('console',console)
    def verify(label,condition):
        check('Selection lifecycle: '+label,condition)
        check('Selection lifecycle: console clean after '+label,not errors)
    def bulk():
        panel(page,'right');page.locator('#material-scope').select_option('kitchen')
        verify('all kitchen highlighted',page.evaluate('[...MF_PLANNER.scene.kitchenBoxes.values()].filter(b=>b.visible).length')==3)
    def clean(count,scope='module'):
        data=page.evaluate('''()=>{const p=MF_PLANNER,s=p.scene;return {
          count:s.entries.size,scope:s.selectionScope,ui:document.getElementById('material-scope').value,
          selected:p.adapter.selected?.item_id||null,stored:p.adapter.state.selected_item_id||null,
          valid:[...s.entries].every(([id,e])=>p.adapter.items.some(it=>it.item_id===id)&&e.group.parent===s.root),
          boxes:s.kitchenBoxes.size,hover:s.hoverBox.visible,preview:Boolean(s.preview),
          gesture:Boolean(p.interaction.gesture||p.interaction.catalogueDraft),
          pending:Boolean(p.history.pending),selectedBox:s.selectedBox.visible};}''')
        verify('scene references reconciled',data['count']==count and data['valid'] and not data['hover'] and not data['preview'] and not data['gesture'] and not data['pending'])
        verify('selection scope reconciled',data['scope']==data['ui']==scope and data['boxes']==(count if scope=='kitchen' else 0))
        if not count:verify('empty selection cleared',data['selected'] is None and data['stored'] is None and not data['selectedBox'])
    def save(name):
        close_panels(page);page.locator('#project-name').fill(name);page.locator('#project-name').press('Tab')
        page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
        pid=page.evaluate('MF_PLANNER.adapter.projectId');verify('saved '+name,bool(pid));return pid
    def open_project(name,pid,count):
        panel(page,'left','projects');page.locator('#projects .mf3d-project').filter(has_text=name).first.click()
        page.wait_for_function('id=>MF_PLANNER.adapter.projectId===id',arg=pid)
        expect(page.locator('#status')).to_contain_text('Проект открыт')
        clean(count)
    try:
        if page.evaluate('document.body.classList.contains("planner-client")'):page.locator('#planner-client').click()
        page.set_viewport_size({'width':1440,'height':1000});close_panels(page)
        page.locator('#new-project').click();page.wait_for_function('()=>MF_PLANNER.adapter.items.length===0');clean(0)
        panel(page,'left','catalog')
        for donor in DONORS:page.locator('[data-bazis="'+donor+'"]').click()
        verify('D1 L + D2 + D1 P',page.evaluate('MF_PLANNER.adapter.items.map(it=>it.bazis_id)')==DONORS)
        # Different room key forces the original nested setPresentation/highlight path.
        close_panels(page);page.locator('#planner-room-settings summary').click()
        page.locator('#room-preset').select_option('warm');page.locator('#planner-room-settings summary').click()
        bulk();choose(page,'front','U708 ST9')
        verify('bulk material applied',page.evaluate('new Set(MF_PLANNER.adapter.items.map(it=>it.front_variant_id)).size===1&&Boolean(MF_PLANNER.adapter.items[0].front_variant_id)'))
        a=save('Selection lifecycle A');before=page.evaluate(IDENTITY)
        old=page.evaluate('MF_PLANNER.adapter.items.map(it=>it.item_id)')
        page.locator('#new-project').click();page.wait_for_function('()=>MF_PLANNER.adapter.items.length===0');clean(0)
        verify('old module IDs released',page.evaluate('ids=>ids.every(id=>!MF_PLANNER.scene.entries.has(id)&&!MF_PLANNER.scene.kitchenBoxes.has(id))',old))
        panel(page,'left','catalog');page.locator('[data-bazis="'+DONORS[1]+'"]').click()
        b=save('Selection lifecycle B')
        open_project('Selection lifecycle A',a,3)
        verify('save/load preserves production geometry and materials',page.evaluate(IDENTITY)==before)
        bulk();open_project('Selection lifecycle B',b,1)
        open_project('Selection lifecycle A',a,3)
        # A selected mesh can be rebuilt; its old object must never be reused.
        for index in range(3):
            page.evaluate('i=>MF_PLANNER.adapter.select(MF_PLANNER.adapter.items[i].item_id)',index)
            verify('single selection '+str(index),page.evaluate('MF_PLANNER.scene.selectedBox.visible'))
        close_panels(page);page.locator('#planner-client').click();page.locator('#planner-front').click()
        hit=page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.items[0];return p.scene.projectPoint({x:it.x,y:420,z:it.z+it.depth/2+20});}''')
        verify('Raycaster after reload',page.evaluate('pt=>MF_PLANNER.scene.pick(pt.x,pt.y)?.id===MF_PLANNER.adapter.items[0].item_id',hit))
        page.mouse.click(hit['x'],hit['y'])
        verify('Client click selects live module',page.evaluate('MF_PLANNER.adapter.selected.item_id===MF_PLANNER.adapter.items[0].item_id&&MF_PLANNER.scene.selectedBox.visible'))
        page.locator('#planner-client').click();verify('Technical Client Technical preserves furniture',page.evaluate(IDENTITY)==before)
        bulk();choose(page,'front','U999 ST7')
        page.locator('#planner-undo').click();clean(3,'kitchen')
        verify('Undo bulk material',page.evaluate(IDENTITY)==before)
        page.locator('#planner-redo').click();verify('Redo bulk material',page.evaluate(IDENTITY)!=before)
        page.locator('#planner-undo').click();verify('Undo restored materials',page.evaluate(IDENTITY)==before)
        bulk();page.locator('#remove-item').click()
        verify('delete selected module',page.evaluate('MF_PLANNER.adapter.items.length===2&&MF_PLANNER.scene.entries.size===2&&[...MF_PLANNER.scene.kitchenBoxes.keys()].every(id=>MF_PLANNER.adapter.items.some(it=>it.item_id===id))'))
        page.locator('#planner-undo').click();clean(3,'kitchen');verify('Undo deletion',page.evaluate(IDENTITY)==before)
        page.locator('#planner-redo').click();clean(2,'kitchen')
        panel(page,'right')
        for _ in range(2):page.locator('#remove-item').click()
        clean(0);page.locator('#planner-undo').click();clean(1)
        page.locator('#planner-redo').click();clean(0)
        open_project('Selection lifecycle A',a,3);verify('final saved scene intact',page.evaluate(IDENTITY)==before)
        verify('no stale-object errors',not errors)
    finally:
        page.remove_listener('pageerror',page_error);page.remove_listener('console',console)
