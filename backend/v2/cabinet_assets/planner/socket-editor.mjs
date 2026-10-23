import {WALLS,ORIGINS,dimensionsError,wallLength} from './room-plan.mjs';
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function newSocket(room,id){
  const last=(room.features||[]).filter(f=>f.kind==='socket').at(-1),wall=last?.wall||'a';
  const offset=last&&last.offset+last.width+100<=wallLength(room,wall)?last.offset+last.width+14:300;
  return {id,kind:'socket',wall,offset,elevation:last?Math.min(last.elevation,room.height-86):300,width:86,height:86,projection:12,label:'Розетка',notes:''};
}
export function reconcileSurvey(room){
  if(room.survey!=null)room.survey=room.features.length?'present':null;
}
export class SocketEditor{
  constructor(setup){
    this.setup=setup;this.root=el('section');this.root.id='room-sockets';
    this.root.append(el('h3','Розетки'),el('p','Разместите розетки по замеру. Высота от пола задаётся до нижнего края рамки. Все размеры — в мм.'));
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
      const title=el('summary',`${index+1}. ${f.label||'Розетка'} · стена ${f.wall.toUpperCase()}`);card.append(title);
      const grid=el('div');grid.className='room-feature-grid';card.append(grid);
      const wallLabel=el('label','Стена'),wall=el('select');wall.setAttribute('aria-label',`Стена розетки ${index+1}`);
      for(const [value,text]of Object.entries(WALLS)){const option=el('option',text);option.value=value;wall.append(option);}wall.value=f.wall;wallLabel.append(wall);grid.append(wallLabel);
      const nameLabel=el('label','Название'),name=el('input');name.value=f.label||'';name.maxLength=100;name.setAttribute('aria-label',`Название розетки ${index+1}`);name.oninput=()=>{f.label=name.value;title.textContent=`${index+1}. ${f.label||'Розетка'} · стена ${f.wall.toUpperCase()}`;};nameLabel.append(name);grid.append(nameLabel);
      let offsetLabel;
      for(const [key,label,min,max]of [['offset','Отступ от '+ORIGINS[f.wall],0,12000],['elevation','От пола до низа рамки',0,5000],['width','Ширина рамки',1,12000],['height','Высота рамки',1,5000],['projection','Выступ от стены',0,3000]]){
        const l=el('label'),caption=el('span',label),input=el('input');if(key==='offset')offsetLabel=caption;
        Object.assign(input,{type:'number',min:String(min),max:String(max),step:'1',value:String(f[key])});input.setAttribute('aria-label',`${label}, розетка ${index+1}`);
        input.oninput=()=>{f[key]=input.value===''?NaN:Number(input.value);s.preview();};l.append(caption,input);grid.append(l);
      }
      wall.onchange=()=>{f.wall=wall.value;offsetLabel.textContent='Отступ от '+ORIGINS[f.wall];title.textContent=`${index+1}. ${f.label||'Розетка'} · стена ${f.wall.toUpperCase()}`;s.preview();};
      const remove=el('button','Удалить розетку');remove.type='button';remove.className='room-socket-remove';remove.onclick=()=>{s.draft.features=s.draft.features.filter(x=>x.id!==f.id);reconcileSurvey(s.draft);this.render();s.preview();};card.append(remove);this.list.append(card);
    }
  }
}
