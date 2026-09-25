'use strict';

const $=id=>document.getElementById(id);
const FACADE_GAP_MM=1.5;

const moduleDefs={
  chest:{name:'Комод',w:1000,h:850,d:450,layout:'combo',drawers:3,base:'plinth'},
  base_cabinet:{name:'Кухня · нижний',w:600,h:720,d:560,layout:'doors',drawers:0,base:'plinth'},
  wall_cabinet:{name:'Кухня · верхний',w:600,h:720,d:320,layout:'doors',drawers:0,base:'wall'},
  tall_cabinet:{name:'Пенал',w:600,h:2200,d:560,layout:'doors',drawers:0,base:'plinth'},
  wardrobe:{name:'Шкаф',w:1200,h:2400,d:600,layout:'doors',drawers:0,base:'plinth'},
  vanity:{name:'Тумба',w:800,h:600,d:500,layout:'drawers',drawers:2,base:'wall'}
};

const kitchenTemplates={
  'base.one_door':{
    category:'Нижние модули',module_type:'base_cabinet',label:'Нижний · 1 дверь',itemName:'Кухня · нижний',
    description:'Один накладной фасад',defaults:{w:400,h:720,d:560,layout:'doors',drawers:0,base:'plinth'},
    limits:{w:[250,650],h:[600,1000],d:[450,700]},front:{kind:'doors',count:1}
  },
  'base.two_door':{
    category:'Нижние модули',module_type:'base_cabinet',label:'Нижний · 2 двери',itemName:'Кухня · нижний · 2 двери',
    description:'Два равных накладных фасада',defaults:{w:800,h:720,d:560,layout:'doors',drawers:0,base:'plinth'},
    limits:{w:[600,1200],h:[600,1000],d:[450,700]},front:{kind:'doors',count:2}
  },
  'base.drawers_2':{
    category:'Нижние модули',module_type:'base_cabinet',label:'Нижний · 2 ящика',itemName:'Кухня · нижний · 2 ящика',
    description:'Два равных фасада ящиков',defaults:{w:600,h:720,d:560,layout:'drawers',drawers:2,base:'plinth'},
    limits:{w:[300,1200],h:[600,1000],d:[450,700]},front:{kind:'drawers',count:2}
  },
  'base.drawers_3':{
    category:'Нижние модули',module_type:'base_cabinet',label:'Нижний · 3 ящика',itemName:'Кухня · нижний · 3 ящика',
    description:'Три равных фасада ящиков',defaults:{w:600,h:720,d:560,layout:'drawers',drawers:3,base:'plinth'},
    limits:{w:[300,1200],h:[600,1000],d:[450,700]},front:{kind:'drawers',count:3}
  },
  'base.drawer_door':{
    category:'Нижние модули',module_type:'base_cabinet',label:'Нижний · ящик + дверь',itemName:'Кухня · нижний · ящик + дверь',
    description:'Верхний ящик и нижний дверной фасад',defaults:{w:600,h:720,d:560,layout:'combo',drawers:1,base:'plinth'},
    limits:{w:[300,900],h:[600,1000],d:[450,700]},front:{kind:'combo',drawerRows:1,drawerRatio:.25,doors:1}
  },
  'base.sink_2door':{
    category:'Нижние модули',module_type:'base_cabinet',label:'Мойка · 2 двери',itemName:'Кухня · мойка · 2 двери',
    description:'Модуль под мойку, два фасада',defaults:{w:800,h:720,d:560,layout:'doors',drawers:0,base:'plinth'},
    limits:{w:[600,1200],h:[600,1000],d:[450,700]},front:{kind:'doors',count:2}
  },
  'wall.one_door':{
    category:'Верхние модули',module_type:'wall_cabinet',label:'Верхний · 1 дверь',itemName:'Кухня · верхний',
    description:'Один накладной фасад',defaults:{w:400,h:720,d:320,layout:'doors',drawers:0,base:'wall'},
    limits:{w:[250,650],h:[300,1400],d:[250,500]},front:{kind:'doors',count:1}
  },
  'wall.two_door':{
    category:'Верхние модули',module_type:'wall_cabinet',label:'Верхний · 2 двери',itemName:'Кухня · верхний · 2 двери',
    description:'Два равных накладных фасада',defaults:{w:800,h:720,d:320,layout:'doors',drawers:0,base:'wall'},
    limits:{w:[600,1200],h:[300,1400],d:[250,500]},front:{kind:'doors',count:2}
  },
  'wall.horizontal':{
    category:'Верхние модули',module_type:'wall_cabinet',label:'Верхний · горизонтальный',itemName:'Кухня · верхний · горизонтальный',
    description:'Один горизонтальный фасад',defaults:{w:800,h:360,d:320,layout:'doors',drawers:0,base:'wall'},
    limits:{w:[450,1400],h:[250,700],d:[250,500]},front:{kind:'doors',count:1}
  },
  'tall.one_door':{
    category:'Пеналы',module_type:'tall_cabinet',label:'Пенал · 1 дверь',itemName:'Пенал',
    description:'Высокий модуль с одним фасадом',defaults:{w:600,h:2200,d:560,layout:'doors',drawers:0,base:'plinth'},
    limits:{w:[300,700],h:[1600,2800],d:[450,700]},front:{kind:'doors',count:1}
  },
  'tall.two_door':{
    category:'Пеналы',module_type:'tall_cabinet',label:'Пенал · 2 двери',itemName:'Пенал · 2 двери',
    description:'Высокий модуль с двумя фасадами',defaults:{w:900,h:2200,d:560,layout:'doors',drawers:0,base:'plinth'},
    limits:{w:[700,1400],h:[1600,2800],d:[450,700]},front:{kind:'doors',count:2}
  }
};

