import * as THREE from './vendor/three.module.js';
import {materialVisual,physicalPanelUV} from './material-visuals.mjs';
import {MM_TO_WORLD as S,elevation,facadeCells,tier,rotateXZ,bounds,heights,productionParts,kitchenRuns,kitchenLegs,isKitchenModule} from './furniture-core.mjs';

// Pilot carcasses and kitchen run accessories both consume canonical production geometry.
export const VISUAL_FINISHES=Object.freeze({
  body:{color:'#b9c1b9',roughness:.88,metalness:0},
  shelf:{color:'#b9c1b9',roughness:.88,metalness:0},
  drawer:{color:'#f5f5f1',roughness:.90,metalness:0},
  front:{color:'#e5e3d8',roughness:.74,metalness:0},
  back:{color:'#f3f3ef',roughness:.94,metalness:0},
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
      const edge=Math.min(x,y,size-1-x,size-1-y)/(size*.10),t=Math.max(0,Math.min(1,edge));
      const a=Math.round(255*t*t*(3-2*t)),i=(y*size+x)*4;bytes[i]=bytes[i+1]=bytes[i+2]=a;bytes[i+3]=255;
    }
    this.contactMap=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);this.contactMap.minFilter=THREE.LinearFilter;this.contactMap.magFilter=THREE.LinearFilter;this.contactMap.needsUpdate=true;
    this.contactMaterials={};
    for(const [kind,opacity]of [['floor',.14],['wall',.19]])this.contactMaterials[kind]=new THREE.MeshBasicMaterial({color:'#35443b',alphaMap:this.contactMap,transparent:true,opacity,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
  }
  material(role,id,ghost=false,inspection=false){
    const data=id?this.adapter.material(id):null,visual=materialVisual(data),finish=VISUAL_FINISHES[role]||VISUAL_FINISHES.body;
    const key=JSON.stringify([role,id||'',visual,ghost,inspection]);
    if(!this.materials.has(key)){
      const color=visual.color||(id?'#aeb2b0':finish.color);
      const m=new THREE.MeshStandardMaterial({...finish,color,roughness:id?visual.roughness:finish.roughness,
        metalness:role==='handle'?finish.metalness:0,vertexColors:role==='front'||role==='counter',
        transparent:ghost||inspection,opacity:ghost?.36:inspection?.16:1,depthWrite:!ghost&&!inspection,
        side:inspection?THREE.DoubleSide:THREE.FrontSide});
      m.userData={visualSource:visual.source,visualStatus:visual.status,variantId:id||null,fallbackColor:color};
      if(visual.url&&!ghost&&!inspection){
        const rotation=visual.rotation+(visual.grain==='width'?90:0),txKey=JSON.stringify([visual.url,visual.size,rotation]);
        if(!this.textures.has(txKey)){
          const tx=new THREE.TextureLoader().load(visual.url,()=>{if(!this.dead)this.invalidate();},undefined,()=>{
            tx.userData.failed=true;
            for(const mat of this.materials.values())if(mat.map===tx){mat.map=null;mat.color.set(mat.userData.fallbackColor);mat.userData.visualSource=visual.color?'color':'fallback';mat.userData.visualStatus=visual.color?'COLOR_ONLY':'MISSING_VISUAL';mat.needsUpdate=true;}
            if(!this.dead)this.invalidate();
          });
          tx.colorSpace=THREE.SRGBColorSpace;tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.repeat.set(1000/visual.size[0],1000/visual.size[1]);
          tx.rotation=rotation*Math.PI/180;tx.anisotropy=4;this.textures.set(txKey,tx);
        }
        const tx=this.textures.get(txKey);if(!tx.userData.failed){m.map=tx;m.color.set('#ffffff');}
        else {m.userData.visualSource=visual.color?'color':'fallback';m.userData.visualStatus=visual.color?'COLOR_ONLY':'MISSING_VISUAL';}
      }
      this.materials.set(key,m);
    }
    return this.materials.get(key);
  }
  updateAppearance(group,it,mode='normal'){
    const parts=productionParts(it,this.adapter.template(it),id=>this.adapter.material(id)),byKey=new Map((parts||[]).map(p=>[p.key,p]));let changed=false;
    group.traverse(m=>{
      if(m.userData.role==='door-pivot'){const visible=mode!=='facadesHidden';if(m.visible!==visible){m.visible=visible;changed=true;}}
      if(!m.isMesh)return;
      const role=m.userData.role,part=byKey.get(m.userData.part?.key);
      if(part)m.userData.part=part;
      const visible=role==='reveal'?mode==='normal'&&!it.doors_open:(role==='front'||m.userData.frontAccessory)?mode!=='facadesHidden':true;
      if(role==='front'||role==='reveal'||m.userData.frontAccessory){if(m.visible!==visible){m.visible=visible;changed=true;}}
      const shell=part?part.role==='front'||part.key.startsWith('side-'):role==='front';
      const inspection=mode==='inspection'&&shell;
      const id=part?part.material.variant_id:role==='front'?it.front_variant_id:role==='shelf'?it.shelves?.find(s=>s.shelf_id===m.userData.shelfId)?.material_variant_id||it.body_variant_id:role==='body'?it.body_variant_id:null;
      // Drawer boxes and their HDF bottoms are production-fixed white materials.
      // They must never inherit the selected carcass decor.
      const visualRole=part?.drawer_index&&part.role==='back'?'drawer':role==='leg'?'handle':role;
      const material=this.material(visualRole,id,Boolean(group.userData.ghost),inspection);
      if(m.material!==material){m.material=material;changed=true;}
      m.castShadow=!group.userData.ghost&&!inspection&&role!=='reveal';m.receiveShadow=!group.userData.ghost&&!inspection;m.renderOrder=inspection?5:0;
    });
    return changed;
  }
  pruneMaterials(roots){
    const used=new Set();for(const root of roots)root?.traverse(m=>{if(m.material)used.add(m.material);});
    if(this.materials.size>64)for(const [key,m]of this.materials){if(!used.has(m)){m.dispose();this.materials.delete(key);}if(this.materials.size<=64)break;}
    const activeTextures=new Set([...used].map(m=>m.map).filter(Boolean));
    if(this.textures.size>16)for(const [key,tx]of this.textures){
      if(!activeTextures.has(tx)){for(const [mk,m]of this.materials)if(m.map===tx&&!used.has(m)){m.dispose();this.materials.delete(mk);}tx.dispose();this.textures.delete(key);}
      if(this.textures.size<=16)break;
    }
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
    const key=['panel',role,w,h,d,r].join(':');
    const geometry=this.acquire(key,()=>{
      const g=panelGeometry(w,h,d,r);
      const grainAxis=role==='front'||role==='back'||w<h&&w<d?'y':'x';
      physicalPanelUV(g,{x:w,y:h,z:d},grainAxis);
      // Edge occlusion lives on the actual panel sides, not lines painted over fronts.
      // It costs no extra draw calls and never enlarges the 1.5 mm production gaps.
      if(role==='front'||role==='counter'){
        const n=g.attributes.normal,colors=new Float32Array(n.count*3);
        for(let i=0;i<n.count;i++){
          const face=Math.max(0,role==='front'?n.getZ(i):n.getY(i));
          const value=role==='front'?.42+.58*face:.76+.24*face;
          colors[i*3]=colors[i*3+1]=colors[i*3+2]=value;
        }
        g.setAttribute('color',new THREE.BufferAttribute(colors,3));
      }
      return g;
    });
    return this.mesh(group,role,geometry,key,x,y,z,id,ghost);
  }
  handle(group,length,x,y,z,horizontal,ghost){
    const key='handle:'+length;
    const g=this.acquire(key,()=>combine([
      panelGeometry(9,length,9,1.2).translate(0,0,21*S),
      ...[-1,1].map(sign=>panelGeometry(8,8,18,1).translate(0,sign*(length/2-10)*S,9*S))
    ]));
    const m=this.mesh(group,'handle',g,key,x,y,z,null,ghost);if(horizontal)m.rotation.z=Math.PI/2;m.userData.visualOnly=true;m.userData.frontAccessory=true;
  }
  foot(group,x,z,height,ghost){
    const pad=Math.min(6,height/3),key='foot:'+height;const g=this.acquire(key,()=>combine([
      new THREE.CylinderGeometry(.012,.013,(height-pad)*S,10).translate(0,pad*S/2,0),
      new THREE.CylinderGeometry(.017,.017,pad*S,10).translate(0,(-height+pad)*S/2,0)
    ]));const m=this.mesh(group,'handle',g,key,x,height/2,z,null,ghost);m.userData.visualOnly=true;m.userData.role='leg';
  }
  build(it,ghost=false){
    const group=new THREE.Group();group.userData={itemId:it.item_id,ghost,visualApproximation:false};
    const {width:W,height:H,depth:D}=it,t=18,base=heights(it).base_height,bodyH=H-base;
    group.userData.heights=heights(it);
    const body=it.body_variant_id,front=it.front_variant_id,template=this.adapter.template(it),production=template?.production||null,cells=facadeCells(it,template);
    group.userData.visualApproximation=Boolean(it.bazis_id&&!production);
    const parts=productionParts(it,template,id=>this.adapter.material(id));
    if(parts){
      for(const part of parts.filter(p=>p.role!=='front')){
        const d=part.size,c=part.position,m=this.box(group,part.role,d.x,d.y,d.z,c.x,c.y,c.z,part.material.variant_id,ghost);
        m.userData.part=part;m.userData.productionPart=part.role;
        if(part.back_type)m.userData.backType=part.back_type;
        if(part.shelf_id)m.userData.shelfId=part.shelf_id;
      }
    }else{
      this.box(group,'body',t,bodyH,D,-W/2+t/2,base+bodyH/2,0,body,ghost);
      this.box(group,'body',t,bodyH,D,W/2-t/2,base+bodyH/2,0,body,ghost);
      this.box(group,'body',W-2*t,t,D,0,H-t/2,0,body,ghost);
      this.box(group,'body',W-2*t,t,D,0,base+t/2,0,body,ghost);
      if(!it.bazis_id)this.box(group,'back',W-2*t,bodyH-2*t,4,0,base+bodyH/2,-D/2+2,body,ghost);
      for(const shelf of it.shelves||[]){
        if(shelf.enabled===false)continue;
        const m=this.box(group,'shelf',W-shelf.width_clearance,shelf.thickness,D-shelf.depth_clearance,0,base+shelf.offset_mm,shelf.depth_clearance/2,shelf.material_variant_id||body,ghost);if(m)m.userData.shelfId=shelf.shelf_id;
      }
    }

    if(!isKitchenModule(it)&&it.base==='plinth'&&base>2){
      this.box(group,'plinth',W,base-2,18,0,base/2,D/2-60,null,ghost);
      for(const sign of[-1,1])this.box(group,'plinth',18,base-2,D-100,sign*(W/2-9),base/2,-10,null,ghost);
    }
    const legs=kitchenLegs(it);
    if(legs)for(const leg of legs){this.foot(group,leg.position.x,leg.position.z,leg.height,ghost);group.children.at(-1).userData.hardware=leg;}
    else if(base>0)for(const x of[-W/2+45,W/2-45])for(const z of[-D/2+45,D/2-95])this.foot(group,x,z,base,ghost);
    if(!it.bazis_id&&it.layout==='niche'){
      const ratio=template?.front?.nicheRatio||.35,y=base+bodyH*(1-ratio);
      this.box(group,'body',W-2*t,t,D-8,0,y-t/2,-4,body,ghost);
    }
    // A solid gap-shading panel would hide the real back and shelf behind open doors.
    if(cells.length&&!(production?.doors?.length&&it.doors_open)){
      const lo=Math.min(...cells.map(f=>f.cy-f.h/2)),hi=Math.max(...cells.map(f=>f.cy+f.h/2));
      const reveal=this.box(group,'reveal',W-2*t,hi-lo,1,0,(lo+hi)/2,D/2-1,null,ghost,0);
      reveal.userData.visualOnly=true;reveal.raycast=()=>{};
    }

    const fronts=parts?.filter(p=>p.role==='front');let doorIndex=0;
    for(const f of cells){
      const drawer=f.kind==='drawer',part=fronts?.[doorIndex++],hasPivot=Boolean(part?.pivot)&&!drawer;
      const spec=hasPivot?{side:part.hinge_side,open_angle:Number.isFinite(part.open_angle)?part.open_angle:105}:null;
      let parent=group,px=f.cx,pz=part?.position.z??D/2+11,handleZ=pz+9;
      if(hasPivot){
        const hingeX=part.pivot.x,pivot=new THREE.Group();
        pivot.userData={itemId:it.item_id,role:'door-pivot',visualOnly:true,hingeSide:spec.side};
        pivot.position.set(hingeX*S,part.pivot.y*S,part.pivot.z*S);
        if(it.doors_open)pivot.rotation.y=(spec.side==='left'?-1:1)*spec.open_angle*Math.PI/180;
        group.add(pivot);parent=pivot;px=part.position.x-hingeX;pz=0;handleZ=part.thickness/2;
      }
      const panel=this.box(parent,'front',f.w,f.h,part?.thickness??18,px,f.cy,pz,part?.material.variant_id??front,ghost);panel.userData.facade={...f};
      if(part){panel.userData.part=part;if(spec)panel.userData.hingeSide=spec.side;}
      if(it.handles==='handles'&&f.w>140&&f.h>100){
        const rowDoors=cells.filter(c=>c.kind==='door'&&Math.abs(c.cy-f.cy)<1);
        const side=rowDoors.length>1?(f.cx<0?1:-1):spec?(spec.side==='right'?-1:1):/отк P/.test(it.bazis_file||'')?-1:1;
        const x=drawer?f.cx:f.cx+side*(f.w/2-50),localX=spec?x-(f.cx+(spec.side==='right'?f.w/2:-f.w/2)):x;
        const wallDoor=!drawer&&(production?.tier==='wall'||it.module_type==='wall_cabinet');
        const y=drawer?f.cy+f.h/2-36:wallDoor?f.cy-f.h/2+50:f.cy+f.h/2-50;
        // Base/tall swing handles sit near the top edge; wall-cabinet handles sit near the bottom edge.
        // The pilot swing doors keep the handle on the rotating facade.
        this.handle(parent,drawer?Math.min(160,f.w*.34):80,localX,y,handleZ,drawer,ghost);
      }
    }
    this.updateAppearance(group,it);this.position(group,it);return group;
  }
  position(group,it){group.position.set(it.x*S,elevation(it,this.adapter.room)*S,it.z*S);group.rotation.y=-(it.rotation||0)*Math.PI/180;}
  /** Pilot runs derive from production data; the old visual dressing stays for legacy projects. */
  dress(items){
    const root=new THREE.Group();root.userData={visualOnly:true,mergedPlinthIds:[]};const groups=new Map();
    for(const plan of kitchenRuns(items,this.adapter.room,id=>this.adapter.material(id))){
      const g=new THREE.Group();g.userData={tier:'base',members:plan.members,productionRun:plan};
      for(const part of plan.parts){const d=part.size,p=part.position,m=this.box(g,part.role,d.x,d.y,d.z,p.x,p.y,p.z,part.material.variant_id);m.userData.part=part;m.userData.productionPart=part.role;}
      g.position.set(plan.position.x*S,0,plan.position.z*S);g.rotation.y=-plan.rotation*Math.PI/180;root.add(g);
      root.userData.mergedPlinthIds.push(...plan.members);
    }
    for(const it of items){
      if(isKitchenModule(it)||tier(it)!=='base'||it.depth>750)continue;
      const r=it.rotation||0,axis=r===90||r===270?'z':'x',cross=axis==='x'?'z':'x',normal=rotateXZ(0,1,r)[cross];
      const dims=heights(it),line=it[cross]+normal*it.depth/2,top=elevation(it,this.adapter.room)+dims.module_height,key=[r,line,top,it.base,dims.base_height,dims.worktop_thickness].join('|');
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push({it,axis,cross,normal,line,top,dims,lo:it[axis]-it.width/2,hi:it[axis]+it.width/2});
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
        let left=Math.min(12,Math.max(0,run.lo+roomLimit)),right=Math.min(12,Math.max(0,roomLimit-run.hi));
        const cross0=Math.min(f.line,f.line-f.normal*depth),cross1=Math.max(f.line,f.line-f.normal*depth);
        for(const other of items){
          if(g.userData.members.includes(other.item_id))continue;
          const b=bounds(other,this.adapter.room,false),along0=f.axis==='x'?b.minX:b.minZ,along1=f.axis==='x'?b.maxX:b.maxZ;
          const side0=f.cross==='x'?b.minX:b.minZ,side1=f.cross==='x'?b.maxX:b.maxZ;
          if(b.maxY<=f.top||b.minY>=f.top+f.dims.worktop_thickness||side1<=cross0||side0>=cross1)continue;
          if(along1<=run.lo+1)left=Math.min(left,Math.max(0,run.lo-along1));
          if(along0>=run.hi-1)right=Math.min(right,Math.max(0,along0-run.hi));
        }
        const alongSign=rotateXZ(1,0,f.it.rotation||0)[f.axis];
        const thickness=f.dims.worktop_thickness,base=f.dims.base_height;
        this.box(g,'counter',width+left+right,thickness,depth+36,alongSign*(right-left)/2,f.top+thickness/2,18,null);
        if(f.it.base==='plinth'&&base>2&&run.members.length>1){
          this.box(g,'plinth',width,base-2,18,0,elevation(f.it,this.adapter.room)+base/2,depth/2-60,null);
          for(const sign of[-1,1])this.box(g,'plinth',18,base-2,depth-100,sign*(width/2-9),elevation(f.it,this.adapter.room)+base/2,-10,null);
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
      if(level===0){const m=plane('floor',it.width+90,it.depth+80);m.position.set(it.x*S,.0004,it.z*S);m.rotation.set(-Math.PI/2,0,(it.rotation||0)*Math.PI/180);m.userData.tier=layer;m.userData.contactItem=it.item_id;}
      const r=it.rotation||0,axis=r===90||r===270?'x':'z',sign=rotateXZ(0,-1,r)[axis],wall=(axis==='x'?room.width:room.depth)/2;
      const gap=wall-sign*it[axis]-it.depth/2;
      if(gap>=-1&&gap<=80){
        const m=plane('wall',it.width+110,it.height+110);m.position.set(it.x*S,(level+it.height/2)*S,it.z*S);
        m.position[axis]=sign*(wall*S-.002);m.rotation.y=axis==='z'?(sign<0?0:Math.PI):(sign<0?Math.PI/2:-Math.PI/2);
        m.userData.tier=layer;m.userData.contactItem=it.item_id;m.userData.wall={axis,sign};
      }
    }
    return root;
  }
  release(group){
    if(!group)return;group.traverse(o=>{const entry=this.pool.get(o.userData.geometryKey);if(entry)entry.refs=Math.max(0,entry.refs-1);});group.removeFromParent();
    // Bounded cache keeps drag/resize reuse while not retaining every historical size.
    if(this.pool.size>192)for(const [key,value]of this.pool){if(!value.refs){value.geometry.dispose();this.pool.delete(key);}if(this.pool.size<=128)break;}
  }
  signature(it){return JSON.stringify([it.width,it.height,it.depth,it.base,it.body_height,it.base_height,it.legHeightMm,it.worktop_thickness,it.handles,it.layout,it.drawers,it.template_id,it.bazis_id,it.bazis_sha256,it.doors_open,it.shelves?.map(({material_variant_id,...s})=>s)]);}
  dispose(){this.dead=true;this.geometry.dispose();this.plane.dispose();this.pool.forEach(v=>v.geometry.dispose());this.pool.clear();this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());Object.values(this.contactMaterials).forEach(m=>m.dispose());this.contactMap.dispose();this.materials.clear();this.textures.clear();}
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
