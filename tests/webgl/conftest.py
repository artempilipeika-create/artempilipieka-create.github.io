"""Non-secret layout evidence for release screenshots and failures."""
import json,os
from pathlib import Path
import pytest

@pytest.fixture(autouse=True)
def layout_evidence(request,page):
    yield
    try:
        if not page.locator('body[data-planner-ready="true"]').count():return
        data=page.evaluate('''()=>({viewport:{width:innerWidth,height:innerHeight},root:{scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight},renderer:document.body.dataset.plannerRenderer,elements:['html','body','.mf3d-top','.mf3d-shell','.mf3d-stage','.mf3d-canvas-wrap','#scene','.studio-statusbar','#planner-mobile-nav'].map(selector=>{const el=document.querySelector(selector);if(!el)return{selector};const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {selector,x:r.x,y:r.y,width:r.width,height:r.height,scrollHeight:el.scrollHeight,css:{display:s.display,height:s.height,minHeight:s.minHeight,overflow:s.overflow,position:s.position}};})})''')
        out=Path(os.environ.get('MF_TEST_EVIDENCE_DIR','qa-output/webgl'))/'layout'
        out.mkdir(parents=True,exist_ok=True)
        name=request.node.name.replace('/','_')
        (out/(name+'.json')).write_text(json.dumps(data,indent=2))
    except Exception:
        pass
