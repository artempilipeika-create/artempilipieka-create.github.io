import * as THREE from './vendor/three.module.js';
import {MM_TO_WORLD as S,elevation,facadeCells,tier,rotateXZ} from './furniture-core.mjs';

// Appearance only: millimetre envelopes, facadeCells and project payloads are untouched.
export const VISUAL_FINISHES=Object.freeze({
  body:{color:'#b9c1b9',roughness:.88,metalness:0},
  front:{color:'#e5e3d8',roughness:.74,metalness:0},
  back:{color:'#a6afa7',roughness:.94,metalness:0},
  plinth:{color:'#536158',roughness:.87,metalness:0},
  handle:{color:'#343e3b',roughness:.48,metalness:.38},
  counter:{color:'#929b94',roughness:.67,metalness:0},
  reveal:{color:'#49544d',roughness:1,metalness:0}
});

/** Low-poly rounded edges INSIDE the exact envelope. 108 triangles, not a bevel modifier. */
export function panelGeometry(w,h,d,r=.8){
  r=Math.min(r,w/4,h/4,d/4);
  if(r<=0){const g=new THREE.BoxGeometry(w*S,h*S,d*S);g.computeBoundingBox();return g;}
  const g=new THREE.BoxGeometry(1,1,1,3,3,3),p=g.attributes.position,n=g.attributes.normal;
  const halves=[w/2,h/2,d/2],q=new THREE.Vector3(),core=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let i=0;i<p.count;i++){
    for(let a=0;a<3;a++){
      const v=p.getComponent(i,a),half=halves[a];
      q.setComponent(a,Math.sign(v)*(Math.abs(v)>.49?half:half-r));
      core.setComponent(a,Math.max(-half+r,Math.min(half-r,q.getComponent(a))));
    }
    normal.copy(q).sub(core).normalize();q.copy(core).addScaledVector(normal,r).multiplyScalar(S);
    p.setXYZ(i,q.x,q.y,q.z);n.setXYZ(i,normal.x,normal.y,normal.z);
  }
  g.computeBoundingBox();g.computeBoundingSphere();g.userData.envelopeMM=[w,h,d];g.userData.bevelMM=r;return g;
}
function combine(parts){
  const positions=[],normals=[],uvs=[];
  for(const source of parts){const g=source.index?source.toNonIndexed():source;
    positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);uvs.push(...g.attributes.uv.array);
    if(g!==source)g.dispose();source.dispose();
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export class MeshFactory{
  constructor(adapter,invalidate){
    this.adapter=adapter;this.invalidate=invalidate;this.geometry=new THREE.BoxGeometry(1,1,1);
    this.plane=new THREE.PlaneGeometry(1,1);this.pool=new Map();this.materials=new Map();this.textures=new Map();
    // A tiny analytic opacity mask, not an invented wood/stone texture or HDRI.
    const size=64,bytes=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const edge=Math.min(x,y,size-1-x,size-1-y)/(size*.22),t=Math.max(0,Math.min(1,edge));
      const a=Math.round(255*t*t*(3-2*t)),i=(y*size+x)*4;bytes[i]=bytes[i+1]=bytes[i+2]=a;bytes[i+3]=255;
    }
    this.contactMap=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);this.contactMap.minFilter=THREE.LinearFilter;this.contactMap.magFilter=THREE.LinearFilter;this.contactMap.needsUpdate=true;
    this.contactMaterials={};
    for(const [kind,opacity]of [['floor',.14],['wall',.19]])this.contactMaterials[kind]=new THREE.MeshBasicMaterial({color:'#35443b',alphaMap:this.contactMap,transparent:true,opacity,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
  }
  material(role,id,ghost=false){
    const data=id?this.adapter.material(id):null,finish=VISUAL_FINISHES[role]||VISUAL_FINISHES.body;
    const color=[data?.preview_color,data?.color_hex,data?.color].find(v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v));
    const url=data?.texture_preview||data?.preview_url;
    const safe=typeof url==='string'&&url.startsWith('/')&&!url.startsWith('//')&&!url.includes('..')?url:null;
    const key=[role,id||'',color||'',safe||'',ghost].join('|');
    if(!this.materials.has(key)){
      const m=new THREE.MeshStandardMaterial({...finish,color:color||(safe?'#ffffff':finish.color),transparent:ghost,opacity:ghost?.36:1,depthWrite:!ghost});
      if(safe&&!ghost){
        if(!this.textures.has(safe)){const tx=new THREE.TextureLoader().load(safe,()=>this.invalidate(),undefined,()=>{m.map=null;m.needsUpdate=true;this.invalidate();});tx.colorSpace=THREE.SRGBColorSpace;tx.anisotropy=4;this.textures.set(safe,tx);}
        m.map=this.textures.get(safe);
      }
      this.materials.set(key,m);
    }
    return this.materials.get(key);
  }
  acquire(key,create){let value=this.pool.get(key);if(!value){value={geometry:create(),refs:0};this.pool.set(key,value);}value.refs++;return value.geometry;}
  ownsGeometry(g){return g===this.geometry||g===this.plane||[...this.pool.values()].some(v=>v.geometry===g);}
  mesh(group,role,geometry,key,x,y,z,id,ghost){
    const m=new THREE.Mesh(geometry,this.material(role,id,ghost));m.position.set(x*S,y*S,z*S);
    m.castShadow=!ghost&&role!=='reveal';m.receiveShadow=!ghost;m.userData={itemId:group.userData.itemId,role,geometryKey:key};group.add(m);return m;
  }
  box(group,role,w,h,d,x,y,z,id,ghost=false,bevel){
    if(w<=0||h<=0||d<=0)return;
    const r=bevel??(role==='front'?.85:role==='counter'?1.2:role==='body'?.45:.25);
    const key=['panel',w,h,d,r].join(':');
    return this.mesh(group,role,this.acquire(key,()=>panelGeometry(w,h,d,r)),key,x,y,z,id,ghost);
  }
  handle(group,length,x,y,z,horizontal,ghost){
    const key='handle:'+length;
    const g=this.acquire(key,()=>combine([
      panelGeometry(9,length,9,1.2).translate(0,0,21*S),
      ...[-1,1].map(sign=>panelGeometry(8,8,18,1).translate(0,sign*(length/2-10)*S,9*S))
    ]));
    const m=this.mesh(group,'handle',g,key,x,y,z,null,ghost);if(horizontal)m.rotation.z=Math.PI/2;m.userData.visualOnly=true;
  }
  foot(group,x,z,ghost){
    const key='foot:60';const g=this.acquire(key,()=>combine([
      new THREE.CylinderGeometry(.012,.013,.054,10).translate(0,.003,0),
      new THREE.CylinderGeometry(.017,.017,.006,10).translate(0,-.027,0)
    ]));const m=this.mesh(group,'handle',g,key,x,30,z,null,ghost);m.userData.visualOnly=true;m.userData.role='leg';
  }
  build(it,ghost=false){
    const group=new THREE.Group();group.userData={itemId:it.item_id,ghost,visualApproximation:Boolean(it.bazis_id)};
    const {width:W,height:H,depth:D}=it,t=18,base=it.base==='plinth'?80:it.base==='legs'?60:0;
    const body=it.body_variant_id,front=it.front_variant_id,template=this.adapter.template(it),cells=facadeCells(it,template);
    this.box(group,'body',t,H-base,D,-W/2+t/2,base+(H-base)/2,0,body,ghost);
    this.box(group,'body',t,H-base,D,W/2-t/2,base+(H-base)/2,0,body,ghost);
    this.box(group,'body',W-2*t,t,D,0,H-t/2,0,body,ghost);
    this.box(group,'body',W-2*t,t,D,0,base+t/2,0,body,ghost);
    // No imaginary FR3D shelves or hardware internals. Only known generic shells.
    if(!it.bazis_id)this.box(group,'back',W-2*t,H-base-2*t,4,0,base+(H-base)/2,-D/2+2,body,ghost);
    if(it.base==='plinth'){
      this.box(group,'plinth',W,78,18,0,40,D/2-60,null,ghost);
      for(const sign of[-1,1])this.box(group,'plinth',18,78,D-100,sign*(W/2-9),40,-10,null,ghost);
    }
    if(it.base==='legs')for(const x of[-W/2+45,W/2-45])for(const z of[-D/2+45,D/2-45])this.foot(group,x,z,ghost);
    if(!it.bazis_id&&it.layout==='niche'){
      const ratio=template?.front?.nicheRatio||.35,y=base+(H-base)*(1-ratio);
      this.box(group,'body',W-2*t,t,D-8,0,y-t/2,-4,body,ghost);
    }
    if(cells.length){
      const lo=Math.min(...cells.map(f=>f.cy-f.h/2)),hi=Math.max(...cells.map(f=>f.cy+f.h/2));
      const reveal=this.box(group,'reveal',W-2*t,hi-lo,1,0,(lo+hi)/2,D/2-1,null,ghost,0);
      reveal.userData.visualOnly=true;reveal.raycast=()=>{};
    }
    for(const f of cells){
      const panel=this.box(group,'front',f.w,f.h,18,f.cx,f.cy,D/2+11,front,ghost);panel.userData.facade={...f};
      if(it.handles==='handles'&&f.w>140&&f.h>100){
        const drawer=f.kind==='drawer',doors=cells.filter(c=>c.kind==='door'&&Math.abs(c.cy-f.cy)<1);
        const side=doors.length>1?(f.cx<0?1:-1):1;
        const x=drawer?f.cx:f.cx+side*(f.w/2-30);
        const y=drawer?f.cy+f.h/2-36:it.module_type==='wall_cabinet'?f.cy-f.h/2+120:f.cy;
        this.handle(group,Math.min(160,drawer?f.w*.34:f.h*.30),x,y,D/2+20,drawer,ghost);
      }
    }
    this.position(group,it);return group;
  }
  position(group,it){group.position.set(it.x*S,elevation(it,this.adapter.room)*S,it.z*S);group.rotation.y=-(it.rotation||0)*Math.PI/180;}
  /** Visual worktops and recessed plinth runs; never included in save/cutlist/export. */
  dress(items){
    const root=new THREE.Group();root.userData={visualOnly:true,mergedPlinthIds:[]};const groups=new Map();
    for(const it of items){
      if(tier(it)!=='base'||it.depth>750)continue;
      const r=it.rotation||0,axis=r===90||r===270?'z':'x',cross=axis==='x'?'z':'x',normal=rotateXZ(0,1,r)[cross];
      const line=it[cross]+normal*it.depth/2,top=elevation(it,this.adapter.room)+it.height,key=[r,line,top,it.base].join('|');
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push({it,axis,cross,normal,line,top,lo:it[axis]-it.width/2,hi:it[axis]+it.width/2});
    }
    for(const members of groups.values()){
      members.sort((a,b)=>a.lo-b.lo);const runs=[];
      for(const m of members){const last=runs.at(-1);if(last&&Math.abs(last.hi-m.lo)<=1){last.hi=m.hi;last.members.push(m);}else runs.push({lo:m.lo,hi:m.hi,members:[m]});}
      for(const run of runs){
        const f=run.members[0],depth=Math.max(...run.members.map(x=>x.it.depth)),width=run.hi-run.lo;
        const center={...f.it};center[f.axis]=(run.lo+run.hi)/2;center[f.cross]=f.line-f.normal*depth/2;
        const g=new THREE.Group();g.userData={visualOnly:true,tier:'base',members:run.members.map(x=>x.it.item_id)};
        // The countertop's back follows the carcass; 16 mm past the facade, 12 mm at free ends.
        const roomLimit=(f.axis==='x'?this.adapter.room.width:this.adapter.room.depth)/2;
        const left=Math.min(12,Math.max(0,run.lo+roomLimit)),right=Math.min(12,Math.max(0,roomLimit-run.hi));
        this.box(g,'counter',width+left+right,32,depth+36,(right-left)/2,f.top+16,18,null);
        if(f.it.base==='plinth'&&run.members.length>1){
          this.box(g,'plinth',width,78,18,0,elevation(f.it,this.adapter.room)+40,depth/2-60,null);
          for(const sign of[-1,1])this.box(g,'plinth',18,78,depth-100,sign*(width/2-9),elevation(f.it,this.adapter.room)+40,-10,null);
          root.userData.mergedPlinthIds.push(...g.userData.members);
        }
        g.position.set(center.x*S,0,center.z*S);g.rotation.y=-(center.rotation||0)*Math.PI/180;root.add(g);
      }
    }
    return root;
  }
  contacts(items){
    const root=new THREE.Group();root.userData.visualOnly=true;const room=this.adapter.room;
    const plane=(kind,w,h)=>{const m=new THREE.Mesh(this.plane,this.contactMaterials[kind]);m.scale.set(w*S,h*S,1);m.userData.visualOnly=true;m.raycast=()=>{};root.add(m);return m;};
    for(const it of items){
      const level=elevation(it,room),layer=tier(it);
      if(level===0){const m=plane('floor',it.width+90,it.depth+80);m.position.set(it.x*S,.0004,it.z*S);m.rotation.set(-Math.PI/2,0,(it.rotation||0)*Math.PI/180);m.userData.tier=layer;}
      const r=it.rotation||0,axis=r===90||r===270?'x':'z',sign=rotateXZ(0,-1,r)[axis],wall=(axis==='x'?room.width:room.depth)/2;
      const gap=wall-sign*it[axis]-it.depth/2;
      if(gap>=-1&&gap<=80){
        const m=plane('wall',it.width+110,it.height+110);m.position.set(it.x*S,(level+it.height/2)*S,it.z*S);
        m.position[axis]=sign*(wall*S-.002);m.rotation.y=axis==='z'?(sign<0?0:Math.PI):(sign<0?Math.PI/2:-Math.PI/2);
        m.userData.tier=layer;m.userData.wall={axis,sign};
      }
    }
    return root;
  }
  release(group){
    if(!group)return;group.traverse(o=>{const entry=this.pool.get(o.userData.geometryKey);if(entry)entry.refs=Math.max(0,entry.refs-1);});group.removeFromParent();
    // Bounded cache keeps drag/resize reuse while not retaining every historical size.
    if(this.pool.size>192)for(const [key,value]of this.pool){if(!value.refs){value.geometry.dispose();this.pool.delete(key);}if(this.pool.size<=128)break;}
  }
  signature(it){return JSON.stringify([it.width,it.height,it.depth,it.base,it.handles,it.layout,it.drawers,it.template_id,it.bazis_id,it.body_variant_id,it.front_variant_id]);}
  dispose(){this.geometry.dispose();this.plane.dispose();this.pool.forEach(v=>v.geometry.dispose());this.pool.clear();this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());Object.values(this.contactMaterials).forEach(m=>m.dispose());this.contactMap.dispose();this.materials.clear();this.textures.clear();}
}