const defaultTemplateByModule={
  base_cabinet:'base.one_door',
  wall_cabinet:'wall.one_door',
  tall_cabinet:'tall.one_door'
};

let user=null,projects=[],project=null,state=null,selectedId=null,viewMode='3d';
let rotY=-.55,rotX=.2,zoom=1,drag=false,px=0,py=0,boxes=[],materials=new Map();

async function api(path,method='GET',body,headers={}){
  const r=await fetch('/api/v2'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!r.ok){
    const d=await r.json().catch(()=>({}));
    throw new Error(d.detail?.code||'Действие недоступно');
  }
  return r.status===204?null:r.json();
}
function status(t){$('status').textContent=t||''}
function uid(){return crypto.randomUUID()}
function mmNumber(v){return Math.round(Number(v)*10)/10}
function mmText(v){return String(mmNumber(v)).replace('.',',')}
function label(m){return m?[m.manufacturer,m.article,m.name,m.thickness?m.thickness+' мм':'',m.length&&m.width?m.length+'×'+m.width:''].filter(Boolean).join(' · '):'Материал не выбран'}
async function material(id){
  if(!id)return null;
  if(materials.has(String(id)))return materials.get(String(id));
  try{
    const m=await api('/catalogue/materials/'+id);
    materials.set(String(id),m);
    return m;
  }catch{return null}
}
function selected(){return state?.items.find(x=>x.item_id===selectedId)||null}
function templateFor(it){return it?.template_id?kitchenTemplates[it.template_id]||null:null}
function inferTemplate(it={}){
  if(it.module_type==='base_cabinet'){
    if(it.layout==='drawers')return Number(it.drawers)>=3?'base.drawers_3':'base.drawers_2';
    if(it.layout==='doors')return Number(it.width)>=700?'base.two_door':'base.one_door';
  }
  if(it.module_type==='wall_cabinet'&&it.layout==='doors')return Number(it.width)>=700?'wall.two_door':'wall.one_door';
  if(it.module_type==='tall_cabinet'&&it.layout==='doors')return Number(it.width)>=700?'tall.two_door':'tall.one_door';
  return null;
}
function legacyItem(s){
  const type=s.module_type||'chest',d=moduleDefs[type]||moduleDefs.chest;
  const it={
    item_id:uid(),module_type:type,template_id:s.template_id||null,name:d.name,x:0,z:0,rotation:0,
    width:s.width||d.w,height:s.height||d.h,depth:s.depth||d.d,layout:s.layout||d.layout,
    drawers:s.drawers??d.drawers,base:s.base||d.base,handles:s.handles||'handles',
    body_variant_id:s.body_variant_id||null,front_variant_id:s.front_variant_id||null
  };
  it.template_id=it.template_id||inferTemplate(it);
  return it;
}
function normalizeItem(x){
  const it={...x};
  if(!it.template_id)it.template_id=inferTemplate(it);
  return it;
}
function normalizeScene(s={}){
  const items=Array.isArray(s.items)&&s.items.length?s.items.map(normalizeItem):[legacyItem(s)];
  const room=s.room||{width:4200,depth:3200,height:2700};
  return{
    schema_version:2,
    room:{width:+room.width||4200,depth:+room.depth||3200,height:+room.height||2700},
    items,
    selected_item_id:s.selected_item_id||items[0]?.item_id||null,
    view_mode:s.view_mode||'3d'
  };
}
function scenePayload(){
  const first=state.items[0]||legacyItem({});
  return{
    module_type:first.module_type,width:first.width,height:first.height,depth:first.depth,layout:first.layout,
    drawers:first.drawers,base:first.base,handles:first.handles,body_variant_id:first.body_variant_id,
    front_variant_id:first.front_variant_id,view_mode:viewMode,schema_version:2,room:{...state.room},
    items:state.items.map(x=>({...x})),selected_item_id:selectedId
  };
}

