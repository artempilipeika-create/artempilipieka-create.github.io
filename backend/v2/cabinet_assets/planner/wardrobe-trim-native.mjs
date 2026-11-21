import {localPoint,worldPoint} from './blank-bindings.mjs';
import joint from './wardrobe-trim-joint.json' with {type:'json'};

const sources={
 left:['MF_Trim_Left.fr3d','30be270bbfac56f50a29e10319db4d64a03afe46e58abca0b46d265458078dd1'],
 right:['MF_Trim_Right.fr3d','6021bf08e71f565041b181a01e3b8db350e1d1fa767f5fc26665aef391918604'],
 end:['MF_Trim_End.fr3d','2fb535965b6a2cdd48a5061256dc72f45ea8e09c73645833049150ee0b293eec'],
 cap:['MF_Trim_Ceiling.fr3d','1593b2bf163f12120e40c96b9feca7ff7a035da5ba5b67f96f197b97aaf7f5a9']
};
const partKey=/^trim-((?:left|right)(?:-[1-9]\d*)?|cap)-(face|return|end|upright|base)$/;
// The shop fragment is named for the edge of its face that carries the
// return, so the cabinet's left side takes its right-hand joint and vice versa.
const sourceAtSide={left:'right',right:'left',cap:'cap'};

// Older saved wardrobes placed the return at the wall edge of the face.
// Recognise that exact assembly before adjusting a loaded panel's position.
export function alignSavedTrimReturns(items){
 const byId=new Map(items.map(it=>[it.item_id,it]));
 const near=(a,b)=>Math.abs(a-b)<.01;
 for(const it of items){
  const owner=it.assistant_carcass?.group_id;
  if(!owner||it.module_type!=='blank'||it.blank_axis!=='side'||!it.item_id?.startsWith(owner+':'))continue;
  const side=/^trim-(left|right)(?:-[1-9]\d*)?-return$/.exec(it.item_id.slice(owner.length+1))?.[1];
  if(!side||it.assistant_carcass.spec?.surround?.[side]?.kind!=='filler')continue;
  const face=byId.get(it.item_id.replace(/-return$/,'-face')),wall=byId.get(owner+':'+side),rotation=it.rotation||0;
  if(face?.blank_axis!=='back'||wall?.blank_axis!=='side'||![0,90,180,270].includes(rotation)||
     [face,wall].some(p=>p.assistant_carcass?.group_id!==owner||(p.rotation||0)!==rotation)||
     it.width!==18||it.depth!==82||face.depth!==18||wall.width!==18||
     it.height!==face.height||it.elevation_mm!==face.elevation_mm)continue;
  const f=localPoint(face,rotation),r=localPoint(it,rotation),w=localPoint(wall,rotation);
  const sign=side==='left'?-1:1,edge=w.x+sign*wall.width/2;
  if(near(f.x-sign*face.width/2,edge)&&near(r.x,f.x+sign*(face.width-it.width)/2)&&
     near(r.z+it.depth/2,f.z-face.depth/2)){
   Object.assign(it,worldPoint({x:edge+sign*it.width/2,z:r.z},rotation));
  }
 }
}

