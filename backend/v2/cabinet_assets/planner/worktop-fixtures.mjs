import {kitchenSettings,kitchenRuns,rotateXZ,elevation} from './furniture-core.mjs';
import {countertopContour} from './countertop-visuals.mjs';

export const fixtureNames={sink:'Мойка',hob:'Варочная панель'};
export const faucetNames={arch:'Высокий дуговой',angled:'Г-образный',compact:'Компактный'};
export function defaultFixture(kind){return {kind,width:kind==='sink'?500:580,depth:kind==='sink'?480:510,offset_x:0,front_offset:kind==='sink'?60:45,finish:'steel',faucet:'arch',faucet_finish:'chrome',hood:'none',hood_gap:650,hood_width:600};}
// Rounded rectangle in the cabinet's horizontal X/Z plane, millimetres, CCW.
export function roundedOutline(w,d,r=18,cx=0,cz=0){
  r=Math.min(r,w/2,d/2);const p=[];
  for(const [x,z,start]of [[w/2-r,d/2-r,0],[-w/2+r,d/2-r,90],[-w/2+r,-d/2+r,180],[w/2-r,-d/2+r,270]])
    for(let i=0;i<=8;i++){const a=(start+i*90/8)*Math.PI/180;p.push([cx+x+Math.cos(a)*r,cz+z+Math.sin(a)*r]);}
  return p;
}
export function fixtureError(it){
  const f=it?.worktop_fixture;if(!f)return '';
  const k=kitchenSettings(it);
  if(!k)return 'Выберите нижний шкаф из каталога БАЗИС.';
  if(!k.countertopEnabled)return 'Для мойки или варочной нужна столешница над шкафом.';
  if(!fixtureNames[f.kind]||!faucetNames[f.faucet]||!['steel','black'].includes(f.finish)||!['chrome','black'].includes(f.faucet_finish))return 'Проверьте исполнение мойки или варочной.';
  if(!['none','chimney'].includes(f.hood??'none')||(f.hood==='chimney'&&f.kind!=='hob'))return 'Вытяжка доступна над варочной панелью.';
  if(!Number.isInteger(f.hood_gap??650)||(f.hood_gap??650)<400||(f.hood_gap??650)>1200)return 'Расстояние до вытяжки: 400–1200 мм.';
  if(!Number.isInteger(f.hood_width??600)||(f.hood_width??600)<400||(f.hood_width??600)>1200)return 'Ширина вытяжки: 400–1200 мм.';
  if(!['width','depth','offset_x','front_offset'].every(v=>Number.isInteger(f[v])))return 'Размеры и отступы задаются целыми миллиметрами.';
  if(f.width<300||f.width>1000||f.depth<300||f.depth>700)return 'Размер модели: ширина 300–1000, глубина 300–700 мм.';
  if(Math.abs(f.offset_x)+f.width/2>it.width/2)return 'Модель выходит за ширину выбранного шкафа. Уменьшите ширину или смещение.';
  if(f.front_offset<20||f.front_offset+f.depth>k.countertopDepthMm-20)return 'Оставьте минимум 20 мм столешницы спереди и сзади модели.';
  return '';
}
function inside(p,polygon){
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
  return result;
}
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function contains(polygon,outline){
  if(!outline.every(p=>inside(p,polygon)))return false;
  return !outline.some((a,i)=>{const b=outline[(i+1)%outline.length];return polygon.some((c,j)=>{const d=polygon[(j+1)%polygon.length];return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0;});});
}
/** Native worktop parts are read only. Cutouts live solely in the presentation mesh. */
export function fixturePlans(items,room,runs=kitchenRuns(items,room)){
  return items.filter(it=>it.worktop_fixture).map(it=>{
    const f=it.worktop_fixture,error=fixtureError(it);if(error)return {itemId:it.item_id,error};
    const k=kitchenSettings(it),z=-it.depth/2-k.rearServiceGapMm+k.countertopDepthMm-f.front_offset-f.depth/2;
    const p=rotateXZ(f.offset_x,z,it.rotation||0),x=it.x+p.x,wz=it.z+p.z;
    const toRun=(points,run)=>points.map(([a,b])=>{const w=rotateXZ(a,b,it.rotation||0),v=rotateXZ(x+w.x-run.position.x,wz+w.z-run.position.z,-run.rotation);return [v.x,v.z];});
    const outer=roundedOutline(f.width,f.depth,12);
    const run=runs.find(r=>r.members.includes(it.item_id));
    const part=run?.parts.find(p=>p.role==='counter'&&contains(countertopContour(p),toRun(outer,run)));
    if(!part)return {itemId:it.item_id,error:'Модель попадает на край или стык столешниц. Измените размеры или положение.'};
    // Keep the whole generated bowl clear of the worktop; its rim covers the opening.
    const hole=roundedOutline(f.width-20,f.depth-20,f.kind==='sink'?12:8);
    const y=elevation(it,room)+it.height+k.countertopThicknessMm;
    const hood=f.hood==='chimney'?{width:f.hood_width??600,height:525,depth:450,y:(f.hood_gap??650)+525/2,z:-it.depth/2-k.rearServiceGapMm+450/2-z}:null;
    if(hood){
      if(y+hood.y+hood.height/2>(room.height??2700))return {itemId:it.item_id,error:'Вытяжка выходит выше потолка. Уменьшите высоту установки.'};
      const center=rotateXZ(0,hood.z,it.rotation||0),turned=(it.rotation||0)%180!==0;
      const hw=(turned?hood.depth:hood.width)/2,hd=(turned?hood.width:hood.depth)/2;
      const conflict=items.find(other=>{
        if(other.item_id===it.item_id)return false;
        const rotated=(other.rotation||0)%180!==0,ow=(rotated?other.depth:other.width)/2,od=(rotated?other.width:other.depth)/2;
        const bottom=elevation(other,room),top=bottom+other.height;
        return Math.abs(x+center.x-other.x)<hw+ow-1&&Math.abs(wz+center.z-other.z)<hd+od-1&&y+hood.y-hood.height/2<top-1&&y+hood.y+hood.height/2>bottom+1;
      });
      if(conflict)return {itemId:it.item_id,error:'Вытяжка пересекается со шкафом «'+conflict.name+'». Освободите место над варочной.'};
    }
    return {...f,itemId:it.item_id,x,y,z:wz,hoodLayout:hood,rotation:it.rotation||0,part,hole:toRun(hole,run)};
  });
}
