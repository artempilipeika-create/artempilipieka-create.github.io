import * as THREE from './vendor/three.module.js';
import {MeshFactory} from './module-mesh.mjs';
import {WardrobeMotion,drawerKey} from './wardrobe-motion.mjs';
import {clearanceSession,drawerStroke} from './wardrobe-clearance.mjs';
import {placeCarcass} from './carcass-model.mjs';
import {footHeight} from './plinth-options.mjs';
import {nicheOpenings} from './wardrobe-niches.mjs';
import {levelOf,sectionOf,isRightBank} from './wardrobe-layout.mjs';
import {retainedBlankMaterial} from './blanks-model.mjs';
import {drawerBottom} from './wardrobe-drawers.mjs';

const element=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
const groupId='questionnaire-preview';
const origin={x:0,z:0,elevation_mm:0,rotation:0};

// A second camera on the planner's existing WebGL renderer. Read back only a bounded
// thumbnail after a real change or while a door/drawer is moving.
export class WardrobePreview{
  constructor(app,onPick){
    this.app=app;this.onPick=onPick;this.entries=new Map();this.motion=new WardrobeMotion();
    this.root=element('section');this.root.className='wardrobe-live';this.root.hidden=true;
    const header=element('div'),title=element('h3','Шкаф в 3D');
    this.select=element('select');this.select.setAttribute('aria-label','Шуфляда для просмотра');
    this.drawerButton=element('button','Выдвинуть шуфляду');this.drawerButton.type='button';this.drawerButton.hidden=true;
    this.drawerButton.onclick=()=>this.showDrawer(this.motion.requested?null:this.select.value||this.select.options[1]?.value);
    header.append(title,this.select,this.drawerButton);this.canvas=element('canvas');this.canvas.setAttribute('aria-label','Открытый шкаф с внутренними фасадами');
    this.travelNotice=element('output');this.travelNotice.hidden=true;this.root.append(header,this.canvas,this.travelNotice);
    this.select.onchange=()=>this.showDrawer(this.select.value||null);
    this.canvas.onclick=e=>this.pick(e);
    this.resize=new ResizeObserver(()=>this.invalidate());this.resize.observe(this.canvas);
  }
  showDrawer(key){
    const motion=this.motion;if(key!==motion.requested)motion.toggleDrawer(key||motion.requested);
    this.updateTravel();this.invalidate();
  }
  updateTravel(){
    const key=this.motion.requested;let message='';
    if(key){
      const hit=clearanceSession(this.adapter.items,this.entries,null,this.motion).drawer(key);
      this.motion.limit=hit?.time??1;
      const travel=Math.round(drawerStroke(this.adapter.items,groupId,key)*this.motion.limit);
      message='Ход в просмотре '+travel+' мм.'+(hit?' Препятствие — '+hit.obstacle+'.':'');
    }
    this.select.value=key||'';this.drawerButton.textContent=key?'Задвинуть шуфляду':'Выдвинуть шуфляду';
    this.travelNotice.textContent=message;this.travelNotice.hidden=!message;
  }
  init(owner){
    this.owner=owner;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#e6ece5');
    this.scene.environment=owner.scene.environment;this.scene.environmentIntensity=.70;
    this.scene.add(new THREE.HemisphereLight('#fffaf0','#b6c4bc',1.05));
    const sun=new THREE.DirectionalLight('#fff5df',1.75);sun.position.set(-3,4,4);this.scene.add(sun);
    const fill=new THREE.DirectionalLight('#e3f2ff',.58);fill.position.set(3,2,2);this.scene.add(fill);
    this.model=new THREE.Group();this.scene.add(this.model);
    this.outline=new THREE.Box3Helper(new THREE.Box3(),0x2376c5);
    Object.assign(this.outline.material,{transparent:true,opacity:.91,toneMapped:false,depthWrite:false});
    this.scene.add(this.outline);this.camera=new THREE.PerspectiveCamera(31,1,.015,40);
    const app=this.app;
    this.adapter={room:app.adapter.room,items:[],get state(){return app.adapter.state;},template:()=>null,material:id=>app.adapter.material(id)};
    this.factory=new MeshFactory(this.adapter,()=>this.invalidate());
    this.target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,samples:Math.min(2,owner.renderer.capabilities.maxSamples)});
    this.target.texture.colorSpace=THREE.SRGBColorSpace;
    this.ray=new THREE.Raycaster();this.ctx=this.canvas.getContext('2d',{alpha:false});
  }
  sync(built,slot,current=null,changed={}){
    const owner=this.app.scene;
    if(!built||!owner?.renderer||owner.dead){this.hide();return;}
    if(this.owner&&owner!==this.owner)this.release();
    if(!this.owner)this.init(owner);
    const prior=new Map(current?.items.map(it=>[it.item_id.slice(current.metadata.group_id.length+1),it])||[]);
    const materials=new Map(built.parts.map(({key,item})=>{
      const old=prior.get(key);
      const role=item.blank_axis==='front'?'front':key==='back'||key==='mezz-back'&&built.spec.back?'back':key.startsWith('drawer-')&&built.spec.thickness!==18?'drawer':'body';
      const preserve=!changed[role]&&!(drawerBottom(item.item_id)&&item.blank_thickness_mm===3)&&(!item.blank_shelf||item.blank_shelf.startsWith('board/'));
      return [item.item_id,preserve?retainedBlankMaterial(item,old,id=>this.app.adapter.material(id)):item.body_variant_id];
    }));
    const stamp=JSON.stringify([built.spec,[...materials.values()]]);
    if(this.stamp!==stamp){
      const meta={group_id:groupId,spec:built.spec,position:origin};
      const items=placeCarcass(built,origin).map(it=>({...it,body_variant_id:materials.get(it.item_id),assistant_carcass:meta}));
      this.adapter.items=items;this.adapter.room=this.app.adapter.room;
      const ids=new Set(items.map(it=>it.item_id));
      for(const [id,e] of this.entries)if(!ids.has(id)){this.factory.release(e.group);this.entries.delete(id);}
      for(const it of items){
        const key=this.factory.signature(it);
        let e=this.entries.get(it.item_id);
        if(!e||e.key!==key){if(e)this.factory.release(e.group);e={key,group:this.factory.build(it)};this.entries.set(it.item_id,e);this.model.add(e.group);}
        this.factory.position(e.group,it);this.factory.updateAppearance(e.group,it);
      }
      if(this.motion.requested&&!items.some(it=>drawerKey(it)===this.motion.requested))this.motion.requested=null;
      this.stamp=stamp;this.bounds=new THREE.Box3().makeEmpty();
      for(const it of items){
        const v=new THREE.Vector3(it.x*.001,it.elevation_mm*.001,it.z*.001);
        this.bounds.expandByPoint(v.clone().add(new THREE.Vector3(-it.width/2000,0,-it.depth/2000)));
        this.bounds.expandByPoint(v.add(new THREE.Vector3(it.width/2000,it.height*.001,it.depth/2000)));
      }
    }
    const interior=slot!=null;
    if(this.root.hidden||interior!==(this.slot!=null)){
      this.motion.reset();
      if(interior)this.motion.show(groupId);
      this.canvas.setAttribute('aria-label',interior?'Открытый шкаф с внутренними фасадами':'Шкаф с выбранной фурнитурой');
    }
    if(this.slot!==slot&&this.motion.requested?.split('-')[0]!==String(slot))this.motion.requested=null;
    this.slot=slot;
    const bank=interior?built.drawerBanks?.[slot]:null,count=bank?.faces.length||0;
    if(this.select.dataset.bank!==slot+':'+count){
      this.select.replaceChildren(new Option('Все шуфляды',''),...Array.from({length:count},(_,i)=>new Option('Шуфляда '+(i+1),slot+'-'+i)));
      this.select.dataset.bank=slot+':'+count;
    }
    if(this.motion.requested&&!this.adapter.items.some(it=>it.item_id===groupId+':drawer-'+this.motion.requested+'-face'))this.motion.requested=null;
    this.select.hidden=!count;this.drawerButton.hidden=!count;this.updateTravel();
    this.outline.visible=Boolean(bank);
    if(bank){
      const room=nicheOpenings(built.spec,bank.section)[levelOf(slot)];
      const offset=footHeight(built.spec),bottom=room.bottom+offset,top=room.top+offset;
      const side=this.adapter.items.find(it=>it.item_id===groupId+':left');
      const front=(side.z+side.depth/2+1)*.001;
      this.outline.box.min.set(bank.left*.001,bottom*.001,front);
      this.outline.box.max.set(bank.right*.001,top*.001,front+.0003);
    }
    this.root.hidden=false;this.invalidate();
  }
  pick(e){
    if(this.slot==null&&!this.onPart)return;
    const rect=this.canvas.getBoundingClientRect();
    this.ray.setFromCamera({x:(e.clientX-rect.left)*2/rect.width-1,y:1-(e.clientY-rect.top)*2/rect.height},this.camera);
    const hit=this.ray.intersectObject(this.model,true).find(h=>h.object.visible&&h.object.isMesh);
    const item=this.adapter.items.find(it=>it.item_id===hit?.object.userData.itemId);
    if(this.onPart&&item){this.onPart(item.item_id.slice(groupId.length+1));return;}
    const key=drawerKey(item);if(!key||!item.item_id.endsWith('-face'))return;
    const slot=Number(key.split('-')[0]);
    this.showDrawer(this.motion.requested===key?null:key);this.onPick(sectionOf(slot),levelOf(slot),Number(isRightBank(slot)));
  }
  invalidate(){
    if(!this.root.hidden&&!this.frame)this.frame=requestAnimationFrame(t=>this.draw(t));
  }
  draw(time){
    this.frame=0;const owner=this.owner;if(!owner||owner.dead||this.root.hidden)return;
    if(time<this.nextPaint){this.invalidate();return;}
    const rect=this.canvas.getBoundingClientRect();
    if(rect.width<1||rect.height<1)return;
    const scale=Math.min(devicePixelRatio||1,1.4,640/Math.max(rect.width,rect.height));
    const w=Math.max(1,Math.round(rect.width*scale)),h=Math.max(1,Math.round(rect.height*scale));
    if(this.target.width!==w||this.target.height!==h||!this.image){this.canvas.width=w;this.canvas.height=h;this.target.setSize(w,h);this.pixels=new Uint8Array(w*h*4);this.image=this.ctx.createImageData(w,h);}
    const moving=this.motion.step(time,owner.reducedMotion?.matches);this.motion.pose(this.entries,this.adapter.items);
    if(this.onPart){
      const selected=this.entries.get(groupId+':'+this.selectedPart);
      this.outline.visible=Boolean(selected);
      if(selected)this.outline.box.setFromObject(selected.group);
    }
    const center=this.bounds.getCenter(new THREE.Vector3()),size=this.bounds.getSize(new THREE.Vector3());
    const aspect=w/h,tan=Math.tan(this.camera.fov*Math.PI/360);
    const distance=Math.max(size.y/.85,(size.x+size.z*.55)/(.81*aspect))/(2*tan)+size.z*.82;
    this.camera.aspect=aspect;this.camera.updateProjectionMatrix();
    this.camera.position.copy(center).addScaledVector(new THREE.Vector3(.35,.16,1).normalize(),distance);
    this.camera.lookAt(center);this.camera.updateMatrixWorld();
    const renderer=owner.renderer,old=renderer.getRenderTarget(),shadows=renderer.shadowMap.enabled;
    try{
      renderer.shadowMap.enabled=false;renderer.setRenderTarget(this.target);renderer.render(this.scene,this.camera);
      renderer.readRenderTargetPixels(this.target,0,0,w,h,this.pixels);
      this.image.data.set(this.pixels);this.ctx.putImageData(this.image,0,0);
    }catch{this.hide();return;}
    finally{renderer.setRenderTarget(old);renderer.shadowMap.enabled=shadows;}
    this.nextPaint=time+(moving?1000/30:0);
    if(moving)this.invalidate();
  }
  hide(){
    this.root.hidden=true;cancelAnimationFrame(this.frame);this.frame=0;this.nextPaint=0;this.motion.reset();
  }
  release(){
    this.hide();for(const e of this.entries.values())this.factory.release(e.group);this.entries.clear();
    this.factory?.dispose();this.outline?.geometry.dispose();this.outline?.material.dispose();this.target?.dispose();
    this.scene?.clear();this.owner=null;this.stamp=null;
  }
  dispose(){this.release();this.resize.disconnect();this.root.remove();}
}