function makeRow(unit,segmented,lookup){
 const {side,number,parts}=unit;
 const kind=parts.has('end')?'end':sourceAtSide[side];
 const roles=kind==='cap'?['face','upright','base']:kind==='end'?['end']:['face','return'];
 const name=kind==='cap'?'Закладная под потолок':(kind==='end'?'Торцевая стойка ':'Г-образная фальшпланка ')+(side==='left'?'слева':'справа');
 const title=segmented?name+' · часть '+number:name;
 if(parts.size!==roles.length||roles.some(role=>!parts.has(role)))throw Error(title+' — неполный комплект панелей.');
 const reference=parts.get(roles[0]),rotation=reference.rotation||0;
 if(![0,90,180,270].includes(rotation))throw Error(title+' — проверьте угол поворота сборки.');
 // The face is the frontmost surface. The solid donor and all of its boards share
 // the bottom of that face. Measure in cabinet coordinates before rotating back.
 const face=localPoint(reference,rotation);
 const width=reference.width,height=reference.height,depth=kind==='end'?reference.depth:100;
 if(kind!=='cap'&&(height<100||height>3000))throw Error(title+' — высота одной детали должна быть от 100 до 3000 мм.');
 const x0=face.x-width/2,y0=reference.elevation_mm,z0=face.z+reference.depth/2-depth;
 const panels=[];
 for(const role of roles){
  const it=parts.get(role),local=localPoint(it,rotation),material=lookup(it.body_variant_id);
  if(!material?.name||Number(material.thickness)!==18)throw Error(it.name+' — выберите материал толщиной 18 мм.');
  let dimensions,offset;
  if(role==='face'){dimensions=[width,height,18];offset=[0,0,depth-18];}
  else if(role==='end'){dimensions=[18,height,depth];offset=[0,0,0];}
  else if(role==='return'){dimensions=[18,height,depth-18];offset=[kind==='right'?width-18:0,0,0];}
  else if(role==='upright'){dimensions=[width,height-18,18];offset=[0,18,depth-36];}
  else {dimensions=[width,18,depth-18];offset=[0,0,0];}
  const actual=[it.width,it.height,it.depth,local.x-x0-it.width/2,it.elevation_mm-y0,local.z-z0-it.depth/2];
  const required=[...dimensions,...offset];
  if((it.rotation||0)!==rotation||!actual.every((n,i)=>Number.isFinite(n)&&Math.abs(n-required[i])<.01))
   throw Error(it.name+' — взаимное положение панелей отличается от родной фальшпланки.');
  panels.push({role,blank_item_id:it.item_id,name:it.name,material,edge_code:it.blank_edge_code,
   edge_thickness:it.blank_edge_thickness_mm,production_note:it.production_note||''});
 }
 const [source_file,source_sha256]=sources[kind];
 const source_default=kind==='cap'?{width:1000,height:100,depth:100}:{width:kind==='end'?18:100,height:1000,depth:100};
 const position={...worldPoint({x:x0+width/2,z:z0+depth/2},rotation),y:y0};
 const span=(kind==='cap'?width:height)-2*joint.symmetric_end_inset_mm;
 const pairs=kind==='end'?0:joint.pairs_by_clear_span.find(([limit])=>span<=limit)?.[1]??null;
 return {name:title,host_blank_id:reference.item_id,source_file,source_sha256,source_default,target:{width,height,depth},
  position,rotation,elastic_resize:true,wardrobe_trim:{kind,panels,expected_pairs:pairs},
  production_note:panels.filter(p=>p.production_note).map(p=>p.name+' — '+p.production_note).join('\n')};
}

// Keep separate boards in the scene, drawings and cutting list. Replace one
// complete assembly with its signed native source only for the BAZIS export.
export function nativeTrimRows(items,lookup){
 const units=new Map(),splitSides=new Set(),ids=new Map();
 for(const it of items){
  const owner=it.assistant_carcass?.group_id;
  if(it.module_type!=='blank'||!owner||!it.item_id?.startsWith(owner+':'))continue;
  const match=partKey.exec(it.item_id.slice(owner.length+1));
  if(!match)continue;
  const [,key,role]=match,[side,ordinal]=key.split('-'),number=Number(ordinal||1);
  const sideId=owner+':trim-'+side,unitId=number===1?sideId:sideId+'-'+number;
  if(number>1)splitSides.add(sideId);
  if(!units.has(unitId))units.set(unitId,{sideId,side,number,parts:new Map()});
  const unit=units.get(unitId);
  if(unit.parts.has(role))throw Error('Повторяется деталь фальшпланки «'+it.name+'».');
  unit.parts.set(role,it);
  ids.set(it.item_id,null);
 }
 for(const unit of units.values()){
  const row=makeRow(unit,splitSides.has(unit.sideId),lookup);
  ids.set(row.host_blank_id,row);
 }
 return ids;
}
