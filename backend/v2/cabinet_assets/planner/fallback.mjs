import {bounds,elevation,tier,MM_TO_WORLD as S} from './furniture-core.mjs';
import {FEATURES,featureBox,floorOutline} from './room-plan.mjs';
import {fixturePlans,roundedOutline} from './worktop-fixtures.mjs';
/** Used only after the WebGL renderer is disposed. Same adapter, no page reload. */
export class FallbackPlan {
  constructor(canvas,adapter){
    this.canvas=canvas;this.adapter=adapter;this.context=canvas.getContext('2d');this.mode='top';this.layer='all';this.controls={enabled:true};
    this.isFallback=true;this.dead=false;this.frame=0;this.zoomLevel=1;this.fitTarget='room';
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas.parentElement);this.resize();
  }
  resize(){const r=this.canvas.parentElement.getBoundingClientRect();this.width=Math.max(1,r.width);this.height=Math.max(1,r.height);const d=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(this.width*d);this.canvas.height=Math.round(this.height*d);this.context.setTransform(d,0,0,d,0,0);this.invalidate();}
  invalidate(){if(!this.dead&&!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.render();});}
  metrics(){
    const r=this.adapter.room;let minX=-r.width/2,maxX=r.width/2,minZ=-r.depth/2,maxZ=r.depth/2;
    const items=this.fitTarget==='selected'?[this.adapter.selected].filter(Boolean):this.adapter.items;
    if(this.fitTarget!=='room'&&items.length){const boxes=items.map(it=>bounds(it,r));minX=Math.min(...boxes.map(b=>b.minX))-120;maxX=Math.max(...boxes.map(b=>b.maxX))+120;minZ=Math.min(...boxes.map(b=>b.minZ))-180;maxZ=Math.max(...boxes.map(b=>b.maxZ))+180;}
    const scale=Math.max(.005,Math.min((this.width-60)/(maxX-minX),(this.height-120)/(maxZ-minZ)))*this.zoomLevel;
    return {scale,cx:(minX+maxX)/2,cz:(minZ+maxZ)/2,ox:this.width/2,oy:this.height/2};
  }
  rectangle(it){const m=this.metrics(),b=bounds(it,this.adapter.room);return{x:m.ox+(b.minX-m.cx)*m.scale,y:m.oy+(b.minZ-m.cz)*m.scale,w:(b.maxX-b.minX)*m.scale,h:(b.maxZ-b.minZ)*m.scale};}
  render(){
    if(this.dead)return;const c=this.context,m=this.metrics(),r=this.adapter.room;
    c.clearRect(0,0,this.width,this.height);c.fillStyle='#f2f4ed';c.fillRect(0,0,this.width,this.height);
    const left=m.ox+(-r.width/2-m.cx)*m.scale,top=m.oy+(-r.depth/2-m.cz)*m.scale;
    c.fillStyle='#fdfdf8';c.fillRect(left,top,r.width*m.scale,r.depth*m.scale);c.strokeStyle='#a6b69c';c.lineWidth=1;c.strokeRect(left,top,r.width*m.scale,r.depth*m.scale);
    c.strokeStyle='#e3e9de';c.lineWidth=.5;
    for(let x=500;x<r.width;x+=500){c.beginPath();c.moveTo(left+x*m.scale,top);c.lineTo(left+x*m.scale,top+r.depth*m.scale);c.stroke();}
    for(let z=500;z<r.depth;z+=500){c.beginPath();c.moveTo(left,top+z*m.scale);c.lineTo(left+r.width*m.scale,top+z*m.scale);c.stroke();}
    for(const it of this.adapter.items){
      if(this.layer!=='all'&&tier(it)!==this.layer)continue;if(this.preview?.items?.some(p=>p.item_id===it.item_id)||this.preview?.item.item_id===it.item_id)continue;
      const b=this.rectangle(it),on=it.item_id===this.adapter.selected?.item_id;
      c.fillStyle=tier(it)==='wall'?'#e4ece2':'#dce0d1';c.fillRect(b.x,b.y,b.w,b.h);c.strokeStyle=on?'#39704c':'#8d9d86';c.lineWidth=on?2:1;
      if(tier(it)==='wall')c.setLineDash([5,3]);c.strokeRect(b.x,b.y,b.w,b.h);c.setLineDash([]);
      c.save();c.beginPath();c.rect(b.x+3,b.y+3,Math.max(0,b.w-6),Math.max(0,b.h-6));c.clip();c.font='10px Arial';c.fillStyle='#47603e';c.textAlign='center';c.fillText(it.name,b.x+b.w/2,b.y+b.h/2+3);c.restore();
    }
    for(const f of fixturePlans(this.adapter.items,r)){
      if(f.error||this.layer!=='all'&&this.layer!=='base')continue;
      const angle=f.rotation*Math.PI/180;c.save();c.translate(m.ox+(f.x-m.cx)*m.scale,m.oy+(f.z-m.cz)*m.scale);c.rotate(angle);
      c.beginPath();roundedOutline(f.width,f.depth).forEach(([x,z],i)=>i?c.lineTo(x*m.scale,z*m.scale):c.moveTo(x*m.scale,z*m.scale));c.closePath();c.fillStyle=f.kind==='sink'?'#a6b0b1':'#263033';c.fill();c.strokeStyle='#536367';c.stroke();
      if(f.kind==='sink'){c.strokeRect(-f.width*.42*m.scale,(-f.depth/2+85)*m.scale,f.width*.84*m.scale,(f.depth-110)*m.scale);}
      else for(const x of [-.25,.25])for(const z of [-.23,.2]){c.beginPath();c.arc(x*f.width*m.scale,z*f.depth*m.scale,65*m.scale,0,Math.PI*2);c.strokeStyle='#9da7a9';c.stroke();}c.restore();
    }
    for(const [i,f]of (r.features||[]).entries()){
      const b=featureBox(f,r,['shaft','column'].includes(f.kind)?0:70),x=m.ox+(b.x-b.w/2-m.cx)*m.scale,y=m.oy+(b.z-b.d/2-m.cz)*m.scale;
      c.fillStyle=FEATURES[f.kind][1];c.fillRect(x,y,Math.max(4,b.w*m.scale),Math.max(4,b.d*m.scale));c.font='bold 12px Arial';c.fillStyle='#243e30';c.textAlign='center';c.fillText(String(i+1),x+b.w*m.scale/2,y+b.d*m.scale/2-5);
    }
    c.strokeStyle='#536958';c.lineWidth=2;c.beginPath();for(const e of floorOutline(r)){c.moveTo(m.ox+(e.x1-m.cx)*m.scale,m.oy+(e.z1-m.cz)*m.scale);c.lineTo(m.ox+(e.x2-m.cx)*m.scale,m.oy+(e.z2-m.cz)*m.scale);}c.stroke();
    if(this.preview)for(const it of this.preview.items||[this.preview.item]){const b=this.rectangle(it);c.fillStyle=this.preview.error?'#dab09188':'#8db18388';c.fillRect(b.x,b.y,b.w,b.h);c.strokeStyle=this.preview.error?'#a86b44':'#4b7b4a';c.strokeRect(b.x,b.y,b.w,b.h);}
  }
  sync(){this.invalidate();}
  setLayer(value){this.layer=value;this.invalidate();}
  setView(){this.mode='top';this.invalidate();}
  fit(which='kitchen'){this.fitTarget=which;this.zoomLevel=1;this.invalidate();}
  zoom(delta){this.zoomLevel=Math.max(.3,Math.min(8,this.zoomLevel*(delta>0?1.2:1/1.2)));this.invalidate();}
  hover(){}
  highlight(){this.invalidate();}
  pick(x,y){const r=this.canvas.getBoundingClientRect();for(const it of [...this.adapter.items].reverse()){
    if(this.layer!=='all'&&tier(it)!==this.layer)continue;const b=this.rectangle(it);
    if(x-r.left>=b.x&&x-r.left<=b.x+b.w&&y-r.top>=b.y&&y-r.top<=b.y+b.h)return{id:it.item_id,point:this.planePoint(x,y,{y:elevation(it,this.adapter.room)*S})};
  }return null;}
  planePoint(x,y,plane={}){const r=this.canvas.getBoundingClientRect(),m=this.metrics();return{x:(m.cx+(x-r.left-m.ox)/m.scale)*S,y:plane.y||0,z:(m.cz+(y-r.top-m.oy)/m.scale)*S};}
  makePlane(it,hit){return {y:hit?.y??elevation(it,this.adapter.room)*S};}
  pixelThreshold(){return Math.max(12,Math.min(85,14/this.metrics().scale));}
  showPreview(item,error,guides){this.preview={item,error,guides};this.invalidate();}
  showGroupPreview(items,error,guides){this.preview={item:items[0],items,error,guides};this.invalidate();}
  clearPreview(){this.preview=null;this.invalidate();}
  projectPoint(point){const r=this.canvas.getBoundingClientRect(),m=this.metrics();return{x:r.left+m.ox+(point.x-m.cx)*m.scale,y:r.top+m.oy+(point.z-m.cz)*m.scale};}
  dispose(){this.dead=true;cancelAnimationFrame(this.frame);this.observer.disconnect();}
}
