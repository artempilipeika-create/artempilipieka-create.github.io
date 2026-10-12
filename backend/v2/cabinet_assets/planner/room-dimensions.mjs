import {WALLS,roomReady} from './room-plan.mjs';

// Inner finished wall faces, in millimetres. No dependency on placed furniture.
export function roomDimensions(room,{mode='3d',camera={x:0,z:0}}={}){
  if(!roomReady(room))return [];
  const x=room.width/2,z=room.depth/2,h=room.height,y=mode==='top'?0:h;
  const walls=[
    {wall:'a',axis:'z',sign:-1,value:room.width,a:{x:-x,y,z:-z},b:{x,y,z:-z},out:{x:0,y:y+200,z:-z-200}},
    {wall:'b',axis:'x',sign:1,value:room.depth,a:{x,y,z:-z},b:{x,y,z},out:{x:x+200,y:y+200,z:0}},
    {wall:'c',axis:'z',sign:1,value:room.width,a:{x:-x,y,z},b:{x,y,z},out:{x:0,y:y+200,z:z+200}},
    {wall:'d',axis:'x',sign:-1,value:room.depth,a:{x:-x,y,z:-z},b:{x:-x,y,z},out:{x:-x-200,y:y+200,z:0}},
  ];
  // Follow the room's cutaway: hidden near walls do not leave floating labels.
  const dims=walls.filter(w=>mode==='top'||camera[w.axis]*w.sign<(w.axis==='x'?x:z)-10).map(w=>({
    ...w,id:'room:wall:'+w.wall,kind:'room',prefix:w.wall.toUpperCase()+' · ',title:'Стена '+WALLS[w.wall],offset:22,
  }));
  if(mode!=='top'){
    const sx=camera.x>=0?-1:1,sz=camera.z>=0?-1:1;
    dims.push({id:'room:height',kind:'room',prefix:'H · ',title:'Высота комнаты от пола до потолка',value:h,
      a:{x:sx*x,y:0,z:sz*z},b:{x:sx*x,y:h,z:sz*z},out:{x:sx*(x+200),y:h/2,z:sz*(z+200)},offset:38});
  }
  return dims;
}
