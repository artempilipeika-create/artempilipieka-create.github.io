"""Shared UI smoke for disposable ASGI CI and GET-only published staging verification."""
from playwright.sync_api import expect
from tests.webgl.navigation import panel,close_panels

DONORS=['bazis.0211e4f77fc4','bazis.3079d0656398','bazis.784bf9af84f8']
FIELDS={'body':'body_variant_id','front':'front_variant_id','plinth':'plinthMaterialId','countertop':'countertopMaterialId'}

def row_data(page):
    return page.evaluate('''()=>{const p=MF_PLANNER;return {items:p.adapter.items,runs:MF_FURNITURE_CORE.kitchenRuns(p.adapter.items,p.adapter.room),undo:p.history.undoStack.length,
      conflicts:p.adapter.items.map(it=>MF_FURNITURE_CORE.placementError(it,p.adapter.items,p.adapter.room)),
      parts:p.adapter.items.map(it=>MF_FURNITURE_CORE.productionParts(it,p.adapter.template(it))),
      counters:p.scene.dressing.children.flatMap(g=>g.children.filter(m=>m.userData.role==='counter').map(m=>({size:m.geometry.userData.envelopeMM,variant:m.material.userData.variantId})))}}''')

def choose(page,kind,article):
    panel(page,'right');page.locator('#'+kind+'-search').fill(article)
    page.locator('#'+kind+'-results button').filter(has_text=article).first.click()
    page.wait_for_function('''field=>{const p=MF_PLANNER,id=p.adapter.selected[field],ms=[];p.scene.root.traverse(m=>{if(m.isMesh&&m.material.userData.variantId===id)ms.push(m)});p.scene.dressing.traverse(m=>{if(m.isMesh&&m.material.userData.variantId===id)ms.push(m)});return id&&ms.length&&ms.every(m=>m.material.map?.image?.complete)}''',arg=FIELDS[kind])