/** Lazy catalogue thumbnails from the SAME mesh factory and SAME WebGL context. */
export class CataloguePreviews{
  constructor(owner){
    this.owner=owner;this.queue=new Set();this.closed=false;
    const root=document.getElementById('module-catalogue');if(!root)return;
    this.target=new THREE.WebGLRenderTarget(240,176,{depthBuffer:true,samples:4});this.target.texture.colorSpace=THREE.SRGBColorSpace;
    root.querySelectorAll('canvas.studio-preview').forEach(c=>delete c.dataset.meshObserved);
    this.observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting&&e.target.dataset.modelPreview!=='mesh-v2'){this.queue.add(e.target);this.schedule();}},{root:document.getElementById('pane-catalog'),rootMargin:'30px'});
    const scan=()=>root.querySelectorAll('canvas.studio-preview').forEach(c=>{if(c.dataset.meshObserved)return;c.dataset.meshObserved='true';this.observer.observe(c);});
    this.mutations=new MutationObserver(scan);this.mutations.observe(root,{subtree:true,childList:true});scan();
  }
  schedule(){if(this.closed||this.timer)return;this.timer=setTimeout(()=>{this.timer=0;this.tick();},40);}
  tick(){
    if(this.closed||this.owner.dead)return;
    if(this.owner.preview){this.schedule();return;}
    const canvas=this.queue.values().next().value;if(!canvas)return;this.queue.delete(canvas);
    if(canvas.isConnected&&canvas.getBoundingClientRect().width){
      const button=canvas.closest('[data-template],[data-bazis],[data-module]');
      if(button){const opt={template:button.dataset.template,bazis:button.dataset.bazis,module:button.dataset.module};this.paint(canvas,opt);this.observer.unobserve(canvas);}
    }
    if(this.queue.size)this.schedule();
  }
  paint(canvas,opt){
    const {adapter,factory,renderer}=this.owner,it=adapter.createDraft(opt),scene=new THREE.Scene();
    it.x=it.z=it.rotation=0;it.elevation_mm=0;
    scene.background=new THREE.Color('#eef0eb');scene.environment=this.owner.scene.environment;scene.environmentIntensity=.65;scene.add(new THREE.HemisphereLight('#ffffff','#c9d0c8',1.4));
    const key=new THREE.DirectionalLight('#fffaf1',1.5);key.position.set(-3,5,7);scene.add(key);
    const fill=new THREE.DirectionalLight('#f0f5ff',.55);fill.position.set(4,2,1);scene.add(fill);
    const model=factory.build(it),dress=factory.dress([it]);scene.add(model,dress);
    const b=new THREE.Box3().setFromObject(model).expandByObject(dress),center=b.getCenter(new THREE.Vector3());
    const camera=new THREE.PerspectiveCamera(32,240/176,.01,50),dir=new THREE.Vector3(.65,.35,1).normalize(),right=new THREE.Vector3(0,1,0).cross(dir).normalize(),up=dir.clone().cross(right).normalize();
    const tan=Math.tan(camera.fov*Math.PI/360);let distance=.3;
    for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z]){const d=new THREE.Vector3(x,y,z).sub(center);distance=Math.max(distance,d.dot(dir)+Math.abs(d.dot(right))/(tan*camera.aspect*.78),d.dot(dir)+Math.abs(d.dot(up))/(tan*.80));}
    camera.position.copy(center).addScaledVector(dir,distance);camera.lookAt(center);
    const oldTarget=renderer.getRenderTarget(),shadows=renderer.shadowMap.enabled;
    try{
      renderer.shadowMap.enabled=false;renderer.setRenderTarget(this.target);renderer.render(scene,camera);
      const pixels=new Uint8Array(240*176*4);renderer.readRenderTargetPixels(this.target,0,0,240,176,pixels);
      const ctx=canvas.getContext('2d');if(ctx){canvas.width=240;canvas.height=176;const image=ctx.createImageData(240,176);for(let y=0;y<176;y++)image.data.set(pixels.subarray((175-y)*240*4,(176-y)*240*4),y*240*4);ctx.putImageData(image,0,0);canvas.dataset.modelPreview='mesh-v2';}
    }finally{renderer.setRenderTarget(oldTarget);renderer.shadowMap.enabled=shadows;factory.release(model);factory.release(dress);this.owner.invalidate();}
  }
  dispose(){this.closed=true;clearTimeout(this.timer);this.observer?.disconnect();this.mutations?.disconnect();this.target?.dispose();this.queue.clear();}
}
