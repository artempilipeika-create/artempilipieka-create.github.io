// Server-side projection of the same pinned, elastic parts used by the planner and BAZIS export.
import {readFileSync} from 'node:fs';
import {sourceProduction, productionParts, kitchenRuns} from './cabinet_assets/planner/furniture-core.mjs';
import {panelSegments, resolvedPanels, resolvedFinishError, panelNames} from './cabinet_assets/planner/wall-finishes.mjs';
import nativeBook from './estimate_data/kitchen_native.json' with {type:'json'};
import {fixturePlans} from './cabinet_assets/planner/worktop-fixtures.mjs';
import {boardProfileCuts, golaOutline, horizontalProfileCuts, gripShelfOutline} from './cabinet_assets/planner/wardrobe-door-hardware.mjs';

const round = value => Math.round(value * 1e5) / 1e5;
function pathLength(points) {
  return points.slice(1).reduce((sum, point, i) => sum + Math.hypot(...point.map((n, j) => n - points[i][j])), 0);
}
function milledContourLength(points) {
  const bounds=[0,1].map(axis=>{
    const values=points.map(point=>point[axis]);
    return [Math.min(...values),Math.max(...values)];
  });
  // The bounding blank's four outside lines are already charged as straight saw cuts.
  return points.reduce((total,u,i)=>{
    const v=points[(i+1)%points.length];
    const onOutside=bounds.some((ends,axis)=>ends.some(edge=>Math.abs(u[axis]-edge)<.01 && Math.abs(v[axis]-edge)<.01));
    return onOutside?total:total+pathLength([u,v]);
  },0);
}
function seatLength(parts) {
  return parts.filter(part => part.edge === -1).reduce((n, part) => {
    if (part.arc) return n + 10 * Math.asin(Math.min(1,Math.hypot(part.arc[0]-part.arc[4],part.arc[1]-part.arc[5])/10));
    return n + pathLength([part.line.slice(0,2),part.line.slice(2,4)]);
  },0);
}
function ownerDrawer(part, drawers) {
  if (part.drawer_index) return part.drawer_index;
  const match = /^(?:drawer-(?:front-)?(\d+)(?:-|$)|front-(\d+)$)/.exec(part.key);
  if (match && (part.role !== 'front' || part.facade?.kind === 'drawer')) return Number(match[1] || match[2]);
  if (drawers === 1 && (part.role === 'drawer' || part.key.startsWith('drawer-') || part.facade?.kind === 'drawer')) return 1;
  return null;
}
function panelEdges(p, native) {
  const a = p.orientation;
  const edge = (span, thick=1, clip=true) => ({span,thick,clip});
  if (p.source_edges?.length && native?.front_vertices) {
    const verts=p.native_polygon?.front || native.front_vertices;
    return p.source_edges.map(e=>{
      const i=e.Elem, j=(i+1)%verts.length, points=[verts[i],verts[j]];
      if (!points.every(Boolean)) return null;
      if (p.native_polygon) return {mm:round(pathLength(points)),thick:e.Thick,clip:false};
      const axis=['x','y','z'].find((_,k)=>Math.abs(points[0][k]-points[1][k])>.01);
      return edge(axis===a.length_axis?'length':'width',e.Thick,Boolean(e.Clip));
    }).filter(Boolean);
  }
  if (Array.isArray(p.source_edges)) {
    // The native rectangular contour runs in the panel's local X/Y axes.
    return p.source_edges.map(e=>edge(e.Elem%2===0?'length':'width',e.Thick,Boolean(e.Clip)));
  }
  if (p.thickness<=4 || p.optical_material || p.role==='counter') return [];
  // Where a legacy donor has no recorded edging, use the shop's panel rules.
  const along=axis=>axis===a.length_axis?'length':'width';
  if (p.role==='front' || p.role==='plinth' || p.role==='shelf' && !p.fixed)
    return ['length','length','width','width'].map(s=>edge(s,p.role==='front'?2:1));
  if (p.role==='drawer' || p.back_type==='drawer_bottom') {
    if (a.thickness_axis==='y') return []; // Captured metal-system bottom or HDF.
    return [edge(along(a.thickness_axis==='x'?'z':'x'))];
  }
  if (p.role==='shelf' || p.role==='body') {
    const side=a.thickness_axis==='x';
    const axes=[side?'y':'x'];
    if(p.panel_machining?.some(op=>['groove','rabbet'].includes(op.kind)))axes.push(side?'y':'x');
    if(p.key==='bottom' && p.size.x===p.moduleWidth && !side)axes.push('z','z');
    return axes.filter(axis=>axis!==a.thickness_axis).map(axis=>edge(along(axis)));
  }
  return [];
}
function summarizePanel(p,native,drawer) {
  const cuts=[];
  for(const cut of p.machining||[]){
    const length=cut.length_mm ?? (cut.trajectory?.length ? pathLength(cut.trajectory) : null);
    cuts.push({key:'mill16to18',name:cut.kind==='led_groove'?'Паз под подсветку':'Фрезеровка паза',mm:length==null?null:round(length)});
  }
  for(const cut of p.panel_machining||[]) {
    const span=cut.edge.startsWith('x')?(p.machining_axis==='side'?p.size.y:p.size.x):p.size.z;
    cuts.push({key:'mill16to18',name:cut.kind==='rabbet'?'Выборка четверти':'Фрезеровка паза',mm:round(span-(cut.start||0)-(cut.end||0))});
  }
  let contour=p.contour_yz;
  if(!contour && p.native_polygon?.front?.length>4){
    const axes=[p.orientation.length_axis,p.orientation.width_axis].map(axis=>'xyz'.indexOf(axis));
    contour=p.native_polygon.front.map(point=>axes.map(axis=>point[axis]));
  }
  if(contour?.length>4){
    const mm=milledContourLength(contour);
    if(mm)cuts.push({key:'curveCut',name:'Вырез по контуру детали',mm:round(mm)});
  }
  return {id:p.part_id,name:p.name,role:p.role,drawer,length:round(p.length),width:round(p.width),thickness:round(p.thickness),
    variant:p.material?.variant_id,materialName:p.material?.name,glass:p.optical_material==='glass',
    edges:panelEdges(p,native),cuts};
}
function moduleGeometry(it,lookup) {
  const production=sourceProduction(it);
  if (!it.bazis_sha256 || !production || it.bazis_sha256!==production.source_sha256) return null;
  const parts=productionParts(it,{production},lookup);
  if(!parts?.length)return null;
  const v=production.wall_special||production.modern;
  const verified=nativeBook[it.bazis_sha256]?.edges || {};
  const panels=parts.filter(p=>p.type==='panel' && p.optical_material!=='frame').map(p=>{
    const source=v?.panels?.find(s=>s.key===p.key);
    const panel=summarizePanel({...p,moduleWidth:it.width},source,ownerDrawer(p,it.drawers));
    const recorded=verified[p.key] ?? (p.role==='shelf' && /^shelf-[1-9]/.test(p.key)?verified['shelf-1']:null);
    if(recorded){
      panel.edges=recorded;
      // A newly selected groove exposes the rear edge of the supporting panel.
      if(p.panel_machining?.length){
        const axis=p.machining_axis==='side'?'y':'x',span=p.orientation.length_axis===axis?'length':'width';
        if(panel.edges.filter(e=>e.span===span).length<2)
          panel.edges=[...panel.edges,{span,thick:1,clip:true}];
      }
    }else if(!Array.isArray(p.source_edges) && p.thickness>4 && !p.optical_material){
      panel.edgeReview=true;
    }
    return panel;
  });
  return {panels,guideDepth:globalThis.MF_KITCHEN_FILLINGS.drawerDepth(it)};
}
function geometry(scene) {
  const {items,room}=scene, lookup=id=>scene.materialIdentities?.[id] || null;
  const modules={}, extraPanels=[],operations=[],issues=[];
  for (const it of items) {
    if(it.module_type==='blank') {
      if(it.assistant_carcass?.spec.front && ['side','horizontal'].includes(it.blank_axis)){
        const side=it.blank_axis==='side',cuts=side?boardProfileCuts(it,items):horizontalProfileCuts(it,items);
        if(cuts.length){
          const outline=side?golaOutline(it.depth,it.height,cuts):gripShelfOutline(it.depth,it.width,cuts);
          const mm=round(seatLength(outline));
          if(mm)operations.push({item:it.item_id,key:'curveCut',name:'Вырез под профиль Gola',mm});
        }
      }
      continue;
    }
    try {modules[it.item_id]=moduleGeometry(it,lookup);}
    catch {modules[it.item_id]=null;}
  }
  const runs=kitchenRuns(items,room,lookup);
  for(const run of runs){
    for(const p of run.parts.filter(p=>p.role==='counter'))extraPanels.push(summarizePanel(p));
    for(const op of run.countertop_operations||[])operations.push({key:op.key,name:op.label,qty:op.quantity,unit:'шт.'});
  }
  for(const plan of globalThis.MF_ACCESSORIES.plans(scene,lookup)){
    if(plan.error)issues.push(plan.error);
    else for(const p of plan.parts)extraPanels.push(summarizePanel({...p,role:'plinth',key:p.key||'plinth'}));
  }
  for(const f of fixturePlans(items,room,runs)){
    if(f.error)issues.push(f.error);
    else operations.push({key:'worktop-cutout',name:'Вырез в столешнице',qty:1,unit:'шт.'});
  }
  for(const p of resolvedPanels(scene)){
    const err=resolvedFinishError(p,room);
    if(err){issues.push(err);continue;}
    for(const [i,s] of panelSegments(p,room).entries())extraPanels.push({id:p.id+':'+i,name:panelNames[p.kind],role:p.kind,variant:p.material_id,
      length:s.length,width:s.height,thickness:p.thickness,edges:[],cuts:[]});
  }
  return {modules,extraPanels,operations,issues};
}
process.stdout.write(JSON.stringify(geometry(JSON.parse(readFileSync(0,'utf8')))));