function addCatalogueButton(root,opt){
  const b=document.createElement('button');
  b.className='mf3d-module';
  if(opt.module)b.dataset.module=opt.module;
  if(opt.template)b.dataset.template=opt.template;
  const strong=document.createElement('strong'),span=document.createElement('span');
  strong.textContent=opt.label;
  span.textContent=opt.description;
  b.append(strong,span);
  b.onclick=()=>opt.template?addTemplate(opt.template):addModule(opt.module);
  root.append(b);
}
function renderModuleCatalogue(){
  const root=$('module-catalogue');
  root.replaceChildren();
  const free=document.createElement('div');
  free.className='mf3d-module-group';
  const freeHead=document.createElement('h3');
  freeHead.textContent='Свободные модули';
  free.append(freeHead);
  addCatalogueButton(free,{module:'chest',label:'Комод',description:'Свободная компоновка'});
  addCatalogueButton(free,{module:'wardrobe',label:'Шкаф',description:'Платяной / полочный'});
  addCatalogueButton(free,{module:'vanity',label:'Тумба',description:'Подвесная / напольная'});
  root.append(free);

  for(const category of['Нижние модули','Верхние модули','Пеналы']){
    const group=document.createElement('div');
    group.className='mf3d-module-group';
    const h=document.createElement('h3');
    h.textContent=category;
    group.append(h);
    for(const [id,t] of Object.entries(kitchenTemplates)){
      if(t.category!==category)continue;
      const module=defaultTemplateByModule[t.module_type]===id?t.module_type:null;
      addCatalogueButton(group,{template:id,module,label:t.label,description:t.description});
    }
    root.append(group);
  }
}

async function loadProjects(){
  const d=await api('/3d-projects');
  projects=d.items;
  renderProjects();
}
function renderProjects(){
  $('projects').replaceChildren();
  if(!projects.length){
    const p=document.createElement('p');
    p.textContent='Сохранённых проектов пока нет.';
    p.className='muted';
    $('projects').append(p);
  }
  for(const p of projects){
    const b=document.createElement('button');
    b.className='mf3d-project'+(project?.project_id===p.project_id?' active':'');
    const strong=document.createElement('strong'),span=document.createElement('span');
    strong.textContent=p.name;
    span.textContent='v'+p.version+' · '+new Date(p.updated_at).toLocaleString('ru-RU');
    b.append(strong,span);
    b.onclick=()=>openProject(p.project_id);
    $('projects').append(b);
  }
}
function renderItems(){
  $('scene-items').replaceChildren();
  for(const it of state.items){
    const b=document.createElement('button');
    b.className='mf3d-project'+(it.item_id===selectedId?' active':'');
    const strong=document.createElement('strong'),span=document.createElement('span');
    strong.textContent=it.name;
    span.textContent=it.width+'×'+it.height+'×'+it.depth;
    b.append(strong,span);
    b.onclick=()=>{
      selectedId=it.item_id;
      state.selected_item_id=selectedId;
      syncControls();
      updateAll();
    };
    $('scene-items').append(b);
  }
}
async function openProject(id){
  project=await api('/3d-projects/'+id);
  state=normalizeScene(project.scene);
  selectedId=state.selected_item_id||state.items[0]?.item_id;
  $('project-name').value=project.name;
  viewMode=state.view_mode;
  await hydrateMaterials();
  syncRoom();
  setMode(viewMode);
  await syncControls();
  updateAll();
  renderProjects();
  status('Проект открыт.');
}
async function hydrateMaterials(){
  for(const it of state.items)for(const id of[it.body_variant_id,it.front_variant_id])if(id)await material(id);
}
async function saveProject(){
  state.selected_item_id=selectedId;
  state.view_mode=viewMode;
  const body={name:$('project-name').value.trim()||'3D-проект',scene:scenePayload()};
  if(project)project=await api('/3d-projects/'+project.project_id,'PATCH',{...body,version:project.version});
  else project=await api('/3d-projects','POST',body);
  await loadProjects();
  status('Проект сохранён.');
}
async function newProject(){
  project=null;
  state={schema_version:2,room:{width:4200,depth:3200,height:2700},items:[],selected_item_id:null,view_mode:'3d'};
  selectedId=null;
  $('project-name').value='Новый 3D-проект';
  syncRoom();
  addModule('chest',false);
  setMode('3d');
  updateAll();
  renderProjects();
  status('Новый проект.');
}
async function duplicateProject(){
  if(!project)await saveProject();
  project=await api('/3d-projects/'+project.project_id+'/duplicate','POST',{});
  await loadProjects();
  await openProject(project.project_id);
  status('Создана копия проекта.');
}
async function deleteProject(){
  if(!project)return;
  if(!confirm('Удалить этот 3D-проект?'))return;
  await api('/3d-projects/'+project.project_id,'DELETE');
  project=null;
  await loadProjects();
  await newProject();
}
async function shareProject(){
  if(!project)await saveProject();
  const d=await api('/3d-projects/'+project.project_id+'/shares','POST',{});
  $('share-url').value=location.origin+d.url;
  $('share-panel').hidden=false;
  status('Ссылка только для просмотра создана.');
}
async function copyShare(){
  const value=$('share-url').value;
  if(!value)return;
  try{
    await navigator.clipboard.writeText(value);
    status('Ссылка скопирована.');
  }catch{
    $('share-url').select();
    status('Скопируйте выделенную ссылку.');
  }
}
async function downloadSpec(){
  if(!project)await saveProject();
  const a=document.createElement('a');
  a.href='/api/v2/3d-projects/'+project.project_id+'/specification.pdf';
  a.download='Martin_Forest_3D_Project.pdf';
  document.body.append(a);
  a.click();
  a.remove();
  status('PDF проекта сформирован.');
}

