import {automaticPanelSegments} from './automatic-finishes.mjs';
// Wall finishes are independent presentation assemblies, measured in millimetres.
export const panelNames={skinali:'Скиналь',ldsp:'Фартук из ЛДСП',tile:'Плитка'};
export const shapeNames={straight:'Прямая',left:'Левая',right:'Правая',u:'П-образная'};
export const sources=[{"shape": "straight", "source_file": "Скиналь.Прямая.fr3d", "source_sha256": "8bc8c1cdbad74e25ba11cc9b9000de7135de18bef5dda61a2f9f69e6c12e12b2", "default_size_mm": [2000, 600, 6], "thickness_mm": 6, "material": "Скинали Скиф Дуб Вотан · 111 CH", "elastic_planes_mm": {"x": 1800, "y": 425}}, {"shape": "left", "source_file": "Скиналь.Лево.fr3d", "source_sha256": "c0cc4a0286897293d659e01e024a452d6a24fd4e8e18c1ff4a9e90b661d55a66", "default_size_mm": [2000, 600, 400], "thickness_mm": 6, "material": "Скинали Скиф Дуб Вотан · 111 CH", "elastic_planes_mm": {"x": 1800, "y": 425, "z": 230}}, {"shape": "right", "source_file": "Скиналь.Угол.Право.fr3d", "source_sha256": "3d78e2569c06c5321d3c7b2e6da0c55a585e8e607b3633249a9045661385d917", "default_size_mm": [2000, 600, 400], "thickness_mm": 6, "material": "Скинали Скиф Дуб Вотан · 111 CH", "elastic_planes_mm": {"x": 1800, "y": 425, "z": 230}}, {"shape": "u", "source_file": "Скиналь.П-образная.fr3d", "source_sha256": "bebf714eebffd9b5b7d26447231c00c4ab53408f62c702152ac68b652a03305a", "default_size_mm": [2000, 600, 400], "thickness_mm": 6, "material": "Скинали Скиф Дуб Вотан · 111 CH", "elastic_planes_mm": {"x": 1800, "y": 425, "z": 230}}];
export const normals={a:{x:0,z:1},b:{x:-1,z:0},c:{x:0,z:-1},d:{x:1,z:0}};
export const wallLength=(r,w)=>['a','c'].includes(w)?r.width:r.depth;
export function frame(r,w,offset=0){
 const h=['a','c'].includes(w),u=h?{x:1,z:0}:{x:0,z:1},n=normals[w];
 return {u,n,x:h?-r.width/2+offset:w==='b'?r.width/2:-r.width/2,z:h?(w==='a'?-r.depth/2:r.depth/2):-r.depth/2+offset};
}
export function panelSegments(p,r){
 if(p.segments)return p.segments;
 const f=frame(r,p.wall,p.offset),t=p.thickness;
 const seg=(name,x,z,u,n,length)=>({name,x,z,u,n,length,height:p.height,bottom:p.elevation,thickness:t,host:p.wall});
 const out=[seg('Основная',f.x,f.z,f.u,f.n,p.width)];
 if(['left','u'].includes(p.shape))out.push(seg('Левая',f.x+f.n.x*t,f.z+f.n.z*t,f.n,f.u,p.depth-t));
 if(['right','u'].includes(p.shape))out.push(seg('Правая',f.x+f.u.x*p.width+f.n.x*t,f.z+f.u.z*p.width+f.n.z*t,f.n,{x:-f.u.x,z:-f.u.z},p.depth-t));
 return out;
}
export function finishError(p,r,light=false){
 if(!normals[p.wall])return 'Выберите стену.';
 for(const [key,min,max]of light?[['offset',0,12000],['width',100,6000],['elevation',30,4900],['brightness',0,100]]:[['offset',0,12000],['width',100,6000],['height',100,2000],['elevation',0,4900],['depth',50,6000],['thickness',3,40],['tile_width',100,1200],['tile_height',100,1200],['grout',1,10]]){
  if(!Number.isInteger(p[key])||p[key]<min||p[key]>max)return 'Проверьте размеры: '+key+' ('+min+'–'+max+').';
 }
 if(!p.automatic&&p.offset+p.width>wallLength(r,p.wall))return 'Элемент выходит за длину стены.';
 if(!p.automatic&&p.elevation+(light?14:p.height)>r.height)return 'Элемент выходит выше потолка.';
 if(!light){
  if(!shapeNames[p.shape]||!panelNames[p.kind])return 'Неизвестное исполнение панели.';
  if(p.kind==='skinali'&&p.thickness!==6)return 'Исходная скиналь имеет толщину 6 мм.';
  if(p.kind==='ldsp'&&![16,18].includes(p.thickness))return 'Для ЛДСП выберите 16 или 18 мм.';
  if(p.kind==='tile'&&![8,10,12].includes(p.thickness))return 'Для плитки выберите 8, 10 или 12 мм.';
  if(!p.automatic&&p.shape!=='straight'&&p.depth>(['a','c'].includes(p.wall)?r.depth:r.width))return 'Боковые участки выходят за комнату.';
 }else if(![2700,3000,4000].includes(p.temperature))return 'Выберите оттенок света.';
 return '';
}
// All segments retain a full panel behind the socket; the socket is visually
// mounted on the finished face. Measured room coordinates are never rewritten.
export function surfaceOffset(surfaces,point,normal,width,bottom,height){
 let t=0;
 for(const s of surfaces){
  if(s.n.x!==normal.x||s.n.z!==normal.z)continue;
  const dx=point.x-s.x,dz=point.z-s.z,u=dx*s.u.x+dz*s.u.z,d=dx*s.n.x+dz*s.n.z;
  if(Math.abs(d)<1&&u+width/2>0&&u-width/2<s.length&&bottom+height>s.bottom&&bottom<s.bottom+s.height)t=Math.max(t,s.thickness);
 }
 return t;
}
export function resolvedPanels(state){return (state.wallPanels||[]).map(p=>p.automatic?{...p,segments:automaticPanelSegments(state,p)}:p);}
export function resolvedFinishError(p,r){
 const error=finishError(p,r);if(error)return error;
 if(p.automatic&&p.segments?.some(s=>s.bottom+s.height>r.height))return 'Фартук выходит выше потолка. Уменьшите высоту.';
 return '';
}
export function allSegments(state){return resolvedPanels(state).filter(p=>!resolvedFinishError(p,state.room)).flatMap(p=>panelSegments(p,state.room));}
// Subtract architectural openings from the visible surface only, not from the
// native source or a production CNC file. Handles overlapping/touching openings.
export function subtractRects(rect,cuts){
 let parts=[rect];
 for(const c of cuts){const next=[];
  for(const a of parts){const x0=Math.max(a.x,c.x),x1=Math.min(a.x+a.w,c.x+c.w),y0=Math.max(a.y,c.y),y1=Math.min(a.y+a.h,c.y+c.h);
   if(x0>=x1||y0>=y1){next.push(a);continue;}
   for(const b of [{x:a.x,y:a.y,w:x0-a.x,h:a.h},{x:x1,y:a.y,w:a.x+a.w-x1,h:a.h},{x:x0,y:a.y,w:x1-x0,h:y0-a.y},{x:x0,y:y1,w:x1-x0,h:a.y+a.h-y1}])if(b.w>0&&b.h>0)next.push(b);
  }parts=next;
 }return parts;
}
export function segmentOpenings(s,r){
 const cuts=[];
 for(const f of r.features||[]){if(!['window','door'].includes(f.kind))continue;const n=normals[f.wall];if(n.x!==s.n.x||n.z!==s.n.z)continue;
  const p=frame(r,f.wall,f.offset),dx=p.x-s.x,dz=p.z-s.z;if(Math.abs(dx*s.n.x+dz*s.n.z)>1)continue;
  cuts.push({x:dx*s.u.x+dz*s.u.z,y:f.elevation-s.bottom,w:f.width,h:f.height});
 }return cuts;
}
export function finishSchedule(state){
 const panels=resolvedPanels(state).map(p=>({...p,source:p.kind==='skinali'?sources.find(s=>s.shape===(p.automatic?'straight':p.shape)):null,parts:panelSegments(p,state.room).map(s=>({name:s.name,width:s.length,height:s.height,thickness:s.thickness})),native_import:false}));
 return {panels,lights:state.wallLights||[],note:'Стеновые панели и настенная подсветка: визуализация и размеры. Не включены в распил и автоматический импорт БАЗИС; вырезы, стыки, крепление и электрика уточняются конструктором. Исходные FR3D скинали — 6 мм.'};
}
export function finishText(s){
 if(!s.wallPanels?.length&&!s.wallLights?.length)return '';
 return ['СТЕНОВЫЕ ПАНЕЛИ И ПОДСВЕТКА (визуализация):',...resolvedPanels(s).map(p=>p.automatic?panelNames[p.kind]+' · по столешнице · '+panelSegments(p,s.room).map(q=>q.length+' × '+q.height+' × '+q.thickness+' мм · низ '+q.bottom+' мм').join(' / '):panelNames[p.kind]+' · '+shapeNames[p.shape]+' · стена '+p.wall.toUpperCase()+' · '+p.width+' × '+p.height+' × '+p.thickness+' мм · низ '+p.elevation+' мм · отступ '+p.offset+' мм'+(p.shape!=='straight'?' · возврат '+p.depth+' мм':'')),...(s.wallLights||[]).map(p=>'Настенная подсветка · стена '+p.wall.toUpperCase()+' · длина '+p.width+' мм · высота '+p.elevation+' мм · '+p.temperature+' K'),finishSchedule(s).note].join('\n');
}
globalThis.MF_WALL_FINISHES={schedule:finishSchedule,text:finishText};
