import {WALLS,ORIGINS,dimensionsError,wallLength,socketCount,socketBlockWidth,socketSurface} from './room-plan.mjs';
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function newSocket(room,id){
  const last=(room.features||[]).filter(f=>f.kind==='socket').at(-1),wall=last?.wall||'a';
  const offset=last&&last.offset+last.width+100<=wallLength(room,wall)?last.offset+last.width+14:300;
  return {id,kind:'socket',wall,offset,elevation:last?Math.min(last.elevation,room.height-86):300,width:86,height:86,projection:12,label:'Розетка',notes:''};
}
export function reconcileSurvey(room){
  if(room.survey!=null)room.survey=room.features.length?'present':null;
}
export function setSocketCount(f,count){
  const ratio=f.width/socketBlockWidth(socketCount(f),f.height);
  f.socket_count=count;f.width=Math.max(1,Math.round(socketBlockWidth(count,f.height)*(Number.isFinite(ratio)?ratio:1)));
}
export function mountSocket(f,room,id,face='front'){
  const old=socketSurface(f,room);f.mount_id=id||null;f.mount_face=face;
  const surface=socketSurface(f,room);
  if(surface){f.wall=surface.host.wall;f.offset=Math.max(0,Math.round((surface.length-f.width)/2));f.elevation=Math.max(surface.host.elevation,Math.min(f.elevation,surface.host.elevation+surface.host.height-f.height));}
  else if(old){f.wall=old.host.wall;f.offset=Math.min(wallLength(room,f.wall)-f.width,old.host.offset+f.offset);}
}
export class SocketEditor{
  constructor(setup){
    this.setup=setup;this.root=el('section');this.root.id='room-sockets';
    this.root.append(el('h3','Розетки'),el('p','Блок на 1–4 розетки: на стене или на грани вентшахты. Высота от пола — до низа рамки. Все размеры — в мм.'));
    const sample=el('div');sample.className='room-socket-sample';const picture=el('img');picture.src='/account/planner/room-assets/socket-tripo-preview.webp';picture.alt='Белая розетка с заземлением';picture.width=88;picture.height=88;const info=el('div');info.append(el('strong','Белая розетка'),el('small','Настенная · с заземлением'),el('small','Размеры рамки можно уточнить по замеру'));sample.append(picture,info);this.root.append(sample);
    this.list=el('div');this.root.append(this.list);
    const add=el('button','＋ Добавить розетку');add.type='button';add.id='room-socket-add';add.onclick=()=>this.add();this.root.append(add);setup.dimensions.append(this.root);
  }
  add(){
    const s=this.setup,r=s.readDimensions(),error=dimensionsError(r);
    if(error){s.error(error);return;}
    if(r.features.length>=100){s.error('В комнате поддерживается до 100 объектов.');return;}
    const f=newSocket(r,'socket-'+crypto.randomUUID());s.draft.features.push(f);reconcileSurvey(s.draft);
    s.error('');this.render(f.id);s.preview();this.list.lastElementChild?.scrollIntoView({block:'nearest'});
  }
  render(openId){
    this.list.replaceChildren();const s=this.setup,sockets=s.draft.features.filter(f=>f.kind==='socket');
    if(!sockets.length)this.list.append(el('p','Розетки ещё не добавлены.'));
    for(const [index,f]of sockets.entries()){
      const card=el('details');card.className='room-socket-card';card.open=f.id===openId;
      const title=el('summary'),updateTitle=()=>{title.textContent=`${index+1}. ${f.label||'Розетка'} · ${socketCount(f)} шт. · ${f.mount_id?'на вентшахте':'стена '+f.wall.toUpperCase()}`;};updateTitle();card.append(title);
      const grid=el('div');grid.className='room-feature-grid';card.append(grid);
      const select=(label,aria,options,value)=>{const l=el('label',label),input=el('select');input.setAttribute('aria-label',aria);for(const [key,text]of options){const o=el('option',text);o.value=key;input.append(o);}input.value=String(value);l.append(input);grid.append(l);return {l,input};};
      const hosts=s.draft.features.filter(x=>['shaft','column'].includes(x.kind)&&x.projection>0);
      const mounting=select('Поверхность',`Поверхность розетки ${index+1}`,[['','Обычная стена'],...hosts.map((h,n)=>[h.id,`${h.label||'Вентшахта'} ${n+1} · стена ${h.wall.toUpperCase()}`])],f.mount_id||'');
      if(f.mount_id&&!hosts.some(h=>h.id===f.mount_id)){const o=el('option','Поверхность удалена — выберите другую');o.value=f.mount_id;mounting.input.append(o);mounting.input.value=f.mount_id;}
      mounting.input.onchange=()=>{mountSocket(f,s.readDimensions(),mounting.input.value);this.render(f.id);s.preview();};
      const count=select('Количество в блоке',`Количество розеток в блоке ${index+1}`,[['1','1 розетка'],['2','2 розетки'],['3','3 розетки'],['4','4 розетки']],socketCount(f));
      count.input.onchange=()=>{setSocketCount(f,Number(count.input.value));this.render(f.id);s.preview();};
      const face=select('Грань вентшахты',`Грань вентшахты для розетки ${index+1}`,[['front','Передняя'],['start','Боковая у начала стены'],['end','Боковая у конца стены']],f.mount_face||'front');face.l.hidden=!f.mount_id;
      face.input.onchange=()=>{mountSocket(f,s.readDimensions(),f.mount_id,face.input.value);this.render(f.id);s.preview();};
      const wallLabel=el('label','Стена'),wall=el('select');wall.setAttribute('aria-label',`Стена розетки ${index+1}`);
      for(const [value,text]of Object.entries(WALLS)){const option=el('option',text);option.value=value;wall.append(option);}wall.value=f.wall;wallLabel.append(wall);grid.append(wallLabel);
      wallLabel.hidden=Boolean(f.mount_id);
      const nameLabel=el('label','Название'),name=el('input');name.value=f.label||'';name.maxLength=100;name.setAttribute('aria-label',`Название розетки ${index+1}`);name.oninput=()=>{f.label=name.value;updateTitle();};nameLabel.append(name);grid.append(nameLabel);
      let offsetLabel,offsetInput;
      const offsetCaption=f.mount_id?((f.mount_face||'front')==='front'?'Отступ от начала грани':'Отступ от основной стены'):'Отступ от '+ORIGINS[f.wall];
      for(const [key,label,min,max]of [['offset',offsetCaption,0,12000],['elevation','От пола до низа рамки',0,5000],['width','Общая ширина рамки',1,12000],['height','Высота рамки',1,5000],['projection','Выступ от поверхности',0,3000]]){
        const l=el('label'),caption=el('span',label),input=el('input');if(key==='offset'){offsetLabel=caption;offsetInput=input;}
        Object.assign(input,{type:'number',min:String(min),max:String(max),step:'1',value:String(f[key])});input.setAttribute('aria-label',`${label}, розетка ${index+1}`);
        input.oninput=()=>{f[key]=input.value===''?NaN:Number(input.value);s.preview();};l.append(caption,input);grid.append(l);
      }
      wall.onchange=()=>{f.wall=wall.value;offsetLabel.textContent='Отступ от '+ORIGINS[f.wall];offsetInput.setAttribute('aria-label',`${offsetLabel.textContent}, розетка ${index+1}`);updateTitle();s.preview();};
      if(f.mount_id)card.append(el('p',(f.mount_face||'front')==='front'?'Отступ вдоль грани считается от того же угла, что и отступ вентшахты.':'Отступ по боковой грани считается от основной стены в сторону комнаты.'));
      const remove=el('button','Удалить розетку');remove.type='button';remove.className='room-socket-remove';remove.onclick=()=>{s.draft.features=s.draft.features.filter(x=>x.id!==f.id);reconcileSurvey(s.draft);this.render();s.preview();};card.append(remove);this.list.append(card);
    }
  }
}
