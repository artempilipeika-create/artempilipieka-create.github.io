import models from './decor-feet.json' with {type:'json'};
import centres from './decor-centres.json' with {type:'json'};
export const decorativeFeet=models;
export const decorFoot=spec=>models.find(f=>f.article===spec?.feet?.article);
export const centralFoot=height=>centres[height];

const diagonalFamilies=new Set(['DELI','FLASH','HELLY','MIRAGE','OLYMPIA','STATE','STELLAR','TRIADA']);
export function turn([x,z],angle){
 const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return [x*c-z*s,x*s+z*c];
}
export function decorativePlan(spec,leg){
 if(leg.issue)throw Error(leg.issue);
 const bottomWidth=spec.width-(spec.bottomFit==='overlay'?0:2*spec.thickness);
 const direction=Math.round(Math.atan2(leg.toe[1],leg.toe[0])*4/Math.PI)*45;
 const plan=[];
 for(const side of [-1,1])for(const end of [-1,1]){
  const target=diagonalFamilies.has(leg.name)?Math.atan2(end,side)*180/Math.PI:end*90;
  const yaw=(target-direction+360)%360,points=leg.hull.map(p=>turn(p,yaw));
  const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
  const edge=end===1?spec.feet.front:spec.feet.rear;
  const x=side*(bottomWidth/2-5)-(side===1?Math.max(...xs):Math.min(...xs));
  const z=end*(spec.depth/2-edge)-(end===1?Math.max(...zs):Math.min(...zs));
  if(xs.some(v=>side*(x+v)<0)||zs.some(v=>end*(z+v)<0))
   throw Error('Для этой серии недостаточно места под дном. Проверьте ширину, глубину и отступы.');
  plan.push({host:'bottom',article:leg.article,x,z,yaw});
 }
 if(spec.width>800){
  const centre=centralFoot(leg.height),radius=centre.radius??40;
  // The central pad must clear even the inward edge of the corner fittings.
  for(const corner of plan){
   const pts=leg.hull.map(p=>turn(p,corner.yaw));
   if(pts.every(p=>Math.abs(corner.x+p[0])>=radius)||pts.every(p=>Math.abs(corner.z+p[1])>=radius))continue;
   throw Error('Центральная опора пересекается с угловой. Проверьте глубину и отступы.');
  }
  plan.push({host:'bottom',article:centre.article,x:0,z:0,yaw:0,centre:true});
 }
 return plan;
}
