import {rotateXZ,elevation,kitchenGroup,kitchenSettings,cornerSpec,cornerReturnPlacement,cabinetFrontExtension,tallRearExtension} from './furniture-core.mjs';

const tolerance=.6;
const near=(a,b)=>Math.abs(a-b)<tolerance;
const samePosition=(a,b)=>a.rotation===b.rotation&&near(a.x,b.x)&&near(a.z,b.z);
const rearOffset=it=>kitchenSettings(it)?.rearServiceGapMm??tallRearExtension(it);
const local=it=>rotateXZ(it.x,it.z,-(it.rotation||0));
const peers=(a,b,room)=>kitchenGroup(a)===kitchenGroup(b)&&near(elevation(a,room),elevation(b,room));

/** Reconstruct actual joints from saved coordinates. Deliberate gaps are never bridged. */
export function layoutJoints(items,room){
  const joints=[];
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
    const a=items[i],b=items[j];if(!peers(a,b,room)||!['base_cabinet','wall_cabinet','tall_cabinet'].includes(a.module_type))continue;
    const ab=cornerReturnPlacement(a,b),ba=cornerReturnPlacement(b,a);
    if(ab&&samePosition(ab,b)){joints.push({kind:'corner',a:a.item_id,b:b.item_id});continue;}
    if(ba&&samePosition(ba,a)){joints.push({kind:'corner',a:b.item_id,b:a.item_id});continue;}
    if(a.rotation!==b.rotation)continue;
    const x=local(a),y=local(b);
    if(!near(Math.abs(y.x-x.x),(a.width+b.width)/2))continue;
    const back=near(x.z-a.depth/2-rearOffset(a),y.z-b.depth/2-rearOffset(b));
    const front=near(x.z+a.depth/2+cabinetFrontExtension(a),y.z+b.depth/2+cabinetFrontExtension(b));
    if(back||front)joints.push({kind:'straight',a:a.item_id,b:b.item_id,sign:y.x>x.x?1:-1,alignment:back?'back':'front'});
  }
  return joints;
}

function beside(a,b,sign,alignment){
  const dz=alignment==='back'?(b.depth-a.depth)/2+rearOffset(b)-rearOffset(a):(a.depth-b.depth)/2+cabinetFrontExtension(a)-cabinetFrontExtension(b);
  const delta=rotateXZ(sign*(a.width+b.width)/2,dz,a.rotation||0);
  return {...b,x:a.x+delta.x,z:a.z+delta.z};
}
function follow(joint,parent,child){
  if(joint.kind==='straight')return beside(parent,child,parent.item_id===joint.a?joint.sign:-joint.sign,joint.alignment);
  if(parent.item_id===joint.a)return cornerReturnPlacement(parent,child);
  const offset=cornerReturnPlacement({...child,x:0,z:0},parent);
  return offset?{...child,x:parent.x-offset.x,z:parent.z-offset.z}:null;
}

/** Keep the outer back corner fixed while dimensions grow into the room. */
export function anchoredDimensions(source,next){
  const c=cornerSpec(source),sign=c?.side==='right'?-1:1;
  const delta=rotateXZ(sign*(next.width-source.width)/2,(next.depth-source.depth)/2+rearOffset(next)-rearOffset(source),source.rotation||0);
  return {...next,x:source.x+delta.x,z:source.z+delta.z};
}

/** A corner and its touching rows resize atomically, including after save/reopen. */
export function resizeConnectedLayout(source,next,items,room){
  const joints=layoutJoints(items,room),component=new Set([source.item_id]),queue=[source.item_id];
  while(queue.length){const id=queue.shift();for(const j of joints){const other=j.a===id?j.b:j.b===id?j.a:null;if(other&&!component.has(other)){component.add(other);queue.push(other);}}}
  const corners=items.filter(it=>component.has(it.item_id)&&cornerSpec(it));
  if(!corners.length)return null;
  // Prefer the edited corner; otherwise anchor the nearest corner in the existing component.
  const root=corners.find(it=>it.item_id===source.item_id)||corners.sort((a,b)=>Math.hypot(a.x-source.x,a.z-source.z)-Math.hypot(b.x-source.x,b.z-source.z))[0];
  const updated=new Map(items.map(it=>[it.item_id,it.item_id===source.item_id?next:{...it}]));
  updated.set(root.item_id,root.item_id===source.item_id?anchoredDimensions(source,next):{...root});
  const done=new Set([root.item_id]),pending=[root.item_id];
  while(pending.length){const id=pending.shift();for(const j of joints){const other=j.a===id?j.b:j.b===id?j.a:null;if(!other||done.has(other))continue;
    const candidate=follow(j,updated.get(id),updated.get(other));if(!candidate)throw Error('Не удалось сохранить угловой стык.');
    updated.set(other,candidate);done.add(other);pending.push(other);
  }}
  for(const j of joints.filter(j=>component.has(j.a))){const expected=follow(j,updated.get(j.a),updated.get(j.b));if(!expected||!samePosition(expected,updated.get(j.b)))throw Error('Размер замыкает несовместимые стыки. Разъедините один стык перед изменением.');}
  return items.filter(it=>component.has(it.item_id)).map(it=>updated.get(it.item_id));
}

export function cornerCandidates(selected,items,room){
  return items.filter(it=>it.item_id!==selected?.item_id&&selected&&peers(it,selected,room)&&cornerReturnPlacement(it,selected));
}