function itemNumberFor(type,templateId){
  return state.items.filter(x=>templateId?x.template_id===templateId:x.module_type===type&&!x.template_id).length+1;
}
function addTemplate(templateId,announce=true){
  const t=kitchenTemplates[templateId];
  if(!t)return;
  const d=t.defaults,n=itemNumberFor(t.module_type,templateId);
  const it={
    item_id:uid(),module_type:t.module_type,template_id:templateId,item_name:t.itemName,
    name:t.itemName+(n>1?' '+n:''),x:Math.min(1200,state.items.length*250),
    z:-Math.max(0,state.room.depth/2-d.d/2-100),rotation:0,width:d.w,height:d.h,depth:d.d,
    layout:d.layout,drawers:d.drawers,base:d.base,handles:'handles',body_variant_id:null,front_variant_id:null
  };
  delete it.item_name;
  state.items.push(it);
  selectedId=it.item_id;
  state.selected_item_id=selectedId;
  syncControls();
  updateAll();
  if(announce)status(t.label+' добавлен в проект.');
}
function addModule(type,announce=true){
  if(defaultTemplateByModule[type])return addTemplate(defaultTemplateByModule[type],announce);
  const d=moduleDefs[type]||moduleDefs.chest,n=itemNumberFor(type,null);
  const it={
    item_id:uid(),module_type:type,template_id:null,name:d.name+(n>1?' '+n:''),
    x:Math.min(1200,state.items.length*250),z:-Math.max(0,state.room.depth/2-d.d/2-100),rotation:0,
    width:d.w,height:d.h,depth:d.d,layout:d.layout,drawers:d.drawers,base:d.base,handles:'handles',
    body_variant_id:null,front_variant_id:null
  };
  state.items.push(it);
  selectedId=it.item_id;
  state.selected_item_id=selectedId;
  syncControls();
  updateAll();
  if(announce)status(d.name+' добавлен в проект.');
}
function removeItem(){
  if(!selected())return;
  if(state.items.length===1){
    status('В проекте должен остаться хотя бы один модуль.');
    return;
  }
  state.items=state.items.filter(x=>x.item_id!==selectedId);
  selectedId=state.items[0].item_id;
  syncControls();
  updateAll();
  status('Модуль удалён из проекта.');
}

