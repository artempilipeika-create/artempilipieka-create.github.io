import * as THREE from './vendor/three.module.js';
import {MM_TO_WORLD as S,elevation,facadeCells,tier,rotateXZ} from './furniture-core.mjs';
export class MeshFactory{
  constructor(adapter,invalidate){
    this.adapter=adapter;this.invalidate=invalidate;this.geometry=new THREE.BoxGeometry(1,1,1);
    this.materials=new Map();this.textures=new Map();
  }
  material(role,id,ghost=false){
    const data=id?this.adapter.material(id):null;
    const color=[data?.preview_color,data?.color_hex,data?.color].find(v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v));
    const fallback={body:'#c9c7bd',front:'#eff0e8',plinth:'#a2a69b',handle:'#59655c',counter:'#ddd9ce',back:'#c8c6bb'}[role]||'#efeee8';
    const url=data?.texture_preview||data?.preview_url;
    const safeTexture=typeof url==='string'&&url.startsWith('/')&&!url.startsWith('//')?url:null;
    const key=[role,id||'',color||fallback,safeTexture||'',ghost].join('|');
    if(!this.materials.has(key)){
      const material=new THREE.MeshStandardMaterial({color:color||fallback,roughness:role==='handle'?.42:.8,
        metalness:role==='handle'?.3:0,transparent:ghost,opacity:ghost?.42:1,depthWrite:!ghost});
      if(safeTexture&&!ghost){
        if(!this.textures.has(safeTexture)){
          const tx=new THREE.TextureLoader().load(safeTexture,()=>this.invalidate(),undefined,()=>this.invalidate());
          tx.colorSpace=THREE.SRGBColorSpace;tx.anisotropy=4;this.textures.set(safeTexture,tx);
        }
        material.map=this.textures.get(safeTexture);
      }
      this.materials.set(key,material);
    }
    return this.materials.get(key);
  }
  box(group,role,w,h,d,x,y,z,id,ghost=false){
    if(w<=0||h<=0||d<=0)return;
    const mesh=new THREE.Mesh(this.geometry,this.material(role,id,ghost));
    mesh.scale.set(w*S,h*S,d*S);mesh.position.set(x*S,y*S,z*S);
    mesh.castShadow=!ghost;mesh.receiveShadow=!ghost;mesh.userData.itemId=group.userData.itemId;
    mesh.userData.role=role;group.add(mesh);return mesh;
  }
  build(it,ghost=false){
    const group=new THREE.Group();group.userData.itemId=it.item_id;group.userData.ghost=ghost;
    const {width:W,height:H,depth:D}=it,t=18,base=it.base==='plinth'?80:0;
    const body=it.body_variant_id,front=it.front_variant_id;
    this.box(group,'body',t,H-base,D,-W/2+t/2,base+(H-base)/2,0,body,ghost);
    this.box(group,'body',t,H-base,D,W/2-t/2,base+(H-base)/2,0,body,ghost);
    this.box(group,'body',W-2*t,t,D,0,H-t/2,0,body,ghost);
    this.box(group,'body',W-2*t,t,D,0,base+t/2,0,body,ghost);
    if(base)this.box(group,'plinth',W,base,18,0,base/2,D/2-60,body,ghost);
    if(it.base==='legs')for(const x of[-W/2+45,W/2-45])for(const z of[-D/2+45,D/2-45])this.box(group,'handle',24,60,24,x,30,z,null,ghost);
    if(it.layout==='niche'){
      const inner=H-base-2*t,nh=inner*.35;
      this.box(group,'body',W-2*t,t,D*.92,0,H-t-nh,0,body,ghost);
    }
    const cells=facadeCells(it,this.adapter.template(it));
    for(const f of cells){
      this.box(group,'front',f.w,f.h,18,f.cx,f.cy,D/2+11,front,ghost);
      if(it.handles==='handles'&&f.w>140&&f.h>100){
        // Visual handles only. Not a manufacturing specification or a hardware SKU.
        const drawer=f.kind==='drawer';
        this.box(group,'handle',drawer?Math.min(140,f.w*.3):9,drawer?9:Math.min(140,f.h*.25),12,
          drawer?f.cx:f.cx+f.w/2-28,drawer?f.cy+f.h/2-35:f.cy,D/2+29,null,ghost);
      }
    }
    group.userData.visualApproximation=Boolean(it.bazis_id);
    this.position(group,it);return group;
  }
  position(group,it){group.position.set(it.x*S,elevation(it,this.adapter.room)*S,it.z*S);group.rotation.y=-(it.rotation||0)*Math.PI/180;}
  /** Group only collinear, touching lower units of equal top and front line. */
  dress(items){
    const root=new THREE.Group();root.userData.visualOnly=true;
    const groups=new Map();
    for(const it of items){
      if(tier(it)!=='base'||it.depth>750)continue;
      const r=it.rotation||0,axis=r===90||r===270?'z':'x',cross=axis==='x'?'z':'x',normal=rotateXZ(0,1,r)[cross];
      const line=it[cross]+normal*it.depth/2,top=elevation(it,this.adapter.room)+it.height;
      const key=[r,line,top,it.base,it.body_variant_id||''].join('|');
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push({it,axis,cross,normal,line,top,lo:it[axis]-it.width/2,hi:it[axis]+it.width/2});
    }
    for(const members of groups.values()){
      members.sort((a,b)=>a.lo-b.lo);const runs=[];
      for(const m of members){const last=runs.at(-1);if(last&&Math.abs(last.hi-m.lo)<=1){last.hi=m.hi;last.members.push(m);}else runs.push({lo:m.lo,hi:m.hi,members:[m]});}
      for(const run of runs){
        const first=run.members[0],depth=Math.max(...run.members.map(x=>x.it.depth));
        const center={...first.it,x:first.it.x,z:first.it.z,elevation_mm:0};center[first.axis]=(run.lo+run.hi)/2;center[first.cross]=first.line-first.normal*depth/2;
        const g=new THREE.Group();g.userData.visualOnly=true;g.userData.tier='base';g.userData.members=run.members.map(x=>x.it.item_id);
        this.box(g,'counter',run.hi-run.lo+12,28,depth+36,0,first.top+14,8,null);
        if(first.it.base==='plinth'&&run.members.length>1)this.box(g,'plinth',run.hi-run.lo,80,18,0,elevation(first.it,this.adapter.room)+40,depth/2-60,first.it.body_variant_id);
        g.position.set(center.x*S,0,center.z*S);g.rotation.y=-(center.rotation||0)*Math.PI/180;
        root.add(g);
      }
    }
    return root;
  }
  signature(it){return JSON.stringify([it.width,it.height,it.depth,it.base,it.handles,it.layout,it.drawers,it.template_id,it.bazis_id,it.body_variant_id,it.front_variant_id]);}
  dispose(){this.geometry.dispose();this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());this.materials.clear();this.textures.clear();}
}
