'use strict';
const $=id=>document.getElementById(id);
const FACADE_GAP_MM=1.5;
const TEMPLATE_FRONTS={
  'base.one_door':{kind:'doors',count:1},
  'base.two_door':{kind:'doors',count:2},
  'base.drawers_2':{kind:'drawers',count:2},
  'base.drawers_3':{kind:'drawers',count:3},
  'base.drawer_door':{kind:'combo',drawerRows:1,drawerRatio:.25,doors:1},
  'base.sink_2door':{kind:'doors',count:2},
  'wall.one_door':{kind:'doors',count:1},
  'wall.two_door':{kind:'doors',count:2},
  'wall.horizontal':{kind:'doors',count:1},
  'tall.one_door':{kind:'doors',count:1},
  'tall.two_door':{kind:'doors',count:2}
};
let state=null,viewMode='3d',rotY=-.55,rotX=.2,zoom=1,drag=false,px=0,py=0,boxes=[];

async function get(){
  const token=new URLSearchParams(location.search).get('token')||'';
  const r=await fetch('/api/v2/3d-shares/'+encodeURIComponent(token));
  if(!r.ok)throw new Error('Ссылка недействительна или отозвана.');
  return r.json();
}
function normalize(s={}){
  const items=Array.isArray(s.items)&&s.items.length?s.items:[{
    item_id:'legacy',module_type:s.module_type||'chest',template_id:null,name:'Модуль',x:0,z:0,rotation:0,
    width:s.width||1000,height:s.height||850,depth:s.depth||450,layout:s.layout||'combo',
    drawers:s.drawers??3,base:s.base||'plinth',handles:s.handles||'handles'
  }];
  return{room:s.room||{width:4200,depth:3200,height:2700},items};
}
function rotateXZ(x,z,r){
  const a=r*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return{x:x*c-z*s,z:x*s+z*c};
}
function add(it,w,h,d,x,y,z,color){
  const p=rotateXZ(x,z,it.rotation||0),odd=it.rotation===90||it.rotation===270;
  boxes.push({w:odd?d:w,h,d:odd?w:d,x:(it.x||0)+p.x,y,z:(it.z||0)+p.z,color});
}
function legacyFrontSpec(it){
  if(it.layout==='drawers')return{kind:'drawers',count:Math.max(1,it.drawers||1)};
  if(it.layout==='doors')return{kind:'doors',count:it.width>=900?2:1};
  if(it.layout==='combo')return{kind:'combo',drawerRows:Math.max(2,Math.min(3,it.drawers||2)),drawerRatio:.42,doors:it.width>=900?2:1};
  if(it.layout==='niche')return{kind:'niche',drawerRows:Math.max(2,it.drawers||2),nicheRatio:.35};
  return{kind:'doors',count:1};
}
function facadeCells(it){
  const spec=TEMPLATE_FRONTS[it.template_id]||legacyFrontSpec(it);
  const baseH=it.base==='plinth'?80:0,x0=-it.width/2,y0=baseH,W=it.width,H=Math.max(1,it.height-baseH),g=FACADE_GAP_MM,cells=[];
  const cell=(x,y,w,h)=>{
    cells.push({w:Math.max(1,w-2*g),h:Math.max(1,h-2*g),cx:x+w/2,cy:y+h/2});
  };
  if(spec.kind==='doors'){
    const n=Math.max(1,spec.count||1),cw=W/n;
    for(let i=0;i<n;i++)cell(x0+i*cw,y0,cw,H);
  }else if(spec.kind==='drawers'){
    const n=Math.max(1,spec.count||1),ch=H/n;
    for(let i=0;i<n;i++)cell(x0,y0+i*ch,W,ch);
  }else if(spec.kind==='combo'){
    const topH=H*(spec.drawerRatio||.42),bottomH=H-topH,doors=Math.max(1,spec.doors||1),dw=W/doors;
    for(let i=0;i<doors;i++)cell(x0+i*dw,y0,dw,bottomH);
    const rows=Math.max(1,spec.drawerRows||1),rh=topH/rows;
    for(let i=0;i<rows;i++)cell(x0,y0+bottomH+i*rh,W,rh);
  }else if(spec.kind==='niche'){
    const nicheH=H*(spec.nicheRatio||.35),bottomH=H-nicheH,rows=Math.max(1,spec.drawerRows||2),rh=bottomH/rows;
    for(let i=0;i<rows;i++)cell(x0,y0+i*rh,W,rh);
  }
  return cells;
}
function buildItem(it){
  const S=1/500,W=it.width*S,H=it.height*S,D=it.depth*S,t=18*S,bc='#a47d59',fc='#78927e';
  const baseH=it.base==='plinth'?80*S:0;
  const wallLift=it.module_type==='wall_cabinet'?Math.max(0,(state.room.height-it.height-500))*S:0,y0=wallLift;
  add(it,t,H-baseH,D,-W/2+t/2,y0+baseH+(H-baseH)/2,0,bc);
  add(it,t,H-baseH,D,W/2-t/2,y0+baseH+(H-baseH)/2,0,bc);
  add(it,W-2*t,t,D,0,y0+H-t/2,0,bc);
  add(it,W-2*t,t,D,0,y0+baseH+t/2,0,bc);
  if(it.base==='plinth')add(it,W,baseH,D*.78,0,y0+baseH/2,0,bc);
  if(it.layout==='niche'){
    const inner=H-baseH-2*t,nh=inner*.35;
    add(it,W-2*t,t,D*.92,0,y0+H-t-nh,0,bc);
  }
  const ft=18*S,fz=D/2+ft/2+.004;
  for(const f of facadeCells(it))add(it,f.w*S,f.h*S,ft,f.cx*S,y0+f.cy*S,fz,fc);
}
function build(){
  boxes=[];
  const S=1/500,r=state.room;
  boxes.push({w:r.width*S,h:.035,d:r.depth*S,x:0,y:-.02,z:0,color:'#d6d1c5'});
  boxes.push({w:r.width*S,h:r.height*S,d:.035,x:0,y:r.height*S/2,z:-r.depth*S/2,color:'#eef0e9'});
  boxes.push({w:.035,h:r.height*S,d:r.depth*S,x:-r.width*S/2,y:r.height*S/2,z:0,color:'#e7eae4'});
  for(const it of state.items)buildItem(it);
}
function hex(h){h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}
function shade(h,f){
  const[r,g,b]=hex(h);
  return'rgb('+Math.max(0,Math.min(255,r*f|0))+','+Math.max(0,Math.min(255,g*f|0))+','+Math.max(0,Math.min(255,b*f|0))+')';
}
function tf(p){
  let{x,y,z}=p,cy=Math.cos(rotY),sy=Math.sin(rotY),cx=Math.cos(rotX),sx=Math.sin(rotX);
  const x1=cy*x+sy*z,z1=-sy*x+cy*z,y1=cx*y-sx*z,z2=sx*y+cx*z;
  return{x:x1,y:y1,z:z2};
}
function proj(p,w,h){
  const t=tf(p),dist=10*zoom,sc=5.4/(dist-t.z),s=Math.min(w,h)*.29;
  return{x:w/2+t.x*sc*s,y:h*.61-t.y*sc*s,z:t.z};
}
function faces(b){
  const x0=b.x-b.w/2,x1=b.x+b.w/2,y0=b.y-b.h/2,y1=b.y+b.h/2,z0=b.z-b.d/2,z1=b.z+b.d/2;
  const v=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]].map(x=>({x:x[0],y:x[1],z:x[2]}));
  return[[0,1,2,3,.72],[4,5,6,7,1.05],[0,4,7,3,.84],[1,5,6,2,.92],[3,2,6,7,1.15],[0,1,5,4,.65]].map(f=>({verts:f.slice(0,4).map(i=>v[i]),sh:f[4],c:b.color}));
}
const canvas=$('scene'),ctx=canvas.getContext('2d');
function size(){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=r.width,h=r.height;
  if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr)){
    canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);
  }
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return{w,h};
}
function draw2d(w,h){
  ctx.fillStyle='#f4f2eb';ctx.fillRect(0,0,w,h);
  const pad=45,scale=Math.min((w-pad*2)/state.room.width,(h-pad*2)/state.room.depth),ox=w/2,oz=h/2;
  ctx.fillStyle='#fff';ctx.strokeStyle='#9aa99d';ctx.lineWidth=2;
  ctx.fillRect(ox-state.room.width*scale/2,oz-state.room.depth*scale/2,state.room.width*scale,state.room.depth*scale);
  ctx.strokeRect(ox-state.room.width*scale/2,oz-state.room.depth*scale/2,state.room.width*scale,state.room.depth*scale);
  for(const it of state.items){
    const odd=it.rotation===90||it.rotation===270,ww=(odd?it.depth:it.width)*scale,dd=(odd?it.width:it.depth)*scale,x=ox+(it.x||0)*scale,y=oz+(it.z||0)*scale;
    ctx.fillStyle='#9caf9f';ctx.fillRect(x-ww/2,y-dd/2,ww,dd);
    ctx.strokeStyle='#153d2d';ctx.strokeRect(x-ww/2,y-dd/2,ww,dd);
    ctx.fillStyle='#153d2d';ctx.font='11px Arial';ctx.textAlign='center';ctx.fillText(it.name||'Модуль',x,y+4);
  }
}
function draw3d(w,h){
  const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#edf4ee');g.addColorStop(1,'#d8e4db');
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  const fs=[];for(const b of boxes)fs.push(...faces(b));
  for(const f of fs){f.p=f.verts.map(v=>proj(v,w,h));f.z=f.p.reduce((s,p)=>s+p.z,0)/4}
  fs.sort((a,b)=>a.z-b.z);
  for(const f of fs){
    ctx.beginPath();ctx.moveTo(f.p[0].x,f.p[0].y);for(let i=1;i<4;i++)ctx.lineTo(f.p[i].x,f.p[i].y);ctx.closePath();
    ctx.fillStyle=shade(f.c,f.sh);ctx.fill();ctx.strokeStyle='rgba(25,45,31,.16)';ctx.stroke();
  }
}
function loop(){const{w,h}=size();if(state){viewMode==='2d'?draw2d(w,h):draw3d(w,h)}requestAnimationFrame(loop)}
function mode(v){
  viewMode=v;$('mode-2d').className=v==='2d'?'':'secondary';$('mode-3d').className=v==='3d'?'':'secondary';
  $('scene-help').textContent=v==='2d'?'2D · план помещения сверху':'Мышь — вращение · колесо — масштаб';
}
async function start(){
  try{
    const d=await get();state=normalize(d.scene);$('view-name').textContent=d.name;
    $('room-badge').textContent=state.room.width+'×'+state.room.depth+'×'+state.room.height;
    $('item-badge').textContent=state.items.length+' '+(state.items.length===1?'предмет':'предметов');
    for(const it of state.items){
      const p=document.createElement('p');p.textContent=(it.name||'Модуль')+' · '+it.width+'×'+it.height+'×'+it.depth;$('view-items').append(p);
    }
    build();mode(d.scene.view_mode||'3d');loop();
  }catch(e){$('status').textContent=e.message}
}
$('mode-2d').onclick=()=>mode('2d');
$('mode-3d').onclick=()=>mode('3d');
$('reset-view').onclick=()=>{rotY=-.55;rotX=.2;zoom=1};
canvas.onpointerdown=e=>{if(viewMode!=='3d')return;drag=true;px=e.clientX;py=e.clientY;canvas.setPointerCapture(e.pointerId)};
canvas.onpointermove=e=>{if(!drag)return;rotY+=(e.clientX-px)*.008;rotX=Math.max(-.55,Math.min(.65,rotX+(e.clientY-py)*.004));px=e.clientX;py=e.clientY};
canvas.onpointerup=()=>drag=false;
canvas.onwheel=e=>{if(viewMode!=='3d')return;e.preventDefault();zoom=Math.max(.55,Math.min(2,zoom+Math.sign(e.deltaY)*.08))};
start();