function syncRoom(){
  $('room-width').value=state.room.width;
  $('room-depth').value=state.room.depth;
  $('room-height').value=state.room.height;
}
function applyLimits(it,t){
  const defs={w:[300,3000],h:[300,3000],d:[200,1200]};
  for(const [id,key] of[['width','w'],['height','h'],['depth','d']]){
    const lim=t?.limits?.[key]||defs[key];
    $(id).min=String(lim[0]);
    $(id).max=String(lim[1]);
  }
}
async function syncControls(){
  const it=selected();
  $('item-controls').hidden=!it;
  if(!it){
    renderItems();
    return;
  }
  const t=templateFor(it);
  $('item-title').textContent=it.name;
  $('template-info').textContent=t
    ?t.label+' · '+t.description+' · накладные фасады, зазор 1,5 мм по каждой стороне.'
    :'Свободная компоновка. Накладные фасады считаются с зазором 1,5 мм по каждой стороне.';
  applyLimits(it,t);
  for(const [id,key] of[['width','width'],['height','height'],['depth','depth'],['pos-x','x'],['pos-z','z'],['rotation','rotation'],['layout','layout'],['drawers','drawers'],['base','base'],['handles','handles']])$(id).value=String(it[key]);
  $('layout').disabled=Boolean(t);
  $('drawers').disabled=Boolean(t);
  $('layout-control').title=t?'Компоновка задаётся выбранным шаблоном модуля.':'';
  $('drawers-control').title=t?'Количество фасадов задаётся выбранным шаблоном модуля.':'';
  $('body-selected').textContent=label(await material(it.body_variant_id));
  $('front-selected').textContent=label(await material(it.front_variant_id));
  renderItems();
}
async function searchMaterial(input,results,kind){
  const q=input.value.trim();
  results.replaceChildren();
  if(q.length<2)return;
  const d=await api('/catalogue/materials?q='+encodeURIComponent(q)+'&limit=8');
  for(const m of d.items){
    const b=document.createElement('button');
    b.type='button';
    b.textContent=label(m);
    b.onclick=()=>{
      const it=selected();
      if(!it)return;
      materials.set(String(m.variant_id),m);
      it[kind+'_variant_id']=m.variant_id;
      $(kind+'-selected').textContent=label(m);
      results.replaceChildren();
      input.value='';
      updateAll();
    };
    results.append(b);
  }
}

function setMode(mode){
  viewMode=mode;
  $('mode-2d').className=mode==='2d'?'':'secondary';
  $('mode-3d').className=mode==='3d'?'':'secondary';
  $('scene-help').textContent=mode==='3d'?'Мышь — вращение · колесо — масштаб':'2D · план помещения сверху';
  updateAll();
}
function colorFor(m,front=false){
  const s=((m?.name||'')+' '+(m?.article||'')).toLowerCase();
  if(s.includes('зел'))return'#718a77';
  if(s.includes('бел'))return front?'#f0eee7':'#dad7ce';
  if(s.includes('сер'))return'#848b87';
  if(s.includes('чер')||s.includes('графит'))return'#424844';
  if(s.includes('дуб')||s.includes('орех'))return'#a47d59';
  return front?'#91ab82':'#b89470';
}
function rotateXZ(x,z,r){
  const a=r*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return{x:x*c-z*s,z:x*s+z*c};
}
function addItemBox(it,w,h,d,x,y,z,color){
  const p=rotateXZ(x,z,it.rotation),odd=it.rotation===90||it.rotation===270;
  boxes.push({w:odd?d:w,h,d:odd?w:d,x:it.x+p.x,y,z:it.z+p.z,color});
}
function legacyFrontSpec(it){
  if(it.layout==='drawers')return{kind:'drawers',count:Math.max(1,it.drawers||1)};
  if(it.layout==='doors')return{kind:'doors',count:it.width>=900?2:1};
  if(it.layout==='combo')return{kind:'combo',drawerRows:Math.max(2,Math.min(3,it.drawers||2)),drawerRatio:.42,doors:it.width>=900?2:1};
  if(it.layout==='niche')return{kind:'niche',drawerRows:Math.max(2,it.drawers||2),nicheRatio:.35};
  return{kind:'doors',count:1};
}
function facadeCells(it){
  const t=templateFor(it),spec=t?.front||legacyFrontSpec(it);
  const baseH=it.base==='plinth'?80:0;
  const x0=-it.width/2,y0=baseH,W=it.width,H=Math.max(1,it.height-baseH),g=FACADE_GAP_MM,cells=[];
  const cell=(kind,x,y,w,h)=>{
    const fw=Math.max(1,w-2*g),fh=Math.max(1,h-2*g);
    cells.push({kind,w:mmNumber(fw),h:mmNumber(fh),cx:mmNumber(x+w/2),cy:mmNumber(y+h/2)});
  };
  if(spec.kind==='doors'){
    const n=Math.max(1,spec.count||1),cw=W/n;
    for(let i=0;i<n;i++)cell('door',x0+i*cw,y0,cw,H);
  }else if(spec.kind==='drawers'){
    const n=Math.max(1,spec.count||it.drawers||1),ch=H/n;
    for(let i=0;i<n;i++)cell('drawer',x0,y0+i*ch,W,ch);
  }else if(spec.kind==='combo'){
    const topH=H*(spec.drawerRatio||.42),bottomH=H-topH;
    const doors=Math.max(1,spec.doors||1),doorW=W/doors;
    for(let i=0;i<doors;i++)cell('door',x0+i*doorW,y0,doorW,bottomH);
    const rows=Math.max(1,spec.drawerRows||1),rh=topH/rows;
    for(let i=0;i<rows;i++)cell('drawer',x0,y0+bottomH+i*rh,W,rh);
  }else if(spec.kind==='niche'){
    const nicheH=H*(spec.nicheRatio||.35),bottomH=H-nicheH,rows=Math.max(1,spec.drawerRows||2),rh=bottomH/rows;
    for(let i=0;i<rows;i++)cell('drawer',x0,y0+i*rh,W,rh);
  }
  return cells;
}
function buildItem(it){
  const S=1/500,W=it.width*S,H=it.height*S,D=it.depth*S,t=18*S;
  const bc=colorFor(materials.get(String(it.body_variant_id))),fc=colorFor(materials.get(String(it.front_variant_id)),true);
  const baseH=it.base==='plinth'?80*S:0;
  const wallLift=it.module_type==='wall_cabinet'?Math.max(0,(state.room.height-it.height-500))*S:0;
  const y0=wallLift;
  addItemBox(it,t,H-baseH,D,-W/2+t/2,y0+baseH+(H-baseH)/2,0,bc);
  addItemBox(it,t,H-baseH,D,W/2-t/2,y0+baseH+(H-baseH)/2,0,bc);
  addItemBox(it,W-2*t,t,D,0,y0+H-t/2,0,bc);
  addItemBox(it,W-2*t,t,D,0,y0+baseH+t/2,0,bc);
  if(it.base==='plinth')addItemBox(it,W,baseH,D*.78,0,y0+baseH/2,0,bc);
  if(it.layout==='niche'){
    const inner=H-baseH-2*t,nh=inner*.35;
    addItemBox(it,W-2*t,t,D*.92,0,y0+H-t-nh,0,bc);
  }
  const frontT=18*S,fz=D/2+frontT/2+.004;
  for(const f of facadeCells(it))addItemBox(it,f.w*S,f.h*S,frontT,f.cx*S,y0+f.cy*S,fz,fc);
}
function buildBoxes(){
  boxes=[];
  const S=1/500,r=state.room;
  boxes.push({w:r.width*S,h:.035,d:r.depth*S,x:0,y:-.02,z:0,color:'#d6d1c5'});
  boxes.push({w:r.width*S,h:r.height*S,d:.035,x:0,y:r.height*S/2,z:-r.depth*S/2,color:'#eef0e9'});
  boxes.push({w:.035,h:r.height*S,d:r.depth*S,x:-r.width*S/2,y:r.height*S/2,z:0,color:'#e7eae4'});
  for(const it of state.items)buildItem(it);
}

