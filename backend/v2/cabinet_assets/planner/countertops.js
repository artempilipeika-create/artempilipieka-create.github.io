/* Countertops are derived from cabinet placement. No independent draggable slab state. */
(function(root){
  'use strict';
  const variants=root.MF_COUNTERTOP_VARIANTS||[],names={straight:'Прямая',left:'Угол слева',right:'Угол справа',u:'П-образная',custom:'Составная'};
  const near=(a,b)=>Math.abs(a-b)<.1,round=x=>Math.round(x*1e6)/1e6;
  const source=(shape,joint)=>variants.find(v=>v.shape===shape&&v.joint===(shape==='straight'?'standard':joint));
  function decorate(runs,items,core){
    const {rotateXZ}=core,nodes=[];
    for(const run of runs)for(const part of run.parts.filter(p=>p.role==='counter')){
      const c=rotateXZ(part.position.x,part.position.z,run.rotation),odd=run.rotation%180!==0;
      const x=run.position.x+c.x,z=run.position.z+c.z,w=odd?part.size.z:part.size.x,d=odd?part.size.x:part.size.z;
      nodes.push({run,part,x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,links:[]});
    }
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i],b=nodes[j];if(!near(a.part.position.y,b.part.position.y)||!near(a.part.thickness,b.part.thickness))continue;
      const touchX=(near(a.x1,b.x0)||near(a.x0,b.x1))&&Math.min(a.z1,b.z1)-Math.max(a.z0,b.z0)>.1;
      const touchZ=(near(a.z1,b.z0)||near(a.z0,b.z1))&&Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0)>.1;
      if(touchX||touchZ){a.links.push(b);b.links.push(a);}
    }
    const visited=new Set();
    for(const first of nodes){
      if(visited.has(first))continue;const group=[],queue=[first];visited.add(first);
      while(queue.length){const n=queue.shift();group.push(n);for(const other of n.links)if(!visited.has(other)){visited.add(other);queue.push(other);}}
      const ids=[...new Set(group.flatMap(n=>n.part.module_ids))],groupRuns=[...new Set(group.map(n=>n.run))];
      const joints=groupRuns.flatMap(run=>(run.corner_joints||[]).filter(j=>j.countertop_enabled&&ids.includes(j.corner_id)&&ids.includes(j.return_id)).map(j=>({...j,run})));
      const main=groupRuns.find(r=>joints.filter(j=>j.run===r).length===2)||joints[0]?.run||first.run;
      const local=group.map(n=>{
        const c=rotateXZ(n.run.position.x-main.position.x,n.run.position.z-main.position.z,-main.rotation);
        const p=rotateXZ(n.part.position.x,n.part.position.z,n.run.rotation-main.rotation),odd=(n.run.rotation-main.rotation)%180!==0;
        const w=odd?n.part.size.z:n.part.size.x,d=odd?n.part.size.x:n.part.size.z;
        return {...n,x0:c.x+p.x-w/2,x1:c.x+p.x+w/2,z0:c.z+p.z-d/2,z1:c.z+p.z+d/2};
      });
      const x0=Math.min(...local.map(n=>n.x0)),x1=Math.max(...local.map(n=>n.x1)),z0=Math.min(...local.map(n=>n.z0)),z1=Math.max(...local.map(n=>n.z1));
      const mainJoints=joints.filter(j=>j.run===main),sides=new Set(mainJoints.map(j=>j.side));
      const shape=joints.length===0&&groupRuns.every(r=>(r.rotation-main.rotation)%180===0)?'straight':
        joints.length===1&&groupRuns.length===2?mainJoints[0]?.side||'custom':
        joints.length===2&&sides.size===2&&groupRuns.length===3?'u':'custom';
      const joint=items.find(it=>it.item_id===mainJoints[0]?.corner_id)?.countertopJoint||items.find(it=>ids.includes(it.item_id))?.countertopJoint||'standard';
      const donor=source(shape,joint),thickness=first.part.thickness;
      const groupId='countertop:'+group.map(n=>n.part.part_id).sort().join('|');
      const midpoint=rotateXZ((x0+x1)/2,(z0+z1)/2,main.rotation);
      const assembly={id:groupId,shape,label:names[shape],joint,members:ids,source:donor||null,
        target:{width:round(x1-x0),height:thickness,depth:round(z1-z0)},
        position:{x:round(main.position.x+midpoint.x),y:round(first.part.position.y-thickness/2),z:round(main.position.z+midpoint.z)},rotation:main.rotation,
        joint_count:joints.length,euro_joint_count:joint==='euro'?joints.length:0,
        parts:group.map(n=>n.part.part_id),native_supported:false,native_notes:[],arms:{}};
      const mainNodes=local.filter(n=>n.run===main),arms={};
      for(const n of local.filter(n=>n.run!==main)){
        const side=near(n.x0,x0)?'left':near(n.x1,x1)?'right':'custom';
        (arms[side]??=[]).push(n);
      }
      for(const [side,ns]of Object.entries(arms))assembly.arms[side]=round(Math.max(...ns.map(n=>n.z1))-z0);
      const regular=donor&&mainNodes.length===1&&near(mainNodes[0].z0,z0)&&near(mainNodes[0].z1-z0,600)&&
        Object.values(arms).every(ns=>ns.length===1&&near(ns[0].x1-ns[0].x0,600)&&near(ns[0].z0,z0+600))&&
        (shape==='straight'?group.length===1:shape==='u'?group.length===3:group.length===2)&&thickness===38;
      if(regular&&joint==='euro'&&shape!=='straight'){
        // Source contours retain their fixed 600 mm depth and 15 mm joint radius.
        // Each return length follows its cabinets, including unequal U arms.
        const planeX=donor.elastic_planes.find(p=>p.axis==='x').position,planeZ=donor.elastic_planes.find(p=>p.axis==='z').position;
        for(const panel of donor.panels){
          const n=panel.role==='main'?mainNodes[0]:arms[panel.role]?.[0];if(!n)continue;
          const depth=panel.role==='main'?assembly.target.depth:assembly.arms[panel.role];
          n.part.contour=panel.points.map(([x,z])=>{
            const px=x0+x+(x>planeX?assembly.target.width-donor.source_default.width:0),pz=z0+z+(z>planeZ?depth-donor.source_default.depth:0);
            const world=rotateXZ(px,pz,main.rotation);
            const point=rotateXZ(main.position.x+world.x-n.run.position.x,main.position.z+world.z-n.run.position.z,-n.run.rotation);
            return [round(point.x),round(point.z)];
          });
          const xs=n.part.contour.map(p=>p[0]),zs=n.part.contour.map(p=>p[1]);
          const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
          Object.assign(n.part,{length:round(maxX-minX),width:round(maxZ-minZ),size:{x:round(maxX-minX),y:38,z:round(maxZ-minZ)},
            position:{x:round((minX+maxX)/2),y:n.part.position.y,z:round((minZ+maxZ)/2)}});
        }
      }
      if(!regular)assembly.native_notes.push('Составная раскладка, отключённые участки, нестандартная глубина или толщина: размеры деталей переданы отдельно; исходный FR3D целиком не подставлен.');
      if(regular&&shape==='u'&&!near(assembly.arms.left,assembly.arms.right))assembly.native_notes.push('Плечи имеют разную длину. Общая эластичность исходного П-фрагмента меняет оба плеча вместе; длины уточняются по деталям.');
      if(group.some(n=>n.part.length>4100||n.part.width>4100))assembly.native_notes.push('Деталь длиннее заготовки 4100 мм: требуется дополнительное деление.');
      if(new Set(group.map(n=>n.part.material.variant_id)).size>1)assembly.native_notes.push('На участках разные материалы: требуется раздельное назначение в БАЗИС.');
      assembly.native_supported=regular&&!assembly.native_notes.length;
      if(shape==='straight'&&group.every(n=>near(n.part.width,600)&&n.part.thickness===38&&n.part.length<=4100)){
        assembly.native_supported=true;assembly.native_notes=[];
        assembly.native_segments=group.map(n=>{
          const p=rotateXZ(n.part.position.x,n.part.position.z,n.run.rotation);
          return {target:{width:n.part.length,height:n.part.thickness,depth:n.part.width},rotation:n.run.rotation,
            position:{x:round(n.run.position.x+p.x),y:round(n.part.position.y-n.part.thickness/2),z:round(n.run.position.z+p.z)},material:{...n.part.material}};
        });
      }
      assembly.material={...first.part.material};
      for(const n of group){n.part.countertop_assembly_id=groupId;n.part.countertop_joint=joint;}
      (main.countertop_assemblies??=[]).push(assembly);
      for(const j of joints)(j.run.countertop_operations??=[]).push({key:'operation:countertop-'+j.joint,label:j.joint==='euro'?'Еврозапил столешницы':'Обычный стык столешницы',quantity:1,unit:'joint',corner_id:j.corner_id,return_id:j.return_id});
    }
  }
  function assemblies(runs){return runs.flatMap(r=>r.countertop_assemblies||[]);}
  function nativeItems(runs){
    return assemblies(runs).filter(a=>a.native_supported).flatMap(a=>a.native_segments?a.native_segments.map(s=>({...a,...s})):a).map((a,i)=>({index:i+1,bazis_id:a.source.id,source_file:a.source.source_file,source_sha256:a.source.source_sha256,
      source_default:a.source.source_default,elastic_resize:true,target:a.target,position:a.position,rotation:a.rotation,
      name:'Столешница · '+a.label+(a.joint==='euro'?' · еврозапил':''),production_note:'Автоматически по нижним шкафам. '+a.target.width+' × '+a.target.depth+' × '+a.target.height+' мм. '+(a.joint==='euro'?'Еврозапил: '+a.euro_joint_count+' стык(а).':'Обычное соединение.'),
      body_variant_id:a.material.variant_id,front_variant_id:null,construction:{key:'countertop',parts:[{role:'body',material:a.material,thickness:a.target.height}],countertop:a}}));
  }
  function drawing(shape='left',joint='standard'){
    const left=shape==='left'||shape==='u',right=shape==='right'||shape==='u';
    return '<svg viewBox="0 0 200 110" role="img" aria-label="'+names[shape]+'"><path d="M12 12H188V'+(right?98:42)+'H'+(right?158:188)+'V42H'+(left?42:12)+'V'+(left?98:42)+'H12Z" fill="#d9e0d5" stroke="#536158" stroke-width="2"/>'+[left?'left':null,right?'right':null].filter(Boolean).map(side=>'<path d="'+(side==='left'?(joint==='euro'?'M12 38H36Q39 38 42 42':'M12 42H42'):(joint==='euro'?'M158 42Q161 38 164 38H188':'M158 42H188'))+'" fill="none" stroke="#355742" stroke-width="2"/>').join('')+'</svg>';
  }
  root.MF_COUNTERTOPS=Object.freeze({variants,names,source,decorate,assemblies,nativeItems,drawing});
})(globalThis);