def journey(page,check,capture):
    # Start a fresh in-memory scene through existing project restore, never a live write.
    page.evaluate('''()=>{const p=MF_PLANNER;p.bridge.restore({name:'Д1 L + Д2 + Д1 P',scene:{schema_version:2,room:{width:4200,depth:3200,height:2700},items:[],selected_item_id:null,view_mode:'3d'},selectedId:null});p.history.reset();}''')
    panel(page,'left','catalog')
    for donor in DONORS:page.locator('[data-bazis="'+donor+'"]').click()
    data=row_data(page)
    check('Kitchen catalogue row D1 L + D2 + D1 P',len(data['items'])==3 and [i['bazis_id'] for i in data['items']]==DONORS)
    check('Horizontal production rails and real interiors',all(len([p for p in ps if p['key'].startswith('rail-') and p['size']=={'x':564,'y':18,'z':80} and p['orientation']['thickness_axis']=='y'])==2 and any(p['key']=='back' for p in ps) and any(p['key']=='shelf-1' for p in ps) for ps in data['parts']))
    check('One 1800 x 600 countertop from 4100 stock',len(data['runs'])==1 and data['runs'][0]['countertopActualLengthMm']==1800 and data['runs'][0]['countertopStockLengthMm']==4100 and [c['size'] for c in data['counters']]==[[1800,38,600]])
    check('Rear service gap 60 and front overhang 30',all(i['z']-i['depth']/2==-1600+60 and 600-i['rearServiceGapMm']-i['depth']==30 for i in data['items']))
    initial_parts=data['parts']
    panel(page,'right');page.locator('#material-scope').select_option('kitchen')
    check('Whole kitchen outlines preserve material colors',page.evaluate('''()=>{const s=MF_PLANNER.scene;return [...s.kitchenBoxes.values()].filter(b=>b.visible).length===3&&!s.selectedBox.visible;}'''))
    for leg in [80,100,150,100]:
        page.locator('#leg-height').select_option(str(leg));data=row_data(page)
        check('Legs '+str(leg)+' keep 720 mm body and correct plinth',all(i['height']==720+leg and i['body_height']==720 and i['legHeightMm']==leg for i in data['items']) and all(p['size']['y']==leg for p in data['runs'][0]['parts'] if p['role']=='plinth'))
        check('Legs '+str(leg)+' translate without stretching panels',all([p['size'] for p in ps]==[p['size'] for p in initial_parts[n]] for n,ps in enumerate(data['parts'])))
    for kind,article in [('body','W1000 ST9'),('front','H1180 ST37'),('plinth','U708 ST9'),('countertop','H1180 ST37')]:
        before=row_data(page);choose(page,kind,article);after=row_data(page);field=FIELDS[kind]
        check('Bulk '+kind+' uses exactly one history command',after['undo']==before['undo']+1 and len({i[field] for i in after['items']})==1 and bool(after['items'][0][field]))
        check('Bulk '+kind+' keeps other role materials',all(all(a.get(other)==b.get(other) for other in FIELDS.values() if other!=field) for a,b in zip(before['items'],after['items'])))
        page.locator('#planner-undo').click();undone=row_data(page)
        check('One Undo restores all '+kind,all(a.get(field)==b.get(field) for a,b in zip(before['items'],undone['items'])))
        page.locator('#planner-redo').click();redone=row_data(page)
        check('One Redo reapplies all '+kind,all(a.get(field)==b.get(field) for a,b in zip(after['items'],redone['items'])))
    check('Uniform top remains one continuous material mesh',len(row_data(page)['counters'])==1)
    page.locator('#material-scope').select_option('module')
    for kind in FIELDS:
        before=row_data(page);choose(page,kind,'U999 ST7');after=row_data(page);field=FIELDS[kind]
        check('Individual '+kind+' affects only selected cabinet',all(a.get(field)==b.get(field) for a,b in zip(before['items'][:2],after['items'][:2])) and before['items'][2].get(field)!=after['items'][2].get(field))
        page.locator('#planner-undo').click()
    page.locator('#material-scope').select_option('kitchen')
    page.locator('#rear-service-gap').fill('80');page.locator('#rear-service-gap').press('Tab')
    data=row_data(page);check('Changing rear gap preserves countertop wall line',all(i['z']-i['depth']/2==-1520 for i in data['items']) and data['runs'][0]['position']['z']==-1600)
    page.locator('#planner-undo').click()
    for view,button in [('3d','mode-3d'),('front','planner-front'),('top','mode-2d')]:
        close_panels(page);page.locator('#'+button).click()
        for mode in ['normal','inspection','facadesHidden']:
            panel(page,'right');page.locator('#module-display').select_option(mode)
            check(view+' view with '+mode,page.evaluate('MF_PLANNER.scene.mode')==view and page.evaluate('MF_PLANNER.scene.displayMode')==mode)
        page.locator('#module-display').select_option('normal');close_panels(page)
        page.evaluate('MF_PLANNER.scene.fit("kitchen");MF_PLANNER.scene.render()');capture('kitchen-'+view)
    close_panels(page);page.locator('#planner-front').click()
    panel(page,'right');page.locator('#module-display').select_option('facadesHidden');close_panels(page)
    check('Raycaster sees interiors through hidden kitchen facades',page.evaluate('''()=>{const p=MF_PLANNER;return p.adapter.items.every(it=>{const c=p.scene.projectPoint({x:it.x,y:280,z:it.z+it.depth/2+20});return p.scene.pick(c.x,c.y)?.id===it.item_id;});}'''))
    panel(page,'right');page.locator('#module-display').select_option('normal');page.locator('#material-scope').select_option('module')
    # Open every real door without adding the swing envelope to collision.
    for index in range(3):
        page.evaluate('i=>MF_PLANNER.adapter.select(MF_PLANNER.adapter.items[i].item_id)',index)
        page.locator('#toggle-doors').click()
    check('All open doors keep adjacent row collision-free',all(i['doors_open'] for i in row_data(page)['items']) and not any(row_data(page)['conflicts']))
    close_panels(page);page.locator('#mode-3d').click();page.evaluate('MF_PLANNER.scene.fit("kitchen");MF_PLANNER.scene.render()');capture('kitchen-open-interiors')
    # Move away and snap back using existing production interaction and the actual snap result.
    panel(page,'right');page.locator('#pos-x').fill('1500');page.locator('#pos-x').press('Tab')
    check('Moving cabinet splits shared countertop',len(row_data(page)['runs'])==2)
    page.locator('#planner-undo').click();check('Undo movement restores shared countertop',len(row_data(page)['runs'])==1)
    snap=page.evaluate('''async()=>{const {snapItem}=await import('/account/planner/placement.mjs');const p=MF_PLANNER,it=p.adapter.selected,r=snapItem({...it,x:it.x+20,z:it.z+20},p.adapter.items,p.adapter.room,{threshold:45});return {error:r.error,same:r.item.x===it.x&&r.item.z===it.z,guides:r.guides};}''')
    check('Snap restores sibling join and countertop rear edge',snap['same'] and not snap['error'] and len(snap['guides'])>=2)
    before=page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')
    page.locator('#pos-x').fill('610');page.locator('#pos-x').press('Tab')
    check('Real overlap is rejected without changing project',page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')==before)
    page.locator('#width').fill('800');page.locator('#width').press('Tab')
    # A centered width increase intersects the neighbour and must be rejected atomically.
    check('Conflicting resize remains rejected',page.evaluate('MF_PLANNER.adapter.selected.width')==600)
    page.locator('#pos-x').fill('1300');page.locator('#pos-x').press('Tab')
    page.locator('#width').fill('800');page.locator('#width').press('Tab')
    page.locator('#pos-x').fill('1300');page.locator('#pos-x').press('Tab')
    check('Free cabinet width rebuilds production panels',page.evaluate('MF_PLANNER.adapter.selected.width')==800)
    # Place its left side flush with the neighbour (row centres 0,600,1300).
    check('Resized row derives 2000 mm top',row_data(page)['runs'][0]['countertopActualLengthMm']==2000 and len(row_data(page)['runs'])==1)
    page.locator('#remove-item').click();check('Removal recomputes 1200 mm countertop',row_data(page)['runs'][0]['countertopActualLengthMm']==1200)
    page.locator('#planner-undo').click();check('Undo deletion restores 2000 mm countertop',row_data(page)['runs'][0]['countertopActualLengthMm']==2000)
    # Restore standard width and join for the acceptance screenshots / saved fixture.
    page.evaluate('''()=>{const p=MF_PLANNER;p.interaction.modify({width:600,x:1200},'Стандартная ширина');}''')
    panel(page,'right');page.locator('#material-scope').select_option('kitchen');page.locator('#leg-height').select_option('150')
    page.locator('#countertop-thickness').fill('40');page.locator('#countertop-thickness').press('Tab')
    page.locator('#material-scope').select_option('module')
    close_panels(page);page.locator('#mode-3d').click();page.evaluate('MF_PLANNER.scene.fit("kitchen");MF_PLANNER.scene.render()');capture('kitchen-final')
    return row_data(page)