function cutlistItem(it){
  const t=18,inner=Math.max(1,it.width-2*t),baseH=it.base==='plinth'?80:0,a=[],prefix=it.name+' · ';
  a.push([prefix+'Боковина',it.height-baseH,it.depth,2,'body',it]);
  a.push([prefix+'Крышка/дно',inner,it.depth,2,'body',it]);
  if(it.base==='plinth')a.push([prefix+'Цоколь',it.width,Math.round(it.depth*.78),1,'body',it]);
  if(['tall_cabinet','wardrobe'].includes(it.module_type))a.push([prefix+'Полка',inner,it.depth,Math.max(2,Math.floor(it.height/500)),'body',it]);
  if(it.layout==='niche')a.push([prefix+'Полка ниши',inner,it.depth,1,'body',it]);

  const grouped=new Map();
  for(const f of facadeCells(it)){
    const name=f.kind==='drawer'?'Фасад ящика':'Фасад двери';
    const key=name+'|'+f.w+'|'+f.h;
    if(!grouped.has(key))grouped.set(key,{name,w:f.w,h:f.h,qty:0});
    grouped.get(key).qty++;
  }
  for(const g of grouped.values())a.push([prefix+g.name,g.w,g.h,g.qty,'front',it]);
  return a;
}
function allCutlist(){return state.items.flatMap(cutlistItem)}
function renderCutlist(){
  const rows=allCutlist(),t=document.createElement('table');
  t.innerHTML='<thead><tr><th>Деталь</th><th>Размер</th><th>Кол.</th><th>Материал</th></tr></thead><tbody></tbody>';
  for(const r of rows){
    const tr=document.createElement('tr');
    const mat=r[4]==='front'?materials.get(String(r[5].front_variant_id)):materials.get(String(r[5].body_variant_id));
    for(const v of[r[0],mmText(r[1])+'×'+mmText(r[2]),r[3],label(mat)]){
      const td=document.createElement('td');
      td.textContent=v;
      tr.append(td);
    }
    t.tBodies[0].append(tr);
  }
  $('cutlist').replaceChildren(t);
}

