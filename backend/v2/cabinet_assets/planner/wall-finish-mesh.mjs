import * as THREE from './vendor/three.module.js';
import {allSegments,panelSegments,finishError,resolvedPanels,resolvedFinishError,frame,segmentOpenings,subtractRects,surfaceOffset} from './wall-finishes.mjs';
const S=.001;
const wallVisible=(w,r,c)=>w==='a'?c.z>-r.depth*S/2+.02:w==='c'?c.z<r.depth*S/2-.02:w==='b'?c.x<r.width*S/2-.02:c.x>-r.width*S/2+.02;
export class WallFinishMesh{
 constructor(scene){this.scene=scene;this.root=new THREE.Group();scene.scene.add(this.root);this.materials=new Set();this.geometries=new Set();}
 material(settings){const m=new THREE.MeshPhysicalMaterial(settings);this.materials.add(m);return m;}
 geometry(g){this.geometries.add(g);return g;}
 clear(){this.root.clear();for(const m of this.materials)m.dispose();for(const g of this.geometries)g.dispose();this.materials.clear();this.geometries.clear();}
 local(s){const group=new THREE.Group();group.matrixAutoUpdate=false;group.matrix.makeBasis(new THREE.Vector3(s.u.x,0,s.u.z),new THREE.Vector3(0,1,0),new THREE.Vector3(s.n.x,0,s.n.z));group.matrix.setPosition(s.x*S,s.bottom*S,s.z*S);group.userData.wall=s.host;this.root.add(group);return group;}
 box(group,w,h,t,x,y,z,material){
  const g=this.geometry(new THREE.BoxGeometry(w*S,h*S,t*S)),uv=g.attributes.uv,pos=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<pos.count;i++)uv.setXY(i,Math.abs(n.getZ(i))>.5?pos.getX(i)+x*S:pos.getZ(i)+z*S,Math.abs(n.getY(i))>.5?pos.getZ(i)+z*S:pos.getY(i)+y*S);
  const m=new THREE.Mesh(g,material);m.position.set(x*S,y*S,z*S);m.castShadow=true;m.receiveShadow=true;m.raycast=()=>{};group.add(m);return m;
 }
 sync(){
  const a=this.scene.adapter,s=a.state,r=a.room,panels=resolvedPanels(s),lights=s.wallLights||[];
  const key=JSON.stringify([r,panels,lights,s.displaySettings?.materialAppearance,panels.map(p=>p.material_id?a.material(p.material_id):null)]);
  if(key===this.key)return;this.key=key;this.clear();const surfaces=allSegments(s);
  for(const p of panels){if(resolvedFinishError(p,r))continue;
   const material=p.kind==='ldsp'&&p.material_id?this.scene.factory.material('body',p.material_id):this.material({color:p.color,roughness:p.kind==='skinali'?.19:p.kind==='tile'?.3:.68,clearcoat:p.kind==='skinali'?.8:p.kind==='tile'?.25:0,clearcoatRoughness:.12,metalness:0});
   const grout=p.kind==='tile'?this.material({color:p.grout_color,roughness:.95}):null;
   for(const seg of panelSegments(p,r)){
    const g=this.local(seg),cuts=segmentOpenings(seg,r),parts=subtractRects({x:0,y:0,w:seg.length,h:seg.height},cuts);
    for(const q of parts)this.box(g,q.w,q.h,p.kind==='tile'?p.thickness-1:p.thickness,q.x+q.w/2,q.y+q.h/2,(p.kind==='tile'?p.thickness-1:p.thickness)/2,grout||material);
    if(p.kind==='tile'){
     const rects=[];
     for(let y=0;y<seg.height;y+=p.tile_height)for(let x=0;x<seg.length;x+=p.tile_width){
      const tile={x:x+p.grout/2,y:y+p.grout/2,w:Math.min(p.tile_width,seg.length-x)-p.grout,h:Math.min(p.tile_height,seg.height-y)-p.grout};
      if(tile.w>0&&tile.h>0)rects.push(...subtractRects(tile,cuts));
     }
     if(rects.length){const mesh=new THREE.InstancedMesh(this.geometry(new THREE.BoxGeometry(1,1,1)),material,rects.length),matrix=new THREE.Matrix4();
      rects.forEach((q,i)=>{matrix.makeScale(q.w*S,q.h*S,.001);matrix.setPosition((q.x+q.w/2)*S,(q.y+q.h/2)*S,(p.thickness-.5)*S);mesh.setMatrixAt(i,matrix);});
      mesh.instanceMatrix.needsUpdate=true;mesh.receiveShadow=true;mesh.castShadow=true;mesh.raycast=()=>{};g.add(mesh);
     }
    }
   }
  }
  for(const p of lights){if(finishError(p,r,true))continue;
   const f=frame(r,p.wall,p.offset),point={x:f.x+f.u.x*p.width/2,z:f.z+f.u.z*p.width/2};
   const back=surfaceOffset(surfaces,point,f.n,p.width,p.elevation-14,28),g=this.local({...f,bottom:p.elevation,host:p.wall});
   const metal=this.material({color:p.finish==='black'?'#303331':'#b9bdbe',roughness:.28,metalness:.72});
   this.box(g,p.width,24,30,p.width/2,0,back+15,metal);
   const color=p.temperature===2700?'#ffd19b':p.temperature===3000?'#ffe2b8':'#fff4e2',power=p.enabled?p.brightness/100:0;
   const lens=this.material({color:'#f5f1e7',roughness:.42,emissive:color,emissiveIntensity:power*2.5});
   this.box(g,Math.max(20,p.width-12),2,22,p.width/2,-12.5,back+17,lens);
   // At most four wall profiles, two downward lights each. No added shadow maps.
   for(const ratio of [.25,.75]){
    const light=new THREE.SpotLight(color,0,3.5,Math.PI*.42,.8,2),target=new THREE.Object3D();
    light.position.set(p.width*S*ratio,-.016,(back+23)*S);target.position.set(p.width*S*ratio,-.7,(back+240)*S);light.target=target;
    light.userData.power=power*Math.min(p.width/1000,2)*1.8;light.intensity=light.userData.power;g.add(light,target);
   }
  }
  this.scene.renderer.shadowMap.needsUpdate=true;
 }
 visibility(){const r=this.scene.adapter.room;for(const g of this.root.children){g.visible=this.scene.mode!=='top'&&wallVisible(g.userData.wall,r,this.scene.camera.position);g.traverse(o=>{if(o.isLight)o.intensity=g.visible?o.userData.power:0;});}}
 dispose(){this.clear();this.root.removeFromParent();}
}
