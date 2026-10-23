// Presentation metadata never enters dimensions, pricing or production geometry.
export const VIEW_LIMIT=6;
export const VIEW_NAMES={current:'Текущий ракурс',threeQuarter:'Общий вид',left:'Слева',right:'Справа',front:'Фасадный',top:'Сверху'};
export function exportSize(choice,maxSize=4096){
  const width=Math.min(choice==='large'?2560:1920,Math.max(960,maxSize));
  return {width:Math.round(width),height:Math.round(width*9/16)};
}
export function fileName(name,view,branded,date=new Date()){
  const clean=value=>String(value).normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'').replace(/\s+/g,' ').trim().slice(0,80)||'Проект';
  return `Martin Forest — ${clean(name)} — ${clean(view)}${branded?' — Презентация':''} — ${date.toISOString().slice(0,10)}.png`;
}
export function qualityProfile(mode='auto',hints={}){
  const low=(hints.memory>0&&hints.memory<=4)||(hints.cores>0&&hints.cores<=4);
  const effective=mode==='auto'?(low?'balanced':'high'):mode;
  return effective==='balanced'?{name:'balanced',ratio:1,limit:1440}:{name:'high',ratio:1.75,limit:2560};
}
export class RenderBudget{
  constructor(){this.samples=[];this.reduced=false;}
  record(ms){
    // Ignore shader compilation, background tabs and isolated stalls. Downgrade
    // only after sustained expensive frames; never oscillate during a gesture.
    if(this.reduced||!Number.isFinite(ms)||ms<1||ms>250)return false;
    this.samples.push(ms);if(this.samples.length<36)return false;
    const sorted=this.samples.splice(0).sort((a,b)=>a-b);
    if(sorted[18]>42){this.reduced=true;return true;}return false;
  }
}
export function ellipsis(ctx,text,width){
  text=String(text);if(ctx.measureText(text).width<=width)return text;
  const chars=Array.from(text);while(chars.length&&ctx.measureText(chars.join('')+'…').width>width)chars.pop();
  return chars.join('')+'…';
}
export function presentationSheet(source,{name,view,date=new Date(),room,modules}){
  const c=document.createElement('canvas'),w=source.width,pad=Math.round(w*.045),head=Math.round(w*.12),foot=Math.round(w*.105);
  c.width=w;c.height=head+source.height+foot;const ctx=c.getContext('2d');
  ctx.fillStyle='#faf9f5';ctx.fillRect(0,0,w,c.height);
  ctx.fillStyle='#244a38';ctx.fillRect(0,0,10,c.height);
  ctx.font=`${Math.round(w*.028)}px Georgia, serif`;ctx.fillText('Martin Forest',pad,head*.43);
  ctx.font=`${Math.round(w*.009)}px Arial, sans-serif`;ctx.fillStyle='#6a746b';ctx.fillText('СТУДИЯ МЕБЕЛИ  /  ПРОЕКТ КУХНИ',pad,head*.65);
  ctx.textAlign='right';ctx.fillText(new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Minsk'}).format(date),w-pad,head*.42);
  ctx.fillText(view.toUpperCase(),w-pad,head*.65);ctx.textAlign='left';
  ctx.drawImage(source,0,head);
  const y=head+source.height;ctx.fillStyle='#244a38';ctx.font=`${Math.round(w*.021)}px Georgia, serif`;
  ctx.fillText(ellipsis(ctx,name,w-pad*2),pad,y+foot*.35);
  ctx.font=`${Math.round(w*.009)}px Arial, sans-serif`;ctx.fillStyle='#68736b';
  ctx.fillText(`Помещение ${room.width} × ${room.depth} × ${room.height} мм  ·  Модулей: ${modules}`,pad,y+foot*.59);
  ctx.font=`${Math.round(w*.008)}px Arial, sans-serif`;ctx.fillText('Визуализация проекта · Цветопередача зависит от экрана. Материалы согласуются по образцам.',pad,y+foot*.82);
  return c;
}