function hexRgb(h){h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}
function shade(h,f){
  const[r,g,b]=hexRgb(h);
  return'rgb('+Math.max(0,Math.min(255,r*f|0))+','+Math.max(0,Math.min(255,g*f|0))+','+Math.max(0,Math.min(255,b*f|0))+')';
}
function tf(p){
  let{x,y,z}=p,cy=Math.cos(rotY),sy=Math.sin(rotY),cx=Math.cos(rotX),sx=Math.sin(rotX);
  const x1=cy*x+sy*z,z1=-sy*x+cy*z,y1=cx*y-sx*z,z2=sx*y+cx*z;
  return{x:x1,y:y1,z:z2};
}
function proj3(p,w,h){
  const t=tf(p),dist=10*zoom,sc=5.4/(dist-t.z),s=Math.min(w,h)*.29;
  return{x:w/2+t.x*sc*s,y:h*.61-t.y*sc*s,z:t.z};
}
function faces(b){
  const x0=b.x-b.w/2,x1=b.x+b.w/2,y0=b.y-b.h/2,y1=b.y+b.h/2,z0=b.z-b.d/2,z1=b.z+b.d/2;
  const v=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]].map(x=>({x:x[0],y:x[1],z:x[2]}));
  return[[0,1,2,3,.72],[4,5,6,7,1.05],[0,4,7,3,.84],[1,5,6,2,.92],[3,2,6,7,1.15],[0,1,5,4,.65]].map(f=>({verts:f.slice(0,4).map(i=>v[i]),sh:f[4],c:b.color}));
}
const canvas=$('scene'),ctx=canvas.getContext('2d');
function sizeCanvas(){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,r.width),h=Math.max(1,r.height);
  if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr)){
    canvas.width=Math.floor(w*dpr);
    canvas.height=Math.floor(h*dpr);
  }
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return{w,h};
}
function draw2d(w,h){
  ctx.fillStyle='#f4f2eb';
  ctx.fillRect(0,0,w,h);
  const pad=45,scale=Math.min((w-pad*2)/state.room.width,(h-pad*2)/state.room.depth),ox=w/2,oz=h/2;
  ctx.fillStyle='#fff';
  ctx.strokeStyle='#9aa99d';
  ctx.lineWidth=2;
  ctx.fillRect(ox-state.room.width*scale/2,oz-state.room.depth*scale/2,state.room.width*scale,state.room.depth*scale);
  ctx.strokeRect(ox-state.room.width*scale/2,oz-state.room.depth*scale/2,state.room.width*scale,state.room.depth*scale);
  for(const it of state.items){
    const odd=it.rotation===90||it.rotation===270,ww=(odd?it.depth:it.width)*scale,dd=(odd?it.width:it.depth)*scale,x=ox+it.x*scale,y=oz+it.z*scale;
    ctx.fillStyle=it.item_id===selectedId?'#73917d':'#aebdaf';
    ctx.fillRect(x-ww/2,y-dd/2,ww,dd);
    ctx.strokeStyle='#153d2d';
    ctx.strokeRect(x-ww/2,y-dd/2,ww,dd);
    ctx.fillStyle='#153d2d';
    ctx.font='11px Arial';
    ctx.textAlign='center';
    ctx.fillText(it.name,x,y+4);
  }
}
function draw3d(w,h){
  const g=ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0,'#edf4ee');
  g.addColorStop(1,'#d8e4db');
  ctx.fillStyle=g;
  ctx.fillRect(0,0,w,h);
  const fs=[];
  for(const b of boxes)fs.push(...faces(b));
  for(const f of fs){
    f.p=f.verts.map(v=>proj3(v,w,h));
    f.z=f.p.reduce((s,p)=>s+p.z,0)/4;
  }
  fs.sort((a,b)=>a.z-b.z);
  for(const f of fs){
    ctx.beginPath();
    ctx.moveTo(f.p[0].x,f.p[0].y);
    for(let i=1;i<4;i++)ctx.lineTo(f.p[i].x,f.p[i].y);
    ctx.closePath();
    ctx.fillStyle=shade(f.c,f.sh);
    ctx.fill();
    ctx.strokeStyle='rgba(25,45,31,.16)';
    ctx.stroke();
  }
}
function draw(){
  const{w,h}=sizeCanvas();
  if(state){
    if(viewMode==='2d')draw2d(w,h);
    else draw3d(w,h);
  }
  requestAnimationFrame(draw);
}
function updateAll(){
  if(!state)return;
  buildBoxes();
  renderCutlist();
  renderItems();
  $('room-badge').textContent=state.room.width+'×'+state.room.depth+'×'+state.room.height;
  $('item-badge').textContent=state.items.length+' '+(state.items.length===1?'предмет':'предметов');
}

async function toOrder(){
  for(const it of state.items)if(!it.body_variant_id||!it.front_variant_id)throw new Error('Выберите материалы корпуса и фасадов для всех модулей.');
  await saveProject();
  const o=await api('/orders','POST',{business_name:$('project-name').value.trim()||'3D-проект',preparation_mode:'self_prepared'});
  const rel=await api('/catalogue/releases'),rows=allCutlist();
  const details=rows.map(r=>({
    detail_id:uid(),name:r[0],comments:'Из 3D-проекта '+$('project-name').value,
    length:String(mmNumber(r[1])),width:String(mmNumber(r[2])),qty:r[3],
    variant_id:(r[4]==='front'?r[5].front_variant_id:r[5].body_variant_id),
    supply_source:'company',rotation:false,grain:'unknown',route:'solid',packaging:false,edges:{}
  }));
  await api('/orders/'+o.order_id+'/revisions','POST',{
    parent_revision_id:null,catalogue_release_id:rel.active_release,reason:'Перенос из 3D-проекта',
    comment:'Создано из сохранённого 3D-проекта '+project.project_id,details
  },{'If-Match':String(o.optimistic_lock_version)});
  location.assign('/editor?order='+encodeURIComponent(o.order_id));
}

async function start(){
  try{user=await api('/auth/me')}catch{location.assign('/login');return}
  renderModuleCatalogue();
  await loadProjects();
  await newProject();
  document.body.dataset.ready='true';
  status('3D готов.');
  draw();
}

for(const id of['room-width','room-depth','room-height'])$(id).oninput=()=>{
  const key={'room-width':'width','room-depth':'depth','room-height':'height'}[id];
  state.room[key]=+$(id).value||state.room[key];
  updateAll();
};
for(const [id,key]of[['width','width'],['height','height'],['depth','depth'],['pos-x','x'],['pos-z','z']])$(id).oninput=()=>{
  const it=selected();
  if(it){
    it[key]=+$(id).value||0;
    updateAll();
  }
};
for(const [id,key]of[['rotation','rotation'],['layout','layout'],['drawers','drawers'],['base','base'],['handles','handles']])$(id).onchange=()=>{
  const it=selected();
  if(it){
    it[key]=id==='rotation'||id==='drawers'?+$(id).value:$(id).value;
    updateAll();
  }
};

$('body-search').oninput=()=>searchMaterial($('body-search'),$('body-results'),'body');
$('front-search').oninput=()=>searchMaterial($('front-search'),$('front-results'),'front');
$('remove-item').onclick=removeItem;
$('mode-2d').onclick=()=>setMode('2d');
$('mode-3d').onclick=()=>setMode('3d');
$('reset-view').onclick=()=>{rotY=-.55;rotX=.2;zoom=1};
canvas.onpointerdown=e=>{
  if(viewMode!=='3d')return;
  drag=true;px=e.clientX;py=e.clientY;canvas.setPointerCapture(e.pointerId);
};
canvas.onpointermove=e=>{
  if(!drag)return;
  rotY+=(e.clientX-px)*.008;
  rotX=Math.max(-.55,Math.min(.65,rotX+(e.clientY-py)*.004));
  px=e.clientX;py=e.clientY;
};
canvas.onpointerup=()=>drag=false;
canvas.onwheel=e=>{
  if(viewMode!=='3d')return;
  e.preventDefault();
  zoom=Math.max(.55,Math.min(2,zoom+Math.sign(e.deltaY)*.08));
};

$('save-project').onclick=()=>saveProject().catch(e=>status(e.message));
$('new-project').onclick=()=>newProject().catch(e=>status(e.message));
$('duplicate-project').onclick=()=>duplicateProject().catch(e=>status(e.message));
$('delete-project').onclick=()=>deleteProject().catch(e=>status(e.message));
$('to-order').onclick=()=>toOrder().catch(e=>status(e.message));
$('share-project').onclick=()=>shareProject().catch(e=>status(e.message));
$('copy-share').onclick=()=>copyShare();
$('download-spec').onclick=()=>downloadSpec().catch(e=>status(e.message));

window.MF3D_KITCHEN={facadeGapMm:FACADE_GAP_MM,templates:kitchenTemplates,facadeCells};
start().catch(e=>status(e.message));
